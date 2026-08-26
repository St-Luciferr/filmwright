"use client";

import type { Job } from "@filmwright/engine/types";
import { WORKFLOWS } from "@filmwright/engine/types";
import {
  ChevronDown,
  LayoutGrid,
  MoreHorizontal,
  Rows3,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { DeleteProjectDialog } from "@/components/app/delete-project";
import { StatusBadge } from "@/components/app/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { duration, jobDuration, money, relative } from "@/lib/format";
import { groupByProject, type Project } from "@/lib/projects";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = [
  { value: "all", label: "Any status" },
  { value: "live", label: "In progress" },
  { value: "awaiting-input", label: "Needs you" },
  { value: "succeeded", label: "Done" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "imported", label: "Examples" },
];

const SORTS = [
  { value: "recent", label: "Recently updated" },
  { value: "oldest", label: "Oldest first" },
  { value: "cost", label: "Most expensive" },
  { value: "versions", label: "Most versions" },
];

const PAGE_SIZE = 12;

export function LibraryView({ jobs }: { jobs: Job[] }) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [workflow, setWorkflow] = React.useState("all");
  const [sort, setSort] = React.useState("recent");
  const [view, setView] = React.useState<"grid" | "table">("grid");
  const [page, setPage] = React.useState(1);

  const projects = React.useMemo(() => groupByProject(jobs), [jobs]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = projects.filter((project) => {
      if (needle) {
        // Search every version: a phrase from the original prompt should still
        // find a project whose latest revision reworded it.
        const haystack = project.versions
          .map((j) => `${j.slug} ${j.spec.prompt} ${j.spec.audience ?? ""}`)
          .join(" ");
        if (!haystack.toLowerCase().includes(needle)) return false;
      }
      if (workflow !== "all" && project.latest.spec.workflow !== workflow) return false;
      if (status === "all") return true;
      // A project matches a status if any of its runs does.
      return project.versions.some((j) =>
        status === "live"
          ? j.status === "running" || j.status === "queued"
          : j.status === status,
      );
    });

    const sorted = [...rows];
    if (sort === "recent") sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (sort === "oldest") sorted.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    if (sort === "cost") sorted.sort((a, b) => b.totalCostUsd - a.totalCostUsd);
    if (sort === "versions") sorted.sort((a, b) => b.versions.length - a.versions.length);
    return sorted;
  }, [projects, query, status, workflow, sort]);

  // Any filter change invalidates the current page — staying on page 3 of a
  // result set that now has one page shows an empty list that looks like a bug.
  React.useEffect(() => setPage(1), [query, status, workflow, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtering = query.trim() !== "" || status !== "all" || workflow !== "all";

  const reset = () => {
    setQuery("");
    setStatus("all");
    setWorkflow("all");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search slug, prompt or audience…"
            aria-label="Search projects"
            className="pl-9"
          />
        </div>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={workflow} onValueChange={setWorkflow}>
          <SelectTrigger className="w-44" aria-label="Filter by workflow">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any workflow</SelectItem>
            {WORKFLOWS.map((w) => (
              <SelectItem key={w} value={w}>
                {w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-44" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex rounded-control border border-line bg-inset p-0.5">
          {(
            [
              ["grid", LayoutGrid, "Grid view"],
              ["table", Rows3, "Table view"],
            ] as const
          ).map(([mode, Icon, label]) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              aria-label={label}
              aria-pressed={view === mode}
              className={cn(
                "rounded-[6px] p-1.5 transition-colors",
                view === mode ? "bg-overlay text-fg" : "text-subtle hover:text-fg",
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 text-[12px] text-subtle">
        <span className="tabular">
          {filtered.length} of {projects.length} project
          {projects.length === 1 ? "" : "s"}
          <span className="text-subtle/70"> · {jobs.length} runs</span>
        </span>
        {filtering && (
          <button
            onClick={reset}
            className="inline-flex items-center gap-1 text-muted transition-colors hover:text-fg"
          >
            <X className="size-3" />
            Clear filters
          </button>
        )}
      </div>

      {!filtered.length ? (
        <EmptyState
          icon={Search}
          title="No projects match"
          description="Try a broader search, or clear the filters to see everything."
          action={
            filtering ? (
              <Button variant="secondary" size="sm" onClick={reset}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => (
            <ProjectCard key={p.dir} project={p} />
          ))}
        </div>
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH>Project</TH>
                <TH>Status</TH>
                <TH align="right">Versions</TH>
                <TH align="right">Spent</TH>
                <TH align="right">Updated</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {visible.map((p) => (
                <ProjectRow key={p.dir} project={p} />
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="tabular text-[12px] text-subtle">
            Page {page} of {pages}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={page === pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The version list a project card and row both expand to show. */
function VersionList({ project }: { project: Project }) {
  return (
    <ul className="divide-y divide-line border-t border-line">
      {project.versions.map((v) => (
        <li key={v.id}>
          <Link
            href={`/jobs/${v.id}`}
            className="flex items-center gap-2 px-3 py-2 transition-colors hover:bg-overlay/60"
          >
            <span className="shrink-0 font-mono text-[11px] text-accent">
              v{v.version ?? 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-subtle">
              {v.appliedNotes?.length
                ? `${v.appliedNotes.length} change${v.appliedNotes.length === 1 ? "" : "s"}`
                : v.resume
                  ? "resumed"
                  : "first run"}
            </span>
            <span className="tabular shrink-0 text-[11px] text-subtle">
              {money(v.costUsd)}
            </span>
            <span className="tabular shrink-0 text-[11px] text-subtle">
              {duration(jobDuration(v))}
            </span>
            <StatusBadge status={v.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const [open, setOpen] = React.useState(false);
  const { head, latest } = project;
  const multi = project.versions.length > 1;

  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-line bg-raised transition-colors hover:border-line-strong">
      <Link
        href={`/jobs/${head.id}`}
        className="relative flex aspect-video items-center justify-center overflow-hidden bg-inset"
      >
        {head.videoPath ? (
          // The #t fragment makes the browser seek and paint a real frame.
          // object-contain, not cover: these are mostly 9:16, and cropping a
          // vertical video into a 16:9 card throws away the composition.
          <video
            src={`/api/jobs/${head.id}/video#t=0.5`}
            preload="metadata"
            muted
            playsInline
            className="size-full object-contain"
          />
        ) : (
          <span className="font-mono text-[12px] text-subtle">
            {head.spec.aspect}
          </span>
        )}
        <div className="absolute right-2 top-2 flex gap-1.5">
          {/* Counts every run, matching the expander below — a failed attempt is
              still a version of the project, and two different numbers on one
              card just reads as a bug. */}
          {multi && <Badge>{project.versions.length} versions</Badge>}
          <StatusBadge status={latest.status} />
        </div>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col p-3.5">
        <div className="flex items-start gap-2">
          <Link href={`/jobs/${head.id}`} className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[13px] text-fg">
              {project.slug}
            </span>
          </Link>
          <Menu>
            <MenuTrigger asChild>
              <button
                aria-label={`Actions for ${project.slug}`}
                className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-subtle transition-colors hover:bg-overlay hover:text-fg"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem asChild>
                <Link href={`/jobs/${head.id}`}>Open latest render</Link>
              </MenuItem>
              {multi && (
                <MenuItem onSelect={() => setOpen((v) => !v)}>
                  {open ? "Hide versions" : `Show all ${project.versions.length} versions`}
                </MenuItem>
              )}
              <DeleteProjectDialog
                project={project}
                trigger={
                  <MenuItem danger onSelect={(e) => e.preventDefault()}>
                    <Trash2 />
                    Delete project…
                  </MenuItem>
                }
              />
            </MenuContent>
          </Menu>
        </div>

        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-subtle">
          {latest.spec.prompt}
        </p>

        <div className="tabular mt-3 flex items-center gap-2 text-[11px] text-subtle">
          <span>{latest.spec.seconds}s</span>
          <span aria-hidden>·</span>
          <span>{latest.spec.aspect}</span>
          <span aria-hidden>·</span>
          <span>{money(project.totalCostUsd)}</span>
          <span className="ml-auto">{relative(project.updatedAt)}</span>
        </div>

        {multi && (
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-2.5 flex items-center gap-1 self-start text-[12px] text-muted transition-colors hover:text-fg"
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform", open && "rotate-180")}
            />
            {open ? "Hide" : "Show"} {project.versions.length} versions
          </button>
        )}
      </div>

      {open && multi && <VersionList project={project} />}
    </div>
  );
}

function ProjectRow({ project }: { project: Project }) {
  const [open, setOpen] = React.useState(false);
  const multi = project.versions.length > 1;

  return (
    <>
      <TR>
        <TD>
          <div className="flex items-start gap-2">
            {multi ? (
              <button
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-label={open ? "Hide versions" : "Show versions"}
                className="mt-0.5 shrink-0 rounded p-0.5 text-subtle hover:text-fg"
              >
                <ChevronDown
                  className={cn("size-3.5 transition-transform", open && "rotate-180")}
                />
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <Link href={`/jobs/${project.head.id}`} className="block min-w-0">
              <span className="font-mono text-[13px] text-fg hover:text-accent">
                {project.slug}
              </span>
              <span className="mt-0.5 block max-w-md truncate text-[12px] text-subtle">
                {project.latest.spec.prompt}
              </span>
            </Link>
          </div>
        </TD>
        <TD>
          <StatusBadge status={project.latest.status} />
        </TD>
        <TD align="right" className="tabular text-[13px] text-muted">
          {project.versions.length}
        </TD>
        <TD align="right" className="tabular text-[13px] text-muted">
          {money(project.totalCostUsd)}
        </TD>
        <TD align="right" className="text-[12px] text-subtle">
          {relative(project.updatedAt)}
        </TD>
        <TD align="right">
          <DeleteProjectDialog
            project={project}
            trigger={
              <button
                aria-label={`Delete ${project.slug}`}
                className="rounded p-1 text-subtle transition-colors hover:bg-err-dim hover:text-err"
              >
                <Trash2 className="size-3.5" />
              </button>
            }
          />
        </TD>
      </TR>
      {open &&
        project.versions.map((v) => (
          <TR key={v.id} className="bg-inset/50">
            <TD className="py-2 pl-12">
              <Link href={`/jobs/${v.id}`} className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-accent">
                  v{v.version ?? 1}
                </span>
                <span className="text-[12px] text-subtle">
                  {v.appliedNotes?.length
                    ? `${v.appliedNotes.length} change${v.appliedNotes.length === 1 ? "" : "s"}`
                    : v.resume
                      ? "resumed"
                      : "first run"}
                </span>
              </Link>
            </TD>
            <TD>
              <StatusBadge status={v.status} />
            </TD>
            <TD align="right" className="tabular text-[12px] text-subtle">
              {duration(jobDuration(v))}
            </TD>
            <TD align="right" className="tabular text-[12px] text-subtle">
              {money(v.costUsd)}
            </TD>
            <TD align="right" className="text-[12px] text-subtle">
              {relative(v.finishedAt ?? v.createdAt)}
            </TD>
            <TD />
          </TR>
        ))}
    </>
  );
}
