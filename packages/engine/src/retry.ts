import { randomUUID } from "node:crypto";
import path from "node:path";
import { PROJECTS_DIR, ROOT } from "./config";
import { freeSlug } from "./slug";
import { hasSalvageableWork } from "./stages";
import {
  claim,
  emptyStages,
  getJob,
  jobsInProject,
  markRetried,
  releaseClaim,
  saveJob,
} from "./store";
import type { Job } from "./types";

/**
 * The two ways to run a failed job again.
 *
 * `resume` continues in the same project directory, reusing the captures,
 * script, voiceover, storyboard and frames the failed attempt left behind.
 * `fresh` starts a new directory from the original prompt.
 *
 * Resume is the default everywhere it is offered: regenerating the expensive
 * early work is usually what exhausted the budget in the first place.
 */
export type RetryMode = "resume" | "fresh";

/** A retry the platform refuses, with the reason to show the person. */
export class RetryRefused extends Error {}

export type RetryOption = {
  mode: RetryMode;
  available: boolean;
  /** Why it is unavailable. Present only when `available` is false. */
  reason?: string;
};

export type RetryAvailability = {
  /** False when the job's status makes any retry meaningless. */
  retryable: boolean;
  reason?: string;
  resume: RetryOption;
  fresh: RetryOption;
  /** The mode to pre-select: resume when there is work to keep. */
  recommended: RetryMode;
};

/** Statuses a retry can be started from. */
const RETRYABLE = new Set<Job["status"]>(["failed", "cancelled"]);

/** A retry cannot be queued while the previous one is still in flight. */
const LIVE = new Set<Job["status"]>(["queued", "running", "awaiting-input"]);

/**
 * The base project name, with any collision suffix stripped.
 *
 * A fresh run must be able to claim a directory of its own, and `freeSlug`
 * appends the next free number — so handing it `promo-3` would drift to
 * `promo-3-2` rather than reusing `promo-4`.
 */
const baseSlug = (slug: string): string => slug.replace(/-\d+$/, "");

/**
 * What can be done with a job, without doing it.
 *
 * The studio calls this to decide which buttons to show; `retryJob` re-checks
 * everything itself, because the answer can go stale between the page render
 * and the click.
 */
export async function retryAvailability(job: Job): Promise<RetryAvailability> {
  const fresh: RetryOption = { mode: "fresh", available: true };

  if (!RETRYABLE.has(job.status)) {
    const reason =
      job.status === "succeeded"
        ? "This run finished. Use Revise to change the video it produced."
        : job.status === "imported"
          ? "This project was adopted rather than generated, so there is no run to repeat."
          : `This run is ${job.status}.`;
    return {
      retryable: false,
      reason,
      resume: { mode: "resume", available: false, reason },
      fresh: { ...fresh, available: false, reason },
      recommended: "fresh",
    };
  }

  const refuse = (reason: string, recommended: RetryMode = "resume"): RetryAvailability => ({
    retryable: false,
    reason,
    resume: { mode: "resume", available: false, reason },
    fresh: { ...fresh, available: false, reason },
    recommended,
  });

  if (job.retriedBy) {
    const child = await getJob(job.retriedBy);
    if (child && LIVE.has(child.status)) {
      return refuse("This run has already been retried and that attempt is still going.");
    }
  }

  // A later run in the same project that succeeded means this failure was
  // already dealt with — and resuming underneath it would rebuild the directory
  // that finished work is sitting in. Checked across the project rather than
  // through `retriedBy` alone, because the retry may itself have been revised
  // since, and it is the newest good state that must be protected.
  const succeeded = (await jobsInProject(job.projectDir))
    .filter((j) => j.id !== job.id && j.status === "succeeded")
    .find((j) => j.createdAt > job.createdAt);
  if (succeeded) {
    return refuse(
      `A later run in this project finished successfully (v${succeeded.version ?? 1}). ` +
        "Open that one and revise it rather than resuming this failure underneath it.",
    );
  }

  const hasWork =
    Boolean(job.projectDir) &&
    hasSalvageableWork(path.resolve(ROOT, job.projectDir));

  // Starting over is meaningless for a re-render: there is no prompt to build
  // from, only a project directory to render. Offering it would quietly turn a
  // free render into a paid authoring run.
  const render = job.kind === "render";

  return {
    retryable: true,
    resume: hasWork
      ? { mode: "resume", available: true }
      : {
          mode: "resume",
          available: false,
          reason: `Nothing is left in ${job.projectDir || "the project directory"} to continue from.`,
        },
    fresh: render
      ? {
          mode: "fresh",
          available: false,
          reason:
            "This run only re-renders an existing project, so there is nothing to start over from.",
        }
      : fresh,
    recommended: hasWork || render ? "resume" : "fresh",
  };
}

/**
 * Queue another attempt at a failed or cancelled run.
 *
 * The failed record is kept exactly as it is — a new job is queued alongside
 * it, so the history shows what went wrong as well as what fixed it. Both jobs
 * point at each other through `retryOf` / `retriedBy`.
 */
export async function retryJob(parent: Job, mode: RetryMode): Promise<Job> {
  // Claimed before anything is read, so two clicks cannot both pass the checks
  // below and queue two runs against one project directory.
  if (!(await claim(parent.id, "retry"))) {
    throw new RetryRefused("This run is already being retried. Give it a moment.");
  }
  try {
    return await queueRetry(parent, mode);
  } finally {
    await releaseClaim(parent.id, "retry");
  }
}

async function queueRetry(parent: Job, mode: RetryMode): Promise<Job> {
  const availability = await retryAvailability(parent);
  if (!availability.retryable) {
    throw new RetryRefused(availability.reason ?? "This run cannot be retried.");
  }
  const option = mode === "resume" ? availability.resume : availability.fresh;
  if (!option.available) {
    throw new RetryRefused(option.reason ?? `Cannot ${mode} this run.`);
  }

  const resume = mode === "resume";
  // A fresh run needs a directory of its own from the moment it is queued: a
  // name already in use would group this job into an unrelated project in the
  // library and, worse, count as a live run there — blocking that project's
  // caption edits and re-renders until this one finished.
  const slug = resume ? parent.slug : await freeSlug(baseSlug(parent.slug));

  const job: Job = {
    id: randomUUID(),
    slug,
    status: "queued",
    spec: parent.spec,
    createdAt: new Date().toISOString(),
    projectDir: resume
      ? parent.projectDir
      : path.relative(ROOT, path.join(PROJECTS_DIR, slug)),
    stages: emptyStages(),
    interactive: parent.interactive ?? parent.spec.interactive,
    attempt: (parent.attempt ?? 1) + 1,
    retryOf: parent.id,
    // A retry does the same job the parent did. Dropping `kind` here turned the
    // Continue button on a failed re-render into a full authoring session, on a
    // project the person only wanted rendered.
    kind: parent.kind,
    renderReason: parent.kind === "render" ? parent.renderReason : undefined,
    // A continued run keeps the version it was trying to produce; a fresh one
    // builds a new directory, where it is the first version of that project.
    version: resume ? (parent.version ?? 1) : 1,
    ...(resume
      ? {
          resume: true,
          resumeOf: parent.id,
          // A failed revision has to keep its change requests, or the retry
          // would rebuild the same video the notes were written against.
          revisionOf: parent.revisionOf,
          appliedNotes: parent.appliedNotes,
          // Decisions already made carry over so nothing is asked twice.
          answered: parent.answered,
        }
      : {}),
  };

  const saved = await saveJob(job);
  await markRetried(parent.id, saved.id);
  return saved;
}
