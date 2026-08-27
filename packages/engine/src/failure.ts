import type { FailureKind, JobFailure, Stage } from "./types";

/**
 * What to do about each kind of failure, and whether continuing the work on
 * disk is even meaningful.
 *
 * `resumable` here is the *shape* of the failure, not a fact about the
 * filesystem: a scaffold that never created a directory has nothing to
 * continue no matter what, while a render failure always does. The caller ANDs
 * this with what is actually on disk.
 */
const REMEDY: Record<FailureKind, { resumable: boolean; hint: string }> = {
  budget: {
    resumable: true,
    hint:
      "The run hit the FILMWRIGHT_MAX_BUDGET_USD ceiling. Continuing keeps the " +
      "work already paid for — raise the ceiling in .env first if it died mid-way " +
      "through something large.",
  },
  timeout: {
    resumable: true,
    hint:
      "The run passed FILMWRIGHT_TIMEOUT_MINUTES. Continuing picks up from the " +
      "files on disk rather than rebuilding them.",
  },
  worker: {
    resumable: true,
    hint:
      "The worker stopped while this run was in flight. Nothing it had already " +
      "written was lost — continue to carry on from there.",
  },
  scaffold: {
    resumable: false,
    hint:
      "The project could not be created, so there is nothing to continue. " +
      "Start over, and run `npm run doctor` if it fails the same way twice.",
  },
  render: {
    resumable: true,
    hint:
      "Everything up to the render is on disk. Continuing re-runs the render " +
      "without rebuilding the composition.",
  },
  "missing-project": {
    resumable: false,
    hint:
      "The project directory is gone, so there is nothing left to continue. " +
      "Starting over builds it again from the original prompt.",
  },
  agent: {
    resumable: true,
    hint:
      "The authoring session ended before it finished. Continuing resumes from " +
      "the work on disk instead of paying for it twice.",
  },
  unknown: {
    resumable: true,
    hint:
      "Continuing resumes from the work already on disk. Start over instead if " +
      "the project itself looks wrong rather than merely unfinished.",
  },
};

/**
 * Read a failure message and say what kind of failure it was.
 *
 * The pipeline names the kind itself wherever it knows — a timeout looks like
 * an aborted session from the message alone, and guessing wrong would tell
 * someone to raise the wrong ceiling. Pattern matching is the fallback for
 * errors that surface from the SDK or a child process.
 */
export function classifyKind(message: string): FailureKind {
  if (/budget/i.test(message)) return "budget";
  if (/timed?[ -]?out/i.test(message)) return "timeout";
  if (/cannot resume/i.test(message)) return "missing-project";
  if (/hyperframes init|scaffold/i.test(message)) return "scaffold";
  if (/render/i.test(message)) return "render";
  if (/agent (run|session)/i.test(message)) return "agent";
  return "unknown";
}

/**
 * Build the record a failed job carries: the message, what kind of failure it
 * is, and whether there is anything worth continuing.
 */
export function describeFailure(
  message: string,
  opts: { kind?: FailureKind; stage?: Stage; hasWork: boolean },
): JobFailure {
  const kind = opts.kind ?? classifyKind(message);
  const remedy = REMEDY[kind] ?? REMEDY.unknown;
  return {
    kind,
    message,
    at: new Date().toISOString(),
    stage: opts.stage,
    resumable: remedy.resumable && opts.hasWork,
    // A kind that would normally be resumable but left nothing behind needs its
    // own advice: offering to continue an empty directory only fails again.
    hint:
      remedy.resumable && !opts.hasWork
        ? "Nothing usable was left on disk, so this run can only be started over."
        : remedy.hint,
  };
}
