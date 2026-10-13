# 3. The engine

`packages/engine/src`, module by module.

| Module | Responsibility |
|---|---|
| `types.ts` | Every shared type. Browser-safe — no Node imports. |
| `config.ts` | Environment parsing, paths, the CLI pin. |
| `create.ts` | Request validation (`parseSpec`), `createJob`, `createRevision`. |
| `slug.ts` | Prompt → readable directory name, de-duplicated. |
| `store.ts` | Job records, events, answers, steering, notes, versions. |
| `stages.ts` | Filesystem-derived progress; `describeExisting` for resumes. |
| `timeline.ts` | `index.html` → clips; timestamp → frame. |
| `storyboard.ts` | Per-frame stills, manifest, staleness. |
| `prompt.ts` | `BRIEF.md`, the authoring prompt, the revision prompt. |
| `interact.ts` | The studio's MCP tools; parking. |
| `agent.ts` | The Agent SDK session; `InputStream` for steering. |
| `workers.ts` | The `frame-worker` agent definition and the packet builder ([ADR-0016](../adr/0016-engine-defined-frame-workers.md)). |
| `design.ts` | Deterministic craft checks: voice line longer than its frame, undeclared or missing fonts (fail); off-palette colours and long holds (noted). Calibrated against the projects on disk. |
| `judge.ts` | The blind visual judge: one still per frame against its storyboard block, binary answers, capped rounds. |
| `check.ts` | Runs `hyperframes check --json` and turns findings into per-file evidence ([ADR-0017](../adr/0017-check-findings-as-evidence.md)). |
| `render.ts` | `Renderer` interface, local driver, `runCommand`. |
| `pipeline.ts` | One job, end to end. |
| `worker.ts` | Queue loop, orphan recovery, shutdown. |

## `pipeline.ts` — the spine

`runJob(job)` is the only place the phases are sequenced. It:

- sets a wall-clock timeout that aborts the session
- scaffolds, or resumes an existing directory
- archives the previous render when the job is a revision
  ([ADR-0012](../adr/0012-revision-as-a-fresh-session.md))
- starts the stage poller and the steering poller
- runs the session
- renders if the workflow did not
- classifies the outcome

Three outcomes are distinguished by exception type, which is why `Parked` and
`Cancelled` are classes rather than flags:

| Thrown | Result |
|---|---|
| `Parked` | `awaiting-input`, question retained, worker freed |
| `Cancelled` | `cancelled`, no error recorded |
| anything else | `failed`, message recorded |

`finally` always clears both pollers and the cancel flag.

A job with `kind: "render"` never reaches any of that: `runJob` hands it to
`runRenderJob`, which resolves the project directory, archives the previous
render, and runs the renderer. No session, no steering, no spend — it exists so
an edit made directly on disk (a fixed caption) can reach the mp4 without paying
for a run. Both paths stop a job through the same `recordStop`, so failures are
classified identically.

## `captions.ts` — editing what is on screen

Captions are burned in at render time from `compositions/captions.html`, which
carries the cues inline as a `var GROUPS = [...]` literal. That literal is the
render input and therefore what `updateCaptions` edits; `caption_groups.json` is
mirrored to keep it honest, preserving the file's own formatting.

`caption-overrides.json` is deliberately untouched. Despite the name it holds
per-word *style and position* written by the hyperframes caption studio — there
is no text field in it.

The literal is located with a bracket counter rather than a regex: cue text is
arbitrary, and a caption containing `];` would end a lazy match early and corrupt
the composition.

## `agent.ts` — the session

Key options, and why:

```ts
settingSources: ["user", "project"]   // ~/.claude/skills + project CLAUDE.md
skills: "all"                          // the /hyperframes router
tools: { type: "preset", preset: "claude_code" }
disallowedTools: ["AskUserQuestion", "ExitPlanMode", "EnterPlanMode"]
permissionMode: "bypassPermissions"
allowDangerouslySkipPermissions: true
maxBudgetUsd, effort, model
agents: { "frame-worker": frameWorkerDefinition() }   // own model, effort, tools
env: CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS, CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1
```

The `frame-worker` is the only subagent the session defines. The frames stage
instruction tells the orchestrator to dispatch one per frame; the worker's
world is `_role.md`, its packet and `frame.md`, and it may only read and write
files.

`InputStream` implements `AsyncIterable<SDKUserMessage>`. Passing it as `prompt`
puts the session in streaming-input mode, so steering notes become user turns
([ADR-0010](../adr/0010-streaming-input-for-steering.md)). It closes on `result`
when nothing is queued — **forgetting to close it hangs the query**, so `close()`
is also called in a `finally`.

Runs without steering pass a plain string, keeping the simple path simple.

## `interact.ts` — asking a person

`studioTools(jobId, ctx, projectDir)` builds an in-process MCP server with
`ask_user` and `request_review`
([ADR-0008](../adr/0008-mcp-tools-for-human-input.md)). Both call
`waitForAnswer`, which publishes the interaction onto the job and polls for an
answer file.

On timeout it sets `ctx.parked`, aborts the session, and throws `Parked`
([ADR-0009](../adr/0009-park-on-unanswered-question.md)).

At the `pre-render` gate it captures the storyboard before publishing, so the
studio has pictures ready when the card appears.

## `prompt.ts` — three prompts, one function

`buildAgentPrompt` returns a different document depending on state:

1. **Revision** — returns early with a change-focused prompt. This is a whole
   reframing, not a section, so the agent does not re-run the workflow.
2. **Continuation** — prepends an inventory of existing work plus instructions
   not to regenerate it.
3. **Fresh** — the standard authoring instruction.

Interactive mode swaps the "never ask" rules for the tool guidance, and
`describeDecisions()` replays settled answers so nothing is asked twice.

Prompt changes are behaviour changes. Treat this file with the care you would
give production logic, because it is production logic.
