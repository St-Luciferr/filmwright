import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { PROJECTS_DIR, ROOT, config, hyperframes } from "./config";
import { InputStream, runAuthoringSession } from "./agent";
import { Parked, type InteractContext } from "./interact";
import { buildAgentPrompt, buildBrief, buildRevision } from "./prompt";
import { describeFailure } from "./failure";
import { getRenderer, runCommand } from "./render";
import {
  describeExisting,
  detectStages,
  findRender,
  hasSalvageableWork,
} from "./stages";
import {
  appendEvent,
  clearCancel,
  isCancelRequested,
  readSteer,
  updateJob,
} from "./store";
import { ASPECTS, type FailureKind, type Job } from "./types";

const rel = (p: string) => path.relative(ROOT, p);

/**
 * Move the current render aside so the revision's re-render does not destroy
 * the version that is already on the job page. The previous job keeps playing
 * the exact file it produced.
 */
async function archiveRender(
  projectDir: string,
  version: number,
): Promise<string | null> {
  const current = findRender(projectDir);
  if (!current) return null;
  const historyDir = path.join(projectDir, "renders", "history");
  await fsp.mkdir(historyDir, { recursive: true });
  // A revision that failed and was continued would otherwise archive a second
  // time, filing its own partial render as the previous version and repointing
  // the parent at it. One archive per version is the invariant.
  const already = (await fsp.readdir(historyDir)).some((f) =>
    f.startsWith(`v${version}-`),
  );
  if (already) return null;
  const archived = path.join(historyDir, `v${version}-${path.basename(current)}`);
  await fsp.rename(current, archived);
  return archived;
}

/**
 * Replay decisions the person already made so a resumed run does not re-ask
 * them — being asked the same question twice is the fastest way to lose trust
 * in an interactive run.
 */
function describeDecisions(job: Job): string | undefined {
  if (!job.answered?.length) return undefined;
  const lines: string[] = [];
  for (const { interaction, answer } of job.answered) {
    if (interaction.kind === "question") {
      (interaction.questions ?? []).forEach((q, i) => {
        lines.push(`- **${q.header}** — ${q.question}\n  Answer: ${answer.answers?.[i] ?? "(none)"}`);
      });
    } else {
      lines.push(
        `- **${interaction.stage} review** — ${
          answer.decision === "revise"
            ? `changes requested: ${answer.notes ?? ""}`
            : "approved"
        }`,
      );
    }
  }
  return lines.join("\n");
}

class Cancelled extends Error {
  constructor() {
    super("cancelled");
  }
}

/**
 * Slugs are assigned when a job is created, but `hyperframes init` refuses a
 * directory that already exists. Two jobs queued from similar prompts can
 * therefore collide by the time the second one is claimed, so settle the name
 * again here, against the filesystem as it is right now.
 */
async function freeSlug(slug: string): Promise<string> {
  const taken = async (name: string) => {
    try {
      return (await fsp.readdir(path.join(PROJECTS_DIR, name))).length > 0;
    } catch {
      return false;
    }
  };
  if (!(await taken(slug))) return slug;
  for (let n = 2; n < 100; n++) {
    const candidate = `${slug}-${n}`;
    if (!(await taken(candidate))) return candidate;
  }
  throw new Error(`Could not find a free project name for "${slug}"`);
}

/**
 * Scaffold the HyperFrames project the agent will work in.
 *
 * Doing this here rather than letting the agent do it means the project exists
 * (and the job page has something to show) before the model produces its first
 * token, and it guarantees the resolution and CLI pin the platform promised.
 */
export async function scaffold(job: Job, log: (m: string) => void, signal: AbortSignal) {
  await fsp.mkdir(PROJECTS_DIR, { recursive: true });

  const slug = await freeSlug(job.slug);
  if (slug !== job.slug) {
    await appendEvent(job.id, {
      kind: "log",
      message: `Project name "${job.slug}" is taken — using "${slug}"`,
    });
    job.slug = slug;
    await updateJob(job.id, (j) => {
      j.slug = slug;
    });
  }

  const projectDir = path.join(PROJECTS_DIR, slug);
  const { resolution } = ASPECTS[job.spec.aspect];

  // The CLI's last line carries the actual reason it gave up; an exit code
  // alone leaves the job page saying nothing useful.
  let lastLine = "";
  const { code } = await runCommand(
    "npx",
    [
      "--yes",
      hyperframes,
      "init",
      slug,
      "--non-interactive",
      // --non-interactive refuses to guess a starter; the agent authors every
      // composition itself, so an empty project is what we want.
      "--example",
      "blank",
      "--resolution",
      resolution,
      "--skill",
      job.spec.workflow,
    ],
    PROJECTS_DIR,
    (line) => {
      lastLine = line;
      log(line);
    },
    signal,
  );
  if (code !== 0) {
    throw new Error(
      `hyperframes init failed with code ${code}${lastLine ? `: ${lastLine}` : ""}`,
    );
  }

  await fsp.writeFile(
    path.join(projectDir, "BRIEF.md"),
    buildBrief(job.spec),
    "utf8",
  );
  return projectDir;
}

