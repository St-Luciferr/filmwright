import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { hyperframes } from "./config";
import { runCommand } from "./render";
import { isFrame, readTimeline } from "./timeline";
import type { StoryboardFrame, StoryboardManifest } from "./types";

const DIR = "storyboard";

const manifestPath = (projectDir: string) =>
  path.join(projectDir, DIR, "manifest.json");

/**
 * Where to sample a clip for a still.
 *
 * Not the midpoint: most frames animate their content in over the first half,
 * so a midpoint shot catches type sliding through the frame. Two thirds in, the
 * reveal has landed and what you see is what the frame is meant to look like.
 */
export const sampleTime = (start: number, duration: number): number =>
  Math.round((start + Math.min(duration * 0.66, duration - 0.1)) * 100) / 100;

export async function readManifest(
  projectDir: string,
): Promise<StoryboardManifest | null> {
  try {
    return JSON.parse(
      await fsp.readFile(manifestPath(projectDir), "utf8"),
    ) as StoryboardManifest;
  } catch {
    return null;
  }
}

/**
 * True when the composition has changed since the storyboard was captured, so
 * the stills on screen no longer show what would render.
 */
export function isStale(
  projectDir: string,
  manifest: StoryboardManifest | null,
): boolean {
  if (!manifest) return true;
  try {
    const index = fs.statSync(path.join(projectDir, "index.html")).mtimeMs;
    if (index > manifest.capturedAtMs) return true;
    for (const frame of manifest.frames) {
      if (!frame.src) continue;
      const file = path.join(projectDir, frame.src);
      if (!fs.existsSync(file)) return true;
      if (fs.statSync(file).mtimeMs > manifest.capturedAtMs) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Capture one still per frame so the composition can be reviewed as a
 * storyboard before it is rendered.
 *
 * Stills come from the same runtime the renderer uses, seeked to a real
 * timestamp — so this is a preview of the actual output, not a mockup of it.
 */
export async function buildStoryboard(
  projectDir: string,
  opts: {
    onLine?: (line: string) => void;
    signal?: AbortSignal;
    /** Capture even when the existing manifest is current. */
    force?: boolean;
  } = {},
): Promise<StoryboardManifest> {
  const existing = await readManifest(projectDir);
  if (!opts.force && existing && !isStale(projectDir, existing)) {
    return existing;
  }

  const clips = readTimeline(projectDir).filter(isFrame);
  if (!clips.length) {
    throw new Error(
      "No frame compositions found — a storyboard needs compositions/frames/*.html.",
    );
  }

  // Absolute: the CLI runs with cwd = projectDir, so a repo-relative path here
  // would resolve inside the project a second time.
  const outDir = path.resolve(projectDir, DIR);
  await fsp.rm(outDir, { recursive: true, force: true });
  await fsp.mkdir(outDir, { recursive: true });

  const times = clips.map((c) => sampleTime(c.start, c.duration));
  const { code } = await runCommand(
    "npx",
    [
      "--yes",
      hyperframes,
      "snapshot",
      ".",
      "--at",
      times.join(","),
      // Without this the CLI appends an extra end-of-timeline frame that does
      // not correspond to any clip, and the index mapping below breaks.
      "--no-end",
      "-o",
      outDir,
      "--describe",
      "false",
    ],
    projectDir,
    opts.onLine ?? (() => {}),
    opts.signal ?? new AbortController().signal,
  );

  // Snapshots are written as frame-<NN>-at-<t>s.png, numbered in the order the
  // timestamps were passed, so position maps back to the clip.
  const written = (await fsp.readdir(outDir))
    .filter((f) => /^frame-\d+-at-.*\.png$/.test(f))
    .sort();
  if (!written.length) {
    throw new Error(`hyperframes snapshot produced no stills (exit ${code})`);
  }

  const frames: StoryboardFrame[] = clips.map((clip, i) => ({
    clipId: clip.id,
    src: clip.src,
    start: clip.start,
    duration: clip.duration,
    at: times[i]!,
    image: written[i] ? path.posix.join(DIR, written[i]!) : undefined,
  }));

  const manifest: StoryboardManifest = {
    capturedAt: new Date().toISOString(),
    capturedAtMs: Date.now(),
    frames,
  };
  await fsp.writeFile(
    manifestPath(projectDir),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}
