# Security

Read this before exposing the studio to anything but localhost.

## The core fact

The authoring session runs with `permissionMode: "bypassPermissions"`
([ADR-0005](../adr/0005-bypass-permissions.md)). **The agent can run arbitrary
commands as the user who started the worker** — the same authority Claude Code
itself has on that machine.

Authoring a video is hundreds of file writes and shell invocations. There is no
interactive approver in a headless worker, and an allowlist tight enough to
matter would break generation.

## What that means in practice

> **A prompt submitted to this platform is equivalent to a prompt typed into your
> own terminal.**

The studio has **no authentication**. Anyone who can reach the port can queue a
job, and therefore can run commands as you.

- Keep it bound to localhost.
- Do not put it on a shared network or behind a tunnel.
- Treat the prompt box as a shell prompt.

## What bounds a run

| Bound | Mechanism |
|---|---|
| Working directory | `cwd` is the single project directory; no `additionalDirectories` |
| Spend | `FILMWRIGHT_MAX_BUDGET_USD`, enforced by the SDK |
| Wall clock | `FILMWRIGHT_TIMEOUT_MINUTES`, aborts the session |
| Interruption | Cancel aborts promptly; parking frees the worker |

These bound *scope and cost*. They are not a sandbox. `cwd` constrains where the
agent is pointed, not what a shell command can reach.

## What is actually enforced

The file-serving routes are confined and verified:

| Route | Confined to | Verified |
|---|---|---|
| `artifact` | the job's project directory | traversal → `403` |
| `storyboard/image` | the project's `storyboard/` | traversal → `403`, `renders/` → `403` |
| `video` | inside the repository root | resolved and checked |

Each resolves the requested path and compares against the permitted prefix before
opening anything. **Re-verify these whenever a file-serving route changes** — see
[testing](../developer-guide/07-testing.md#http-checks).

Request validation is centralised in `parseSpec`; note that it validates
*shape*, not intent. There is no prompt filtering, by design — that would be
theatre given the bypassed permissions.

## Credentials

The Agent SDK reuses `~/.claude/.credentials.json` when `ANTHROPIC_API_KEY` is
unset. Nothing is copied into the repository, and generated projects contain no
credentials. The subprocess inherits `process.env`, so anything in your
environment is visible to the agent.

## If you need multi-user

This design is single-operator. Making it safe for anyone else means, at minimum:

1. Running the worker in a container with no host mount beyond the project
   directory.
2. Authentication on the studio.
3. Per-user job isolation — the store assumes one trusted operator.

None of that exists today. Do not skip it and hope.
