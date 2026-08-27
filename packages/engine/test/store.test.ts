import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("../src/config", () => import("./helpers/tmp-config"));

import { DATA_DIR, JOBS_DIR, PROJECTS_DIR, ROOT } from "../src/config";
import {
  DeleteRefused,
  ProjectPathRefused,
  addNote,
  appendEvent,
  beat,
  claim,
  claimNextJob,
  clearBeat,
  clearCancel,
  confinedPath,
  deleteJob,
  deleteProject,
  emptyStages,
  getJob,
  isCancelRequested,
  isProcessAlive,
  jobsInProject,
  listJobs,
  markRetried,
  projectPath,
  pushSteer,
  readAnswer,
  readEvents,
  readSteer,
  readWorkerStatus,
  recordAnswered,
  releaseClaim,
  removeNote,
  requestCancel,
  saveJob,
  setPending,
  updateJob,
  versionsOf,
  writeAnswer,
} from "../src/store";
import type { Interaction, InteractionAnswer, Job } from "../src/types";

afterAll(() => fs.rmSync(ROOT, { recursive: true, force: true }));

let clock = Date.now();
/** Distinct, ordered createdAt values without sleeping. */
const nextTime = () => new Date((clock += 1000)).toISOString();

function makeJob(over: Partial<Job> = {}): Job {
  const id = over.id ?? randomUUID();
  return {
    id,
    slug: "test-video",
    status: "queued",
    spec: {
      prompt: "a test video",
      workflow: "product-launch-video",
      aspect: "9:16",
      seconds: 25,
      destination: "web",
      language: "en",
      narration: true,
      captions: true,
      music: true,
    },
    createdAt: nextTime(),
    projectDir: `projects/${over.slug ?? "test-video"}`,
    stages: emptyStages(),
    ...over,
  };
}

