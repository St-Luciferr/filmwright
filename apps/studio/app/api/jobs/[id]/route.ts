import { NextResponse } from "next/server";
import { DeleteRefused, deleteJob, getJob } from "@filmwright/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(job);
}

/** Remove one version's record. The project's files are left on disk. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await deleteJob(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // A refusal is a rule the caller broke (a live run), not a server fault.
    if (err instanceof DeleteRefused) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete that." },
      { status: 500 },
    );
  }
}
