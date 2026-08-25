# Command reference

All commands run from the repository root.

## Everyday

| Command | What it does |
|---|---|
| `npm run dev` | Studio on `:3100` **and** the worker, with prefixed output and signal forwarding |
| `npm run dev:web` | Studio only — browse and queue, nothing gets built |
| `npm run dev:worker` | Worker only |
| `npm run doctor` | Preflight: Node, auth, skills, `npx`, `ffmpeg`, the `hyperframes` CLI |
| `npm run seed` | Adopt existing `projects/*` into the library. Safe to re-run |
| `npm run requeue` | List, resume or restart finished jobs |

## Build and checks

| Command | What it does |
|---|---|
| `npm run typecheck` | Typecheck engine and studio |
| `npm run build` | Production build of the studio |
| `npm start` | Production studio + worker |

## `requeue` in detail

```bash
npm run requeue                     # list what can be re-queued
npm run requeue -- <slug|id>        # resume, reusing the work on disk
npm run requeue -- <slug> --fresh   # start over in a new directory
npm run requeue -- --failed         # resume every failed job
```

Resume is the default ([ADR-0007](../adr/0007-resume-instead-of-restart.md)). The
listing marks each job `resumable` or `fresh only`; `fresh only` means the
project directory no longer exists.

The original job record is kept and a new one is queued, so failed runs stay in
the history.

## Working inside a generated project

`projects/<slug>/` is an ordinary HyperFrames project with the CLI pinned:

```bash
cd projects/<slug>
npm run check     # lint + runtime + layout + motion + contrast
npm run render    # render to MP4
npm run dev       # foreground preview (blocks)
npx hyperframes preview --background   # agent-safe preview
npx hyperframes preview --stop
```

Anything you render by hand appears on the job page the next time it loads.
