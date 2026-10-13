import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("../src/config", () => import("./helpers/tmp-config"));

import {
  WORKFLOW,
  contractFor,
  dispatchInstruction,
  durationTolerance,
  firstUnsatisfied,
  orphanFrames,
  planFor,
  plannedFrames,
  storyboardBlocks,
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

/** A storyboard the packet builder can split: `## Frame` headings with src and duration. */
const storyboard = (ids: string[], seconds = 10): string =>
  ids
    .map(
      (id, i) =>
        `## Frame ${String(i + 1).padStart(2, "0")} — ${id}\n` +
        `- src: compositions/frames/${id}.html\n- duration: ${seconds}s\n- scene: ${id}\n\n` +
        "x".repeat(120),
    )
    .join("\n\n");

/** A project with everything up to `check` satisfied. */
function wired(seconds = 25): string {
  const dir = project();
  write(dir, "SCRIPT.md", "S".repeat(300));
  write(dir, "STORYBOARD.md", storyboard(["01-a", "02-b"], seconds / 2));
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

  it("requires `## Frame` headings the packet builder can split on", () => {
    const dir = project();
    write(dir, "STORYBOARD.md", "A".repeat(300));
    expect(validate("storyboard", dir)).toMatch(/no `## Frame NN — Title` headings/);
    // An H3 counts for progress but cannot be fanned out.
    write(dir, "STORYBOARD.md", `### 01 Hook\n- src: compositions/frames/01-a.html\n- duration: 4s\n${"x".repeat(300)}`);
    expect(validate("storyboard", dir)).toMatch(/no `## Frame NN — Title` headings/);
    write(dir, "STORYBOARD.md", storyboard(["01-a"]));
    expect(validate("storyboard", dir)).toBeNull();
  });

  it("requires every frame to carry a src under compositions/frames and a duration", () => {
    const dir = project();
    write(dir, "STORYBOARD.md", `## Frame 01 — Hook\n- duration: 4s\n${"x".repeat(300)}`);
    expect(validate("storyboard", dir)).toMatch(/Frame 01 — Hook needs `src:`/);
    write(dir, "STORYBOARD.md", `## Frame 01 — Hook\n- src: frames/01.html\n${"x".repeat(300)}`);
    expect(validate("storyboard", dir)).toMatch(/under `compositions\/frames\/`/);
    expect(validate("storyboard", dir)).toMatch(/and `duration:`/);
    write(
      dir,
      "STORYBOARD.md",
      storyboard(["01-a"]) + "\n\n## Frame 02 — Dup\n- src: compositions/frames/01-a.html\n- duration: 3s\n",
    );
    expect(validate("storyboard", dir)).toMatch(/used twice/);
    expect(storyboardBlocks(dir).map((b) => b.heading)).toEqual(["01 — 01-a", "02 — Dup"]);
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
    // Headings alone no longer satisfy the storyboard: it must split into packets.
    expect(firstUnsatisfied(job(), dir)?.stage).toBe("storyboard");
    write(dir, "STORYBOARD.md", storyboard(["01-a", "02-b"]));
    expect(firstUnsatisfied(job(), dir)?.stage).toBe("media");

    // Everything wired and on target: nothing left for the agent to do.
    expect(firstUnsatisfied(job(), wired(25))).toBeUndefined();
  });
});

describe("dispatchInstruction", () => {
  const opts = {
    projectDir: "/p",
    width: 1080,
    height: 1920,
    captions: "Captions: enabled",
    assemble: null as string | null,
  };

  it("asks for one frame-worker per frame, in parallel, and verifies on disk", () => {
    const text = dispatchInstruction(["01-a", "02-b"], opts);
    expect(text).toContain('subagent_type: "frame-worker"');
    expect(text).toContain("one call per frame");
    expect(text).toContain("`01-a` → `.hyperframes/frame-packets/01-a.md` → writes `compositions/frames/01-a.html`");
    expect(text).toContain("done when its file exists on disk");
    expect(text).toContain("re-dispatch that one frame once");
    expect(text).toContain("Canvas: 1080x1920");
    expect(text).toContain("timeline --json");
    expect(text).not.toContain("assemble-index");
  });

  it("names the workflow's assembler when it has one", () => {
    const text = dispatchInstruction(["01-a"], { ...opts, assemble: "/skills/x/scripts/assemble-index.mjs" });
    expect(text).toContain("node /skills/x/scripts/assemble-index.mjs --storyboard STORYBOARD.md --hyperframes .");
  });
});
