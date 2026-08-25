"use client";

import { useEffect, useState } from "react";
import type { Interaction } from "@filmwright/engine/types";
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
    <div className="artifact">
      <button className="artifact-head" onClick={() => setOpen((v) => !v)}>
        <span className="chev">{open ? "▾" : "▸"}</span> {file}
      </button>
      {open && <pre className="artifact-body">{text ?? "Loading…"}</pre>}
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
      <div className="decision">
        <div className="decision-head">
          <span className="chip">review · {interaction.stage}</span>
          <span className="waiting">
            {parked ? "Parked — answer to continue" : "The run is paused here"}
          </span>
        </div>
        <p className="decision-q">{interaction.summary}</p>
        {interaction.artifact && (
          <Artifact jobId={jobId} file={interaction.artifact} />
        )}

        {interaction.stage === "pre-render" && (
          <Storyboard
            jobId={jobId}
            manifest={interaction.storyboard ?? null}
            // If the automatic capture failed, the gate must not be a dead end.
            allowCapture
            notes={frameNotes}
            onNote={(clipId, text) =>
              setFrameNotes((n) => ({ ...n, [clipId]: text }))
            }
          />
        )}

        <textarea
          className="notes"
          placeholder={
            interaction.stage === "pre-render"
              ? "Anything about the video as a whole (leave empty to approve)…"
              : "Changes you want (leave empty to approve as-is)…"
          }
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {error && <div className="err-box">{error}</div>}
        <div className="decision-actions">
          <button
            className="primary"
            disabled={busy}
            onClick={() => send({ decision: "approve", notes: notes || undefined })}
          >
            Approve &amp; render
          </button>
          <button
            className="ghost"
            disabled={busy || !compiled}
            onClick={() => send({ decision: "revise", notes: compiled })}
          >
            Request changes
            {perFrame.length > 0 && ` (${perFrame.length} frame${perFrame.length === 1 ? "" : "s"})`}
          </button>
        </div>
      </div>
    );
  }

  const ready = questions.every((_, i) => {
    const choice = choices[i];
    return choice && (choice !== OTHER || other[i]?.trim());
  });

  return (
    <div className="decision">
      <div className="decision-head">
        <span className="chip">needs your call</span>
        <span className="waiting">
          {parked ? "Parked — answer to continue" : "The run is paused here"}
        </span>
      </div>

      {questions.map((q, qi) => (
        <div key={qi} className="question">
          <div className="q-header">{q.header}</div>
          <p className="decision-q">{q.question}</p>
          <div className="options">
            {q.options.map((opt, oi) => (
              <label
                key={oi}
                className={`option ${choices[qi] === opt.label ? "picked" : ""}`}
                onMouseEnter={() =>
                  opt.preview && setPreview({ q: qi, option: oi })
                }
              >
                <input
                  type="radio"
                  name={`q${qi}`}
                  checked={choices[qi] === opt.label}
                  onChange={() =>
                    setChoices((c) => ({ ...c, [qi]: opt.label }))
                  }
                />
                <span>
                  <strong>{opt.label}</strong>
                  {opt.description && <em>{opt.description}</em>}
                </span>
              </label>
            ))}
            <label className={`option ${choices[qi] === OTHER ? "picked" : ""}`}>
              <input
                type="radio"
                name={`q${qi}`}
                checked={choices[qi] === OTHER}
                onChange={() => setChoices((c) => ({ ...c, [qi]: OTHER }))}
              />
              <span>
                <strong>Something else</strong>
                <input
                  type="text"
                  className="other"
                  placeholder="Tell it what you want instead…"
                  value={other[qi] ?? ""}
                  onFocus={() => setChoices((c) => ({ ...c, [qi]: OTHER }))}
                  onChange={(e) =>
                    setOther((o) => ({ ...o, [qi]: e.target.value }))
                  }
                />
              </span>
            </label>
          </div>

          {preview?.q === qi &&
            q.options[preview.option]?.preview && (
              <pre className="option-preview">
                {q.options[preview.option]!.preview}
              </pre>
            )}
        </div>
      ))}

      {error && <div className="err-box">{error}</div>}
      <div className="decision-actions">
        <button
          className="primary"
          disabled={busy || !ready}
          onClick={() =>
            send({
              answers: questions.map((_, i) =>
                choices[i] === OTHER ? other[i] : choices[i],
              ),
            })
          }
        >
          {busy ? "Sending…" : "Send answer"}
        </button>
      </div>
    </div>
  );
}
