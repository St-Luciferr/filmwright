# 0016 — Frame workers are defined by the engine, with their own model

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

The HyperFrames workflows are built around an orchestrator that dispatches one
sub-agent per frame (`hyperframes/references/subagent-dispatch.md`, the
`frame-packets.mjs` builder, `frame-worker-core.md`). Before ADR-0015 the agent followed
that doctrine on its own: August runs dispatched 6 to 17 "Build frame NN" workers and
finished the frames stage in 9 to 11 minutes.

ADR-0015 moved the stage order into the engine. Its `frames` instruction said "author
the frame compositions" and never mentioned dispatch. Measured afterwards: every run from
18 September onward made zero `Agent` calls, and the frames stage took 14 to 27 minutes.
The Agent SDK docs also note that the `claude_code` tool preset on Opus 5 adds a line
discouraging delegation unless asked. Four mid-September runs did fan out and were still
slow, so fan-out is the largest lever rather than the only one.

Separately, every stage ran on the same model at the same effort: `claude-opus-5`,
`high`. That model is now listed as legacy, and the SDK lets a subagent carry its own
`model` and `effort`.

## Decision

The engine owns the worker. `agent.ts` registers a `frame-worker` agent definition with
the SDK: a fixed role prompt, tools limited to reading and writing files, a turn cap, and
its own model and effort from configuration. Entering the `frames` stage, the engine runs
the workflow skill's packet builder so `.hyperframes/frame-packets/` exists before the
orchestrator is asked for anything, and the instruction says to dispatch one worker per
frame in parallel, wait on the files, re-dispatch once, then assemble the timeline.

The storyboard contract gains the fields the packet builder needs: every frame block
carries `src:` and `duration:`. The validator enforces them, because a storyboard that
cannot be split into packets cannot be fanned out.

The orchestrator's default model moves to `claude-opus-5-5`. Workers default to
`claude-sonnet-5-5` at `medium` effort. Concurrency is capped by configuration.

## Consequences

- Frames are authored in fresh, bounded contexts (packet plus role plus `frame.md`)
  instead of one growing transcript, which is what the skills were tuned for.
- Worker spend is cheaper per token and rolls into `total_cost_usd`, so the budget
  ceiling still holds.
- A storyboard without `src:` lines is now rejected at the storyboard gate rather than
  discovered at frames.
- Whether the Sonnet worker matches Opus quality is unmeasured. The default is a
  hypothesis to be tested on three briefs; `FILMWRIGHT_WORKER_MODEL` switches it.
- If the preset's anti-delegation line wins over the stage instruction, the fallback is
  engine-side fan-out with one session per frame, which reintroduces the per-boundary
  context cost ADR-0015 measured.

## Alternatives considered

**Leave dispatch to the skill doctrine.** That is what the measured regression is.

**Engine-side fan-out with one `query()` per frame.** Cleanest control, but each frame
would pay to rebuild context, and the orchestrator loses the ability to react to a
worker's summary. Kept as the fallback.

**Keep a single model.** Simplest, but the frames stage is the most expensive and the
most mechanical, which is exactly where a cheaper model should be tried first.
