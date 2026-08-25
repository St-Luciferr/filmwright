# Documentation

Four sections, by what you are trying to do.

## [User guide](user-guide/README.md)

Using the studio. No code.

[Getting started](user-guide/01-getting-started.md) ·
[Making a video](user-guide/02-making-a-video.md) ·
[While it runs](user-guide/03-while-it-runs.md) ·
[Reviewing the frames](user-guide/04-reviewing-frames.md) ·
[Changing a finished video](user-guide/05-revising.md) ·
[Troubleshooting](user-guide/06-troubleshooting.md)

## [Developer guide](developer-guide/README.md)

How it is built and how to change it.

[Architecture](developer-guide/01-architecture.md) ·
[Local setup](developer-guide/02-local-setup.md) ·
[The engine](developer-guide/03-the-engine.md) ·
[The studio](developer-guide/04-the-studio.md) ·
[Data model](developer-guide/05-data-model.md) ·
[Extending it](developer-guide/06-extending-it.md) ·
[Testing](developer-guide/07-testing.md)

## [Reference](reference/configuration.md)

Look-up material.

[Configuration](reference/configuration.md) ·
[Commands](reference/commands.md) ·
[HTTP API](reference/http-api.md) ·
[Glossary](reference/glossary.md)

## [Operations](operations/costs.md)

Running it responsibly.

[Costs](operations/costs.md) ·
[Security](operations/security.md)

## [Architecture Decision Records](adr/README.md)

Twelve decisions, with the reasoning and the cost of each. Several were made
after the obvious approach was tried and failed, so they are worth reading
before changing anything structural.

---

## Where to start

| You are | Start at |
|---|---|
| Making your first video | [Getting started](user-guide/01-getting-started.md) |
| Picking up the codebase | [Architecture](developer-guide/01-architecture.md), then the [ADRs](adr/README.md) |
| Debugging a failed run | [Troubleshooting](user-guide/06-troubleshooting.md) |
| Deciding whether to run this at all | [Security](operations/security.md) and [Costs](operations/costs.md) |
| Adding a renderer or workflow | [Extending it](developer-guide/06-extending-it.md) |

## Conventions

- Numbers in these documents are **measured**, not estimated. Where a cost or
  turn count appears, it came from a real run recorded in `data/jobs/`.
- Code paths are given relative to the repository root.
- ADRs are immutable. Supersede, do not rewrite.
