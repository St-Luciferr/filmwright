# 0009 — Park a run that nobody answers

- **Status:** Accepted
- **Date:** 2026-08-25

## Context

A blocking question holds the session open. With a single worker
([ADR-0004](0004-file-based-job-store.md)), one unanswered question stalls the
entire queue and burns wall-clock against the run's timeout until it fails.

Generation takes tens of minutes. Expecting someone to be watching when the
question arrives is not realistic.

## Decision

After `VIDEOS_ANSWER_GRACE_MINUTES` (default 10) with no answer, the run
**parks**: the tool handler aborts the session, the job moves to
`awaiting-input` with the question retained, and the worker takes the next job.

Answering later records the decision and re-queues the job as a resumed run
([ADR-0007](0007-resume-instead-of-restart.md)), with the answer replayed so it
is not asked again.

## Consequences

- The queue never stalls, and no work is lost — everything produced so far stays
  on disk.
- Parking is a normal outcome, not a failure. `awaiting-input` renders as
  "needs you", not as an error.
- A parked job resumes in a **new session**, so it pays to re-read its own
  outputs. That is the same trade already accepted for resume.
- The grace period is a guess. Too short wastes context on work-in-progress; too
  long stalls the queue. It is configurable for that reason.

## Alternatives considered

**Wait indefinitely.** Simplest, keeps full context — and one unanswered
question blocks every other job.

**Auto-pick the recommended option.** Runs always finish, but the platform
decides without you, which defeats the purpose of asking.
