# 6. Extending it

## Add a renderer

`render.ts` defines the seam ([ADR-0006](../adr/0006-renderer-behind-an-interface.md)):

```ts
export type Renderer = {
  name: string;
  render(
    projectDir: string,
    onLine: (line: string) => void,
    signal: AbortSignal,
  ): Promise<{ ok: boolean; output?: string; error?: string }>;
};
```

Implement it, add it to `RENDERERS`, select it with `FILMWRIGHT_RENDERER`. The
pipeline does not change. HyperFrames also supports HeyGen cloud, AWS Lambda and
Cloud Run, all reachable through the same CLI.

Contract notes: stream progress through `onLine` so it reaches the activity feed;
honour `signal` so Cancel stays responsive; return an **absolute path** to the
produced file.

## Add a workflow

Workflows are HyperFrames skills, not code here. To expose one:

1. Add its slug to `WORKFLOWS` in `types.ts`.
2. Add a human label to `WORKFLOW_LABELS` in `new-video.tsx`.

The slug is written into `BRIEF.md` and passed to `hyperframes init --skill`, and
the `/hyperframes` router does the rest.

## Add a pipeline stage

1. Add it to `STAGES` in `types.ts`, in execution order.
2. Teach `detectStages` how to recognise its artifact.

Prefer a **durable artifact** over an observed tool call. `check` is tracked from
a tool call only because it leaves nothing behind, and it is the one stage that
can be wrong.

## Add a tool the agent can call

Add it to `studioTools` in `interact.ts` using `tool(name, description, zodShape,
handler)`, and add its wire name (`mcp__studio__<name>`) to `STUDIO_TOOL_NAMES`.

Two things matter more than the code:

- **The description is the API.** It is how the model decides when to call it.
  Say when to use it *and when not to*.
- **A blocking tool must be able to give up.** Follow `waitForAnswer`: bounded
  wait, then park rather than hang the queue.

## Change a prompt

`prompt.ts` is behaviour. Before and after any edit, print the generated prompt
for a real job and read it end to end:

```ts
import { buildAgentPrompt, buildRevision } from "../packages/engine/src/prompt";
import { getJob } from "../packages/engine/src/store";

const job = await getJob("<job-id>");
console.log(buildAgentPrompt(job!.spec, job!.slug, undefined, true, undefined, {
  notes: buildRevision(job!.notes ?? []),
  version: 2,
}));
```

Run it with `npx tsx`. This catches template-literal mistakes and, more often,
instructions that read differently than intended.

## Support a different output framework

The framework-specific knowledge is concentrated in four places, which is the
work involved:

- `pipeline.ts` — the `hyperframes init` scaffold
- `stages.ts` — which artifacts mean which stage
- `timeline.ts` — parsing `index.html` for clip timing
- `storyboard.ts` — the `snapshot` invocation

Everything else — the queue, the store, interaction, revisions, versioning — is
framework-agnostic.
