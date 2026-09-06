"use client";

import type { Job } from "@filmwright/engine/types";
import { Captions as CaptionsIcon, RotateCcw, Save, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { ErrorBox } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, postJson } from "@/lib/api";
import { cn } from "@/lib/utils";

type Cue = { id: string; start: number; end: number; text: string };

const stamp = (seconds: number) => {
  // Round first: 59.95 formats as "60.0", which belongs to the next minute.
  const tenths = Math.round(seconds * 10);
  const m = Math.floor(tenths / 600);
  const s = (tenths - m * 600) / 10;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};

/**
 * Edit the captions burned into the video.
 *
 * Two things this deliberately does not do, both stated on screen rather than
 * left to be discovered: it does not change the voiceover — the narration still
 * says what it said, which is what makes this the right tool for a misheard
 * brand name and the wrong one for a rewrite — and it does not change the mp4
 * until the project is rendered again, because captions are burned in.
 */
export function Captions({ job }: { job: Job }) {
  const router = useRouter();
  const toast = useToast();

  const [cues, setCues] = React.useState<Cue[] | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [editable, setEditable] = React.useState(true);
  const [reason, setReason] = React.useState<string | undefined>();
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [rendering, setRendering] = React.useState(false);
  const [saved, setSaved] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    api<{ cues?: Cue[]; editable?: boolean; reason?: string }>(
      `/api/jobs/${job.id}/captions`,
    )
      .then((d) => {
        if (!live) return;
        setCues(d.cues ?? []);
        setEditable(Boolean(d.editable));
        setReason(d.reason);
      })
      .catch((err) => live && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
    };
  }, [job.id]);

  const edits = React.useMemo(
    () =>
      (cues ?? [])
        .filter((c) => drafts[c.id] !== undefined && drafts[c.id]!.trim() !== c.text)
        .map((c) => ({ id: c.id, text: drafts[c.id]!.trim() })),
    [cues, drafts],
  );

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const data = await api<{ cues?: Cue[]; updated?: number }>(
        `/api/jobs/${job.id}/captions`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ edits }),
          fallback: "Could not save the captions.",
        },
      );
      setCues(data.cues ?? []);
      setDrafts({});
      setSaved(data.updated ?? 0);
      // Zero means the text on disk already matched — someone else saved the
      // same edit, or a run rewrote the captions. Saying "saved" would be a lie
      // and offering a re-render would be pointless.
      if (data.updated) {
        toast.push(
          "success",
          `${data.updated} caption${data.updated === 1 ? "" : "s"} saved`,
          "Re-render to see them in the video.",
        );
      } else {
        toast.push(
          "info",
          "Nothing to save",
          "These captions already read that way on disk.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function rerender() {
    setRendering(true);
    setError(null);
    try {
      const data = await postJson<Job>(
        `/api/jobs/${job.id}/render`,
        { reason: "caption edit" },
        "Could not queue a render.",
      );
      toast.push(
        "success",
        "Re-rendering",
        "No authoring session — this one only renders, and costs nothing.",
      );
      router.push(`/jobs/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRendering(false);
    }
  }

  if (error && cues === null) return <ErrorBox>{error}</ErrorBox>;
  if (cues === null) {
    return <p className="py-8 text-center text-[13px] text-subtle">Loading captions…</p>;
  }

  if (!cues.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <CaptionsIcon className="size-5 text-subtle" />
        <p className="text-[13px] text-fg">No captions in this project</p>
        <p className="max-w-sm text-[12.5px] leading-relaxed text-subtle">
          {reason ??
            "Captions are generated from the voiceover, so a run without narration has none."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="max-w-lg text-[12.5px] leading-relaxed text-subtle">
          Editing the text here does not change the voiceover — the narration still
          says what it said. Captions are burned into the video, so the mp4 keeps
          showing the old text until it is rendered again.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {edits.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setDrafts({})}>
              <Undo2 />
              Discard
            </Button>
          )}
          <Button
            size="sm"
            variant={edits.length ? "primary" : "secondary"}
            loading={saving}
            disabled={!edits.length || !editable}
            onClick={() => void save()}
          >
            {!saving && <Save />}
            Save {edits.length ? `${edits.length} change${edits.length === 1 ? "" : "s"}` : ""}
          </Button>
        </div>
      </div>

      {!editable && reason && (
        <p className="rounded-control border border-warn/25 bg-warn-dim/40 px-3 py-2 text-[12.5px] text-warn">
          {reason}
        </p>
      )}

      {saved > 0 && !edits.length && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-accent/25 bg-accent-dim/40 px-3 py-2.5">
          <p className="text-[12.5px] text-accent">
            {saved} caption{saved === 1 ? "" : "s"} saved to the composition. The video
            still shows the old text.
          </p>
          <Button size="sm" variant="primary" loading={rendering} onClick={() => void rerender()}>
            {!rendering && <RotateCcw />}
            Re-render the video
          </Button>
        </div>
      )}

      {error && <ErrorBox title="Could not save">{error}</ErrorBox>}

      <ol className="space-y-1.5">
        {cues.map((cue) => {
          const draft = drafts[cue.id] ?? cue.text;
          const changed = draft.trim() !== cue.text;
          return (
            <li
              key={cue.id}
              className={cn(
                "flex items-start gap-3 rounded-control border px-3 py-2 transition-colors",
                changed ? "border-accent/40 bg-accent-dim/25" : "border-line bg-inset",
              )}
            >
              <span
                className="tabular mt-1.5 shrink-0 font-mono text-[11px] text-subtle"
                title={`${stamp(cue.start)} – ${stamp(cue.end)}`}
              >
                {stamp(cue.start)}
              </span>
              <Textarea
                value={draft}
                rows={1}
                disabled={!editable}
                aria-label={`Caption at ${stamp(cue.start)}`}
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [cue.id]: e.target.value }))
                }
                className="min-h-0 resize-y py-1.5 text-[13px]"
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
