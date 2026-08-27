# filmwright

**Describe a video. Get a rendered video — and stay in the loop while it is made.**

A prompt becomes a real [HyperFrames](https://hyperframes.heygen.com) project:
brief, script, storyboard, frame compositions, voiceover, music, burned-in
captions, rendered to MP4. The work is done by a headless Claude agent running
the same HyperFrames skills you would drive by hand in Claude Code, so the
quality ceiling is the same as hand-authoring.

What makes it a platform rather than a script is everything around that: a queue,
live progress you can trust, three places where it asks you before committing,
frame-by-frame review before anything renders, and timestamped revisions
afterwards.

Every media source it can use is **free** — local models and public endpoints
that need no account, API key or subscription. You pick which one fills each
slot (voice, music, imagery, footage) when you queue the job.

Generated videos land in `projects/`, which is **not** tracked in git — it is
runtime output, the same category as `data/jobs/`. The worker creates it on
demand, so a fresh clone starts empty and needs nothing there.

---

## Quick start

```bash
npm install
npm run setup     # one-off: local voice + music models (~2 GB, skips what you have)
npm run doctor    # verify auth, skills, ffmpeg, hyperframes and every media provider
npm run seed      # adopt any existing projects/ into the library
npm run dev       # studio on :3100 + worker
```

Open <http://localhost:3100>. The studio has a dashboard (spend, success rate,
what is running), a searchable library, a guided new-video form, a live job page
with frame-by-frame review, and a health page that preflights every provider.

