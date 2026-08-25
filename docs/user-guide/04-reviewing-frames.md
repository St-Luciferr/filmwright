# 4. Reviewing the frames

The last gate before rendering shows you the video **frame by frame**, as real
pictures, with a comment box under each one.

```
┌─ review · pre-render ───────────────────────────────────┐
│ Six frames are built and checked. Review before render. │
│                                                         │
│  Frames  6                            [ Re-capture ]    │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│  │  01  │ │  02  │ │  03  │ │  04  │ │  05  │ │  06  │  │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘  │
│  the-real-  not-what-  this-is-   official-  tutor-…    │
│  0:00.0     0:05.5     0:08.0     0:12.4     0:17.7     │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐            │
│  │        │ │        │ │ logo   │ │        │  ← notes   │
│  └────────┘ └────────┘ └────────┘ └────────┘            │
│                                                         │
│  [ Approve & render ]   [ Request changes (1 frame) ]   │
└─────────────────────────────────────────────────────────┘
```

Click any frame to enlarge it.

## Why this matters

Before this existed, the only way to see the video was to render it. On the
reference project that cost a real round trip: a revision was attempted for
**$1.87**, judged insufficient, then redone properly for **$13.16** — about $15
spent without ever having looked at the frames.

Catching it here costs nothing.

## What you are looking at

These are not mockups. Each still is captured from the same runtime that
performs the render, seeked to a real timestamp on the real timeline. What you
see is what will render.

Each frame is sampled about two thirds of the way through its clip rather than
at the middle, because most frames animate their content in over the first half.
A midpoint shot would catch type still sliding through frame and you would end
up critiquing transitions instead of compositions.

## Giving feedback

Write in the box under any frame you want changed. Be specific about the frame,
not the video:

- *"logo lockup too small to read muted"*
- *"hold this one half a second longer"*
- *"the teal is too dark against the screenshot"*

The general box at the bottom is for the piece as a whole — pacing, tone,
something missing everywhere.

Your comments compile into one change list the agent receives:

```
- frame `03-this-is-iom-mock` — logo lockup too small
- frame `05-tutor-read-your-paper` — hold this one 0.5s longer
- overall — add a human character
```

Because each note names the frame, it names the file to edit. That is the
difference between a targeted fix and a vague instruction the agent has to
interpret.

**Approve & render** proceeds. **Request changes** sends the list back; the agent
must address it and return to this gate.

## Outside the gate

Any job whose frames are built shows the same grid, with a **Capture** /
**Re-capture** button, so you can inspect a composition whenever you like.

Capturing launches a browser per frame and takes a minute or two on a
six-frame video.

If `index.html` or any frame file has changed since the stills were taken, the
grid says **"composition changed since capture"** rather than showing you
pictures that no longer match.
