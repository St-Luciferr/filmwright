# 0011 — Build the storyboard from real snapshots, sampled late in each clip

- **Status:** Accepted
- **Date:** 2026-08-25

## Context

Feedback on a video could only be given after it had rendered. A measured
sequence shows the cost: a revision was attempted for **$1.87 / 14 turns**,
rejected as insufficient, then redone properly for **$13.16 / 162 turns** — a
~$15 round trip spent without ever seeing what the frames looked like.

Frames are the unit people actually critique, and they exist long before the
render does.

## Decision

At the pre-render gate the **worker** captures one still per frame with
`hyperframes snapshot --at <t1,t2,…> --no-end` and shows them as a grid, each
with its own comment box.

Stills are sampled at **two thirds through each clip**, not the midpoint:

```
sampleTime(start, duration) = start + min(duration * 0.66, duration - 0.1)
```

A manifest records what was captured and when; the grid warns when `index.html`
or any frame file has changed since.

## Consequences

- The pictures are produced by the same runtime the renderer uses, seeked to
  real timestamps — a preview of the output, not a mockup of it.
- The first implementation sampled midpoints and caught type still sliding into
  frame. Reviewers would have commented on transitions instead of compositions.
- Per-frame comments compile into a change list that names the file to edit
  (`- frame \`03-this-is-iom-mock\` — logo lockup too small`), which is far more
  actionable than a note about the video as a whole.
- Capture launches a browser per frame and takes a minute or two; the gate shows
  a capturing state while it runs.
- The platform captures rather than the agent, so the stills always correspond
  to what is actually on the timeline.

## Alternatives considered

**Have the agent produce the storyboard.** It already writes `STORYBOARD.md`,
but that is prose. Stills it generated could drift from the composition.

**Render a low-quality draft video.** Slower than six screenshots and no easier
to comment on frame by frame.
