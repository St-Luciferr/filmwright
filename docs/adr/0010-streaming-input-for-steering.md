# 0010 — Use streaming input so notes can reach a live run

- **Status:** Accepted
- **Date:** 2026-08-25

## Context

Blocking questions and fixed gates cover decisions the agent or the pipeline
anticipates. They do not cover watching a run and wanting to say "make beat 3
land harder" without stopping it.

`query({ prompt })` with a string runs one turn-loop and ends. Nothing can be
added to the conversation while it runs.

## Decision

When a run may be steered, the prompt is an `AsyncIterable<SDKUserMessage>`
(`InputStream` in `agent.ts`) rather than a string. The pipeline tails
`steer.ndjson` and pushes each note into the stream as an ordinary user turn.

The stream closes when a `result` message arrives and nothing is queued, which
is what ends the query.

## Consequences

- Notes are non-blocking and arrive at the next turn boundary, so there is a
  short delay between sending and the agent seeing them.
- The agent treats a note as direction from the client, because it genuinely is
  a user turn.
- Session lifetime is now managed by us: forget to close the stream and the
  query never finishes. `close()` is called on the `result` path and again in a
  `finally`.
- Runs without steering still pass a plain string, keeping the simple path
  simple.

## Alternatives considered

**Queue notes and deliver them in a tool result.** Only lands when the agent
happens to call a studio tool, which may be never.

**Interrupt and restart with the note appended.** Loses context and wastes the
turn in progress.
