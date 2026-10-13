import fs from "node:fs";
import path from "node:path";
import { isFrame, readTimeline } from "./timeline";

/**
 * Deterministic craft checks the engine runs before anything model-based
 * (Phase 2 of docs/plans/2026-10-13-pipeline-upgrade.md).
 *
 * Both are calibrated against the projects already on disk, the way ADR-0015
 * calibrated the duration tolerance:
 *
 * - **Voice overrun.** Across 126 narrated frames in 15 projects, no frame was
 *   ever shorter than its voice line; frames run 0–5.6 s longer (median 0.5 s).
 *   A line longer than its frame is cut off or bleeds over the next frame, so
 *   that is the failure. A long hold is craft, not error, and is only noted.
 * - **Design adherence.** Across 132 frames in 16 projects, no frame used a font
 *   family `frame.md` does not declare, and no `@font-face` pointed at a missing
 *   file — so both fail. Off-palette colours appeared in 13 of 16 accepted
 *   videos (near-blacks, tints, one-off accents), so they are reported, not failed.
 */

/** Slack for container padding and rounding in the voice comparison. */
export const VOICE_EPSILON_S = 0.05;

/** A hold this long after the line ends is worth a note at the gate. */
export const LONG_HOLD_S = 3;

/**
 * Seconds of audio in a PCM WAV file, from its header. Null for anything
 * that is not a readable RIFF/WAVE with `fmt ` before `data`.
 */
