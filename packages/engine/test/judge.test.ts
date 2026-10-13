import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/config", () => import("./helpers/tmp-config"));

const captured = vi.fn();
let structured: unknown;
let subtype = "success";
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (args: { prompt: string; options: Record<string, unknown> }) => {
    captured(args);
    return (async function* () {
      yield {
        type: "result",
        subtype,
        result: "",
        total_cost_usd: 0.12,
        num_turns: 3,
        session_id: "j",
        structured_output: structured,
      };
    })();
  },
}));

const stills = vi.fn();
vi.mock("../src/storyboard", () => ({
  buildStoryboard: (...args: unknown[]) => stills(...args),
}));

import { ROOT } from "../src/config";
import {
  ATOMS,
  describeVerdicts,
  judgeNotes,
  judgePrompt,
  parseVerdicts,
  readJudgeState,
  runJudge,
} from "../src/judge";

let n = 0;
const project = (): string => {
  const dir = path.join(ROOT, `judge-${n++}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const pass = (frame: string) => ({
  frame,
  atoms: ATOMS.map((a) => ({ id: a.id, verdict: "pass", note: "fine" })),
});
const withFail = (frame: string, id: string, note: string) => {
  const v = pass(frame);
  v.atoms = v.atoms.map((a) => (a.id === id ? { ...a, verdict: "fail", note } : a));
  return v;
};

const manifest = {
  capturedAt: "",
  capturedAtMs: 0,
  frames: [
    { clipId: "01-hook", src: "compositions/frames/01-hook.html", start: 0, duration: 4, at: 2.6, image: "storyboard/frame-00-at-2.6s.png" },
    { clipId: "02-proof", src: "compositions/frames/02-proof.html", start: 4, duration: 5, at: 7.3, image: "storyboard/frame-01-at-7.3s.png" },
  ],
};
const blocks = new Map([
  ["compositions/frames/01-hook.html", "## Frame 01 — Hook\n- scene: a question on a dark field"],
  ["compositions/frames/02-proof.html", "## Frame 02 — Proof\n- scene: segments light up"],
]);
const opts = (log: string[] = []) => ({
  canvas: "1080x1920",
  blocks,
  signal: new AbortController().signal,
  log: (l: string) => log.push(l),
});

beforeEach(() => {
  captured.mockReset();
  stills.mockReset();
  stills.mockResolvedValue(manifest);
  subtype = "success";
  structured = undefined;
});

describe("judgePrompt", () => {
  it("gives each frame its still and storyboard block, and every question", () => {
    const text = judgePrompt(
      [{ frame: "01-hook", image: "storyboard/a.png", block: "## Frame 01\n- scene: x" }],
      "1080x1920",
    );
    expect(text).toContain("Still: `storyboard/a.png`");
    expect(text).toContain("- scene: x");
    for (const a of ATOMS) expect(text).toContain(`\`${a.id}\``);
    expect(text).toMatch(/answer `unsure` rather than guessing/);
  });
});

describe("parseVerdicts", () => {
  it("keeps only expected frames and known atoms, defaulting odd verdicts to unsure", () => {
    const out = parseVerdicts(
      {
        frames: [
          { frame: "01-hook", atoms: [{ id: "hero", verdict: "fail", note: "tiny" }, { id: "made-up", verdict: "fail" }, { id: "copy", verdict: "maybe" }] },
          { frame: "99-ghost", atoms: [] },
        ],
      },
      ["01-hook"],
    );
    expect(out).toEqual([
      { frame: "01-hook", atoms: [{ id: "hero", verdict: "fail", note: "tiny" }, { id: "copy", verdict: "unsure", note: "" }] },
    ]);
    expect(parseVerdicts(undefined, ["01-hook"])).toEqual([]);
  });
});

describe("describeVerdicts", () => {
  it("lists only failures, per frame, and tells the orchestrator to re-dispatch", () => {
    const text = describeVerdicts([pass("01-hook") as never, withFail("02-proof", "hero", "the logo dominates") as never], 1, 2);
    expect(text).toContain("round 1 of 2");
    expect(text).toContain("### 02-proof");
    expect(text).toContain("- hero: the logo dominates");
    expect(text).not.toContain("### 01-hook");
    expect(text).toContain("frame-worker");
  });
});

describe("runJudge", () => {
  it("runs a blind, read-only session with a JSON schema and passes clean frames", async () => {
    const dir = project();
    structured = { frames: [pass("01-hook"), pass("02-proof")] };
    const log: string[] = [];
    const result = await runJudge(dir, opts(log));
    expect(result.ok).toBe(true);
    const { options } = captured.mock.calls[0]![0];
    expect(options.settingSources).toEqual([]);
    expect(options.tools).toEqual(["Read"]);
    expect(options.model).toBe("test-judge-model");
    expect(options.outputFormat.type).toBe("json_schema");
    expect(options.cwd).toBe(dir);
    expect(log.join("\n")).toContain("2/2 frames clean ($0.12)");
    expect(readJudgeState(dir).rounds).toBe(1);
  });

  it("fails with a per-frame change list, and stops asking after the round cap", async () => {
    const dir = project();
    structured = { frames: [pass("01-hook"), withFail("02-proof", "copy", "the voiceover is printed verbatim")] };
    const first = await runJudge(dir, opts());
    expect(first.ok).toBe(false);
    expect(first.detail).toContain("- copy: the voiceover is printed verbatim");

    const second = await runJudge(dir, opts());
    expect(second.ok).toBe(false);
    expect(readJudgeState(dir).rounds).toBe(2);

    // Cap spent: no third session, and the rest goes to the person at the gate.
    captured.mockClear();
    const third = await runJudge(dir, opts());
    expect(third.ok).toBe(true);
    expect(captured).not.toHaveBeenCalled();
    expect(judgeNotes(dir)).toBe("The visual reviewer still flags: 02-proof (copy).");
  });

  it("never blocks the render when the judge itself cannot run", async () => {
    const dir = project();
    subtype = "error_max_budget_usd";
    const log: string[] = [];
    const result = await runJudge(dir, opts(log));
    expect(result.ok).toBe(true);
    expect(result.error).toMatch(/error_max_budget_usd/);
    expect(log.join("\n")).toMatch(/Visual review skipped/);
    expect(readJudgeState(dir).rounds).toBe(0);
  });

  it("skips when stills cannot be captured", async () => {
    const dir = project();
    stills.mockRejectedValue(new Error("snapshot failed"));
    const result = await runJudge(dir, opts());
    expect(result.ok).toBe(true);
    expect(captured).not.toHaveBeenCalled();
  });
});
