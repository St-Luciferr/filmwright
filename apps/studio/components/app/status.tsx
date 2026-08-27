import type { FailureKind, Job, JobStatus } from "@filmwright/engine/types";
import { Badge } from "@/components/ui/badge";

/**
 * One vocabulary for job status, used by every surface.
 *
 * Two of these are renames rather than raw values: `imported` reads as
 * "example" because those projects were adopted, not generated here, and
 * `awaiting-input` reads as "needs you" because the raw name describes the
 * scheduler's state rather than the reader's obligation.
 */
export const STATUS_META: Record<
  JobStatus,
  { label: string; tone: "neutral" | "accent" | "info" | "warn" | "err"; live?: boolean }
> = {
  queued: { label: "queued", tone: "info", live: true },
  running: { label: "running", tone: "info", live: true },
  "awaiting-input": { label: "needs you", tone: "warn" },
  succeeded: { label: "done", tone: "accent" },
  failed: { label: "failed", tone: "err" },
  cancelled: { label: "cancelled", tone: "neutral" },
  imported: { label: "example", tone: "neutral" },
};

/**
 * A headline per kind of failure.
 *
 * The stored `hint` says what to do; this says what happened, in the words
 * someone would use themselves. "budget" is a field name, not a sentence.
 */
export const FAILURE_LABEL: Record<FailureKind, string> = {
  budget: "Budget ceiling reached",
  timeout: "Ran out of time",
  worker: "The worker stopped mid-run",
  scaffold: "The project could not be created",
  render: "The render failed",
  "missing-project": "The project directory is gone",
  agent: "The authoring session ended early",
  unknown: "This run failed",
};

export function StatusBadge({
  status,
  className,
}: {
  status: JobStatus;
  className?: string;
}) {
  const meta = STATUS_META[status] ?? STATUS_META.queued;
  return (
    <Badge tone={meta.tone} pulse={meta.live} className={className}>
      {meta.label}
    </Badge>
  );
}

/** Fraction of the pipeline that is complete, for progress bars. */
export function stageProgress(job: Job): number {
  if (!job.stages.length) return 0;
  const done = job.stages.filter((s) => s.status === "done").length;
  return (done / job.stages.length) * 100;
}

/** The stage a live job is currently on, with its detail line if it has one. */
export function activeStage(job: Job): string | null {
  const active = job.stages.find((s) => s.status === "active");
  if (!active) return null;
  return active.detail ? `${active.stage} — ${active.detail}` : active.stage;
}
