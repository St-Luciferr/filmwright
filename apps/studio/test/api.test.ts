import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, postJson } from "@/lib/api";

const reply = (
  body: string,
  { status = 200, type = "application/json" }: { status?: number; type?: string } = {},
) =>
  new Response(body, {
    status,
    headers: type ? { "content-type": type } : {},
  });

const stub = (
  impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) => {
  vi.stubGlobal("fetch", vi.fn(impl as typeof fetch));
};

/** Await a call that must reject, and hand back the `ApiError` it threw. */
const rejection = (call: Promise<unknown>) =>
  call.then(
    () => {
      throw new Error("expected the call to reject");
    },
    (err: unknown) => err as ApiError,
  );

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("returns the parsed body of a successful reply", async () => {
    stub(async () => reply('{"ok":true,"requeued":false}'));
    expect(await api("/api/jobs/1/answer")).toEqual({ ok: true, requeued: false });
  });

  it("throws the error the route named", async () => {
    stub(async () => reply('{"error":"This job is not waiting on anything."}', { status: 409 }));
    await expect(api("/api/jobs/1/answer")).rejects.toThrow(
      "This job is not waiting on anything.",
    );
  });

  it("falls back to the caller's message when the route names none", async () => {
    stub(async () => reply("{}", { status: 500 }));
    await expect(
      api("/api/jobs/1/answer", { fallback: "Could not send that." }),
    ).rejects.toThrow("Could not send that.");
  });

  /**
   * The regression this module exists for: a route that does not match is
   * answered with Next's HTML 404 page, and `res.json()` on that reports
   * `Unexpected token '<'` — which tells the operator nothing.
   */
  it("names the missing route when Next answers with its HTML 404 page", async () => {
    stub(async () => reply("<!DOCTYPE html><html>…</html>", { status: 404, type: "text/html" }));
    const err = await rejection(api("/api/jobs/1/answer"));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
    expect(err.message).toContain("/api/jobs/1/answer");
    expect(err.message).toContain("npm run dev");
    expect(err.message).not.toContain("Unexpected token");
  });

  it("points at the server's terminal for any other HTML reply", async () => {
    stub(async () => reply("<!DOCTYPE html><html>boom</html>", { status: 500, type: "text/html" }));
    await expect(api("/api/x")).rejects.toThrow(/answered 500 with an HTML page/);
  });

  it("accepts an empty body on a success with no content", async () => {
    stub(async () => new Response(null, { status: 204 }));
    expect(await api("/api/x")).toEqual({});
  });

  it("reports an unreachable studio rather than the raw fetch error", async () => {
    stub(async () => {
      throw new TypeError("Failed to fetch");
    });
    const err = await rejection(api("/api/x"));
    expect(err.status).toBe(0);
    expect(err.message).toContain("is it still running?");
    expect(err.message).toContain("Failed to fetch");
  });

  it("reports malformed JSON without leaking the parser's message", async () => {
    stub(async () => reply("{not json"));
    await expect(api("/api/x")).rejects.toThrow("The studio sent a malformed reply from /api/x.");
  });
});

describe("postJson", () => {
  it("sends a JSON body, and an empty object when given none", async () => {
    const calls: RequestInit[] = [];
    stub(async (_url, init) => {
      calls.push(init ?? {});
      return reply('{"ok":true}');
    });

    await postJson("/api/jobs/1/answer", { answers: ["Bold"] });
    await postJson("/api/jobs/1/cancel");

    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.headers).toEqual({ "content-type": "application/json" });
    expect(calls[0]!.body).toBe('{"answers":["Bold"]}');
    expect(calls[1]!.body).toBe("{}");
  });
});
