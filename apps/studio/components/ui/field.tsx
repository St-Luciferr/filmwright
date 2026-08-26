import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("block text-[13px] font-medium text-fg", className)}
      {...props}
    />
  );
}

/**
 * A labelled control with optional help and error text.
 *
 * The error replaces the hint rather than stacking below it: two lines of
 * competing guidance under one input is how forms start feeling noisy.
 */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  required,
  className,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  htmlFor?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-1 text-err">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-[12px] text-err">{error}</p>
      ) : hint ? (
        <p className="text-[12px] leading-relaxed text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

const control =
  "w-full rounded-control border bg-inset px-3 text-sm text-fg placeholder:text-subtle " +
  "transition-colors duration-150 hover:border-line-strong " +
  "focus:border-accent focus:outline-none disabled:opacity-50";

export function Input({
  className,
  invalid,
  ...props
}: React.ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      className={cn(control, "h-9", invalid ? "border-err" : "border-line", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function Textarea({
  className,
  invalid,
  ...props
}: React.ComponentProps<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea
      className={cn(
        control,
        "min-h-28 resize-y py-2.5 leading-relaxed",
        invalid ? "border-err" : "border-line",
        className,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

/** A checkbox with its label, sized for a row of toggles. */
export function Checkbox({
  label,
  description,
  className,
  ...props
}: React.ComponentProps<"input"> & { label: string; description?: string }) {
  const id = React.useId();
  return (
    <label
      htmlFor={props.id ?? id}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-control border border-line " +
          "bg-inset px-3 py-2.5 transition-colors hover:border-line-strong",
        className,
      )}
    >
      <input
        id={props.id ?? id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-fg">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[12px] leading-snug text-subtle">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
