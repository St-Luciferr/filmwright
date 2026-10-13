import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/config", () => import("./helpers/tmp-config"));

/**
 * A stand-in for the SDK that reproduces the one behaviour this file is about:
 * streaming input is pumped by a loop of its own, concurrently with the output
 * the caller is reading. That loop is parked in `next()` while the model
 * "thinks", so a push made from `onTurnEnd` is handed straight to it and never
 * reaches the queue.
 */
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: ({ prompt }: { prompt: unknown }) => {
    const outbox: unknown[] = [];
    let wake: (() => void) | null = null;
    let inputDone = false;
    const nudge = () => {
      const w = wake;
      wake = null;
      w?.();
    };

    void (async () => {
      for await (const _ of prompt as AsyncIterable<unknown>) {
        turns++;
        outbox.push(
          { type: "assistant", message: { content: [{ type: "text", text: `turn ${turns}` }] } },
          {
            type: "result",
            subtype: "success",
            result: `turn ${turns} done`,
            total_cost_usd: 1,
            num_turns: turns,
            session_id: "s",
          },
        );
        nudge();
      }
      inputDone = true;
      nudge();
    })();

    return (async function* () {
      for (;;) {
        while (outbox.length) yield outbox.shift();
        if (inputDone) return;
        await new Promise<void>((r) => {
          wake = r;
        });
      }
    })();
  },
}));

import { InputStream, cacheTtl, runAuthoringSession } from "../src/agent";

let turns = 0;
afterEach(() => {
  turns = 0;
});

describe("InputStream", () => {
  it("counts a push handed straight to a waiting reader", async () => {
    const input = new InputStream();
    const reader = input[Symbol.asyncIterator]();
    const parked = reader.next();
    input.push("next stage");

    expect((await parked).done).toBe(false);
    // The message never touched the queue — only `sent` records that it existed.
    expect(input.pending).toBe(0);
    expect(input.sent).toBe(1);
  });

  it("drops pushes once closed", () => {
    const input = new InputStream();
    input.close();
    input.push("too late");
    expect(input.sent).toBe(0);
  });
});

describe("runAuthoringSession", () => {
  const run = (
    input: InputStream,
    onTurnEnd: (t: { ok: boolean; text: string }) => void,
  ) =>
    runAuthoringSession({
      projectDir: "/tmp",
      prompt: "stage one",
      abortController: new AbortController(),
      handlers: { onText: () => {}, onToolCall: () => {} },
      input,
      onTurnEnd,
    });

  it("keeps the session open for every stage the driver pushes", async () => {
    // The staged plan: three more instructions, then nothing left to say. Before
    // the fix this ended after two turns with the third instruction dropped, and
    // the run failed as "the session ended before the render gate".
    const plan = ["storyboard", "media", "frames"];
    const sent: string[] = [];
    const input = new InputStream();
    const session = await run(input, () => {
      const next = plan.shift();
      if (!next) return;
      sent.push(next);
      input.push(next);
    });

    expect(sent).toEqual(["storyboard", "media", "frames"]);
    expect(session.numTurns).toBe(4);
    expect(session.ok).toBe(true);
  });

  it("ends the session when a turn pushes nothing", async () => {
    const session = await run(new InputStream(), () => {});
    expect(session.numTurns).toBe(1);
    expect(session.ok).toBe(true);
  });
});

describe("cacheTtl", () => {
  it("keeps the cache an hour on interactive runs and leaves unattended runs to the SDK", () => {
    // People at review gates take longer than the 5-minute default window.
    expect(cacheTtl(true)).toBe("1h");
    expect(cacheTtl(false)).toBeUndefined();
  });
});
