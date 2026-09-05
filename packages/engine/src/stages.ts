import fs from "node:fs";
import path from "node:path";
import { readTimeline, isFrame } from "./timeline";
import { STAGES, type Stage, type StageState } from "./types";

const exists = (p: string) => fs.existsSync(p);

function countFiles(dir: string, ext: string): number {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(ext)).length;
  } catch {
    return 0;
  }
}

function filesIn(projectDir: string, dir: string, exts: string[]): string[] {
  try {
    return fs
      .readdirSync(path.join(projectDir, dir))
      .filter((f) => exts.some((e) => f.endsWith(e)))
      .sort();
  } catch {
    return [];
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

/**
 * Whether a project directory holds anything a continued run could reuse.
 *
 * Deliberately generous: even a bare scaffold means the expensive `init` and
 * the brief are done, and continuing from it beats paying for them again.
 */
export function hasSalvageableWork(projectDir: string): boolean {
  try {
    return fs.readdirSync(projectDir).some((f) => !f.startsWith("."));
  } catch {
    return false;
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
 * that continues a run.
 *
 * This is deliberately more than a file listing. Measured across the resumed
 * runs on disk, an agent handed only filenames spent a mean of 12 minutes and
 * 24-54 tool calls re-reading the project before its first productive edit —
 * re-deriving the timing map, the asset wiring and the runtime that are all
 * already knowable from `index.html`. Everything that survey would have found
 * is stated here instead, so a continuation can open a file only when it is
 * about to change it.
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
    const files = filesIn(projectDir, dir, exts);
    if (files.length) {
      lines.push(`- ${label} (${files.length}): ${files.map((f) => `\`${f}\``).join(", ")}`);
    }
  };
  list("Voiceover", "assets/voice", [".wav", ".mp3"]);
  list("Music", "assets/bgm", [".wav", ".mp3"]);
  list("SFX", "assets/sfx", [".wav", ".mp3"]);
  list("Images", "assets/images", [".jpg", ".jpeg", ".png", ".svg", ".webp"]);
  list("Captured screens", "capture/screenshots", [".png", ".jpg"]);

  const rendered = findRender(projectDir);
  if (rendered) lines.push(`- Render: \`renders/${path.basename(rendered)}\``);

  const timeline = describeTimeline(projectDir);
  const orphans = describeOrphanFrames(projectDir);

  const body = lines.length ? lines.join("\n") : "- (nothing yet)";
  return [body, timeline, orphans].filter(Boolean).join("\n\n");
}

/**
 * The timing map, read from the same `data-start` / `data-duration` attributes
 * the renderer uses. A continuation asks "what is on screen when, and does the
 * total still land on target" almost immediately; answering it up front is
 * worth more than any other line in the prompt.
 */
function describeTimeline(projectDir: string): string {
  const clips = readTimeline(projectDir);
  const frames = clips.filter(isFrame);
  if (!frames.length) return "";

  const end = Math.max(...frames.map((c) => c.start + c.duration));
  const rows = frames.map((c) => {
    const src = c.src ? path.basename(c.src) : c.id;
    const assets = frameAssets(projectDir, c.src);
    const suffix = assets ? ` — ${assets}` : "";
    return `  ${c.start.toFixed(2).padStart(7)}s +${c.duration.toFixed(2)}s  \`${src}\`${suffix}`;
  });

  const overlays = clips.filter((c) => !isFrame(c));
  const overlayLine = overlays.length
    ? `\nFull-span overlays: ${overlays.map((c) => `\`${c.id}\``).join(", ")}.`
    : "";

  const count = `${frames.length} frame${frames.length === 1 ? "" : "s"}`;
  return `### Timeline already wired in \`index.html\` (${count}, ${end.toFixed(2)}s total)

${rows.join("\n")}${overlayLine}

These numbers are the live timing, not a plan. Trust them instead of re-reading
the frames to work out what runs when.`;
}

/** The assets a frame references, so the agent need not grep for them. */
function frameAssets(projectDir: string, src: string | undefined): string {
  if (!src) return "";
  let html: string;
  try {
    html = fs.readFileSync(path.join(projectDir, src), "utf8");
  } catch {
    return "missing file";
  }
  const refs = new Set<string>();
  for (const m of html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)) {
    const ref = m[1];
    // Fonts are boilerplate on every frame and say nothing about the shot.
    if (ref && !ref.startsWith("assets/fonts/")) refs.add(path.basename(ref));
  }
  return [...refs].join(", ");
}

/**
 * Frame files on disk that `index.html` never places. These are the artefacts a
 * previous run authored and did not get to wire up, and they are exactly the
 * work a continuation should pick up first.
 */
function describeOrphanFrames(projectDir: string): string {
  const authored = filesIn(projectDir, "compositions/frames", [".html"]);
  if (!authored.length) return "";
  const placed = new Set(
    readTimeline(projectDir)
      .map((c) => (c.src ? path.basename(c.src) : null))
      .filter(Boolean) as string[],
  );
  const orphans = authored.filter((f) => !placed.has(f));
  if (!orphans.length) {
    return `All ${authored.length} authored frames are placed on the timeline.`;
  }
  return `### Authored but NOT placed on the timeline (${orphans.length})

${orphans.map((f) => `- \`compositions/frames/${f}\``).join("\n")}

These exist on disk and are absent from \`index.html\`. Wiring them up is
almost certainly where the previous run stopped.`;
}
