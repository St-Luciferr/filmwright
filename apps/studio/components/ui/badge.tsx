import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badge = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] " +
    "font-medium uppercase tracking-wide whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-line bg-overlay text-muted",
        accent: "border-accent/30 bg-accent-dim text-accent",
        info: "border-info/30 bg-info-dim text-info",
        warn: "border-warn/30 bg-warn-dim text-warn",
        err: "border-err/30 bg-err-dim text-err",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badge> & { pulse?: boolean };

export function Badge({ className, tone, pulse, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badge({ tone }), className)} {...props}>
      {pulse && (
        <i className="animate-beacon size-1.5 rounded-full bg-current" aria-hidden />
      )}
      {children}
    </span>
  );
}
