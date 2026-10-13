import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadEnvironment } from "./env";

/** Repo root — three levels up from packages/engine/src. */
export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

// Before a single value below is read: load `.env`, and point the tooling at
// the managed venvs. Both the worker and the studio import this module, so
// every process that matters gets the same environment.
loadEnvironment(ROOT);

export const PROJECTS_DIR = path.join(ROOT, "projects");
export const DATA_DIR = path.join(ROOT, "data");
export const JOBS_DIR = path.join(DATA_DIR, "jobs");

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * A version, not a package spec.
 *
 * `hyperframesVersion` is concatenated into `npx --yes hyperframes@<version>`,
 * so a value like `git+https://…` would install from somewhere else entirely.
 * It comes from `.env`, which is now read — so it is checked.
 */
function pinnedVersion(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  // A version, or a dist-tag such as `latest`. Neither can contain the `/`,
  // `:`, `@` or `#` that would turn `hyperframes@<value>` into a different
  // package — which is the whole risk. A tag defeats reproducibility, so it is
  // allowed but said out loud.
  const version = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/.test(raw);
  const tag = /^[a-z][a-z0-9-]{0,30}$/.test(raw);
  if (!version && !tag) {
    console.warn(
      `[filmwright] ignoring FILMWRIGHT_HYPERFRAMES_VERSION="${raw}" — ` +
        `not a version or a dist-tag. Using ${fallback}.`,
    );
    return fallback;
  }
  if (tag) {
    console.warn(
      `[filmwright] FILMWRIGHT_HYPERFRAMES_VERSION="${raw}" is a dist-tag, not a ` +
        "pin — generated projects will not re-render identically later.",
    );
  }
  return raw;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

function effort(name: string, fallback: Effort): Effort {
  const raw = process.env[name];
  if (!raw) return fallback;
  if ((EFFORTS as readonly string[]).includes(raw)) return raw as Effort;
  console.warn(`[filmwright] ignoring ${name}="${raw}" — not an effort level. Using ${fallback}.`);
  return fallback;
}

export const config = {
  /**
   * Model that orchestrates the run: script, storyboard, media, dispatch, fixes.
   *
   * `claude-opus-5` is listed as legacy by the SDK docs; Opus 5.5 is the
   * current recommendation for agentic work and is cheaper per token.
   */
  model: process.env.FILMWRIGHT_MODEL ?? "claude-opus-5-5",
  /** Reasoning effort for the orchestrator session. */
  effort: effort("FILMWRIGHT_EFFORT", "high"),
  /**
   * Model and effort for the per-frame workers (ADR-0016).
   *
   * Frame authoring is the most expensive stage and the most mechanical: each
   * worker gets one bounded packet and writes one file. That is where a cheaper
   * model is tried first. Whether Sonnet matches Opus here is unmeasured —
   * compare on the same briefs before treating the default as settled.
   */
  workerModel: process.env.FILMWRIGHT_WORKER_MODEL ?? "claude-sonnet-5-5",
  workerEffort: effort("FILMWRIGHT_WORKER_EFFORT", "medium"),
  /**
   * How many frame workers may run at once. Each is a full agent session on
   * the same API account; on a 2-core machine the authoring is API-bound, not
   * CPU-bound, so this is about rate limits and budget, not hardware.
   */
  workerConcurrency: num("FILMWRIGHT_WORKER_CONCURRENCY", 4),
  /** Turn cap for one worker. A frame that needs more than this is stuck. */
  workerMaxTurns: num("FILMWRIGHT_WORKER_MAX_TURNS", 40),
  /**
   * Where the HyperFrames skills live. The packet builder and the worker
   * contract are read from here (ADR-0016).
   */
  skillsDir:
    process.env.FILMWRIGHT_SKILLS_DIR ??
    path.join(process.env.HOME ?? "", ".claude", "skills"),
  /**
   * Fail the check stage on warnings as well as errors (ADR-0017). Off by
   * default: a contrast warning on a decorative eyebrow should not fail a run.
   */
  checkStrict: process.env.FILMWRIGHT_CHECK_STRICT === "true",
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
  hyperframesVersion: pinnedVersion(
    process.env.FILMWRIGHT_HYPERFRAMES_VERSION,
    "0.8.153",
  ),
  /** Which renderer driver to use. */
  renderer: process.env.FILMWRIGHT_RENDERER ?? "local",
  /** Poll interval for the queue and for filesystem-derived progress. */
  pollMs: num("FILMWRIGHT_POLL_MS", 1500),
  /**
   * How long a run waits on an unanswered question before parking itself and
   * handing the worker back to the queue — when nobody is looking at the job.
   *
   * Measured across 30 runs: the review gates accounted for half of all wall
   * clock, because an unattended run sat on each one for the full ten minutes
   * before parking. A run nobody is watching should park in seconds; the
   * question survives on the job either way, and answering it resumes.
   */
  answerGraceMs: num("FILMWRIGHT_ANSWER_GRACE_SECONDS", 60) * 1_000,
  /**
   * The grace to use instead while somebody has the job page open. Parking on
   * a person mid-read would be worse than waiting, so presence buys the long
   * window — see `viewerActiveWithin` in the store.
   */
  answerGraceWatchedMs: num("FILMWRIGHT_ANSWER_GRACE_MINUTES", 10) * 60_000,
  /**
   * How stale the viewer heartbeat may be and still count as "someone is
   * watching". The studio's event stream refreshes it about every 5s.
   */
  viewerFreshMs: num("FILMWRIGHT_VIEWER_FRESH_SECONDS", 20) * 1_000,
  /**
   * How far the wired runtime may sit from the brief's target, as a fraction.
   *
   * Measured against the twelve videos already on disk: at 0.1 five of them
   * would have been held back for rework, including drifts of 13% and 18% that
   * are craft variance rather than error. At 0.2 the three that fail are off by
   * 26%, 27% and 139% — genuinely not the video that was asked for. The agent
   * is told this number up front, which none of those runs were.
   */
  durationTolerance: num("FILMWRIGHT_DURATION_TOLERANCE", 0.2),
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
