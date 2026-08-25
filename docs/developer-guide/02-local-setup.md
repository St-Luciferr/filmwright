# 2. Local setup

## Toolchain

- Node.js 20+ (developed on 22.17)
- npm workspaces — no other package manager config is present
- No global installs required; the `hyperframes` CLI is invoked through `npx`
  at a pinned version

## Layout

```
package.json           workspace root, all top-level scripts
apps/studio/           Next.js 16 (App Router, Turbopack)
packages/engine/       TypeScript source, consumed directly (no build step)
projects/              generated HyperFrames projects
data/jobs/             job records (gitignored)
scripts/               dev.mjs · doctor.mjs · seed.mjs · requeue.mjs
docs/                  this documentation
```

The engine ships as **TypeScript source**, not a build artifact:

```json
"exports": {
  ".":       "./src/index.ts",
  "./types": "./src/types.ts"
}
```

- The studio compiles it via `transpilePackages: ["@videos/engine"]`.
- The worker runs it through `tsx`.

`./types` exists so client components can import types and plain constants
without pulling `node:fs` into the browser bundle. **Import types from
`@videos/engine/types` in any `"use client"` file.**

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
are a missing skill, an unauthenticated CLI, or a `hyperframes` version that
cannot be fetched.
