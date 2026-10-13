# Pipeline upgrade plan — October 2026

Source research: `../research/2026-10-13-pipeline-improvements.md` and
`../research/2026-10-13-hyperframes-alternatives.md`. Decision: stay on HyperFrames
and fix the pipeline around it.

## Goals and how they are measured

| Goal | Baseline (46 runs) | Target | Measured by |
|---|---|---|---|
| Frames stage wall-clock | 17 min median | under 10 min | `stage` events in `events.ndjson` |
| Check-and-fix wall-clock | 10 min median | under 5 min | same |
| Cost per 30 s video | $5–25 | under $10 median | `usage` event, `modelUsage` deltas |
| Check failures reaching the human gate | `content_overlap` top failure | zero errors at the pre-render gate | `check --json` report saved per run |
| Fan-out | 0 workers since 18 Sep | one worker per frame | `Agent` tool events |

Every target is checked against three real briefs after each phase. Targets are
hypotheses; the numbers that come back decide the next phase.

## Phase 1 — toolchain and contract (this change set)

1. **Pin 0.8.153.** `FILMWRIGHT_HYPERFRAMES_VERSION` default and `.env`, `doctor.mjs`,
   `free-media.mjs`, docs. `storyboard.ts` is compatible: `snapshot -o <dir>` still
   writes `frame-NN-at-Ns.png` into the directory given (verified on an existing
   project). Run `npx hyperframes@0.8.153 skills update` so the skills match.
2. **Storyboard contract gains machine-readable fields.** Each `## Frame NN` block must
   carry `src:` and `duration:` (plus `voiceover:`/`scene:` as the skills already
   expect). `src` is what the packet builder keys frames on; without it fan-out cannot
   start. Validator enforces it.
3. **Frame fan-out, engine-prepared.** Entering `frames`, the engine runs the workflow
   skill's `frame-packets.mjs`, which writes one bounded packet per frame plus
   `_role.md` under `.hyperframes/frame-packets/`. The instruction tells the
   orchestrator to dispatch one `frame-worker` subagent per frame, in parallel, with the
   two file paths and the dispatch context, to WAIT on `compositions/frames/<id>.html`,
   to re-dispatch once, and then to assemble `index.html`.
4. **Worker definition in the engine.** `agent.ts` passes an `agents` map with
   `frame-worker`: own model (`FILMWRIGHT_WORKER_MODEL`, default Sonnet 5.5), own effort
   (`FILMWRIGHT_WORKER_EFFORT`, default medium), tools limited to Read, Write, Edit,
   Glob, Grep, a turn cap, and the frame-worker core contract preloaded. Concurrency is
   capped by `FILMWRIGHT_WORKER_CONCURRENCY` (default 4 on this machine) via
   `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`, spawn depth 1.
5. **Orchestrator model.** Default moves from the legacy `claude-opus-5` to
   `claude-opus-5-5`. Effort stays `high`.
6. **Check with teeth.** The engine runs the CLI directly with `--json --at-transitions
   --frame-check` and, when captions are on, `--caption-zone ... severity=error`.
   `--strict` is opt-in (`FILMWRIGHT_CHECK_STRICT`). Findings are parsed and handed back
   grouped by source file with code, time, selector, message and fix hint, so the
   orchestrator can re-dispatch only the failing frame's worker. `browserSkipped` is a
   failure. The raw report path is logged.
7. **Prompt hygiene.** Tell the orchestrator to use `hyperframes timeline --json`
   instead of reading `index.html`, and to delegate frames rather than author them.

Acceptance: typecheck and the unit suite pass; `npm run doctor` passes on 0.8.153; one
paid run on a 25 s brief shows `Agent — Build frame …` events, packets on disk, and a
check report with zero errors before the pre-render gate.

## Phase 2 — quality loop

Status as of 13 Oct: items 8, 9 and 11 implemented; item 10 awaiting a decision.

8. **Done — voice fit.** The planned ±0.3 s rule was wrong. Calibrated across 126
   narrated frames in 15 projects: no frame was ever shorter than its voice line, and
   frames run 0–5.6 s longer (median 0.5 s). The check stage now fails only a line
   longer than its frame (cut off or bleeding into the next). Holds over 3 s are noted
   at the pre-render gate. Durations come from `audio_meta.json`, or the WAV header
   when the audio step did not record one.
