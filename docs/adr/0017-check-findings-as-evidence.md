# 0017 — Check findings are structured evidence, not log tails

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

ADR-0015 made the engine run `npm run check` itself. What it handed back to the agent on
failure was the last 25 lines matching `error|failed`, from a project-pinned CLI with no
flags. Measured: the check stage still takes 10 minutes median, and `content_overlap` is
the top failure. Meanwhile `hyperframes check` grew `--json` (pure stdout), `--at-transitions`
(samples at tween boundaries, where mid-motion text collisions happen), `--frame-check`,
`--caption-zone` with severity, `--strict`, and `--snapshots` with per-finding crops.
HeyGen's Code2Video report names those exact failure modes as the dominant craft errors in
agent-authored video. None of the flags were in use.

## Decision

The engine calls the pinned CLI directly with `--json --at-transitions --frame-check`,
adds a caption keep-out zone at error severity when captions are on, and parses the
report. Findings are grouped by source file and rendered for the agent with code, time,
selector, message and fix hint. `browserSkipped` counts as failure. Warnings fail the stage
only when `FILMWRIGHT_CHECK_STRICT` is set. The report path is logged so a person can open
the same evidence.

## Consequences

- The orchestrator can re-dispatch the one frame whose worker produced the finding
  instead of reading the whole project.
- A run now sees transition-seam overlaps that the midpoint sampling missed.
- Stricter checks mean more correction rounds on the first runs; the attempt cap in the
  stage driver bounds that.

## Alternatives considered

**Keep `npm run check` and a log tail.** It is what produced a 10-minute fix loop.

**`--strict` by default.** Rejected for now: a contrast warning on a decorative eyebrow
would fail a run, and ADR-0015's calibration lesson applies.
