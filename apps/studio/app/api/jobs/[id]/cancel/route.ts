import { NextResponse } from "next/server";
import { getJob, requestCancel, updateJob } from "@videos/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (job.status === "queued") {
    // Never claimed, so there is no worker to signal — retire it directly.
    const updated = await updateJob(id, (j) => {
      j.status = "cancelled";
      j.finishedAt = new Date().toISOString();
    });
    return NextResponse.json(updated);
  }

  if (job.status === "running") {
    await requestCancel(id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: `Job is ${job.status} and cannot be cancelled.` },
    { status: 409 },
  );
}
