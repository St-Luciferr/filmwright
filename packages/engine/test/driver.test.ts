import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/config", () => import("./helpers/tmp-config"));

// The driver performs `check` and `render` itself. Both succeed here so the
// tests exercise the state machine rather than the CLI behind it.
vi.mock("../src/render", () => ({
  runCommand: async () => ({ code: 0 }),
  renderStamp: () => null,
  getRenderer: () => ({ name: "test", render: async () => ({ ok: true }) }),
}));

type GateArgs = { stage: string; summary: string; artifact?: string };
const gate =
  vi.fn<(opts: GateArgs) => Promise<{ approved: boolean; notes?: string }>>();
vi.mock("../src/interact", async () => {
  const actual = await vi.importActual<typeof import("../src/interact")>("../src/interact");
  return { ...actual, runReviewGate: (opts: GateArgs) => gate(opts) };
});

import { createStageDriver } from "../src/pipeline";
import { InputStream } from "../src/agent";
import { contractFor } from "../src/workflow";
import type { Job, Stage } from "../src/types";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "filmwright-driver-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

let n = 0;
const write = (dir: string, file: string, body: string) => {
  const full = path.join(dir, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, "utf8");
};

/** A project satisfying every agent stage, with a timeline on target. */
function project(opts: { seconds?: number; frames?: boolean } = {}): string {
  const seconds = opts.seconds ?? 25;
  const dir = path.join(tmp, `p${n++}`);
  fs.mkdirSync(dir, { recursive: true });
  write(dir, "SCRIPT.md", "S".repeat(300));
  write(dir, "STORYBOARD.md", `## Frame 01\n${"x".repeat(300)}`);
  write(dir, "assets/voice/01.wav", "a");
  write(dir, "assets/bgm/track.wav", "a");
  if (opts.frames !== false) {
    write(dir, "compositions/frames/01-a.html", "<template></template>");
    write(
      dir,
      "index.html",
      `<div data-composition-id="01-a" data-composition-src="compositions/frames/01-a.html" data-start="0" data-duration="${seconds}"></div>`,
    );
  }
  return dir;
}

const job = (over: Record<string, unknown> = {}): Job =>
  ({
    id: "job-1",
    slug: "s",
    spec: {
      prompt: "p",
      workflow: "product-launch-video",
      aspect: "9:16",
      seconds: 25,
      destination: "tiktok",
      language: "en",
      narration: true,
      captions: true,
      music: true,
    },
    ...over,
  }) as unknown as Job;

/** Collect what the driver sends the agent. */
function harness(projectDir: string, interactive = true) {
  const sent: string[] = [];
  const input = { push: (t: string) => sent.push(t) } as unknown as InputStream;
  const entered: Stage[] = [];
  const doneStages: Stage[] = [];
  const driver = createStageDriver({
    job: job(),
    projectDir,
    input,
    interactive,
    ctx: { signal: new AbortController().signal, abort: () => {}, parked: null },
    signal: new AbortController().signal,
    log: () => {},
    onStage: (s) => entered.push(s),
    onStageDone: (s) => doneStages.push(s),
  });
  return { driver, sent, entered, doneStages };
}

beforeEach(() => {
  gate.mockReset();
  gate.mockResolvedValue({ approved: true });
});

