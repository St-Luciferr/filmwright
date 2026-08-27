import { NextResponse } from "next/server";
import { ProjectPathRefused, getJob, projectPath, readTimeline } from "@filmwright/engine";

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
  try {
    return NextResponse.json({ clips: readTimeline(await projectPath(job.projectDir)) });
  } catch (err) {
    if (err instanceof ProjectPathRefused) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
