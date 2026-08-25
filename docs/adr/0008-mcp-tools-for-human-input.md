# 0008 — Ask for human input through MCP tools, not the permission hook

- **Status:** Accepted
- **Date:** 2026-08-25

## Context

Unattended generation makes every creative decision alone. The first real runs
showed the cost: a video was built on an assumption about the hero visual that a
single question would have settled.

The built-in `AskUserQuestion` tool is disabled in this environment
([ADR-0002](0002-pre-written-brief.md)) because nothing can answer it. The
tempting route to re-enable it is `canUseTool`: intercept the call, show the
question in the studio, and return the answer.

That does not work cleanly. `PermissionResult` is either `{behavior: "allow"}` —
which lets the built-in tool run with no answerer — or `{behavior: "deny",
message}`. Answering through `deny` tells the model **its call was refused**, and
the answer arrives as a refusal message.

## Decision

Define the studio's own in-process MCP server (`createSdkMcpServer`) with two
tools:

- `ask_user` — 1–3 questions, each with 2–4 options carrying descriptions and
  optional previews. Returns the person's answer.
- `request_review` — a gate at `script`, `storyboard` or `pre-render`. Returns
  approval, or revision notes the agent must act on and resubmit.

Both block on a file the studio writes; the answer comes back as an **ordinary
tool result**.

## Consequences

- The model treats an answer as an answer. No refusal semantics to work around.
- We own the schema, so the studio can render options, previews, a free-text
  "something else", and — at the pre-render gate — the frame storyboard.
- Requires the `zod` and `@modelcontextprotocol/sdk` peer dependencies.
- The worker and web app communicate through the job directory, consistent with
  [ADR-0004](0004-file-based-job-store.md).
- The prompt must teach the agent *when* to ask. Asking too often is as bad as
  never asking, and that balance is prompt tuning, not architecture.

## Alternatives considered

**`canUseTool` + `deny`-with-message.** Fewer dependencies, wrong semantics.

**`onUserDialog`.** A real protocol for host-rendered dialogs, but it routes
CLI-defined dialog kinds rather than letting us define the interaction, and
failing to declare a kind degrades silently.
