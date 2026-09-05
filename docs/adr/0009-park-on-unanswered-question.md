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

With no answer, the run **parks**: the tool handler aborts the session, the job
moves to `awaiting-input` with the question retained, and the worker takes the
next job.

How long it waits first depends on whether anybody is there. The studio's event
stream touches a `viewer` file while a job page is open, so the wait loop can
tell the two cases apart:

- nobody watching → `FILMWRIGHT_ANSWER_GRACE_SECONDS` (default 60);
- somebody watching → `FILMWRIGHT_ANSWER_GRACE_MINUTES` (default 10), held open
  for as long as they stay.

Presence is re-checked every poll, not once up front, so opening the page a few
seconds after the question lands still buys the long window.

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
- The grace period is no longer a guess. It was: too short wasted context on
  work-in-progress, too long stalled the queue — and with one fixed value tuned
  for a person, unattended runs idled a full ten minutes at every gate. Measured
  across the first 30 runs, that made the review gates **half of all wall clock**
  (649 of 1,296 minutes). Splitting the value by presence takes the cost of an
  unanswered question to about a minute without ever parking on a real person.
- Presence is best-effort. A heartbeat that fails to write only costs the short
  grace, and the question still survives on the job — so it degrades to the old
  behaviour of parking, never to losing work.

## Alternatives considered

**Wait indefinitely.** Simplest, keeps full context — and one unanswered
question blocks every other job.

**Auto-pick the recommended option.** Runs always finish, but the platform
decides without you, which defeats the purpose of asking.
