# 6. When something goes wrong

## First: nothing is ever thrown away

A run that fails, is cancelled, runs out of budget or parks waiting for you keeps
**everything it built** in `projects/<slug>/`. Captures, script, voiceover,
storyboard, frames — all still there. Picking the job back up continues from that
state rather than starting over.

## Picking a stopped run back up

A run that failed or was cancelled shows a card at the top of its job page: what
happened, what it means, and two buttons.

| Button | What it does |
|---|---|
| **Continue where it stopped** | Queues a new run in the same project directory. Everything already built is reused, and any decisions you made are carried forward so you are not asked twice. |
| **Start over** | Queues a new run in a fresh directory, from the original prompt. |

**Continue is almost always what you want** — regenerating the expensive early
work is exactly what exhausts budgets. It is offered only when there is
something on disk to continue from; if the project directory has been deleted,
the card says so and only Start over is available.

The failed run is kept either way, so the history shows both what went wrong and
what you did about it. The library's project menu has the same action under
**Run this again**.

### From the command line

```bash
npm run requeue                     # list what can be re-queued
npm run requeue -- <slug>           # continue it, reusing the work on disk
npm run requeue -- <slug> --fresh   # start over in a new directory
npm run requeue -- --failed         # continue every failed job
```

The listing tells you which is which:

```
failed     resumable   25s-promotional-tiktok-website   budget    A 25s promotional…
failed     fresh only  8-second-logo-sting-developer    scaffold  An 8-second logo…
```

`fresh only` means the project directory is gone, so there is nothing to
continue.

### Unattended runs

If nobody is watching the queue, set `FILMWRIGHT_AUTO_CONTINUE=2` in `.env` and
the worker continues a failed run by itself, up to that many extra attempts. It
never does this for a budget or timeout stop — those hit the same ceiling again —
or for a failure that left nothing on disk.

## Common outcomes

### "Budget ceiling reached"

The run hit `FILMWRIGHT_MAX_BUDGET_USD`. Either **Continue where it stopped** as
is, or raise the ceiling in `.env` first if the run was genuinely mid-way
through something large.

This is the most common failure on a first video, and the least alarming — see
[operations/costs.md](../operations/costs.md).

### Status `needs you`

Not a failure. The run asked a question, nobody answered within the grace
period, and it parked so the worker could move on. Answer on the job page and it
re-queues itself — or **Abandon run** if you have changed your mind, which
cancels it and leaves the work on disk to continue later.

### "The worker stopped mid-run"

The worker process died or was restarted while the run was in flight. Nothing it
had already written was lost — **Continue where it stopped** carries on from
there.

### "The project directory is gone"

The project directory was deleted or moved, so there is nothing to continue.
**Start over**, or `npm run requeue -- <slug> --fresh`.

### "The project could not be created"

The error message carries the CLI's own last line, which is usually the actual
reason. Run `npm run doctor` — a missing or broken `hyperframes` CLI shows up
there.

### The job sits at `queued` forever

The worker is not running. `npm run dev` starts both halves; `npm run dev:worker`
starts just the worker.

### Nothing in the activity feed

The worker has not claimed the job yet, or it is not running. Check the terminal
where you started it.

### Media failed to generate

Check which provider actually broke before changing anything:

```bash
node scripts/free-media.mjs doctor
```

| Symptom | Cause | Fix |
|---|---|---|
| `Kokoro TTS produced no file` / `kokoro-onnx is not installed` | The local voice model's environment was never built | `npm run setup -- --only kokoro` |
| `MusicGen's dependencies are not installed` | The local music model's environment was never built | `npm run setup -- --only musicgen` (~2 GB), or pick **Music: Openverse** |
| `429 Too Many Requests` from Pollinations | Free-tier rate limit, usually from a run fetching several images in a row | It retries with backoff on its own. If it persists, re-queue the job with **Imagery: Openverse** |
| Music stage hangs for many minutes | MusicGen on CPU is genuinely that slow | Expected. To avoid it, pick **Music: Openverse** |
| `Wikimedia Commons has no CC footage for …` | Commons is thin outside common documentary subjects | Expected — the run should fall back to animated stills. Pick **Footage: Animated stills** to skip the search |
| `Openverse found no images for …` | The intent was phrased as a prose prompt | Openverse is a keyword search. Either reword, or switch to **Imagery: Pollinations**, which takes descriptions |

A run is told never to substitute a paid provider when a free one fails, so a
media failure shows up as a stated fallback in the summary, not as a silent
switch. If the summary does not say which provider produced an asset, check the
project's `.media/free-media.jsonl` — every fetch is logged there.

## Reading a job by hand

Everything is a plain file:

```bash
cat data/jobs/<id>/job.json          # the record
cat data/jobs/<id>/events.ndjson     # the full activity log
ls  projects/<slug>/                 # what actually got built
```

## Finishing a job by hand

A project directory is an ordinary HyperFrames project. If the platform cannot
get a run over the line, you can:

```bash
cd projects/<slug>
npm run check
npm run render
```

and the result will appear on the job page the next time it is loaded.
