"use client";

import type { StoryboardManifest } from "@filmwright/engine/types";
import { Camera, ImageOff, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBox } from "@/components/ui/feedback";
import { api, postJson } from "@/lib/api";

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
    api<{ manifest?: StoryboardManifest; stale?: boolean }>(
      `/api/jobs/${jobId}/storyboard`,
    )
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
      const data = await postJson<{ manifest: StoryboardManifest }>(
        `/api/jobs/${jobId}/storyboard`,
        undefined,
        "Could not capture the frames.",
      );
      setBoard(data.manifest);
      setStale(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const frames = board?.frames ?? [];
  const src = (file: string) =>
    `/api/jobs/${jobId}/storyboard/image?file=${encodeURIComponent(file)}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-semibold text-fg">
          Frames
          {frames.length > 0 && (
            <span className="tabular ml-1.5 font-normal text-subtle">
              {frames.length}
            </span>
          )}
        </h3>
        {stale && !busy && (
          <span className="rounded-full border border-warn/30 bg-warn-dim px-2 py-0.5 text-[11px] text-warn">
            composition changed since capture
          </span>
        )}
        {allowCapture && (
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={capture}
            loading={busy}
          >
            {!busy && <Camera />}
            {busy ? "Capturing…" : board ? "Re-capture" : "Capture frames"}
          </Button>
        )}
      </div>

      {error && <ErrorBox title="Could not capture the frames">{error}</ErrorBox>}

      {frames.length === 0 ? (
        <p className="rounded-control border border-dashed border-line px-4 py-8 text-center text-[13px] text-subtle">
          {busy
            ? "Rendering a still for each frame — this takes a minute."
            : "No frame stills captured yet."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {frames.map((f, i) => (
            <figure key={f.clipId} className="min-w-0">
              <button
                type="button"
                onClick={() => f.image && setZoom(f.image)}
                title="Enlarge"
                className="group relative block w-full overflow-hidden rounded-control border border-line bg-inset transition-colors hover:border-line-strong"
              >
                {f.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src(f.image)}
                    alt={`Frame ${i + 1}: ${f.clipId}`}
                    loading="lazy"
                    className="block w-full object-contain"
                  />
                ) : (
                  <span className="flex aspect-[9/16] items-center justify-center gap-1.5 text-[12px] text-subtle">
                    <ImageOff className="size-3.5" />
                    no still
                  </span>
                )}
                <span className="tabular absolute left-1.5 top-1.5 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-fg">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </button>
              <figcaption className="mt-1.5 flex items-baseline justify-between gap-2">
                <span className="truncate font-mono text-[11.5px] text-muted">
                  {f.clipId.replace(/^\d+-/, "")}
                </span>
                <span className="tabular shrink-0 font-mono text-[11px] text-subtle">
                  {fmt(f.start)} · {f.duration.toFixed(1)}s
                </span>
              </figcaption>
              {onNote && (
                <textarea
                  placeholder="Change this frame…"
                  value={notes?.[f.clipId] ?? ""}
                  onChange={(e) => onNote(f.clipId, e.target.value)}
                  aria-label={`Note for frame ${f.clipId}`}
                  className="mt-1.5 min-h-14 w-full resize-y rounded-[6px] border border-line bg-inset px-2 py-1.5 text-[12px] leading-snug placeholder:text-subtle focus:border-accent focus:outline-none"
                />
              )}
            </figure>
          ))}
        </div>
      )}

      {zoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
          onClick={() => setZoom(null)}
          role="presentation"
        >
          <button
            className="absolute right-4 top-4 rounded-control p-2 text-muted transition-colors hover:bg-overlay hover:text-fg"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src(zoom)}
            alt=""
            className="max-h-full max-w-full rounded-card object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
