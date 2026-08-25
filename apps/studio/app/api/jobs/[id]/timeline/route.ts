import path from "node:path";
import { NextResponse } from "next/server";
import { ROOT, getJob, readTimeline } from "@filmwright/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The frames on the timeline, so a note can name what was on screen. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    clips: readTimeline(path.resolve(ROOT, job.projectDir)),
  });
}
