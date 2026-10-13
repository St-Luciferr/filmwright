import fs from "node:fs";
import path from "node:path";
import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { config } from "./config";
import { buildStoryboard } from "./storyboard";
import type { StoryboardFrame } from "./types";

/**
 * A blind visual judge at the pre-render boundary (Phase 2, item 9).
 *
 * Deterministic checks catch what geometry can prove: overlap, contrast, the
 * caption band, fonts, a voice line longer than its frame. They cannot say
 * whether a frame shows what its storyboard block asked for, or whether the
 * hero is actually the hero. This judge looks at one real still per frame next
 * to that frame's storyboard block and answers a fixed set of yes/no questions.
 *
 * It is blind on purpose: a fresh, read-only session that has seen neither the
 * orchestrator's reasoning nor the workers' summaries, so the agent that did
 * the work is not the one grading it. It may answer "unsure", and only a
 * "fail" counts. It runs at most `FILMWRIGHT_JUDGE_ROUNDS` times per project
 * and never replaces the human gate — general VLM judges agree with people
 * roughly three times in four.
 */

/** The questions asked of every frame. Each is answerable from one still. */
export const ATOMS = [
  {
    id: "renders",
    question:
      "The frame rendered properly: not blank, not a black or white void where content should be, no broken-image boxes, no tofu or fallback glyphs, no visible code or raw template text.",
  },
  {
    id: "matches_scene",
    question:
      "What is on screen is recognisably what the block's `scene:` line describes.",
  },
  {
    id: "hero",
    question:
      "There is one clear focal element, and it is the subject the scene names — not a decoration or a label.",
  },
  {
    id: "copy",
    question:
      "On-screen text is short display copy. It is NOT the `voiceover:` sentence printed out word for word.",
  },
  {
    id: "readable",
    question:
      "The main text is large enough to read on a phone held at arm's length, with a clear size hierarchy.",
  },
  {
    id: "fills_canvas",
    question:
      "The composition uses the canvas: content is not shrunk into a small area surrounded by large empty space.",
  },
] as const;

export type AtomId = (typeof ATOMS)[number]["id"];
export type Verdict = "pass" | "fail" | "unsure";

export type FrameVerdict = {
  frame: string;
  atoms: { id: AtomId; verdict: Verdict; note: string }[];
};

export type JudgeResult = {
  ok: boolean;
  frames: FrameVerdict[];
  costUsd: number;
  /** Set when the judge could not run; the engine then proceeds without it. */
  error?: string;
};

/** Where the last verdicts and the round count live, so a resume remembers them. */
const STATE = path.join(".hyperframes", "judge.json");

type JudgeState = { rounds: number; last?: FrameVerdict[] };

export function readJudgeState(projectDir: string): JudgeState {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectDir, STATE), "utf8")) as JudgeState;
  } catch {
    return { rounds: 0 };
  }
}

function writeJudgeState(projectDir: string, state: JudgeState): void {
  const file = path.join(projectDir, STATE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    frames: {
      type: "array",
      items: {
        type: "object",
        properties: {
          frame: { type: "string" },
          atoms: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", enum: ATOMS.map((a) => a.id) },
                verdict: { type: "string", enum: ["pass", "fail", "unsure"] },
                note: { type: "string" },
              },
              required: ["id", "verdict", "note"],
            },
          },
        },
        required: ["frame", "atoms"],
      },
    },
  },
  required: ["frames"],
} as const;

export type JudgeInput = {
  frame: string;
  image: string;
  block: string;
};

/** The judge's whole brief. It never sees anything else about the run. */
export function judgePrompt(inputs: JudgeInput[], canvas: string): string {
  const questions = ATOMS.map((a) => `- \`${a.id}\`: ${a.question}`).join("\n");
  const frames = inputs
    .map(
      (f) =>
        `### ${f.frame}\n\nStill: \`${f.image}\` (read it)\n\nStoryboard block:\n\n${f.block.trim()}`,
    )
    .join("\n\n---\n\n");
  return `You are reviewing stills from a ${canvas} short-form video before it is rendered.
You did not make it and you have no stake in it.

For each frame below, read the still with the Read tool, then answer every question
with \`pass\`, \`fail\` or \`unsure\`, plus a one-sentence note saying what you saw.

Each still is a single moment about two thirds of the way through its frame, after
the main reveals have landed. Anything that depends on motion, timing or audio is
not visible to you — answer \`unsure\` rather than guessing. Answer \`fail\` only when
the still clearly shows the problem. Do not grade taste; grade only the question.

Questions:
${questions}

${frames}

Return one entry per frame, with all ${ATOMS.length} questions answered.`;
}

/** Normalise whatever came back into the verdict shape. */
export function parseVerdicts(raw: unknown, expected: string[]): FrameVerdict[] {
  const frames = (raw as { frames?: unknown[] } | undefined)?.frames;
  if (!Array.isArray(frames)) return [];
  const ids = new Set<string>(ATOMS.map((a) => a.id));
  const out: FrameVerdict[] = [];
  for (const f of frames) {
    const entry = f as { frame?: unknown; atoms?: unknown[] };
    if (typeof entry.frame !== "string" || !expected.includes(entry.frame)) continue;
    const atoms = (Array.isArray(entry.atoms) ? entry.atoms : [])
      .map((a) => a as { id?: unknown; verdict?: unknown; note?: unknown })
      .filter((a) => typeof a.id === "string" && ids.has(a.id))
      .map((a) => ({
        id: a.id as AtomId,
        verdict: (a.verdict === "fail" || a.verdict === "pass" ? a.verdict : "unsure") as Verdict,
        note: typeof a.note === "string" ? a.note : "",
      }));
    out.push({ frame: entry.frame, atoms });
  }
  return out;
}

