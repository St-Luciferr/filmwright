# 0004 — Store jobs as files, not in a database

- **Status:** Accepted
- **Date:** 2026-08-24

## Context

Jobs need to be created by the web app, claimed by a separate worker process,
updated as they run, and tailed live by a browser. That is the shape a job queue
and a database usually fill.

## Decision

Each job is a directory under `data/jobs/<id>/`:

```
job.json          the record, rewritten atomically (temp file + rename)
events.ndjson     append-only activity log
answers/<id>.json answers to blocking questions
steer.ndjson      append-only notes typed at a running job
cancel            presence of this file requests cancellation
```

The SSE endpoint tails `events.ndjson` **by byte offset**, so the live view
costs one small read per second and never re-sends history.

## Consequences

- No service to install, no schema to migrate, no daemon to keep alive. `npm
  install && npm run dev` is the whole setup.
- Everything is greppable and diffable. Debugging a run means reading a file.
- Writes are atomic per job, so a reader never sees a half-written record.
- **This is correct only for a single worker.** `claimNextJob` is a
  read-then-write with no compare-and-swap; two workers would race. The worker
  is deliberately serial anyway — a HyperFrames render saturates the machine.
- Cross-machine deployment would need this replaced.

## Alternatives considered

**SQLite.** `node:sqlite` was still flag-gated on the target Node version, and
`better-sqlite3` is a native build. Neither is worth it for a single-writer
queue whose largest table would hold a few dozen rows.

**Redis + BullMQ.** Correct at scale, and a service to run for a tool whose
concurrency is one.
