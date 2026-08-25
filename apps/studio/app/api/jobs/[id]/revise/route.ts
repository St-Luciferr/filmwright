import { NextResponse } from "next/server";
import { SpecError, createRevision, getJob, updateJob } from "@videos/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const notes = job.notes ?? [];
  try {
    const revision = await createRevision(job, notes);
    // The notes have been handed to the revision; clear them so the parent page
    // does not look like it still has unsent feedback.
    await updateJob(id, (parent) => {
      parent.notes = [];
    });
    return NextResponse.json(revision, { status: 201 });
  } catch (err) {
    if (err instanceof SpecError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
