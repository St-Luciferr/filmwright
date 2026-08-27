import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("../src/config", () => import("./helpers/tmp-config"));

import { ROOT } from "../src/config";
import {
  SpecError,
  createJob,
  createRenderJob,
  createRevision,
  parseSpec,
} from "../src/create";
import { getJob, saveJob, updateJob } from "../src/store";
import type { Job, VideoSpec } from "../src/types";

afterAll(() => fs.rmSync(ROOT, { recursive: true, force: true }));

describe("parseSpec", () => {
  it("fills every default from a bare prompt", () => {
    const spec = parseSpec({ prompt: "Launch video for Acme" });
    expect(spec).toMatchObject({
      prompt: "Launch video for Acme",
      workflow: "product-launch-video",
      aspect: "9:16",
      seconds: 25,
      destination: "web",
      language: "en",
      narration: true,
      captions: true,
      music: true,
      interactive: true, // tmp-config sets interactiveByDefault
    });
    expect(spec.providers).toMatchObject({ voice: "kokoro", voiceId: "af_heart" });
  });

  it("requires a prompt", () => {
    expect(() => parseSpec({})).toThrow(SpecError);
    expect(() => parseSpec({ prompt: "   " })).toThrow(/prompt is required/i);
    expect(() => parseSpec(null)).toThrow(SpecError);
  });

  it("caps the prompt length", () => {
    expect(() => parseSpec({ prompt: "x".repeat(8001) })).toThrow(/too long/);
    expect(parseSpec({ prompt: "x".repeat(8000) }).prompt).toHaveLength(8000);
  });

  it("rejects unknown workflows and aspects", () => {
    expect(() => parseSpec({ prompt: "p", workflow: "podcast" })).toThrow(/Unknown workflow/);
    expect(() => parseSpec({ prompt: "p", aspect: "4:3" })).toThrow(/Unknown aspect/);
    expect(parseSpec({ prompt: "p", workflow: "slideshow", aspect: "1:1" })).toMatchObject({
      workflow: "slideshow",
      aspect: "1:1",
    });
  });

  it("bounds and rounds the length", () => {
    expect(() => parseSpec({ prompt: "p", seconds: 4 })).toThrow(/between 5 and 180/);
    expect(() => parseSpec({ prompt: "p", seconds: 181 })).toThrow(/between 5 and 180/);
    expect(() => parseSpec({ prompt: "p", seconds: "abc" })).toThrow(/between 5 and 180/);
    expect(parseSpec({ prompt: "p", seconds: 29.6 }).seconds).toBe(30);
    expect(parseSpec({ prompt: "p", seconds: "60" }).seconds).toBe(60);
  });

  it("requires source URLs to be http(s)", () => {
    expect(() => parseSpec({ prompt: "p", sourceUrl: "ftp://x" })).toThrow(/http/);
    expect(() => parseSpec({ prompt: "p", sourceUrl: "javascript:alert(1)" })).toThrow(/http/);
    expect(parseSpec({ prompt: "p", sourceUrl: "https://acme.dev" }).sourceUrl).toBe(
      "https://acme.dev",
    );
  });

  it("rejects unknown providers loudly instead of falling back", () => {
    expect(() => parseSpec({ prompt: "p", providers: { voice: "elevenlabs" } })).toThrow(
      /Unknown voice provider "elevenlabs"/,
    );
    expect(() => parseSpec({ prompt: "p", providers: { voiceId: "xx_fake" } })).toThrow(
      /Unknown voice "xx_fake"/,
    );
  });

  it("resolves valid provider choices", () => {
    const spec = parseSpec({
      prompt: "p",
      providers: { voice: "none", music: "openverse", image: "openverse", video: "wikimedia" },
    });
    expect(spec.providers).toEqual({
      voice: "none",
      music: "openverse",
      image: "openverse",
      video: "wikimedia",
      voiceId: undefined,
    });
  });

  it("lets explicit booleans beat the defaults", () => {
    const spec = parseSpec({ prompt: "p", narration: false, captions: false, music: false, interactive: false });
    expect(spec.narration).toBe(false);
    expect(spec.captions).toBe(false);
    expect(spec.music).toBe(false);
    expect(spec.interactive).toBe(false);
  });
});

