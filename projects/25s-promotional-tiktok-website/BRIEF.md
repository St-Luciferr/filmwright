---
workflow: product-launch-video
flow: automation
storyboard: yes
destination: tiktok
aspect: 1080x1920
language: en
length: 25s
narration: yes
captions: yes
music: yes
---

## Intent

A 25s promotional tiktok video for this website https://entrance.nepsor.com/. this is the first video on the account and it should be like a intro/launch video

## Assets

No source URL was supplied — design the visuals from the intent above.

## Customizations

- Target length is 25s at 1080x1920 for tiktok.
- Narration: voiceover required.
- Captions: burned-in captions required, legible muted.
- Music: music bed required, ducked under any narration.

## Notes

- This brief was generated from a single prompt submitted to the videos platform.
  Treat the frontmatter as confirmed intent; fill in every creative decision it
  does not pin down rather than asking for clarification.

## Run notes (autonomous continuation, decisions made without asking)

- **Brand accent.** `frame.md` names the accent slot `fire-orange`, but the value remixed from
  the captured site is the brand **teal `#1DA6AB`**. Teal is authoritative; the key name is legacy.
- **Type weights.** The Broadside preset asks for Barlow 900. The brand ships 400–800 only, so
  **800 is used wherever the spec says 900**. Full Barlow 400/500/600/700/800 and IBM Plex Mono
  400/500 were downloaded to `assets/fonts/` (the earlier run had only a 4.5 KB Barlow-Regular
  subset from the site, which could not carry the display ramp).
- **Voiceover.** Kokoro `af_heart`, six lines, already on disk from the previous run and verified
  as real speech (mean −22 dB, no clipping). Not regenerated. Total 25.111s.
- **Word timings.** `hyperframes transcribe` reported `whisper_unavailable`, so word-level timings
  were derived deterministically: ffmpeg `silencedetect` segments each line into speech runs, the
  script text is chunked at punctuation, chunks are mapped to runs (1:1 when counts match, else
  proportionally by syllable weight), and words are spread inside each run by syllable count.
  Phrase boundaries therefore land on the real pauses.
- **Music.** The brief requires a bed and HeyGen has no credential on this machine, so the local
  fallback was used: `transformers` + CPU `torch` were installed and **MusicGen
  (`facebook/musicgen-small`)** generated `assets/bgm/track.wav` at the storyboard's mood, bedded
  at 0.12 (≈ −18 dB) under the narration.
- **SFX.** The four cues from the previous run were reused as-is.
