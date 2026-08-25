import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { JOBS_DIR, ROOT } from "./config";
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
  const tmp = `${file}.${process.pid}.tmp`;
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
