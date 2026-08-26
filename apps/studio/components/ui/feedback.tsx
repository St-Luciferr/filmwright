import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-shimmer rounded-control bg-raised", className)}
      aria-hidden
      {...props}
    />
  );
}

/**
 * The state a collection shows when it is legitimately empty.
 *
 * Distinct from an error and from loading — conflating the three is what makes
 * an app feel broken when it is merely new.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-dashed " +
          "border-line px-6 py-14 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="mb-3 flex size-10 items-center justify-center rounded-full border border-line bg-overlay">
          <Icon className="size-4 text-subtle" />
        </div>
      )}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-subtle">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({
  title = "Something went wrong",
  children,
  className,
}: {
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-card border border-err/30 bg-err-dim/50 px-4 py-3 text-[13px] text-err",
        className,
      )}
    >
      <p className="font-medium">{title}</p>
      {children && (
        <div className="mt-1 break-words font-mono text-[12px] leading-relaxed text-err/85">
          {children}
        </div>
      )}
    </div>
  );
}

/** A determinate bar. Pass `value` 0-100. */
export function Progress({
  value,
  className,
  tone = "accent",
}: {
  value: number;
  className?: string;
  tone?: "accent" | "info" | "warn";
}) {
  const pct = Math.max(0, Math.min(100, value));
  const bar = { accent: "bg-accent", info: "bg-info", warn: "bg-warn" }[tone];
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-overlay", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", bar)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
