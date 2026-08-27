import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildStoryboard, isStale, readManifest, sampleTime } from "../src/storyboard";
import type { StoryboardManifest } from "../src/types";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "filmwright-storyboard-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const project = () => fs.mkdtempSync(path.join(tmp, "p-"));
const touch = (dir: string, file: string, body = "") => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), body);
};
const setMtime = (file: string, msAgo: number) => {
  const t = new Date(Date.now() - msAgo);
  fs.utimesSync(file, t, t);
};

describe("sampleTime", () => {
  it("samples two thirds in, not the midpoint", () => {
    expect(sampleTime(10, 3)).toBeCloseTo(11.98, 2);
    expect(sampleTime(0, 6)).toBeCloseTo(3.96, 2);
  });

  it("never samples past duration - 0.1 for very short clips", () => {
    expect(sampleTime(10, 0.2)).toBeCloseTo(10.1, 2);
  });
});

describe("readManifest", () => {
  it("returns null when absent", async () => {
    expect(await readManifest(project())).toBeNull();
  });

  it("round-trips a written manifest", async () => {
    const dir = project();
    const manifest: StoryboardManifest = {
      capturedAt: new Date().toISOString(),
      capturedAtMs: Date.now(),
      frames: [],
    };
    touch(dir, "storyboard/manifest.json", JSON.stringify(manifest));
    expect(await readManifest(dir)).toEqual(manifest);
  });
});

describe("isStale", () => {
  function projectWithFrame(): { dir: string; manifest: StoryboardManifest } {
    const dir = project();
    touch(dir, "index.html", "<div></div>");
    touch(dir, "compositions/frames/f01.html", "<div></div>");
    setMtime(path.join(dir, "index.html"), 60_000);
    setMtime(path.join(dir, "compositions/frames/f01.html"), 60_000);
    const manifest: StoryboardManifest = {
      capturedAt: new Date().toISOString(),
      capturedAtMs: Date.now() - 30_000,
      frames: [
        { clipId: "f01", src: "compositions/frames/f01.html", start: 0, duration: 5, at: 3.3 },
      ],
    };
    return { dir, manifest };
  }

  it("no manifest is stale", () => {
    expect(isStale(project(), null)).toBe(true);
  });

  it("is current when nothing changed since capture", () => {
    const { dir, manifest } = projectWithFrame();
    expect(isStale(dir, manifest)).toBe(false);
  });

  it("goes stale when index.html is touched after capture", () => {
    const { dir, manifest } = projectWithFrame();
    fs.writeFileSync(path.join(dir, "index.html"), "<div>changed</div>");
    expect(isStale(dir, manifest)).toBe(true);
  });

  it("goes stale when a captured frame is edited or deleted", () => {
    const { dir, manifest } = projectWithFrame();
    fs.writeFileSync(path.join(dir, "compositions/frames/f01.html"), "<div>v2</div>");
    expect(isStale(dir, manifest)).toBe(true);

    const other = projectWithFrame();
    fs.rmSync(path.join(other.dir, "compositions/frames/f01.html"));
    expect(isStale(other.dir, other.manifest)).toBe(true);
  });

  it("is stale when the project itself is gone", () => {
    const { manifest } = projectWithFrame();
    expect(isStale(path.join(tmp, "nope"), manifest)).toBe(true);
  });
});

describe("buildStoryboard", () => {
  it("refuses a project with no frame compositions, before spawning anything", async () => {
    const dir = project();
    touch(dir, "index.html", "<div></div>");
    await expect(buildStoryboard(dir)).rejects.toThrow(/No frame compositions/);
  });

  it("returns a current manifest without recapturing", async () => {
    const dir = project();
    touch(dir, "index.html", "<div></div>");
    setMtime(path.join(dir, "index.html"), 60_000);
    const manifest: StoryboardManifest = {
      capturedAt: new Date().toISOString(),
      capturedAtMs: Date.now(),
      frames: [],
    };
    touch(dir, "storyboard/manifest.json", JSON.stringify(manifest));
    expect(await buildStoryboard(dir)).toEqual(manifest);
  });
});
