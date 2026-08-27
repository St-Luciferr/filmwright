import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, JOBS_DIR, PROJECTS_DIR, ROOT } from "./config";
import {
  STAGES,
  type Interaction,
  type InteractionAnswer,
  type Job,
  type JobEvent,
  type RevisionNote,
  type StageState,
} from "./types";

const jobDir = (id: string) => path.join(JOBS_DIR, id);
const jobFile = (id: string) => path.join(jobDir(id), "job.json");
const eventsFile = (id: string) => path.join(jobDir(id), "events.ndjson");

export const emptyStages = (): StageState[] =>
  STAGES.map((stage) => ({ stage, status: "pending" }));

/**
 * Write via a temp file + rename so a reader never observes a half-written job.
 * Same-directory rename is atomic on every filesystem we care about.
 */
async function writeAtomic(file: string, body: string): Promise<void> {
  // Unique per call, not just per process: the studio serves concurrent
  // requests from one process, so a pid-keyed temp path lets two writers
  // clobber each other's file and one rename fail with ENOENT.
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fsp.writeFile(tmp, body, "utf8");
  await fsp.rename(tmp, file);
}

export async function saveJob(job: Job): Promise<Job> {
  await fsp.mkdir(jobDir(job.id), { recursive: true });
  await writeAtomic(jobFile(job.id), `${JSON.stringify(job, null, 2)}\n`);
  return job;
}

export async function getJob(id: string): Promise<Job | null> {
  try {
    return JSON.parse(await fsp.readFile(jobFile(id), "utf8")) as Job;
  } catch {
    return null;
  }
}

/**
 * Read-modify-write a job. Single-worker by design, so this is a plain
 * sequential update rather than a compare-and-swap.
 */
export async function updateJob(
  id: string,
  mutate: (job: Job) => void,
): Promise<Job | null> {
  const job = await getJob(id);
  if (!job) return null;
  mutate(job);
  return saveJob(job);
}

export async function listJobs(): Promise<Job[]> {
  let ids: string[];
  try {
    ids = await fsp.readdir(JOBS_DIR);
  } catch {
    return [];
  }
  const jobs = await Promise.all(ids.map((id) => getJob(id)));
  return jobs
    .filter((j): j is Job => j !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function appendEvent(
  id: string,
  event: Omit<JobEvent, "at">,
): Promise<void> {
  await fsp.mkdir(jobDir(id), { recursive: true });
  const line = `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`;
  await fsp.appendFile(eventsFile(id), line, "utf8");
}

/**
 * Read events from a byte offset. The offset lets an SSE stream tail the log
 * without re-sending history or holding the whole file in memory.
 */
export async function readEvents(
  id: string,
  fromByte = 0,
): Promise<{ events: JobEvent[]; nextByte: number }> {
  const file = eventsFile(id);
  let size: number;
  try {
    size = (await fsp.stat(file)).size;
  } catch {
    return { events: [], nextByte: 0 };
  }
  // The file is append-only; a smaller size means it was reset, so start over.
  const start = fromByte > size ? 0 : fromByte;
  if (start === size) return { events: [], nextByte: size };

  const handle = await fsp.open(file, "r");
  try {
    const buf = Buffer.alloc(size - start);
    await handle.read(buf, 0, buf.length, start);
    const text = buf.toString("utf8");
    // A trailing partial line means a concurrent append is mid-flight. Stop at
    // the last newline and report that as the next offset.
    const lastNewline = text.lastIndexOf("\n");
    if (lastNewline === -1) return { events: [], nextByte: start };
    const complete = text.slice(0, lastNewline);
    const events = complete
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as JobEvent];
        } catch {
          return [];
        }
      });
    return {
      events,
      nextByte: start + Buffer.byteLength(complete, "utf8") + 1,
    };
  } finally {
    await handle.close();
  }
}

/** Claim the oldest queued job. Returns null when the queue is empty. */
export async function claimNextJob(): Promise<Job | null> {
  const queued = (await listJobs())
    .filter((j) => j.status === "queued")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const next = queued[0];
  if (!next) return null;
  return updateJob(next.id, (job) => {
    job.status = "running";
    job.startedAt = new Date().toISOString();
  });
}

