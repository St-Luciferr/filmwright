# Glossary

**ADR** — Architecture Decision Record. One decision, its context, and its cost.
See [docs/adr](../adr/README.md).

**Brief** — `BRIEF.md` in a project. Frontmatter written by the platform from the
form, plus the prompt as intent. The confirmed input for a run
([ADR-0002](../adr/0002-pre-written-brief.md)).

**Checkpoint** — A fixed review gate (`script`, `storyboard`, `pre-render`) where
the run pauses for approval. Raised by `request_review`.

**Clip** — One timed element on the timeline, read from `index.html`'s
`data-start` / `data-duration`. Frames are clips; so are captions and audio.

**Frame** — One scene composition, `compositions/frames/*.html`. The unit people
critique, and the unit the storyboard shows.

**Interaction** — Something blocking a run and waiting on a person: a question or
a checkpoint. Stored as `job.pending`.

**Job** — One run. Owns a status, a spec, a project directory and an activity
log. A revision is a new job pointing at the same project.

**Parked** — A run that stopped because a question went unanswered. Status
`awaiting-input`, shown as "needs you"
([ADR-0009](../adr/0009-park-on-unanswered-question.md)).

**Project** — A real HyperFrames project in `projects/<slug>/`. The actual
deliverable; the MP4 is its output.

**Resume** — Continue a run in its existing project directory, reusing what is
already built ([ADR-0007](../adr/0007-resume-instead-of-restart.md)).

**Revision** — A new run against an existing project, driven by notes on its
render ([ADR-0012](../adr/0012-revision-as-a-fresh-session.md)).

**Stage** — One of eight pipeline steps, derived from artifacts on disk
([ADR-0003](../adr/0003-filesystem-derived-progress.md)).

**Steering** — A non-blocking note sent to a running job, delivered as a user
turn ([ADR-0010](../adr/0010-streaming-input-for-steering.md)).

**Storyboard** — Two things, unfortunately. `STORYBOARD.md` is the agent's
written plan. The **storyboard grid** is captured stills, one per frame
([ADR-0011](../adr/0011-storyboard-from-real-stills.md)).

**Workflow** — A HyperFrames authoring skill (`product-launch-video`,
`motion-graphics`, …) selected on the form and named in the brief.

**Worker** — The process that claims jobs and runs sessions. Serial, and the only
half that spends money.
