/**
 * The queue route's contract: status codes and error mapping. The engine is
 * mocked — its own behaviour is covered by the engine test suite.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@filmwright/engine", () => {
  class SpecError extends Error {}
  return {
    SpecError,
    parseSpec: vi.fn(),
    createJob: vi.fn(),
    listJobs: vi.fn(),
  };
});

import { SpecError, createJob, listJobs, parseSpec } from "@filmwright/engine";
import { GET, POST } from "@/app/api/jobs/route";

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://studio.test/api/jobs", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/jobs", () => {
  it("lists jobs", async () => {
    vi.mocked(listJobs).mockResolvedValue([{ id: "j1" } as never]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jobs: [{ id: "j1" }] });
  });
});

describe("POST /api/jobs", () => {
  it("queues a job and returns 201", async () => {
    vi.mocked(parseSpec).mockReturnValue({ prompt: "p" } as never);
    vi.mocked(createJob).mockResolvedValue({ id: "j1", status: "queued" } as never);
    const response = await POST(post({ prompt: "p" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: "j1" });
    expect(parseSpec).toHaveBeenCalledWith({ prompt: "p" });
  });

  it("maps SpecError to 400 with the message", async () => {
    vi.mocked(parseSpec).mockImplementation(() => {
      throw new SpecError("A prompt is required.");
    });
    const response = await POST(post({}));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "A prompt is required." });
  });

  it("maps an oversized body to 413 without calling the engine", async () => {
    const response = await POST(post({ prompt: "p" }, { "content-length": "99999999" }));
    expect(response.status).toBe(413);
    expect(parseSpec).not.toHaveBeenCalled();
    expect(createJob).not.toHaveBeenCalled();
  });

  it("maps unexpected errors to 400 rather than leaking a 500", async () => {
    vi.mocked(parseSpec).mockReturnValue({ prompt: "p" } as never);
    vi.mocked(createJob).mockRejectedValue(new Error("disk full"));
    const response = await POST(post({ prompt: "p" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "disk full" });
  });
});
