# Command reference

All commands run from the repository root.

## Everyday

| Command | What it does |
|---|---|
| `npm run dev` | Studio on `:3100` **and** the worker, with prefixed output and signal forwarding |
| `npm run dev:web` | Studio only — browse and queue, nothing gets built |
| `npm run dev:worker` | Worker only |
| `npm run doctor` | Preflight: Node, auth, skills, `npx`, `ffmpeg`, the `hyperframes` CLI, and every free media provider |
| `npm run setup` | Build the local voice and music model environments. One-off, idempotent. `-- --only kokoro` for voice alone |
| `npm run seed` | Adopt existing `projects/*` into the library. Safe to re-run |
| `npm run requeue` | List, resume or restart finished jobs |

## Build and checks

| Command | What it does |
|---|---|
| `npm run typecheck` | Typecheck engine and studio |
| `npm run build` | Production build of the studio |
| `npm start` | Production studio + worker |

## `free-media` in detail

Every media asset a run needs, from sources that cost nothing. The agent is
handed these commands directly; you mostly need `setup` and `doctor`.

```bash
node scripts/free-media.mjs setup                 # build both local model environments
node scripts/free-media.mjs setup --only kokoro   # voice only — skips the ~2 GB torch install
node scripts/free-media.mjs doctor                # probe every provider (--json for machine output)

node scripts/free-media.mjs voice   --text "..."   --out assets/voice/01.wav --voice af_heart
node scripts/free-media.mjs music   --intent "..." --out assets/bgm/track.wav --seconds 25 [--provider musicgen|openverse]
node scripts/free-media.mjs image   --intent "..." --out assets/images/f01.jpg [--provider pollinations|openverse]
node scripts/free-media.mjs footage --intent "..." --out assets/video/f01.mp4 --seconds 4
```

Run from inside a project directory — `--out` paths are relative to it, and the
attribution ledger is written there. Requests are seeded from `--intent`, so
re-running the same brief fetches the same asset.

## `requeue` in detail

The command-line half of the **Continue** and **Start over** buttons on the job
page — both call the same `retryJob` in the engine, so they cannot drift apart.

```bash
npm run requeue                     # list what can be re-queued
npm run requeue -- <slug|id>        # continue, reusing the work on disk
npm run requeue -- <slug> --fresh   # start over in a new directory
npm run requeue -- --failed         # continue every failed job
```

Continuing is the default ([ADR-0007](../adr/0007-resume-instead-of-restart.md)).
The listing marks each job `resumable` or `fresh only` and names the kind of
failure; `fresh only` means the project directory no longer exists, and asking
to continue one starts it over instead, saying so.

The original job record is kept and a new one is queued, so failed runs stay in
the history. The two are linked by `retryOf` and `retriedBy`, which is also what
stops the same failure being queued twice while an attempt is still running.

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
