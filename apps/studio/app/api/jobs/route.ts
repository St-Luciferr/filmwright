import { NextResponse } from "next/server";
import { SpecError, createJob, listJobs, parseSpec } from "@filmwright/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ jobs: await listJobs() });
}

export async function POST(request: Request) {
  try {
    const spec = parseSpec(await request.json());
    const job = await createJob(spec);
    return NextResponse.json(job, { status: 201 });
  } catch (err) {
    if (err instanceof SpecError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bad request" },
      { status: 400 },
    );
  }
}
