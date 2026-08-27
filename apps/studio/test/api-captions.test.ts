/**
 * The caption route's contract: guards, validation and error mapping. The
 * engine is mocked — cue parsing and rewriting are covered by the engine suite.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@filmwright/engine", () => {
  class CaptionError extends Error {}
  class ProjectPathRefused extends Error {}
  return {
    CaptionError,
    ProjectPathRefused,
    getJob: vi.fn(),
    jobsInProject: vi.fn(),
    projectPath: vi.fn(),
    readCaptions: vi.fn(),
    updateCaptions: vi.fn(),
  };
});

import {
  CaptionError,
  getJob,
  jobsInProject,
  projectPath,
  readCaptions,
  updateCaptions,
} from "@filmwright/engine";
import { GET, PUT } from "@/app/api/jobs/[id]/captions/route";

const params = { params: Promise.resolve({ id: "j1" }) };
const put = (body: unknown) =>
  new Request("http://studio.test/api/jobs/j1/captions", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
const get = () => new Request("http://studio.test/api/jobs/j1/captions");

const CUE = { id: "caption-group-0", start: 0, end: 2, text: "hello", words: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getJob).mockResolvedValue({
    id: "j1",
    status: "succeeded",
    projectDir: "projects/x",
  } as never);
  vi.mocked(jobsInProject).mockResolvedValue([] as never);
  vi.mocked(projectPath).mockResolvedValue("/abs/projects/x");
  vi.mocked(readCaptions).mockReturnValue([CUE] as never);
  vi.mocked(updateCaptions).mockResolvedValue({ updated: 1, cues: [CUE] } as never);
});

describe("GET captions", () => {
  it("404s an unknown job", async () => {
    vi.mocked(getJob).mockResolvedValue(null);
    expect((await GET(get(), params)).status).toBe(404);
  });

  it("returns the cues without their word arrays, editable when idle", async () => {
    const response = await GET(get(), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      cues: [{ id: "caption-group-0", start: 0, end: 2, text: "hello" }],
      editable: true,
    });
  });

  it("reports a caption-less project as not editable, with a reason", async () => {
    vi.mocked(readCaptions).mockReturnValue(null);
    const body = await (await GET(get(), params)).json();
    expect(body.editable).toBe(false);
    expect(body.cues).toEqual([]);
    expect(body.reason).toMatch(/no caption track/);
  });

  it("locks editing while a run owns the project", async () => {
    vi.mocked(jobsInProject).mockResolvedValue([{ id: "j2", status: "running" }] as never);
    const body = await (await GET(get(), params)).json();
    expect(body.editable).toBe(false);
    expect(body.reason).toMatch(/running/);
  });

  it("409s when the project path is refused", async () => {
    vi.mocked(projectPath).mockRejectedValue(new Error("outside projects/"));
    expect((await GET(get(), params)).status).toBe(409);
  });
});

describe("PUT captions", () => {
  const valid = { edits: [{ id: "caption-group-0", text: "hi there" }] };

  it("applies the edits and returns the trimmed cues", async () => {
    const response = await PUT(put(valid), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      updated: 1,
      cues: [{ id: "caption-group-0", start: 0, end: 2, text: "hello" }],
    });
    expect(updateCaptions).toHaveBeenCalledWith("/abs/projects/x", valid.edits);
  });

  it("404s an unknown job", async () => {
    vi.mocked(getJob).mockResolvedValue(null);
    expect((await PUT(put(valid), params)).status).toBe(404);
  });

  it("refuses an adopted project", async () => {
    vi.mocked(getJob).mockResolvedValue({ id: "j1", status: "imported", projectDir: "projects/x" } as never);
    const response = await PUT(put(valid), params);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/adopted/);
  });

  it("refuses while a run owns the project", async () => {
    vi.mocked(jobsInProject).mockResolvedValue([{ id: "j2", status: "queued" }] as never);
    expect((await PUT(put(valid), params)).status).toBe(409);
    expect(updateCaptions).not.toHaveBeenCalled();
  });

  it.each([
    [{}, /No edits/],
    [{ edits: [] }, /No edits/],
    [{ edits: [{ id: "c", text: 7 }] }, /needs an `id` and a `text`/],
    [{ edits: [{ text: "x" }] }, /needs an `id` and a `text`/],
    [{ edits: [{ id: "c", text: "   " }] }, /cannot be emptied/],
    [{ edits: [{ id: "c", text: "x".repeat(301) }] }, /too long/],
    [{ edits: [{ id: "c", text: "a <b> tag" }] }, /cannot contain/],
  ])("400s bad edit payloads (%#)", async (body, message) => {
    const response = await PUT(put(body), params);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(message);
    expect(updateCaptions).not.toHaveBeenCalled();
  });

  it("caps the number of edits in one request", async () => {
    const edits = Array.from({ length: 1001 }, (_, i) => ({ id: `c${i}`, text: "x" }));
    const response = await PUT(put({ edits }), params);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/Too many/);
  });

  it("maps CaptionError to 409 and everything else to 500", async () => {
    vi.mocked(updateCaptions).mockRejectedValue(new CaptionError('No caption cue "c".'));
    expect((await PUT(put(valid), params)).status).toBe(409);

    vi.mocked(updateCaptions).mockRejectedValue(new Error("EIO"));
    expect((await PUT(put(valid), params)).status).toBe(500);
  });
});
