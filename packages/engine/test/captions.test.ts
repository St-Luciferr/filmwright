import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  CaptionError,
  readCaptions,
  updateCaptions,
  type CaptionCue,
} from "../src/captions";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "filmwright-captions-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const CUES: CaptionCue[] = [
  {
    id: "caption-group-0",
    start: 0,
    end: 2,
    text: "hello world",
    words: [
      { id: "caption-word-0-0", text: "hello", start: 0, end: 0.9 },
      { id: "caption-word-0-1", text: "world", start: 1, end: 1.8 },
    ],
  },
  {
    id: "caption-group-1",
    start: 2,
    end: 4,
    text: "tricky ]; text",
    words: [
      { id: "caption-word-1-0", text: "tricky", start: 2, end: 2.6 },
      { id: "caption-word-1-1", text: "];", start: 2.7, end: 3.1 },
      { id: "caption-word-1-2", text: "text", start: 3.2, end: 3.8 },
    ],
  },
];

function project(cues: unknown = CUES, opts: { mirror?: boolean; trailingNewline?: boolean } = {}): string {
  const dir = fs.mkdtempSync(path.join(tmp, "p-"));
  fs.mkdirSync(path.join(dir, "compositions"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "compositions", "captions.html"),
    `<div id="captions"></div>\n<script>\nvar GROUPS = ${JSON.stringify(cues)};\nvar engine = "runs here";\n</script>\n`,
  );
  if (opts.mirror) {
    const body = JSON.stringify({ language: "en", groups: cues }, null, 2);
    fs.writeFileSync(
      path.join(dir, "caption_groups.json"),
      opts.trailingNewline ? `${body}\n` : body,
    );
  }
  return dir;
}

describe("readCaptions", () => {
  it("reads the cues out of the inline literal", () => {
    expect(readCaptions(project())).toEqual(CUES);
  });

  it("returns null when the file is missing", () => {
    expect(readCaptions(path.join(tmp, "nope"))).toBeNull();
  });

  it("returns null when there is no GROUPS literal", () => {
    const dir = fs.mkdtempSync(path.join(tmp, "p-"));
    fs.mkdirSync(path.join(dir, "compositions"));
    fs.writeFileSync(path.join(dir, "compositions", "captions.html"), "<html></html>");
    expect(readCaptions(dir)).toBeNull();
  });

  it("returns null for cues in an unexpected shape", () => {
    expect(readCaptions(project([{ id: "x" }]))).toBeNull();
  });
});

describe("updateCaptions", () => {
  it("throws CaptionError when the project has no captions", async () => {
    await expect(
      updateCaptions(path.join(tmp, "nope"), [{ id: "caption-group-0", text: "x" }]),
    ).rejects.toBeInstanceOf(CaptionError);
  });

  it("throws CaptionError for an unknown cue id", async () => {
    await expect(
      updateCaptions(project(), [{ id: "caption-group-9", text: "x" }]),
    ).rejects.toThrow(/No caption cue "caption-group-9"/);
  });

  it("keeps word timings when the word count is unchanged", async () => {
    const dir = project();
    const { updated, cues } = await updateCaptions(dir, [
      { id: "caption-group-0", text: "Hallo Welt" },
    ]);
    expect(updated).toBe(1);
    const cue = cues[0]!;
    expect(cue.text).toBe("Hallo Welt");
    expect(cue.words).toEqual([
      { id: "caption-word-0-0", text: "Hallo", start: 0, end: 0.9 },
      { id: "caption-word-0-1", text: "Welt", start: 1, end: 1.8 },
    ]);
    // And the edit is really on disk.
    expect(readCaptions(dir)![0]!.text).toBe("Hallo Welt");
  });

  it("re-times words when the count changes, keeping the cue span and its tail", async () => {
    const { cues } = await updateCaptions(project(), [
      { id: "caption-group-0", text: "hi" },
    ]);
    const cue = cues[0]!;
    // Cue boundaries never move.
    expect(cue.start).toBe(0);
    expect(cue.end).toBe(2);
    // The generator's lingering tail (2 - 1.8 = 0.2s) survives the rewrite.
    expect(cue.words).toEqual([
      { id: "caption-word-0-0", text: "hi", start: 0, end: 1.8 },
    ]);
  });

  it("spreads new words monotonically inside the cue", async () => {
    const { cues } = await updateCaptions(project(), [
      { id: "caption-group-0", text: "one two three four" },
    ]);
    const words = cues[0]!.words;
    expect(words).toHaveLength(4);
    for (let i = 0; i < words.length; i++) {
      const w = words[i]!;
      expect(w.start).toBeGreaterThanOrEqual(0);
      expect(w.end).toBeLessThanOrEqual(2);
      expect(w.end).toBeGreaterThanOrEqual(w.start);
      if (i) expect(w.start).toBeGreaterThanOrEqual(words[i - 1]!.start);
    }
    expect(words[3]!.end).toBeCloseTo(1.8, 5);
  });

  it("survives cue text containing ]; thanks to the bracket scanner", async () => {
    const dir = project();
    const { cues } = await updateCaptions(dir, [
      { id: "caption-group-1", text: "tricky ]; edit" },
    ]);
    expect(cues[1]!.text).toBe("tricky ]; edit");
    expect(readCaptions(dir)![1]!.text).toBe("tricky ]; edit");
    // The rest of the script block is untouched.
    const html = fs.readFileSync(path.join(dir, "compositions", "captions.html"), "utf8");
    expect(html).toContain('var engine = "runs here";');
  });

  it("escapes </script> so a caption cannot break out of the inline block", async () => {
    const dir = project();
    await updateCaptions(dir, [
      { id: "caption-group-0", text: "closing </script> tag" },
    ]);
    const html = fs.readFileSync(path.join(dir, "compositions", "captions.html"), "utf8");
    const literal = html.slice(html.indexOf("var GROUPS"), html.indexOf("var engine"));
    expect(literal).not.toContain("</script>");
    expect(literal).toContain("\\u003c/script\\u003e");
    // And it round-trips back to the same string.
    expect(readCaptions(dir)![0]!.text).toBe("closing </script> tag");
  });

  it("normalises whitespace and treats a no-op edit as no update", async () => {
    const { updated, cues } = await updateCaptions(project(), [
      { id: "caption-group-0", text: "  hello   world  " },
    ]);
    expect(updated).toBe(0);
    expect(cues[0]!.text).toBe("hello world");
  });

  it("mirrors the edit into caption_groups.json and keeps its ending style", async () => {
    for (const trailingNewline of [true, false]) {
      const dir = project(CUES, { mirror: true, trailingNewline });
      await updateCaptions(dir, [{ id: "caption-group-0", text: "mirrored edit" }]);
      const raw = fs.readFileSync(path.join(dir, "caption_groups.json"), "utf8");
      expect(raw.endsWith("\n")).toBe(trailingNewline);
      const doc = JSON.parse(raw) as { language: string; groups: CaptionCue[] };
      expect(doc.language).toBe("en"); // untouched sibling key
      expect(doc.groups[0]!.text).toBe("mirrored edit");
    }
  });

  it("leaves the composition alone when the mirror is missing", async () => {
    const dir = project();
    await updateCaptions(dir, [{ id: "caption-group-0", text: "no mirror here" }]);
    expect(fs.existsSync(path.join(dir, "caption_groups.json"))).toBe(false);
    expect(readCaptions(dir)![0]!.text).toBe("no mirror here");
  });
});
