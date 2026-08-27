import { describe, expect, it } from "vitest";
import { classifyKind, describeFailure } from "../src/failure";

describe("classifyKind", () => {
  it.each([
    ["Run exceeded the budget ceiling", "budget"],
    ["Session timed out after 90 minutes", "timeout"],
    ["render time-out", "timeout"],
    ["Cannot resume: the project directory is gone", "missing-project"],
    ["hyperframes init exited with code 1", "scaffold"],
    ["scaffold step could not create the directory", "scaffold"],
    ["render exited with code 1 and produced no new mp4", "render"],
    ["agent run ended before completion", "agent"],
    ["agent session closed unexpectedly", "agent"],
    ["something inexplicable", "unknown"],
  ] as const)("%s → %s", (message, kind) => {
    expect(classifyKind(message)).toBe(kind);
  });

  it("prefers scaffold over render when both words appear", () => {
    expect(classifyKind("scaffold failed before render")).toBe("scaffold");
  });

  it("prefers budget over everything else", () => {
    expect(classifyKind("budget hit during render")).toBe("budget");
  });
});

describe("describeFailure", () => {
  it("uses the explicit kind over the classified one", () => {
    const failure = describeFailure("timed out", { kind: "budget", hasWork: true });
    expect(failure.kind).toBe("budget");
    expect(failure.resumable).toBe(true);
    expect(failure.hint).toMatch(/FILMWRIGHT_MAX_BUDGET_USD/);
  });

  it("classifies from the message when no kind is given", () => {
    const failure = describeFailure("render produced nothing", { hasWork: true });
    expect(failure.kind).toBe("render");
  });

  it("keeps the raw message and the stage", () => {
    const failure = describeFailure("boom", { stage: "frames", hasWork: true });
    expect(failure.message).toBe("boom");
    expect(failure.stage).toBe("frames");
  });

  it("is not resumable when nothing is on disk, with the empty-directory hint", () => {
    const failure = describeFailure("agent run ended", { hasWork: false });
    expect(failure.resumable).toBe(false);
    expect(failure.hint).toMatch(/started over/i);
  });

  it("scaffold failures are never resumable, even with work on disk", () => {
    const failure = describeFailure("x", { kind: "scaffold", hasWork: true });
    expect(failure.resumable).toBe(false);
    // The remedy's own hint, not the empty-directory one.
    expect(failure.hint).toMatch(/npm run doctor/);
  });

  it("stamps a parseable timestamp", () => {
    const failure = describeFailure("x", { hasWork: true });
    expect(Number.isFinite(new Date(failure.at).getTime())).toBe(true);
  });
});
