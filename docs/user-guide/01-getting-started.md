# 1. Getting started

## What you need

- **Node.js 20 or newer**
- **Claude Code, already signed in.** The platform reuses your existing login at
  `~/.claude/.credentials.json`. An `ANTHROPIC_API_KEY` works too, if you would
  rather bill a key than your subscription.
- **The HyperFrames skills installed** at `~/.claude/skills`. If you have used
  `/hyperframes` in Claude Code, you have them. If not:
  `npx hyperframes skills update`.
- **Disk space and patience.** A finished project is a few megabytes; a run
  takes tens of minutes.

## Install and check

```bash
npm install
npm run doctor
```

`doctor` checks the things generation depends on but cannot install for you:

```
  ✔ node           v22.17.1
  ✔ auth           using the Claude Code login in ~/.claude
  ✔ skills         9 hyperframes skills installed
  ✔ npx            11.5.1
  ✔ ffmpeg         ffmpeg version N-126262…
  ✔ hyperframes    0.8.12

Ready to generate.
```

A red ✘ tells you exactly what to fix. Do not skip this — most first-run
failures are one of these six lines.

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
`VIDEOS_MAX_BUDGET_USD` where you can live with it.

## Security, briefly

The studio has no login and the worker runs commands as you. Keep it on
localhost. The full picture is in
[operations/security.md](../operations/security.md).
