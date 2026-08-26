import { listJobs, readWorkerStatus } from "@filmwright/engine";
import {
  ArrowRight,
  CircleDollarSign,
  Clock,
  Film,
  Plus,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { JobRow } from "@/components/app/job-row";
import { Sparkline, StatTile } from "@/components/app/stat-tile";
import { StatusBadge, activeStage, stageProgress } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Progress } from "@/components/ui/feedback";
import { duration, jobDuration, money } from "@/lib/format";
import { summarise } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Dashboard() {
  const [jobs, worker] = await Promise.all([listJobs(), readWorkerStatus()]);
  const stats = summarise(jobs);

  const live = jobs.filter((j) => j.status === "running" || j.status === "queued");
  const needsYou = jobs.filter((j) => j.status === "awaiting-input");
  const recent = jobs
    .filter((j) => !live.includes(j) && !needsYou.includes(j))
    .slice(0, 6);

  if (!jobs.length) {
    return (
      <EmptyState
        icon={Film}
        title="No videos yet"
        description="Describe what you want and the worker builds it end to end — script, storyboard, frames, voice, music, render."
        action={
          <Button asChild variant="primary">
            <Link href="/new">
              <Plus />
              Create your first video
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          label="Videos"
          icon={Film}
          value={stats.generated}
          sub={
            stats.total > stats.generated
              ? `+${stats.total - stats.generated} adopted example${
                  stats.total - stats.generated === 1 ? "" : "s"
                }`
              : "generated here"
          }
        />
        <StatTile
          label="Success rate"
          value={stats.successRate === null ? "—" : `${Math.round(stats.successRate)}%`}
          tone={
            stats.successRate === null
              ? "default"
              : stats.successRate >= 70
                ? "accent"
                : stats.successRate >= 40
                  ? "warn"
                  : "err"
          }
          sub={`${stats.succeeded} done · ${stats.failed} failed`}
          hint="Share of settled runs that succeeded. Cancelled runs are excluded — they are neither a success nor a failure."
        />
        <StatTile
          label="Total spend"
          icon={CircleDollarSign}
          value={money(stats.spendUsd)}
          sub={
            stats.spendByDay.length > 1 ? (
              <Sparkline points={stats.spendByDay.map((d) => d.usd)} />
            ) : (
              "across all runs"
            )
          }
          hint="Model spend reported by the Agent SDK, summed over every generated run."
        />
        <StatTile
          label="Median run"
          icon={Clock}
          value={duration(stats.medianDurationMs ?? undefined)}
          sub="successful runs"
          hint="Median rather than mean: one abandoned 90-minute run would otherwise dominate the average."
        />
      </section>

      {needsYou.length > 0 && (
        <Card className="border-warn/30 bg-warn-dim/25">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warn">
              <TriangleAlert className="size-4" />
              {needsYou.length} run{needsYou.length === 1 ? "" : "s"} waiting on you
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="-mx-1.5">
              {needsYou.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href="/library">
                  All videos
                  <ArrowRight />
                </Link>
              </Button>
            }
          >
            <CardTitle>Recent</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {recent.length ? (
              <div className="-mx-1.5">
                {recent.map((job) => (
                  <JobRow key={job.id} job={job} />
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-[13px] text-subtle">
                Nothing finished yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Now building</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {live.length ? (
              live.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="block rounded-control border border-line bg-inset p-3 transition-colors hover:border-line-strong"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[13px]">{job.slug}</span>
                    <StatusBadge status={job.status} />
                  </div>
                  <Progress
                    value={stageProgress(job)}
                    tone="info"
                    className="mt-3"
                  />
                  <div className="mt-2 flex items-center justify-between text-[12px] text-subtle">
                    <span className="truncate">{activeStage(job) ?? "starting…"}</span>
                    <span className="tabular shrink-0">
                      {money(job.costUsd)} · {duration(jobDuration(job))}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="py-6 text-center">
                <p className="text-[13px] text-subtle">
                  {worker.running
                    ? "The worker is idle."
                    : "The worker is not running."}
                </p>
                <Button asChild size="sm" variant="secondary" className="mt-3">
                  <Link href={worker.running ? "/new" : "/health"}>
                    {worker.running ? "Queue a video" : "Check health"}
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
