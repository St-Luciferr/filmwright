# Filmwright pipeline review — 13 October 2026

Research into current methods for agent-driven video generation with Claude Code,
measured against this repository's 46 recorded authoring runs, and the changes that
would most improve output quality and speed.

Sources: the job store (`data/jobs/*`), the engine source, the installed HyperFrames
skills, the HyperFrames 0.8.153 CLI and release notes, Anthropic's Agent SDK and
Claude Code docs, Anthropic engineering posts, the HeyGen Code2Video benchmark report,
and live probes of every free media endpoint run from this machine. Claims marked
*inferred* or *unverified* were not confirmed directly.

---

## 1. Where the time and money go today

Measured from `events.ndjson` across 46 authoring jobs (medians; one parked outlier
excluded from script).

| Stage | Median minutes | Notes |
|---|---|---|
| script | 4 | includes site capture when a URL is given |
| storyboard | 5 | |
| media | 4 | MusicGen on CPU ran 20 min and produced nothing in one run |
| frames | 17 | 14–27 min on every run since 18 Sep; 9–11 min on August runs that fanned out |
| check + fix | 10 | agent fixing `content_overlap`, `gsap_non_transform_motion`, registry init errors |
| render (incl. gate wait) | 9 | the render itself is 2–2.5 min for a 25–42 s video |
| gate waits | 2–7 per gate | pre-render gate mean 7 min |

Cost: $5–25 per successful run, model `claude-opus-5` at effort `high` for every stage.
Tool calls: 3,146 Bash, 688 Read, 160 Agent across all runs; the frames stage accounts
for 2,597 of ~4,250 attributed tool calls.

Hardware: Intel i5-7200U (2 cores / 4 threads, no AVX-512), 11 GB RAM, Intel HD 620,
no NVIDIA GPU. This rules out every local diffusion, video and GPU-class TTS model.

Toolchain drift: CLI pinned at `hyperframes@0.8.12` (24 Aug) against 0.8.153 (13 Oct);
`npx hyperframes@latest skills check` reports 11 of 12 installed skills outdated.

---

## 2. Finding: frame fan-out stopped after the stage machine landed

The HyperFrames skills' own production loop is orchestrator + one subagent per frame
(`product-launch-video/SKILL.md` §"Dispatch", `hyperframes/references/subagent-dispatch.md`,
`frame-packets.mjs`). Before ADR-0015 (5 Sep) nearly every run dispatched "Build frame NN"
workers; those runs finished the frames stage in 9–11 min. Every run since 18 Sep has
**zero** Agent calls and a 14–27 min frames stage.

Two causes line up:

- The new `frames` instruction in `workflow.ts` says "author the frame compositions … reply
  when every frame is authored" and never mentions dispatch or the packet script.
- The SDK docs state that with the `claude_code` tool preset on Opus 5, Claude Code adds a
  system-prompt line discouraging Agent calls unless asked. Whether that applies to Opus 5.5
  is not stated.

Caveat: four mid-September runs did fan out and still took 20–29 min in frames, so fan-out
alone is not the whole story; stage re-asks (`MAX_STAGE_ATTEMPTS`) and media waits inside the
frames stage also contribute. Treat fan-out as the largest single lever, not the only one.

---

## 3. What the field does in 2026 (and what fits this renderer)

Four recurring architectures:

| Pattern | Examples | Fit |
|---|---|---|
| A. Planner → scene JSON → templated renderer | Shotstack MCP, json2video, Creatomate | Cheap and deterministic; every output looks like its template. ADR-0001 already rejected it. |
| B. Free-form code authoring with a skills pack | Remotion skills, HyperFrames skills alone | High ceiling, high variance; verification left to the human. |
| C. Structured plan + per-scene code workers + deterministic verifier + judge/human review | HyperFrames' own loop; SimWorlds (arXiv 2607.01766) | **The right shape for an HTML-composition renderer.** Filmwright has the plan layer and the gates; it lacks the parallel worker layer and the verifier flags. |
| D. Best-of-k with judge selection | ViMax, Character.AI | Expensive; only sensible for the hook frame. |

