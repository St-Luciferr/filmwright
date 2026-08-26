import type { Job } from "@filmwright/engine/types";
import { jobDuration } from "@/lib/format";

export type Stats = {
  total: number;
  /** Jobs this platform actually produced — excludes adopted examples. */
  generated: number;
  succeeded: number;
  failed: number;
  live: number;
  needsYou: number;
  successRate: number | null;
  spendUsd: number;
  medianDurationMs: number | null;
  /** Spend per day, oldest first, for the trend strip. */
  spendByDay: { day: string; usd: number }[];
};

const LIVE = new Set(["running", "queued"]);

/**
 * Roll a job list into the numbers the dashboard shows.
 *
 * Adopted examples are excluded from every rate and total: they were not
 * generated here, cost nothing, and would flatter both the success rate and
 * the job count.
 */
export function summarise(jobs: Job[]): Stats {
  const generated = jobs.filter((j) => j.status !== "imported");
  const succeeded = generated.filter((j) => j.status === "succeeded").length;
  const failed = generated.filter((j) => j.status === "failed").length;

  // Cancelled runs are neither a success nor a failure — counting them as
  // either misrepresents how often the platform works.
  const settled = succeeded + failed;

  const durations = generated
    .filter((j) => j.status === "succeeded")
    .map((j) => jobDuration(j))
    .filter((d): d is number => d !== undefined)
    .sort((a, b) => a - b);

  const byDay = new Map<string, number>();
  for (const job of generated) {
    if (!job.costUsd) continue;
    const day = (job.finishedAt ?? job.createdAt).slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + job.costUsd);
  }

  return {
    total: jobs.length,
    generated: generated.length,
    succeeded,
    failed,
    live: generated.filter((j) => LIVE.has(j.status)).length,
    needsYou: generated.filter((j) => j.status === "awaiting-input").length,
    successRate: settled ? (succeeded / settled) * 100 : null,
    spendUsd: generated.reduce((sum, j) => sum + (j.costUsd ?? 0), 0),
    medianDurationMs: durations.length
      ? durations[Math.floor(durations.length / 2)]
      : null,
    spendByDay: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, usd]) => ({ day, usd })),
  };
}
