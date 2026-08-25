# 0001 — Generate via the Claude Agent SDK loading the user's real skills

- **Status:** Accepted
- **Date:** 2026-08-24

## Context

The reference video in this repository, `projects/iom-mock-tiktok`, was authored
by hand: a person drove Claude Code, which loaded the HyperFrames skills from
`~/.claude/skills` and used the `hyperframes` CLI. The output is good because
those skills encode craft that is not in general web knowledge — timeline
attribute semantics, seek-safe animation, caption legibility, audio ducking.

The platform has to reproduce that from a prompt. Three options were on the
table: drive a hand-written prompt chain against the Messages API, fill
hand-built templates, or run the same agent harness headlessly.

## Decision

Run generation as a **Claude Agent SDK session** with:

- `settingSources: ["user", "project"]` — loads `~/.claude/skills` and the
  generated project's own `CLAUDE.md`
- `skills: "all"` — the `/hyperframes` router and every workflow it routes to
- `tools: { type: "preset", preset: "claude_code" }` — real file and shell access
- `cwd` set to the project directory

## Consequences

- The quality ceiling is the same as hand-authoring, because it is the same
  skills doing the work.
- Skills improve without any change here. `npx hyperframes skills update` is the
  upgrade path.
- **The platform depends on the operator's machine state.** If the skills are
  missing, generation fails. `npm run doctor` exists specifically for this.
- Cost is high and variable — see [ADR-0007](0007-resume-instead-of-restart.md).
- We do not control the internal steps, so progress cannot be read from the
  agent. See [ADR-0003](0003-filesystem-derived-progress.md).

## Alternatives considered

**A hand-written prompt chain** (brief → script → storyboard → frame HTML, each
a schema-constrained call). More deterministic and much cheaper, but it means
re-implementing the craft the skills already encode, and it would drift from
them on every skill release.

**A template library.** Fast, predictable, cheap — and every video looks like
its template. That is the opposite of what the reference video demonstrates.
