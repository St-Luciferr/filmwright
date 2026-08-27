"use client";

import type { Clip, Job, RevisionNote } from "@filmwright/engine/types";
import { Plus, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { ErrorBox } from "@/components/ui/feedback";
import { absolute } from "@/lib/format";
import { cn } from "@/lib/utils";

const fmt = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};

function clipAt(clips: Clip[], t: number): Clip | undefined {
  const live = clips.filter((c) => t >= c.start && t < c.start + c.duration);
  const frames = live.filter((c) => c.src?.includes("compositions/frames/"));
  const pool = frames.length ? frames : live;
  return pool.reduce<Clip | undefined>(
    (best, c) => (!best || c.start >= best.start ? c : best),
    undefined,
  );
}

/**
 * Feedback on a finished render.
 *
 * Notes are pinned to the playhead because that is how people actually talk
 * about video — "the logo at eight seconds", not "the third frame". The
 * timestamp is resolved to a frame server-side so the revision run gets an
 * instruction that points at one file.
 */
export function Review({
  job,
  onJob,
}: {
  job: Job;
  /**
   * Hand the updated job straight back to the page. The parent seeds its state
   * from a prop, so a router.refresh() alone would not reach it — React keeps
   * the state from first mount and the new note would never appear.
   */
  onJob: (job: Job) => void;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [text, setText] = useState("");
  const [pin, setPin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notes = job.notes ?? [];
  const here = clipAt(clips, time);

  useEffect(() => {
    fetch(`/api/jobs/${job.id}/timeline`)
      .then((r) => r.json())
      .then((d) => setClips(d.clips ?? []))
      .catch(() => {});
  }, [job.id]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          timeSec: pin ? time : undefined,
        }),
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error ?? "Could not add that.");
      onJob(updated as Job);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function drop(noteId: string) {
    const res = await fetch(`/api/jobs/${job.id}/notes?note=${noteId}`, {
      method: "DELETE",
    });
    if (res.ok) onJob((await res.json()) as Job);
  }

  async function revise() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/revise`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not queue the revision.");
      router.push(`/jobs/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    v.pause();
  };

  const frameClips = clips.filter((c) => c.src?.includes("compositions/frames/"));

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-card border border-line bg-inset">
        <video
          ref={videoRef}
          className="mx-auto block max-h-[62vh] w-full bg-black object-contain"
          src={`/api/jobs/${job.id}/video`}
          controls
          playsInline
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        />

        {frameClips.length > 0 && duration > 0 && (
          <div className="relative h-9 border-t border-line bg-raised">
            {frameClips.map((c) => (
              <button
                key={c.id}
                type="button"
                className={cn(
                  "absolute inset-y-1 overflow-hidden rounded-[4px] border px-1.5 text-left transition-colors",
                  here?.id === c.id
                    ? "border-accent/50 bg-accent-dim text-accent"
                    : "border-line bg-overlay text-subtle hover:border-line-strong hover:text-muted",
                )}
                style={{
                  left: `${(c.start / duration) * 100}%`,
                  width: `${(c.duration / duration) * 100}%`,
                }}
                title={`${c.id} — ${fmt(c.start)}`}
                onClick={() => seek(c.start + 0.05)}
              >
                <span className="block truncate font-mono text-[10px] leading-[26px]">
                  {c.id.replace(/^\d+-/, "")}
                </span>
              </button>
            ))}
            {notes
              .filter((n) => n.timeSec !== undefined)
              .map((n) => (
                <button
                  key={n.id}
                  type="button"
                  aria-label={`Note at ${fmt(n.timeSec ?? 0)}`}
                  className="absolute -top-0.5 size-2 -translate-x-1/2 rounded-full bg-warn ring-2 ring-base"
                  style={{ left: `${((n.timeSec ?? 0) / duration) * 100}%` }}
                  title={n.text}
                  onClick={() => seek(n.timeSec ?? 0)}
                />
              ))}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Suggest changes</CardTitle>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-subtle">
            Scrub to the moment you want changed, then describe it. Notes are pinned
            to the playhead and resolved to the frame on screen.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <form onSubmit={addNote} className="space-y-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-20"
              placeholder={
                here
                  ? `What should change at ${fmt(time)} (${here.id})?`
                  : "What should change?"
              }
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-muted">
                <input
                  type="checkbox"
                  checked={pin}
                  onChange={(e) => setPin(e.target.checked)}
                  className="size-3.5 accent-[var(--color-accent)]"
                />
                Pin to
                <code className="tabular rounded bg-overlay px-1.5 py-0.5 font-mono text-[11px] text-fg">
                  {fmt(time)}
                </code>
                {here && (
                  <span className="font-mono text-[11px] text-subtle">{here.id}</span>
                )}
              </label>
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                className="ml-auto"
                loading={busy}
                disabled={!text.trim()}
              >
                <Plus />
                Add note
              </Button>
            </div>
          </form>

          {error && <ErrorBox title="Could not do that">{error}</ErrorBox>}

          {notes.length > 0 && (
            <>
              <ul className="divide-y divide-line rounded-control border border-line bg-inset">
                {notes.map((n: RevisionNote) => (
                  <li key={n.id} className="flex items-start gap-2.5 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => n.timeSec !== undefined && seek(n.timeSec)}
                      disabled={n.timeSec === undefined}
                      className={cn(
                        "tabular shrink-0 rounded bg-overlay px-1.5 py-0.5 font-mono text-[11px]",
                        n.timeSec !== undefined
                          ? "text-accent hover:bg-accent-dim"
                          : "text-subtle",
                      )}
                    >
                      {n.timeSec !== undefined ? fmt(n.timeSec) : "whole video"}
                    </button>
                    <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-muted">
                      {n.text}
                      {n.clipId && (
                        <span className="ml-1.5 font-mono text-[11px] text-subtle">
                          · {n.clipId}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => drop(n.id)}
                      title="Remove note"
                      aria-label="Remove note"
                      className="shrink-0 rounded p-1 text-subtle transition-colors hover:bg-err-dim hover:text-err"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>

              <Button variant="primary" loading={busy} onClick={revise}>
                <Wand2 />
                Apply {notes.length} change{notes.length === 1 ? "" : "s"} as a new
                version
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Every render this project has produced, newest last. */
export function Versions({ versions, current }: { versions: Job[]; current: string }) {
  if (versions.length < 2) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Versions</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="space-y-1">
          {versions.map((v) => (
            <li key={v.id}>
              <Link
                href={`/jobs/${v.id}`}
                aria-current={v.id === current ? "page" : undefined}
                className={cn(
                  "flex items-baseline gap-2 rounded-control px-2.5 py-2 transition-colors",
                  v.id === current
                    ? "bg-overlay text-fg"
                    : "text-muted hover:bg-overlay/60 hover:text-fg",
                )}
              >
                <span className="shrink-0 font-mono text-[12px] text-accent">
                  v{v.version ?? 1}
                </span>
                <span className="text-[12px] text-subtle">{absolute(v.createdAt)}</span>
                {!!v.appliedNotes?.length && (
                  <span className="ml-auto shrink-0 text-[11px] text-subtle">
                    {v.appliedNotes.length} change
                    {v.appliedNotes.length === 1 ? "" : "s"}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