describe("job records", () => {
  it("round-trips a job through save and get", async () => {
    const job = makeJob();
    await saveJob(job);
    expect(await getJob(job.id)).toEqual(job);
  });

  it("returns null for a job that does not exist", async () => {
    expect(await getJob("nope")).toBeNull();
  });

  it("updateJob applies the mutation and persists it", async () => {
    const job = await saveJob(makeJob());
    const updated = await updateJob(job.id, (j) => {
      j.status = "failed";
      j.error = "boom";
    });
    expect(updated?.status).toBe("failed");
    expect((await getJob(job.id))?.error).toBe("boom");
  });

  it("updateJob returns null for a missing job", async () => {
    expect(await updateJob("nope", () => {})).toBeNull();
  });

  it("listJobs sorts newest first and skips unreadable records", async () => {
    const a = await saveJob(makeJob({ slug: "list-a", projectDir: "projects/list-a" }));
    const b = await saveJob(makeJob({ slug: "list-b", projectDir: "projects/list-b" }));
    // A directory with a corrupt job.json must not take the listing down.
    const corrupt = path.join(JOBS_DIR, "corrupt-dir");
    fs.mkdirSync(corrupt, { recursive: true });
    fs.writeFileSync(path.join(corrupt, "job.json"), "{not json");

    const jobs = await listJobs();
    const ids = jobs.map((j) => j.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
    expect(ids).not.toContain("corrupt-dir");
  });
});

describe("claimNextJob", () => {
  it("claims the oldest queued job and marks it running", async () => {
    // Park every earlier queued job so this test owns the queue.
    for (const j of await listJobs()) {
      if (j.status === "queued") await updateJob(j.id, (x) => (x.status = "cancelled"));
    }
    const older = await saveJob(makeJob({ slug: "q-old", projectDir: "projects/q-old" }));
    const newer = await saveJob(makeJob({ slug: "q-new", projectDir: "projects/q-new" }));

    const claimed = await claimNextJob();
    expect(claimed?.id).toBe(older.id);
    expect(claimed?.status).toBe("running");
    expect(claimed?.startedAt).toBeDefined();

    expect((await claimNextJob())?.id).toBe(newer.id);
    expect(await claimNextJob()).toBeNull();
  });
});

describe("events", () => {
  it("appends and reads back events with a resumable offset", async () => {
    const id = randomUUID();
    await appendEvent(id, { kind: "log", message: "first" });
    await appendEvent(id, { kind: "stage", message: "second", data: { n: 1 } });

    const all = await readEvents(id);
    expect(all.events.map((e) => e.message)).toEqual(["first", "second"]);
    expect(all.events[0]!.at).toBeDefined();

    // Nothing new past the offset…
    const again = await readEvents(id, all.nextByte);
    expect(again.events).toEqual([]);
    expect(again.nextByte).toBe(all.nextByte);

    // …until something is appended.
    await appendEvent(id, { kind: "log", message: "third" });
    const tail = await readEvents(id, all.nextByte);
    expect(tail.events.map((e) => e.message)).toEqual(["third"]);
  });

  it("holds back a trailing partial line until its newline arrives", async () => {
    const id = randomUUID();
    await appendEvent(id, { kind: "log", message: "complete" });
    const { nextByte } = await readEvents(id);

    const file = path.join(JOBS_DIR, id, "events.ndjson");
    await fsp.appendFile(file, '{"at":"x","kind":"log","message":"partial"');
    const midFlight = await readEvents(id, nextByte);
    expect(midFlight.events).toEqual([]);
    expect(midFlight.nextByte).toBe(nextByte);

    await fsp.appendFile(file, "}\n");
    const done = await readEvents(id, nextByte);
    expect(done.events.map((e) => e.message)).toEqual(["partial"]);
  });

  it("starts over when the file shrank under the offset", async () => {
    const id = randomUUID();
    await appendEvent(id, { kind: "log", message: "one" });
    const { events } = await readEvents(id, 1_000_000);
    expect(events.map((e) => e.message)).toEqual(["one"]);
  });

  it("skips unparseable lines instead of failing the read", async () => {
    const id = randomUUID();
    await appendEvent(id, { kind: "log", message: "good" });
    await fsp.appendFile(path.join(JOBS_DIR, id, "events.ndjson"), "garbage line\n");
    await appendEvent(id, { kind: "log", message: "also good" });
    const { events } = await readEvents(id);
    expect(events.map((e) => e.message)).toEqual(["good", "also good"]);
  });

  it("reads nothing from a job with no events", async () => {
    expect(await readEvents("never-logged")).toEqual({ events: [], nextByte: 0 });
  });
});

describe("cancellation", () => {
  it("is a flag the worker can poll and clear", async () => {
    const id = randomUUID();
    expect(isCancelRequested(id)).toBe(false);
    await requestCancel(id);
    expect(isCancelRequested(id)).toBe(true);
    await clearCancel(id);
    expect(isCancelRequested(id)).toBe(false);
  });
});

describe("claims", () => {
  it("grants one holder at a time and frees on release", async () => {
    expect(await claim("op-a")).toBe(true);
    expect(await claim("op-a")).toBe(false);
    await releaseClaim("op-a");
    expect(await claim("op-a")).toBe(true);
    await releaseClaim("op-a");
  });

  it("keys are independent", async () => {
    expect(await claim("op-b")).toBe(true);
    expect(await claim("op-c")).toBe(true);
    await releaseClaim("op-b");
    await releaseClaim("op-c");
  });

  it("takes over a claim whose holder is expired", async () => {
    expect(await claim("op-stale")).toBe(true);
    // Age the claim past its 60s expiry; the pid is our own live one, which is
    // exactly the case the expiry exists for.
    const claims = path.join(DATA_DIR, "claims");
    for (const f of fs.readdirSync(claims).filter((f) => f.endsWith(".claim"))) {
      const file = path.join(claims, f);
      const held = JSON.parse(fs.readFileSync(file, "utf8"));
      held.at = new Date(Date.now() - 120_000).toISOString();
      fs.writeFileSync(file, JSON.stringify(held));
    }
    expect(await claim("op-stale")).toBe(true);
    await releaseClaim("op-stale");
  });

  it("takes over a claim held by a dead process", async () => {
    expect(await claim("op-dead")).toBe(true);
    const claims = path.join(DATA_DIR, "claims");
    for (const f of fs.readdirSync(claims).filter((f) => f.endsWith(".claim"))) {
      const file = path.join(claims, f);
      const held = JSON.parse(fs.readFileSync(file, "utf8"));
      if (held.pid !== process.pid) continue;
      held.pid = 2 ** 30; // far above any real pid on this machine
      fs.writeFileSync(file, JSON.stringify(held));
    }
    expect(await claim("op-dead")).toBe(true);
    await releaseClaim("op-dead");
  });
});

describe("isProcessAlive", () => {
  it("sees this very process", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it("does not see an absurd pid", () => {
    expect(isProcessAlive(2 ** 30)).toBe(false);
  });
});

describe("interactions", () => {
  const interaction = (): Interaction => ({
    id: randomUUID(),
    kind: "question",
    askedAt: new Date().toISOString(),
    questions: [
      {
        question: "Dark or light palette?",
        header: "Palette",
        options: [
          { label: "Dark" },
          { label: "Light" },
        ],
      },
    ],
  });

  it("setPending blocks the job and logs an ask event", async () => {
    const job = await saveJob(makeJob({ status: "running" }));
    const ask = interaction();
    await setPending(job.id, ask);
    expect((await getJob(job.id))?.pending?.id).toBe(ask.id);
    const { events } = await readEvents(job.id);
    expect(events.some((e) => e.kind === "ask" && e.message === "Dark or light palette?")).toBe(true);
  });

  it("answers pass through the answers directory", async () => {
    const job = await saveJob(makeJob({ status: "running" }));
    const ask = interaction();
    expect(await readAnswer(job.id, ask.id)).toBeNull();

    const answer: InteractionAnswer = {
      id: ask.id,
      answeredAt: new Date().toISOString(),
      answers: ["Dark"],
    };
    await writeAnswer(job.id, answer);
    expect(await readAnswer(job.id, ask.id)).toEqual(answer);
  });

  it("recordAnswered archives the exchange and clears pending", async () => {
    const job = await saveJob(makeJob({ status: "running" }));
    const ask = interaction();
    await setPending(job.id, ask);
    const answer: InteractionAnswer = {
      id: ask.id,
      answeredAt: new Date().toISOString(),
      answers: ["Dark"],
    };
    await recordAnswered(job.id, ask, answer);
    const after = await getJob(job.id);
    expect(after?.pending).toBeUndefined();
    expect(after?.answered).toEqual([{ interaction: ask, answer }]);
  });
});

describe("steering", () => {
  it("streams notes with a resumable offset", async () => {
    const id = randomUUID();
    expect(await readSteer(id)).toEqual({ notes: [], nextByte: 0 });
    await pushSteer(id, "warmer palette");
    const first = await readSteer(id);
    expect(first.notes).toEqual(["warmer palette"]);
    await pushSteer(id, "faster pace");
    const second = await readSteer(id, first.nextByte);
    expect(second.notes).toEqual(["faster pace"]);
  });
});

describe("revision notes", () => {
  it("adds and removes notes on the job record", async () => {
    const job = await saveJob(makeJob({ status: "succeeded" }));
    await addNote(job.id, { id: "n1", createdAt: nextTime(), text: "bigger logo" });
    await addNote(job.id, { id: "n2", createdAt: nextTime(), text: "slower outro", timeSec: 20 });
    expect((await getJob(job.id))?.notes?.map((n) => n.id)).toEqual(["n1", "n2"]);
    await removeNote(job.id, "n1");
    expect((await getJob(job.id))?.notes?.map((n) => n.id)).toEqual(["n2"]);
  });
});

describe("project grouping", () => {
  it("versionsOf returns rendered runs of the directory, oldest first", async () => {
    const dir = "projects/versions-here";
    const v1 = await saveJob(makeJob({ projectDir: dir, status: "succeeded", videoPath: "projects/versions-here/renders/a.mp4" }));
    await saveJob(makeJob({ projectDir: dir, status: "failed" })); // no render
    const v2 = await saveJob(makeJob({ projectDir: dir, status: "succeeded", videoPath: "projects/versions-here/renders/b.mp4" }));
    await saveJob(makeJob({ projectDir: "projects/elsewhere", status: "succeeded", videoPath: "x.mp4" }));

    expect((await versionsOf(v1)).map((j) => j.id)).toEqual([v1.id, v2.id]);
  });

  it("jobsInProject returns every run of the directory, newest first", async () => {
    const dir = "projects/family";
    const a = await saveJob(makeJob({ projectDir: dir, status: "failed" }));
    const b = await saveJob(makeJob({ projectDir: dir, status: "succeeded" }));
    expect((await jobsInProject(dir)).map((j) => j.id)).toEqual([b.id, a.id]);
  });

  it("markRetried links parent to child", async () => {
    const parent = await saveJob(makeJob({ status: "failed" }));
    await markRetried(parent.id, "child-id");
    expect((await getJob(parent.id))?.retriedBy).toBe("child-id");
  });
});

describe("confinedPath", () => {
  const root = path.join(ROOT, "confine-root");

  it("accepts a real file inside the root", async () => {
    fs.mkdirSync(path.join(root, "sub"), { recursive: true });
    fs.writeFileSync(path.join(root, "sub", "ok.txt"), "x");
    expect(await confinedPath(root, "sub/ok.txt")).toEqual({
      ok: true,
      file: await fsp.realpath(path.join(root, "sub", "ok.txt")),
    });
  });

  it("refuses a path that climbs out", async () => {
    expect(await confinedPath(root, "../outside.txt")).toEqual({ ok: false, reason: "outside" });
  });

  it("refuses the root itself", async () => {
    expect(await confinedPath(root, ".")).toEqual({ ok: false, reason: "outside" });
  });

  it("reports a missing file", async () => {
    expect(await confinedPath(root, "nope.txt")).toEqual({ ok: false, reason: "missing" });
  });

  it("reports a directory as missing — callers stream files", async () => {
    expect(await confinedPath(root, "sub")).toEqual({ ok: false, reason: "missing" });
  });

  it("refuses a symlink that points outside, even though it sits inside", async () => {
    const secret = path.join(ROOT, "secret.txt");
    fs.writeFileSync(secret, "s3cret");
    fs.symlinkSync(secret, path.join(root, "sneaky.txt"));
    expect(await confinedPath(root, "sneaky.txt")).toEqual({ ok: false, reason: "outside" });
  });
});

describe("projectPath", () => {
  it("resolves a directory under projects/", async () => {
    fs.mkdirSync(path.join(PROJECTS_DIR, "legit"), { recursive: true });
    expect(await projectPath("projects/legit")).toBe(
      path.join(await fsp.realpath(PROJECTS_DIR), "legit"),
    );
  });

  it("allows a path whose tail does not exist yet", async () => {
    await expect(projectPath("projects/legit/renders/history")).resolves.toContain("legit");
  });

  it("refuses the whole projects/ directory", async () => {
    await expect(projectPath("projects")).rejects.toBeInstanceOf(ProjectPathRefused);
    await expect(projectPath("projects/legit/..")).rejects.toBeInstanceOf(ProjectPathRefused);
  });

  it("refuses lexical escapes", async () => {
    await expect(projectPath("projects/../data")).rejects.toBeInstanceOf(ProjectPathRefused);
    await expect(projectPath("data/jobs")).rejects.toBeInstanceOf(ProjectPathRefused);
    await expect(projectPath("/etc")).rejects.toBeInstanceOf(ProjectPathRefused);
  });

  it("refuses a symlinked project directory that resolves elsewhere", async () => {
    const elsewhere = path.join(ROOT, "elsewhere");
    fs.mkdirSync(path.join(elsewhere, "sub"), { recursive: true });
    fs.symlinkSync(elsewhere, path.join(PROJECTS_DIR, "linked"));
    await expect(projectPath("projects/linked")).rejects.toBeInstanceOf(ProjectPathRefused);
    await expect(projectPath("projects/linked/sub")).rejects.toBeInstanceOf(ProjectPathRefused);
  });
});

describe("deletion", () => {
  it("refuses to delete a live run", async () => {
    for (const status of ["queued", "running", "awaiting-input"] as const) {
      const job = await saveJob(makeJob({ status }));
      await expect(deleteJob(job.id)).rejects.toBeInstanceOf(DeleteRefused);
      expect(await getJob(job.id)).not.toBeNull();
    }
  });

  it("refuses a job that does not exist", async () => {
    await expect(deleteJob("missing")).rejects.toThrow(/no longer exists/);
  });

  it("deletes a settled job's record, leaving the project files alone", async () => {
    const dir = path.join(PROJECTS_DIR, "keep-files");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "BRIEF.md"), "x");
    const job = await saveJob(makeJob({ status: "failed", projectDir: "projects/keep-files" }));
    await deleteJob(job.id);
    expect(await getJob(job.id)).toBeNull();
    expect(fs.existsSync(path.join(dir, "BRIEF.md"))).toBe(true);
  });

  it("deleteProject refuses while any run in it is live", async () => {
    const dir = "projects/busy-project";
    await saveJob(makeJob({ projectDir: dir, status: "failed" }));
    const live = await saveJob(makeJob({ projectDir: dir, status: "running" }));
    await expect(deleteProject(dir)).rejects.toBeInstanceOf(DeleteRefused);
    await updateJob(live.id, (j) => (j.status = "cancelled"));
  });

  it("deleteProject drops records and, only when asked, the files", async () => {
    const rel = "projects/doomed";
    const dir = path.join(PROJECTS_DIR, "doomed");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "BRIEF.md"), "x");
    const a = await saveJob(makeJob({ projectDir: rel, status: "failed" }));
    const b = await saveJob(makeJob({ projectDir: rel, status: "succeeded" }));

    const recordsOnly = await deleteProject(rel);
    expect(recordsOnly).toEqual({ jobs: 2, filesRemoved: false });
    expect(await getJob(a.id)).toBeNull();
    expect(await getJob(b.id)).toBeNull();
    expect(fs.existsSync(dir)).toBe(true);

    await saveJob(makeJob({ projectDir: rel, status: "failed" }));
    const withFiles = await deleteProject(rel, { removeFiles: true });
    expect(withFiles).toEqual({ jobs: 1, filesRemoved: true });
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("deleteProject with a bad path fails before touching the records", async () => {
    const rel = "projects/../data";
    const job = await saveJob(makeJob({ projectDir: rel, status: "failed" }));
    await expect(deleteProject(rel, { removeFiles: true })).rejects.toBeInstanceOf(DeleteRefused);
    expect(await getJob(job.id)).not.toBeNull();
    expect(fs.existsSync(DATA_DIR)).toBe(true);
  });
});

describe("worker heartbeat", () => {
  it("reads back a fresh beat as running, with the current job", async () => {
    await beat("job-123");
    const status = await readWorkerStatus();
    expect(status.running).toBe(true);
    expect(status.pid).toBe(process.pid);
    expect(status.currentJobId).toBe("job-123");
    expect(status.sinceMs).toBeGreaterThanOrEqual(0);
  });

  it("treats a stale beat as down", async () => {
    await beat();
    const file = path.join(DATA_DIR, "worker.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    raw.beatAt = new Date(Date.now() - 60_000).toISOString();
    fs.writeFileSync(file, JSON.stringify(raw));
    expect((await readWorkerStatus()).running).toBe(false);
  });

  it("clearBeat reports a clean stop", async () => {
    await beat();
    await clearBeat();
    expect(await readWorkerStatus()).toEqual({ running: false });
  });
});
