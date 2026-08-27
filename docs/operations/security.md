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

- It binds to `127.0.0.1` by default. `HOST=0.0.0.0` overrides that; do not,
  unless you have read this whole page and meant it.
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

**Paths.** The file-serving routes are confined and verified:

| Route | Confined to | Verified |
|---|---|---|
| `artifact` | the job's project directory | traversal → `403`, symlink out → `403` |
| `storyboard/image` | the project's `storyboard/` | traversal → `403`, `renders/` → `403`, symlink out → `403` |
| `video` | the project directory | resolved, links followed, checked |
| `captions` (write) | the job's project directory | outside `projects/` → `409` |
| `render` (spawn) | the job's project directory | outside `projects/` → `409` |

All of them go through `confinedPath` / `projectPath`, which resolve symlinks
before comparing against the permitted prefix — the agent writes freely inside
its project, so a link pointing outward is an ordinary thing for it to leave
behind. `confinedPath` additionally refuses anything that is not a regular file.

Two limits worth knowing: a **hardlink** defeats any realpath-based scheme (the
link *is* the file, with no path to resolve), and the check is not atomic with
the open that follows it, so a path component swapped in that window wins. Both
need local write access inside the project directory — which the agent has.

**Re-verify these whenever a file-serving route changes** — see
[testing](../developer-guide/07-testing.md#http-checks). `noUnusedLocals` is on
in both tsconfigs specifically because a confinement helper that was imported
and never called once shipped this way, and typecheck said nothing.

**Cross-site requests.** `proxy.ts` guards `/api/*` in two layers:

1. **Host.** Every API request must be addressed to `localhost`, `127.0.0.1`,
   `[::1]`, or a name listed in `FILMWRIGHT_ALLOWED_HOSTS` (or `HOST`, when it
   is a specific interface). This is the layer that matters: `Origin`-versus-
   `Host` alone is defeated by **DNS rebinding**, where a page served from
   `attacker.example` re-resolves that name to `127.0.0.1` and every subsequent
   request is *genuinely* same-origin, with every header telling the truth.
   Pinning the names this server answers to is what breaks that.
2. **Origin.** Mutating methods are refused when the browser reports the request
   as cross-site, or when `Origin` does not match the host.

Requests with no browser headers at all (curl, the `requeue` CLI, your own
scripts) pass the second layer, because that is not what a hostile page can
send. They still have to satisfy the first.

This is not authentication. It stops another *site* acting as you; it does
nothing about another *person* who can reach the port.

Request validation is centralised in `parseSpec`; note that it validates
*shape*, not intent. There is no prompt filtering, by design — that would be
theatre given the bypassed permissions.

## Credentials

The Agent SDK reuses `~/.claude/.credentials.json` when `ANTHROPIC_API_KEY` is
unset. Nothing is copied into the repository, and generated projects contain no
credentials.

The **authoring session** inherits `process.env` — anything in your environment,
and now anything in `.env`, is visible to the agent. That is inherent: it is a
Claude Code session with your authority.

Every **other** child gets a scrubbed copy (`childEnv`): the renderer's `npx`,
which fetches and executes a package from the registry, and the media probe the
health page shells out to. Names containing `KEY`, `TOKEN`, `SECRET`,
`CREDENTIAL`, `PASSWORD`, `PASSWD`, `AUTH`, `COOKIE` are dropped, as are
`PGPASSWORD`, `MYSQL_PWD`, `NETRC`, `KUBECONFIG`, `GNUPGHOME`, `XAUTHORITY`,
`*_DSN`, `*_WEBHOOK` and any value that is a URL with credentials embedded in
it. `SSH_AUTH_SOCK` is dropped deliberately — nothing spawned here needs the
agent socket. PATH, HOME and the toolchain's configuration survive.

**This reduces accidental exposure; it is not a boundary.** The child keeps
`HOME`, so a hostile package it installs can still read `~/.npmrc`,
`~/.aws/credentials` or `~/.claude/.credentials.json` for itself. Treat it as
hygiene, not containment.

## If you need multi-user

This design is single-operator. Making it safe for anyone else means, at minimum:

1. Running the worker in a container with no host mount beyond the project
   directory.
2. Authentication on the studio.
3. Per-user job isolation — the store assumes one trusted operator.

None of that exists today. Do not skip it and hope.
