/**
 * The still route's contract. The manifest records `image` project-relative
 * ("storyboard/frame-00-at-1.5s.png") while the route confines to that
 * directory, so the path the UI sends has to resolve to the file on disk
 * rather than to storyboard/storyboard/….
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "filmwright-stills-"));
const projectDir = path.join(tmp, "project");
fs.mkdirSync(path.join(projectDir, "storyboard"), { recursive: true });
fs.writeFileSync(path.join(projectDir, "storyboard", "frame-00-at-1.52s.png"), "png");
fs.writeFileSync(path.join(projectDir, "BRIEF.md"), "not an image");
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

vi.mock("@filmwright/engine", async () => {
  const actual = await vi.importActual<typeof import("@filmwright/engine")>(
    "@filmwright/engine",
  );
  return {
    ...actual,
    getJob: vi.fn(async () => ({ id: "j1", projectDir: "projects/p" })),
    projectPath: vi.fn(async () => projectDir),
  };
});

import { GET } from "@/app/api/jobs/[id]/storyboard/image/route";

const get = (file: string) =>
  GET(
    new Request(
      `http://studio.test/api/jobs/j1/storyboard/image?file=${encodeURIComponent(file)}`,
    ),
    { params: Promise.resolve({ id: "j1" }) },
  );

beforeEach(() => vi.clearAllMocks());

describe("GET /api/jobs/[id]/storyboard/image", () => {
  it("serves a still named the way the manifest names it", async () => {
    // The exact value the storyboard UI puts in the img src. This 404'd, so
    // every frame at the pre-render gate rendered as a broken image.
    const response = await get("storyboard/frame-00-at-1.52s.png");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("serves a bare filename too", async () => {
    expect((await get("frame-00-at-1.52s.png")).status).toBe(200);
  });

  it("404s a still that is not there", async () => {
    expect((await get("storyboard/frame-99-at-9s.png")).status).toBe(404);
  });

  it("refuses a path escaping the storyboard directory", async () => {
    // Dropping the prefix must not become a way out of the confinement.
    expect((await get("storyboard/../BRIEF.md")).status).toBe(403);
    expect((await get("../BRIEF.md")).status).toBe(403);
  });
});
