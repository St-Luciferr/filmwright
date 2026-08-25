# 3. While it runs

## The pipeline

Eight stages, on the left of the job page:

```
✔ scaffold    ✔ brief      ✔ script     ✔ storyboard
▸ frames      ○ media      ○ check      ○ render
                4/7 frames
```

Each one is marked done only when its artifact actually exists on disk — the
script file is written, four of seven frame compositions exist, the render is
there. It is a description of the project directory, not a claim by the agent,
so it cannot get ahead of the real work.

## The activity feed

Two views.

**Story** (default) is what to watch: what the agent is thinking, stage changes,
questions, your notes. Above it, one live line shows the current action —
`Rendering`, `Wrote frame 03-nine-and-a-half`, `Generating voiceover` — so a
quiet stretch does not look like a hang.

**Everything** is the full stream including every file read and shell command.
Use it when something has gone wrong.

## Questions

With **Involve me in decisions** on, the agent asks when a choice would
materially change the video and your brief does not settle it. The run stops and
the page shows a card:

```
┌─ needs your call ───────────────────────────────┐
│ [Hero visual]                                   │
│ The site has no product photography. Which      │
│ visual approach for the hero beat?              │
│                                                 │
│  ○ Recreate the UI                              │
│    Vector rebuild in brand teal. Always crisp.  │
│  ○ Captured screens                             │
│    Real, but small text at phone size.          │
│  ○ Typographic only                             │
│  ○ Something else…  ______________________      │
└─────────────────────────────────────────────────┘
```

Pick an option or write your own. The run continues immediately.

**You do not have to be watching.** If nobody answers within ten minutes the job
**parks**: it goes to `needs you`, everything built so far is saved, and the
worker moves on to the next job. Answer whenever you get back and it picks up
from where it stopped. Nothing is lost and the queue never stalls.

## Review gates

The run also pauses at three fixed points:

1. **after the script** — you read `SCRIPT.md` inline
2. **after the storyboard** — you read `STORYBOARD.md` inline
3. **before rendering** — you review the actual frames, covered in
   [chapter 4](04-reviewing-frames.md)

Each offers **Approve** or **Request changes**. Changes go back as instructions
the agent must act on before it can move past that gate.

## Sending a note

Under the activity feed there is a composer. Anything you type reaches a running
job as ordinary direction — no need to wait for it to ask:

> make beat 3 land harder

Notes are non-blocking; they arrive at the next turn boundary, so expect a short
delay before the agent acts. Use them for steering. Use a review gate when you
want the run to actually stop.

## Stopping

**Cancel** aborts the session promptly. The project directory keeps everything
built so far, and the job can be re-queued later — see
[chapter 6](06-troubleshooting.md).