Evidence that verifier loops matter: MoVer (motion-verification feedback) lifted correct
outputs from 58.8% zero-shot to 93.6% with up to 50 verifier-driven corrections; SimWorlds'
ablation shows removing the deterministic verifier or the staging both drop scores. HeyGen's
Code2Video benchmark (Sep 2026, 168 beats rendered with HyperFrames) names the dominant
failure modes of LLM-authored motion graphics: text laid out for the final frame rather than
its travel path (mid-motion collisions), everything firing at t=0 instead of building a
cadence, elements shrunk to be "safe", omitted easing and stagger, cramped margins and poor
contrast. Its judge agreed with humans 82% of the time; general VLMs 75%. Harnesses help
but are "a ceiling, not a fix". It ranks `claude-opus-5` third overall; Sonnet/Haiku 5.x are
not on the leaderboard, so cheaper worker models are untested there.

Anthropic guidance that applies directly: give the agent a check it can run (tests, build,
screenshot); have a separate verification agent grade so the worker is not grading itself;
subagents return condensed summaries into a clean parent context; progress files and
artifacts on disk over compaction; remove "verify your work" wording from Opus 5 prompts
(it over-verifies); use low/medium effort liberally where quality holds.

---

## 4. Toolchain: what changed in HyperFrames since 0.8.12

Verified from `--help` diffs, release notes 0.8.13–0.8.153 and the 0.8.153 bundle.

- **Capture defaults.** Since 0.8.38 local renders default to BeginFrame capture and
  `looks` quality (CRF 16). The pin predates this. Software GPU forces the slower screenshot
  path; the render summary's second line names which path ran.
- **Reliability for unattended runs.** 0.8.147/0.8.153: stalled renders and stuck `check`
  runs now fail loudly naming the file/step. 0.8.17/0.8.117: renders fail instead of
  silently succeeding on broken sub-compositions. 0.8.150: video-frame-injection memory leak
  fixed. 0.8.122: fonts awaited for reproducible text layout. 0.8.43/44: portrait
  `root_dimensions_mismatch` lint.
- **Breaking in 0.8.152.** Check and snapshot artifacts moved to
  `.hyperframes/artifacts/{checks,snapshots}/<id>` and `.hyperframes/render-outputs.json`.
  `storyboard.ts` reads `snapshots/`; it must follow before bumping.
- **`check` flags the engine does not pass.** `--at-transitions`, `--caption-zone
  "x0=0;y0=.82;x1=1;y1=1;severity=error"`, `--frame-check`, `--strict`, `--snapshots`
  (annotated overview plus per-finding crops), `--json` (pure stdout since 0.8.112),
  `--range`, `--components`. Motion sidecars (`*.motion.json`: `appearsBy`, `before`,
  `staysInFrame`, `keepsMoving`) are verified against the seeked timeline. No project on
  disk has a sidecar.
- **Vision grading exists in the CLI.** `snapshot --describe "<question>"` runs a Gemini
  frame analysis when `GEMINI_API_KEY` is set. Not free, so outside the catalog rule, but
  the same step can be done with a Claude subagent reading the contact sheet.
- **Harness hooks.** `HF_TOOL_CONTEXT` (NDJSON event stream, project lock),
  `history begin --exclusive --who` for agents sharing a project, `timeline --json`.
- **Registry.** 455 items (237 components, 210 blocks). On-device semantic search via
  `catalog --query`. The production loop mandates installing blocks once before parallel
  workers because "parallel workers race the registry".
- **Audio.** Voiceover carve of BGM default since 0.8.35; master bus with true-peak
  limiter; `normalize-audio` (LUFS); `transcribe --to srt|vtt`; Parakeet on Linux via
  `models install parakeet`.
- **Render speed.** `--workers N` exists; auto count is pinned to 1 under low-memory mode
  (auto-on at ≤8 GB RAM). On this 2-core machine multi-worker gains are small, and render
  is 2.5 of 40–65 minutes, so this is a low-priority lever. `--quality draft` for QA
  renders. No time-range render flag exists; `check --range` and `snapshot --range` cover
  partial inspection.
