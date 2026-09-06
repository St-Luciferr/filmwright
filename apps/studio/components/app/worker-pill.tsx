"use client";

import { CircleDot, CircleSlash } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

type Status = { running: boolean; currentJobId?: string; sinceMs?: number };

/**
 * Whether the half of the platform that actually builds videos is alive.
 *
 * This is the single most useful thing to keep on screen: with the studio up
 * and the worker down, everything looks normal and jobs queue forever. Polled
 * rather than streamed — it is one small file, and a dead worker is not urgent
 * to the second.
 */
export function WorkerPill() {
  const [status, setStatus] = React.useState<Status | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const load = () =>
      api<Status>("/api/worker", { cache: "no-store" })
        .then((d) => !cancelled && setStatus(d))
        .catch(() => !cancelled && setStatus({ running: false }));
    load();
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!status) {
    return <div className="h-7 w-28 animate-shimmer rounded-full" aria-hidden />;
  }

  const busy = status.running && status.currentJobId;
  const label = !status.running ? "worker down" : busy ? "building" : "worker idle";

  const pill = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium",
        status.running
          ? busy
            ? "border-info/30 bg-info-dim text-info"
            : "border-line bg-overlay text-muted"
          : "border-err/30 bg-err-dim text-err",
      )}
    >
      {status.running ? (
        <CircleDot className={cn("size-3", busy && "animate-beacon")} />
      ) : (
        <CircleSlash className="size-3" />
      )}
      {label}
    </span>
  );

  if (busy) {
    return (
      <Tooltip label="A job is building right now. Open it.">
        <Link href={`/jobs/${status.currentJobId}`}>{pill}</Link>
      </Tooltip>
    );
  }

  return (
    <Tooltip
      label={
        status.running
          ? "The worker is running and waiting for jobs."
          : "No worker heartbeat. Queued jobs will not start until you run `npm run dev:worker`."
      }
    >
      <Link href="/health">{pill}</Link>
    </Tooltip>
  );
}
