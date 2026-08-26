import { DATA_DIR, PROJECTS_DIR, PROVIDERS, ROOT, config, listJobs } from "@filmwright/engine";
import type { Metadata } from "next";
import { Database, ExternalLink, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Settings" };

/**
 * Read-only by design.
 *
 * Configuration is environment-owned, and a queued job stores the settings it
 * was created with. A settings page that wrote to `.env` would silently change
 * the meaning of work already in the queue, so this shows what is in effect and
 * names the variable to change instead.
 */
function Row({
  label,
  value,
  env,
  note,
}: {
  label: string;
  value: React.ReactNode;
  env?: string;
  note?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line py-2.5 last:border-0">
      <div className="min-w-0">
        <p className="text-[13px] text-fg">{label}</p>
        {note && <p className="mt-0.5 text-[12px] leading-snug text-subtle">{note}</p>}
      </div>
      <div className="flex shrink-0 items-baseline gap-3">
        {env && <code className="font-mono text-[11px] text-subtle">{env}</code>}
        <span className="tabular font-mono text-[13px] text-fg">{value}</span>
      </div>
    </div>
  );
}

export default async function SettingsPage() {
  const jobs = await listJobs();
  const rel = (p: string) => p.replace(ROOT + "/", "");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Generation</CardTitle>
          <p className="mt-0.5 text-[12.5px] text-subtle">
            What the authoring session is given, and where it is cut off.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <Row label="Model" value={config.model} env="FILMWRIGHT_MODEL" />
          <Row label="Reasoning effort" value={config.effort} env="FILMWRIGHT_EFFORT" />
          <Row
            label="Budget ceiling"
            value={`$${config.maxBudgetUsd}`}
            env="FILMWRIGHT_MAX_BUDGET_USD"
            note="A run past this is abandoned — resumable, but not free."
          />
          <Row
            label="Timeout"
            value={`${Math.round(config.timeoutMs / 60000)}m`}
            env="FILMWRIGHT_TIMEOUT_MINUTES"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
          <p className="mt-0.5 text-[12.5px] text-subtle">
            Rendering and queue behaviour.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <Row label="Renderer" value={config.renderer} env="FILMWRIGHT_RENDERER" />
          <Row
            label="HyperFrames CLI"
            value={config.hyperframesVersion}
            env="FILMWRIGHT_HYPERFRAMES_VERSION"
            note="Pinned into every generated project so it re-renders identically later."
          />
          <Row
            label="Interactive by default"
            value={config.interactiveByDefault ? "yes" : "no"}
            env="FILMWRIGHT_INTERACTIVE"
          />
          <Row
            label="Answer grace"
            value={`${Math.round(config.answerGraceMs / 60000)}m`}
            env="FILMWRIGHT_ANSWER_GRACE_MINUTES"
            note="How long a blocking question waits before the run parks itself."
          />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader
          actions={
            <Badge tone="accent">
              <Lock className="size-3" />
              no credentials
            </Badge>
          }
        >
          <CardTitle>Media providers</CardTitle>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-subtle">
            The full catalog a run may draw from, chosen per job on the new-video
            form. Every entry is free at the point of use. Adding one that needs an
            API key would break the platform&apos;s one hard guarantee.
          </p>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-4 pt-0 sm:grid-cols-2">
          {(Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[]).map((kind) => (
            <div key={kind}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
                {kind}
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {PROVIDERS[kind].map((p) => (
                  <li key={p.id} className="flex items-baseline gap-2">
                    <code className="shrink-0 font-mono text-[12px] text-fg">{p.id}</code>
                    <span className="min-w-0 text-[12px] leading-snug text-subtle">
                      {p.label}
                      {p.network ? "" : " · offline"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader
          actions={
            <Badge>
              <Database className="size-3" />
              no database
            </Badge>
          }
        >
          <CardTitle>Where state lives</CardTitle>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-subtle">
            There is no database and no service to run. Every job is a directory
            of plain files, which is why setup is <code className="font-mono">npm install</code>{" "}
            and why debugging a run means reading a file
            (<span className="font-mono text-[11px]">ADR-0004</span>).
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <Row
            label="Job records"
            value={`${jobs.length} job${jobs.length === 1 ? "" : "s"}`}
            env={`${rel(DATA_DIR)}/jobs/<id>/`}
            note="job.json rewritten atomically · events.ndjson appended · answers, steering notes and the cancel flag alongside it."
          />
          <Row
            label="Generated projects"
            value="on disk"
            env={rel(PROJECTS_DIR)}
            note="Real HyperFrames projects — compositions, assets and renders. Deleting a job record does not touch these."
          />
          <Row
            label="Worker heartbeat"
            value="every poll"
            env={`${rel(DATA_DIR)}/worker.json`}
            note="Written while the worker runs, removed on clean shutdown."
          />
          <Row
            label="Concurrency"
            value="1 worker"
            note="claimNextJob is a read-then-write with no compare-and-swap, so two workers would race. Renders saturate the machine anyway."
          />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Changing any of this</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-[13px] leading-relaxed text-muted">
          <p>
            These values are read from the environment when the worker picks up a
            job, so a queued job keeps the settings it was created with. Edit{" "}
            <code className="rounded bg-overlay px-1.5 py-0.5 font-mono text-[11px]">
              .env
            </code>{" "}
            and restart the worker to change them.
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-subtle">
            <ExternalLink className="size-3.5" />
            Full reference: docs/reference/configuration.md
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