export function wavSeconds(file: string): number | null {
  let buf: Buffer;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return null;
  }
  if (buf.length < 12) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    return null;
  }
  let offset = 12;
  let byteRate: number | null = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt " && offset + 20 <= buf.length) byteRate = buf.readUInt32LE(offset + 16);
    if (id === "data") {
      if (!byteRate) return null;
      return Math.min(size, buf.length - offset - 8) / byteRate;
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

/**
 * Voice-line length per storyboard frame number, from `audio_meta.json`.
 *
 * `duration_s` when the audio step recorded it; otherwise read off the WAV
 * header, because several projects on disk carry voices without durations.
 */
export function voiceDurations(projectDir: string): Map<number, number> {
  const out = new Map<number, number>();
  let meta: { voices?: { frame?: number; path?: string; duration_s?: number }[] };
  try {
    meta = JSON.parse(fs.readFileSync(path.join(projectDir, "audio_meta.json"), "utf8"));
  } catch {
    return out;
  }
  for (const v of meta.voices ?? []) {
    if (typeof v.frame !== "number") continue;
    let seconds = typeof v.duration_s === "number" && v.duration_s > 0 ? v.duration_s : null;
    if (seconds === null && v.path?.toLowerCase().endsWith(".wav")) {
      seconds = wavSeconds(path.join(projectDir, v.path));
    }
    if (seconds !== null) out.set(v.frame, seconds);
  }
  return out;
}

/** The storyboard frame number a frame file carries in its name (`03-turn.html` → 3). */
export const frameNumber = (src: string): number | null => {
  const m = path.basename(src).match(/^(\d+)/);
  return m ? Number(m[1]) : null;
};

export type VoiceFit = {
  frame: number;
  file: string;
  frameSeconds: number;
  voiceSeconds: number;
};

/** Each wired frame paired with its voice line, where both are known. */
export function voiceFits(projectDir: string): VoiceFit[] {
  const voices = voiceDurations(projectDir);
  if (!voices.size) return [];
  const fits: VoiceFit[] = [];
  for (const clip of readTimeline(projectDir).filter(isFrame)) {
    const n = clip.src ? frameNumber(clip.src) : null;
    if (n === null) continue;
    const voice = voices.get(n);
    if (voice === undefined) continue;
    fits.push({
      frame: n,
      file: path.basename(clip.src!),
      frameSeconds: clip.duration,
      voiceSeconds: voice,
    });
  }
  return fits;
}

/** Why a voice line does not fit its frame, or null when every line fits. */
export function voiceOverruns(projectDir: string): string | null {
  const over = voiceFits(projectDir).filter(
    (f) => f.voiceSeconds > f.frameSeconds + VOICE_EPSILON_S,
  );
  if (!over.length) return null;
  const lines = over.map(
    (f) =>
      `${f.file} runs ${f.frameSeconds.toFixed(2)}s but its voice line is ` +
      `${f.voiceSeconds.toFixed(2)}s`,
  );
  return (
    `${lines.join("; ")}. The narration would be cut off or bleed into the next frame. ` +
    "Lengthen each frame's `data-duration` (and its STORYBOARD.md `duration:`) to at " +
    "least its line, then shift the frames after it."
  );
}

/** Frames holding well past the end of their line — reported, never failed. */
export function longHolds(projectDir: string): VoiceFit[] {
  return voiceFits(projectDir).filter((f) => f.frameSeconds - f.voiceSeconds > LONG_HOLD_S);
}

// ── design adherence ─────────────────────────────────────────────────────────

const GENERIC_FAMILIES = new Set([
  "serif", "sans-serif", "monospace", "system-ui", "cursive", "fantasy", "inherit",
  "initial", "unset", "ui-sans-serif", "ui-serif", "ui-monospace", "-apple-system",
  "blinkmacsystemfont", "emoji", "math",
]);

/** `#abc` and `#aabbccdd` both compare as `#aabbcc`. */
export function normaliseHex(hex: string): string {
  let h = hex.toLowerCase();
  if (h.length === 4) h = `#${[...h.slice(1)].map((c) => c + c).join("")}`;
  if (h.length === 9) h = h.slice(0, 7);
  return h;
}

/**
 * Hex colours in CSS/JS text.
 *
 * Not preceded by `&` (an HTML entity such as `&#160;`) and not followed by a
 * word character or hyphen (an id selector such as `#f06-chrome`, which would
 * otherwise read as `#ff0066`). Both false positives were in the calibration set.
 */
export function hexColours(text: string): string[] {
  return (text.match(/(?<!&)#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])/g) ?? []).map(
    normaliseHex,
  );
}

export type DesignSpec = { palette: Set<string>; fonts: Set<string> };

/** The normative layer of `frame.md`: its frontmatter `colors` and font families. */
export function readDesignSpec(projectDir: string): DesignSpec | null {
  let text: string;
  try {
    text = fs.readFileSync(path.join(projectDir, "frame.md"), "utf8");
  } catch {
    return null;
  }
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  if (!front) return null;
  const colours = front.match(/^colors:\r?\n((?:[ \t]+.*(?:\r?\n|$))*)/m)?.[1] ?? "";
  const palette = new Set(hexColours(colours));
  const fonts = new Set(
    [...front.matchAll(/fontFamily:\s*["']?([^"',}\n]+)["']?/g)].map((m) => m[1]!.trim().toLowerCase()),
  );
  return { palette, fonts };
}

export type DesignReport = {
  /** Hard: a family `frame.md` does not declare. file → families. */
  unknownFonts: Map<string, string[]>;
  /** Hard: `@font-face` sources that are not on disk. */
  missingFontFiles: string[];
  /** Soft: colours outside the palette. file → colours. */
  offPalette: Map<string, string[]>;
};

const framesDir = (projectDir: string) => path.join(projectDir, "compositions", "frames");

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when the frame declares `family` itself in an `@font-face` block. */
function declaresFace(text: string, family: string): boolean {
  const re = new RegExp(`@font-face\\s*{[^}]*font-family\\s*:\\s*["']?${escapeRe(family)}["']?\\s*;`, "i");
  return re.test(text);
}

/** Check every authored frame against `frame.md`. Null when there is no spec to check against. */
export function designAdherence(projectDir: string): DesignReport | null {
  const spec = readDesignSpec(projectDir);
  if (!spec) return null;
  let files: string[];
  try {
    files = fs.readdirSync(framesDir(projectDir)).filter((f) => f.endsWith(".html")).sort();
  } catch {
    return null;
  }

  const report: DesignReport = {
    unknownFonts: new Map(),
    missingFontFiles: [],
    offPalette: new Map(),
  };
  for (const file of files) {
    const text = fs.readFileSync(path.join(framesDir(projectDir), file), "utf8");

    if (spec.fonts.size) {
      const unknown = new Set<string>();
      for (const m of text.matchAll(/font-family\s*:\s*([^;}<]+)/g)) {
        // Only the primary family: the rest of a stack is fallback, and a
        // fallback to Arial is resilience, not a brand deviation. Checking the
        // whole stack failed 5 of 16 accepted videos in calibration.
        const family = (m[1]!.split(",")[0] ?? "")
          .replace(/!important/i, "")
          .trim()
          .replace(/['"]/g, "")
          .toLowerCase();
        if (!family || GENERIC_FAMILIES.has(family) || spec.fonts.has(family)) continue;
        if (family.startsWith("var(")) continue;
        // A family the frame declares itself via @font-face under a local alias
        // (`NotoSansHF`) is a staging detail, not a brand deviation.
        if (declaresFace(text, family)) continue;
        unknown.add(family);
      }
      if (unknown.size) report.unknownFonts.set(file, [...unknown]);
    }

    for (const m of text.matchAll(/@font-face\s*{[^}]*?src\s*:\s*url\(\s*["']?([^"')]+)/g)) {
      const url = m[1]!;
      if (/^(?:https?:|data:)/.test(url)) continue;
      if (!fs.existsSync(path.join(projectDir, url))) report.missingFontFiles.push(`${file}: ${url}`);
    }

    if (spec.palette.size) {
      const off = [...new Set(hexColours(text))].filter((c) => !spec.palette.has(c));
      if (off.length) report.offPalette.set(file, off);
    }
  }
  return report;
}

/** The hard design failures, or null. */
export function designProblems(projectDir: string): string | null {
  const report = designAdherence(projectDir);
  if (!report) return null;
  const problems: string[] = [];
  for (const [file, families] of report.unknownFonts) {
    problems.push(`${file} uses ${families.map((f) => `"${f}"`).join(", ")}, which frame.md does not declare`);
  }
  for (const missing of report.missingFontFiles) {
    problems.push(`@font-face source not found — ${missing}`);
  }
  if (!problems.length) return null;
  return (
    `${problems.join("; ")}. Fonts come from frame.md's typography and must ship with the ` +
    "project (project-root-relative `assets/...` paths) — a missing font silently falls " +
    "back and changes every line of type in the frame."
  );
}

/** The soft notes for the log and the pre-render gate, or null when there are none. */
export function designNotes(projectDir: string): string | null {
  const notes: string[] = [];
  const report = designAdherence(projectDir);
  if (report?.offPalette.size) {
    const list = [...report.offPalette].map(([file, colours]) => `${file} (${colours.join(", ")})`);
    notes.push(`Colours outside frame.md's palette: ${list.join("; ")}.`);
  }
  const holds = longHolds(projectDir);
  if (holds.length) {
    notes.push(
      `Long holds after the voice line ends: ${holds
        .map((h) => `${h.file} +${(h.frameSeconds - h.voiceSeconds).toFixed(1)}s`)
        .join(", ")}.`,
    );
  }
  return notes.length ? notes.join(" ") : null;
}
