# 6. When something goes wrong

## First: nothing is ever thrown away

A run that fails, is cancelled, runs out of budget or parks waiting for you keeps
**everything it built** in `projects/<slug>/`. Captures, script, voiceover,
storyboard, frames — all still there. Picking the job back up continues from that
state rather than starting over.

## Re-queueing

```bash
npm run requeue                     # list what can be re-queued
npm run requeue -- <slug>           # resume it, reusing the work on disk
npm run requeue -- <slug> --fresh   # start over in a new directory
npm run requeue -- --failed         # resume every failed job
```

The listing tells you which is which:

```
failed     resumable   25s-promotional-tiktok-website   A 25s promotional…
failed     fresh only  8-second-logo-sting-developer    An 8-second logo…
```

`fresh only` means the project directory is gone, so there is nothing to resume.

**Resume is the default and is almost always what you want.** Regenerating the
expensive early work is exactly what exhausts budgets.

## Common outcomes

### "Budget limit reached"

The run hit `VIDEOS_MAX_BUDGET_USD`. The job log tells you the exact command to
continue it. Either resume as-is, or raise the ceiling in `.env` first if the
run was genuinely mid-way through something large.

This is the most common failure on a first video, and the least alarming — see
[operations/costs.md](../operations/costs.md).

### Status `needs you`

Not a failure. The run asked a question, nobody answered within the grace
period, and it parked so the worker could move on. Answer on the job page and it
re-queues itself.

### "Cannot resume: projects/… no longer exists"

The project directory was deleted or moved. Re-queue with `--fresh`.

### "hyperframes init failed"

The error message carries the CLI's own last line, which is usually the actual
reason. Run `npm run doctor` — a missing or broken `hyperframes` CLI shows up
there.

### The job sits at `queued` forever

The worker is not running. `npm run dev` starts both halves; `npm run dev:worker`
starts just the worker.

### Nothing in the activity feed

The worker has not claimed the job yet, or it is not running. Check the terminal
where you started it.

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
