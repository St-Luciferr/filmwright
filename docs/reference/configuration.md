# Configuration reference

Copy `.env.example` to `.env`. Every value has a working default; the platform
runs with no `.env` at all.

`.env` is read from the repo root by `packages/engine/src/env.ts`, which both
halves import, so the worker and the studio see the same values — as does
anything they spawn, including `scripts/free-media.mjs` and the `hyperframes`
CLI. Shell variables win over the file: `FILMWRIGHT_EFFORT=low npm run dev`
overrides for one run. Values are parsed in `packages/engine/src/config.ts`.

## Authentication

| Variable | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | unset | Only needed to bill an API key instead of your Claude Code subscription. When unset, the Agent SDK uses `~/.claude/.credentials.json`. |

`npm run doctor` reports which credential source was found.

## Generation

| Variable | Default | Notes |
|---|---|---|
| `FILMWRIGHT_MODEL` | `claude-opus-5-5` | Model that orchestrates the run: script, storyboard, media, dispatch, fixes. |
| `FILMWRIGHT_EFFORT` | `high` | `low` · `medium` · `high` · `xhigh` · `max`. Controls reasoning depth and spend for the orchestrator. |
| `FILMWRIGHT_WORKER_MODEL` | `claude-sonnet-5-5` | Model each frame worker authors with ([ADR-0016](../adr/0016-engine-defined-frame-workers.md)). A hypothesis to compare against `claude-opus-5-5` on the same briefs. |
| `FILMWRIGHT_WORKER_EFFORT` | `medium` | Effort for one frame worker. |
| `FILMWRIGHT_WORKER_CONCURRENCY` | `4` | How many frame workers run at once. Passed to the SDK as `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`; spawn depth is fixed at 1. |
| `FILMWRIGHT_WORKER_MAX_TURNS` | `40` | Turn cap for one worker. A frame that needs more is stuck. |
| `FILMWRIGHT_SKILLS_DIR` | `~/.claude/skills` | Where the HyperFrames skills live. The frame packet builder and worker contract are read from here. |
| `FILMWRIGHT_MAX_BUDGET_USD` | `25` | Hard per-run ceiling, enforced by the SDK. See [costs](../operations/costs.md). |
| `FILMWRIGHT_TIMEOUT_MINUTES` | `90` | Hard per-run wall-clock ceiling. Aborts the session. |
| `FILMWRIGHT_AUTO_CONTINUE` | `0` | How many times the worker may continue a failed run by itself, reusing the work on disk. Off by default — each attempt costs money. Never applied to a budget or timeout stop, which would hit the same ceiling again, nor to a failure that left nothing on disk. |

## Workflow

| Variable | Default | Notes |
|---|---|---|
| `FILMWRIGHT_PROMPT_CACHE_TTL` | `auto` | `5m`, `1h` or `auto`. `auto` keeps the authoring session's prompt cache for an hour on interactive runs, which wait at review gates longer than the 5-minute default; unattended runs use the SDK default. One-hour cache writes cost more per token, so this only pays when sessions pause. |
| `FILMWRIGHT_MEDIA_CACHE` | `~/.cache/filmwright` | Where synthesised voice lines and the Kenney SFX library are kept between runs. |
| `FILMWRIGHT_JUDGE` | `true` | Run the blind visual judge after check passes: one read-only session compares a still of each frame to its storyboard block. Failures go back as a per-frame change list. Never replaces the pre-render gate, and a judge that cannot run never blocks a render. |
| `FILMWRIGHT_JUDGE_MODEL` | `claude-opus-5-5` | Model the judge runs on. |
| `FILMWRIGHT_JUDGE_EFFORT` | `medium` | Effort for the judge. |
| `FILMWRIGHT_JUDGE_ROUNDS` | `2` | Repair rounds the judge may ask for per project before leaving remaining notes to the person at the gate. Tracked in `.hyperframes/judge.json`. |
| `FILMWRIGHT_JUDGE_BUDGET_USD` | `1.5` | Ceiling on one judging round. |
| `FILMWRIGHT_CHECK_STRICT` | `false` | Fail the check stage on warnings as well as errors ([ADR-0017](../adr/0017-check-findings-as-evidence.md)). |
| `FILMWRIGHT_DURATION_TOLERANCE` | `0.2` | How far the wired timeline may sit from the brief's target length, as a fraction of it (floor: 2s). Checked before the render, and stated to the agent up front. Calibrated in [ADR-0015](../adr/0015-engine-driven-stage-machine.md) — at `0.1` it fires on craft variance. |

## Interaction

| Variable | Default | Notes |
|---|---|---|
| `FILMWRIGHT_INTERACTIVE` | `true` | Default for the form's "Involve me in decisions" toggle. Set `false` for unattended generation. Any value other than the string `false` counts as true. |
| `FILMWRIGHT_ANSWER_GRACE_SECONDS` | `60` | How long a blocking question waits before the run parks, when nobody has the job page open. |
| `FILMWRIGHT_ANSWER_GRACE_MINUTES` | `10` | The grace used instead while somebody is watching. The job page heartbeats while open, so an attended run is never parked out from under a person mid-decision. |
| `FILMWRIGHT_VIEWER_FRESH_SECONDS` | `20` | How stale that heartbeat may be and still count as a viewer. |

## Rendering

| Variable | Default | Notes |
|---|---|---|
| `FILMWRIGHT_RENDERER` | `local` | Driver name. Unknown values fail loudly, listing valid ones. |
| `FILMWRIGHT_HYPERFRAMES_VERSION` | `0.8.153` | Pinned into each generated project's `package.json`, so it re-renders identically later. |

## Media

There are no media environment variables, and that is deliberate: every
provider the platform can use is free and needs no credential, so there is
nothing to configure. Sources are chosen per job on the form, from the catalog
in `packages/engine/src/providers.ts`.

| Variable | Default | Notes |
|---|---|---|
| `HYPERFRAMES_PYTHON` | `~/.venvs/kokoro/bin/python` | Interpreter for local Kokoro voice synthesis. |
| `FILMWRIGHT_MUSICGEN_PYTHON` | `~/.venvs/musicgen/bin/python` | Interpreter for local MusicGen music generation. |

Both environments are built by `npm run setup`. Resolution order for each is:
the variable above, then the managed venv, then bare `python3` — so a machine
with the packages installed globally works without a venv. Set the variable
only to point at a different environment.

The engine resolves these once at startup and exports them into its own
environment, so every child process — the agent session, the render driver, the
storyboard capture, the health probe, `free-media.mjs` and the `hyperframes`
CLI — synthesises through the interpreter `npm run setup` built, rather than
whichever one each caller happens to discover. `npm run doctor` and the Health
page report the resolved path as `tts-python`.

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
| `HOST` | `127.0.0.1` | Interface the studio listens on. Loopback by default because it has no authentication — see [security](../operations/security.md) before changing it. |
| `FILMWRIGHT_ALLOWED_HOSTS` | unset | Extra hostnames the API answers to, comma-separated. Requests addressed to anything else are refused, which is what stops DNS rebinding. Needed only when you reach the studio under a name other than localhost. |

## Per-job overrides

These are chosen per job on the form and stored on the record, so changing the
environment does not retroactively alter queued work:

- **interactive** — from the toggle, defaulting to `FILMWRIGHT_INTERACTIVE`
- **media providers** — voice, music, imagery and footage, plus the voice id
- **workflow, aspect, length, destination, language, audio layers** — no
  environment equivalent

Everything else is read from the environment at the moment the worker runs the
job.
