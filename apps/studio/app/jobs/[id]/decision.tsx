"use client";

import type { Interaction } from "@filmwright/engine/types";
import { ChevronDown, ChevronRight, PauseCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { ErrorBox } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { Storyboard, type FrameNotes } from "./storyboard";

const OTHER = "__other__";

function Artifact({ jobId, file }: { jobId: string; file: string }) {
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    fetch(`/api/jobs/${jobId}/artifact?path=${encodeURIComponent(file)}`)
      .then((r) => r.json())
      .then((d) => setText(d.text ?? d.error ?? "(unavailable)"))
      .catch(() => setText("(unavailable)"));
  }, [jobId, file]);

  return (
    <div className="overflow-hidden rounded-control border border-line bg-inset">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left font-mono text-[12px] text-muted transition-colors hover:text-fg"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        {file}
      </button>
      {open && (
        <pre className="max-h-96 overflow-auto border-t border-line px-3 py-2.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-muted">
          {text ?? "Loading…"}
        </pre>
      )}
    </div>
  );
}

/** The banner every decision card shares: what is waiting, and why. */
function DecisionHead({ label, parked }: { label: string; parked: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-warn/25 bg-warn-dim/40 px-4 py-2.5">
      <Badge tone="warn">{label}</Badge>
      <span className="flex items-center gap-1.5 text-[12.5px] text-warn">
        <PauseCircle className="size-3.5" />
        {parked ? "Parked — answer to continue" : "The run is paused here"}
      </span>
    </div>
  );
}

/**
 * The blocking decision card. This is the whole point of interactive mode, so
 * it sits above everything else on the page and states plainly that the run is
 * waiting.
 */
export function Decision({
  jobId,
  interaction,
  parked,
}: {
  jobId: string;
  interaction: Interaction;
  parked: boolean;
}) {
  const questions = interaction.questions ?? [];
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [other, setOther] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState("");
  const [frameNotes, setFrameNotes] = useState<FrameNotes>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ q: number; option: number } | null>(null);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not send that.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const shell =
    "overflow-hidden rounded-card border border-warn/30 bg-raised shadow-lg shadow-black/30";

  if (interaction.kind === "checkpoint") {
    const perFrame = Object.entries(frameNotes).filter(([, v]) => v.trim());

    // One change list the agent can act on: per-frame comments first, since
    // they name the file to edit, then anything about the piece as a whole.
    const compiled = [
      ...perFrame.map(([clipId, text]) => `- frame \`${clipId}\` — ${text.trim()}`),
      notes.trim() ? `- overall — ${notes.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return (
      <div className={shell}>
        <DecisionHead label={`review · ${interaction.stage}`} parked={parked} />
        <div className="space-y-3 p-4">
          <p className="text-[14px] leading-relaxed text-fg">{interaction.summary}</p>

          {interaction.artifact && <Artifact jobId={jobId} file={interaction.artifact} />}

          {interaction.stage === "pre-render" && (
            <Storyboard
              jobId={jobId}
              manifest={interaction.storyboard ?? null}
              // If the automatic capture failed, the gate must not be a dead end.
              allowCapture
              notes={frameNotes}
              onNote={(clipId, text) => setFrameNotes((n) => ({ ...n, [clipId]: text }))}
            />
          )}

          <Textarea
            placeholder={
              interaction.stage === "pre-render"
                ? "Anything about the video as a whole (leave empty to approve)…"
                : "Changes you want (leave empty to approve as-is)…"
            }
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {error && <ErrorBox title="Could not send that">{error}</ErrorBox>}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              loading={busy}
              onClick={() => send({ decision: "approve", notes: notes || undefined })}
            >
              Approve &amp; continue
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !compiled}
              onClick={() => send({ decision: "revise", notes: compiled })}
            >
              Request changes
              {perFrame.length > 0 &&
                ` (${perFrame.length} frame${perFrame.length === 1 ? "" : "s"})`}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const ready = questions.every((_, i) => {
    const choice = choices[i];
    return choice && (choice !== OTHER || other[i]?.trim());
  });

  const optionClass = (picked: boolean) =>
    cn(
      "flex cursor-pointer gap-2.5 rounded-control border px-3 py-2.5 transition-colors",
      picked
        ? "border-accent/50 bg-accent-dim/40"
        : "border-line bg-inset hover:border-line-strong",
    );

  return (
    <div className={shell}>
      <DecisionHead label="needs your call" parked={parked} />
      <div className="space-y-5 p-4">
        {questions.map((q, qi) => (
          <div key={qi} className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
              {q.header}
            </p>
            <p className="text-[14px] leading-relaxed text-fg">{q.question}</p>

            <div className="space-y-1.5">
              {q.options.map((opt, oi) => (
                <label
                  key={oi}
                  className={optionClass(choices[qi] === opt.label)}
                  onMouseEnter={() => opt.preview && setPreview({ q: qi, option: oi })}
                >
                  <input
                    type="radio"
                    name={`q${qi}`}
                    className="mt-1 size-3.5 shrink-0 accent-[var(--color-accent)]"
                    checked={choices[qi] === opt.label}
                    onChange={() => setChoices((c) => ({ ...c, [qi]: opt.label }))}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-fg">
                      {opt.label}
                    </span>
                    {opt.description && (
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-subtle">
                        {opt.description}
                      </span>
                    )}
                  </span>
                </label>
              ))}

              <label className={optionClass(choices[qi] === OTHER)}>
                <input
                  type="radio"
                  name={`q${qi}`}
                  className="mt-1 size-3.5 shrink-0 accent-[var(--color-accent)]"
                  checked={choices[qi] === OTHER}
                  onChange={() => setChoices((c) => ({ ...c, [qi]: OTHER }))}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-fg">
                    Something else
                  </span>
                  <input
                    type="text"
                    placeholder="Tell it what you want instead…"
                    value={other[qi] ?? ""}
                    onFocus={() => setChoices((c) => ({ ...c, [qi]: OTHER }))}
                    onChange={(e) => setOther((o) => ({ ...o, [qi]: e.target.value }))}
                    className="mt-1.5 h-8 w-full rounded-[6px] border border-line bg-base px-2.5 text-[13px] placeholder:text-subtle focus:border-accent focus:outline-none"
                  />
                </span>
              </label>
            </div>

            {preview?.q === qi && q.options[preview.option]?.preview && (
              <pre className="max-h-72 overflow-auto rounded-control border border-line bg-inset p-3 font-mono text-[11.5px] leading-relaxed text-muted">
                {q.options[preview.option]!.preview}
              </pre>
            )}
          </div>
        ))}

        {error && <ErrorBox title="Could not send that">{error}</ErrorBox>}

        <Button
          variant="primary"
          loading={busy}
          disabled={!ready}
          onClick={() =>
            send({
              answers: questions.map((_, i) =>
                choices[i] === OTHER ? other[i] : choices[i],
              ),
            })
          }
        >
          Send answer
        </Button>
      </div>
    </div>
  );
}
