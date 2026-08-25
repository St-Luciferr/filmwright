import { NextResponse } from "next/server";
import { getJob, pushSteer } from "@videos/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.status !== "running") {
    return NextResponse.json(
      { error: "Notes can only be sent to a running job." },
      { status: 409 },
    );
  }

  const { text } = (await request.json()) as { text?: unknown };
  const note = typeof text === "string" ? text.trim() : "";
  if (!note) return NextResponse.json({ error: "Empty note." }, { status: 400 });
  if (note.length > 2000) {
    return NextResponse.json({ error: "Note is too long." }, { status: 400 });
  }

  await pushSteer(id, note);
  return NextResponse.json({ ok: true });
}