/** Mirror filesystem-derived stage progress onto the job record. */
async function syncStages(job: Job, projectDir: string, checkRan: boolean) {
  const stages = detectStages(projectDir, { checkRan });
  const changed =
    JSON.stringify(stages) !== JSON.stringify(job.stages);
  job.stages = stages;
  if (changed) {
    const active = stages.find((s) => s.status === "active");
    await appendEvent(job.id, {
      kind: "stage",
      message: active
        ? `${active.stage}${active.detail ? ` — ${active.detail}` : ""}`
        : "all stages complete",
      data: { stages },
    });
    await updateJob(job.id, (j) => {
      j.stages = stages;
    });
  }
}

/**
 * Record a run that stopped, whichever path it stopped on.
 *
 * Shared so the render-only path cannot drift into classifying failures, or
 * keeping partial output, differently from the authoring path.
 */
async function recordStop(
  job: Job,
  err: unknown,
  opts: { projectDir: string; cancelled: boolean; failureKind?: FailureKind },
): Promise<void> {
  const isCancel = err instanceof Cancelled || opts.cancelled;
  const message = isCancel
    ? "Cancelled"
    : err instanceof Error
      ? err.message
      : String(err);
  await appendEvent(job.id, { kind: isCancel ? "log" : "error", message });

  // Classify the failure rather than storing a bare string: what someone can do
  // about a run that stopped is the whole difference between continuing it and
  // paying for it all over again.
  const failure = isCancel
    ? undefined
    : describeFailure(message, {
        kind: opts.failureKind,
        stage: job.stages.find((s) => s.status === "active")?.stage,
        hasWork: hasSalvageableWork(opts.projectDir),
      });
  if (failure) {
    await appendEvent(job.id, {
      kind: "log",
      message: failure.resumable
        ? `${failure.hint} The work so far is kept in ${rel(opts.projectDir)} — ` +
          `continue it from the job page, or with \`npm run requeue -- ${job.slug}\`.`
        : failure.hint,
    });
  }

  await updateJob(job.id, (j) => {
    j.status = isCancel ? "cancelled" : "failed";
    j.finishedAt = new Date().toISOString();
    j.error = failure?.message;
    j.failure = failure;
    // Keep whatever the run did manage to produce visible on the job page.
    const partial = findRender(opts.projectDir);
    if (partial) j.videoPath = rel(partial);
  });
}

/**
 * Re-render a project that is already authored.
 *
 * No agent session: the composition on disk is the input, and the only thing
 * this produces is a new mp4. That is what makes a caption fix cost nothing and
 * take a minute rather than a run.
 */
async function runRenderJob(job: Job): Promise<void> {
  const abort = new AbortController();
  const log = (message: string) =>
    void appendEvent(job.id, { kind: "log", message });
  const projectDir = path.resolve(ROOT, job.projectDir);

  let poller: NodeJS.Timeout | undefined;
  let timeout: NodeJS.Timeout | undefined;
  let cancelled = false;
  let failureKind: FailureKind | undefined;

  try {
    await clearCancel(job.id);
    await appendEvent(job.id, {
      kind: "log",
      message:
        `Re-rendering "${job.slug}"${job.renderReason ? ` — ${job.renderReason}` : ""}. ` +
        "No authoring session, so this run costs nothing.",
    });

    if (!fs.existsSync(projectDir)) {
      failureKind = "missing-project";
      throw new Error(`Cannot re-render: ${job.projectDir} no longer exists.`);
    }

    timeout = setTimeout(() => {
      failureKind = "timeout";
      void appendEvent(job.id, {
        kind: "error",
        message: `Timed out after ${config.timeoutMs / 60_000} minutes`,
      });
      abort.abort();
    }, config.timeoutMs);

    // Move the current cut aside so the version that is already on the previous
    // job's page keeps playing the exact file it produced.
    const archived = await archiveRender(projectDir, (job.version ?? 2) - 1);
    if (archived && job.revisionOf) {
      await updateJob(job.revisionOf, (parent) => {
        parent.videoPath = rel(archived);
      });
      await appendEvent(job.id, {
        kind: "log",
        message: `Kept v${(job.version ?? 2) - 1} at ${rel(archived)}`,
      });
    }

    // `check` counts as done: the composition was checked by the run that
    // authored it, and this job does not touch it.
    await syncStages(job, projectDir, true);
    poller = setInterval(() => {
      if (isCancelRequested(job.id) && !cancelled) {
        cancelled = true;
        void appendEvent(job.id, { kind: "log", message: "Cancellation requested" });
        abort.abort();
      }
      void syncStages(job, projectDir, true);
    }, config.pollMs);

    const result = await getRenderer().render(projectDir, log, abort.signal);
    if (cancelled || isCancelRequested(job.id)) throw new Cancelled();
    if (!result.ok) {
      failureKind ??= "render";
      throw new Error(result.error ?? "render failed");
    }
    const output = result.output ?? findRender(projectDir);
    if (!output) {
      failureKind ??= "render";
      throw new Error("render finished but produced no mp4");
    }

    await syncStages(job, projectDir, true);
    await updateJob(job.id, (j) => {
      j.status = "succeeded";
      j.finishedAt = new Date().toISOString();
      j.videoPath = rel(output);
      j.error = undefined;
      j.failure = undefined;
    });
    await appendEvent(job.id, {
      kind: "log",
      message: `Done — ${rel(output)}`,
    });
  } catch (err) {
    await recordStop(job, err, { projectDir, cancelled, failureKind });
  } finally {
    if (poller) clearInterval(poller);
    if (timeout) clearTimeout(timeout);
    await clearCancel(job.id);
  }
}

