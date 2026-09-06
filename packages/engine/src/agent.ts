import {
  query,
  type HookInput,
  type Options,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { config } from "./config";
import { STUDIO_TOOL_NAMES, studioTools, type InteractContext } from "./interact";

export type ToolCall = { name: string; summary: string };

/** One completed agent turn, handed to `onTurnEnd`. */
export type TurnEnd = {
  ok: boolean;
  /** The agent's closing message for this turn — the stage summary to sign off. */
  text: string;
};

export type SessionResult = {
  ok: boolean;
  text: string;
  costUsd: number;
  numTurns: number;
  sessionId?: string;
  error?: string;
};

export type SessionHandlers = {
  onText: (text: string) => void;
  onToolCall: (call: ToolCall) => void;
};

/**
 * An async iterable the pipeline can push into while the session is running.
 * This is what makes steering possible: streaming-input mode keeps the session
 * open between turns, so a note typed in the studio becomes the next user turn
 * instead of a new conversation.
 */
export class InputStream implements AsyncIterable<SDKUserMessage> {
  private queued: SDKUserMessage[] = [];
  private waiting: ((r: IteratorResult<SDKUserMessage>) => void) | null = null;
  private closed = false;
  private accepted = 0;

  push(text: string): void {
    if (this.closed) return;
    this.accepted++;
    const message: SDKUserMessage = {
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
      session_id: "",
    } as SDKUserMessage;
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve({ value: message, done: false });
    } else {
      this.queued.push(message);
    }
  }

  get pending(): number {
    return this.queued.length;
  }

  /**
   * Every message this stream has taken, whether it was queued or handed
   * straight to a waiting reader.
   *
   * `pending` cannot answer "did anything get pushed?": in streaming-input mode
   * the SDK is nearly always parked in `next()`, so a push is passed directly
   * to that reader and never touches the queue. Reading `pending` alone as
   * emptiness closed the stream on a delivered message, which killed the run at
   * the first stage handoff.
   */
  get sent(): number {
    return this.accepted;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve({ value: undefined as never, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const next = this.queued.shift();
        if (next) return Promise.resolve({ value: next, done: false });
        if (this.closed) {
          return Promise.resolve({ value: undefined as never, done: true });
        }
        return new Promise((resolve) => {
          this.waiting = resolve;
        });
      },
    };
  }
}

/** One-line description of a tool call, for the job log. */
function summariseTool(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof i[k] === "string" ? (i[k] as string) : undefined);

  switch (name) {
    case "Bash":
      return str("command")?.slice(0, 200) ?? "";
    case "Write":
    case "Edit":
    case "Read":
      return str("file_path") ?? "";
    case "Skill":
      return str("skill") ?? "";
    case "Task":
    case "Agent":
      return str("description") ?? "";
    default: {
      const first = Object.values(i).find((v) => typeof v === "string");
      return typeof first === "string" ? first.slice(0, 160) : "";
    }
  }
}

/**
 * Run one authoring session inside `projectDir`.
 *
 * The session loads the user's real Claude Code configuration
 * (`settingSources: ['user']`) — that is where the HyperFrames skills live, and
 * they are what makes the output match a hand-authored project. `'project'` is
 * included so the generated project's own CLAUDE.md is honoured.
 */
export async function runAuthoringSession(opts: {
  projectDir: string;
  prompt: string;
  abortController: AbortController;
  handlers: SessionHandlers;
  /** Present when the run may consult a person. */
  interact?: { jobId: string; ctx: InteractContext };
  /** Steering notes are pushed into this while the session runs. */
  input?: InputStream;
  /**
   * Called when the agent finishes a turn and is waiting for input.
   *
   * Awaited, and awaited *before* the input stream is closed — that ordering is
   * what lets the pipeline drive the staged plan: it validates the stage that
   * just ran and pushes the next stage's instruction, and the session continues
   * with its full context instead of being torn down and rebuilt. Pushing
   * nothing ends the session.
   */
  onTurnEnd?: (turn: TurnEnd) => void | Promise<void>;
}): Promise<SessionResult> {
  const { projectDir, prompt, abortController, handlers, interact, input } = opts;

  const mcpServers = interact
    ? { studio: studioTools(interact.jobId, interact.ctx, projectDir) }
    : undefined;

  const options: Options = {
    cwd: projectDir,
    model: config.model,
    effort: config.effort,
    abortController,
    maxBudgetUsd: config.maxBudgetUsd,

    // Load the user's global skills (~/.claude/skills) and the project CLAUDE.md.
    settingSources: ["user", "project"],
    skills: "all",
    tools: { type: "preset", preset: "claude_code" },
    ...(mcpServers ? { mcpServers } : {}),
    ...(interact ? { allowedTools: STUDIO_TOOL_NAMES } : {}),

    // The built-in question tools have no answerer in this environment; the
    // studio's own ask_user / request_review are the supported channel.
    disallowedTools: ["AskUserQuestion", "ExitPlanMode", "EnterPlanMode"],

    // Authoring a video is hundreds of file writes and CLI calls; prompting for
    // each one is not possible headlessly. The blast radius is bounded by `cwd`.
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,

    env: {
      ...process.env,
      CLAUDE_AGENT_SDK_CLIENT_APP: "filmwright/0.1.0",
      CI: "1",
    },

    hooks: {
      PostToolUse: [
        {
          hooks: [
            async (hookInput: HookInput) => {
              if (hookInput.hook_event_name === "PostToolUse") {
                handlers.onToolCall({
                  name: hookInput.tool_name,
                  summary: summariseTool(
                    hookInput.tool_name,
                    hookInput.tool_input,
                  ),
                });
              }
              return { continue: true };
            },
          ],
        },
      ],
    },
  };

  let text = "";
  let costUsd = 0;
  let numTurns = 0;
  let sessionId: string | undefined;
  let ok = false;
  let error: string | undefined;

  // Streaming input keeps the session alive between turns so steering notes can
  // land. Without steering there is nothing to wait for, so send a plain string.
  const promptInput = input
    ? (() => {
        input.push(prompt);
        return input;
      })()
    : prompt;

  try {
    for await (const message of query({
      prompt: promptInput,
      options,
    }) as AsyncIterable<SDKMessage>) {
      switch (message.type) {
        case "system":
          if (message.subtype === "init") sessionId = message.session_id;
          break;

        case "assistant": {
          for (const block of message.message.content) {
            if (block.type === "text" && block.text.trim()) {
              handlers.onText(block.text.trim());
            }
          }
          break;
        }

        case "result": {
          costUsd = message.total_cost_usd ?? 0;
          numTurns = message.num_turns ?? 0;
          sessionId = message.session_id ?? sessionId;
          if (message.subtype === "success") {
            ok = true;
            text = message.result;
          } else {
            ok = false;
            error = `agent run ended: ${message.subtype}`;
          }
          // Awaited: the handler decides whether there is a next stage, and
          // must have pushed it before the emptiness check below.
          const sentBefore = input?.sent ?? 0;
          await opts.onTurnEnd?.({
            ok: message.subtype === "success",
            text: message.subtype === "success" ? message.result : "",
          });
          // Nothing more to say to the model — closing the input ends the query.
          // A message handed to a waiting reader leaves `pending` at 0, so the
          // counter is what proves the turn produced nothing new.
          if (input && input.pending === 0 && input.sent === sentBefore) {
            input.close();
          }
          break;
        }

        default:
          break;
      }
    }
  } catch (err) {
    ok = false;
    error = err instanceof Error ? err.message : String(err);
  } finally {
    input?.close();
  }

  return { ok, text, costUsd, numTurns, sessionId, error };
}
