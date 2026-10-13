import fs from "node:fs";
import path from "node:path";
import { runCheck } from "./check";
import { config } from "./config";
import { getRenderer } from "./render";
import { readTimeline, isFrame } from "./timeline";
import { ASPECTS, STAGES, type Job, type Stage } from "./types";
import {
  FRAME_WORKER,
  PACKETS_DIR,
  assembleScript,
  buildFramePackets,
} from "./workers";

/**
 * The staged workflow, as a contract the engine enforces.
 *
 * Before this file the flow lived in the prompt: the agent was told to run the
 * workflow in order, to call `request_review` "exactly three times", and to run
 * `npm run check` before rendering. Nothing verified any of it. Measured across
 * the first 30 runs, 23 of 66 mandated review gates actually fired, and seven
 * resumed runs rendered a finished video having fired none at all.
 *
 * So the order, the artifacts and the gates moved here. Each stage declares
 * what has to be true before it starts, what it must produce, and what makes
 * that output valid. The pipeline walks this plan; the agent is asked for one
 * stage at a time and cannot skip ahead, because the next instruction is not
 * sent until the current stage's artifact passes its validator.
 */

/** Everything a contract needs to decide about a stage. */
export type StageContext = {
  job: Job;
  projectDir: string;
  /** Aborted on cancellation or timeout; engine-run stages must honour it. */
  signal: AbortSignal;
  log: (message: string) => void;
};

/** What an engine-run stage did. */
export type StageRun = {
  ok: boolean;
  /** Shown in the log, and handed to the agent when `ok` is false. */
  detail: string;
};

export type StageContract = {
  stage: Stage;
  /**
   * Whether this stage is part of the plan for this job. A job with no
   * narration and no music has nothing for `media` to do.
   */
  applies: (job: Job) => boolean;
  /**
   * What to ask the agent for. Absent on stages the engine performs itself,
   * which is what makes them evidence rather than narration.
   *
   * May be async: a stage that needs something prepared on disk before the
   * agent starts (the frame packets, ADR-0016) does that here.
   */
  instruct?: (ctx: StageContext) => string | Promise<string>;
  /** Performed by the engine instead of the agent. */
  run?: (ctx: StageContext) => Promise<StageRun>;
  /**
   * Why this stage is not finished, or null when it is. This is the gate on
   * advancing — the next stage's instruction is not sent until it returns null.
   */
  validate: (ctx: StageContext) => string | null;
  /** Ask a person to sign this stage off before the plan moves on. */
  gateAfter?: boolean;
  /** Ask a person to sign off before this stage runs at all. */
  gateBefore?: boolean;
};

const read = (projectDir: string, file: string): string | null => {
  try {
    return fs.readFileSync(path.join(projectDir, file), "utf8");
  } catch {
    return null;
  }
};

const filesIn = (projectDir: string, dir: string, exts: string[]): string[] => {
  try {
    return fs
      .readdirSync(path.join(projectDir, dir))
      .filter((f) => exts.some((e) => f.endsWith(e)))
      .sort();
  } catch {
    return [];
  }
};

/**
 * A document is only "written" if there is something in it. `existsSync` was
 * the old test, and an empty file passed it.
 */
function requireDocument(
  projectDir: string,
  file: string,
  minChars: number,
): string | null {
  const body = read(projectDir, file);
  if (body === null) return `\`${file}\` does not exist yet.`;
  if (body.trim().length < minChars) {
    return `\`${file}\` exists but is essentially empty (${body.trim().length} characters). Write it properly.`;
  }
  return null;
}

