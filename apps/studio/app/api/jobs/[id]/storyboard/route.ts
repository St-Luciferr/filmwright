import { NextResponse } from "next/server";
import {
  ProjectPathRefused,
  buildStoryboard,
  getJob,
  isStale,
  projectPath,
  readManifest,
} from "@filmwright/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Capturing stills launches a browser per frame; give it room.
export const maxDuration = 600;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let projectDir: string;
  try {
    projectDir = await projectPath(job.projectDir);
  } catch (err) {
    if (err instanceof ProjectPathRefused) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
  const manifest = await readManifest(projectDir);
  return NextResponse.json({
    manifest,
    stale: isStale(projectDir, manifest),
  });
}

/** Capture (or re-capture) a still per frame. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const manifest = await buildStoryboard(await projectPath(job.projectDir), {
      force: true,
    });
    return NextResponse.json({ manifest, stale: false });
  } catch (err) {
    if (err instanceof ProjectPathRefused) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
