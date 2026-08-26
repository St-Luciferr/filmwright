# 2. Local setup

## Toolchain

- Node.js 20+ (developed on 22.17)
- npm workspaces — no other package manager config is present
- The `hyperframes` CLI is invoked through `npx` at a pinned version, so it is
  never installed globally
- `ffmpeg` / `ffprobe` on PATH — required. Every media provider transcodes,
  loops or probes through them
- Python 3.10+ and [uv](https://docs.astral.sh/uv/) — for the two local media
  models. `npm run setup` builds their environments; uv is a convenience, and
  the error path prints the `venv` + `pip` equivalent

### Local media models

`npm run setup` (`scripts/free-media.mjs setup`) creates two isolated
environments. Separate rather than shared because the sizes are lopsided and
MusicGen is optional:

| Environment | Serves | Override |
|---|---|---|
| `~/.venvs/kokoro` | Kokoro voice synthesis | `HYPERFRAMES_PYTHON` |
| `~/.venvs/musicgen` | MusicGen music generation | `FILMWRIGHT_MUSICGEN_PYTHON` |

Resolution order for each is: the override variable, then the managed venv,
then bare `python3` — the last so a machine that already has the packages
globally keeps working without a venv. `setup` skips anything that already
resolves, so it is safe to re-run.

torch is installed from PyTorch's CPU index on purpose; the default PyPI
resolution pulls CUDA wheels, which is gigabytes of GPU runtime for a model
that runs on CPU here anyway.

## Layout

```
package.json           workspace root, all top-level scripts
apps/studio/           Next.js 16 (App Router, Turbopack)
packages/engine/       TypeScript source, consumed directly (no build step)
projects/              generated HyperFrames projects
data/jobs/             job records (gitignored)
scripts/               dev.mjs · doctor.mjs · seed.mjs · requeue.mjs
                       free-media.mjs — the only media fetcher, free sources only
docs/                  this documentation
```

The engine ships as **TypeScript source**, not a build artifact:

```json
"exports": {
  ".":       "./src/index.ts",
  "./types": "./src/types.ts"
}
```

- The studio compiles it via `transpilePackages: ["@filmwright/engine"]`.
- The worker runs it through `tsx`.

`./types` exists so client components can import types and plain constants
without pulling `node:fs` into the browser bundle. **Import types from
`@filmwright/engine/types` in any `"use client"` file.**

### Relative imports have no `.js` extension

`import { config } from "./config"` — not `./config.js`. Turbopack does not remap
a `.js` specifier onto a `.ts` file, and `moduleResolution: "bundler"` makes the
extensionless form correct for both bundler and `tsx`.

## The dev loop

```bash
npm run dev          # studio :3100 + worker, signals forwarded, prefixed output
npm run dev:web
npm run dev:worker
npm run typecheck    # both projects
npm run build        # production build of the studio
```

### The worker restarts on file change

`npm run dev:worker` runs `tsx watch`. **Editing anything under
`packages/engine/src` while a job is running kills that run.** The work survives
on disk and can be resumed, but a paid session is lost.

Before touching engine source, check:

```bash
for f in data/jobs/*/job.json; do
  python3 -c "import json;d=json.load(open('$f'));print(d['status'],d['slug'])"
done
```

If something is `running`, either wait or accept the restart.

## Environment

Copy `.env.example` to `.env`. Every value has a working default; see
[reference/configuration.md](../reference/configuration.md).

Auth needs no setup if you already use Claude Code — the Agent SDK picks up
`~/.claude/.credentials.json`. `npm run doctor` reports which credential source
it found.

## A useful habit

`npm run doctor` before a session of work. Most "the platform is broken" reports
are a missing skill, a `hyperframes` version that cannot be fetched, a local
model whose environment was never built, or a media endpoint that is down.

`doctor` folds in `scripts/free-media.mjs doctor`, so one command covers the
toolchain and every media provider. Run the media half on its own with:

```bash
node scripts/free-media.mjs doctor          # human-readable
node scripts/free-media.mjs doctor --json   # for scripts
```
