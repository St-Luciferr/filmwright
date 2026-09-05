# 0015 — The engine drives the stages, not the prompt

- **Status:** Accepted
- **Date:** 2026-09-05

## Context

The workflow lived in the prompt. One agent session was handed the whole job —
"run that workflow all the way through: script, storyboard, frame compositions,
media, audio, captions, assembly", then check, then render — and the engine
watched the project directory to report what appeared
([ADR-0003](0003-filesystem-derived-progress.md)).

That made progress honest but not binding. Nothing enforced the order, the
artifacts, or the gates. Measured across the first 30 runs:

- **23 of 66 mandated review gates fired.** The prompt said to call
  `request_review` "exactly three times"; on first attempts 13 of 21 happened,
  on resumed runs 10 of 45.
- **Seven resumed runs rendered a finished video having fired no gate at all** —
  including the pre-render gate, the one that exists precisely so nothing
  reaches an mp4 unreviewed.
- **`check: done` was not evidence.** It was inferred from a regex over the
  agent's Bash commands, then set to `true` unconditionally after any successful
  render.
- **Existence was mistaken for validity.** `detectStages` tested
  `fs.existsSync("SCRIPT.md")`; an empty file passed.
- Of the twelve videos on disk, three run 26%, 27% and 139% away from the
  duration their brief asked for. Nothing ever checked.

## Decision

The order, the artifacts and the gates move out of the prompt and into
`workflow.ts`, as a plan the engine walks.

Each stage declares what it produces, what makes that output valid, and whether
a person signs it off. The pipeline asks the agent for **one stage at a time**
and does not send the next instruction until the current stage's artifact passes
its validator. `check` and `render` are performed by the engine rather than
asked for, which is what turns "check passed" from a claim into evidence.

Three consequences follow from the plan being the engine's:

- **Gates are gates.** The engine opens them at the points the plan declares,
  using the agent's end-of-stage summary as what it puts in front of a person.
  On an interactive job the pre-render gate always opens — including on a
  resumed run, which is where every one of the seven unreviewed renders came
  from. A session that ends with the plan unfinished is a failure on an
  interactive job rather than something to paper over by rendering anyway.
- **Validators replace existence checks.** A document must have content; the
  storyboard must declare countable frames; every authored frame must be placed
  on the timeline; the wired runtime must land within
  `FILMWRIGHT_DURATION_TOLERANCE` of the brief.
- **A resumed run picks up where it stopped.** Agent stages already satisfied on
  disk are skipped, so the script is not rewritten to reach the frames. Engine
  stages are never skipped.

**The whole plan runs inside one agent session.** The turn-end hook validates
and pushes the next instruction, so the session continues with its full context
([ADR-0010](0010-streaming-input-for-steering.md) already kept it open for
steering). One session per stage was the obvious alternative and was rejected:
every stage boundary would pay the re-discovery cost measured at a mean of 12.3
minutes per resumed run.

A **revision** stays off-plan ([ADR-0012](0012-revision-as-a-fresh-session.md)).
The video exists and specific things about it are to change; walking the whole
plan again is the wrong shape.

## Consequences

- Stage order is now real, so `STAGES` is the order stages run in rather than a
  display convention. `media` moved ahead of `frames`: a frame's duration comes
  from the voiceover line it carries, and authoring frames first means guessing
  those durations and rebuilding around the real audio.
- A stage that cannot satisfy its contract after `MAX_STAGE_ATTEMPTS` fails the
  run, naming the stage. Bounded, rather than looping on the same complaint.
- The duration tolerance is a real constraint with real consequences, so it is
  configurable and calibrated against the videos already on disk. At 0.1, five
  of twelve would have been held back for rework, including 13% and 18% drifts
  that are craft variance. At 0.2 the three that fail are the three that are
  genuinely not the video that was asked for. The agent is now told the number
  up front, which none of those runs were.
- A resumed job with nothing left to author opens no session at all and costs
  nothing — it walks the engine stages, opens the render gate, and renders.
- The prompt is smaller and no longer describes a workflow it does not control.

## Alternatives considered

**Keep the flow in the prompt and check compliance afterwards.** Cheaper, and it
detects a skipped gate only once the render it was guarding already exists.

**One session per stage.** Cleanest separation, and it would make per-stage model
and effort selection trivial. Rejected for now on the measured cost of rebuilding
context at every boundary; worth revisiting if that cost falls.

**Hard-fail on any duration drift.** Rejected as calibrated above — a validator
that fires on craft variance trains everyone to widen it until it means nothing.
