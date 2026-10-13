# Command reference

All commands run from the repository root.

## Everyday

| Command | What it does |
|---|---|
| `npm run dev` | Studio on `:3100` **and** the worker, with prefixed output and signal forwarding |
| `npm run dev:web` | Studio only — browse and queue, nothing gets built |
| `npm run dev:worker` | Worker only |
| `npm run doctor` | Preflight: Node, auth, skills, `npx`, `ffmpeg`, the `hyperframes` CLI, and every free media provider |
| `npm run setup` | Install the voice model and the Kenney CC0 SFX library. One-off, idempotent. `-- --with-musicgen` adds local music generation (~2 GB); `-- --only <kokoro\|musicgen\|sfx>` installs one |
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
node scripts/free-media.mjs setup                 # Kokoro voice + the Kenney SFX library
node scripts/free-media.mjs setup --with-musicgen # also MusicGen (~2 GB of CPU torch); --all is the same today
node scripts/free-media.mjs setup --only kokoro   # one component: kokoro | musicgen | sfx
node scripts/free-media.mjs setup --only sfx      # Kenney CC0 sound packs (also fetched on first use)
node scripts/free-media.mjs doctor                # probe every provider (--json for machine output)

node scripts/free-media.mjs voice   --text "..."   --out assets/voice/01.wav --voice af_heart
node scripts/free-media.mjs music   --intent "..." --out assets/bgm/track.wav --seconds 25 [--provider openverse|musicgen]
node scripts/free-media.mjs image   --intent "..." --out assets/images/f01.jpg [--provider openverse|pollinations]
node scripts/free-media.mjs footage --intent "..." --out assets/video/f01.mp4 --seconds 4 [--provider wikimedia|archive]
node scripts/free-media.mjs sfx     --intent "whoosh" --out assets/sfx/whoosh.wav [--provider kenney|openverse]
```

Run from inside a project directory — `--out` paths are relative to it, and the
attribution ledger is written there. Requests are seeded from `--intent`, so
re-running the same brief fetches the same asset. Voice lines are also cached by
text, voice and speed under `~/.cache/filmwright` (override with
`FILMWRIGHT_MEDIA_CACHE`; bypass once with `--no-cache`), so an unchanged line is
copied instead of synthesised again.

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
