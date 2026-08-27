import { NextResponse } from "next/server";
import {
  CaptionError,
  ProjectPathRefused,
  getJob,
  jobsInProject,
  projectPath,
  readCaptions,
  updateCaptions,
  type CaptionEdit,
} from "@filmwright/engine";
import { BodyTooLarge, readJson } from "@/lib/body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A run that owns the project directory must not have it edited underneath it. */
const LIVE = new Set(["queued", "running", "awaiting-input"]);

async function liveRun(projectDir: string) {
  return (await jobsInProject(projectDir)).find((j) => LIVE.has(j.status));
}

/** The caption cues currently burned into this project's composition. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let dir: string;
  try {
    dir = projectPath(job.projectDir);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bad project path." },
      { status: 409 },
    );
  }

  const cues = readCaptions(dir);
  if (!cues) {
    return NextResponse.json({
      cues: [],
      editable: false,
      reason:
        "This project has no caption track — nothing was generated, or the run " +
        "has not reached captions yet.",
    });
  }
  const live = await liveRun(job.projectDir);
  return NextResponse.json({
    cues: cues.map((c) => ({ id: c.id, start: c.start, end: c.end, text: c.text })),
    editable: !live,
    reason: live
      ? `A run in this project is ${live.status}. Editing captions now would be overwritten.`
      : undefined,
  });
}

/**
 * Rewrite cue text.
 *
 * Only the text changes: cue boundaries stay where they are, so an edit cannot
 * disturb the cues around it, and the voiceover is untouched — the narration
 * still says what it said.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const live = await liveRun(job.projectDir);
  if (live) {
    return NextResponse.json(
      {
        error: `A run in this project is ${live.status}. Wait for it to finish — it may rewrite the captions itself.`,
      },
      { status: 409 },
    );
  }

  let body: { edits?: unknown };
  try {
    body = await readJson(request);
  } catch (err) {
    if (err instanceof BodyTooLarge) {
      return NextResponse.json({ error: err.message }, { status: 413 });
    }
    throw err;
  }
  if (!Array.isArray(body.edits) || !body.edits.length) {
    return NextResponse.json({ error: "No edits given." }, { status: 400 });
  }
  // A composition has tens of cues, not thousands. A list this long is not a
  // caption edit.
  if (body.edits.length > 1000) {
    return NextResponse.json(
      { error: "Too many edits in one request (max 1000)." },
      { status: 400 },
    );
  }

  const edits: CaptionEdit[] = [];
  for (const raw of body.edits) {
    const edit = (raw ?? {}) as Record<string, unknown>;
    if (typeof edit.id !== "string" || typeof edit.text !== "string") {
      return NextResponse.json(
        { error: "Each edit needs an `id` and a `text`." },
        { status: 400 },
      );
    }
    if (!edit.text.trim()) {
      return NextResponse.json(
        { error: "A caption cannot be emptied. Edit the wording instead." },
        { status: 400 },
      );
    }
    if (edit.text.length > 300) {
      return NextResponse.json(
        { error: "That caption is too long to fit on screen (max 300 characters)." },
        { status: 400 },
      );
    }
    // The cues are written into a `<script>` block. `captions.ts` escapes them
    // so markup cannot break out; refusing angle brackets here as well means a
    // caption never *tries* to, and `<` has no business on screen in a subtitle.
    if (/[<>]/.test(edit.text)) {
      return NextResponse.json(
        { error: "Captions cannot contain < or >." },
        { status: 400 },
      );
    }
    edits.push({ id: edit.id, text: edit.text });
  }

  try {
    const { updated, cues } = await updateCaptions(projectPath(job.projectDir), edits);
    return NextResponse.json({
      updated,
      cues: cues.map((c) => ({ id: c.id, start: c.start, end: c.end, text: c.text })),
    });
  } catch (err) {
    if (err instanceof CaptionError || err instanceof ProjectPathRefused) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the captions." },
      { status: 500 },
    );
  }
}
