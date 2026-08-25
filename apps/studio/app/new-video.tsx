"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ASPECTS, WORKFLOWS } from "@videos/engine/types";

const WORKFLOW_LABELS: Record<string, string> = {
  "product-launch-video": "Product launch / promo",
  "faceless-explainer": "Faceless explainer",
  "motion-graphics": "Motion graphic",
  "music-to-video": "Music / beat-synced",
  "general-video": "General video",
  slideshow: "Slideshow / deck",
};

export function NewVideo() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const body = {
      prompt: form.get("prompt"),
      workflow: form.get("workflow"),
      aspect: form.get("aspect"),
      seconds: Number(form.get("seconds")),
      destination: form.get("destination"),
      language: form.get("language"),
      audience: form.get("audience"),
      sourceUrl: form.get("sourceUrl"),
      narration: form.get("narration") === "on",
      captions: form.get("captions") === "on",
      music: form.get("music") === "on",
      interactive: form.get("interactive") === "on",
    };

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to queue the job.");
      router.push(`/jobs/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      {error && <div className="err-box">{error}</div>}

      <label className="field">
        <span>Prompt</span>
        <textarea
          name="prompt"
          required
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A 25s TikTok promo for a MECEE-BL mock-test platform. Negative marking is a gremlin that bites a quarter mark off every guess — the app starves it. Fast, funny-anxious, then decisive."
        />
      </label>

      <div className="grid-3">
        <label className="field">
          <span>Workflow</span>
          <select name="workflow" defaultValue="product-launch-video">
            {WORKFLOWS.map((w) => (
              <option key={w} value={w}>
                {WORKFLOW_LABELS[w] ?? w}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Aspect</span>
          <select name="aspect" defaultValue="9:16">
            {Object.entries(ASPECTS).map(([key, v]) => (
              <option key={key} value={key}>
                {key} · {v.width}×{v.height}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Length (seconds)</span>
          <input
            type="number"
            name="seconds"
            min={5}
            max={180}
            defaultValue={25}
          />
        </label>
      </div>

      <div className="grid-3">
        <label className="field">
          <span>Destination</span>
          <input type="text" name="destination" defaultValue="tiktok" />
        </label>
        <label className="field">
          <span>Language</span>
          <input type="text" name="language" defaultValue="en" />
        </label>
        <label className="field">
          <span>Source URL (optional)</span>
          <input type="url" name="sourceUrl" placeholder="https://…" />
        </label>
      </div>

      <label className="field">
        <span>Audience (optional)</span>
        <input
          type="text"
          name="audience"
          placeholder="Nepali MBBS aspirants, 16–20, and their parents"
        />
      </label>

      <div className="toggles">
        <label>
          <input type="checkbox" name="narration" defaultChecked /> Voiceover
        </label>
        <label>
          <input type="checkbox" name="captions" defaultChecked /> Burned-in
          captions
        </label>
        <label>
          <input type="checkbox" name="music" defaultChecked /> Music bed
        </label>
      </div>

      <div className="toggles interactive-row">
        <label>
          <input type="checkbox" name="interactive" defaultChecked /> Involve me
          in decisions
        </label>
        <span className="hint">
          The run asks when a choice would change the video, and pauses for your
          sign-off after the script, after the storyboard, and before rendering.
        </span>
      </div>

      <button className="primary" type="submit" disabled={busy || !prompt.trim()}>
        {busy ? "Queueing…" : "Generate"}
      </button>
    </form>
  );
}
