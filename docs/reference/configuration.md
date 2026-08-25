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
| `VIDEOS_MODEL` | `claude-opus-5` | Model that authors the compositions. |
| `VIDEOS_EFFORT` | `high` | `low` · `medium` · `high` · `xhigh` · `max`. Controls reasoning depth and spend. |
| `VIDEOS_MAX_BUDGET_USD` | `25` | Hard per-run ceiling, enforced by the SDK. See [costs](../operations/costs.md). |
| `VIDEOS_TIMEOUT_MINUTES` | `90` | Hard per-run wall-clock ceiling. Aborts the session. |

## Interaction

| Variable | Default | Notes |
|---|---|---|
| `VIDEOS_INTERACTIVE` | `true` | Default for the form's "Involve me in decisions" toggle. Set `false` for unattended generation. Any value other than the string `false` counts as true. |
| `VIDEOS_ANSWER_GRACE_MINUTES` | `10` | How long a blocking question waits before the run parks. |

## Rendering

| Variable | Default | Notes |
|---|---|---|
| `VIDEOS_RENDERER` | `local` | Driver name. Unknown values fail loudly, listing valid ones. |
| `VIDEOS_HYPERFRAMES_VERSION` | `0.8.12` | Pinned into each generated project's `package.json`, so it re-renders identically later. |

## Internals

| Variable | Default | Notes |
|---|---|---|
| `VIDEOS_POLL_MS` | `1500` | Queue poll and filesystem progress interval. |
| `PORT` | `3100` | Studio port. |

## Per-job overrides

Two settings are chosen per job on the form and stored on the record, so
changing the environment does not retroactively alter queued work:

- **interactive** — from the toggle, defaulting to `VIDEOS_INTERACTIVE`
- **workflow, aspect, length, destination, language, audio layers** — no
  environment equivalent

Everything else is read from the environment at the moment the worker runs the
job.
