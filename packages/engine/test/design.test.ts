import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  designAdherence,
  designNotes,
  designProblems,
  hexColours,
  longHolds,
  normaliseHex,
  readDesignSpec,
  voiceDurations,
  voiceOverruns,
  wavSeconds,
} from "../src/design";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "filmwright-design-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

let n = 0;
const project = (): string => {
  const dir = path.join(tmp, `p${n++}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};
const write = (dir: string, file: string, body: string | Buffer) => {
  const full = path.join(dir, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
};

/** A minimal 16-bit mono PCM WAV of `seconds` at 8 kHz. */
function wav(seconds: number): Buffer {
  const rate = 8000;
  const bytes = Math.round(seconds * rate) * 2;
  const b = Buffer.alloc(44 + bytes);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(36 + bytes, 4);
  b.write("WAVE", 8, "ascii");
  b.write("fmt ", 12, "ascii");
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); // byte rate
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36, "ascii");
  b.writeUInt32LE(bytes, 40);
  return b;
}

const timeline = (frames: [string, number, number][]) =>
  frames
    .map(
      ([id, start, duration]) =>
        `<div data-composition-id="${id}" data-composition-src="compositions/frames/${id}.html" data-start="${start}" data-duration="${duration}"></div>`,
    )
    .join("\n");

describe("wavSeconds", () => {
  it("reads the length off a PCM header", () => {
    const dir = project();
    write(dir, "a.wav", wav(2.5));
    expect(wavSeconds(path.join(dir, "a.wav"))).toBeCloseTo(2.5, 3);
  });

  it("returns null for anything that is not a WAV", () => {
    const dir = project();
    write(dir, "a.wav", "not audio");
    expect(wavSeconds(path.join(dir, "a.wav"))).toBeNull();
    expect(wavSeconds(path.join(dir, "missing.wav"))).toBeNull();
  });
});

describe("voice fit", () => {
  it("uses duration_s when recorded and the WAV header when not", () => {
    const dir = project();
    write(dir, "assets/voice/02.wav", wav(3));
    write(
      dir,
      "audio_meta.json",
      JSON.stringify({
        voices: [
          { frame: 1, path: "assets/voice/01.wav", duration_s: 4.2 },
          { frame: 2, path: "assets/voice/02.wav" },
        ],
      }),
    );
    const d = voiceDurations(dir);
    expect(d.get(1)).toBe(4.2);
    expect(d.get(2)).toBeCloseTo(3, 3);
  });

  it("fails a frame shorter than its line, naming the file", () => {
    const dir = project();
    write(
      dir,
      "audio_meta.json",
      JSON.stringify({ voices: [{ frame: 1, duration_s: 4 }, { frame: 2, duration_s: 6 }] }),
    );
    write(dir, "index.html", timeline([["01-hook", 0, 4.5], ["02-proof", 4.5, 5]]));
    const problem = voiceOverruns(dir);
    expect(problem).toMatch(/02-proof\.html runs 5\.00s but its voice line is 6\.00s/);
    expect(problem).not.toMatch(/01-hook/);
  });

  it("allows a frame that holds past its line, and notes long holds", () => {
    const dir = project();
    write(dir, "audio_meta.json", JSON.stringify({ voices: [{ frame: 1, duration_s: 2 }] }));
    write(dir, "index.html", timeline([["01-hook", 0, 6]]));
    expect(voiceOverruns(dir)).toBeNull();
    expect(longHolds(dir).map((h) => h.file)).toEqual(["01-hook.html"]);
    expect(designNotes(dir)).toMatch(/01-hook\.html \+4\.0s/);
  });

  it("tolerates rounding at the boundary", () => {
    const dir = project();
    write(dir, "audio_meta.json", JSON.stringify({ voices: [{ frame: 1, duration_s: 4.03 }] }));
    write(dir, "index.html", timeline([["01-hook", 0, 4]]));
    expect(voiceOverruns(dir)).toBeNull();
  });

  it("has nothing to say about a silent video", () => {
    const dir = project();
    write(dir, "index.html", timeline([["01-hook", 0, 4]]));
    expect(voiceOverruns(dir)).toBeNull();
  });
});

describe("colour parsing", () => {
  it("normalises short and alpha hex", () => {
    expect(normaliseHex("#ABC")).toBe("#aabbcc");
    expect(normaliseHex("#11223344")).toBe("#112233");
  });

  it("ignores id selectors and HTML entities that look like hex", () => {
    const text = `#f06-chrome { color: #0A204E; } <p>&#160;&#215;</p> .x{background:#fff}`;
    expect(hexColours(text)).toEqual(["#0a204e", "#ffffff"]);
  });
});

const FRAME_MD = `---
name: test
colors:
  ink: "#111111"
  accent: "#69C0C3"
  faint: "rgba(17,17,17,0.4)"
typography:
  body: { fontFamily: "Barlow", weight: 400 }
  label: { fontFamily: "IBM Plex Mono", weight: 500 }
spacing:
  pad: "5cqw"
---
prose`;

describe("design adherence", () => {
  it("reads the palette and font families from frame.md frontmatter", () => {
    const dir = project();
    write(dir, "frame.md", FRAME_MD);
    const spec = readDesignSpec(dir)!;
    expect([...spec.palette].sort()).toEqual(["#111111", "#69c0c3"]);
    expect([...spec.fonts].sort()).toEqual(["barlow", "ibm plex mono"]);
  });

  it("fails a primary family frame.md does not declare, but not a fallback", () => {
    const dir = project();
    write(dir, "frame.md", FRAME_MD);
    write(dir, "compositions/frames/01-a.html", `<style>.t{font-family:"Barlow", "Helvetica Neue", Arial, sans-serif}</style>`);
    expect(designProblems(dir)).toBeNull();
    write(dir, "compositions/frames/02-b.html", `<style>.t{font-family: Georgia, serif !important}</style>`);
    expect(designProblems(dir)).toMatch(/02-b\.html uses "georgia"/);
  });

  it("accepts a local @font-face alias and fails a font file that is not on disk", () => {
    const dir = project();
    write(dir, "frame.md", FRAME_MD);
    write(dir, "assets/fonts/Barlow.ttf", "font");
    write(
      dir,
      "compositions/frames/01-a.html",
      `<style>@font-face{font-family:"BarlowHF";src:url("assets/fonts/Barlow.ttf")}
       @font-face{font-family:"BarlowHF";src:url("assets/fonts/Barlow-Bold.ttf")}
       .t{font-family:"BarlowHF",sans-serif}</style>`,
    );
    const problem = designProblems(dir)!;
    expect(problem).not.toMatch(/uses "barlowhf"/);
    expect(problem).toMatch(/@font-face source not found — 01-a\.html: assets\/fonts\/Barlow-Bold\.ttf/);
  });

  it("reports off-palette colours as notes, never as problems", () => {
    const dir = project();
    write(dir, "frame.md", FRAME_MD);
    write(dir, "compositions/frames/01-a.html", `<style>.t{color:#111111;background:#000000}</style>`);
    expect(designProblems(dir)).toBeNull();
    expect(designAdherence(dir)!.offPalette.get("01-a.html")).toEqual(["#000000"]);
    expect(designNotes(dir)).toMatch(/01-a\.html \(#000000\)/);
  });

  it("has nothing to check without a frame.md", () => {
    const dir = project();
    write(dir, "compositions/frames/01-a.html", `<style>.t{font-family:Comic Sans MS}</style>`);
    expect(designAdherence(dir)).toBeNull();
    expect(designProblems(dir)).toBeNull();
  });
});
