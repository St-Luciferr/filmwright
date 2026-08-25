# Costs

Generation is expensive and variable. These are measured figures from this
repository, not estimates.

## Measured runs

| Run | Turns | Cost | Outcome |
|---|---|---|---|
| First attempt, 25s narrated promo | 82 | **$8.18** | Budget exhausted. Reached capture, script, voiceover, music, storyboard — **zero frames authored** |
| Resumed continuation | 39 | **$19.82** | Finished: frames, check, render → 25.1s, 1080×1920 |
| Revision — "add a character" | 14 | **$1.87** | Rejected as insufficient |
| Revision — same request, done properly | 162 | **$13.16** | Accepted |

Two things follow.

**The first half is not the expensive half.** $8.18 bought everything *up to*
frame authoring. Frames, check-and-fix and render all came after. A budget that
looks generous against early progress can still be a third of what is needed —
which is why the default is $25, not $8.

**Blind revision is where money leaks.** The $1.87 + $13.16 pair is one request
answered twice, because there was no way to see the frames before rendering. The
[storyboard gate](../user-guide/04-reviewing-frames.md) exists to close that
loop, and costs nothing but wall-clock.

## Controls

| Control | Effect |
|---|---|
| `FILMWRIGHT_MAX_BUDGET_USD` | Hard ceiling. The run stops; work is kept and resumable |
| `FILMWRIGHT_TIMEOUT_MINUTES` | Hard wall-clock ceiling |
| `FILMWRIGHT_EFFORT` | `low`/`medium` cost less per turn; `xhigh`/`max` cost more |
| **Cancel** | Stops a run that is going wrong. Everything built is kept |
| **Review gates** | Catch a wrong direction at the script, before frames are paid for |

A budget stop is **not** a loss of the money spent — the work is on disk and
resuming continues from it. Raising the ceiling mid-project is fine.

## Keeping the bill down

1. **Leave interactive mode on.** A question costs a few cents. A video built on
   a wrong assumption costs a full run.
2. **Review at the script gate.** The cheapest place to change direction is
   before any frame exists.
3. **Use the storyboard gate.** Correcting a frame there is free; correcting it
   after a render is a revision.
4. **Keep notes specific.** A note naming a frame is a targeted edit. "Make it
   better" is a rebuild.
5. **Resume, do not restart.** `--fresh` re-captures the site and re-generates
   the voiceover.
6. **Shorter videos cost less**, roughly with frame count rather than seconds.

## Watching spend

Cost and turn count are recorded per job and shown in the Spec panel. The
activity feed logs the session total when it ends:

```
Session finished — 39 turns, $19.82
```

Because a revision is a separate job, the true cost of a finished video is the
sum across its versions — the Versions panel lists them.
