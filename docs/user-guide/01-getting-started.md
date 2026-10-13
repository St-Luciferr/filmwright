# 1. Getting started

## What you need

- **Node.js 20 or newer.**
- **Claude Code, already signed in.** The platform reuses your existing login at
  `~/.claude/.credentials.json`. An `ANTHROPIC_API_KEY` works too, if you would
  rather bill a key than your subscription.
- **The HyperFrames skills installed** at `~/.claude/skills`. If you have used
  `/hyperframes` in Claude Code, you have them. If not:
  `npx hyperframes skills update`. The `hyperframes` CLI itself needs no
  install — it is fetched through `npx` at a pinned version.
- **`ffmpeg` and `ffprobe` on your PATH.** Every media path transcodes through
  them. `brew install ffmpeg`, `apt install ffmpeg`, or a static build.
- **Python 3.10+**, for the two local media models. You do not install anything
  into it by hand — see the next section.
- **[uv](https://docs.astral.sh/uv/)**, recommended, to build those Python
  environments quickly. Without it you can create them with `venv` and `pip`;
  `npm run setup` prints the exact commands.
- **Disk space and patience.** A finished project is a few megabytes; the default
  setup adds a few hundred megabytes once (2 GB more if you opt into local
  music generation); a run takes tens of minutes.

You do **not** need a HeyGen, ElevenLabs or OpenAI account. Every media source
the platform can use is free and needs no credential
([ADR-0013](../adr/0013-free-only-media-providers.md)).

## Install and check

```bash
npm install
npm run setup     # local voice model + CC0 sound effects — one-off
npm run doctor
```

### What `npm run setup` does

By default it installs what the default media path needs. Python packages go
into isolated environments, because system Python is externally managed on most
distributions and installing into it either refuses or breaks OS packages:

| Component | Serves | Size | Installed by default |
|---|---|---|---|
| `~/.venvs/kokoro` | Kokoro voice synthesis — the default voiceover path | small | yes |
| `~/.cache/filmwright/sfx` | Kenney CC0 sound effects | a few MB | yes |
| `~/.venvs/musicgen` | MusicGen local music generation | ~2 GB (CPU-only torch) | no — opt in |

Music defaults to **Openverse**, which needs nothing installed. MusicGen is
opt-in: its weights are licensed non-commercial and it is slow on CPU.

```bash
npm run setup -- --with-musicgen   # also build the MusicGen environment
npm run setup -- --only musicgen   # just MusicGen
npm run setup -- --only kokoro     # just the voice model
```

It is idempotent, and it skips anything already working — including packages
you already have installed globally.

Nothing else needs setting up. The image and footage providers are public
endpoints with no key and no client to install.

### What `doctor` checks

Everything generation depends on but cannot install for you:

```
  ✔ node           v22.17.1
  ✔ auth           using the Claude Code login in ~/.claude
  ✔ skills         9 hyperframes skills installed
  ✔ npx            11.5.1
  ✔ hyperframes    0.8.153
  ✔ ffmpeg         on PATH
  ✔ ffprobe        on PATH
  ✔ python3        on PATH
  ✔ kokoro         ready (/home/you/.venvs/kokoro/bin/python)
  ✔ musicgen       ready (/home/you/.venvs/musicgen/bin/python)
  ✔ openverse      reachable, no key needed
  ✔ wikimedia      reachable, no key needed
  ✔ pollinations   reachable, no key needed

Ready to generate.
```

A red ✘ tells you exactly what to fix. Do not skip this — most first-run
failures are one of these lines, and finding out at the media stage costs a
half-spent budget rather than a minute.

`musicgen` is the one line that may show as a warning rather than a failure.
That is expected after a default setup: Openverse covers music without it.

To check just the media providers:

```bash
node scripts/free-media.mjs doctor
```

## Adopt any existing projects

```bash
npm run seed
```

Any HyperFrames project already sitting in `projects/` joins the library as an
example, so you can look at hand-authored work next to generated work. Safe to
re-run; it never touches jobs that already exist.

## Start it

```bash
npm run dev
```

That starts two things: the **studio** on <http://localhost:3100>, and the
**worker** that actually builds videos.

You can run them separately:

```bash
npm run dev:web      # studio only
npm run dev:worker   # worker only
```

> **The worker is the half that spends money and writes files.** With only the
> studio running you can browse and queue, but nothing will be built.

## A note on cost

Generation is not cheap and varies a lot. One measured 25-second narrated promo
cost about **$28 in total across two runs**. Read
[operations/costs.md](../operations/costs.md) before you queue several, and keep
`FILMWRIGHT_MAX_BUDGET_USD` where you can live with it.

## Security, briefly

The studio has no login and the worker runs commands as you. Keep it on
localhost. The full picture is in
[operations/security.md](../operations/security.md).
