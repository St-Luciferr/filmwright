import { randomUUID } from "node:crypto";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { config } from "./config";
import { buildStoryboard } from "./storyboard";
import {
  appendEvent,
  clearPending,
  readAnswer,
  recordAnswered,
  setPending,
} from "./store";
import type { Interaction, InteractionAnswer } from "./types";

/**
 * Raised when nobody answered within the grace period. The pipeline catches it
 * and parks the job rather than failing it, so the worker can move on and the
 * question survives for later.
 */
export class Parked extends Error {
  constructor(readonly interaction: Interaction) {
    super("parked awaiting input");
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Publish an interaction and block until the studio writes an answer file.
 *
 * Polling a file is deliberate: the worker and the web app are separate
 * processes, and the job directory is already the channel between them.
 */
async function waitForAnswer(
  jobId: string,
  interaction: Interaction,
  ctx: InteractContext,
): Promise<InteractionAnswer> {
  const { signal } = ctx;
  await setPending(jobId, interaction);
  const deadline = Date.now() + config.answerGraceMs;

  while (Date.now() < deadline) {
    if (signal.aborted) {
      await clearPending(jobId);
      throw new Error("cancelled while waiting for input");
    }
    const answer = await readAnswer(jobId, interaction.id);
    if (answer) {
      await recordAnswered(jobId, interaction, answer);
      return answer;
    }
    await sleep(1000);
  }

  // Nobody is watching. Stop the session so the worker is freed; the question
  // stays on the job and the answer will start a resumed run.
  ctx.parked = interaction;
  ctx.abort();
  throw new Parked(interaction);
}

/** Shared state between the tool handlers and the pipeline running them. */
export type InteractContext = {
  signal: AbortSignal;
  abort: () => void;
  parked: Interaction | null;
};

const textResult = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

/**
 * Tools the agent uses to involve a person.
 *
 * These are real MCP tools rather than an interception of the built-in
 * AskUserQuestion: the answer comes back as an ordinary tool result, so the
 * model treats it as an answer rather than as a refused call.
 */
export function studioTools(
  jobId: string,
  ctx: InteractContext,
  projectDir: string,
) {
  const askUser = tool(
    "ask_user",
    "Ask the person commissioning this video to make a decision. Use it only " +
      "when the choice would materially change the finished video and the " +
      "brief does not settle it. Offer 2-4 concrete options with honest " +
      "trade-offs. Returns the person's answer.",
    {
      questions: z
        .array(
          z.object({
            question: z
              .string()
              .describe("The complete question, ending in a question mark."),
            header: z
              .string()
              .describe("A chip label of at most 12 characters."),
            options: z
              .array(
                z.object({
                  label: z.string().describe("Concise choice, 1-5 words."),
                  description: z
                    .string()
                    .describe("What this option means for the video."),
                  preview: z
                    .string()
                    .optional()
                    .describe(
                      "Optional plain-text sketch of the result, shown beside the option.",
                    ),
                }),
              )
              .min(2)
              .max(4),
          }),
        )
        .min(1)
        .max(3)
        .describe("Between one and three questions to ask at once."),
    },
    async (args) => {
      const interaction: Interaction = {
        id: randomUUID(),
        kind: "question",
        askedAt: new Date().toISOString(),
        questions: args.questions,
      };
      const answer = await waitForAnswer(jobId, interaction, ctx);
      const lines = (answer.answers ?? []).map(
        (a, i) => `${args.questions[i]?.header ?? `Q${i + 1}`}: ${a}`,
      );
      await appendEvent(jobId, {
        kind: "answer",
        message: lines.join(" · ") || "(no answer)",
      });
      return textResult(
        `The person answered:\n${lines.join("\n")}\n\nProceed on that basis.`,
      );
    },
  );

  const requestReview = tool(
    "request_review",
    "Pause and have the person review what you have just produced. Call this " +
      "after writing SCRIPT.md, after writing STORYBOARD.md, and once more " +
      "immediately before rendering. Returns either approval or revision notes " +
      "you must act on before continuing.",
    {
      stage: z
        .enum(["script", "storyboard", "pre-render"])
        .describe("Which gate this is."),
      summary: z
        .string()
        .describe(
          "A short plain-language summary of what you are asking them to sign off.",
        ),
      artifact: z
        .string()
        .optional()
        .describe(
          "Project-relative path of the file to show them, e.g. SCRIPT.md.",
        ),
    },
    async (args) => {
      const interaction: Interaction = {
        id: randomUUID(),
        kind: "checkpoint",
        askedAt: new Date().toISOString(),
        stage: args.stage,
        summary: args.summary,
        artifact: args.artifact,
      };

      // Before the render gate, capture a still per frame. Reviewing a
      // storyboard is the only way to comment on how the video *looks* before
      // paying for a render, and the platform captures it rather than the agent
      // so the stills always correspond to what is actually on the timeline.
      if (args.stage === "pre-render") {
        await appendEvent(jobId, {
          kind: "log",
          message: "Capturing frame stills for review…",
        });
        try {
          interaction.storyboard = await buildStoryboard(projectDir, {
            signal: ctx.signal,
            force: true,
          });
        } catch (err) {
          await appendEvent(jobId, {
            kind: "error",
            message: `Could not capture the storyboard: ${
              err instanceof Error ? err.message : String(err)
            }`,
          });
        }
      }

      const answer = await waitForAnswer(jobId, interaction, ctx);
      if (answer.decision === "revise") {
        await appendEvent(jobId, {
          kind: "answer",
          message: `Changes requested at ${args.stage}: ${answer.notes ?? ""}`,
        });
        return textResult(
          `Not approved. The person asked for these changes:\n\n${answer.notes ?? "(no detail given)"}\n\n` +
            "Apply them, then call request_review again for the same stage.",
        );
      }
      await appendEvent(jobId, {
        kind: "answer",
        message: `Approved: ${args.stage}`,
      });
      return textResult(`Approved${answer.notes ? ` — note: ${answer.notes}` : ""}. Continue.`);
    },
  );

  return createSdkMcpServer({
    name: "studio",
    version: "0.1.0",
    instructions:
      "Tools for involving the person who commissioned this video. " +
      "ask_user for open decisions; request_review for stage sign-off.",
    tools: [askUser, requestReview],
    alwaysLoad: true,
  });
}

export const STUDIO_TOOL_NAMES = [
  "mcp__studio__ask_user",
  "mcp__studio__request_review",
];
