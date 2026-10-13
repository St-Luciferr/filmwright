import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROVIDERS,
  KOKORO_VOICES,
  MEDIA_KINDS,
  PROVIDERS,
  findProvider,
  resolveProviders,
} from "../src/providers";

describe("findProvider", () => {
  it("finds a known provider", () => {
    expect(findProvider("voice", "kokoro")?.label).toMatch(/Kokoro/);
  });

  it("returns undefined for an unknown id", () => {
    expect(findProvider("voice", "elevenlabs")).toBeUndefined();
  });

  it("does not cross kinds", () => {
    // musicgen is a music provider, not a voice one.
    expect(findProvider("voice", "musicgen")).toBeUndefined();
  });
});

describe("resolveProviders", () => {
  it("returns the defaults for an absent spec", () => {
    expect(resolveProviders()).toEqual(DEFAULT_PROVIDERS);
    expect(resolveProviders(undefined)).toEqual(DEFAULT_PROVIDERS);
  });

  it("keeps valid choices", () => {
    const p = resolveProviders({
      voice: "none",
      music: "openverse",
      image: "openverse",
      video: "wikimedia",
    });
    expect(p.voice).toBe("none");
    expect(p.music).toBe("openverse");
    expect(p.image).toBe("openverse");
    expect(p.video).toBe("wikimedia");
  });

  it("falls back to the default for unknown ids", () => {
    const p = resolveProviders({ voice: "heygen", music: "lyria" });
    expect(p.voice).toBe(DEFAULT_PROVIDERS.voice);
    expect(p.music).toBe(DEFAULT_PROVIDERS.music);
  });

  it("only carries a voiceId when the voice provider is kokoro", () => {
    expect(resolveProviders({ voice: "none", voiceId: "am_adam" }).voiceId).toBeUndefined();
    expect(resolveProviders({ voice: "kokoro", voiceId: "am_adam" }).voiceId).toBe("am_adam");
  });

  it("falls back to the default voice for an unknown voiceId", () => {
    expect(resolveProviders({ voice: "kokoro", voiceId: "xx_nope" }).voiceId).toBe(
      DEFAULT_PROVIDERS.voiceId,
    );
  });
});

describe("catalog invariants", () => {
  it("every kind has at least one offline option", () => {
    for (const kind of MEDIA_KINDS) {
      expect(PROVIDERS[kind].some((p) => !p.network)).toBe(true);
    }
  });

  it("the defaults all exist in the catalog", () => {
    for (const kind of MEDIA_KINDS) {
      expect(findProvider(kind, DEFAULT_PROVIDERS[kind])).toBeDefined();
    }
    expect(KOKORO_VOICES.some((v) => v.id === DEFAULT_PROVIDERS.voiceId)).toBe(true);
  });

  it("provider ids are unique within a kind", () => {
    for (const kind of MEDIA_KINDS) {
      const ids = PROVIDERS[kind].map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("catalog defaults", () => {
  it("defaults music and imagery to Openverse, not MusicGen or Pollinations", () => {
    // MusicGen is CC-BY-NC and stalled on CPU; anonymous Pollinations is
    // watermarked and deprecated. Both stay pickable, neither is the default.
    expect(DEFAULT_PROVIDERS.music).toBe("openverse");
    expect(DEFAULT_PROVIDERS.image).toBe("openverse");
    expect(findProvider("music", "musicgen")).toBeDefined();
    expect(findProvider("image", "pollinations")?.label).toMatch(/degraded/);
  });

  it("offers rights-safe archive footage restricted to institutional collections", () => {
    const archive = findProvider("video", "archive")!;
    expect(archive.recipe).toContain("--provider archive");
    expect(archive.recipe).toMatch(/NASA and the Prelinger Archives/);
  });
});
