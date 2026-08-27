#!/usr/bin/env tsx
/**
 * Put a stopped job back on the queue, reusing its stored spec.
 *
 *   npm run requeue                    list what can be re-queued
 *   npm run requeue -- <slug|id>       continue it, reusing the work on disk
 *   npm run requeue -- <slug> --fresh  start over in a new project directory
 *   npm run requeue -- --failed        continue every failed job
 *
 * The same thing the Continue and Start over buttons do on the job page — this
 * calls straight into the engine so the two cannot drift apart.
 *
 * Continuing is the default: a run that died partway usually leaves captures,
 * script, voiceover and storyboard behind, and regenerating them is what
 * exhausted the budget in the first place.
 */
import {
  RetryRefused,
  listJobs,
  retryAvailability,
  retryJob,
  type Job,
  type RetryMode,
} from "@filmwright/engine";

const args = process.argv.slice(2);
const fresh = args.includes("--fresh");
const mode: RetryMode = fresh ? "fresh" : "resume";
const positional = args.filter((a) => !a.startsWith("--"));

const jobs = await listJobs();

async function requeue(job: Job): Promise<void> {
  const availability = await retryAvailability(job);
  // Asked for a continue that is not on offer? Say so rather than silently
  // starting over — a fresh run is a different, much more expensive thing.
  const chosen: RetryMode =
    mode === "resume" && !availability.resume.available ? "fresh" : mode;
  if (chosen !== mode) {
    console.log(`  ${job.slug}: ${availability.resume.reason} Starting over instead.`);
  }
  try {
    const next = await retryJob(job, chosen);
    console.log(
      `queued  ${next.slug}  attempt ${next.attempt}  ` +
        `${chosen === "resume" ? `(continuing ${next.projectDir})` : "(fresh)"}`,
    );
  } catch (err) {
    if (err instanceof RetryRefused) {
      console.error(`skipped ${job.slug}: ${err.message}`);
      return;
    }
    throw err;
  }
}

if (args.includes("--failed")) {
  const failed = jobs.filter((j) => j.status === "failed");
  if (!failed.length) console.log("No failed jobs.");
  for (const job of failed) await requeue(job);
} else if (positional[0]) {
  const target = jobs.find(
    (j) => j.id === positional[0] || j.slug === positional[0],
  );
  if (!target) {
    console.error(`No job matching "${positional[0]}".`);
    process.exit(1);
  }
  await requeue(target);
} else {
  const retryable = jobs.filter((j) =>
    ["failed", "cancelled"].includes(j.status),
  );
  if (!retryable.length) {
    console.log("Nothing to requeue.");
  } else {
    console.log("Requeue with `npm run requeue -- <slug>`:\n");
    for (const job of retryable) {
      const { resume } = await retryAvailability(job);
      console.log(
        `  ${job.status.padEnd(10)} ${(resume.available ? "resumable" : "fresh only").padEnd(11)} ` +
          `${job.slug.padEnd(34)} ${(job.failure?.kind ?? "—").padEnd(16)} ` +
          `${job.spec.prompt.replace(/\s+/g, " ").slice(0, 42)}`,
      );
    }
    console.log(
      "\nContinues by default. `--fresh` starts over; `--failed` does all failed jobs.",
    );
  }
}
