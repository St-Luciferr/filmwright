import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { clipAt, formatTime, isFrame, readTimeline, type Clip } from "../src/timeline";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "filmwright-timeline-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function project(html: string): string {
  const dir = fs.mkdtempSync(path.join(tmp, "p-"));
  fs.writeFileSync(path.join(dir, "index.html"), html);
  return dir;
}

const INDEX = `
<div id="root" data-composition-id="main" data-start="0" data-duration="30">
  <div class="clip" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="30"></div>
  <div class="clip" data-composition-id="f02" data-composition-src="compositions/frames/f02-features.html" data-start="4" data-duration="6"></div>
  <div class="clip" data-composition-id="f01" data-composition-src="compositions/frames/f01-hero.html" data-start="0" data-duration="5"></div>
  <div class="clip" data-start="1" data-duration="2"></div>
  <div class="clip" data-composition-id="broken" data-start="oops" data-duration="2"></div>
</div>
`;

describe("readTimeline", () => {
  it("returns [] when index.html is missing", () => {
    expect(readTimeline(path.join(tmp, "nope"))).toEqual([]);
  });

  it("parses clips, skips the root/main element and malformed tags, and sorts by start", () => {
    const clips = readTimeline(project(INDEX));
    expect(clips.map((c) => c.id)).toEqual(["captions", "f01", "f02"]);
    expect(clips.find((c) => c.id === "f02")).toMatchObject({
      src: "compositions/frames/f02-features.html",
      start: 4,
      duration: 6,
    });
  });
});

describe("isFrame", () => {
  it("is true only for compositions under frames/", () => {
    const clips = readTimeline(project(INDEX));
    expect(clips.filter(isFrame).map((c) => c.id)).toEqual(["f01", "f02"]);
  });
});

describe("clipAt", () => {
  const clips = readTimeline(project(INDEX));

  it("prefers frames over full-span overlays", () => {
    expect(clipAt(clips, 1)?.id).toBe("f01");
  });

  it("picks the incoming frame during a transition overlap", () => {
    // f01 runs 0-5, f02 runs 4-10; at 4.5 the later-starting frame wins.
    expect(clipAt(clips, 4.5)?.id).toBe("f02");
  });

  it("falls back to overlays when no frame is live", () => {
    // 10-30: only the captions track is on screen.
    expect(clipAt(clips, 15)?.id).toBe("captions");
  });

  it("returns undefined outside the timeline", () => {
    expect(clipAt(clips, 99)).toBeUndefined();
    expect(clipAt([], 1)).toBeUndefined();
  });

  it("treats a clip's end as exclusive", () => {
    const solo: Clip[] = [{ id: "a", start: 0, duration: 2 }];
    expect(clipAt(solo, 2)).toBeUndefined();
    expect(clipAt(solo, 1.999)?.id).toBe("a");
  });
});

describe("formatTime", () => {
  it("formats m:ss.t", () => {
    expect(formatTime(0)).toBe("0:00.0");
    expect(formatTime(5.2)).toBe("0:05.2");
    expect(formatTime(65)).toBe("1:05.0");
    expect(formatTime(600)).toBe("10:00.0");
  });
});
