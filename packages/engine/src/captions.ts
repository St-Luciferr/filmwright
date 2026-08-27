import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

/**
 * Caption editing.
 *
 * Captions are burned into the video at render time, from a sub-composition the
 * workflow generates: `compositions/captions.html` carries the cues inline as a
 * `var GROUPS = [...]` literal, and that literal — not `caption_groups.json`,
 * and not `caption-overrides.json` — is what the renderer reads. So a text edit
 * is applied there, and mirrored into `caption_groups.json` to keep the two
 * from disagreeing.
 *
 * `caption-overrides.json` is deliberately untouched: despite the name it holds
 * per-word *style and position* (x, y, scale, colour, font), written by the
 * hyperframes caption studio. It has no text field.
 */

export type CaptionWord = {
  id: string;
  text: string;
  start: number;
  end: number;
};

export type CaptionCue = {
  id: string;
  /** Frame this cue belongs to, when the generator recorded one. */
  frame?: number;
  start: number;
  end: number;
  text: string;
  words: CaptionWord[];
};

export class CaptionError extends Error {}

const captionsHtml = (projectDir: string) =>
  path.join(projectDir, "compositions", "captions.html");
const groupsJson = (projectDir: string) =>
  path.join(projectDir, "caption_groups.json");

const round = (n: number) => Number(n.toFixed(3));

/**
 * Find the `var GROUPS = [...]` literal.
 *
 * Scanned with a bracket counter rather than matched with a regex: cue text is
 * arbitrary, and a caption that contains `];` would end a lazy match early and
 * corrupt the composition.
 */
function findGroupsLiteral(
  html: string,
): { start: number; end: number; json: string } | null {
  const marker = "var GROUPS = ";
  const at = html.indexOf(marker);
  if (at === -1) return null;

  const open = html.indexOf("[", at);
  if (open === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < html.length; i++) {
    const ch = html[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        return { start: open, end: i + 1, json: html.slice(open, i + 1) };
      }
    }
  }
  return null;
}

/** The cues currently burned into this project's captions, in order. */
export function readCaptions(projectDir: string): CaptionCue[] | null {
  let html: string;
  try {
    html = fs.readFileSync(captionsHtml(projectDir), "utf8");
  } catch {
    return null;
  }
  const literal = findGroupsLiteral(html);
  if (!literal) return null;
  try {
    const parsed = JSON.parse(literal.json) as CaptionCue[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Re-time a cue's words for new text.
 *
 * Same number of words — the overwhelmingly common case, since most edits are a
 * spelling, a brand name or punctuation — keeps every original timing, so the
 * highlight still lands on the syllable being spoken. A different number has no
 * ground truth to keep, so the cue's own span is divided by word length; the
 * cue's start and end never move, which is what stops an edit from disturbing
 * the cues around it.
 */
function retimeWords(cue: CaptionCue, text: string): CaptionWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  const groupIndex = cue.id.replace(/^caption-group-/, "");
  const id = (i: number) => `caption-word-${groupIndex}-${i}`;

  if (!words.length) return [];

  if (words.length === cue.words.length) {
    return words.map((word, i) => ({ ...cue.words[i]!, id: id(i), text: word }));
  }

  const span = Math.max(0, cue.end - cue.start);
  const total = words.reduce((sum, w) => sum + w.length, 0) || words.length;
  let at = cue.start;
  return words.map((word, i) => {
    const share = span * (word.length / total);
    const start = round(at);
    at += share;
    // The last word ends exactly on the cue's end, rather than a rounding error
    // short of it.
    const end = i === words.length - 1 ? round(cue.end) : round(at);
    return { id: id(i), text: word, start, end };
  });
}

async function writeAtomic(file: string, body: string): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, body, "utf8");
  await fsp.rename(tmp, file);
}

export type CaptionEdit = { id: string; text: string };

/**
 * Apply text edits to a project's captions.
 *
 * Returns the cues as they now stand. The video on disk still shows the old
 * text — captions are burned in — so the caller is expected to re-render.
 */
export async function updateCaptions(
  projectDir: string,
  edits: CaptionEdit[],
): Promise<{ updated: number; cues: CaptionCue[] }> {
  const file = captionsHtml(projectDir);
  let html: string;
  try {
    html = await fsp.readFile(file, "utf8");
  } catch {
    throw new CaptionError(
      "This project has no captions to edit — compositions/captions.html does not exist.",
    );
  }

  const literal = findGroupsLiteral(html);
  if (!literal) {
    throw new CaptionError(
      "Could not find the caption cues in compositions/captions.html. " +
        "It may have been hand-edited into a shape this does not understand.",
    );
  }

  let cues: CaptionCue[];
  try {
    cues = JSON.parse(literal.json) as CaptionCue[];
  } catch {
    throw new CaptionError("The caption cues in compositions/captions.html are not valid JSON.");
  }

  const byId = new Map(cues.map((cue) => [cue.id, cue]));
  for (const edit of edits) {
    if (!byId.has(edit.id)) {
      throw new CaptionError(`No caption cue "${edit.id}" in this project.`);
    }
  }

  let updated = 0;
  const next = cues.map((cue) => {
    const edit = edits.find((e) => e.id === cue.id);
    if (!edit) return cue;
    const text = edit.text.replace(/\s+/g, " ").trim();
    if (text === cue.text) return cue;
    updated++;
    return { ...cue, text, words: retimeWords(cue, text) };
  });

  if (!updated) return { updated: 0, cues };

  const json = JSON.stringify(next);
  await writeAtomic(
    file,
    html.slice(0, literal.start) + json + html.slice(literal.end),
  );

  // Mirror into caption_groups.json when it exists. It is the generator's own
  // record rather than a render input, but leaving it stale would make the next
  // person to read it believe the wrong thing.
  const mirror = groupsJson(projectDir);
  try {
    const raw = await fsp.readFile(mirror, "utf8");
    const doc = JSON.parse(raw) as Record<string, unknown>;
    doc.groups = next;
    // Keep the file's own ending. The generator writes two-space JSON with no
    // trailing newline; adding one turns every caption fix into a whole-file
    // diff for anyone reading the project directory.
    await writeAtomic(
      mirror,
      JSON.stringify(doc, null, 2) + (raw.endsWith("\n") ? "\n" : ""),
    );
  } catch {
    // No mirror, or one we cannot parse. The composition is what renders.
  }

  return { updated, cues: next };
}
