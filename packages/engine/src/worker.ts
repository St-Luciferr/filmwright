import { config } from "./config";
import { runJob } from "./pipeline";
import { appendEvent, claimNextJob, listJobs, updateJob } from "./store";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Recover jobs left `running` by a worker that died. Without this they would
 * sit in the UI forever claiming to be in progress.
 */
async function reclaimOrphans(): Promise<void> {
  for (const job of await listJobs()) {
    if (job.status !== "running") continue;
    await appendEvent(job.id, {
      kind: "error",
      message: "Worker restarted while this job was running — marking it failed",
    });
    await updateJob(job.id, (j) => {
      j.status = "failed";
      j.error = "Worker restarted mid-run";
      j.finishedAt = new Date().toISOString();
    });
  }
}

let shuttingDown = false;

async function main(): Promise<void> {
  console.log(
    `[worker] model=${config.model} effort=${config.effort} renderer=${config.renderer} hyperframes=${config.hyperframesVersion}`,
  );
  await reclaimOrphans();
  console.log("[worker] waiting for jobs");

  while (!shuttingDown) {
    const job = await claimNextJob();
    if (!job) {
      await sleep(config.pollMs);
      continue;
    }
    console.log(`[worker] running ${job.id} (${job.slug})`);
    try {
      await runJob(job);
    } catch (err) {
      // runJob handles its own failures; this is the last line of defence so a
      // single bad job cannot take the worker down.
      console.error(`[worker] ${job.id} crashed`, err);
      await updateJob(job.id, (j) => {
        j.status = "failed";
        j.error = err instanceof Error ? err.message : String(err);
        j.finishedAt = new Date().toISOString();
      });
    }
    console.log(`[worker] finished ${job.id}`);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) process.exit(1);
    shuttingDown = true;
    console.log("\n[worker] shutting down after the current job");
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
