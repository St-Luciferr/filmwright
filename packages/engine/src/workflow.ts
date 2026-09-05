import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { getRenderer, runCommand } from "./render";
import { readTimeline, isFrame } from "./timeline";
import { STAGES, type Job, type Stage } from "./types";

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
   */
  instruct?: (ctx: StageContext) => string;
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

Break the approved script into frames. Head each one with a \`## Frame NN\`
heading so the platform can count them, and give each frame its duration and
what is on screen. The durations must sum to ${job.spec.seconds}s within
${durationTolerance(job.spec.seconds).toFixed(1)}s — the platform checks this before it renders.

Do not author frame compositions or generate media yet. When it is written,
reply with a summary of the frame breakdown for sign-off.`,
    validate: ({ projectDir }) => {
      const missing = requireDocument(projectDir, "STORYBOARD.md", 200);
      if (missing) return missing;
      const planned = plannedFrames(projectDir);
      if (!planned) {
        return (
          "`STORYBOARD.md` has no frame headings. Head each frame with " +
          "`## Frame 01`, `## Frame 02` and so on so the platform can track them."
        );
      }
      return null;
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
    instruct: ({ projectDir }) => {
      const planned = plannedFrames(projectDir);
      return `Now author the frame compositions${planned ? ` — all ${planned} of them` : ""}.

Put each one in \`compositions/frames/\` and place it on the timeline in
\`index.html\` with its \`data-start\` and \`data-duration\`. Every frame the
storyboard plans must exist and be wired up; a frame authored but not placed
does not render.

Reply when every frame is authored and placed.`;
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
    run: async ({ projectDir, signal, log }) => {
      const lines: string[] = [];
      const { code } = await runCommand(
        "npm",
        ["run", "check"],
        projectDir,
        (line) => {
          lines.push(line);
          log(line);
        },
        signal,
      );
      if (code === 0) {
        return { ok: true, detail: summariseCheck(lines) ?? "Check passed." };
      }
      // Hand the agent the diagnostics, not just the exit code.
      const detail = lines
        .filter((l) => /error|✕|✖|failed/i.test(l))
        .slice(-25)
        .join("\n");
      return {
        ok: false,
        detail:
          `\`npm run check\` failed (exit ${code}).\n\n${detail || lines.slice(-25).join("\n")}\n\n` +
          "Fix every error it reports.",
      };
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

/** Pull the "N error(s), M warning(s)" line out of a check run, when present. */
function summariseCheck(lines: string[]): string | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line && /\d+\s+error\(s\)/.test(line)) return `Check: ${line.trim()}`;
  }
  return null;
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
