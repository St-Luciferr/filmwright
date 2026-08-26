# Architecture Decision Records

An ADR records **one decision**, the forces that shaped it, and what it cost.
They are written when a choice was not obvious — when a reasonable engineer
would have picked differently, or when we tried the other thing first and it
failed.

They are immutable. When a decision changes, add a new ADR that supersedes the
old one and update the status line; do not rewrite history.

## Index

| # | Decision | Status |
|---|---|---|
| [0001](0001-claude-agent-sdk-with-user-skills.md) | Generate via the Claude Agent SDK loading the user's real skills | Accepted |
| [0002](0002-pre-written-brief.md) | Write `BRIEF.md` before the session starts | Accepted |
| [0003](0003-filesystem-derived-progress.md) | Derive pipeline progress from artifacts on disk | Accepted |
| [0004](0004-file-based-job-store.md) | Store jobs as files, not in a database | Accepted |
| [0005](0005-bypass-permissions.md) | Run the authoring session with permissions bypassed | Accepted |
| [0006](0006-renderer-behind-an-interface.md) | Render locally, behind a driver interface | Accepted |
| [0007](0007-resume-instead-of-restart.md) | Resume a failed run instead of restarting it | Accepted |
| [0008](0008-mcp-tools-for-human-input.md) | Ask for human input through MCP tools, not the permission hook | Accepted |
| [0009](0009-park-on-unanswered-question.md) | Park a run that nobody answers | Accepted |
| [0010](0010-streaming-input-for-steering.md) | Use streaming input so notes can reach a live run | Accepted |
| [0011](0011-storyboard-from-real-stills.md) | Build the storyboard from real snapshots, sampled late in each clip | Accepted |
| [0012](0012-revision-as-a-fresh-session.md) | Run a revision as a fresh session against the same project | Accepted |
| [0013](0013-free-only-media-providers.md) | Source all media from free providers, chosen per job | Accepted |
| [0014](0014-tailwind-and-component-primitives.md) | Rebuild the studio on Tailwind and a shared primitive layer | Accepted |

## Template

```markdown
# NNNN — Title

- **Status:** Proposed | Accepted | Superseded by ADR-NNNN
- **Date:** YYYY-MM-DD

## Context
What forced a decision. Include what we measured or observed.

## Decision
What we chose, stated plainly.

## Consequences
What this makes easy, what it makes hard, and what we gave up.

## Alternatives considered
What else was on the table and why it lost.
```
