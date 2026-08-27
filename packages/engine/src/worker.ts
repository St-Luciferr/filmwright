import path from "node:path";
import { ROOT, config } from "./config";
import { describeFailure } from "./failure";
import { runJob } from "./pipeline";
import { retryJob } from "./retry";
import { hasSalvageableWork } from "./stages";
import {
  appendEvent,
  beat,
  claimNextJob,
  clearBeat,
  getJob,
  listJobs,
  readWorkerStatus,
  updateJob,
} from "./store";
import type { FailureKind, Job } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The stage a job had reached, for the failure record. */
const stageOf = (job: Job) =>
  job.stages.find((s) => s.status === "active")?.stage;

const workOnDisk = (job: Job) =>
  Boolean(job.projectDir) && hasSalvageableWork(path.resolve(ROOT, job.projectDir));

/**
 * Failures that will recur identically on the next attempt. Continuing past a
 * ceiling without raising it just spends the ceiling again.
 */
const NEVER_AUTOMATIC = new Set<FailureKind>(["budget", "timeout"]);

/**
 * Put a resumable failure back on the queue without waiting for a person.
 *
 * Off unless FILMWRIGHT_AUTO_CONTINUE is set, because each attempt costs money
 * and the default assumption is that someone is watching. When it is on, the
 * continuation is always a resume: the point is to survive a worker restart or
 * a flaky render, not to rebuild the video.
 */
async function maybeAutoContinue(job: Job): Promise<void> {
  const failure = job.failure;
  if (config.autoContinue < 1 || !failure?.resumable) return;
  if (NEVER_AUTOMATIC.has(failure.kind)) return;

  if ((job.attempt ?? 1) > config.autoContinue) {
    await appendEvent(job.id, {
      kind: "log",
      message:
        `Automatic continuation is exhausted after ${job.attempt ?? 1} attempts — ` +
        "continue it from the job page when you have looked at why.",
    });
    return;
  }

  try {
    const next = await retryJob(job, "resume");
    await appendEvent(job.id, {
      kind: "log",
      message: `Continuing automatically as attempt ${next.attempt} (${next.id}).`,
    });
    console.log(`[worker] auto-continuing ${job.id} as ${next.id}`);
  } catch (err) {
    await appendEvent(job.id, {
      kind: "error",
      message: `Could not continue automatically: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
  }
}

/**
 * Recover jobs left `running` by a worker that died. Without this they would
 * sit in the UI forever claiming to be in progress.
 *
 * Nothing the dead run wrote is lost, so the failure is recorded as resumable
 * whenever the project directory still holds work — that is what makes the
 * job page offer Continue rather than only Start over.
 */
async function reclaimOrphans(): Promise<void> {
  // Another worker beating right now owns whatever is running: this one is the
  // accident. Reclaiming would fail a job that is being worked on, and with
  // FILMWRIGHT_AUTO_CONTINUE set, immediately queue a duplicate of it.
  const other = await readWorkerStatus();
  if (other.running && other.pid !== process.pid) {
    console.log(
      `[worker] another worker (pid ${other.pid}) is alive — leaving running jobs alone`,
    );
    return;
  }

  for (const job of await listJobs()) {
    if (job.status !== "running") continue;
    const message = "The worker stopped while this run was in flight";
    const failure = describeFailure(message, {
      kind: "worker",
      stage: stageOf(job),
      hasWork: workOnDisk(job),
    });
    await appendEvent(job.id, {
      kind: "error",
      message: `${message} — marking it failed. ${failure.hint}`,
    });
    const failed = await updateJob(job.id, (j) => {
      j.status = "failed";
      j.error = message;
      j.failure = failure;
      j.finishedAt = new Date().toISOString();
    });
    if (failed) await maybeAutoContinue(failed);
  }
}

let shuttingDown = false;
/** The in-run heartbeat, so shutdown can stop it before dropping the file. */
let pulse: NodeJS.Timeout | undefined;

async function main(): Promise<void> {
  console.log(
    `[worker] model=${config.model} effort=${config.effort} renderer=${config.renderer} hyperframes=${config.hyperframesVersion}`,
  );
  await reclaimOrphans();
  console.log("[worker] waiting for jobs");

  while (!shuttingDown) {
    // Beat before claiming, so an idle worker still proves it is alive.
    await beat();
    const job = await claimNextJob();
    if (!job) {
      await sleep(config.pollMs);
      continue;
    }
    console.log(`[worker] running ${job.id} (${job.slug})`);
    await beat(job.id);

    // Keep beating for the whole run. A job lasts minutes to hours, the studio
    // calls a heartbeat older than 15 seconds a dead worker, and nothing inside
    // runJob touches the file — so the pill read "worker down" for the entire
    // length of every job that was working perfectly well.
    //
    // Module-scoped so the signal handler can stop it before clearing the
    // heartbeat; otherwise an in-flight beat lands after the file is removed and
    // the studio waits out the staleness window on a worker that has gone.
    pulse = setInterval(() => {
      void beat(job.id).catch(() => {});
    }, config.pollMs);

    try {
      await runJob(job);
    } catch (err) {
      // runJob handles its own failures; this is the last line of defence so a
      // single bad job cannot take the worker down.
      console.error(`[worker] ${job.id} crashed`, err);
      const message = err instanceof Error ? err.message : String(err);
      await appendEvent(job.id, { kind: "error", message }).catch(() => {});
      await updateJob(job.id, (j) => {
        j.status = "failed";
        j.error = message;
        j.failure = describeFailure(message, {
          stage: stageOf(j),
          hasWork: workOnDisk(j),
        });
        j.finishedAt = new Date().toISOString();
      });
    } finally {
      if (pulse) clearInterval(pulse);
      pulse = undefined;
    }
    console.log(`[worker] finished ${job.id}`);

    // Read the record back rather than trusting the in-memory copy: runJob
    // writes the outcome through the store, and a parked or cancelled run must
    // not be continued behind the person's back.
    const settled = await getJob(job.id);
    if (settled?.status === "failed") await maybeAutoContinue(settled);

    await beat();
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) process.exit(1);
    shuttingDown = true;
    if (pulse) clearInterval(pulse);
    console.log("\n[worker] shutting down after the current job");
    // Drop the heartbeat so the studio reports "stopped" rather than waiting
    // out the staleness window on a worker that is not coming back.
    void clearBeat().finally(() => process.exit(0));
  });
}

/**
 * A rejected background promise — an event append, a stage sync — must not take
 * the worker down with it. Node's default for an unhandled rejection is to
 * exit, which would turn a full disk into a dead queue.
 */
process.on("unhandledRejection", (reason) => {
  console.error("[worker] unhandled rejection", reason);
});

/**
 * An uncaught exception leaves the process in an unknown state, so the worker
 * does stop — but cleanly, and without stranding the running job: the heartbeat
 * goes away immediately, and the next start reclaims the job as a resumable
 * failure.
 */
process.on("uncaughtException", (err) => {
  console.error("[worker] uncaught exception", err);
  if (pulse) clearInterval(pulse);
  void clearBeat().finally(() => process.exit(1));
});

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
