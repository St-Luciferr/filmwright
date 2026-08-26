import type { Job } from "@filmwright/engine/types";
import Link from "next/link";
import { StatusBadge, activeStage, stageProgress } from "@/components/app/status";
import { Progress } from "@/components/ui/feedback";
import { jobDuration, duration, money, relative } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A job as a compact list row — used on the dashboard and in the library table. */
export function JobRow({ job, className }: { job: Job; className?: string }) {
  const live = job.status === "running" || job.status === "queued";
  const stage = activeStage(job);

  return (
    <Link
      href={`/jobs/${job.id}`}
      className={cn(
        "flex items-center gap-3 rounded-control px-3 py-2.5 transition-colors hover:bg-overlay/60",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-[13px] text-fg">{job.slug}</span>
          {(job.version ?? 1) > 1 && (
            <span className="shrink-0 font-mono text-[11px] text-subtle">
              v{job.version}
            </span>
          )}
        </div>
        {live && stage ? (
          <div className="mt-1.5 flex items-center gap-2">
            <Progress value={stageProgress(job)} tone="info" className="max-w-40" />
            <span className="truncate text-[12px] text-subtle">{stage}</span>
          </div>
        ) : (
          <p className="mt-0.5 truncate text-[12px] text-subtle">{job.spec.prompt}</p>
        )}
      </div>

      <div className="tabular hidden shrink-0 text-right text-[12px] text-subtle sm:block">
        <div>{money(job.costUsd)}</div>
        <div>{duration(jobDuration(job))}</div>
      </div>

      <div className="hidden shrink-0 text-right text-[12px] text-subtle md:block">
        {relative(job.finishedAt ?? job.startedAt ?? job.createdAt)}
      </div>

      <StatusBadge status={job.status} className="shrink-0" />
    </Link>
  );
}
