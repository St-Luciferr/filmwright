"use client";

import type { RetryAvailability, RetryMode } from "@filmwright/engine";
import type { Job } from "@filmwright/engine/types";
import { ArrowRight, PlayCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { FAILURE_LABEL } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { api, postJson } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Ask the server what can be done with this run.
 *
 * Whether it can be *continued* is a fact about the filesystem — the project
 * directory may have been deleted since the page loaded — so it is never
 * inferred from the job record. Re-asked whenever the run settles into a new
 * state, which is what happens when a live page watches a job fail.
 */
function useRetryAvailability(job: Job): RetryAvailability | null {
  const [availability, setAvailability] = React.useState<RetryAvailability | null>(
    null,
  );
  const { id, status, retriedBy } = job;

  React.useEffect(() => {
    let live = true;
    api<RetryAvailability>(`/api/jobs/${id}/retry`)
      .then((data) => {
        if (live) setAvailability(data);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id, status, retriedBy]);

  return availability;
}

/**
 * Queue another attempt and follow it. Shared by every surface that offers one.
 *
 * Passing no mode leaves the choice to the server, which continues when there
 * is work on disk and starts over when there is not — so a surface with room
 * for only one action never offers a continue that cannot happen.
 */
function useRetryAction(job: Job) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState<RetryMode | "auto" | null>(null);

  const run = React.useCallback(
    async (mode?: RetryMode) => {
      setPending(mode ?? "auto");
      try {
        const next = await postJson<Job>(
          `/api/jobs/${job.id}/retry`,
          mode ? { mode } : {},
          "Could not queue another attempt.",
        );
        // Report what actually happened rather than what was asked for: with no
        // mode named, the server may have started over.
        toast.push(
          "success",
          next.resume ? "Continuing" : "Starting over",
          next.resume
            ? "Queued as a new run that picks up the work on disk."
            : "Queued as a new run in a fresh project directory.",
        );
        router.push(`/jobs/${next.id}`);
        router.refresh();
      } catch (err) {
        toast.push(
          "error",
          "Could not retry",
          err instanceof Error ? err.message : String(err),
        );
        // Only clear on failure: on success the page is navigating away, and a
        // button that springs back to life mid-navigation invites a second run.
        setPending(null);
      }
    },
    [job.id, router, toast],
  );

  return { run, pending };
}

/**
 * The two ways to run a stopped job again.
 *
 * Continue is the primary action wherever it is available: the failed attempt
 * left its captures, script, voiceover and frames on disk, and regenerating
 * them is usually what exhausted the budget in the first place.
 */
export function RetryActions({
  job,
  size = "sm",
  className,
}: {
  job: Job;
  size?: "sm" | "md";
  className?: string;
}) {
  const availability = useRetryAvailability(job);
  const { run, pending } = useRetryAction(job);

  if (availability && !availability.retryable) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        <p className="text-[12.5px] text-muted">{availability.reason}</p>
        {job.retriedBy && (
          <Button asChild size={size} variant="secondary">
            <Link href={`/jobs/${job.retriedBy}`}>
              Open that attempt
              <ArrowRight />
            </Link>
          </Button>
        )}
      </div>
    );
  }

  const resume = availability?.resume;
  const fresh = availability?.fresh;
  const recommended = availability?.recommended ?? "resume";
  // Both unavailable is a real state — a re-render whose project directory is
  // gone — and two dead buttons explain nothing.
  const blocked = availability && !resume?.available && !fresh?.available;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        size={size}
        variant={recommended === "resume" ? "primary" : "secondary"}
        loading={pending === "resume"}
        disabled={!availability || (resume ? !resume.available : false) || pending !== null}
        onClick={() => void run("resume")}
      >
        {pending !== "resume" && <PlayCircle />}
        Continue where it stopped
      </Button>
      <Button
        size={size}
        variant={recommended === "fresh" ? "primary" : "secondary"}
        loading={pending === "fresh"}
        disabled={!availability || (fresh ? !fresh.available : false) || pending !== null}
        onClick={() => void run("fresh")}
      >
        {pending !== "fresh" && <RotateCcw />}
        Start over
      </Button>
      {/* Say why an option is missing, once — both reasons at once is noise. */}
      {blocked ? (
        <p className="text-[12.5px] text-subtle">
          {resume?.reason ?? fresh?.reason}
        </p>
      ) : (
        <>
          {resume && !resume.available && (
            <p className="text-[12.5px] text-subtle">{resume.reason}</p>
          )}
          {fresh && !fresh.available && (
            <p className="text-[12.5px] text-subtle">{fresh.reason}</p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The same action as one menu entry, for surfaces that have no room for two
 * buttons. It sends no mode, so the server continues when there is work on
 * disk and starts over when there is not.
 */
export function RetryMenuItem({ job }: { job: Job }) {
  const { run, pending } = useRetryAction(job);
  return (
    <MenuItem
      disabled={pending !== null}
      onSelect={(e) => {
        e.preventDefault();
        void run();
      }}
    >
      <PlayCircle />
      Run this again
    </MenuItem>
  );
}

/**
 * The card a stopped run shows above everything else.
 *
 * A failure is worth this much room: it states what happened, what it means,
 * and offers the two ways forward in one place — the alternative was a red
 * string on the page and a CLI command buried in the log.
 */
export function RunStopped({ job }: { job: Job }) {
  const failure = job.failure;
  const cancelled = job.status === "cancelled";

  const title = cancelled
    ? "This run was cancelled"
    : failure
      ? FAILURE_LABEL[failure.kind]
      : "This run failed";

  return (
    <div
      role="alert"
      className={cn(
        "overflow-hidden rounded-card border",
        cancelled ? "border-line bg-raised" : "border-err/30 bg-err-dim/40",
      )}
    >
      <div className="space-y-2.5 px-4 py-3.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p
            className={cn(
              "text-[13px] font-medium",
              cancelled ? "text-fg" : "text-err",
            )}
          >
            {title}
          </p>
          {failure?.stage && (
            <span className="font-mono text-[11px] text-subtle">
              at the {failure.stage} stage
            </span>
          )}
          {(job.attempt ?? 1) > 1 && (
            <span className="font-mono text-[11px] text-subtle">
              attempt {job.attempt}
            </span>
          )}
        </div>

        {job.error && (
          <p
            className={cn(
              "break-words font-mono text-[12px] leading-relaxed",
              cancelled ? "text-muted" : "text-err/85",
            )}
          >
            {job.error}
          </p>
        )}

        <p className="text-[12.5px] leading-relaxed text-muted">
          {failure?.hint ??
            "Continuing picks up the work left in the project directory; starting over builds it again from the prompt."}
        </p>

        <RetryActions job={job} className="pt-0.5" />
      </div>
    </div>
  );
}