- **Cloud.** HeyGen-hosted `cloud render` is credit-based (secondhand: ~$0.10/min 1080p30,
  roughly $0.07 per 42 s render); no official price or speed figures published. Lambda and
  Cloud Run are bring-your-own-cloud. None is free, so none fits the catalog rule.

---

## 5. Agent SDK capabilities relevant to the engine

All from the current docs (code.claude.com, platform.claude.com).

- **Models.** `claude-opus-5` is listed as legacy. Current: Opus 5.5 ($4/$20 per MTok),
  Sonnet 5.5 ($2/$10), Haiku 5.5 ($0.10/$0.50 up to 100k prompt tokens), Fable 5.1
  ($10/$50). All 1M context. Opus 5.5 thinking is always on.
- **Effort** values `low|medium|high|xhigh|max`; applies to all output tokens. Docs suggest
  `xhigh` for agentic work over 30 minutes, `medium` for well-specified Sonnet tasks.
- **Subagents** via the `agents` option carry their own `model`, `effort`, `tools`,
  `skills` (preloaded), `maxTurns`, `background`. They do not inherit the parent's history
  or skill content. Concurrency default 20 (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`),
  depth 3. `total_cost_usd` and `modelUsage` include subagent spend; `maxBudgetUsd` caps it.
- **Workflow tool** (SDK ≥0.3.149): scripted `agent()/parallel()/pipeline()`, 16
  concurrent by default, no mid-run user input, so one workflow per stage between gates.
- **Caching.** Automatic. Model switch invalidates the whole cache; effort change keeps it
  on 5.5 models with API/subscription auth; adding an image anywhere re-prices message
  blocks. `promptCacheTtl: '1h'` / `CLAUDE_CODE_PROMPT_CACHE_TTL` for sessions that pause
  on gates longer than 5 minutes. Cache reads are 0.05× on Opus 5.5 and Sonnet 5.5.
- **Hooks.** Full list includes `Stop`, `SubagentStop`, `PreCompact`, `PostCompact`,
  `SessionStart`. A `Stop` hook that times out counts as "no decision" and the session
  ends silently; set an explicit timeout. Loop guard of 8 consecutive continuations.
- **Sessions.** `resume`, `forkSession`, `resumeSessionAt`; resume re-sends full history
  and only hits cache within TTL. `setModel()` works in streaming-input mode but busts the
  cache. No batch mode for sessions.
- **Structured output** via `outputFormat: {type:'json_schema'}`; compatibility with
  streaming-input mode is not documented.

---

## 6. Free media: what the live probes found

Everything below was run from this machine on 13 Oct.

- **Kokoro-82M fp32 ONNX** is still the right default voice: RTF 0.78 measured, Apache-2.0,
  and every open model rated above it on the Speech Arena is either non-commercial (Breeze
  TTS 2, Fish S2 Pro, Voxtral) or GPU-class (Magpie 357M). **Do not switch to int8**: 3×
  slower here because Kaby Lake lacks VNNI. Supertonic 3 is 2× faster (RTF 0.44) but its
  repo is archived and weights are OpenRAIL-M. Pocket TTS (RTF 0.81, CC-BY weights) adds
  voice cloning. Chatterbox-Nano ran at 0.3× realtime, not viable.
- **Each TTS call pays a cold start.** `npx hyperframes tts` spawns Node and Python per
  line; Kokoro loads in 1.8 s but the wrapper overhead dominates. A warm daemon
  (Kokoro-FastAPI CPU image or a 40-line local server) removes it. On 2 cores, parallel
  lines gain nothing; batch inside one warm process.
- **Word timings.** The ONNX path cannot emit them (stock model exports only `audio`).
  Options: Kokoro PyTorch `KPipeline` token timestamps (English only; wheel crashed here on
  `espeakng-loader`), Kokoro-FastAPI `/dev/captioned_speech`, or faster-whisper tiny/base
  int8 on CPU with `word_timestamps=True` (MIT, works for any voice).
- **MusicGen-small should not be the default.** Weights are CC-BY-NC 4.0 (a problem for
  promo content), and on this CPU it takes minutes to never. No open music generator is
  CPU-feasible here. Keep Openverse (Jamendo 645k, Freesound 592k, Commons 4M audio) and add
  **ccMixter** (`/api/query?...&lic=by&f=json`, keyless, direct mp3 URLs). Openverse
  anonymous cap measured: 20/min, 200/day.
- **Pollinations anonymous is degraded.** Only model `sana` is served (the `model` param is
  ignored), a visible watermark appears despite `nologo=true`, 1 request per 15 s, and the
  legacy API is marked "being deprecated". Anonymous TTS already returns 404. Make Openverse
  the default image source and label Pollinations as degraded.
- **Footage.** Add **Internet Archive** beside Wikimedia Commons: keyless JSON search with
  `licenseurl:*publicdomain*` or CC-BY filters (e.g. NOAA 1080p). Pexels, Pixabay, Coverr
  all need keys. No keyless video generation exists.
- **SFX.** Kenney packs are CC0 with direct zips; Freesound is reachable keyless only through
  Openverse. BBC Sound Effects is non-commercial.

---

## 7. Recommendations, ranked

Ranked by expected effect on quality (Q) and on speed/cost (S). Effort is engineering time.

### Tier 1 — do first

1. **Restore per-frame worker fan-out, engine-driven.** (S: frames stage from ~17 min toward
   the August 9–11 min; Q: neutral-to-up, clean context per frame.) Have the engine run
   `frame-packets.mjs` after the storyboard gate, change the `frames` instruction to
   "dispatch one worker per frame per `subagent-dispatch.md`, in parallel", and define the
   worker in `agent.ts` via the SDK `agents` option with `skills` preloaded
   (`hyperframes-core`, `hyperframes-animation`), `tools: [Read, Write, Edit, Glob]`,
   `maxTurns`, and `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1`. Cap concurrency at 4–6 on this
   machine. If the preset's anti-delegation line cannot be overridden by the stage prompt,
   fall back to engine-side fan-out with a Workflow or separate `query()` calls per frame.
   Effort: medium.
2. **Bump the CLI pin to 0.8.153 and update the skills.** (Q and S.) Gains BeginFrame
   capture, stuck-check and stalled-render diagnostics, portrait lint, the memory-leak fix,
   `check --range`, `snapshot --composition`. First update `storyboard.ts` for the 0.8.152
   artifact-path move, then run `npx hyperframes@latest upgrade --project . --check` on two
   existing projects. Run `npx hyperframes skills update`. Effort: small, plus a re-validation
   pass.
3. **Run `check` with teeth and feed structured findings back.** (Q: directly targets the
   Code2Video failure modes; S: shorter check-fix loop.) Engine runs
   `check --json --strict --at-transitions --frame-check --caption-zone "x0=0;y0=.82;x1=1;y1=1;severity=error" --snapshots`,
   parses the JSON (selector, file, bbox, time, `suggestedColor`), and re-dispatches only the
   failing frame's worker with the finding and its crop. Treat `browserSkipped:true` as
   failure. Also run `hyperframes-animation/scripts/animation-map.mjs` for collision,
   offscreen, dead-zone and stagger flags. Effort: small-medium.
4. **Route models and effort per stage.** (S: workers at Sonnet 5.5 medium are ~2.5× cheaper
   than Opus 5 per token; media/wiring at Haiku 5.5 far cheaper.) Keep the orchestrator on
   Opus 5.5 (not legacy Opus 5). Set effort per subagent, never via
   `CLAUDE_CODE_EFFORT_LEVEL`. Run a 3-brief A/B of Sonnet vs Opus workers before switching,
   because Code2Video has no Sonnet result. Effort: small.

### Tier 2 — next

5. **Blind visual judge at the pre-render gate.** (Q.) A read-only subagent with fresh
   context gets the contact sheet plus each frame's storyboard block and returns binary
   atoms per frame (hero visible and largest; on-screen text is motion-graphics copy, not
   the voiceover sentence; nothing below 83% height or in the right 120 px strip; blueprint
   move recognisable; `handoff_in/out` seam holds across cut−0.1 s / cut+0.2 s). Engine turns
   failures into the existing per-frame note mechanism, caps at two repair rounds, then shows
   the human. One image batch per round, at the phase boundary only, because images re-price
   the cache. Keep the human gate. Effort: medium.
6. **Sketch pass before frames.** (Q.) Between the storyboard gate and frames, the
   orchestrator writes `storyboard.html` wireframes (real fonts, colours, copy; no motion;
   no CLI). Show that at the storyboard gate instead of text only; workers then "dress the
   layout, never redraw it". Effort: small-medium.
7. **Per-frame duration from real audio, validated.** (Q.) Validate `audio_meta.json` or
   per-line WAV durations exist before frames; write `duration:` into each packet; check each
   frame's `data-duration` against its line within ±0.3 s, not only the total. Trace where
   caption word timings come from today; if interpolated, add faster-whisper alignment.
   Effort: small.
8. **Media catalog refresh.** (Q and S.) Kokoro as a warm daemon; content-hash cache on
   `sha256(provider+voice+speed+text)`; drop MusicGen as default and add ccMixter; Openverse as
   default image source with Pollinations labelled degraded; Internet Archive footage; Kenney
   CC0 SFX bundle. Effort: medium, spread across small independent changes.
9. **Prompt hygiene for Opus 5.x.** (S.) Remove "verify/double-check" wording; tell the agent
   to use `timeline --json` instead of reading `index.html`; scope a delegation instruction
   to frames only; medium effort for media and wiring. Effort: small.

### Tier 3 — cheap hygiene and experiments

10. **Pre-install a curated registry set at scaffold time** and fetch media before fan-out
    (workers race the registry). Freeze a recipe per video type (`media-use recipe.mjs
    freeze`) so repeat jobs start from an approved `frame.md` plus storyboard skeleton.
11. **Design-adherence check.** Validate `frame.md` exists before frames; after frames, a
    regex pass for hex values outside the palette and font families without `@font-face`, or
    a Haiku 5.5 subagent running the `design-adherence.md` checklist.
12. **Cache and hook hardening.** `promptCacheTtl: '1h'` because gates pause longer than
    5 min; explicit timeout on the turn-end hook; per-stage cost from `modelUsage` deltas so
    the next version of `costs.md` has stage-level numbers.
13. **Render tuning, low priority.** Run `hyperframes benchmark --json` once; try
    `--workers 2` with `--no-low-memory-mode`; `--quality draft` for judge renders. Expect
    tens of seconds, not minutes.

---

## 8. Expected effect, honestly

- Wall-clock: fan-out plus a tighter check loop is the only path from 40–65 min to roughly
  20–30 min for a 30 s video. Render tuning and media daemonising together save a few minutes.
- Cost: model routing and smaller worker contexts should cut the frames stage cost
  substantially; total tokens may rise slightly from orchestration. Measure with
  `modelUsage` on three briefs before and after.
- Quality: the check flags and motion sidecars attack the measured failure modes
  (`content_overlap` is already the top check failure). The judge raises the floor but will
  disagree with humans roughly a quarter of the time, so it must not replace the gate.

## 9. Open questions and unverified items

- Whether the `claude_code` preset's anti-delegation line applies to Opus 5.5 and whether a
  stage prompt overrides it. Test with one run.
- Sonnet 5.5 and Haiku 5.5 quality as frame workers: no benchmark exists; A/B needed.
- Linux multi-worker streaming-encode behaviour and actual `--workers` gain on this CPU.
- Where filmwright's caption word timings come from (not traced).
- Cloud render price and speed (secondhand only). Not free, so out of catalog regardless.
- Naturalness of Supertonic 3 and Pocket TTS relative to Kokoro (no arena entry).
- Pollinations anonymous shutdown date ("being deprecated", no date given).
- Code2Video rankings are HeyGen's own benchmark on their framework; treat as indicative.
