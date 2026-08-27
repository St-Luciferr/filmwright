import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { BodyTooLarge, readJson } from "@/lib/body";
import {
  ProjectPathRefused,
  addNote,
  clipAt,
  getJob,
  projectPath,
  readTimeline,
  removeNote,
  type RevisionNote,
} from "@filmwright/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { text?: unknown; timeSec?: unknown };
  try {
    body = await readJson(request, 16_000);
  } catch (err) {
    if (err instanceof BodyTooLarge) {
      return NextResponse.json({ error: err.message }, { status: 413 });
    }
    throw err;
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Empty note." }, { status: 400 });
  if (text.length > 2000) {
    return NextResponse.json({ error: "Note is too long." }, { status: 400 });
  }

  const timeSec =
    typeof body.timeSec === "number" && Number.isFinite(body.timeSec) && body.timeSec >= 0
      ? Math.round(body.timeSec * 10) / 10
      : undefined;

  // Resolve the frame now, while we know what the player was showing. A bad
  // project path only means we cannot name the frame; the note itself still
  // stands, so this degrades to "no clip" rather than refusing the note.
  let clipId: string | undefined;
  if (timeSec !== undefined) {
    try {
      clipId = clipAt(readTimeline(await projectPath(job.projectDir)), timeSec)?.id;
    } catch (err) {
      if (!(err instanceof ProjectPathRefused)) throw err;
    }
  }

  const note: RevisionNote = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    timeSec,
    clipId,
    text,
  };
  return NextResponse.json(await addNote(id, note));
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const noteId = new URL(request.url).searchParams.get("note");
  if (!noteId) {
    return NextResponse.json({ error: "Missing note id" }, { status: 400 });
  }
  const updated = await removeNote(id, noteId);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}