export async function runJob(job: Job): Promise<void> {
  // A render-only job shares the queue, the events and the cancel marker, but
  // none of the authoring machinery below it.
  if (job.kind === "render") return runRenderJob(job);

  const abort = new AbortController();
  const log = (message: string) =>
    void appendEvent(job.id, { kind: "log", message });

  let checkRan = false;
  let projectDir = path.join(PROJECTS_DIR, job.slug);
  let poller: NodeJS.Timeout | undefined;
  let steerPoller: NodeJS.Timeout | undefined;
  let timeout: NodeJS.Timeout | undefined;
  let cancelled = false;
  // Set wherever the pipeline knows *why* it is about to throw. A timeout and a
  // cancellation both surface as an aborted session, and telling someone to
  // raise the wrong ceiling is worse than saying nothing.
  let failureKind: FailureKind | undefined;

  const stop = () => {
    if (poller) clearInterval(poller);
    if (steerPoller) clearInterval(steerPoller);
    if (timeout) clearTimeout(timeout);
  };

  try {
    await clearCancel(job.id);
    if (!job.attempt) {
      job.attempt = 1;
      await updateJob(job.id, (j) => {
        j.attempt = 1;
      });
    }
    await appendEvent(job.id, {
      kind: "log",
      message:
        `Starting "${job.slug}" — ${job.spec.workflow}, ${job.spec.aspect}, ` +
        `${job.spec.seconds}s` +
        (job.attempt > 1 ? ` (attempt ${job.attempt})` : ""),
    });

    timeout = setTimeout(() => {
      failureKind = "timeout";
      void appendEvent(job.id, {
        kind: "error",
        message: `Timed out after ${config.timeoutMs / 60_000} minutes`,
      });
      abort.abort();
    }, config.timeoutMs);

    let existing: string | undefined;
    if (job.resume) {
      projectDir = path.resolve(ROOT, job.projectDir);
      if (!fs.existsSync(projectDir)) {
        failureKind = "missing-project";
        throw new Error(
          `Cannot resume: ${job.projectDir} no longer exists. Start this run over instead.`,
        );
      }
      existing = describeExisting(projectDir);
      await appendEvent(job.id, {
        kind: "log",
        message: `Resuming ${job.projectDir} — reusing:\n${existing}`,
      });

      if (job.appliedNotes?.length) {
        const previousVersion = (job.version ?? 2) - 1;
        const archived = await archiveRender(projectDir, previousVersion);
        if (archived && job.revisionOf) {
          // Point the job being revised at its own archived copy so its page
          // keeps playing the version it actually produced.
          await updateJob(job.revisionOf, (parent) => {
            parent.videoPath = rel(archived);
          });
          await appendEvent(job.id, {
            kind: "log",
            message: `Kept v${previousVersion} at ${rel(archived)}`,
          });
        }
      }
    } else {
      try {
        projectDir = await scaffold(job, log, abort.signal);
      } catch (err) {
        // Only a genuine scaffold problem — a cancel or timeout that aborted
        // the CLI mid-run keeps whichever kind set the abort.
        failureKind ??= cancelled ? undefined : "scaffold";
        throw err;
      }
    }
    await updateJob(job.id, (j) => {
      j.projectDir = rel(projectDir);
    });
    await syncStages(job, projectDir, checkRan);

    // Poll the project directory for progress and honour cancellation. The
    // agent's own narration is logged separately; this is the source of truth.
    poller = setInterval(() => {
      if (isCancelRequested(job.id) && !cancelled) {
        cancelled = true;
        void appendEvent(job.id, { kind: "log", message: "Cancellation requested" });
        abort.abort();
      }
      void syncStages(job, projectDir, checkRan);
    }, config.pollMs);

    const interactive = job.interactive ?? job.spec.interactive ?? false;
    const ctx: InteractContext = {
      signal: abort.signal,
      abort: () => abort.abort(),
      parked: null,
    };
    const input = new InputStream();

    // Deliver steering notes at the next turn boundary. They are ordinary user
    // messages, so the agent treats them as direction rather than as data.
    let steerCursor = 0;
    steerPoller = setInterval(() => {
      void readSteer(job.id, steerCursor).then(({ notes, nextByte }) => {
        steerCursor = nextByte;
        for (const note of notes) {
          void appendEvent(job.id, { kind: "steer", message: note });
          input.push(`A note from the person commissioning this video:\n\n${note}`);
        }
      });
    }, 2000);

    const session = await runAuthoringSession({
      projectDir,
      prompt: buildAgentPrompt(
        job.spec,
        job.slug,
        existing,
        interactive,
        describeDecisions(job),
        job.appliedNotes?.length
          ? {
              notes: buildRevision(job.appliedNotes),
              version: job.version ?? 2,
            }
          : undefined,
      ),
      abortController: abort,
      interact: interactive ? { jobId: job.id, ctx } : undefined,
      input,
      handlers: {
        onText: (text) =>
          void appendEvent(job.id, { kind: "log", message: text }),
        onToolCall: ({ name, summary }) => {
          if (name === "Bash" && /hyperframes\b.*\bcheck\b/.test(summary)) {
            checkRan = true;
          }
          void appendEvent(job.id, {
            kind: "tool",
            message: summary ? `${name} — ${summary}` : name,
            data: { tool: name },
          });
        },
      },
    });
    clearInterval(steerPoller);
    steerPoller = undefined;

    if (ctx.parked) throw new Parked(ctx.parked);
    if (cancelled || isCancelRequested(job.id)) throw new Cancelled();

    await updateJob(job.id, (j) => {
      j.costUsd = session.costUsd;
      j.numTurns = session.numTurns;
      j.sessionId = session.sessionId;
    });
    await appendEvent(job.id, {
      kind: "usage",
      message: `Session finished — ${session.numTurns} turns, $${session.costUsd.toFixed(2)}`,
      data: { costUsd: session.costUsd, numTurns: session.numTurns },
    });
    if (session.text) {
      await appendEvent(job.id, { kind: "log", message: session.text });
    }

    // The workflow normally renders itself. Render here only if it did not, so
    // a session that ran out of budget mid-way still yields a video.
    let output = findRender(projectDir);
    if (!output) {
      if (!session.ok) {
        failureKind ??= "agent";
        throw new Error(session.error ?? "agent session failed before rendering");
      }
      await appendEvent(job.id, {
        kind: "log",
        message: "No render found — rendering with the local driver",
      });
      const result = await getRenderer().render(projectDir, log, abort.signal);
      if (!result.ok) {
        failureKind ??= "render";
        throw new Error(result.error ?? "render failed");
      }
      output = result.output ?? null;
    }

    checkRan = true;
    await syncStages(job, projectDir, checkRan);
    await updateJob(job.id, (j) => {
      j.status = "succeeded";
      j.finishedAt = new Date().toISOString();
      j.videoPath = output ? rel(output) : undefined;
      j.error = undefined;
      j.failure = undefined;
    });
    await appendEvent(job.id, {
      kind: "log",
      message: `Done — ${output ? rel(output) : "no output"}`,
    });
  } catch (err) {
    if (err instanceof Parked) {
      await syncStages(job, projectDir, checkRan);
      await updateJob(job.id, (j) => {
        j.status = "awaiting-input";
        j.pending = err.interaction;
        j.projectDir = rel(projectDir);
        // Parking is not a failure; a stale one would show a red card on a job
        // that is merely waiting for an answer.
        j.error = undefined;
        j.failure = undefined;
      });
      await appendEvent(job.id, {
        kind: "log",
        message:
          "Parked awaiting your answer — the worker has moved on. " +
          "Answering on the job page continues this run from where it stopped.",
      });
      return;
    }
    await recordStop(job, err, { projectDir, cancelled, failureKind });
  } finally {
    stop();
    await clearCancel(job.id);
  }
}
