import type { Job } from "@filmwright/engine/types";
import { jobDuration } from "@/lib/format";

export type Project = {
  /** Repo-relative project directory — the stable identity. */
  dir: string;
  slug: string;
  /** Every run against this directory, newest first. */
  versions: Job[];
  /** The run the card represents: the newest render, else the newest run. */
  head: Job;
  /** Newest run of any kind, which is what "updated" means. */
  latest: Job;
  /** Runs that produced a render — what a person means by "versions". */
  renderCount: number;
  totalCostUsd: number;
  totalDurationMs: number;
  updatedAt: string;
};

const time = (j: Job) => j.finishedAt ?? j.startedAt ?? j.createdAt;

/**
 * Collapse runs into projects.
 *
 * A revision reuses the original project directory by design, so four runs of
 * the same video were showing as four library cards. Grouping is by
 * `projectDir` rather than slug: a slug can be reassigned when two queued jobs
 * collide, while the directory is what every version actually shares.
 */
export function groupByProject(jobs: Job[]): Project[] {
  const byDir = new Map<string, Job[]>();
  for (const job of jobs) {
    const key = job.projectDir || job.id;
    const list = byDir.get(key);
    if (list) list.push(job);
    else byDir.set(key, [job]);
  }

  const projects: Project[] = [];
  for (const [dir, list] of byDir) {
    const versions = [...list].sort((a, b) => time(b).localeCompare(time(a)));
    const latest = versions[0]!;
    // The card should show something watchable when anything in the project
    // rendered, even if the most recent attempt failed before producing one.
    const head = versions.find((j) => j.videoPath) ?? latest;

    projects.push({
      dir,
      slug: latest.slug,
      versions,
      head,
      latest,
      renderCount: versions.filter((j) => j.videoPath).length,
      totalCostUsd: versions.reduce((sum, j) => sum + (j.costUsd ?? 0), 0),
      totalDurationMs: versions.reduce((sum, j) => sum + (jobDuration(j) ?? 0), 0),
      updatedAt: time(latest),
    });
  }

  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
