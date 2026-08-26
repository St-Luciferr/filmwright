# 0014 — Rebuild the studio on Tailwind and a shared primitive layer

- **Status:** Accepted. Supersedes the styling decision recorded in
  [developer-guide/04-the-studio.md](../developer-guide/04-the-studio.md).
- **Date:** 2026-08-26

## Context

The studio was two routes: a page with the submission form bolted to the top of
a flat grid of job cards, and a job detail page. Styling was one 1,200-line
hand-written stylesheet, which the developer guide defended on the grounds that
"the surface is small enough that a single file is easier to keep coherent".

That was true of two routes. It stopped being true the moment the platform
needed the things a shipped application has and this one did not:

- **no dashboard** — no way to see spend, success rate, or what is running
  without opening jobs one at a time;
- **no navigation** — one header with a title, and no notion of sections;
- **no way to see whether the worker is alive** — with the studio up and the
  worker down, everything looks normal and jobs queue forever;
- **no collection view** — no search, filter, sort, or pagination over a list
  that grows without bound;
- **no health surface** — `doctor` existed only in a terminal, so a broken
  provider was discovered mid-run with the budget half spent.

The palette itself was never the problem. Near-black ground, one green accent,
mono for anything machine-generated — that reads well and is kept. What was
missing was structure: a spacing scale, a type scale, and components that could
not drift apart because they shared one definition.

## Decision

Tailwind CSS v4 with shadcn-style primitives — hand-written components over
Radix for anything with real accessibility requirements (dialog, menu, tabs,
tooltip, select).

`app/globals.css` shrinks to an `@theme` token block plus a small base layer.
Tokens are semantic rather than literal: surfaces stack
`inset → base → raised → overlay`, text quietens `fg → muted → subtle`.

Components split in two, and the split is load-bearing:

- `components/ui/` knows nothing about this application. It should be liftable
  into another project unchanged.
- `components/app/` holds everything that knows what a job is — the status
  vocabulary, the stage list, the worker pill.

Six surfaces: dashboard, library, guided new-video form, job detail, health,
settings. Two new endpoints back them — `GET /api/worker` and `GET /api/health` —
and the worker now writes a heartbeat to `data/worker.json` so "is it running"
is a fact rather than an inference.

## Consequences

The dependency count went from three to about a dozen. That is the real cost,
and it buys consistency by construction: spacing, type and colour now come from
one scale, so a new panel cannot quietly invent its own padding.

Migration had to be all-or-nothing per component, because the old class names
and the new utilities target the same elements. The old stylesheet was kept as
`legacy.css` and imported alongside Tailwind while components moved across one
at a time, then deleted once nothing referenced it. Doing it in one commit
without that bridge would have meant a broken tree throughout.

Health checks are cached for 30 seconds. Probing shells a script that pings
three endpoints and imports torch, and two open tabs should not run that twice.

Settings is read-only, and should stay that way. Configuration is
environment-owned and a queued job stores the settings it was created with;
writing `.env` from the browser would silently change the meaning of work
already in the queue.

The heartbeat has a 15-second staleness window, deliberately generous. Reporting
a live worker as down is worse than a few seconds of lag, because the studio's
answer to "worker down" is to tell someone to go start one that is already
running.

## Alternatives considered

**Keep the hand-rolled stylesheet and grow it.** The honest option, and it would
have avoided every new dependency. Rejected because the primitives a dashboard
needs — table, tabs, dialog, menu, toast, skeleton, empty state — are roughly
600 lines of CSS plus the accessible behaviour, and writing that by hand is more
code to maintain than the library, not less.

**Tailwind without Radix, using native elements.** `<dialog>` and `<details>`
cover some of it. Rejected for menus and tabs specifically: focus trapping,
roving tabindex and dismiss semantics are exactly the things hand-rolled
implementations get subtly wrong, and they fail silently for the people who
depend on them.

**A full component library (MUI, Mantine, Chakra).** Faster to assemble, but it
brings its own visual identity, and the existing dark/green palette is good and
worth keeping. shadcn-style means owning the component source, so the tokens
stay ours.
