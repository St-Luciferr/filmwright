"use client";

import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "success" | "error" | "info";
type Toast = { id: number; tone: Tone; title: string; detail?: string };

const ToastContext = React.createContext<{
  push: (tone: Tone, title: string, detail?: string) => void;
} | null>(null);

/**
 * Confirmation for actions whose result is otherwise invisible.
 *
 * Cancelling a job, saving a note, re-running health — each changes something
 * on a server and, without this, gives back nothing but a button that stopped
 * looking busy.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback(
    (tone: Tone, title: string, detail?: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, tone, title, detail }]);
      // Errors stay until dismissed: they usually carry text worth reading,
      // and they tend to arrive while attention is somewhere else.
      if (tone !== "error") setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info };
const TONES = {
  success: "border-accent/30 bg-accent-dim/70 text-accent",
  error: "border-err/30 bg-err-dim/70 text-err",
  info: "border-info/30 bg-info-dim/70 text-info",
};

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = ICONS[toast.tone];
  return (
    <div
      className={cn(
        "animate-in pointer-events-auto flex items-start gap-2.5 rounded-card border " +
          "px-3.5 py-3 shadow-2xl shadow-black/60 backdrop-blur",
        TONES[toast.tone],
      )}
      role={toast.tone === "error" ? "alert" : "status"}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-fg">{toast.title}</p>
        {toast.detail && (
          <p className="mt-0.5 break-words text-[12px] leading-snug opacity-90">
            {toast.detail}
          </p>
        )}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