let uniq = 0;
/**
 * A spec with a product name of its own, so each test gets its own project
 * directory — jobs that share a directory are siblings, and the live-run
 * guards under test would otherwise see earlier tests' jobs.
 */
const makeSpec = (): VideoSpec => parseSpec({ prompt: `Launch video for widget${++uniq}` });

describe("createJob", () => {
  it("queues version 1 with a slug-derived project directory", async () => {
    const job = await createJob(parseSpec({ prompt: "Launch video for Acme" }));
    expect(job.status).toBe("queued");
    expect(job.version).toBe(1);
    expect(job.slug).toBe("launch-acme");
    expect(job.projectDir).toBe(path.join("projects", job.slug));
    expect(job.interactive).toBe(true);
    expect(job.stages).toHaveLength(8);
    expect(job.stages.every((s) => s.status === "pending")).toBe(true);
    expect(await getJob(job.id)).toEqual(job);
    // Park it so it does not count as a live sibling for later tests.
    await updateJob(job.id, (j) => (j.status = "cancelled"));
  });
});

describe("createRenderJob", () => {
  const parent = async (over: Partial<Job> = {}): Promise<Job> => {
    const job = await createJob(makeSpec());
    return (await updateJob(job.id, (j) => {
      j.status = "succeeded";
      j.videoPath = `${j.projectDir}/renders/v1.mp4`;
      Object.assign(j, over);
    }))!;
  };

  it("queues a free re-render of the parent's directory", async () => {
    const p = await parent();
    const render = await createRenderJob(p, "caption edit");
    expect(render).toMatchObject({
      kind: "render",
      renderReason: "caption edit",
      status: "queued",
      slug: p.slug,
      projectDir: p.projectDir,
      resume: true,
      resumeOf: p.id,
      revisionOf: p.id,
      version: 2,
      interactive: false,
    });
  });

  it("derives the version from every sibling, not the parent alone", async () => {
    const p = await parent();
    await saveJob({ ...p, id: "other-v3", version: 3, status: "succeeded" });
    expect((await createRenderJob(p, "again")).version).toBe(4);
  });

  it("refuses while a run in the project is live", async () => {
    const p = await parent();
    const live = await createRenderJob(p, "first");
    await expect(createRenderJob(p, "second")).rejects.toThrow(/is queued/);
    await updateJob(live.id, (j) => (j.status = "cancelled"));
  });
});

describe("createRevision", () => {
  const note = { id: "n1", createdAt: new Date().toISOString(), text: "bigger logo" };

  it("requires notes and a rendered parent", async () => {
    const p = await createJob(makeSpec());
    await expect(createRevision(p, [note])).rejects.toThrow(/no render/);
    const rendered = (await updateJob(p.id, (j) => {
      j.status = "succeeded";
      j.videoPath = "x.mp4";
    }))!;
    await expect(createRevision(rendered, [])).rejects.toThrow(/at least one change/);
  });

  it("queues an authoring run carrying the notes into the same directory", async () => {
    const p = await createJob(makeSpec());
    const rendered = (await updateJob(p.id, (j) => {
      j.status = "succeeded";
      j.videoPath = "x.mp4";
      j.answered = [];
    }))!;
    const revision = await createRevision(rendered, [note]);
    expect(revision).toMatchObject({
      status: "queued",
      projectDir: p.projectDir,
      resume: true,
      revisionOf: p.id,
      version: 2,
      appliedNotes: [note],
    });
    expect(revision.kind).toBeUndefined(); // an authoring run, not a render
  });
});
