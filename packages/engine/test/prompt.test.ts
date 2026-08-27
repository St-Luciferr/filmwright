import { describe, expect, it } from "vitest";
import { buildAgentPrompt, buildRevision } from "../src/prompt";
import { buildBrief } from "../src/prompt";
import type { RevisionNote, VideoSpec } from "../src/types";

const spec = (over: Partial<VideoSpec> = {}): VideoSpec => ({
  prompt: "Launch video for Acme",
  workflow: "product-launch-video",
  aspect: "9:16",
  seconds: 25,
  destination: "web",
  language: "en",
  narration: true,
  captions: true,
  music: true,
  providers: {
    voice: "kokoro",
    music: "musicgen",
    image: "pollinations",
    video: "stills",
    voiceId: "af_heart",
  },
  ...over,
});

describe("buildBrief", () => {
  it("writes the frontmatter the workflows read", () => {
    const brief = buildBrief(spec());
    expect(brief).toContain("workflow: product-launch-video");
    expect(brief).toContain("flow: automation");
    expect(brief).toContain("aspect: 1080x1920");
    expect(brief).toContain("length: 25s");
    expect(brief).toContain("narration: yes");
    expect(brief).toContain("  voice: kokoro (af_heart)");
    expect(brief).toContain("Launch video for Acme");
  });

  it("maps the aspect to real pixel dimensions", () => {
    expect(buildBrief(spec({ aspect: "16:9" }))).toContain("aspect: 1920x1080");
    expect(buildBrief(spec({ aspect: "1:1" }))).toContain("aspect: 1080x1080");
  });

  it("omits audience and source lines when absent, includes them when given", () => {
    const bare = buildBrief(spec());
    expect(bare).not.toContain("audience:");
    expect(bare).not.toContain("source:");
    expect(bare).toContain("No source URL was supplied");

    const full = buildBrief(spec({ audience: "CTOs", sourceUrl: "https://acme.dev" }));
    expect(full).toContain('audience: "CTOs"');
    expect(full).toContain("source: https://acme.dev");
    expect(full).toContain("Capture the product's own visuals from https://acme.dev");
  });

  it("lets the narration toggle beat the voice provider", () => {
    const brief = buildBrief(spec({ narration: false }));
    expect(brief).toContain("narration: no");
    expect(brief).toContain("  voice: none");
    expect(brief).not.toContain("af_heart");
  });

  it("silences the music provider when the music toggle is off", () => {
    expect(buildBrief(spec({ music: false }))).toContain("  music: none");
  });
});

describe("buildRevision", () => {
  const note = (over: Partial<RevisionNote>): RevisionNote => ({
    id: "n1",
    createdAt: new Date().toISOString(),
    text: "make the logo bigger",
    ...over,
  });

  it("points timestamped notes at their frame", () => {
    const text = buildRevision([note({ timeSec: 8, clipId: "f02" })]);
    expect(text).toBe("- at **0:08.0** (frame `f02`) — make the logo bigger");
  });

  it("marks notes without a timestamp as overall", () => {
    expect(buildRevision([note({})])).toBe("- **overall** — make the logo bigger");
  });

  it("keeps the timestamp even when no frame resolved", () => {
    expect(buildRevision([note({ timeSec: 65.25 })])).toContain("at **1:05.3**");
  });
});

describe("buildAgentPrompt", () => {
  it("tells an unattended run never to ask", () => {
    const prompt = buildAgentPrompt(spec(), "acme-launch");
    expect(prompt).toContain("unattended");
    expect(prompt).toContain("Never ask the user anything");
    expect(prompt).not.toContain("mcp__studio__ask_user");
  });

  it("hands an interactive run the studio tools and the three review gates", () => {
    const prompt = buildAgentPrompt(spec(), "acme-launch", undefined, true);
    expect(prompt).toContain("mcp__studio__ask_user");
    expect(prompt).toContain("mcp__studio__request_review");
    expect(prompt).not.toContain("Never ask the user anything");
  });

  it("names the forbidden paid providers and the chosen free ones", () => {
    const prompt = buildAgentPrompt(spec(), "acme-launch");
    expect(prompt).toMatch(/HeyGen/i);
    expect(prompt).toContain("ElevenLabs");
    expect(prompt).toContain("free-media.mjs");
    expect(prompt).toContain("Kokoro");
  });

  it("switches a run with narration off to the no-voiceover recipe", () => {
    const prompt = buildAgentPrompt(spec({ narration: false }), "acme-launch");
    expect(prompt).toContain("Do not generate any voiceover");
  });

  it("adds the continuation section only when existing work is described", () => {
    const fresh = buildAgentPrompt(spec(), "acme-launch");
    expect(fresh).not.toContain("CONTINUATION");
    const resumed = buildAgentPrompt(spec(), "acme-launch", "- Brief: `BRIEF.md`");
    expect(resumed).toContain("This is a CONTINUATION");
    expect(resumed).toContain("- Brief: `BRIEF.md`");
  });

  it("replays settled decisions", () => {
    const prompt = buildAgentPrompt(spec(), "acme", undefined, false, "Palette: dark");
    expect(prompt).toContain("Decisions already settled");
    expect(prompt).toContain("Palette: dark");
  });

  it("frames a revision as edits, not a rebuild, carrying notes and version", () => {
    const prompt = buildAgentPrompt(spec(), "acme", undefined, false, undefined, {
      notes: "- at **0:08.0** — bigger logo",
      version: 3,
    });
    expect(prompt).toContain("revision");
    expect(prompt).toContain("version 3");
    expect(prompt).toContain("bigger logo");
    expect(prompt).toContain("smallest change");
    expect(prompt).not.toContain("CONTINUATION");
  });
});
