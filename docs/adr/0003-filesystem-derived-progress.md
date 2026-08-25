# 0003 — Derive pipeline progress from artifacts on disk

- **Status:** Accepted
- **Date:** 2026-08-24

## Context

The job page shows an eight-stage pipeline. The obvious source is the agent
itself — parse what it says it is doing, or have it report stages. Both make the
UI a story the model tells rather than a description of what exists.

## Decision

`packages/engine/src/stages.ts` computes every stage by inspecting the project
directory:

| Stage | Evidence |
|---|---|
| `scaffold` | `hyperframes.json` exists |
| `brief` | `BRIEF.md` exists |
| `script` | `SCRIPT.md` exists |
| `storyboard` | `STORYBOARD.md` exists |
| `frames` | count of `compositions/frames/*.html`, against the frame count parsed from `STORYBOARD.md` |
| `media` | `assets/voice`, `assets/bgm`, `assets/sfx` non-empty |
| `check` | a `hyperframes check` tool call was observed |
| `render` | `renders/*.mp4` exists |

A poller re-derives this every `VIDEOS_POLL_MS` and writes any change to the job
record. The agent's own narration is logged separately and never drives it.

## Consequences

- Progress cannot overstate itself. A stage is done when its artifact exists.
- The frame counter reads "4/7" because the plan is parsed from `STORYBOARD.md`,
  which is why the agent prompt insists that file is written before frames.
- `check` is the one stage with no durable artifact, so it is the one stage
  tracked from an observed tool call — the honest exception.
- The detector is coupled to HyperFrames' project layout. A different output
  framework would need its own detector.

## Alternatives considered

**Ask the agent to report progress** — a structured tool it calls per stage.
Rejected: it makes the progress bar a claim rather than an observation, and a
run that dies mid-stage leaves the UI asserting something untrue.
