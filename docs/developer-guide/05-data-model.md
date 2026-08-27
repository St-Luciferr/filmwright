# 5. Data model

## On disk

```
data/jobs/<uuid>/
├── job.json           the record — atomically rewritten
├── events.ndjson      append-only activity log
├── answers/<id>.json  answer to one blocking interaction
├── steer.ndjson       append-only notes typed at a running job
└── cancel             empty marker; presence requests cancellation

projects/<slug>/
├── BRIEF.md SCRIPT.md STORYBOARD.md frame.md
├── index.html                  the timeline — source of truth for timing
├── compositions/frames/*.html  one file per frame
├── assets/{voice,bgm,sfx,fonts}
├── storyboard/                 stills + manifest.json  (gitignored)
└── renders/
    ├── <name>.mp4              current
    └── history/v<n>-<name>.mp4 previous versions
```

## `Job`

The full type is in `packages/engine/src/types.ts`. The fields that carry
behaviour:

| Field | Meaning |
|---|---|
| `status` | `queued` · `running` · `awaiting-input` · `succeeded` · `failed` · `cancelled` · `imported` |
| `spec` | The submitted `VideoSpec` — the brief in structured form |
| `projectDir`, `videoPath` | Repo-relative paths |
| `stages` | Derived, never authored ([ADR-0003](../adr/0003-filesystem-derived-progress.md)) |
| `interactive` | Whether the studio's MCP tools are attached |
| `pending` | The `Interaction` currently blocking the run |
| `answered` | Settled decisions, replayed into resumed runs |
| `resume`, `resumeOf` | Continue an existing project directory |
| `failure` | Structured detail behind `error`: `kind`, `stage`, `resumable`, and the `hint` shown on the job page |
| `attempt`, `retryOf`, `retriedBy` | Retry lineage — which attempt this is, what it retries, and what retried it |
| `revisionOf`, `version`, `appliedNotes` | Revision lineage |
| `notes` | Feedback collected against *this* job's render |
| `costUsd`, `numTurns`, `sessionId` | Reported by the SDK |

`imported` marks a project adopted by `npm run seed` — real work this platform
did not produce.

## Invariants

- **`job.json` is written atomically** (temp file + rename), so a reader never
  observes a partial record.
- **`events.ndjson` is append-only.** The SSE reader tracks a byte offset and
  stops at the last newline, so a concurrent append is never parsed half-written.
- **`stages` is derived.** Anything that writes a stage from agent output is a
  bug.
- **`notes` belong to the job whose render they describe.** Applying them moves
  them to the new job's `appliedNotes` and clears them from the parent.
- **A version's `videoPath` always points at the file that version produced** —
  archiving repoints the parent rather than leaving it aimed at an overwritten
  path.

## Concurrency

`claimNextJob` is a read-then-write with no compare-and-swap. **This is only
correct with one worker**, which is the intended deployment
([ADR-0004](../adr/0004-file-based-job-store.md)). Running two would race.

Orphan recovery runs at worker start: any job still marked `running` is failed,
because its session died with the previous process. The failure is recorded as
`kind: "worker"` and stays resumable whenever the project directory still holds
work, so the job page offers **Continue** rather than only **Start over**. With
`FILMWRIGHT_AUTO_CONTINUE` set, the worker re-queues it itself.
