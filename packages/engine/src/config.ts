import { fileURLToPath } from "node:url";
import path from "node:path";

/** Repo root — three levels up from packages/engine/src. */
export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

export const PROJECTS_DIR = path.join(ROOT, "projects");
export const DATA_DIR = path.join(ROOT, "data");
export const JOBS_DIR = path.join(DATA_DIR, "jobs");

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  /** Model that authors the compositions. */
  model: process.env.FILMWRIGHT_MODEL ?? "claude-opus-5",
  /** Reasoning effort passed through to the agent session. */
  effort: (process.env.FILMWRIGHT_EFFORT ?? "high") as
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max",
  /**
   * Abandon a run that costs more than this.
   *
   * Measured: a 25s narrated promo spent $8.18 over 82 turns getting through
   * capture, script, voiceover, music and storyboard — and died with zero
   * frames authored. Frame authoring, check-and-fix, and render all come after
   * that, so 8 was not close. 25 is a working default; watch your own runs.
   */
  maxBudgetUsd: num("FILMWRIGHT_MAX_BUDGET_USD", 25),
  /** Abandon a run that takes longer than this. */
  timeoutMs: num("FILMWRIGHT_TIMEOUT_MINUTES", 90) * 60_000,
  /** Pinned into every generated project so re-renders stay reproducible. */
  hyperframesVersion: process.env.FILMWRIGHT_HYPERFRAMES_VERSION ?? "0.8.12",
  /** Which renderer driver to use. */
  renderer: process.env.FILMWRIGHT_RENDERER ?? "local",
  /** Poll interval for the queue and for filesystem-derived progress. */
  pollMs: num("FILMWRIGHT_POLL_MS", 1500),
  /**
   * How long a run waits on an unanswered question before parking itself and
   * handing the worker back to the queue.
   */
  answerGraceMs: num("FILMWRIGHT_ANSWER_GRACE_MINUTES", 10) * 60_000,
  /** Ask-and-review by default on new jobs. */
  interactiveByDefault: process.env.FILMWRIGHT_INTERACTIVE !== "false",
  /**
   * How many times the worker may continue a failed run on its own.
   *
   * Off by default. Every attempt costs real money, so an automatic continue
   * is only ever offered for failures that plausibly go away on their own — a
   * worker restart, a flaky render — never for a budget or timeout stop, which
   * would hit the same ceiling again. Raise it if you run unattended.
   */
  autoContinue: num("FILMWRIGHT_AUTO_CONTINUE", 0),
} as const;

export const hyperframes = `hyperframes@${config.hyperframesVersion}`;
