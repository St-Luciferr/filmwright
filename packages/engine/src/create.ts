import { randomUUID } from "node:crypto";
import path from "node:path";
import { PROJECTS_DIR, ROOT, config } from "./config";
import { projectSlug } from "./slug";
import { claim, emptyStages, jobsInProject, releaseClaim, saveJob } from "./store";
import {
  ASPECTS,
  KOKORO_VOICES,
  MEDIA_KINDS,
  PROVIDERS,
  WORKFLOWS,
  findProvider,
  resolveProviders,
  type Aspect,
  type Job,
  type MediaProviders,
  type RevisionNote,
  type VideoSpec,
  type Workflow,
} from "./types";

export class SpecError extends Error {}

/**
 * The next version number for a project.
 *
 * Derived from every run recorded against the directory rather than from the
 * parent's own number: two re-renders queued from the same page would otherwise
 * both be "v2", collide in `renders/history/`, and leave the project with two
 * current mp4s.
 */
async function nextVersion(projectDir: string): Promise<number> {
  const siblings = await jobsInProject(projectDir);
  return siblings.reduce((max, job) => Math.max(max, job.version ?? 1), 0) + 1;
}

const asString = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

const asBool = (v: unknown, fallback: boolean): boolean =>
  typeof v === "boolean" ? v : fallback;

/** Validate an untrusted request body into a VideoSpec. */
export function parseSpec(body: unknown): VideoSpec {
  const b = (body ?? {}) as Record<string, unknown>;

  const prompt = asString(b.prompt);
  if (!prompt) throw new SpecError("A prompt is required.");
  if (prompt.length > 8000) throw new SpecError("Prompt is too long (max 8000 characters).");

  const workflow = (asString(b.workflow) ?? "product-launch-video") as Workflow;
  if (!WORKFLOWS.includes(workflow)) {
    throw new SpecError(`Unknown workflow "${workflow}".`);
  }

  const aspect = (asString(b.aspect) ?? "9:16") as Aspect;
  if (!(aspect in ASPECTS)) throw new SpecError(`Unknown aspect "${aspect}".`);

  const seconds = Number(b.seconds ?? 25);
  if (!Number.isFinite(seconds) || seconds < 5 || seconds > 180) {
    throw new SpecError("Length must be between 5 and 180 seconds.");
  }

  const sourceUrl = asString(b.sourceUrl);
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
    throw new SpecError("Source URL must start with http:// or https://");
  }

  // An unknown provider is a typo or a stale client, not something to paper
  // over: silently falling back would produce a video sourced from somewhere
  // the user did not choose.
  const raw = (b.providers ?? {}) as Record<string, unknown>;
  for (const kind of MEDIA_KINDS) {
    const id = asString(raw[kind]);
    if (id && !findProvider(kind, id)) {
      throw new SpecError(
        `Unknown ${kind} provider "${id}". Available: ` +
          `${PROVIDERS[kind].map((p) => p.id).join(", ")}.`,
      );
    }
  }
  const voiceId = asString(raw.voiceId);
  if (voiceId && !KOKORO_VOICES.some((v) => v.id === voiceId)) {
    throw new SpecError(`Unknown voice "${voiceId}".`);
  }
  const providers: MediaProviders = resolveProviders({
    voice: asString(raw.voice),
    music: asString(raw.music),
    image: asString(raw.image),
    video: asString(raw.video),
    voiceId,
  });

  return {
    prompt,
    workflow,
    aspect,
    seconds: Math.round(seconds),
    destination: asString(b.destination) ?? "web",
    language: asString(b.language) ?? "en",
    narration: asBool(b.narration, true),
    captions: asBool(b.captions, true),
    music: asBool(b.music, true),
    audience: asString(b.audience),
    sourceUrl,
    interactive: asBool(b.interactive, config.interactiveByDefault),
    providers,
  };
}

export async function createJob(spec: VideoSpec): Promise<Job> {
  const slug = projectSlug(spec.prompt);
  const job: Job = {
    id: randomUUID(),
    slug,
    status: "queued",
    spec,
    createdAt: new Date().toISOString(),
    projectDir: path.relative(ROOT, path.join(PROJECTS_DIR, slug)),
    stages: emptyStages(),
    interactive: spec.interactive,
    version: 1,
  };
  return saveJob(job);
}

/**
 * Queue a re-render of a project, with no authoring session.
 *
 * Captions, and anything else edited directly on disk, are burned into the mp4
 * at render time — so the change is invisible until the project is rendered
 * again. This is that render: same project directory, no model, no spend, and a
 * new version so the previous cut keeps playing on its own page.
 */
export async function createRenderJob(
  parent: Job,
  reason: string,
): Promise<Job> {
  if (!parent.projectDir) {
    throw new SpecError("That job has no project directory to render.");
  }
  // Claimed for the same reason a retry is: the route's "is anything live?"
  // check is a read, and two clicks can both pass it.
  if (!(await claim(parent.id, "render"))) {
    throw new SpecError("A render of this job is already being queued.");
  }
  try {
    return await queueRender(parent, reason);
  } finally {
    await releaseClaim(parent.id, "render");
  }
}

async function queueRender(parent: Job, reason: string): Promise<Job> {
  const job: Job = {
    id: randomUUID(),
    slug: parent.slug,
    status: "queued",
    spec: parent.spec,
    createdAt: new Date().toISOString(),
    projectDir: parent.projectDir,
    stages: emptyStages(),
    kind: "render",
    renderReason: reason,
    resume: true,
    resumeOf: parent.id,
    revisionOf: parent.id,
    version: await nextVersion(parent.projectDir),
    // Not interactive by construction: there is no session to ask anything.
    interactive: false,
    answered: parent.answered,
  };
  return saveJob(job);
}

/**
 * Queue a revision of a finished job.
 *
 * The revision reuses the original project directory — that is the point: it
 * edits the composition that produced the video rather than building a new one
 * from the prompt.
 */
export async function createRevision(
  parent: Job,
  notes: RevisionNote[],
): Promise<Job> {
  if (!notes.length) throw new SpecError("Add at least one change first.");
  if (!parent.videoPath) {
    throw new SpecError("That job has no render to revise.");
  }

  const job: Job = {
    id: randomUUID(),
    slug: parent.slug,
    status: "queued",
    spec: parent.spec,
    createdAt: new Date().toISOString(),
    projectDir: parent.projectDir,
    stages: emptyStages(),
    interactive: parent.interactive,
    resume: true,
    resumeOf: parent.id,
    revisionOf: parent.id,
    version: await nextVersion(parent.projectDir),
    appliedNotes: notes,
    // Decisions already settled carry forward so a revision is not re-asked them.
    answered: parent.answered,
  };
  return saveJob(job);
}
