"use client";

import { CheckCircle2, CircleAlert, RefreshCw, XCircle } from "lucide-react";
import * as React from "react";
import type { Check } from "@/app/api/health/route";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBox, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { relative } from "@/lib/format";
import { cn } from "@/lib/utils";

const GROUPS: { key: Check["group"]; title: string; description: string }[] = [
  {
    key: "worker",
    title: "Worker",
    description: "The half that actually builds videos. With this down, jobs queue forever.",
  },
  {
    key: "toolchain",
    title: "Toolchain",
    description: "Binaries every run shells out to.",
  },
  {
    key: "media",
    title: "Media providers",
    description: "All free — no account, key or subscription anywhere in this list.",
  },
];

const ICONS = {
  ok: { Icon: CheckCircle2, className: "text-accent" },
  warn: { Icon: CircleAlert, className: "text-warn" },
  fail: { Icon: XCircle, className: "text-err" },
};

export function HealthView() {
  const toast = useToast();
  const [checks, setChecks] = React.useState<Check[] | null>(null);
  const [checkedAt, setCheckedAt] = React.useState<string | undefined>();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(
    async (refresh = false) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/health${refresh ? "?refresh=1" : ""}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Health check failed (${res.status})`);
        const data = await res.json();
        setChecks(data.checks);
        setCheckedAt(data.checkedAt);
        if (refresh) {
          const bad = (data.checks as Check[]).filter((c) => c.level === "fail").length;
          toast.push(
            bad ? "error" : "success",
            bad ? `${bad} check${bad === 1 ? "" : "s"} failing` : "All checks passing",
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  const failing = checks?.filter((c) => c.level === "fail").length ?? 0;
  const degraded = checks?.filter((c) => c.level === "warn").length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted">
            {checks === null
              ? "Probing…"
              : failing
                ? `${failing} check${failing === 1 ? "" : "s"} failing${
                    degraded ? `, ${degraded} degraded` : ""
                  }.`
                : degraded
                  ? `Everything essential is up, ${degraded} degraded.`
                  : "Everything is up."}
          </p>
          {checkedAt && (
            <p className="text-[12px] text-subtle">Last checked {relative(checkedAt)}</p>
          )}
        </div>
        <Button variant="secondary" size="sm" loading={busy} onClick={() => load(true)}>
          {!busy && <RefreshCw />}
          Re-check
        </Button>
      </div>

      {error && <ErrorBox title="Could not run the health check">{error}</ErrorBox>}

      {GROUPS.map((group) => {
        const rows = checks?.filter((c) => c.group === group.key);
        return (
          <Card key={group.key}>
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
              <p className="mt-0.5 text-[12.5px] text-subtle">{group.description}</p>
            </CardHeader>
            <CardContent className="pt-0">
              {checks === null ? (
                <div className="space-y-2">
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                </div>
              ) : !rows?.length ? (
                <p className="py-2 text-[13px] text-subtle">No checks reported.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {rows.map((check) => {
                    const { Icon, className } = ICONS[check.level];
                    return (
                      <li key={check.name} className="flex items-start gap-3 py-2.5">
                        <Icon className={cn("mt-0.5 size-4 shrink-0", className)} />
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[13px] text-fg">{check.name}</p>
                          <p className="mt-0.5 break-words text-[12px] leading-relaxed text-subtle">
                            {check.detail}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}

      <p className="text-[12px] leading-relaxed text-subtle">
        The same probes run from the terminal with{" "}
        <code className="rounded bg-overlay px-1.5 py-0.5 font-mono text-[11px]">
          npm run doctor
        </code>
        . A missing local model is fixed with{" "}
        <code className="rounded bg-overlay px-1.5 py-0.5 font-mono text-[11px]">
          npm run setup
        </code>
        .
      </p>
    </div>
  );
}
