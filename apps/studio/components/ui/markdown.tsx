"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Split the YAML-ish frontmatter the generated documents open with.
 *
 * BRIEF.md, SCRIPT.md and STORYBOARD.md all start with a `---` block of
 * format, duration, audience and so on. Rendered as markdown it becomes a
 * horizontal rule followed by a run-on line, so it is pulled out and shown as
 * what it is: the document's facts.
 */
export function splitFrontmatter(text: string): {
  meta: [string, string][];
  body: string;
} {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta: [], body: text };

  const meta: [string, string][] = [];
  for (const line of match[1]!.split("\n")) {
    const pair = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (pair) meta.push([pair[1]!, pair[2]!.replace(/^["']|["']$/g, "")]);
  }
  // A block we could not read stays in the body rather than vanishing.
  if (!meta.length) return { meta: [], body: text };
  return { meta, body: text.slice(match[0].length) };
}

/**
 * Prose styling for one generated document.
 *
 * Written out element by element rather than with a typography plugin, which
 * this app does not carry — and these documents use a narrow set: headings,
 * lists, tables, code and the occasional quote.
 *
 * Raw HTML is not enabled, so a document that contains markup shows it as text
 * instead of injecting it. These files are model-written; rendering their HTML
 * would make what the agent writes into something the studio executes.
 */
const COMPONENTS = {
  h1: (p: React.ComponentProps<"h1">) => (
    <h1 className="mb-2 mt-5 text-[15px] font-semibold text-fg first:mt-0" {...p} />
  ),
  h2: (p: React.ComponentProps<"h2">) => (
    <h2
      className="mb-2 mt-5 border-b border-line pb-1.5 text-[14px] font-semibold text-fg first:mt-0"
      {...p}
    />
  ),
  h3: (p: React.ComponentProps<"h3">) => (
    <h3 className="mb-1.5 mt-4 text-[13px] font-semibold text-fg first:mt-0" {...p} />
  ),
  h4: (p: React.ComponentProps<"h4">) => (
    <h4
      className="mb-1 mt-3 text-[12px] font-semibold uppercase tracking-wide text-subtle first:mt-0"
      {...p}
    />
  ),
  p: (p: React.ComponentProps<"p">) => (
    <p className="my-2 leading-relaxed text-muted" {...p} />
  ),
  ul: (p: React.ComponentProps<"ul">) => (
    <ul className="my-2 list-disc space-y-1 pl-5 text-muted marker:text-subtle" {...p} />
  ),
  ol: (p: React.ComponentProps<"ol">) => (
    <ol
      className="my-2 list-decimal space-y-1 pl-5 text-muted marker:text-subtle"
      {...p}
    />
  ),
  li: (p: React.ComponentProps<"li">) => <li className="leading-relaxed" {...p} />,
  strong: (p: React.ComponentProps<"strong">) => (
    <strong className="font-semibold text-fg" {...p} />
  ),
  em: (p: React.ComponentProps<"em">) => <em className="italic" {...p} />,
  a: ({ href, ...p }: React.ComponentProps<"a">) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-accent underline underline-offset-2 hover:no-underline"
      {...p}
    />
  ),
  blockquote: (p: React.ComponentProps<"blockquote">) => (
    <blockquote
      className="my-2 border-l-2 border-line-strong pl-3 text-subtle italic"
      {...p}
    />
  ),
  hr: () => <hr className="my-4 border-line" />,
  // A fenced block arrives as <pre><code class="language-…">; an inline span
  // arrives with no class. That is the only reliable difference in v10.
  pre: (p: React.ComponentProps<"pre">) => (
    <pre
      className="my-2.5 overflow-x-auto rounded-control border border-line bg-inset p-3 font-mono text-[12px] leading-relaxed text-muted"
      {...p}
    />
  ),
  code: ({ className, ...p }: React.ComponentProps<"code">) =>
    className?.includes("language-") ? (
      <code className={className} {...p} />
    ) : (
      <code
        className="rounded bg-overlay px-1.5 py-0.5 font-mono text-[11.5px] text-fg"
        {...p}
      />
    ),
  // Wide tables scroll inside themselves rather than stretching the card.
  table: (p: React.ComponentProps<"table">) => (
    <div className="my-3 overflow-x-auto rounded-control border border-line">
      <table className="w-full border-collapse text-[12.5px]" {...p} />
    </div>
  ),
  th: (p: React.ComponentProps<"th">) => (
    <th
      className="border-b border-line bg-inset px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-subtle"
      {...p}
    />
  ),
  td: (p: React.ComponentProps<"td">) => (
    <td className="border-b border-line px-3 py-2 align-top text-muted last:border-0" {...p} />
  ),
  img: ({ alt, ...p }: React.ComponentProps<"img">) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ""} className="my-2 max-w-full rounded-control" {...p} />
  ),
} as const;

export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("text-[13px] text-muted", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** The frontmatter block, as the facts it is. */
export function Frontmatter({ meta }: { meta: [string, string][] }) {
  if (!meta.length) return null;
  return (
    <dl className="mb-3 grid gap-x-4 gap-y-1.5 rounded-control border border-line bg-inset px-3 py-2.5 sm:grid-cols-[max-content_minmax(0,1fr)]">
      {meta.map(([key, value]) => (
        <React.Fragment key={key}>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
            {key}
          </dt>
          <dd className="text-[12.5px] leading-relaxed text-muted">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/** One generated document: its frontmatter, then its prose. */
export function MarkdownDocument({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const { meta, body } = React.useMemo(() => splitFrontmatter(text), [text]);
  return (
    <div className={className}>
      <Frontmatter meta={meta} />
      <Markdown>{body}</Markdown>
    </div>
  );
}