/** Cancellation is cooperative: the worker polls this flag between steps. */
export async function requestCancel(id: string): Promise<void> {
  await fsp.mkdir(jobDir(id), { recursive: true });
  await fsp.writeFile(path.join(jobDir(id), "cancel"), "", "utf8");
}

export function isCancelRequested(id: string): boolean {
  return fs.existsSync(path.join(jobDir(id), "cancel"));
}

export async function clearCancel(id: string): Promise<void> {
  await fsp.rm(path.join(jobDir(id), "cancel"), { force: true });
}

export const abs = (relative: string): string => path.join(ROOT, relative);

/**
 * Record that a failed run has been retried.
 *
 * The link is what stops the same failure being retried twice from two open
 * tabs, and it lets the failed run's page point at where the work continued.
 */
export async function markRetried(
  parentId: string,
  childId: string,
): Promise<void> {
  await updateJob(parentId, (job) => {
    job.retriedBy = childId;
  });
}

/**
 * Claim a job for one exclusive operation, across processes.
 *
 * `wx` fails when the file exists, which is the only check-and-set the
 * filesystem gives us for free. Without it two clicks on Continue — or the
 * studio and `npm run requeue` at once — both pass the "already retried?" test
 * and both queue a run, because that test is a read followed by a write.
 */
