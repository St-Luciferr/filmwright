# 0002 — Write `BRIEF.md` before the session starts

- **Status:** Accepted
- **Date:** 2026-08-24

## Context

The `/hyperframes` skill opens with an intent-capture step: it confirms the
brief with the user before entering a workflow. In an unattended run nothing can
answer it, so the session would stall on its first turn.

## Decision

The **worker** writes `BRIEF.md` from the submitted form before the agent starts,
using the frontmatter shape the workflows already read (`workflow`, `aspect`,
`length`, `narration`, `destination`, …). The agent prompt states that the brief
is confirmed intent and that the intent-capture step should be skipped.

`AskUserQuestion`, `ExitPlanMode` and `EnterPlanMode` are additionally placed in
`disallowedTools`, so a run cannot block on a question even by accident.

## Consequences

- Unattended runs are possible at all.
- The form's fields are load-bearing: they *are* the brief, so every field the
  form omits is a decision the agent makes alone.
- The `brief` pipeline stage completes before the model produces a token. This
  is accurate — the platform really did set the brief — but it means the stage
  list starts partly filled.
- Interactive mode ([ADR-0008](0008-mcp-tools-for-human-input.md)) reintroduces
  human decisions deliberately, through a channel the platform controls, rather
  than by re-enabling the built-in prompt.

## Alternatives considered

**Let the agent write the brief.** It would have to ask, which is the thing that
does not work headlessly.

**Answer the intent-capture prompt programmatically.** Requires intercepting a
skill's conversational step, which is brittle and would break on skill updates.
