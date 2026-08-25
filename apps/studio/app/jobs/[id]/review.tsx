"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Clip, Job, RevisionNote } from "@filmwright/engine/types";

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

  return (
    <>
      <div className="stage">
        <video
          ref={videoRef}
          className="player"
          src={`/api/jobs/${job.id}/video`}
          controls
          playsInline
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        />

        {clips.length > 0 && duration > 0 && (
          <div className="ruler">
            {clips
              .filter((c) => c.src?.includes("compositions/frames/"))
              .map((c) => (
                <button
                  key={c.id}
                  className={`seg-clip ${here?.id === c.id ? "on" : ""}`}
                  style={{
                    left: `${(c.start / duration) * 100}%`,
                    width: `${(c.duration / duration) * 100}%`,
                  }}
                  title={`${c.id} — ${fmt(c.start)}`}
                  onClick={() => seek(c.start + 0.05)}
                >
                  <span>{c.id.replace(/^\d+-/, "")}</span>
                </button>
              ))}
            {notes
              .filter((n) => n.timeSec !== undefined)
              .map((n) => (
                <button
                  key={n.id}
                  className="pin"
                  style={{ left: `${((n.timeSec ?? 0) / duration) * 100}%` }}
                  title={n.text}
                  onClick={() => seek(n.timeSec ?? 0)}
                />
              ))}
          </div>
        )}
      </div>

      <div className="panel review">
        <h2 className="section" style={{ margin: "0 0 4px" }}>
          Suggest changes
        </h2>
        <p className="review-hint">
          Scrub to the moment you want changed, then describe it. Notes are
          pinned to the playhead and resolved to the frame on screen.
        </p>

        <form onSubmit={addNote}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              here
                ? `What should change at ${fmt(time)} (${here.id})?`
                : "What should change?"
            }
          />
          <div className="review-row">
            <label className="pin-toggle">
              <input
                type="checkbox"
                checked={pin}
                onChange={(e) => setPin(e.target.checked)}
              />
              Pin to <code>{fmt(time)}</code>
              {here && <span className="at-clip">{here.id}</span>}
            </label>
            <button className="ghost" disabled={busy || !text.trim()}>
              Add note
            </button>
          </div>
        </form>

        {error && <div className="err-box">{error}</div>}

        {notes.length > 0 && (
          <>
            <ul className="notes-list">
              {notes.map((n: RevisionNote) => (
                <li key={n.id}>
                  <button
                    className="ts"
                    onClick={() => n.timeSec !== undefined && seek(n.timeSec)}
                    disabled={n.timeSec === undefined}
                  >
                    {n.timeSec !== undefined ? fmt(n.timeSec) : "whole video"}
                  </button>
                  <span className="note-text">
                    {n.text}
                    {n.clipId && <em> · {n.clipId}</em>}
                  </span>
                  <button className="drop" onClick={() => drop(n.id)} title="Remove">
                    ×
                  </button>
                </li>
              ))}
            </ul>

            <button className="primary" disabled={busy} onClick={revise}>
              {busy
                ? "Queueing…"
                : `Apply ${notes.length} change${notes.length === 1 ? "" : "s"} → v${(job.version ?? 1) + 1}`}
            </button>
          </>
        )}
      </div>
    </>
  );
}

/** Every render this project has produced, newest last. */
export function Versions({ versions, current }: { versions: Job[]; current: string }) {
  if (versions.length < 2) return null;
  return (
    <div className="panel">
      <h2 className="section" style={{ margin: "0 0 10px" }}>
        Versions
      </h2>
      <ul className="versions">
        {versions.map((v) => (
          <li key={v.id} className={v.id === current ? "on" : ""}>
            <a href={`/jobs/${v.id}`}>
              <span className="vnum">v{v.version ?? 1}</span>
              <span className="vwhen">
                {new Date(v.createdAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {!!v.appliedNotes?.length && (
                <span className="vnotes">
                  {v.appliedNotes.length} change
                  {v.appliedNotes.length === 1 ? "" : "s"}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
