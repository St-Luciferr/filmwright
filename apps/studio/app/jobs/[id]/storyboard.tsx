"use client";

import { useEffect, useState } from "react";
import type { StoryboardManifest } from "@filmwright/engine/types";

const fmt = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};

export type FrameNotes = Record<string, string>;

/**
 * The frame-by-frame view of a composition, captured as real stills from the
 * same runtime the renderer uses.
 *
 * Shown before the render gate so the frames can be corrected while a fix is
 * cheap — once it has rendered, the same feedback costs a whole re-render.
 */
export function Storyboard({
  jobId,
  manifest,
  notes,
  onNote,
  allowCapture = false,
}: {
  jobId: string;
  manifest: StoryboardManifest | null;
  /** Per-frame comments, keyed by clip id. Omit to render read-only. */
  notes?: FrameNotes;
  onNote?: (clipId: string, text: string) => void;
  allowCapture?: boolean;
}) {
  const [board, setBoard] = useState(manifest);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  // The live job feed hands us a new object every tick. Only adopt it when it
  // is genuinely newer, otherwise a poll would discard a capture just made here.
  useEffect(() => {
    if (!manifest) return;
    setBoard((current) =>
      !current || manifest.capturedAtMs > current.capturedAtMs ? manifest : current,
    );
  }, [manifest]);

  useEffect(() => {
    if (board || !allowCapture) return;
    fetch(`/api/jobs/${jobId}/storyboard`)
      .then((r) => r.json())
      .then((d) => {
        if (d.manifest) setBoard(d.manifest);
        setStale(Boolean(d.stale));
      })
      .catch(() => {});
    // Deliberately keyed on the job only: re-running on every `board` change
    // would refetch immediately after a capture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, allowCapture]);

  async function capture() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/storyboard`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not capture the frames.");
      setBoard(data.manifest);
      setStale(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const frames = board?.frames ?? [];

  return (
    <div className="storyboard">
      <div className="sb-bar">
        <h3>
          Frames{frames.length > 0 && <span className="count">{frames.length}</span>}
        </h3>
        {stale && !busy && <span className="sb-stale">composition changed since capture</span>}
        {allowCapture && (
          <button className="ghost" onClick={capture} disabled={busy}>
            {busy ? "Capturing…" : board ? "Re-capture" : "Capture frames"}
          </button>
        )}
      </div>

      {error && <div className="err-box">{error}</div>}

      {frames.length === 0 ? (
        <p className="sb-empty">
          {busy
            ? "Rendering a still for each frame — this takes a minute."
            : "No frame stills captured yet."}
        </p>
      ) : (
        <div className="sb-grid">
          {frames.map((f, i) => (
            <figure key={f.clipId} className="sb-frame">
              <button
                className="sb-shot"
                onClick={() => f.image && setZoom(f.image)}
                title="Enlarge"
              >
                {f.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/jobs/${jobId}/storyboard/image?file=${encodeURIComponent(f.image)}`}
                    alt={f.clipId}
                    loading="lazy"
                  />
                ) : (
                  <span className="sb-missing">no still</span>
                )}
                <span className="sb-num">{String(i + 1).padStart(2, "0")}</span>
              </button>
              <figcaption>
                <span className="sb-id">{f.clipId.replace(/^\d+-/, "")}</span>
                <span className="sb-time">
                  {fmt(f.start)} · {f.duration.toFixed(1)}s
                </span>
              </figcaption>
              {onNote && (
                <textarea
                  className="sb-note"
                  placeholder="Change this frame…"
                  value={notes?.[f.clipId] ?? ""}
                  onChange={(e) => onNote(f.clipId, e.target.value)}
                />
              )}
            </figure>
          ))}
        </div>
      )}

      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)} role="presentation">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/jobs/${jobId}/storyboard/image?file=${encodeURIComponent(zoom)}`}
            alt=""
          />
        </div>
      )}
    </div>
  );
}
