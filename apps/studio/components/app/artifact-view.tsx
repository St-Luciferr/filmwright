"use client";

import * as React from "react";
import { MarkdownDocument } from "@/components/ui/markdown";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * One text artifact from a job's project directory.
 *
 * Markdown is rendered, because these are documents people are being asked to
 * read and sign off — a storyboard table shown as pipes and dashes is a
 * document nobody reviews properly. The source stays one click away: when a
 * frame is described wrongly, the exact text the agent wrote is what you want
 * to look at.
 */
export function ArtifactView({
  jobId,
  file,
  className,
}: {
  jobId: string;
  file: string;
  className?: string;
}) {
  const [text, setText] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [source, setSource] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    setText(null);
    setError(null);
    api<{ text?: string; error?: string }>(
      `/api/jobs/${jobId}/artifact?path=${encodeURIComponent(file)}`,
      { fallback: "That file is not available." },
    )
      .then((d) => {
        if (!live) return;
        if (typeof d.text === "string") setText(d.text);
        else setError(d.error ?? "That file is not available.");
      })
      .catch((err) => live && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
    };
  }, [jobId, file]);

  const markdown = /\.mdx?$/i.test(file);

  return (
    <div className={cn("min-w-0", className)}>
      {markdown && text !== null && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => setSource((v) => !v)}
            className="text-[12px] text-subtle transition-colors hover:text-fg"
          >
            {source ? "Show rendered" : "Show source"}
          </button>
        </div>
      )}

      {error ? (
        <p className="px-1 py-6 text-center text-[13px] text-err">{error}</p>
      ) : text === null ? (
        <p className="px-1 py-6 text-center text-[13px] text-subtle">Loading…</p>
      ) : markdown && !source ? (
        <MarkdownDocument text={text} />
      ) : (
        <pre className="overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-muted">
          {text}
        </pre>
      )}
    </div>
  );
}
