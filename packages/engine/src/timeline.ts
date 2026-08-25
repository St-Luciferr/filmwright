import fs from "node:fs";
import path from "node:path";
import type { Clip } from "./types";

export type { Clip };

const attr = (tag: string, name: string): string | undefined =>
  tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

/**
 * Read the visual clips out of a composition's index.html.
 *
 * Parsed rather than rendered: the timing lives in `data-start` /
 * `data-duration` attributes, so a regex over the tags is enough to say which
 * frame is on screen at a given second — and it cannot drift from what renders,
 * because it is the same source of truth the renderer uses.
 */
export function readTimeline(projectDir: string): Clip[] {
  const index = path.join(projectDir, "index.html");
  let html: string;
  try {
    html = fs.readFileSync(index, "utf8");
  } catch {
    return [];
  }

  const clips: Clip[] = [];
  // Visual clips only — <audio> carries the voiceover and music, which are not
  // what someone means when they point at a moment on screen.
  for (const tag of html.match(/<div\b[^>]*>/g) ?? []) {
    const start = Number(attr(tag, "data-start"));
    const duration = Number(attr(tag, "data-duration"));
    const id = attr(tag, "data-composition-id");
    if (!id || !Number.isFinite(start) || !Number.isFinite(duration)) continue;
    // The root element spans the whole piece; it is the timeline, not a clip in it.
    if (id === "main" || attr(tag, "id") === "root") continue;
    clips.push({ id, src: attr(tag, "data-composition-src"), start, duration });
  }

  return clips.sort((a, b) => a.start - b.start);
}

/** True for a scene frame, as opposed to a full-span overlay like captions. */
export const isFrame = (clip: Clip): boolean =>
  clip.src?.includes("compositions/frames/") ?? false;

/**
 * The clip a person is looking at `seconds` in.
 *
 * Frames win over overlays: a captions track spans the whole video, so without
 * this every note would be filed against "captions" instead of the scene it was
 * actually about. Among frames, the latest to start wins, which is the incoming
 * one during a transition.
 */
export function clipAt(clips: Clip[], seconds: number): Clip | undefined {
  const live = clips.filter(
    (c) => seconds >= c.start && seconds < c.start + c.duration,
  );
  const frames = live.filter(isFrame);
  const pool = frames.length ? frames : live;
  return pool.reduce<Clip | undefined>(
    (best, c) => (!best || c.start >= best.start ? c : best),
    undefined,
  );
}

export const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};
