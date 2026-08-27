import { describe, expect, it } from "vitest";
import { BodyTooLarge, readJson } from "@/lib/body";

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://studio.test/api", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });

describe("readJson", () => {
  it("parses an ordinary JSON object", async () => {
    expect(await readJson(post('{"a":1,"b":"two"}'))).toEqual({ a: 1, b: "two" });
  });

  it("returns {} for a request with no body", async () => {
    expect(await readJson(new Request("http://studio.test/api"))).toEqual({});
  });

  it("returns {} for an empty or blank body", async () => {
    expect(await readJson(post(""))).toEqual({});
    expect(await readJson(post("   "))).toEqual({});
  });

  it("returns {} for invalid JSON rather than throwing", async () => {
    expect(await readJson(post("{not json"))).toEqual({});
  });

  it("returns {} for valid JSON that is not an object", async () => {
    expect(await readJson(post("null"))).toEqual({});
    expect(await readJson(post("7"))).toEqual({});
    expect(await readJson(post('"x"'))).toEqual({});
  });

  it("keeps arrays — they are objects a route may want", async () => {
    expect(await readJson(post("[1,2]"))).toEqual([1, 2]);
  });

  it("rejects on the declared content-length before reading anything", async () => {
    const request = post('{"a":1}', { "content-length": "999999999" });
    await expect(readJson(request, 1000)).rejects.toBeInstanceOf(BodyTooLarge);
  });

  it("rejects when the streamed body outgrows the cap, even unannounced", async () => {
    // A stream has no automatic content-length, so only the running total can catch it.
    const big = new Uint8Array(64 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 8; i++) controller.enqueue(big);
        controller.close();
      },
    });
    const request = new Request("http://studio.test/api", {
      method: "POST",
      body: stream,
      // @ts-expect-error undici needs duplex for stream bodies
      duplex: "half",
    });
    await expect(readJson(request, 100_000)).rejects.toBeInstanceOf(BodyTooLarge);
  });

  it("accepts a body exactly at the cap", async () => {
    const body = JSON.stringify({ pad: "x".repeat(90) }); // 100 bytes
    expect(Buffer.byteLength(body)).toBe(100);
    expect(await readJson(post(body), 100)).toEqual({ pad: "x".repeat(90) });
  });
});
