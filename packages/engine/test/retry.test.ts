import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("../src/config", () => import("./helpers/tmp-config"));

import { PROJECTS_DIR, ROOT } from "../src/config";
import { RetryRefused, retryAvailability, retryJob } from "../src/retry";
import { emptyStages, getJob, saveJob, updateJob } from "../src/store";
import type { Job } from "../src/types";

afterAll(() => fs.rmSync(ROOT, { recursive: true, force: true }));

let clock = Date.now();
const nextTime = () => new Date((clock += 1000)).toISOString();
let uniq = 0;

/** A failed job in a project directory of its own, with salvageable work in it. */
function makeJob(over: Partial<Job> = {}, opts: { work?: boolean } = {}): Job {
  const slug = over.slug ?? `retry-me-${++uniq}`;
  const job: Job = {
    id: randomUUID(),
    slug,
    status: "failed",
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
    projectDir: `projects/${slug}`,
    stages: emptyStages(),
    ...over,
  };
  if (opts.work !== false) {
    const dir = path.join(PROJECTS_DIR, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "BRIEF.md"), "brief");
  }
  return job;
}

describe("retryAvailability", () => {
  it("offers both modes for a failure with work on disk, recommending resume", async () => {
    const job = await saveJob(makeJob());
    const availability = await retryAvailability(job);
    expect(availability.retryable).toBe(true);
    expect(availability.resume.available).toBe(true);
    expect(availability.fresh.available).toBe(true);
    expect(availability.recommended).toBe("resume");
  });

  it("recommends fresh when the directory is empty", async () => {
    const job = await saveJob(makeJob({}, undefined));
    fs.rmSync(path.join(ROOT, job.projectDir), { recursive: true, force: true });
    const availability = await retryAvailability(job);
    expect(availability.retryable).toBe(true);
    expect(availability.resume.available).toBe(false);
    expect(availability.resume.reason).toMatch(/Nothing is left/);
    expect(availability.recommended).toBe("fresh");
  });

  it("is retryable from cancelled as well as failed", async () => {
    const job = await saveJob(makeJob({ status: "cancelled" }));
    expect((await retryAvailability(job)).retryable).toBe(true);
  });

  it.each([
    ["succeeded", /Use Revise/],
    ["imported", /adopted/],
    ["running", /is running/],
    ["queued", /is queued/],
  ] as const)("refuses a %s job", async (status, reason) => {
    const job = await saveJob(makeJob({ status }));
    const availability = await retryAvailability(job);
    expect(availability.retryable).toBe(false);
    expect(availability.reason).toMatch(reason);
    expect(availability.resume.available).toBe(false);
    expect(availability.fresh.available).toBe(false);
  });

  it("refuses while an earlier retry is still in flight", async () => {
    const child = await saveJob(makeJob({ status: "running" }));
    const parent = await saveJob(makeJob({ retriedBy: child.id }));
    const availability = await retryAvailability(parent);
    expect(availability.retryable).toBe(false);
    expect(availability.reason).toMatch(/already been retried/);
  });

  it("allows a second retry once the first one settled", async () => {
    const child = await saveJob(makeJob({ status: "failed" }));
    const parent = await saveJob(makeJob({ retriedBy: child.id }));
    expect((await retryAvailability(parent)).retryable).toBe(true);
  });

  it("refuses while a sibling run owns the project directory", async () => {
    const parent = await saveJob(makeJob());
    await saveJob(
      makeJob({ slug: parent.slug, projectDir: parent.projectDir, status: "awaiting-input" }),
    );
    const availability = await retryAvailability(parent);
    expect(availability.retryable).toBe(false);
    expect(availability.reason).toMatch(/overwrite each other/);
  });

  it("refuses to resume underneath a later successful run", async () => {
    const parent = await saveJob(makeJob());
    await saveJob(
      makeJob({
        slug: parent.slug,
        projectDir: parent.projectDir,
        status: "succeeded",
        version: 2,
      }),
    );
    const availability = await retryAvailability(parent);
    expect(availability.retryable).toBe(false);
    expect(availability.reason).toMatch(/finished successfully \(v2\)/);
  });

  it("never offers fresh for a render job — there is no prompt to rebuild from", async () => {
    const job = await saveJob(makeJob({ kind: "render", renderReason: "captions" }));
    const availability = await retryAvailability(job);
    expect(availability.resume.available).toBe(true);
    expect(availability.fresh.available).toBe(false);
    expect(availability.recommended).toBe("resume");
  });
});

describe("retryJob", () => {
  it("resume queues a continuation in the same directory", async () => {
    const parent = await saveJob(
      makeJob({
        attempt: 1,
        version: 2,
        revisionOf: "orig-id",
        appliedNotes: [{ id: "n1", createdAt: nextTime(), text: "bigger logo" }],
        answered: [],
        interactive: true,
      }),
    );
    const child = await retryJob(parent, "resume");
    expect(child).toMatchObject({
      status: "queued",
      slug: parent.slug,
      projectDir: parent.projectDir,
      resume: true,
      resumeOf: parent.id,
      retryOf: parent.id,
      attempt: 2,
      version: 2,
      revisionOf: "orig-id",
      interactive: true,
    });
    expect(child.appliedNotes).toEqual(parent.appliedNotes);
    expect((await getJob(parent.id))?.retriedBy).toBe(child.id);
  });

  it("fresh queues a new directory from the base slug", async () => {
    const parent = await saveJob(makeJob({ slug: "promo-3", attempt: 1 }));
    const child = await retryJob(parent, "fresh");
    expect(child.slug).toBe("promo");
    expect(child.projectDir).toBe(path.join("projects", "promo"));
    expect(child.resume).toBeUndefined();
    expect(child.version).toBe(1);
    expect(child.attempt).toBe(2);
    await updateJob(child.id, (j) => (j.status = "cancelled"));
  });

  it("fresh skips project names that are taken", async () => {
    const parent = await saveJob(makeJob({ slug: "busy-4" }));
    for (const name of ["busy", "busy-2"]) {
      const dir = path.join(PROJECTS_DIR, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "x"), "x");
    }
    const child = await retryJob(parent, "fresh");
    expect(child.slug).toBe("busy-3");
    await updateJob(child.id, (j) => (j.status = "cancelled"));
  });

  it("a retried render stays a render", async () => {
    const parent = await saveJob(makeJob({ kind: "render", renderReason: "captions" }));
    const child = await retryJob(parent, "resume");
    expect(child.kind).toBe("render");
    expect(child.renderReason).toBe("captions");
    await updateJob(child.id, (j) => (j.status = "cancelled"));
  });

  it("refuses a mode that is not available", async () => {
    const render = await saveJob(makeJob({ kind: "render" }));
    await expect(retryJob(render, "fresh")).rejects.toBeInstanceOf(RetryRefused);

    const done = await saveJob(makeJob({ status: "succeeded" }));
    await expect(retryJob(done, "resume")).rejects.toBeInstanceOf(RetryRefused);
  });

  it("the queued retry blocks a second retry of the same parent", async () => {
    const parent = await saveJob(makeJob());
    const child = await retryJob(parent, "resume");
    // The queued child is both this parent's retry and a live sibling in the
    // directory; either guard refusing is correct.
    await expect(retryJob(parent, "resume")).rejects.toBeInstanceOf(RetryRefused);
    await updateJob(child.id, (j) => (j.status = "cancelled"));
  });
});