9. **Done — blind visual judge.** After check and the design rules pass, a fresh
   read-only session (no skills, no settings, `Read` only, JSON-schema output) gets one
   still per frame and its storyboard block, and answers six yes/no/unsure questions:
   renders, matches scene, hero, copy is not the voiceover, readable, fills the canvas.
   Failures go back to the orchestrator as a per-frame change list; at most two rounds
   per project, then remaining notes are shown at the pre-render gate. A judge that
   cannot run never blocks a render.
10. **Open — sketch pass.** Needs the studio to render agent-written `storyboard.html`
    at the storyboard gate. The studio has no login, so that HTML must be served from a
    locked-down route into a sandboxed iframe with no same-origin access. It also adds
    an orchestrator pass of N sketches before any frame exists. Decide after the
    validation run shows whether fan-out alone fixes layout quality.
11. **Done — design adherence.** A primary font family `frame.md` does not declare, or
    an `@font-face` file missing from disk, fails the check stage. Calibrated: checking
    whole font stacks failed 5 of 16 accepted videos on Arial fallbacks; primary-only
    fails none. Off-palette colours appeared in 13 of 16 accepted videos, so they are
    noted, never failed. Id selectors (`#f06-chrome`) and HTML entities (`&#160;`) are
    excluded from colour matching; both were false positives in calibration.

## Phase 3 — media and cost hygiene

12. Kokoro as a warm daemon with a content-hash cache; ccMixter and Internet Archive
    providers; Openverse as the default image source; Pollinations labelled degraded;
    MusicGen no longer the default; Kenney CC0 SFX bundle.
13. Per-stage cost from `modelUsage` deltas into the job record; 1-hour prompt cache
    TTL for gated sessions once the SDK is bumped and tested.
14. Registry pre-install at scaffold; recipe freeze per video type.

## Out of scope

Changing the renderer or framework (see the alternatives research). Cloud rendering
(paid). Any media provider that needs an account.

## Risks

- The `claude_code` preset may still discourage delegation on Opus 5.5. The first paid
  run tells. Fallback: engine-side fan-out with one `query()` per frame.
- Sonnet 5.5 workers are unbenchmarked for this task. Compare against Opus workers on the
  same three briefs before making the default permanent.
- 0.8.153 checks are stricter than 0.8.12: an older project that passed now reports
  `text_occluded` errors. Expect the first runs to spend a correction round on it.

## Validation runs — 13–14 October 2026

Three unattended briefs on the upgraded pipeline (Opus 5.5 orchestrator, Sonnet 5.5
frame workers, hyperframes 0.8.153). Costs marked "est." are reconstructed from session
transcripts at list prices, because worker restarts interrupted those runs before the
job record could store a total.

| Brief | Length | Wall-clock | Cost | Frames stage | Notes |
|---|---|---|---|---|---|
| Why the sky is blue | 15 s | ~27 min over 2 attempts | $4.04 est. | 5.2 min | Bugs 1–4 hit and fixed mid-run; 4 min network outage |
| MCQ app promo | 30 s | **15.6 min** | **$3.87** | 5.8 min | Clean first pass: check passed, judge 6/6 clean |
| Mitochondria explainer | 25 s | ~40 min over 2 attempts | $8.04 est. | 10.4 min | 19 min stuck on bug 5; judge false positives re-dispatched 5 workers |

Baseline for 25–60 s videos before this work: 35–65 min and $5–25.

Fan-out worked in every run: one worker per frame, dispatched within seconds of each
other, and targeted re-dispatches for check and judge findings.

Bugs found and fixed:

1. Agent SDK 0.3.241 rejected `claude-opus-5-5`; upgraded to 0.3.296.
2. A `blueprint:` with a description appended broke the packet builder; the storyboard
   validator now applies the builder's own parse.
3. Re-dispatched workers ran detached and the engine checked stale frames; workers are
   now foreground-only.
4. A skipped browser check hid the lint errors behind it; they are now listed.
5. Uncapped `--at-transitions` sampled ~700 instants on word-level captions and timed
   out; capped at 40.
6. The visual judge graded the burned-in caption band as on-screen copy; told to ignore it.

Operational lesson: the dev worker runs under a file watcher, so editing engine source
during a run restarts the worker and ends the run. Make engine changes only while the
worker is idle.

Sketch pass (item 10): not justified by this evidence. Frames came out consistent and
well composed in both 25–30 s runs; the weaknesses seen were missing content inside a
frame, which the judge's `matches_scene` and `fills_canvas` questions target.
