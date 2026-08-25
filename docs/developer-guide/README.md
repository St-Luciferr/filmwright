# Developer guide

How the platform is built, and how to change it.

| | |
|---|---|
| [1. Architecture](01-architecture.md) | The parts, and how a job flows through them |
| [2. Local setup](02-local-setup.md) | Toolchain, workspace layout, the dev loop |
| [3. The engine](03-the-engine.md) | Pipeline, agent session, prompts, interaction |
| [4. The studio](04-the-studio.md) | Next.js app, live updates, components |
| [5. Data model](05-data-model.md) | Job records, events, the on-disk contract |
| [6. Extending it](06-extending-it.md) | Renderers, workflows, stages, tools |
| [7. Testing and verification](07-testing.md) | How this codebase is checked, and the safe-probe pattern |

Decisions and their reasoning live in the [ADRs](../adr/README.md). Read those
before changing anything structural — several were made after the obvious
approach was tried and failed.

## Orientation in one minute

Two processes share a directory of files.

```
apps/studio (Next.js)          packages/engine (worker)
      │                                │
      │  POST /api/jobs                │  claims oldest queued
      ▼                                ▼
   data/jobs/<id>/job.json  ◄──────────┤  updates as it runs
   data/jobs/<id>/events.ndjson ◄──────┤  appends activity
      │                                │
      │  SSE tails by byte offset      │  runs Claude Agent SDK
      ▼                                ▼
    browser                     projects/<slug>/  → renders/*.mp4
```

There is no database and no message broker; see
[ADR-0004](../adr/0004-file-based-job-store.md). The worker is deliberately
serial — one HyperFrames render saturates a machine.

The single most important idea: **the platform does not implement video
authoring.** It sets up a project, hands it to an agent running the operator's
own HyperFrames skills, observes the filesystem to report progress, and provides
the channels through which a person can intervene.
