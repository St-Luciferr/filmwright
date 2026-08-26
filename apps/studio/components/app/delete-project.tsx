"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import type { Project } from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/field";
import { ErrorBox } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { money } from "@/lib/format";

/**
 * Deleting a project is two different intentions behind one button, so the
 * dialog makes the reader pick rather than guessing for them: dropping the
 * records tidies the library, while removing the files destroys compositions,
 * captured assets and renders — which for an adopted example is hand-authored
 * work this platform never produced and cannot regenerate.
 */
export function DeleteProjectDialog({
  project,
  onDeleted,
  trigger,
}: {
  project: Project;
  onDeleted?: () => void;
  /** Defaults to a plain danger button; pass a menu item or icon button instead. */
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [removeFiles, setRemoveFiles] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const live = project.versions.find((j) =>
    ["queued", "running", "awaiting-input"].includes(j.status),
  );
  const isExample = project.versions.every((j) => j.status === "imported");

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects?dir=${encodeURIComponent(project.dir)}${removeFiles ? "&files=1" : ""}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not delete this project.");
      toast.push(
        "success",
        `Deleted ${project.slug}`,
        removeFiles
          ? `${data.jobs} run${data.jobs === 1 ? "" : "s"} and the project files`
          : `${data.jobs} run${data.jobs === 1 ? "" : "s"} — files kept on disk`,
      );
      setOpen(false);
      onDeleted?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="danger" size="sm">
            <Trash2 />
            Delete
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={`Delete ${project.slug}?`}
        description={
          project.versions.length === 1
            ? "This removes one run."
            : `This removes all ${project.versions.length} runs of this project.`
        }
      >
        <div className="space-y-3 p-5">
          {live ? (
            <ErrorBox title={`A run is ${live.status}`}>
              Cancel it before deleting this project.
            </ErrorBox>
          ) : (
            <>
              <dl className="rounded-control border border-line bg-inset px-3 py-2.5 text-[12.5px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-subtle">Runs</dt>
                  <dd className="tabular font-mono">{project.versions.length}</dd>
                </div>
                <div className="mt-1 flex justify-between gap-3">
                  <dt className="text-subtle">Renders</dt>
                  <dd className="tabular font-mono">{project.renderCount}</dd>
                </div>
                <div className="mt-1 flex justify-between gap-3">
                  <dt className="text-subtle">Spent</dt>
                  <dd className="tabular font-mono">{money(project.totalCostUsd)}</dd>
                </div>
                <div className="mt-1 flex justify-between gap-3">
                  <dt className="text-subtle">Directory</dt>
                  <dd className="truncate font-mono">{project.dir}</dd>
                </div>
              </dl>

              <Checkbox
                label="Also delete the files on disk"
                description={
                  isExample
                    ? "This project was adopted, not generated here. Its compositions and assets are hand-authored and cannot be regenerated."
                    : "Removes the compositions, captured assets and renders. The video cannot be recovered."
                }
                checked={removeFiles}
                onChange={(e) => setRemoveFiles(e.target.checked)}
              />

              <p className="text-[12px] leading-relaxed text-subtle">
                {removeFiles
                  ? "Everything goes. This cannot be undone."
                  : "The library entry goes; the project stays in projects/ and can be re-adopted with `npm run seed`."}
              </p>
            </>
          )}

          {error && <ErrorBox title="Could not delete">{error}</ErrorBox>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} disabled={Boolean(live)} onClick={remove}>
              {removeFiles ? "Delete permanently" : "Remove from library"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
