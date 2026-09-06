"use client";

import {
  ASPECTS,
  DEFAULT_PROVIDERS,
  KOKORO_VOICES,
  MEDIA_KINDS,
  PROVIDERS,
  WORKFLOWS,
  type MediaKind,
} from "@filmwright/engine/types";
import { AlertCircle, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { ErrorBox } from "@/components/ui/feedback";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { postJson } from "@/lib/api";

const WORKFLOW_LABELS: Record<string, string> = {
  "product-launch-video": "Product launch / promo",
  "faceless-explainer": "Faceless explainer",
  "motion-graphics": "Motion graphic",
  "music-to-video": "Music / beat-synced",
  "general-video": "General video",
  slideshow: "Slideshow / deck",
};

const MEDIA_LABELS: Record<MediaKind, string> = {
  voice: "Voiceover",
  music: "Music",
  image: "Imagery",
  video: "Footage",
};

function Section({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-line bg-overlay font-mono text-[11px] text-subtle">
            {step}
          </span>
          {title}
        </CardTitle>
        <p className="mt-1 pl-[30px] text-[12.5px] leading-relaxed text-subtle">
          {description}
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-1">{children}</CardContent>
    </Card>
  );
}

export function NewVideoForm({ maxBudgetUsd, interactiveDefault }: {
  maxBudgetUsd: number;
  interactiveDefault: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [prompt, setPrompt] = React.useState("");
  const [audience, setAudience] = React.useState("");
  const [sourceUrl, setSourceUrl] = React.useState("");
  const [workflow, setWorkflow] = React.useState<string>("product-launch-video");
  const [aspect, setAspect] = React.useState<string>("9:16");
  const [seconds, setSeconds] = React.useState(25);
  const [destination, setDestination] = React.useState("tiktok");
  const [language, setLanguage] = React.useState("en");
  const [narration, setNarration] = React.useState(true);
  const [captions, setCaptions] = React.useState(true);
  const [music, setMusic] = React.useState(true);
  const [interactive, setInteractive] = React.useState(interactiveDefault);
  const [providers, setProviders] = React.useState<Record<string, string>>({
    ...DEFAULT_PROVIDERS,
  });

  const urlInvalid = sourceUrl.trim() !== "" && !/^https?:\/\//i.test(sourceUrl.trim());
  const promptTooShort = prompt.trim().length > 0 && prompt.trim().length < 15;
  const canSubmit = prompt.trim().length >= 15 && !urlInvalid && !busy;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await postJson<{ id: string; slug: string }>(
        "/api/jobs",
        {
          prompt,
          workflow,
          aspect,
          seconds,
          destination,
          language,
          audience: audience || undefined,
          sourceUrl: sourceUrl || undefined,
          narration,
          captions,
          music,
          interactive,
          providers,
        },
        "Could not queue the job.",
      );
      toast.push("success", "Queued", `${data.slug} is waiting for the worker.`);
      router.push(`/jobs/${data.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.push("error", "Could not queue this video", message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        {error && <ErrorBox title="Could not queue this video">{error}</ErrorBox>}

        <Section
          step={1}
          title="Brief"
          description="The prompt is the whole creative input. A through-line, a tone and a constraint are the three things it can give that the fields below cannot."
        >
          <Field
            label="Prompt"
            required
            htmlFor="prompt"
            error={promptTooShort ? "Give it a little more to work with — at least 15 characters." : null}
            hint="Say what the video is about, how it should feel, and what it must achieve."
          >
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              invalid={promptTooShort}
              rows={5}
              placeholder="A 25s TikTok promo for a MECEE-BL mock-test platform. Negative marking is a gremlin that bites a quarter mark off every guess — the app starves it. Fast, funny-anxious, then decisive. Must stop a thumb in the first 0.6s and stay legible muted."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Audience"
              htmlFor="audience"
              hint="Optional, but high value — it changes the writing more than the workflow does."
            >
              <Input
                id="audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="Nepali MBBS aspirants, 16–20, and their parents"
              />
            </Field>
            <Field
              label="Source URL"
              htmlFor="sourceUrl"
              error={urlInvalid ? "Must start with http:// or https://" : null}
              hint="Optional. The workflow captures the site's own visuals and uses them."
            >
              <Input
                id="sourceUrl"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                invalid={urlInvalid}
                placeholder="https://…"
              />
            </Field>
          </div>
        </Section>

        <Section
          step={2}
          title="Format"
          description="Pick the workflow by what the video is, not by its subject."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Workflow">
              <Select value={workflow} onValueChange={setWorkflow}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WORKFLOWS.map((w) => (
                    <SelectItem key={w} value={w}>
                      {WORKFLOW_LABELS[w] ?? w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Aspect">
              <Select value={aspect} onValueChange={setAspect}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ASPECTS).map(([key, v]) => (
                    <SelectItem key={key} value={key}>
                      {key} · {v.width}×{v.height}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Length" hint="Seconds, 5–180.">
              <Input
                type="number"
                min={5}
                max={180}
                value={seconds}
                onChange={(e) => setSeconds(Number(e.target.value))}
              />
            </Field>
            <Field label="Destination" hint="Informs pacing and safe areas.">
              <Input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
            </Field>
            <Field label="Language" hint="Narration and captions.">
              <Input value={language} onChange={(e) => setLanguage(e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section
          step={3}
          title="Audio & captions"
          description="Which layers to build. Captions matter for feeds watched muted."
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <Checkbox
              label="Voiceover"
              description="Narration over the piece"
              checked={narration}
              onChange={(e) => setNarration(e.target.checked)}
            />
            <Checkbox
              label="Captions"
              description="Burned in, legible muted"
              checked={captions}
              onChange={(e) => setCaptions(e.target.checked)}
            />
            <Checkbox
              label="Music bed"
              description="Ducked under narration"
              checked={music}
              onChange={(e) => setMusic(e.target.checked)}
            />
          </div>
        </Section>

        <Section
          step={4}
          title="Media sources"
          description="Every option is free and needs no account. The run is told these are the only sources that exist, so it will not go looking for a paid one."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {MEDIA_KINDS.map((kind) => {
              const chosen =
                PROVIDERS[kind].find((p) => p.id === providers[kind]) ??
                PROVIDERS[kind][0];
              const disabled =
                (kind === "voice" && !narration) || (kind === "music" && !music);
              return (
                <Field
                  key={kind}
                  label={MEDIA_LABELS[kind]}
                  hint={
                    disabled
                      ? `Not used — ${kind === "voice" ? "voiceover" : "music"} is switched off above.`
                      : chosen.hint
                  }
                >
                  <Select
                    value={providers[kind]}
                    onValueChange={(v) =>
                      setProviders((prev) => ({ ...prev, [kind]: v }))
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROVIDERS[kind].map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              );
            })}
          </div>

          {narration && providers.voice === "kokoro" && (
            <Field label="Voice" hint="Used for the whole piece.">
              <Select
                value={providers.voiceId ?? "af_heart"}
                onValueChange={(v) => setProviders((p) => ({ ...p, voiceId: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KOKORO_VOICES.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </Section>

        <Section
          step={5}
          title="How it runs"
          description="Interactive runs pause for your sign-off; unattended runs decide everything themselves."
        >
          <Checkbox
            label="Involve me in decisions"
            description="Asks when a choice would change the video, and pauses after the script, after the storyboard, and before rendering."
            checked={interactive}
            onChange={(e) => setInteractive(e.target.checked)}
          />
        </Section>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0 text-[13px]">
            <SummaryRow label="Format">
              {seconds}s · {aspect} · {destination}
            </SummaryRow>
            <SummaryRow label="Workflow">
              {WORKFLOW_LABELS[workflow] ?? workflow}
            </SummaryRow>
            <SummaryRow label="Audio">
              {[narration && "voiceover", music && "music", captions && "captions"]
                .filter(Boolean)
                .join(" · ") || "silent"}
            </SummaryRow>
            <SummaryRow label="Voice">
              {narration
                ? providers.voice === "none"
                  ? "none"
                  : `${providers.voice} · ${providers.voiceId ?? "af_heart"}`
                : "—"}
            </SummaryRow>
            <SummaryRow label="Music">{music ? providers.music : "—"}</SummaryRow>
            <SummaryRow label="Imagery">{providers.image}</SummaryRow>
            <SummaryRow label="Footage">{providers.video}</SummaryRow>

            <div className="rounded-control border border-warn/25 bg-warn-dim/30 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-warn">
                <AlertCircle className="size-3.5" />
                Costs real money
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                A measured 25s narrated promo ran about <span className="tabular">$8–20</span>.
                This run is capped at <span className="tabular">${maxBudgetUsd}</span> and
                abandoned past it.
              </p>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={!canSubmit}
              loading={busy}
            >
              {!busy && <Sparkles />}
              {busy ? "Queueing…" : "Generate video"}
            </Button>
            <p className="text-center text-[12px] text-subtle">
              Media stays free — no paid credentials are used.
            </p>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-0">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-subtle">
        {label}
      </span>
      <span className="truncate text-right font-mono text-[12px] text-fg">{children}</span>
    </div>
  );
}
