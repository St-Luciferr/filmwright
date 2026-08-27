# 1. Architecture

## Components

| Component | Path | Responsibility |
|---|---|---|
| **Studio** | `apps/studio` | Next.js 16 app: submission form, library, live job page, HTTP API |
| **Engine** | `packages/engine` | Job lifecycle, agent session, progress detection, rendering, interaction |
| **Worker** | `packages/engine/src/worker.ts` | Serial queue loop; the only process that spends money |
| **Projects** | `projects/<slug>/` | A real HyperFrames project per video — the actual deliverable |
| **Job store** | `data/jobs/<id>/` | Records, activity logs, answers, steering notes |
| **Scripts** | `scripts/` | Dev launcher, doctor, seed, requeue |

The studio imports the engine directly (`transpilePackages`), so both processes
use the same store and types. Only the worker runs the agent.

## The life of a job

```
  submit                        ┌───────────────── park (unanswered) ──┐
    │                           │                                      │
    ▼                           ▼                                      │
 queued ──► running ──► [ questions · gates · steering ] ──► awaiting-input
    │           │                                                      │
    │           ├──► succeeded ──► notes ──► revision ──► v2, v3 …     │
    │           ├──► failed ──────► retry: continue | start over ──────┘
    │           └──► cancelled ───► retry: continue | start over
    └──► cancelled (never claimed)
```

A retry never edits the run that stopped: a new job is queued beside it, linked
by `retryOf` / `retriedBy`, so the history keeps the failure as well as the
recovery. Continuing reuses the project directory and replays the decisions
already made; starting over scaffolds a new one from the original prompt. Both
go through `retryJob` in `packages/engine/src/retry.ts` — the job page, the
library and `npm run requeue` are three front doors onto it.

## What the worker does per job

1. **Scaffold** — `hyperframes init <slug> --non-interactive --example blank
   --resolution … --skill <workflow>`, then write `BRIEF.md` from the form
   ([ADR-0002](../adr/0002-pre-written-brief.md)). On a resume this is skipped and
   the existing directory is reused ([ADR-0007](../adr/0007-resume-instead-of-restart.md)).
2. **Start pollers** — one derives stage progress from the filesystem
   ([ADR-0003](../adr/0003-filesystem-derived-progress.md)) and watches for
   cancellation; one tails steering notes.
3. **Run the session** — Claude Agent SDK with the operator's skills
   ([ADR-0001](../adr/0001-claude-agent-sdk-with-user-skills.md)), plus the studio's
   own MCP tools when interactive
   ([ADR-0008](../adr/0008-mcp-tools-for-human-input.md)).
4. **Render if needed** — the workflow normally renders itself; the worker only
   invokes the renderer when no MP4 exists, so a run that ended early still
   yields a video where possible.
5. **Finalise** — status, cost, turns, video path.

## Boundaries worth respecting

- **Progress is observed, never reported.** Anything that makes the UI trust the
  agent's account of itself is a regression.
- **The worker owns the filesystem; the studio owns the browser.** The studio
  never runs an agent. The one exception is storyboard capture, which the
  storyboard route may trigger on demand — it shells out to the CLI, not to a
  model.
- **The job directory is the interprocess channel.** Blocking questions,
  answers, steering and cancellation all pass through it, which is why they keep
  working across worker restarts.
