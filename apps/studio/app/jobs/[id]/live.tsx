"use client";

import type { Job, JobEvent } from "@filmwright/engine/types";
import {
  ArrowLeft,
  Check,
  Circle,
  Download,
  Loader2,
  MoreHorizontal,
  Square,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArtifactView } from "@/components/app/artifact-view";
import { RunStopped } from "@/components/app/retry";
import { StatusBadge, stageProgress } from "@/components/app/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/feedback";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { api, postJson } from "@/lib/api";
import { duration, jobDuration, money, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Activity } from "./activity";
import { Captions } from "./captions";
import { Decision } from "./decision";
import { Review, Versions } from "./review";
import { Storyboard } from "./storyboard";

const LIVE = new Set(["running", "queued"]);

/** The documents a run generates, in the order it writes them. */
const DOCUMENTS = ["BRIEF.md", "SCRIPT.md", "STORYBOARD.md"];

export function JobLive({
  initial,
  versions,
  captionCount,
}: {
  initial: Job;
  versions: Job[];
  /** Cues found in the project directory, so the tab only appears when there are some. */
  captionCount: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [job, setJob] = useState(initial);

  // A server re-render (navigation, router.refresh) delivers a fresh record;
  // without this the state seeded at mount would silently win.
  useEffect(() => {
    setJob(initial);
  }, [initial]);

  const [events, setEvents] = useState<JobEvent[]>([]);
  const [cancelling, setCancelling] = useState(false);
  const isLive = LIVE.has(job.status);
  const parked = job.status === "awaiting-input";
  const stopped = job.status === "failed" || job.status === "cancelled";
  // Queued, running and parked runs all still belong to the worker; deleting
  // one out from under it is what `deleteJob` refuses.
  const held = isLive || parked;

  useEffect(() => {
    // Poll while live or parked: a parked job becomes live again the moment the
    // answer re-queues it, and the page should follow that without a reload.
    if (!isLive && !parked) {
      api<{ job?: Job; events?: JobEvent[] }>(
        `/api/jobs/${initial.id}/events?once=1`,
      )
        .then((d) => {
          setEvents(d.events ?? []);
          if (d.job) setJob(d.job);
        })
        .catch(() => {});
      return;
    }

    const source = new EventSource(`/api/jobs/${initial.id}/events`);
    source.onmessage = (message) => {
      const payload = JSON.parse(message.data) as { job?: Job; events?: JobEvent[] };
      if (payload.job) setJob(payload.job);
      if (payload.events?.length) {
        setEvents((prev) => [...prev, ...payload.events!]);
      }
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [initial.id, isLive, parked]);

  async function cancel() {
    setCancelling(true);
    try {
      await postJson(
        `/api/jobs/${job.id}/cancel`,
        undefined,
        "The studio would not cancel this run.",
      );
      toast.push("info", "Cancelling", "The run stops after its current step.");
    } catch (err) {
      toast.push("error", "Could not cancel", err instanceof Error ? err.message : String(err));
    } finally {
      setCancelling(false);
    }
  }

  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  async function remove() {
    setDeleting(true);
    try {
      await api(`/api/jobs/${job.id}`, {
        method: "DELETE",
        fallback: "Could not delete this run.",
      });
      toast.push("success", "Run deleted", "The project's files were left on disk.");
      setConfirmDelete(false);
      router.push("/library");
      router.refresh();
    } catch (err) {
      toast.push(
        "error",
        "Could not delete",
        err instanceof Error ? err.message : String(err),
      );
      setDeleting(false);
    }
  }

  const finished = job.status === "succeeded" || job.status === "imported";
  const framesDone = job.stages.some((s) => s.stage === "frames" && s.status === "done");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back to library">
          <Link href="/library">
            <ArrowLeft />
          </Link>
        </Button>
        <h2 className="truncate font-mono text-[15px] font-medium">{job.slug}</h2>
        <StatusBadge status={job.status} />
        {(job.version ?? 1) > 1 && <Badge>v{job.version}</Badge>}
        {job.interactive && <Badge tone="info">interactive</Badge>}

        <div className="ml-auto flex items-center gap-2">
          {held && (
            <Button variant="danger" size="sm" loading={cancelling} onClick={cancel}>
              {!cancelling && <Square />}
              {parked ? "Abandon run" : "Cancel run"}
            </Button>
          )}
          {job.videoPath && (
            <Button asChild variant="secondary" size="sm">
              <a href={`/api/jobs/${job.id}/video?download=1`}>
                <Download />
                Download
              </a>
            </Button>
          )}
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent>
              {DOCUMENTS.map((file) => (
                <MenuItem
                  key={file}
                  onSelect={(e) => {
                    e.preventDefault();
                    setViewing(file);
                  }}
                >
                  View {file}
                </MenuItem>
              ))}
              <MenuItem
                onSelect={() => {
                  void navigator.clipboard?.writeText(job.projectDir);
                  toast.push("success", "Copied", job.projectDir);
                }}
              >
                Copy project path
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                danger
                disabled={held}
                onSelect={(e) => {
                  e.preventDefault();
                  setConfirmDelete(true);
                }}
              >
                <Trash2 />
                {held ? "Cancel before deleting" : "Delete this run…"}
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent
          title={viewing ?? ""}
          description={job.projectDir}
          className="max-w-3xl"
        >
          <div className="max-h-[70vh] overflow-auto px-5 py-4">
            {viewing && <ArtifactView jobId={job.id} file={viewing} />}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogTrigger asChild>
          <span className="hidden" />
        </DialogTrigger>
        <DialogContent
          title={`Delete v${job.version ?? 1} of ${job.slug}?`}
          description="Removes this run's record and its activity log."
        >
          <div className="space-y-3 p-5">
            <p className="text-[13px] leading-relaxed text-muted">
              The project&apos;s files stay in{" "}
              <code className="rounded bg-overlay px-1.5 py-0.5 font-mono text-[11px]">
                {job.projectDir}
              </code>
              , so other versions keep working. To remove the files as well,
              delete the whole project from the library.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button variant="danger" loading={deleting} onClick={remove}>
                Delete run
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {isLive && (
        <Progress value={stageProgress(job)} tone="info" />
      )}

      {/* Only while something can still act on the answer. A settled run keeps
          its question in the record, and rendering it would offer a form whose
          submit does nothing. */}
      {job.pending && (isLive || parked) && (
        <Decision jobId={job.id} interaction={job.pending} parked={parked} />
      )}

      {stopped && <RunStopped job={job} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Tabs defaultValue={finished && job.videoPath ? "preview" : "activity"}>
            <TabsList className="mb-3">
              {job.videoPath && <TabsTrigger value="preview">Preview</TabsTrigger>}
              {framesDone && <TabsTrigger value="frames">Frames</TabsTrigger>}
              {captionCount > 0 && (
                <TabsTrigger value="captions">Captions</TabsTrigger>
              )}
              <TabsTrigger value="activity">
                Activity
                {isLive && <Loader2 className="animate-spin" />}
              </TabsTrigger>
            </TabsList>

            {job.videoPath && (
              <TabsContent value="preview">
                {finished ? (
                  <Review job={job} onJob={setJob} />
                ) : (
                  <video
                    className="w-full rounded-card border border-line bg-black"
                    src={`/api/jobs/${job.id}/video`}
                    controls
                    playsInline
                  />
                )}
              </TabsContent>
            )}

            {framesDone && (
              <TabsContent value="frames">
                <Card>
                  <CardContent className="pt-5">
                    <Storyboard jobId={job.id} manifest={null} allowCapture />
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {captionCount > 0 && (
              <TabsContent value="captions">
                <Card>
                  <CardContent className="pt-5">
                    <Captions job={job} />
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            <TabsContent value="activity">
              <Card>
                <CardContent className="pt-5">
                  <div className="h-[min(70vh,640px)]">
                    <Activity
                      jobId={job.id}
                      events={events}
                      live={isLive}
                      canSteer={job.status === "running"}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ol className="space-y-0.5">
                {job.stages.map((s) => (
                  <li
                    key={s.stage}
                    className={cn(
                      "flex items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-[13px]",
                      s.status === "active" && "bg-overlay",
                    )}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      {s.status === "done" ? (
                        <Check className="size-3.5 text-accent" />
                      ) : s.status === "active" ? (
                        <Loader2 className="size-3.5 animate-spin text-info" />
                      ) : (
                        <Circle className="size-2 text-subtle" />
                      )}
                    </span>
                    <span
                      className={cn(
                        "shrink-0",
                        s.status === "pending" ? "text-subtle" : "text-fg",
                      )}
                    >
                      {s.stage}
                    </span>
                    {s.detail && (
                      // The render stage's detail is a full filename. It must
                      // give way rather than push the stage name out of the row.
                      <span
                        className="tabular ml-auto min-w-0 truncate font-mono text-[11px] text-subtle"
                        title={s.detail}
                      >
                        {s.detail}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Spec</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Spec label="workflow">{job.spec.workflow}</Spec>
              <Spec label="format">
                {job.spec.seconds}s · {job.spec.aspect}
              </Spec>
              <Spec label="destination">{job.spec.destination}</Spec>
              <Spec label="audio">
                {[
                  job.spec.narration && "vo",
                  job.spec.music && "bgm",
                  job.spec.captions && "captions",
                ]
                  .filter(Boolean)
                  .join(" · ") || "none"}
              </Spec>
              {job.spec.providers && (
                <>
                  <Spec label="voice">
                    {job.spec.providers.voice}
                    {job.spec.providers.voiceId ? ` · ${job.spec.providers.voiceId}` : ""}
                  </Spec>
                  <Spec label="music">{job.spec.providers.music}</Spec>
                  <Spec label="imagery">{job.spec.providers.image}</Spec>
                  <Spec label="footage">{job.spec.providers.video}</Spec>
                </>
              )}
              <Spec label="cost">{money(job.costUsd)}</Spec>
              <Spec label="run time">{duration(jobDuration(job))}</Spec>
              {job.numTurns !== undefined && <Spec label="turns">{job.numTurns}</Spec>}
              <Spec label="started">{relative(job.startedAt ?? job.createdAt)}</Spec>
              <Spec label="project">{job.projectDir}</Spec>
            </CardContent>
          </Card>

          <Versions versions={versions} current={job.id} />

          {!!job.answered?.length && (
            <Card>
              <CardHeader>
                <CardTitle>Decisions</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-2.5">
                  {job.answered.map(({ interaction, answer }, i) => (
                    <li key={i} className="text-[12.5px]">
                      <p className="text-subtle">
                        {interaction.kind === "question"
                          ? interaction.questions?.[0]?.header
                          : `${interaction.stage} review`}
                      </p>
                      <p className="mt-0.5 text-fg">
                        {interaction.kind === "question"
                          ? answer.answers?.[0]
                          : answer.decision === "revise"
                            ? "changes requested"
                            : "approved"}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function Spec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-0">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-subtle">
        {label}
      </span>
      <span className="tabular truncate text-right font-mono text-[12px] text-fg">
        {children}
      </span>
    </div>
  );
}