export const failures = (verdicts: FrameVerdict[]) =>
  verdicts
    .map((v) => ({ frame: v.frame, atoms: v.atoms.filter((a) => a.verdict === "fail") }))
    .filter((v) => v.atoms.length);

/** The change list handed to the orchestrator, one block per failing frame. */
export function describeVerdicts(verdicts: FrameVerdict[], round: number, max: number): string {
  const failed = failures(verdicts);
  if (!failed.length) return "Visual review: every frame passed.";
  const lines = [
    `A blind visual review of the stills (round ${round} of ${max}) found problems in ` +
      `${failed.length} frame(s). Each was judged from one still against its storyboard block:`,
    "",
  ];
  for (const f of failed) {
    lines.push(`### ${f.frame}`);
    for (const a of f.atoms) lines.push(`- ${a.id}: ${a.note}`);
    lines.push("");
  }
  lines.push(
    "Re-dispatch a `frame-worker` for each frame listed, with these notes pasted into its " +
      "dispatch context, and change nothing else. Run them in the foreground and reply only " +
      "once every one has returned — the platform re-checks the moment you reply. " +
      "If you are sure a note is wrong — the " +
      "reviewer saw one still and no motion — leave that frame and say why in your reply.",
  );
  return lines.join("\n");
}

/** Unresolved failures for the person at the gate, or null. */
export function judgeNotes(projectDir: string): string | null {
  const { last } = readJudgeState(projectDir);
  const failed = failures(last ?? []);
  if (!failed.length) return null;
  return (
    "The visual reviewer still flags: " +
    failed.map((f) => `${f.frame} (${f.atoms.map((a) => a.id).join(", ")})`).join("; ") +
    "."
  );
}

/** Pair each captured still with its storyboard block. */
export function judgeInputs(
  frames: StoryboardFrame[],
  blocks: Map<string, string>,
): JudgeInput[] {
  const inputs: JudgeInput[] = [];
  for (const f of frames) {
    if (!f.image || !f.src) continue;
    const id = path.basename(f.src).replace(/\.html?$/i, "");
    inputs.push({ frame: id, image: f.image, block: blocks.get(f.src) ?? `(no storyboard block for ${f.src})` });
  }
  return inputs;
}

/**
 * Run one judging round.
 *
 * Returns `ok: true` when nothing failed, when the round cap is spent (the
 * remaining notes go to the person at the gate), or when the judge itself could
 * not run — a broken reviewer must never block a render a person can approve.
 */
export async function runJudge(
  projectDir: string,
  opts: {
    canvas: string;
    blocks: Map<string, string>;
    signal: AbortSignal;
    log: (line: string) => void;
  },
): Promise<JudgeResult & { detail: string }> {
  const state = readJudgeState(projectDir);
  if (state.rounds >= config.judgeRounds) {
    const notes = judgeNotes(projectDir);
    return {
      ok: true,
      frames: state.last ?? [],
      costUsd: 0,
      detail: notes
        ? `Visual review rounds spent; leaving the rest to the person at the gate. ${notes}`
        : "Visual review already passed.",
    };
  }

  let manifest;
  try {
    manifest = await buildStoryboard(projectDir, { signal: opts.signal, onLine: () => {} });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    opts.log(`Visual review skipped — could not capture stills: ${error}`);
    return { ok: true, frames: [], costUsd: 0, error, detail: "Visual review skipped." };
  }
  const inputs = judgeInputs(manifest.frames, opts.blocks);
  if (!inputs.length) {
    return { ok: true, frames: [], costUsd: 0, error: "no stills", detail: "Visual review skipped — no stills." };
  }

  const abort = new AbortController();
  const onAbort = () => abort.abort();
  opts.signal.addEventListener("abort", onAbort, { once: true });

  const options: Options = {
    cwd: projectDir,
    model: config.judgeModel,
    effort: config.judgeEffort,
    abortController: abort,
    maxBudgetUsd: config.judgeBudgetUsd,
    maxTurns: inputs.length + 6,
    // Blind: no user settings, no skills, no project CLAUDE.md, no MCP.
    settingSources: [],
    tools: ["Read"],
    allowedTools: ["Read"],
    permissionMode: "dontAsk",
    outputFormat: { type: "json_schema", schema: VERDICT_SCHEMA as unknown as Record<string, unknown> },
    env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: "filmwright/0.1.0", CI: "1" },
  };

  let structured: unknown;
  let costUsd = 0;
  let error: string | undefined;
  try {
    for await (const message of query({
      prompt: judgePrompt(inputs, opts.canvas),
      options,
    }) as AsyncIterable<SDKMessage>) {
      if (message.type !== "result") continue;
      costUsd = message.total_cost_usd ?? 0;
      if (message.subtype === "success") structured = message.structured_output;
      else error = `judge ended: ${message.subtype}`;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    opts.signal.removeEventListener("abort", onAbort);
  }

  const verdicts = parseVerdicts(structured, inputs.map((i) => i.frame));
  if (error || !verdicts.length) {
    const why = error ?? "no verdicts returned";
    opts.log(`Visual review skipped — ${why} ($${costUsd.toFixed(2)})`);
    return { ok: true, frames: [], costUsd, error: why, detail: "Visual review skipped." };
  }

  const round = state.rounds + 1;
  writeJudgeState(projectDir, { rounds: round, last: verdicts });
  const failed = failures(verdicts);
  opts.log(
    `Visual review round ${round}/${config.judgeRounds}: ${inputs.length - failed.length}/${inputs.length} ` +
      `frames clean ($${costUsd.toFixed(2)})`,
  );
  return {
    ok: failed.length === 0,
    frames: verdicts,
    costUsd,
    detail: describeVerdicts(verdicts, round, config.judgeRounds),
  };
}
