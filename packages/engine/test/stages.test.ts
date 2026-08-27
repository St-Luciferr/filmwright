import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  describeExisting,
  detectStages,
  findRender,
  hasSalvageableWork,
} from "../src/stages";
import type { Stage } from "../src/types";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "filmwright-stages-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const project = () => fs.mkdtempSync(path.join(tmp, "p-"));
const touch = (dir: string, file: string, body = "") => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), body);
};

const byStage = (dir: string, checkRan = false) =>
  Object.fromEntries(
    detectStages(dir, { checkRan }).map((s) => [s.stage, s]),
  ) as unknown as Record<Stage, { status: string; detail?: string }>;

describe("detectStages", () => {
  it("marks scaffold active on an empty project", () => {
    const s = byStage(project());
    expect(s.scaffold.status).toBe("active");
    expect(s.brief.status).toBe("pending");
    expect(s.render.status).toBe("pending");
  });

  it("derives done stages from artifacts on disk, and activates the first gap", () => {
    const dir = project();
    touch(dir, "hyperframes.json");
    touch(dir, "BRIEF.md");
    const s = byStage(dir);
    expect(s.scaffold.status).toBe("done");
    expect(s.brief.status).toBe("done");
    expect(s.script.status).toBe("active");
  });

  it("counts frames against the storyboard's plan", () => {
    const dir = project();
    touch(dir, "STORYBOARD.md", "## Frame 01 — hero\n## Frame 02 — features\n## Frame 03 — cta\n");
    touch(dir, "compositions/frames/f01.html");
    touch(dir, "compositions/frames/f02.html");
    let s = byStage(dir);
    expect(s.frames.status).not.toBe("done");
    expect(s.frames.detail).toBe("2/3 frames");

    touch(dir, "compositions/frames/f03.html");
    s = byStage(dir);
    expect(s.frames.status).toBe("done");
    expect(s.frames.detail).toBe("3/3 frames");
  });

  it("counts frames without a plan when STORYBOARD.md is absent", () => {
    const dir = project();
    touch(dir, "compositions/frames/f01.html");
    const s = byStage(dir);
    expect(s.frames.status).toBe("done");
    expect(s.frames.detail).toBe("1 frames");
  });

  it("reports which media landed", () => {
    const dir = project();
    touch(dir, "assets/voice/01.wav");
    touch(dir, "assets/bgm/track.wav");
    const s = byStage(dir);
    expect(s.media.status).toBe("done");
    expect(s.media.detail).toBe("voice · music");
  });

  it("takes check from the observed flag, not the filesystem", () => {
    const dir = project();
    expect(byStage(dir, false).check.status).not.toBe("done");
    expect(byStage(dir, true).check.status).toBe("done");
  });

  it("marks render done when an mp4 exists, naming it", () => {
    const dir = project();
    touch(dir, "renders/final.mp4");
    const s = byStage(dir);
    expect(s.render.status).toBe("done");
    expect(s.render.detail).toBe("final.mp4");
  });
});

describe("findRender", () => {
  it("returns null with no renders directory", () => {
    expect(findRender(project())).toBeNull();
  });

  it("returns the newest mp4, ignoring other files", () => {
    const dir = project();
    touch(dir, "renders/old.mp4");
    touch(dir, "renders/new.mp4");
    touch(dir, "renders/notes.txt");
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(dir, "renders", "old.mp4"), past, past);
    expect(findRender(dir)).toBe(path.join(dir, "renders", "new.mp4"));
  });
});

describe("hasSalvageableWork", () => {
  it("is false for a missing or empty directory", () => {
    expect(hasSalvageableWork(path.join(tmp, "nope"))).toBe(false);
    expect(hasSalvageableWork(project())).toBe(false);
  });

  it("ignores dotfiles", () => {
    const dir = project();
    touch(dir, ".DS_Store");
    expect(hasSalvageableWork(dir)).toBe(false);
    touch(dir, "BRIEF.md");
    expect(hasSalvageableWork(dir)).toBe(true);
  });
});

describe("describeExisting", () => {
  it("says nothing is there for an empty project", () => {
    expect(describeExisting(project())).toBe("- (nothing yet)");
  });

  it("lists real filenames for the continuation prompt", () => {
    const dir = project();
    touch(dir, "BRIEF.md");
    touch(dir, "SCRIPT.md");
    touch(dir, "compositions/frames/f01-hero.html");
    touch(dir, "compositions/frames/f02-cta.html");
    touch(dir, "assets/voice/01.wav");
    touch(dir, "renders/final.mp4");
    const text = describeExisting(dir);
    expect(text).toContain("- Brief: `BRIEF.md`");
    expect(text).toContain("- Script: `SCRIPT.md`");
    expect(text).toContain("Frame compositions (2): `f01-hero.html`, `f02-cta.html`");
    expect(text).toContain("Voiceover (1): `01.wav`");
    expect(text).toContain("- Render: `renders/final.mp4`");
  });
});
