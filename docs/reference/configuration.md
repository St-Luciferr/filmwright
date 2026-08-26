# Configuration reference

Copy `.env.example` to `.env`. Every value has a working default; the platform
runs with no `.env` at all.

Parsed in `packages/engine/src/config.ts`.

## Authentication

| Variable | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | unset | Only needed to bill an API key instead of your Claude Code subscription. When unset, the Agent SDK uses `~/.claude/.credentials.json`. |

`npm run doctor` reports which credential source was found.

## Generation

| Variable | Default | Notes |
|---|---|---|
| `FILMWRIGHT_MODEL` | `claude-opus-5` | Model that authors the compositions. |
| `FILMWRIGHT_EFFORT` | `high` | `low` · `medium` · `high` · `xhigh` · `max`. Controls reasoning depth and spend. |
| `FILMWRIGHT_MAX_BUDGET_USD` | `25` | Hard per-run ceiling, enforced by the SDK. See [costs](../operations/costs.md). |
| `FILMWRIGHT_TIMEOUT_MINUTES` | `90` | Hard per-run wall-clock ceiling. Aborts the session. |

## Interaction

| Variable | Default | Notes |
|---|---|---|
| `FILMWRIGHT_INTERACTIVE` | `true` | Default for the form's "Involve me in decisions" toggle. Set `false` for unattended generation. Any value other than the string `false` counts as true. |
| `FILMWRIGHT_ANSWER_GRACE_MINUTES` | `10` | How long a blocking question waits before the run parks. |

## Rendering

| Variable | Default | Notes |
|---|---|---|
| `FILMWRIGHT_RENDERER` | `local` | Driver name. Unknown values fail loudly, listing valid ones. |
| `FILMWRIGHT_HYPERFRAMES_VERSION` | `0.8.12` | Pinned into each generated project's `package.json`, so it re-renders identically later. |

## Media

There are no media environment variables, and that is deliberate: every
provider the platform can use is free and needs no credential, so there is
nothing to configure. Sources are chosen per job on the form, from the catalog
in `packages/engine/src/providers.ts`.

| Variable | Default | Notes |
|---|---|---|
| `HYPERFRAMES_PYTHON` | `~/.venvs/kokoro/bin/python` | Python used for local Kokoro voice synthesis. Created by `node scripts/free-media.mjs setup`; set this only to point at a different venv. |

Preflight every provider with `npm run doctor`, or on its own:

```bash
node scripts/free-media.mjs doctor
```

Adding a provider that needs an API key would break the platform's one hard
guarantee — see [ADR-0013](../adr/0013-free-only-media-providers.md).

## Internals

| Variable | Default | Notes |
|---|---|---|
| `FILMWRIGHT_POLL_MS` | `1500` | Queue poll and filesystem progress interval. |
| `PORT` | `3100` | Studio port. |

## Per-job overrides

These are chosen per job on the form and stored on the record, so changing the
environment does not retroactively alter queued work:

- **interactive** — from the toggle, defaulting to `FILMWRIGHT_INTERACTIVE`
- **media providers** — voice, music, imagery and footage, plus the voice id
- **workflow, aspect, length, destination, language, audio layers** — no
  environment equivalent

Everything else is read from the environment at the moment the worker runs the
job.
