import * as React from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

/**
 * One headline number.
 *
 * `hint` exists so a tile can be honest about what it excludes without
 * spending a line of the card on it — the success rate ignoring cancelled
 * runs, for instance, is the sort of thing that matters only when questioned.
 */
export function StatTile({
  label,
  value,
  sub,
  hint,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  hint?: string;
  tone?: "default" | "accent" | "warn" | "err";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const valueTone = {
    default: "text-fg",
    accent: "text-accent",
    warn: "text-warn",
    err: "text-err",
  }[tone];

  const body = (
    <div className="rounded-card border border-line bg-raised px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="size-3.5 text-subtle" />}
        <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
          {label}
        </p>
      </div>
      <p className={cn("tabular mt-2 text-2xl font-semibold leading-none", valueTone)}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[12px] text-subtle">{sub}</p>}
    </div>
  );

  return hint ? <Tooltip label={hint}>{body}</Tooltip> : body;
}

/**
 * A bare sparkline for the spend trend.
 *
 * Hand-drawn SVG rather than a chart library: one series, no axes, no
 * interaction. A dependency would be more code than this, not less.
 */
export function Sparkline({
  points,
  className,
}: {
  points: number[];
  className?: string;
}) {
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const w = 100;
  const h = 28;
  const step = w / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = i * step;
    const y = h - ((p - min) / span) * (h - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-7 w-full", className)}
      aria-hidden
    >
      <polyline
        points={`0,${h} ${coords.join(" ")} ${w},${h}`}
        fill="var(--color-accent-dim)"
        stroke="none"
        opacity="0.5"
      />
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
