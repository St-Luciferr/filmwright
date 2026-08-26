import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The wrapper owns horizontal scrolling.
 *
 * Without it a wide table pushes the whole page sideways, which on a dashboard
 * means the sidebar and every other panel move too.
 */
export function TableWrap({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("w-full overflow-x-auto rounded-card border border-line", className)}
      {...props}
    />
  );
}

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <table
      className={cn("w-full border-collapse text-left text-sm", className)}
      {...props}
    />
  );
}

export function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      className={cn("bg-overlay/60 [&_th]:border-b [&_th]:border-line", className)}
      {...props}
    />
  );
}

export function TH({
  className,
  align,
  ...props
}: React.ComponentProps<"th"> & { align?: "left" | "right" }) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-subtle",
        align === "right" && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      className={cn(
        "[&_tr]:border-b [&_tr]:border-line [&_tr:last-child]:border-0",
        className,
      )}
      {...props}
    />
  );
}

export function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr className={cn("transition-colors hover:bg-overlay/40", className)} {...props} />
  );
}

export function TD({
  className,
  align,
  ...props
}: React.ComponentProps<"td"> & { align?: "left" | "right" }) {
  return (
    <td
      className={cn("px-4 py-3 align-middle", align === "right" && "text-right", className)}
      {...props}
    />
  );
}
