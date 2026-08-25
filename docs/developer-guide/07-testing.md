# 7. Testing and verification

There is no unit test suite. This is a deliberate, and debatable, position: the
system's behaviour lives in an agent session, a CLI subprocess and the
filesystem, so the parts a unit test could cover cheaply are the parts least
likely to be wrong.

What exists instead is a set of verification practices that have caught real
bugs.

## Static checks

```bash
npm run typecheck    # engine + studio
npm run build        # production build of the studio
```

Both are fast. `typecheck` covers the engine, which the Next build does not
fully exercise.

## Probe scripts

Exercise real code paths with `tsx` against real data, then delete the script:

```bash
cat > scripts/_probe.ts <<'TS'
import { readTimeline, clipAt } from "../packages/engine/src/timeline";
const clips = readTimeline("projects/<slug>");
for (const t of [0, 5.4, 5.5, 8.0, 8.03, 25.2]) {
  console.log(t, "->", clipAt(clips, t)?.id ?? "(none)");
}
TS
npx tsx scripts/_probe.ts
rm scripts/_probe.ts
```

This found the overlay bug — a full-span captions track shadowing every frame, so
every pinned note would have been filed against `captions` instead of the scene
it was about.

## The safe-probe pattern

Some paths end in "the worker claims this job and spends money". To exercise them
without paying, **point the job at a project directory that does not exist**:

```bash
python3 -c "
import json; f='data/jobs/<id>/job.json'; d=json.load(open(f))
d['projectDir']='projects/__probe_missing__'
json.dump(d, open(f,'w'), indent=2)"
```

The worker claims it, hits the resume guard, and fails in under a second:

```
Cannot resume: projects/__probe_missing__ no longer exists.
```

This verified the answer → requeue flow, the revise flow and the parked handoff,
all against the live worker, at zero cost. It doubles as a check that the running
worker is on your new code.

## HTTP checks

The API is plain JSON over HTTP; `curl` is enough:

```bash
# validation
curl -s -X POST localhost:3100/api/jobs -H 'content-type: application/json' \
  -d '{"prompt":""}' -w " [%{http_code}]\n"

# range requests, needed for scrubbing
curl -s -o /dev/null -w "%{http_code}\n" -H "Range: bytes=0-1023" \
  localhost:3100/api/jobs/<id>/video

# path traversal must be refused
curl -s -o /dev/null -w "%{http_code}\n" \
  "localhost:3100/api/jobs/<id>/artifact?path=../../../../etc/passwd"
```

**Re-verify the traversal checks whenever a file-serving route changes.**

## Before changing engine source

The dev worker runs under `tsx watch` and restarts on save, killing any run in
progress. Check for a `running` job first — see
[local setup](02-local-setup.md#the-worker-restarts-on-file-change).

## What a unit suite would be worth

If this grows, the highest-value targets are the pure functions, because they are
where the subtle bugs have actually been:

- `timeline.ts` — `clipAt` boundaries and overlay precedence
- `stages.ts` — stage derivation from a fixture directory
- `slug.ts` — de-duplication
- `create.ts` — `parseSpec` validation
- `storyboard.ts` — `sampleTime`, and `isStale` against fixture mtimes

All are dependency-free and would test in milliseconds.