/** How many frames STORYBOARD.md plans. */
export function plannedFrames(projectDir: string): number | null {
  const text = read(projectDir, "STORYBOARD.md");
  if (text === null) return null;
  const matches = text.match(/^#{2,3}\s+(?:frame\s+)?\d+/gim);
  return matches ? matches.length : null;
}

/**
 * The frame blocks as the packet builder will see them.
 *
 * Same split as `frame-packets-core.mjs`: an H2 that starts with `Frame`.
 * Looser headings count for progress (`plannedFrames`) but cannot be fanned
 * out, so the storyboard validator holds them to this shape.
 */
export function storyboardBlocks(
  projectDir: string,
): { heading: string; block: string }[] {
  const text = read(projectDir, "STORYBOARD.md");
  if (text === null) return [];
  const matches = [...text.matchAll(/^## Frame\s+([^\n]+)$/gm)];
  return matches.map((m, i) => ({
    heading: m[1]!.trim(),
    block: text.slice(m.index, matches[i + 1]?.index ?? text.length),
  }));
}

const field = (block: string, key: string): string | undefined =>
  block.match(new RegExp(`^\\s*[-*]?\\s*${key}:\\s*(.+)$`, "mi"))?.[1]?.trim();

/**
 * Why the storyboard cannot be split into frame packets, or null when it can.
 *
 * Every `## Frame` block needs a `src:` pointing into `compositions/frames/`
 * (that is the frame's id, file name and timeline reference, all at once) and
 * a `duration:`. Without `src` the packet builder throws; without `duration`
 * the worker has no shot length to build to.
 */
export function storyboardProblems(projectDir: string): string | null {
  const blocks = storyboardBlocks(projectDir);
  if (!blocks.length) {
    return (
      "`STORYBOARD.md` has no `## Frame NN — Title` headings. The platform splits " +
      "frames on exactly that heading shape (an H2 beginning with `Frame`), so use it " +
      "for every frame."
    );
  }
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const { heading, block } of blocks) {
    const src = field(block, "src");
    const duration = field(block, "duration");
    const wants: string[] = [];
    if (!src) wants.push("`src:`");
    else if (!/^compositions\/frames\/[^\s/]+\.html?$/i.test(src)) {
      wants.push(`a \`src:\` under \`compositions/frames/\` (got \`${src}\`)`);
    } else if (seen.has(src.toLowerCase())) {
      wants.push(`a unique \`src:\` (\`${src}\` is used twice)`);
    } else seen.add(src.toLowerCase());
    if (!duration) wants.push("`duration:`");
    if (wants.length) missing.push(`Frame ${heading} needs ${wants.join(" and ")}`);
  }
  if (!missing.length) return null;
  return (
    `${missing.join("; ")}. Each frame block must carry \`- src: compositions/frames/NN-slug.html\` ` +
    "and `- duration: Ns` as metadata bullets under its heading — the platform builds " +
    "one worker packet per frame from them."
  );
}

/** Authored frame files that `index.html` never places. */
export function orphanFrames(projectDir: string): string[] {
  const authored = filesIn(projectDir, "compositions/frames", [".html"]);
  const placed = new Set(
    readTimeline(projectDir)
      .map((c) => (c.src ? path.basename(c.src) : null))
      .filter(Boolean) as string[],
  );
  return authored.filter((f) => !placed.has(f));
}

/** Total runtime of the wired timeline, or null when nothing is wired. */
export function timelineSeconds(projectDir: string): number | null {
  const frames = readTimeline(projectDir).filter(isFrame);
  if (!frames.length) return null;
  return Math.max(...frames.map((c) => c.start + c.duration));
}

/**
 * How far the wired runtime may sit from the brief before it counts as wrong.
 *
 * Proportional rather than absolute: four seconds over on a 25s promo is a
 * different problem from four seconds over on a three-minute lecture. The floor
 * keeps very short pieces from being held to an impossible tolerance. The
 * fraction is `FILMWRIGHT_DURATION_TOLERANCE`; see the note on it in config.
 */
export function durationTolerance(targetSeconds: number): number {
  return Math.max(2, targetSeconds * config.durationTolerance);
}

const VOICE_EXTS = [".wav", ".mp3"];

export const WORKFLOW: StageContract[] = [
  // scaffold and brief are produced by the engine before the session opens
  // (`hyperframes init` and `buildBrief`), so they are already deterministic
  // and are not part of the agent-driven plan.
  {
    stage: "script",
    applies: () => true,
    instruct: ({ job }) =>
      `Write \`SCRIPT.md\` for this video — and only that.

Work to the brief: ${job.spec.seconds}s (the finished timeline must land within
${durationTolerance(job.spec.seconds).toFixed(1)}s of that), ${job.spec.workflow}, aimed at ${
        job.spec.audience ?? "the audience named in BRIEF.md"
      }.${
        job.spec.narration
          ? " It is narrated, so the spoken lines are the spine — write them as they will be said aloud."
          : " There is no narration, so write the on-screen beats rather than spoken lines."
      }

Do not write the storyboard, author frames, or generate any media yet. When the
script is written, reply with a short plain-language summary of what it says and
the through-line it follows — that summary is what a person signs off.`,
    validate: ({ projectDir }) => requireDocument(projectDir, "SCRIPT.md", 200),
    gateAfter: true,
  },
  {
    stage: "storyboard",
    applies: () => true,
    instruct: ({ job }) =>
      `Now write \`STORYBOARD.md\` — and only that.

Break the approved script into frames, in the storyboard format the workflow
skill defines (\`storyboard-format.md\`). Head each frame \`## Frame NN — Title\`
and give it metadata bullets — at least:

- \`src: compositions/frames/NN-slug.html\` (the file a worker will write; unique per frame)
- \`duration: Ns\`
- \`scene:\` (one line, what is on screen) and \`voiceover:\` (the spoken line, or none)
- \`blueprint:\`, \`transition_in:\`, \`handoff_out:\`/\`handoff_in:\` where the skill asks for them

The durations must sum to ${job.spec.seconds}s within
${durationTolerance(job.spec.seconds).toFixed(1)}s — the platform checks this before it renders.
The platform splits this file on the \`## Frame\` headings to build one worker packet
per frame, so a frame without \`src:\` cannot be built.

Do not author frame compositions or generate media yet. When it is written,
reply with a summary of the frame breakdown for sign-off.`,
    validate: ({ projectDir }) => {
      const missing = requireDocument(projectDir, "STORYBOARD.md", 200);
      if (missing) return missing;
      return storyboardProblems(projectDir);
    },
    gateAfter: true,
  },
  {
    stage: "media",
    // Sourcing media before the frames means a frame can be authored against
    // the real asset and its real duration, instead of a guess it has to be
    // rebuilt around later.
    applies: (job) => job.spec.narration || job.spec.music,
    instruct: ({ job }) => {
      const wants = [
        job.spec.narration && "the voiceover for every spoken line",
        job.spec.music && "a music bed",
      ].filter(Boolean);
      return `Now source the media — ${wants.join(" and ")}. Only that.

Use the free providers named in the brief. Do not author frame compositions
yet. When the media is on disk, reply with what you generated.`;
    },
    validate: ({ projectDir, job }) => {
      const problems: string[] = [];
      if (job.spec.narration && !filesIn(projectDir, "assets/voice", VOICE_EXTS).length) {
        problems.push("`assets/voice/` has no audio, but this video is narrated");
      }
      if (job.spec.music && !filesIn(projectDir, "assets/bgm", VOICE_EXTS).length) {
        problems.push("`assets/bgm/` has no music, but the brief asks for it");
      }
      return problems.length ? `${problems.join("; ")}.` : null;
    },
  },
  {
    stage: "frames",
    applies: () => true,
    // The engine builds the packets before asking (ADR-0016): the orchestrator
    // starts with `.hyperframes/frame-packets/` on disk and is told to dispatch,
    // which is the step the previous instruction left out — and the step every
    // run since 18 September skipped.
    instruct: async ({ job, projectDir, signal, log }) => {
      const packets = await buildFramePackets(projectDir, job.spec.workflow, signal, log);
      const { width, height } = ASPECTS[job.spec.aspect];
      const assemble = assembleScript(job.spec.workflow);
      const captions = job.spec.captions
        ? `Captions: enabled — keep every element above y = ${Math.round(height * 0.83)}px (the caption band owns the bottom 17%).`
        : `Captions: disabled — still keep content above y = ${Math.round(height * 0.83)}px for consistency.`;

      if (!packets.ok) {
        return `Now the frames. The platform tried to build the per-frame worker packets and could not:

${packets.detail}

Fix that first — it is a storyboard problem, not a frame problem. Then build the
packets with the command above and continue with the dispatch below.

${dispatchInstruction(packets.frames, { projectDir, width, height, captions, assemble })}`;
      }

      return `Now author the frames — all ${packets.frames.length} of them — by **dispatching one worker per frame**. Do not write frame files yourself.

${packets.detail}.

${dispatchInstruction(packets.frames, { projectDir, width, height, captions, assemble })}`;
    },
    validate: ({ projectDir }) => {
      const planned = plannedFrames(projectDir);
      const authored = filesIn(projectDir, "compositions/frames", [".html"]).length;
      if (!authored) return "No frame compositions have been authored yet.";
      if (planned && authored < planned) {
        return `Only ${authored} of the ${planned} frames in STORYBOARD.md are authored.`;
      }
      const orphans = orphanFrames(projectDir);
      if (orphans.length) {
        return (
          `${orphans.length} frame(s) are authored but not placed on the timeline in ` +
          `index.html: ${orphans.join(", ")}. Wire them up — an unplaced frame does not render.`
        );
      }
      return null;
    },
  },
  {
    stage: "check",
    applies: () => true,
    // Run by the engine, not asked of the agent. This is the stage that was
    // previously inferred from a regex over Bash commands and then set to
    // "done" unconditionally after a successful render — so "check passed"
    // could mean check never ran. Now it means the engine ran it.
    // Run with the flags that catch what agent-authored video gets wrong, and
    // handed back as findings grouped by file (ADR-0017), not a log tail.
    run: async ({ job, projectDir, signal, log }) => {
      const result = await runCheck(projectDir, {
        captions: job.spec.captions,
        signal,
        log,
      });
      return { ok: result.ok, detail: result.detail };
    },
    validate: ({ projectDir, job }) => {
      const orphans = orphanFrames(projectDir);
      if (orphans.length) {
        return `Frames authored but never placed on the timeline: ${orphans.join(", ")}.`;
      }
      const runtime = timelineSeconds(projectDir);
      if (runtime === null) return "`index.html` has no frames on its timeline.";
      const target = job.spec.seconds;
      const slack = durationTolerance(target);
      if (Math.abs(runtime - target) > slack) {
        return (
          `The wired timeline runs ${runtime.toFixed(1)}s against a ${target}s brief ` +
          `(tolerance ±${slack.toFixed(1)}s). Adjust the frame durations to land on target.`
        );
      }
      return null;
    },
  },
  {
    stage: "render",
    applies: () => true,
    // Performed by the engine's renderer. The gate in front of it is the one
    // the prompt used to ask for and never got.
    gateBefore: true,
    run: async ({ projectDir, signal, log }) => {
      const result = await getRenderer().render(projectDir, log, signal);
      if (!result.ok) {
        return { ok: false, detail: result.error ?? "The render produced no mp4." };
      }
      return { ok: true, detail: `Rendered ${path.basename(result.output ?? "")}` };
    },
    validate: () => null,
  },
];

/**
 * How the orchestrator fans the frames out — the harness-specific half of
 * `hyperframes/references/subagent-dispatch.md`, written for the Agent SDK.
 */
export function dispatchInstruction(
  frames: string[],
  opts: {
    projectDir: string;
    width: number;
    height: number;
    captions: string;
    assemble: string | null;
  },
): string {
  const list = frames.length
    ? frames.map((id) => `- \`${id}\` → \`${PACKETS_DIR}/${id}.md\` → writes \`compositions/frames/${id}.html\``).join("\n")
    : "- (one per `## Frame` block in STORYBOARD.md, once the packets exist)";
  const assemble = opts.assemble
    ? `Then assemble the timeline with the workflow's assembler:\n\n` +
      `\`node ${opts.assemble} --storyboard STORYBOARD.md --hyperframes .\`\n\n` +
      "It writes `index.html` from STORYBOARD.md, the frame files and `audio_meta.json`. " +
      "Read `npx hyperframes timeline --json` to confirm every frame is placed — do not " +
      "read `index.html` and every frame file by hand, it costs far more tokens."
    : "Then place every frame on the timeline in `index.html` with its `data-start` and " +
      "`data-duration`, and confirm with `npx hyperframes timeline --json`.";

  return `## Dispatch

Use the \`Agent\` tool with \`subagent_type: "${FRAME_WORKER}"\` — **one call per frame,
all in the same message so they run in parallel**. The platform caps concurrency;
if it queues some, that is fine. Never merge two frames into one worker, and never
author a frame yourself. Each worker's prompt is this dispatch context, filled in:

\`\`\`
PROJECT_DIR: ${opts.projectDir}
frame_id: <id>
Role file: ${PACKETS_DIR}/_role.md   (read first, in full)
Packet:    ${PACKETS_DIR}/<id>.md
Design truth: frame.md (if present)
Canvas: ${opts.width}x${opts.height}
${opts.captions}
Confirmed sketch: none — build from the packet.
Write exactly one file: compositions/frames/<id>.html
\`\`\`

Frames to dispatch:
${list}

## Wait and verify

A worker is done when its file exists on disk — check \`compositions/frames/\`,
not the worker's reply. If a file is missing or is not a bare \`<template>\`
fragment, re-dispatch that one frame once with the same context. Install any
registry block the storyboard names **before** dispatching (\`npx hyperframes add\`),
because parallel workers race the registry.

## Assemble

${assemble}

Reply when every frame is authored and placed, with one line per frame.`;
}

/** The stages this job will actually run, in order. */
export function planFor(job: Job): StageContract[] {
  return WORKFLOW.filter((c) => c.applies(job));
}

/** Look a contract up by stage. */
export function contractFor(stage: Stage): StageContract | undefined {
  return WORKFLOW.find((c) => c.stage === stage);
}

/**
 * Where a resumed or retried run should pick the plan up.
 *
 * The first stage in the plan whose validator is not already satisfied — so a
 * run that died authoring frames resumes at `frames`, and one that died at the
 * render gate resumes at `render` without re-doing anything.
 */
export function firstUnsatisfied(
  job: Job,
  projectDir: string,
): StageContract | undefined {
  const ctx: StageContext = {
    job,
    projectDir,
    signal: new AbortController().signal,
    log: () => {},
  };
  return planFor(job).find((c) => c.validate(ctx) !== null);
}

/** Order of a stage within the full stage list, for comparisons. */
export const stageIndex = (stage: Stage): number => STAGES.indexOf(stage);
