import fs from "node:fs";
import path from "node:path";
import { STAGES, type Stage, type StageState } from "./types";

const exists = (p: string) => fs.existsSync(p);

function countFiles(dir: string, ext: string): number {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(ext)).length;
  } catch {
    return 0;
  }
}

function dirHasFiles(dir: string): boolean {
  try {
    return fs.readdirSync(dir).some((f) => !f.startsWith("."));
  } catch {
    return false;
  }
}

/** How many frames STORYBOARD.md plans, so `frames` can report "4/7". */
function plannedFrameCount(projectDir: string): number | null {
  const storyboard = path.join(projectDir, "STORYBOARD.md");
  if (!exists(storyboard)) return null;
  try {
    const text = fs.readFileSync(storyboard, "utf8");
    // Frames are conventionally written as "## Frame 03 — ..." or "### 03 ...".
    const matches = text.match(/^#{2,3}\s+(?:frame\s+)?\d+/gim);
    return matches ? matches.length : null;
  } catch {
    return null;
  }
}

export function findRender(projectDir: string): string | null {
  const dir = path.join(projectDir, "renders");
  try {
    const mp4 = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".mp4"))
      .map((f) => path.join(dir, f))
      .sort(
        (a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs,
      );
    return mp4[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Derive stage progress from the project directory. This is deliberately
 * independent of the agent's narration — a stage is done only once its
 * artifact is on disk.
 *
 * `checkRan` is the one signal with no durable artifact, so the caller tracks
 * it from observed tool calls.
 */
export function detectStages(
  projectDir: string,
  opts: { checkRan: boolean },
): StageState[] {
  const framesDir = path.join(projectDir, "compositions", "frames");
  const frameCount = countFiles(framesDir, ".html");
  const planned = plannedFrameCount(projectDir);

  const assets = (name: string) =>
    dirHasFiles(path.join(projectDir, "assets", name));
  const mediaParts = [
    assets("voice") && "voice",
    assets("bgm") && "music",
    assets("sfx") && "sfx",
  ].filter(Boolean) as string[];

  const rendered = findRender(projectDir);

  const done: Record<Stage, { done: boolean; detail?: string }> = {
    scaffold: { done: exists(path.join(projectDir, "hyperframes.json")) },
    brief: { done: exists(path.join(projectDir, "BRIEF.md")) },
    script: { done: exists(path.join(projectDir, "SCRIPT.md")) },
    storyboard: { done: exists(path.join(projectDir, "STORYBOARD.md")) },
    frames: {
      done: frameCount > 0 && (planned === null || frameCount >= planned),
      detail: frameCount
        ? planned
          ? `${frameCount}/${planned} frames`
          : `${frameCount} frames`
        : undefined,
    },
    media: {
      done: mediaParts.length > 0,
      detail: mediaParts.length ? mediaParts.join(" · ") : undefined,
    },
    check: { done: opts.checkRan },
    render: {
      done: rendered !== null,
      detail: rendered ? path.basename(rendered) : undefined,
    },
  };

  // The first not-done stage is the active one; everything after it is pending.
  const firstPending = STAGES.findIndex((s) => !done[s].done);
  return STAGES.map((stage, i) => ({
    stage,
    status:
      done[stage].done
        ? "done"
        : i === firstPending
          ? "active"
          : "pending",
    detail: done[stage].detail,
  }));
}

/**
 * An inventory of what a project directory already contains, for the prompt
 * that continues a run. Listing real filenames matters: a resumed agent that is
 * only told "media is done" tends to re-generate it anyway.
 */
export function describeExisting(projectDir: string): string {
  const lines: string[] = [];

  const note = (label: string, file: string) => {
    if (exists(path.join(projectDir, file))) lines.push(`- ${label}: \`${file}\``);
  };
  note("Brief", "BRIEF.md");
  note("Design spec", "frame.md");
  note("Script", "SCRIPT.md");
  note("Storyboard", "STORYBOARD.md");

  const list = (label: string, dir: string, exts: string[]) => {
    const full = path.join(projectDir, dir);
    let files: string[];
    try {
      files = fs
        .readdirSync(full)
        .filter((f) => exts.some((e) => f.endsWith(e)))
        .sort();
    } catch {
      return;
    }
    if (files.length) {
      lines.push(`- ${label} (${files.length}): ${files.map((f) => `\`${f}\``).join(", ")}`);
    }
  };
  list("Frame compositions", "compositions/frames", [".html"]);
  list("Voiceover", "assets/voice", [".wav", ".mp3"]);
  list("Music", "assets/bgm", [".wav", ".mp3"]);
  list("SFX", "assets/sfx", [".wav", ".mp3"]);
  list("Captured screens", "capture/screenshots", [".png", ".jpg"]);

  const rendered = findRender(projectDir);
  if (rendered) lines.push(`- Render: \`renders/${path.basename(rendered)}\``);

  return lines.length ? lines.join("\n") : "- (nothing yet)";
}
