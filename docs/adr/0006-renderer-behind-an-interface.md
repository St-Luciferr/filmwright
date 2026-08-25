# 0006 — Render locally, behind a driver interface

- **Status:** Accepted
- **Date:** 2026-08-24

## Context

HyperFrames can render locally, on HeyGen's cloud, on AWS Lambda, and on Google
Cloud Run. Only local rendering needs no accounts, no credentials and no deploy.

## Decision

`packages/engine/src/render.ts` defines a `Renderer` interface with one
registered driver, `local`, which shells out to the pinned CLI. The driver is
chosen by `FILMWRIGHT_RENDERER`, and an unknown value fails loudly with the list of
valid ones.

## Consequences

- Zero infrastructure and zero cost beyond the model.
- Throughput is one render at a time, matching the serial worker.
- Adding a cloud driver means implementing `render()` and adding it to the
  `RENDERERS` map. The pipeline does not change.
- The interface is one method, which is honest — it was written against a single
  implementation and will likely need to grow (progress reporting, artifact
  fetch) when a second one lands.

## Alternatives considered

**Call the CLI directly from the pipeline.** Fewer moving parts today, but the
pipeline would then have to be edited to add cloud rendering, and the seam is
one file either way.

**Build the cloud drivers now.** Speculative: none of them can be tested without
credentials this project does not have.
