import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { PROJECTS_DIR, ROOT, config, hyperframes } from "./config";
import { InputStream, runAuthoringSession } from "./agent";
import { Parked, runReviewGate, type GateStage, type InteractContext } from "./interact";
import { buildAgentPrompt, buildBrief, buildRevision } from "./prompt";
import { freeSlug } from "./slug";
import { describeFailure } from "./failure";
import { getRenderer, renderStamp, runCommand } from "./render";
import {
  describeExisting,
  detectStages,
  findRender,
  hasSalvageableWork,
} from "./stages";
import {
  appendEvent,
  clearCancel,
  getJob,
  isCancelRequested,
  jobsInProject,
  readSteer,
  updateJob,
} from "./store";
import { ASPECTS, type FailureKind, type Job, type Stage } from "./types";
import { isFrame, readTimeline } from "./timeline";
import {
  planFor,
  timelineSeconds,
  type StageContract,
  type StageContext,
} from "./workflow";

const rel = (p: string) => path.relative(ROOT, p);

/**
 * The version number the mp4 currently on disk belongs to.
 *
 * `job.version - 1` is not it: failed runs take version numbers too, so after a
 * failed v2 the next run is v3 while the file on disk is still v1's. Archiving
 * it as `v2-…` would label the history wrongly and repoint the v1 job at a file
 * named for a version that never rendered.
 */