describe("the stage driver", () => {
  it("opens on the first stage and asks for only that", async () => {
    const dir = path.join(tmp, `empty${n++}`);
    fs.mkdirSync(dir, { recursive: true });
    const { driver, sent } = harness(dir);
    const start = await driver.begin();
    expect(start.complete).toBe(false);
    expect(start.opening).toMatch(/Write `SCRIPT.md`/);
    expect(start.opening).not.toMatch(/STORYBOARD/);
    expect(sent).toHaveLength(0); // opening is folded into the prompt, not pushed
  });

  it("refuses to advance while the stage's artifact is invalid", async () => {
    const dir = path.join(tmp, `empty${n++}`);
    fs.mkdirSync(dir, { recursive: true });
    const { driver, sent, doneStages } = harness(dir);
    await driver.begin();

    // The agent claims to be finished without writing anything.
    await driver.onTurnEnd({ ok: true, text: "Done!" });
    expect(doneStages).not.toContain("script");
    expect(sent.at(-1)).toMatch(/not finished yet/);
    expect(sent.at(-1)).toMatch(/SCRIPT\.md` does not exist/);
    expect(gate).not.toHaveBeenCalled();
  });

  it("gives up on a stage that cannot satisfy its contract", async () => {
    const dir = path.join(tmp, `empty${n++}`);
    fs.mkdirSync(dir, { recursive: true });
    const { driver } = harness(dir);
    await driver.begin();
    for (let i = 0; i < 4; i++) await driver.onTurnEnd({ ok: true, text: "done" });
    await expect(driver.onTurnEnd({ ok: true, text: "done" })).rejects.toThrow(
      /Stage "script" did not pass/,
    );
  });

  it("opens the gate with the agent's own summary, then moves on", async () => {
    const dir = path.join(tmp, `fresh${n++}`);
    fs.mkdirSync(dir, { recursive: true });
    const { driver, sent } = harness(dir);
    await driver.begin();

    // The agent writes the script and reports back.
    write(dir, "SCRIPT.md", "S".repeat(300));
    await driver.onTurnEnd({ ok: true, text: "Here is what the script says." });

    expect(gate).toHaveBeenCalledOnce();
    expect(gate.mock.calls[0]![0]).toMatchObject({
      stage: "script",
      summary: "Here is what the script says.",
      artifact: "SCRIPT.md",
    });
    expect(sent.at(-1)).toMatch(/Now write `STORYBOARD.md`/);
  });

  it("holds the stage when the person asks for changes", async () => {
    const dir = path.join(tmp, `fresh${n++}`);
    fs.mkdirSync(dir, { recursive: true });
    const { driver, sent, doneStages } = harness(dir);
    await driver.begin();
    gate.mockResolvedValue({ approved: false, notes: "Make it punchier." });

    write(dir, "SCRIPT.md", "S".repeat(300));
    await driver.onTurnEnd({ ok: true, text: "summary" });
    expect(doneStages).not.toContain("script");
    expect(sent.at(-1)).toMatch(/asked for changes/);
    expect(sent.at(-1)).toMatch(/Make it punchier/);
    expect(sent.at(-1)).not.toMatch(/STORYBOARD/);
  });

  it("skips stages already satisfied on disk, but never the render gate", async () => {
    const { driver, doneStages } = harness(project());
    const start = await driver.begin();

    // Nothing left for the agent: the plan completes without a session.
    expect(start.complete).toBe(true);
    expect(driver.done).toBe(true);
    expect(doneStages).toEqual(["script", "storyboard", "media", "frames", "check", "render"]);
    // The pre-render gate still opened, which is the hole this replaces.
    expect(gate).toHaveBeenCalledOnce();
    expect(gate.mock.calls[0]![0]).toMatchObject({ stage: "pre-render" });
  });

  it("does not open gates on an unattended job", async () => {
    const { driver } = harness(project(), false);
    const start = await driver.begin();
    expect(start.complete).toBe(true);
    expect(gate).not.toHaveBeenCalled();
  });

  it("blocks the render behind the gate", async () => {
    const { driver } = harness(project());
    gate.mockResolvedValue({ approved: false, notes: "The third frame is wrong." });
    const start = await driver.begin();

    expect(driver.done).toBe(false);
    expect(start.complete).toBe(false);
    expect(start.opening).toMatch(/The third frame is wrong/);
  });

  it("re-runs an engine stage after a fix rather than validating past it", async () => {
    // A timeline far off the brief fails `check`; the agent then fixes it.
    const dir = project({ seconds: 60 });
    const { driver, doneStages } = harness(dir);
    const start = await driver.begin();
    expect(start.opening).toMatch(/runs 60.0s against a 25s brief/);
    expect(doneStages).not.toContain("check");

    // The agent retimes the frames and replies.
    write(
      dir,
      "index.html",
      '<div data-composition-id="01-a" data-composition-src="compositions/frames/01-a.html" data-start="0" data-duration="25"></div>',
    );
    await driver.onTurnEnd({ ok: true, text: "Retimed to 25s." });
    expect(doneStages).toContain("check");
    expect(doneStages).toContain("render");
    expect(driver.done).toBe(true);
  });

  it("drops the media stage when the brief wants none", () => {
    // Guards the plan the driver walks, not the driver itself.
    expect(contractFor("media")!.applies(job({
      spec: { ...job().spec, narration: false, music: false },
    }))).toBe(false);
  });
});
