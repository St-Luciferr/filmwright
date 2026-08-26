# 4. The studio

`apps/studio` — Next.js 16, App Router, Turbopack, React 19.

## Routes

| Route | Kind | Purpose |
|---|---|---|
| `/` | Server | Dashboard — KPIs, live runs, decisions waiting, recent |
| `/library` | Server shell → client | **Projects**, with search, filters, sort, grid/table |
| `/new` | Server shell → client | Guided submission form with a live summary |
| `/jobs/[id]` | Server shell → client | Live job page |
| `/health` | Client | Worker, toolchain and media-provider checks |
| `/settings` | Server | Effective config and the provider catalog, read-only |
| `/api/…` | Route handlers | See [reference/http-api.md](../reference/http-api.md) |

### Projects, not runs

The library groups by `projectDir`, not by job. A revision reuses the original
project directory by design, so four runs of one video were showing as four
cards. Grouping is `lib/projects.ts`; the card expands to list every version.

`projectDir` rather than `slug` is the identity: a slug can be reassigned when
two queued jobs collide, while the directory is what every version shares.

Deleting is two separate intentions and the dialog makes the reader pick.
Dropping the records tidies the library; removing the files destroys
compositions, captured assets and renders — which for an adopted example is
hand-authored work this platform never produced and cannot regenerate.

`/settings` is deliberately read-only: config is environment-owned and a queued
job stores the settings it was created with, so writing `.env` from the browser
would silently change the meaning of work already in the queue.

Everything is `runtime = "nodejs"` and `dynamic = "force-dynamic"`. The job store
is the filesystem, so nothing may be cached or statically rendered.

## Components

```
components/
├─ ui/                 the primitive layer — no app knowledge
│  ├─ button · card · badge · field · select · table · tabs
│  ├─ dialog · menu · tooltip · toast
│  └─ feedback.tsx     Skeleton · EmptyState · ErrorBox · Progress
└─ app/                app-aware pieces
   ├─ shell.tsx        sidebar + topbar + providers
   ├─ nav.tsx          route list, active detection, brand
   ├─ status.tsx       one job-status vocabulary for every surface
   ├─ stat-tile.tsx    dashboard KPI tile + sparkline
   ├─ job-row.tsx      a job as a list row
   └─ worker-pill.tsx  live worker indicator

app/
├─ page.tsx            dashboard (server)
├─ library/            collection view
├─ new/                guided submission form
├─ health/             live provider checks
├─ settings/           effective config, read-only
└─ jobs/[id]/
   ├─ page.tsx         fetches job + versions (server)
   ├─ live.tsx         the live shell (client) — owns job state
   ├─ decision.tsx     blocking question / review gate
   ├─ storyboard.tsx   frame grid, per-frame notes, lightbox
   ├─ review.tsx       player, frame strip, pinned notes, Versions
   └─ activity.tsx     Story / Everything feed, steering composer
```

The split is worth keeping: anything in `ui/` should be liftable into another
project unchanged, so job statuses, stage names and API paths live in `app/`.

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

Tailwind CSS v4 with shadcn-style primitives over Radix
([ADR-0014](../adr/0014-tailwind-and-component-primitives.md)).

`app/globals.css` holds only three things: the `@import "tailwindcss"`, an
`@theme` block of design tokens, and a small `@layer base` / `@layer utilities`
section. Everything else is utilities in components.

**Tokens, not raw colours.** The palette is semantic — surfaces stack
`inset → base → raised → overlay`, text quietens `fg → muted → subtle`. Reach
for `bg-raised` and `text-subtle`, never `bg-[#131518]`, so a palette change
stays a one-file edit.

**Use `cn()` for any component that takes a `className`.** Plain string
concatenation leaves both `p-2` and `p-6` in the class list and lets stylesheet
order decide; `tailwind-merge` resolves the conflict in favour of the caller.

**PostCSS config lives at `apps/studio/postcss.config.mjs`.** Turbopack resolves
it from the Next project root, which is this directory, not the workspace root.