async function versionOnDisk(job: Job, projectDir: string): Promise<number> {
  const fallback = (job.version ?? 2) - 1;
  const current = findRender(projectDir);
  if (!current) return fallback;
  const owner = (await jobsInProject(job.projectDir)).find(
    (j) => j.videoPath === rel(current),
  );
  return owner?.version ?? fallback;
}

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
  opts: {
    projectDir: string;
    cancelled: boolean;
    failureKind?: FailureKind;
    /**
     * The stage the run was actually on. The engine drives the plan, so it
     * knows this exactly; the filesystem-derived fallback is for the paths that
     * do not (a render-only job, a scaffold that never got a session).
     */
    stage?: Stage;
    /** The render that was already on disk when this run started, if any. */
    renderAtStart?: string | null;
  },
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
        stage: opts.stage ?? job.stages.find((s) => s.status === "active")?.stage,
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
    // A question nobody can answer any more: the session that asked it is gone,
    // so leaving it would render an answer form that silently does nothing.
    j.pending = undefined;
    // Keep whatever the run did manage to produce — but only if this run
    // produced it. A resumed run that fails again would otherwise claim the
    // previous version's mp4 as its own and appear in the version list.
    const partial = findRender(opts.projectDir);
    if (partial && renderStamp(partial) !== opts.renderAtStart) {
      j.videoPath = rel(partial);
    }
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
  let renderAtStart: string | null = null;
  /** Undo the archive, so a failed re-render does not leave the project cutless. */
  let restore: (() => Promise<void>) | null = null;

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

    renderAtStart = renderStamp(findRender(projectDir));

    // Move the current cut aside so the version that is already on the previous
    // job's page keeps playing the exact file it produced. Archiving before the
    // render is what protects that file from being overwritten — but it means a
    // render that then fails would leave the project with no current cut at
    // all, so the move is remembered and undone on the way out.
    const current = findRender(projectDir);
    const previousVersion = await versionOnDisk(job, projectDir);
    const archived = await archiveRender(projectDir, previousVersion);
    if (archived && current) {
      const previousPath = job.revisionOf
        ? (await getJob(job.revisionOf))?.videoPath
        : undefined;
      restore = async () => {
        try {
          await fsp.rename(archived, current);
        } catch {
          // Already gone, or replaced by a render that did land.
          return;
        }
        if (job.revisionOf) {
          await updateJob(job.revisionOf, (parent) => {
            parent.videoPath = previousPath;
          });
        }
      };
      if (job.revisionOf) {
        await updateJob(job.revisionOf, (parent) => {
          parent.videoPath = rel(archived);
        });
      }
      await appendEvent(job.id, {
        kind: "log",
        message: `Kept v${previousVersion} at ${rel(archived)}`,
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
    restore = null;
    await appendEvent(job.id, {
      kind: "log",
      message: `Done — ${rel(output)}`,
    });
  } catch (err) {
    if (restore) {
      await restore();
      await appendEvent(job.id, {
        kind: "log",
        message: "Put the previous cut back — this project still has a playable video.",
      });
    }
    await recordStop(job, err, { projectDir, cancelled, failureKind, renderAtStart });
  } finally {
    if (poller) clearInterval(poller);
    if (timeout) clearTimeout(timeout);
    await clearCancel(job.id);
  }
}

/**
 * How many times one stage may fail its validator before the run gives up.
 *
 * A stage that cannot satisfy its own contract after this many corrections is
 * not going to; continuing just spends budget re-reading the same complaint.
 */
const MAX_STAGE_ATTEMPTS = 4;

/**
 * What to put in front of a person when the agent left no summary — which is
 * every gate the engine opens without an agent turn behind it, such as the
 * pre-render gate on a resumed run that had nothing left to author.
 */
function describeForGate(stage: Stage, projectDir: string): string {
  if (stage === "render") {
    const runtime = timelineSeconds(projectDir);
    const frames = readTimeline(projectDir).filter(isFrame).length;
    return runtime === null
      ? "Ready to render. Review the frames before it runs."
      : `Ready to render: ${frames} frames, ${runtime.toFixed(1)}s. ` +
        "The stills below are the timeline as it stands — approve to render it.";
  }
  return `Review ${stage} before continuing.`;
}

/** Raised when a stage cannot be satisfied. Carries the stage for the failure record. */
class StageFailed extends Error {
  constructor(readonly stage: Stage, message: string) {
    super(message);
  }
}

/** The three fixed gates, keyed by the stage whose sign-off they are. */
const GATE_FOR: Partial<Record<Stage, GateStage>> = {
  script: "script",
  storyboard: "storyboard",
  render: "pre-render",
};

/** The artifact a gate shows the person. */
const ARTIFACT_FOR: Partial<Record<Stage, string>> = {
  script: "SCRIPT.md",
  storyboard: "STORYBOARD.md",
};

/**
 * Walks the workflow plan, one stage at a time, inside a single agent session.
 *
 * The engine decides what happens next: it asks the agent for exactly one
 * stage, and only sends the next instruction once that stage's artifact passes
 * its validator. Stages the engine performs itself — `check` and `render` — run
 * here rather than being asked for, which is what turns "check passed" from a
 * claim into evidence. Gates block; on an interactive job nothing renders
 * without sign-off.
 *
 * Driving it inside one session rather than one session per stage is
 * deliberate: a stage boundary that tears the session down pays the full
 * re-discovery cost measured at 12 minutes a resume.
 */
export function createStageDriver(opts: {
  job: Job;
  projectDir: string;
  input: InputStream;
  interactive: boolean;
  ctx: InteractContext;
  signal: AbortSignal;
  log: (message: string) => void;
  onStage: (stage: Stage) => void;
  onStageDone: (stage: Stage) => void;
}) {
  const {
    job, projectDir, input, interactive, ctx, signal, log, onStage, onStageDone,
  } = opts;
  const plan = planFor(job);
  const attempts = new Map<Stage, number>();
  let index = 0;
  let finished = false;
  /** The last thing the agent said — the summary a gate asks a person to sign. */
  let gateSummary = "";
  /**
   * Before the session exists there is nothing to push into, so the opening
   * instructions are collected here and folded into the first prompt instead.
   */
  let started = false;
  const opening: string[] = [];
  const send = (text: string) => {
    if (started) input.push(text);
    else opening.push(text);
  };

  const ctxFor = (): StageContext => ({ job, projectDir, signal, log });

  const fail = (stage: Stage, why: string): never => {
    throw new StageFailed(
      stage,
      `Stage "${stage}" did not pass after ${MAX_STAGE_ATTEMPTS} attempts: ${why}`,
    );
  };

  /**
   * Send a stage's instruction and mark it active.
   *
   * Awaited: a stage may prepare something on disk before the agent is asked
   * (the frame packets, ADR-0016), and the instruction depends on the result.
   */
  const enter = async (contract: StageContract) => {
    onStage(contract.stage);
    if (contract.instruct) {
      log(`Stage: ${contract.stage}`);
      send(await contract.instruct(ctxFor()));
    }
  };

  /** Push a correction and keep the plan on the same stage. */
  const correct = (contract: StageContract, problem: string) => {
    const n = (attempts.get(contract.stage) ?? 0) + 1;
    attempts.set(contract.stage, n);
    if (n > MAX_STAGE_ATTEMPTS) fail(contract.stage, problem);
    log(`Stage "${contract.stage}" not satisfied — ${problem}`);
    send(
      `That stage is not finished yet.\n\n${problem}\n\n` +
        "Fix exactly that, then reply. Do not move on to any later stage.",
    );
  };

  /** Open a gate, returning true when the plan may proceed past it. */
  const gate = async (
    contract: StageContract,
    summary: string,
  ): Promise<boolean> => {
    const stage = GATE_FOR[contract.stage];
    if (!stage || !interactive) return true;
    const outcome = await runReviewGate({
      jobId: job.id,
      ctx,
      projectDir,
      stage,
      summary: summary.trim() || describeForGate(contract.stage, projectDir),
      artifact: ARTIFACT_FOR[contract.stage],
    });
    if (outcome.approved) return true;
    send(
      `The person reviewed ${contract.stage} and asked for changes:\n\n` +
        `${outcome.notes ?? "(no detail given)"}\n\n` +
        "Apply them and reply when done. Do not move on to any later stage.",
    );
    return false;
  };

  /**
   * Run every engine-performed stage sitting at the head of the plan, stopping
   * at the first one that needs the agent or a person.
   *
   * Returns false when the plan is blocked here — a gate awaiting sign-off, or
   * a failure the agent has been asked to fix.
   */
  const advanceEngineStages = async (): Promise<boolean> => {
    while (index < plan.length) {
      const contract = plan[index];
      if (!contract || contract.instruct) return true;
      onStage(contract.stage);

      if (contract.gateBefore && !(await gate(contract, gateSummary))) {
        return false;
      }

      const problem = contract.validate(ctxFor());
      if (problem) {
        correct(contract, problem);
        return false;
      }
      if (contract.run) {
        log(`Stage: ${contract.stage}`);
        const result = await contract.run(ctxFor());
        if (!result.ok) {
          correct(contract, result.detail);
          return false;
        }
        if (result.detail) log(result.detail);
      }
      attempts.delete(contract.stage);
      onStageDone(contract.stage);
      index++;
    }
    return true;
  };

  return {
    /**
     * Walk the plan as far as it goes without the agent, then return what the
     * agent should be asked for first.
     *
     * A resumed job whose only remaining stage is `render` completes here — no
     * session is opened, and the run costs nothing.
     */
    async begin(): Promise<{ opening: string; complete: boolean }> {
      // A resumed run picks the plan up where it actually stopped: every agent
      // stage whose artifact already satisfies its contract is skipped, so the
      // script is not rewritten to reach the frames. Engine stages are never
      // skipped — `check` re-runs, and the pre-render gate always opens, which
      // is the hole this replaces (seven resumed runs rendered a finished video
      // having passed no gate at all).
      while (index < plan.length) {
        const contract = plan[index];
        if (!contract?.instruct || contract.validate(ctxFor()) !== null) break;
        log(`Stage "${contract.stage}" is already satisfied — skipping.`);
        onStageDone(contract.stage);
        index++;
      }
      const clear = await advanceEngineStages();
      if (clear) {
        const contract = plan[index];
        if (contract) await enter(contract);
        else finished = true;
      }
      started = true;
      return {
        opening: opening.join("\n\n"),
        complete: finished && opening.length === 0,
      };
    },

    get done(): boolean {
      return finished;
    },

    /** Called when the agent finishes a turn. */
    async onTurnEnd(turn: { ok: boolean; text: string }): Promise<void> {
      if (finished) return;
      const contract = plan[index];
      if (!contract) {
        finished = true;
        return;
      }
      gateSummary = turn.text || gateSummary;

      if (contract.instruct) {
        // An agent stage advances only once its artifact satisfies the contract.
        const problem = contract.validate(ctxFor());
        if (problem) {
          correct(contract, problem);
          return;
        }
        if (contract.gateAfter && !(await gate(contract, gateSummary))) return;
        attempts.delete(contract.stage);
        onStageDone(contract.stage);
        index++;
      }
      // Whatever the agent was just asked to fix, an engine stage at the head of
      // the plan has to be *performed* again, not merely re-validated — a failed
      // `npm run check` is only cleared by running it.
      if (!(await advanceEngineStages())) return;

      const next = plan[index];
      if (!next) {
        finished = true;
        return;
      }
      await enter(next);
    },
  };
}

export async function runJob(job: Job): Promise<void> {
  // A render-only job shares the queue, the events and the cancel marker, but
  // none of the authoring machinery below it.
  if (job.kind === "render") return runRenderJob(job);

  const abort = new AbortController();
  const log = (message: string) =>
    void appendEvent(job.id, { kind: "log", message });

  // Set only when the engine has actually run `npm run check` and it passed.
  // It used to be inferred from a regex over the agent's Bash commands and then
  // forced true after any successful render, so "check: done" was not evidence.
  let checkRan = false;
  let activeStage: Stage | undefined;
  let projectDir = path.join(PROJECTS_DIR, job.slug);
  let poller: NodeJS.Timeout | undefined;
  let steerPoller: NodeJS.Timeout | undefined;
  let timeout: NodeJS.Timeout | undefined;
  let cancelled = false;
  let renderAtStart: string | null = null;
  /** Undo a revision's archive, so a failed one leaves a playable cut. */
  let restore: (() => Promise<void>) | null = null;
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
        const current = findRender(projectDir);
        const previousVersion = await versionOnDisk(job, projectDir);
        const archived = await archiveRender(projectDir, previousVersion);
        if (archived && current) {
          const previousPath = job.revisionOf
            ? (await getJob(job.revisionOf))?.videoPath
            : undefined;
          // Undone if this revision never renders, so a failed one does not
          // leave the project with no current cut.
          restore = async () => {
            try {
              await fsp.rename(archived, current);
            } catch {
              return;
            }
            if (job.revisionOf) {
              await updateJob(job.revisionOf, (parent) => {
                parent.videoPath = previousPath;
              });
            }
          };
          if (job.revisionOf) {
            // Point the job being revised at its own archived copy so its page
            // keeps playing the version it actually produced.
            await updateJob(job.revisionOf, (parent) => {
              parent.videoPath = rel(archived);
            });
          }
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
    renderAtStart = renderStamp(findRender(projectDir));
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

    // The engine walks the workflow plan; the agent is asked for one stage at a
    // time and cannot skip ahead, because the next instruction is not sent
    // until the current stage's artifact passes its validator.
    const driver = createStageDriver({
      job,
      projectDir,
      input,
      interactive,
      ctx,
      signal: abort.signal,
      log,
      onStage: (stage) => {
        activeStage = stage;
      },
      onStageDone: (stage) => {
        if (stage === "check") checkRan = true;
      },
    });

    // A revision is not a walk through the plan — the video exists and specific
    // things about it are to change — so it keeps the single-prompt shape.
    const revising = Boolean(job.appliedNotes?.length);
    const start = revising
      ? { opening: "", complete: false }
      : await driver.begin();

    if (start.complete) {
      await appendEvent(job.id, {
        kind: "log",
        message: "Every stage was already satisfied — no authoring session needed.",
      });
    }

    const session = start.complete
      ? { ok: true, text: "", costUsd: 0, numTurns: 0, sessionId: undefined }
      : await runAuthoringSession({
          projectDir,
          prompt: [
            buildAgentPrompt(
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
            start.opening,
          ]
            .filter(Boolean)
            .join("\n\n---\n\n"),
          abortController: abort,
          interact: interactive ? { jobId: job.id, ctx } : undefined,
          input,
          onTurnEnd: revising ? undefined : (turn) => driver.onTurnEnd(turn),
          handlers: {
            onText: (text) =>
              void appendEvent(job.id, { kind: "log", message: text }),
            onToolCall: ({ name, summary }) => {
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

    // The plan renders as its last stage, so normally there is nothing to do
    // here. The mp4 that was already on disk does not count: a resumed run
    // whose session dies without rendering would otherwise find the previous
    // attempt's file and be written down as succeeded carrying a video it did
    // not make.
    let output = findRender(projectDir);
    if (output && renderStamp(output) === renderAtStart) output = null;
    if (!output) {
      if (!session.ok) {
        failureKind ??= "agent";
        throw new Error(session.error ?? "agent session failed before rendering");
      }
      // A session that ended with the plan unfinished did not pass the gates.
      // On an interactive job that is a failure, not something to paper over by
      // rendering anyway — the whole point of the pre-render gate is that
      // nothing reaches an mp4 without sign-off. A revision runs off-plan and
      // an unattended job has no gate to skip, so both may still be salvaged.
      if (interactive && !revising && !driver.done) {
        failureKind ??= "agent";
        throw new Error(
          "The session ended before the workflow reached the render gate. " +
            "Continue the run to pick it up from the stage it stopped on.",
        );
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

    restore = null;
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
    // A stage that could not satisfy its contract is an agent failure, and it
    // knows exactly which stage stopped the run.
    if (err instanceof StageFailed) {
      failureKind ??= "agent";
      activeStage = err.stage;
    }
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
    if (restore) {
      await restore();
      await appendEvent(job.id, {
        kind: "log",
        message: "Put the previous cut back — this project still has a playable video.",
      });
    }
    await recordStop(job, err, {
      projectDir,
      cancelled,
      failureKind,
      stage: activeStage,
      renderAtStart,
    });
  } finally {
    stop();
    await clearCancel(job.id);
  }
}
