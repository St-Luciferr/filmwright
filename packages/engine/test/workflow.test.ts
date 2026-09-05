import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("../src/config", () => import("./helpers/tmp-config"));

import {
  WORKFLOW,
  contractFor,
  durationTolerance,
  firstUnsatisfied,
  orphanFrames,
  planFor,
  plannedFrames,
  timelineSeconds,
  type StageContext,
} from "../src/workflow";
import type { Job, VideoSpec } from "../src/types";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "filmwright-workflow-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

let n = 0;
const project = (): string => {
  const dir = path.join(tmp, `p${n++}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const write = (dir: string, file: string, body: string) => {
  const full = path.join(dir, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, "utf8");
};

const spec = (over: Partial<VideoSpec> = {}): VideoSpec => ({
  prompt: "a video",
  workflow: "product-launch-video",
  aspect: "9:16",
  seconds: 25,
  destination: "tiktok",
  language: "en",
  narration: true,
  captions: true,
  music: true,
  ...over,
});

const job = (over: Partial<VideoSpec> = {}): Job =>
  ({ id: "j", slug: "s", spec: spec(over) }) as Job;

const ctx = (projectDir: string, over: Partial<VideoSpec> = {}): StageContext => ({
  job: job(over),
  projectDir,
  signal: new AbortController().signal,
  log: () => {},
});

/** A project with everything up to `check` satisfied. */
function wired(seconds = 25): string {
  const dir = project();
  write(dir, "SCRIPT.md", "S".repeat(300));
  write(dir, "STORYBOARD.md", `## Frame 01\n${"x".repeat(200)}\n## Frame 02\n`);
  write(dir, "assets/voice/01.wav", "audio");
  write(dir, "assets/bgm/track.wav", "audio");
  write(dir, "compositions/frames/01-a.html", "<template></template>");
  write(dir, "compositions/frames/02-b.html", "<template></template>");
  const half = seconds / 2;
  write(
    dir,
    "index.html",
    [
      `<div data-composition-id="01-a" data-composition-src="compositions/frames/01-a.html" data-start="0" data-duration="${half}"></div>`,
      `<div data-composition-id="02-b" data-composition-src="compositions/frames/02-b.html" data-start="${half}" data-duration="${half}"></div>`,
    ].join("\n"),
  );
  return dir;
}

const validate = (stage: string, dir: string, over: Partial<VideoSpec> = {}) =>
  contractFor(stage as never)!.validate(ctx(dir, over));

describe("the plan", () => {
  it("runs media before frames, because a frame's duration comes from its audio", () => {
    const order = planFor(job()).map((c) => c.stage);
    expect(order.indexOf("media")).toBeLessThan(order.indexOf("frames"));
  });

  it("drops the media stage when there is nothing to source", () => {
    const stages = planFor(job({ narration: false, music: false })).map((c) => c.stage);
    expect(stages).not.toContain("media");
    // Narration alone is enough to keep it.
    expect(planFor(job({ narration: true, music: false })).map((c) => c.stage)).toContain(
      "media",
    );
  });

  it("gates the script, the storyboard, and the render — and only those", () => {
    expect(WORKFLOW.filter((c) => c.gateAfter).map((c) => c.stage)).toEqual([
      "script",
      "storyboard",
    ]);
    expect(WORKFLOW.filter((c) => c.gateBefore).map((c) => c.stage)).toEqual(["render"]);
  });

  it("performs check and render itself rather than asking for them", () => {
    for (const stage of ["check", "render"] as const) {
      const contract = contractFor(stage)!;
      expect(contract.instruct).toBeUndefined();
      expect(contract.run).toBeDefined();
    }
  });
});

describe("document stages", () => {
  it("does not accept a file that merely exists", () => {
    const dir = project();
    expect(validate("script", dir)).toMatch(/does not exist/);
    write(dir, "SCRIPT.md", "");
    expect(validate("script", dir)).toMatch(/essentially empty/);
    write(dir, "SCRIPT.md", "S".repeat(300));
    expect(validate("script", dir)).toBeNull();
  });

  it("requires the storyboard to declare countable frames", () => {
    const dir = project();
    write(dir, "STORYBOARD.md", "A".repeat(300));
    expect(validate("storyboard", dir)).toMatch(/no frame headings/);
    write(dir, "STORYBOARD.md", `## Frame 01\n${"x".repeat(300)}`);
    expect(validate("storyboard", dir)).toBeNull();
  });

  it("counts the frames a storyboard plans", () => {
    const dir = project();
    write(dir, "STORYBOARD.md", "## Frame 01\n## Frame 02\n### 03 also counts\n");
    expect(plannedFrames(dir)).toBe(3);
    expect(plannedFrames(project())).toBeNull();
  });
});

describe("media stage", () => {
  it("asks only for what the brief wants", () => {
    const dir = project();
    expect(validate("media", dir)).toMatch(/assets\/voice/);
    expect(validate("media", dir)).toMatch(/assets\/bgm/);
    write(dir, "assets/voice/01.wav", "a");
    expect(validate("media", dir)).toMatch(/assets\/bgm/);
    write(dir, "assets/bgm/track.wav", "a");
    expect(validate("media", dir)).toBeNull();
  });

  it("is satisfied when music is not wanted", () => {
    const dir = project();
    write(dir, "assets/voice/01.wav", "a");
    expect(validate("media", dir, { music: false })).toBeNull();
  });
});

describe("frames stage", () => {
  it("holds until every planned frame is authored", () => {
    const dir = project();
    write(dir, "STORYBOARD.md", "## Frame 01\n## Frame 02\n");
    expect(validate("frames", dir)).toMatch(/No frame compositions/);
    write(dir, "compositions/frames/01-a.html", "<template></template>");
    expect(validate("frames", dir)).toMatch(/Only 1 of the 2 frames/);
  });

  it("holds until every authored frame is placed on the timeline", () => {
    const dir = wired();
    write(dir, "compositions/frames/03-orphan.html", "<template></template>");
    write(dir, "STORYBOARD.md", "## Frame 01\n## Frame 02\n## Frame 03\n" + "x".repeat(200));
    expect(validate("frames", dir)).toMatch(/not placed on the timeline/);
    expect(orphanFrames(dir)).toEqual(["03-orphan.html"]);
  });

  it("passes when every frame is authored and wired", () => {
    expect(validate("frames", wired())).toBeNull();
  });
});

describe("check stage", () => {
  it("reads the runtime off the wired timeline", () => {
    expect(timelineSeconds(wired(30))).toBeCloseTo(30);
    expect(timelineSeconds(project())).toBeNull();
  });

  it("scales the tolerance with the target, with a floor for short pieces", () => {
    expect(durationTolerance(25)).toBeCloseTo(5);
    expect(durationTolerance(180)).toBeCloseTo(36);
    // A 5s piece would otherwise be held to a 1s window.
    expect(durationTolerance(5)).toBe(2);
  });

  it("rejects a timeline that misses the brief's duration", () => {
    // 60s wired against a 25s brief is not the video that was asked for.
    expect(validate("check", wired(60))).toMatch(/runs 60.0s against a 25s brief/);
  });

  it("accepts a timeline within tolerance", () => {
    expect(validate("check", wired(27))).toBeNull();
  });

  it("refuses to pass an empty timeline", () => {
    expect(validate("check", project())).toMatch(/no frames on its timeline/);
  });
});

describe("firstUnsatisfied", () => {
  it("names the stage a resumed run should pick up on", () => {
    expect(firstUnsatisfied(job(), project())?.stage).toBe("script");

    const dir = project();
    write(dir, "SCRIPT.md", "S".repeat(300));
    write(dir, "STORYBOARD.md", `## Frame 01\n${"x".repeat(300)}`);
    expect(firstUnsatisfied(job(), dir)?.stage).toBe("media");

    // Everything wired and on target: nothing left for the agent to do.
    expect(firstUnsatisfied(job(), wired(25))).toBeUndefined();
  });
});
