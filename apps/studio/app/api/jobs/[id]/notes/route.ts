import { randomUUID } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  ROOT,
  addNote,
  clipAt,
  getJob,
  readTimeline,
  removeNote,
  type RevisionNote,
} from "@videos/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json()) as { text?: unknown; timeSec?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Empty note." }, { status: 400 });
  if (text.length > 2000) {
    return NextResponse.json({ error: "Note is too long." }, { status: 400 });
  }

  const timeSec =
    typeof body.timeSec === "number" && Number.isFinite(body.timeSec) && body.timeSec >= 0
      ? Math.round(body.timeSec * 10) / 10
      : undefined;

  // Resolve the frame now, while we know what the player was showing.
  const clipId =
    timeSec === undefined
      ? undefined
      : clipAt(readTimeline(path.resolve(ROOT, job.projectDir)), timeSec)?.id;

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
