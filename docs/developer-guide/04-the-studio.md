# 4. The studio

`apps/studio` — Next.js 16, App Router, Turbopack, React 19.

## Routes

| Route | Kind | Purpose |
|---|---|---|
| `/` | Server | Submission form + library grid |
| `/jobs/[id]` | Server shell → client | Live job page |
| `/api/…` | Route handlers | See [reference/http-api.md](../reference/http-api.md) |

Everything is `runtime = "nodejs"` and `dynamic = "force-dynamic"`. The job store
is the filesystem, so nothing may be cached or statically rendered.

## Components

```
app/
├─ page.tsx            library + form (server)
├─ new-video.tsx       the submission form (client)
└─ jobs/[id]/
   ├─ page.tsx         fetches job + versions (server)
   ├─ live.tsx         the live shell (client) — owns job state
   ├─ decision.tsx     blocking question / review gate
   ├─ storyboard.tsx   frame grid, per-frame notes, lightbox
   ├─ review.tsx       player, frame strip, pinned notes, Versions
   └─ activity.tsx     Story / Everything feed, steering composer
```

## Live updates

`live.tsx` owns the job state and chooses a transport:

- **live or parked** → `EventSource` on `/api/jobs/[id]/events`. The server tails
  `events.ndjson` by byte offset and sends `{ job, events }` about once a second,
  closing when the job reaches a terminal state.
- **finished** → one `?once=1` fetch for the whole history.

A parked job is polled too, because answering re-queues it and the page should
follow that without a reload.

### The prop versus state trap

`live.tsx` seeds state from a prop:

```tsx
const [job, setJob] = useState(initial);
```

**`useState` ignores prop changes after mount.** This caused a real bug: adding a
note wrote to disk and `router.refresh()` re-rendered the server component, but
the client kept its original empty `notes` array, so nothing appeared until a
manual reload.

Two rules follow:

1. Mutations that change the job should push the updated record straight back
   into state. The notes API returns the whole job for exactly this reason:
   `onJob={setJob}`.
2. There is a `useEffect` syncing `initial` → state so a genuine server re-render
   is not silently ignored.

The same class of bug bit the storyboard: the live feed hands a new manifest
object every tick, which would discard a capture just made in the browser.
`storyboard.tsx` therefore only adopts an incoming manifest when its
`capturedAtMs` is newer.

## Path safety

Three routes serve files from a project directory: `artifact`, `video`,
`storyboard/image`. Each resolves the requested path and checks it is still
inside the permitted directory before opening anything:

```ts
const file = path.resolve(projectDir, rel);
if (!file.startsWith(path.join(projectDir, "storyboard") + path.sep)) {
  return new Response("Forbidden", { status: 403 });
}
```

Keep this in any new file-serving route. Traversal and sibling-directory escapes
are both covered by the existing checks and both are verified.

## Styling

One stylesheet, `app/globals.css`, organised by area with CSS custom properties
for the palette. No CSS framework and no component library — the surface is small
enough that a single file is easier to keep coherent.
