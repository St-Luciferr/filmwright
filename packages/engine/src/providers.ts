/**
 * The media providers a run may use.
 *
 * Every entry is free at the point of use and needs no account, no API key and
 * no subscription. That is the entry requirement for this file, not a
 * nice-to-have: the agent is told that these are the only media sources that
 * exist on this machine, so anything listed here is something it will try, and
 * anything absent is something it will not go looking for.
 *
 * Deliberately excluded, and named in the prompt as forbidden: HeyGen (the
 * skills' default path — needs a subscription), ElevenLabs, Lyria, and the
 * `codex` image upsell (needs a ChatGPT plan). A run that shells out to one of
 * those burns turns discovering it has no credential, which is exactly what
 * happened before this catalog existed.
 */

export const MEDIA_KINDS = ["voice", "music", "image", "video"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export type Provider = {
  id: string;
  label: string;
  /** One line, shown under the picker in the studio. */
  hint: string;
  /** Whether the provider needs the network at authoring time. */
  network: boolean;
  /**
   * What the agent is told to run. Injected verbatim into the prompt, so it
   * must be a complete, copy-pasteable command.
   */
  recipe: string;
  /** Attribution obligation, when the source is Creative Commons. */
  attribution?: string;
};

/**
 * `<ROOT>` is substituted for the repo's absolute path when the recipe is
 * rendered into a prompt — the agent's cwd is the project directory, so a
 * relative path to the helper would not resolve.
 */
const HELPER = "node <ROOT>/scripts/free-media.mjs";

export const PROVIDERS: Record<MediaKind, Provider[]> = {
  voice: [
    {
      id: "kokoro",
      label: "Kokoro (local, on-device)",
      hint: "Kokoro-82M runs on this machine. Free, offline, 12 voices. The only free TTS left standing.",
      network: false,
      recipe: `${HELPER} voice --text "<line>" --out assets/voice/01.wav --voice <voiceId> --speed 1.0
Voices: af_heart, af_nova, af_sky, am_adam, am_michael, bf_emma, bf_isabella,
bm_george, ef_dora, ff_siwis, jf_alpha, zf_xiaobei. Use ONE voice for the whole
piece. First call downloads the model (slow); later calls are fast.`,
    },
    {
      id: "none",
      label: "No voiceover",
      hint: "Carry the message with type and motion. Captions still work.",
      network: false,
      recipe: "Do not generate any voiceover. Carry the script visually.",
    },
  ],

  music: [
    {
      id: "musicgen",
      label: "MusicGen (local, on-device)",
      hint: "facebook/musicgen-small via torch. Free and offline, but slow on CPU (minutes, sometimes far longer), and its weights are licensed non-commercial — avoid for promo work.",
      network: false,
      recipe: `${HELPER} music --intent "<mood, instrumentation, tempo, no vocals>" --seconds <n> --out assets/bgm/track.wav --provider musicgen
Generates in ~15s chunks and loops/trims to length. Budget several minutes on
CPU. Original output, so nothing to attribute.`,
    },
    {
      id: "openverse",
      label: "Openverse (Creative Commons)",
      hint: "Real CC-licensed tracks from Freesound and friends. Fast, no key — but must be credited.",
      network: true,
      recipe: `${HELPER} music --intent "<mood/genre keywords>" --seconds <n> --out assets/bgm/track.wav --provider openverse
Searches only commercially-usable, modifiable licences.`,
      attribution: "CC-BY tracks require a credit line. The helper records one automatically.",
    },
    {
      id: "none",
      label: "No music bed",
      hint: "Silence under the narration, or SFX only.",
      network: false,
      recipe: "Do not add a music bed.",
    },
  ],

  image: [
    {
      id: "pollinations",
      label: "Pollinations (AI-generated, degraded)",
      hint: "Free text-to-image, no key — but the anonymous tier now serves one model, stamps a visible watermark even with nologo, allows one request per 15 s, and is marked deprecated. AI stills, not real photographs.",
      network: true,
      recipe: `${HELPER} image --intent "<full photographic prompt>" --out assets/images/f01-name.jpg --provider pollinations --width 768 --height 1024
Seeded from the intent, so the same prompt returns the same image on a re-run.
State plainly in your summary that the people are AI-generated, not licensed
stock — it is a usage-rights fact the client needs. The anonymous tier puts a
small "pollinations.ai" watermark in the bottom-right corner: crop or cover it,
or switch to --provider openverse.`,
    },
    {
      id: "openverse",
      label: "Openverse (real CC photos)",
      hint: "Genuine photographs under Creative Commons. Real people and places, at the cost of taking what exists rather than what you described.",
      network: true,
      recipe: `${HELPER} image --intent "<search keywords, not a prose prompt>" --out assets/images/f01-name.jpg --provider openverse
Keyword search, so phrase it as you would a stock-library query. Only
commercially-usable, modifiable licences are searched.`,
      attribution: "CC-BY images require a credit line. The helper records one automatically.",
    },
    {
      id: "none",
      label: "No photographic imagery",
      hint: "Type, shape and motion only.",
      network: false,
      recipe: "Do not source photographic imagery. Build every frame from type, vector shapes and motion.",
    },
  ],

  video: [
    {
      id: "stills",
      label: "Animated stills (no footage)",
      hint: "The reliable default. Source stills, then move the camera over them — push-in, drift, parallax. Reads as motion, costs nothing, never fails.",
      network: false,
      recipe: `Do not download or generate footage. Source stills with the image provider
above, then give each one a seek-safe camera move with the
\`hyperframes-keyframes\` skill (push-in, Ken Burns drift, parallax layers).
This is a deliberate choice, not a fallback — say so if the brief asked for
live action.`,
    },
    {
      id: "wikimedia",
      label: "Wikimedia Commons (real CC footage)",
      hint: "Actual live-action clips under Creative Commons. Free and real, but documentary-grade — expect to hunt, and expect misses.",
      network: true,
      recipe: `${HELPER} footage --intent "<search keywords>" --out assets/video/f01-name.mp4 --provider wikimedia --seconds <n>
Downloads a CC clip and transcodes it to h264 mp4, trimmed to length. Inspect
what comes back before committing to it — Commons footage is uneven, and a
wrong-looking clip is worse than a well-moved still. If nothing fits, fall back
to animated stills and say why.`,
      attribution: "CC-BY / CC-BY-SA clips require a credit line. The helper records one automatically.",
    },
    {
      id: "archive",
      label: "NASA & Prelinger (public-domain footage)",
      hint: "Real public-domain footage from the Internet Archive's NASA and Prelinger collections: space, science, Earth from orbit, and vintage film. Narrow, but rights-safe.",
      network: true,
      recipe: `${HELPER} footage --intent "<search keywords>" --out assets/video/f01-name.mp4 --provider archive --seconds <n>
Searches only NASA and the Prelinger Archives — an open Archive search returns
uploader-claimed licences, which are not safe. Good for space, science, Earth
and archival film; anything else will miss, so fall back to animated stills and
say why. Inspect the clip before committing to it.`,
      attribution: "Public domain — no credit required. The helper records the source anyway.",
    },
    {
      id: "none",
      label: "No video footage",
      hint: "Same as animated stills, without the instruction to add camera moves.",
      network: false,
      recipe: "Do not use video footage.",
    },
  ],
};

export type MediaProviders = {
  voice: string;
  music: string;
  image: string;
  video: string;
  /** Kokoro voice id, when `voice` is kokoro. */
  voiceId?: string;
};

export const KOKORO_VOICES = [
  { id: "af_heart", label: "Heart — warm US female" },
  { id: "af_nova", label: "Nova — bright US female" },
  { id: "af_sky", label: "Sky — soft US female" },
  { id: "am_adam", label: "Adam — steady US male" },
  { id: "am_michael", label: "Michael — deep US male" },
  { id: "bf_emma", label: "Emma — UK female" },
  { id: "bf_isabella", label: "Isabella — UK female" },
  { id: "bm_george", label: "George — UK male" },
  { id: "ef_dora", label: "Dora — Spanish female" },
  { id: "ff_siwis", label: "Siwis — French female" },
  { id: "jf_alpha", label: "Alpha — Japanese female" },
  { id: "zf_xiaobei", label: "Xiaobei — Mandarin female" },
] as const;

/**
 * Defaults, chosen from measurement rather than ambition.
 *
 * Music: Openverse, not MusicGen. MusicGen-small's weights are CC-BY-NC (a
 * problem for promo work) and on this CPU it took minutes per bed — one run
 * waited 20 minutes for nothing. Image: Openverse, not Pollinations, whose
 * anonymous tier now serves one model with a visible watermark.
 */
export const DEFAULT_PROVIDERS: MediaProviders = {
  voice: "kokoro",
  music: "openverse",
  image: "openverse",
  video: "stills",
  voiceId: "af_heart",
};

export const findProvider = (kind: MediaKind, id: string): Provider | undefined =>
  PROVIDERS[kind].find((p) => p.id === id);

/**
 * Fill in anything a spec left out. Jobs created before this catalog existed
 * have no `providers` at all, and they still have to run.
 */
export function resolveProviders(p?: Partial<MediaProviders>): MediaProviders {
  const pick = (kind: MediaKind, id: string | undefined): string =>
    id && findProvider(kind, id) ? id : DEFAULT_PROVIDERS[kind];
  const voice = pick("voice", p?.voice);
  return {
    voice,
    music: pick("music", p?.music),
    image: pick("image", p?.image),
    video: pick("video", p?.video),
    voiceId:
      voice === "kokoro"
        ? (KOKORO_VOICES.find((v) => v.id === p?.voiceId)?.id ??
          DEFAULT_PROVIDERS.voiceId)
        : undefined,
  };
}
