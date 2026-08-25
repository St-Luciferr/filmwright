#!/usr/bin/env node
/**
 * Put a finished job back on the queue, reusing its stored spec.
 *
 *   npm run requeue                    list what can be requeued
 *   npm run requeue -- <slug|id>       resume it, reusing the work on disk
 *   npm run requeue -- <slug> --fresh  start over in a new project directory
 *   npm run requeue -- --failed        resume every failed job
 *
 * Resume is the default: a run that died partway usually leaves captures,
 * script, voiceover and storyboard behind, and regenerating them is what
 * exhausted the budget in the first place.
 *
 * The original job record is kept; a fresh one is queued so the failed run
 * stays in the history.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JOBS_DIR = path.join(ROOT, "data", "jobs");

const STAGES = [
  "scaffold",
  "brief",
  "script",
  "storyboard",
  "frames",
  "media",
  "check",
  "render",
];

async function allJobs() {
  if (!fs.existsSync(JOBS_DIR)) return [];
  const out = [];
  for (const id of await fsp.readdir(JOBS_DIR)) {
    try {
      out.push(
        JSON.parse(
          await fsp.readFile(path.join(JOBS_DIR, id, "job.json"), "utf8"),
        ),
      );
    } catch {
      // Not a job directory.
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function requeue(job, { fresh }) {
  const dir = path.join(ROOT, job.projectDir ?? "");
  const canResume = !fresh && job.projectDir && fs.existsSync(dir);

  const id = randomUUID();
  const next = {
    id,
    // A fresh run needs a name the scaffold step can still claim.
    slug: canResume ? job.slug : job.slug.replace(/-\d+$/, ""),
    status: "queued",
    spec: job.spec,
    createdAt: new Date().toISOString(),
    projectDir: canResume ? job.projectDir : path.join("projects", job.slug),
    stages: STAGES.map((stage) => ({ stage, status: "pending" })),
    resume: canResume || undefined,
    resumeOf: canResume ? job.id : undefined,
  };
  await fsp.mkdir(path.join(JOBS_DIR, id), { recursive: true });
  await fsp.writeFile(
    path.join(JOBS_DIR, id, "job.json"),
    `${JSON.stringify(next, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `queued  ${next.slug}  ${canResume ? `(resuming ${job.projectDir})` : "(fresh)"}`,
  );
}

const args = process.argv.slice(2);
const jobs = await allJobs();
const retryable = jobs.filter((j) =>
  ["failed", "cancelled"].includes(j.status),
);

const fresh = args.includes("--fresh");
const positional = args.filter((a) => !a.startsWith("--"));

if (args.includes("--failed")) {
  const failed = jobs.filter((j) => j.status === "failed");
  if (!failed.length) console.log("No failed jobs.");
  for (const job of failed) await requeue(job, { fresh });
} else if (positional[0]) {
  const target = jobs.find(
    (j) => j.id === positional[0] || j.slug === positional[0],
  );
  if (!target) {
    console.error(`No job matching "${positional[0]}".`);
    process.exit(1);
  }
  await requeue(target, { fresh });
} else {
  if (!retryable.length) {
    console.log("Nothing to requeue.");
  } else {
    console.log("Requeue with `npm run requeue -- <slug>`:\n");
    for (const job of retryable) {
      const dir = path.join(ROOT, job.projectDir ?? "");
      const state = job.projectDir && fs.existsSync(dir) ? "resumable" : "fresh only";
      console.log(
        `  ${job.status.padEnd(10)} ${state.padEnd(11)} ${job.slug.padEnd(34)} ${job.spec.prompt.replace(/\s+/g, ' ').slice(0, 42)}`,
      );
    }
    console.log(
      "\nResumes by default. `--fresh` starts over; `--failed` does all failed jobs.",
    );
  }
}
