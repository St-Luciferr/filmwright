import { randomUUID } from "node:crypto";
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
 * Escape a JSON literal for embedding in an inline `<script>`.
 *
 * `JSON.stringify` escapes for JSON, not for HTML: it leaves `<` and `>` alone,
 * so a caption containing `</script>` closes the element it lives in. That both
 * kills the caption engine defined further down the same block — the render
 * silently loses every caption — and turns cue text into live markup in a page
 * the renderer loads in a browser. A tool that makes videos about software will
 * type `</script>` honestly, without anyone attacking anything.
 *
 * JSON has no `<` outside string literals, and `\uXXXX` is a valid escape in
 * both JSON and JavaScript, so this round-trips to exactly the same string.
 */
const forScript = (json: string) =>
  json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

/** A cue shape this module can actually work with. */
function isCue(value: unknown): value is CaptionCue {
  const cue = value as CaptionCue | null;
  return (
    !!cue &&
    typeof cue.id === "string" &&
    typeof cue.text === "string" &&
    typeof cue.start === "number" &&
    typeof cue.end === "number" &&
    Array.isArray(cue.words)
  );
}

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
    const parsed = JSON.parse(literal.json) as unknown;
    if (!Array.isArray(parsed) || !parsed.every(isCue)) return null;
    return parsed;
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

  // The generator leaves a deliberate gap between the last word and the cue's
  // end — the cue lingers after the voice stops. Keep it, or every re-worded
  // caption pushes its final highlight past the audio.
  const last = cue.words[cue.words.length - 1];
  const tail = last ? Math.max(0, cue.end - last.end) : 0;
  const spoken = Math.max(0, cue.end - tail - cue.start);
  const total = words.reduce((sum, w) => sum + w.length, 0) || words.length;

  let at = cue.start;
  return words.map((word, i) => {
    const start = round(at);
    at += spoken * (word.length / total);
    const end = i === words.length - 1 ? round(cue.end - tail) : round(at);
    return { id: id(i), text: word, start, end };
  });
}

async function writeAtomic(file: string, body: string): Promise<void> {
  // The pid alone is not unique: the studio is one process serving concurrent
  // requests, so two writers would share a temp path and one would land the
  // other's bytes.
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
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

  if (!cues.every(isCue)) {
    throw new CaptionError(
      "The caption cues in compositions/captions.html are not in the expected " +
        "shape — every cue needs an id, text, start, end and words.",
    );
  }

  const wanted = new Map(edits.map((e) => [e.id, e]));
  const present = new Set(cues.map((cue) => cue.id));
  for (const id of wanted.keys()) {
    if (!present.has(id)) {
      throw new CaptionError(`No caption cue "${id}" in this project.`);
    }
  }

  let updated = 0;
  const next = cues.map((cue) => {
    const edit = wanted.get(cue.id);
    if (!edit) return cue;
    const text = edit.text.replace(/\s+/g, " ").trim();
    if (text === cue.text) return cue;
    updated++;
    return { ...cue, text, words: retimeWords(cue, text) };
  });

  if (!updated) return { updated: 0, cues };

  await writeAtomic(
    file,
    html.slice(0, literal.start) +
      forScript(JSON.stringify(next)) +
      html.slice(literal.end),
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