export async function claim(id: string, name: string): Promise<boolean> {
  await fsp.mkdir(jobDir(id), { recursive: true });
  try {
    await fsp.writeFile(path.join(jobDir(id), `${name}.claim`), "", { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

export async function releaseClaim(id: string, name: string): Promise<void> {
  await fsp.rm(path.join(jobDir(id), `${name}.claim`), { force: true });
}

// ── interaction: the worker asks, the web app answers ───────────────────────
//
// The worker and the studio are separate processes, so a blocking question is
// passed through the same job directory everything else uses: the worker writes
// `pending` onto the job and polls for an answer file the API route drops in.

const answerFile = (jobId: string, interactionId: string) =>
  path.join(jobDir(jobId), "answers", `${interactionId}.json`);

export async function setPending(
  jobId: string,
  interaction: Interaction,
): Promise<void> {
  await updateJob(jobId, (job) => {
    job.pending = interaction;
  });
  await appendEvent(jobId, {
    kind: "ask",
    message:
      interaction.kind === "question"
        ? (interaction.questions?.[0]?.question ?? "The agent has a question")
        : `Review ${interaction.stage ?? "this step"} before continuing`,
    data: { interaction },
  });
}

export async function clearPending(jobId: string): Promise<void> {
  await updateJob(jobId, (job) => {
    job.pending = undefined;
  });
}

export async function writeAnswer(
  jobId: string,
  answer: InteractionAnswer,
): Promise<void> {
  await fsp.mkdir(path.join(jobDir(jobId), "answers"), { recursive: true });
  await writeAtomic(
    answerFile(jobId, answer.id),
    `${JSON.stringify(answer, null, 2)}\n`,
  );
}

export async function readAnswer(
  jobId: string,
  interactionId: string,
): Promise<InteractionAnswer | null> {
  try {
    return JSON.parse(
      await fsp.readFile(answerFile(jobId, interactionId), "utf8"),
    ) as InteractionAnswer;
  } catch {
    return null;
  }
}

/** Record a resolved interaction so a resumed run is not asked it again. */
export async function recordAnswered(
  jobId: string,
  interaction: Interaction,
  answer: InteractionAnswer,
): Promise<void> {
  await updateJob(jobId, (job) => {
    job.answered = [...(job.answered ?? []), { interaction, answer }];
    job.pending = undefined;
  });
}

// ── steering: non-blocking notes typed while a run is in flight ─────────────

const steerFile = (jobId: string) => path.join(jobDir(jobId), "steer.ndjson");

export async function pushSteer(jobId: string, text: string): Promise<void> {
  await fsp.mkdir(jobDir(jobId), { recursive: true });
  await fsp.appendFile(
    steerFile(jobId),
    `${JSON.stringify({ at: new Date().toISOString(), text })}\n`,
    "utf8",
  );
}

/** Read steering notes appended since `fromByte`. */
export async function readSteer(
  jobId: string,
  fromByte = 0,
): Promise<{ notes: string[]; nextByte: number }> {
  const file = steerFile(jobId);
  let size: number;
  try {
    size = (await fsp.stat(file)).size;
  } catch {
    return { notes: [], nextByte: 0 };
  }
  const start = fromByte > size ? 0 : fromByte;
  if (start === size) return { notes: [], nextByte: size };

  const handle = await fsp.open(file, "r");
  try {
    const buf = Buffer.alloc(size - start);
    await handle.read(buf, 0, buf.length, start);
    const text = buf.toString("utf8");
    const lastNewline = text.lastIndexOf("\n");
    if (lastNewline === -1) return { notes: [], nextByte: start };
    const complete = text.slice(0, lastNewline);
    const notes = complete
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [(JSON.parse(line) as { text: string }).text];
        } catch {
          return [];
        }
      });
    return {
      notes,
      nextByte: start + Buffer.byteLength(complete, "utf8") + 1,
    };
  } finally {
    await handle.close();
  }
}

// ── revision notes on a finished render ────────────────────────────────────

export async function addNote(
  jobId: string,
  note: RevisionNote,
): Promise<Job | null> {
  return updateJob(jobId, (job) => {
    job.notes = [...(job.notes ?? []), note];
  });
}

export async function removeNote(
  jobId: string,
  noteId: string,
): Promise<Job | null> {
  return updateJob(jobId, (job) => {
    job.notes = (job.notes ?? []).filter((n) => n.id !== noteId);
  });
}

/** Every job that has rendered from the same project directory, oldest first. */
export async function versionsOf(job: Job): Promise<Job[]> {
  const all = await listJobs();
  return all
    .filter((j) => j.projectDir === job.projectDir && j.videoPath)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ── deletion ────────────────────────────────────────────────────────────────

/** A run that is on the queue or in flight must not be deleted out from under the worker. */
const LIVE_STATUSES = new Set<Job["status"]>(["queued", "running", "awaiting-input"]);

export class DeleteRefused extends Error {}

/** A project path that resolves outside `projects/`. */
export class ProjectPathRefused extends Error {}

export type ConfinedPath =
  | { ok: true; file: string }
  | { ok: false; reason: "outside" | "missing" };

/**
 * Resolve `relative` under `root`, following symlinks, refusing anything that
 * ends up outside.
 *
 * The lexical check alone is not enough: `path.resolve` collapses `..` but
 * knows nothing about links, so a symlink inside a project directory pointing
 * at `~/.ssh` passes it. The agent writes freely inside its project, which is
 * exactly where such a link would come from — not maliciously, necessarily,
 * but a build step that links node_modules is enough.
 */
export async function confinedPath(
  root: string,
  relative: string,
): Promise<ConfinedPath> {
  const realRoot = await fsp.realpath(root).catch(() => path.resolve(root));
  const target = path.resolve(realRoot, relative);
  const inside = (p: string) => p === realRoot || p.startsWith(realRoot + path.sep);
  if (!inside(target)) return { ok: false, reason: "outside" };

  let real: string;
  try {
    real = await fsp.realpath(target);
  } catch {
    return { ok: false, reason: "missing" };
  }
  return inside(real) ? { ok: true, file: real } : { ok: false, reason: "outside" };
}

/**
 * Resolve a repo-relative project directory to an absolute path, refusing
 * anything that escapes `projects/`.
 *
 * `projectDir` reaches this from a job record, which the worker writes — but
 * the callers delete recursively, write files, and spawn a renderer with it as
 * cwd, so it is checked here rather than trusted. A `..` that slipped into a
 * record must not be able to reach the rest of the machine.
 */
export function projectPath(projectDir: string): string {
  const dir = path.resolve(ROOT, projectDir);
  if (dir !== PROJECTS_DIR && !dir.startsWith(PROJECTS_DIR + path.sep)) {
    throw new ProjectPathRefused(`"${projectDir}" is outside projects/.`);
  }
  if (dir === PROJECTS_DIR) {
    throw new ProjectPathRefused("That is the whole projects/ directory.");
  }
  return dir;
}

/**
 * Every job that shares a project directory, newest first.
 *
 * This is the grouping the library shows as one card: a revision reuses the
 * original project directory by design, so `projectDir` — not the slug, which
 * can be reassigned on a collision — is what identifies a project.
 */
export async function jobsInProject(projectDir: string): Promise<Job[]> {
  const all = await listJobs();
  return all
    .filter((j) => j.projectDir === projectDir)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The delete-flavoured wording of `projectPath`'s refusal. */
function resolveProjectDir(projectDir: string): string {
  try {
    return projectPath(projectDir);
  } catch (err) {
    throw new DeleteRefused(
      `Refusing to delete ${err instanceof Error ? err.message : projectDir}`,
    );
  }
}

/** Remove one job record. The project directory and its files are left alone. */
export async function deleteJob(id: string): Promise<void> {
  const job = await getJob(id);
  if (!job) throw new DeleteRefused("That job no longer exists.");
  if (LIVE_STATUSES.has(job.status)) {
    throw new DeleteRefused(
      `This run is ${job.status}. Cancel it first, then delete it.`,
    );
  }
  const dir = path.resolve(jobDir(id));
  if (!dir.startsWith(JOBS_DIR + path.sep)) {
    throw new DeleteRefused("Refusing to delete outside the jobs directory.");
  }
  await fsp.rm(dir, { recursive: true, force: true });
}

/**
 * Remove a whole project: every job record that points at it, and optionally
 * the generated files themselves.
 *
 * The two are separated because they are genuinely different intentions.
 * Dropping the records tidies the library; removing `projects/<slug>/` destroys
 * the compositions, captured assets and renders, which for an adopted example
 * is hand-authored work this platform never produced and cannot regenerate.
 */
export async function deleteProject(
  projectDir: string,
  { removeFiles = false }: { removeFiles?: boolean } = {},
): Promise<{ jobs: number; filesRemoved: boolean }> {
  const jobs = await jobsInProject(projectDir);
  const live = jobs.find((j) => LIVE_STATUSES.has(j.status));
  if (live) {
    throw new DeleteRefused(
      `A run in this project is ${live.status}. Cancel it first, then delete.`,
    );
  }

  // Resolve before deleting anything, so a bad path fails with the records intact.
  const dir = removeFiles ? resolveProjectDir(projectDir) : null;

  for (const job of jobs) {
    await fsp.rm(path.join(JOBS_DIR, job.id), { recursive: true, force: true });
  }
  if (dir) await fsp.rm(dir, { recursive: true, force: true });

  return { jobs: jobs.length, filesRemoved: Boolean(dir) };
}

// ── worker heartbeat ────────────────────────────────────────────────────────

const HEARTBEAT_FILE = path.join(DATA_DIR, "worker.json");

/**
 * How long a heartbeat stays believable.
 *
 * The worker beats once per queue poll, so this has to clear `pollMs` with room
 * for a slow tick. Being generous is the safe direction: reporting a live
 * worker as down is worse than a few seconds of lag, because the studio's
 * answer to "worker down" is to tell someone to go start it.
 */
const HEARTBEAT_STALE_MS = 15_000;

export type WorkerStatus = {
  running: boolean;
  pid?: number;
  startedAt?: string;
  beatAt?: string;
  /** Id of the job being worked, when the worker is busy. */
  currentJobId?: string;
  /** Milliseconds since the last beat, when there is one. */
  sinceMs?: number;
};

/** Record that the worker is alive, and what it is doing. */
export async function beat(currentJobId?: string): Promise<void> {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const startedAt = workerStartedAt ?? (workerStartedAt = new Date().toISOString());
  await writeAtomic(
    HEARTBEAT_FILE,
    JSON.stringify({
      pid: process.pid,
      startedAt,
      beatAt: new Date().toISOString(),
      currentJobId: currentJobId ?? null,
    }),
  );
}

let workerStartedAt: string | undefined;

/** Clear the heartbeat on a clean shutdown, so the studio says "stopped", not "stale". */
export async function clearBeat(): Promise<void> {
  await fsp.rm(HEARTBEAT_FILE, { force: true });
}

export async function readWorkerStatus(): Promise<WorkerStatus> {
  try {
    const raw = JSON.parse(await fsp.readFile(HEARTBEAT_FILE, "utf8"));
    const sinceMs = Date.now() - new Date(raw.beatAt).getTime();
    return {
      running: sinceMs < HEARTBEAT_STALE_MS,
      pid: raw.pid,
      startedAt: raw.startedAt,
      beatAt: raw.beatAt,
      currentJobId: raw.currentJobId ?? undefined,
      sinceMs,
    };
  } catch {
    return { running: false };
  }
}
