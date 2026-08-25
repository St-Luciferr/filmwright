# 0005 — Run the authoring session with permissions bypassed

- **Status:** Accepted
- **Date:** 2026-08-24

## Context

Authoring a video is hundreds of file writes and shell invocations —
`hyperframes` subcommands, `ffmpeg`, TTS, asset fetches. The Agent SDK's default
permission mode prompts per tool call, and there is no interactive approver in a
headless worker. A `canUseTool` handler that auto-approves everything is the same
decision with more code.

## Decision

The session runs with `permissionMode: "bypassPermissions"` and
`allowDangerouslySkipPermissions: true`, bounded by:

- `cwd` set to the single project directory, with no `additionalDirectories`
- a hard spend ceiling (`VIDEOS_MAX_BUDGET_USD`, enforced by the SDK)
- a hard wall-clock ceiling (`VIDEOS_TIMEOUT_MINUTES`)
- cooperative cancellation that aborts the session promptly

## Consequences

- **The agent can run arbitrary commands as the user who started the worker.**
  This is the same authority Claude Code itself has on the machine.
- A prompt submitted to this platform is equivalent to a prompt typed into the
  operator's own terminal. The studio has no authentication and is built for
  localhost; exposing it to an untrusted network would hand that authority to
  anyone who can reach the port.
- Documented prominently in the README, in
  [operations/security.md](../operations/security.md), and here.

## Alternatives considered

**A `canUseTool` allowlist** of commands. Attractive, but the surface is the
whole HyperFrames CLI plus whatever a workflow shells out to; an allowlist tight
enough to matter breaks generation, and one loose enough to work is theatre.

**Containerising the worker.** The right answer for multi-tenant use and the
obvious next step if this ever leaves one machine. Out of scope for a local tool
whose renderer is also local.
