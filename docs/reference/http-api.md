# HTTP API reference

All routes are Node-runtime, dynamic, and unauthenticated — the studio is built
for localhost ([operations/security.md](../operations/security.md)).

Base: `http://localhost:3100`

## Jobs

### `GET /api/jobs`
All jobs, newest first. → `{ jobs: Job[] }`

### `POST /api/jobs`
Create and queue a job.

```json
{
  "prompt": "A 25s TikTok promo for …",
  "workflow": "product-launch-video",
  "aspect": "9:16",
  "seconds": 25,
  "destination": "tiktok",
  "language": "en",
  "audience": "Nepali MBBS aspirants, 16-20",
  "sourceUrl": "https://example.com",
  "narration": true,
  "captions": true,
  "music": true,
  "interactive": true
}
```

Only `prompt` is required. → `201` with the `Job`, or `400 { error }`.

Validation (`parseSpec`): prompt non-empty and ≤ 8000 chars; `workflow` in
`WORKFLOWS`; `aspect` in `ASPECTS`; `seconds` between 5 and 180; `sourceUrl`
`http(s)` if present.

### `GET /api/jobs/{id}`
→ `Job` or `404`.

### `POST /api/jobs/{id}/cancel`
`queued` → retired immediately. `running` → writes the cancel marker the worker
polls. Anything else → `409`.

## Live updates

### `GET /api/jobs/{id}/events`
Server-Sent Events. Each message is `{ job, events }`, roughly once a second;
the stream closes when the job reaches a terminal state.

`?once=1` returns the entire history as one JSON response instead — used for
finished jobs.

The server tails `events.ndjson` by byte offset and stops at the last newline, so
a concurrent append is never parsed half-written.

## Interaction

### `POST /api/jobs/{id}/answer`
Answer whatever is in `job.pending`.

```json
{ "answers": ["Recreate the UI"] }
```
```json
{ "decision": "revise", "notes": "- frame `03-…` — logo too small" }
```

Writes the answer file the worker polls. If the job was **parked**, it also
records the decision and re-queues the job as a resumed run —
`{ ok: true, requeued: true }`.

`409` if nothing is pending.

### `POST /api/jobs/{id}/steer`
`{ "text": "make beat 3 land harder" }` → appended to `steer.ndjson` and
delivered at the next turn boundary. `409` unless the job is `running`; max 2000
characters.

## Content

### `GET /api/jobs/{id}/video`
Streams the MP4. Supports `Range` (needed for scrubbing) and returns `206` with
`Content-Range`. `?download=1` sets `Content-Disposition`.

### `GET /api/jobs/{id}/artifact?path=SCRIPT.md`
Text file from inside the job's project directory. Confined to that directory —
traversal returns `403`. Files over 512 KB return `413`.

### `GET /api/jobs/{id}/timeline`
→ `{ clips: Clip[] }` parsed from `index.html`, each with `id`, `src`, `start`,
`duration`.

## Storyboard

### `GET /api/jobs/{id}/storyboard`
→ `{ manifest, stale }`. `stale` is true when `index.html` or any frame file has
changed since capture.

### `POST /api/jobs/{id}/storyboard`
Capture a still per frame. **Slow** — launches a browser per frame; `maxDuration`
is 600s. → `{ manifest, stale: false }`.

### `GET /api/jobs/{id}/storyboard/image?file=storyboard/frame-00-at-3.62s.png`
Streams a still. Confined to the project's `storyboard/` directory; anything else,
including `renders/`, returns `403`.

## Revision

### `POST /api/jobs/{id}/notes`
`{ "text": "logo too small", "timeSec": 8.3 }` — `timeSec` optional. The frame on
screen is resolved server-side and stored as `clipId`. → the updated `Job`.

### `DELETE /api/jobs/{id}/notes?note={noteId}`
→ the updated `Job`.

### `POST /api/jobs/{id}/revise`
Queues a revision from the job's collected notes: same project directory,
`resume: true`, `version + 1`, decisions carried forward. Clears the parent's
notes. → `201` with the new `Job`, or `400` if there are no notes or no render.

## Conventions

- Errors are `{ "error": "human-readable message" }` with a 4xx/5xx status.
- Both `notes` routes return the **whole updated job**, so the client can render
  immediately without a refetch — see
  [the prop-versus-state trap](../developer-guide/04-the-studio.md#the-prop-versus-state-trap).