Needs `ffmpeg`, Python 3.10+ and [uv](https://docs.astral.sh/uv/) on top of
Node 20+; full list in
[getting started](docs/user-guide/01-getting-started.md). No media account of
any kind — no HeyGen, no ElevenLabs, no OpenAI.

> The worker is the half that spends money and writes files. With only
> `npm run dev:web` running you can browse and queue, but nothing is built.

**Before your first run**, read [Costs](docs/operations/costs.md) — a 25-second
narrated promo measured at about **$28 across two runs** — and
[Security](docs/operations/security.md), because the agent runs commands as you
and the studio has no login.

---

## What it looks like

```bash
   prompt
     │
     ▼
  building ──► "which visual approach?" ──► you answer ──┐
     │                                                   │
     ├──► script gate      ──► approve / revise ─────────┤
     ├──► storyboard gate  ──► approve / revise ─────────┤
     ├──► frame review     ──► approve / revise ─────────┘
     ▼         (real stills, one per frame)
   render
     │
     ▼
  watch it ──► pin a note at 0:08.3 ──► apply ──► v2, v3 …
```

You can also type a note to a running job at any time; it arrives as ordinary
direction without stopping the run.

---

## The ideas worth knowing

**Progress is observed, not reported.** Every pipeline stage is derived from
artifacts on disk — `SCRIPT.md` exists, four of seven frame compositions exist,
`renders/*.mp4` exists. The agent's narration is logged separately and never
drives the progress bar, so the UI cannot get ahead of the real work.
([ADR-0003](docs/adr/0003-filesystem-derived-progress.md))

**Nothing is thrown away.** A run that fails, is cancelled, exhausts its budget,
or parks waiting for you keeps everything it built. Re-queueing **resumes** by
default, with an inventory of existing work and instructions not to regenerate
it. This was learned the hard way: a run died at $8.18 having produced captures,
script, voiceover and storyboard but zero frames — restarting would have paid for
all of it again. ([ADR-0007](docs/adr/0007-resume-instead-of-restart.md))

**You are asked, not guessed at.** The agent consults you through the studio's
own MCP tools, so an answer arrives as a normal tool result rather than as a
refused permission. If nobody answers within ten minutes the job parks, the
worker moves on, and answering later continues it.
([ADR-0008](docs/adr/0008-mcp-tools-for-human-input.md),
[ADR-0009](docs/adr/0009-park-on-unanswered-question.md))

**You see the frames before you pay for a render.** The pre-render gate captures
one still per frame — real snapshots from the same runtime the renderer uses —
each with its own comment box. Per-frame notes compile into a change list that
names the file to edit. ([ADR-0011](docs/adr/0011-storyboard-from-real-stills.md))

**A finished video is not finished.** Scrub to a moment, describe what should
change, and the note is resolved server-side to the frame on screen. Applying
notes queues a revision framed as a change rather than a rebuild. Every render is
kept and stays playable from its own page.
([ADR-0012](docs/adr/0012-revision-as-a-fresh-session.md))

---

## How a job runs

```bash
prompt + options
      │
      ▼
┌─────────────────┐   POST /api/jobs → data/jobs/<id>/job.json (queued)
│  studio (web)   │
└─────────────────┘
      │
      ▼
┌─────────────────┐   claims the oldest queued job (serial, by design)
│  worker         │
└─────────────────┘
      │
      ├─ scaffold   npx hyperframes init … --resolution … --skill …
      ├─ brief      BRIEF.md written from the form  ← confirmed intent
      │
      ▼
┌────────────────────────────────────────────────────────────┐
│  Claude Agent SDK session, cwd = projects/<slug>           │
│    settingSources: ['user','project'] → ~/.claude/skills   │
│    skills: 'all'                      → /hyperframes       │
│    + studio MCP tools: ask_user, request_review            │
│                                                            │
│    /hyperframes → the workflow named in BRIEF.md           │
│      → SCRIPT.md → STORYBOARD.md → compositions/frames/    │
│      → voice · music · sfx → captions                      │
│      (media via scripts/free-media.mjs — free sources only)│
│      → npm run check → npm run render                      │
└────────────────────────────────────────────────────────────┘
      │
      ▼
  renders/<name>.mp4        served at /api/jobs/<id>/video
```

The brief is written **before** the session starts because the `/hyperframes`
router otherwise opens by asking a human to confirm it — which nothing can do
headlessly. ([ADR-0002](docs/adr/0002-pre-written-brief.md))

Media never goes through the skills' own provider cascade, which defaults to a
paid HeyGen account. The agent is handed `scripts/free-media.mjs` and told the
free catalog is the only thing that exists, because a run left to discover that
on its own spends real budget doing it.
([ADR-0013](docs/adr/0013-free-only-media-providers.md))

### Media sources

| Slot | Options | Cost |
| --- | --- | --- |
| Voice | Kokoro-82M, on-device · or none | free, offline |
| Music | MusicGen on-device · Openverse (CC) · or none | free |
| Imagery | Pollinations (AI-generated) · Openverse (real CC photos) · or none | free |
| Footage | Animated stills *(default)* · Wikimedia Commons (real CC clips) · or none | free |

There is no free live-action video *generator* — none exists without a
subscription — so "live action" means real Creative Commons footage or a camera
move over a still, and the run is told to say which it used. Creative Commons
downloads are credited automatically in the project's `ATTRIBUTION.md`.

---

## Layout

```bash
apps/studio/          Next.js studio — form, library, live job page, HTTP API
packages/engine/      the generation engine
  ├── create.ts       request validation → queued job
  ├── prompt.ts       spec → BRIEF.md + the agent instruction
  ├── agent.ts        the Claude Agent SDK session + steering input
  ├── interact.ts     ask_user / request_review, parking
  ├── stages.ts       filesystem-derived progress
  ├── timeline.ts     index.html → clips, for timestamp → frame
  ├── storyboard.ts   per-frame stills + staleness manifest
  ├── render.ts       Renderer interface + the local driver
  ├── pipeline.ts     one job, end to end
  └── worker.ts       queue loop
projects/<slug>/      one HyperFrames project per video — the real deliverable
data/jobs/<id>/       job.json + events.ndjson  (gitignored)
docs/                 documentation and ADRs
scripts/              dev launcher · doctor · seed · requeue
```

Jobs are plain files. No database, no broker: `job.json` written atomically, plus
an append-only `events.ndjson` that the SSE endpoint tails by byte offset.
([ADR-0004](docs/adr/0004-file-based-job-store.md))

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Studio on `:3100` **and** the worker |
| `npm run doctor` | Preflight: Node, auth, skills, `ffmpeg`, the CLI |
| `npm run seed` | Adopt existing `projects/*` into the library |
| `npm run requeue` | List, continue, or restart stopped jobs |
| `npm run typecheck` | Typecheck engine and studio |
| `npm run build` | Production build |

Full list in [reference/commands.md](docs/reference/commands.md).

## Configuration

Copy `.env.example` to `.env`; everything has a working default. Auth needs no
setup if you already use Claude Code — the Agent SDK picks up
`~/.claude/.credentials.json`.

The values worth knowing: `FILMWRIGHT_MAX_BUDGET_USD` (25), `FILMWRIGHT_TIMEOUT_MINUTES`
(90), `FILMWRIGHT_INTERACTIVE` (true), `FILMWRIGHT_RENDERER` (local). Full table in
[reference/configuration.md](docs/reference/configuration.md).

---

## Documentation

| | |
| --- | --- |
| [User guide](docs/user-guide/README.md) | Making, reviewing and revising videos |
| [Developer guide](docs/developer-guide/README.md) | Architecture, engine, studio, extending it |
| [Reference](docs/reference/configuration.md) | Configuration, commands, HTTP API, glossary |
| [Operations](docs/operations/costs.md) | Costs and security |
| [ADRs](docs/adr/README.md) | Twelve decisions and what each one cost |

---

## Requirements

- **Node.js 20+**
- **Claude Code, signed in** (or `ANTHROPIC_API_KEY`)
- **HyperFrames skills** at `~/.claude/skills` — `npx hyperframes skills update`
- `ffmpeg` is optional; the CLI fetches its own build if missing

`npm run doctor` checks all of it and tells you what to fix.

---

## Known limits

- **One job at a time.** The worker is deliberately serial — a HyperFrames render
  saturates the machine on its own.
- **Local rendering only.** Cloud drivers fit behind the existing `Renderer`
  interface but are not implemented.
- **Single operator.** No authentication, and the job store assumes one trusted
  user. See [Security](docs/operations/security.md).
- **Resume and revision are prompt-level.** Each is a fresh session pointed at
  the existing project, not a continuation of the previous conversation.
- **Cost varies widely** and is genuinely significant. See
  [Costs](docs/operations/costs.md).
- **No automated test suite.** Verification is typechecks, probe scripts and
  HTTP checks — [testing](docs/developer-guide/07-testing.md) explains the
  approach and where a unit suite would pay off.
