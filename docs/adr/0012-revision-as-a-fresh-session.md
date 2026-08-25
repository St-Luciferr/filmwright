# 0012 — Run a revision as a fresh session against the same project

- **Status:** Accepted
- **Date:** 2026-08-25

## Context

A finished render was a dead end: the only way to change it was to describe a
whole new video. Real feedback is local — "the logo at 0:08 is too small" — and
refers to a moment on screen.

## Decision

Notes are pinned to the playhead and resolved **server-side** to the frame on
screen, using `index.html`'s real `data-start` / `data-duration`. Applying them
queues a revision: same project directory, `resume: true`, previous decisions
carried forward, and a prompt that reframes the task as a **change, not a
rebuild** — smallest edit per note, no re-recording voiceover, no re-capturing
the site.

Every render is kept. Before a revision re-renders, the current MP4 moves to
`renders/history/v<n>-<name>.mp4` and the job that produced it is repointed at
that file, so each version stays playable from its own page.

## Consequences

- A note becomes an instruction pointing at one file, rather than a description
  the agent has to go hunting for.
- Version history is real and cheap: three versions of the reference project
  exist on disk and each plays from its own job page.
- `findRender()` deliberately does not recurse into `history/`, so after
  archiving, the `render` stage correctly reads as pending until the new render
  lands.
- A revision is a **new session** that re-reads `STORYBOARD.md` and
  `index.html`. It costs tokens but keeps revisions independent of context.
- "Smallest change that satisfies each note" is a prompt instruction, not a
  guarantee. A note asking for something sweeping is still sweeping work.

## Alternatives considered

**Continue the original session.** Cheaper orientation, but sessions do not
survive worker restarts, and revisions often arrive days later.

**Overwrite the render.** Simpler, and it destroys the version the reviewer was
commenting on.
