import path from "node:path";
import { NextResponse } from "next/server";
import { ROOT, buildStoryboard, getJob, isStale, readManifest } from "@videos/engine";

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

  const projectDir = path.resolve(ROOT, job.projectDir);
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
    const manifest = await buildStoryboard(path.resolve(ROOT, job.projectDir), {
      force: true,
    });
    return NextResponse.json({ manifest, stale: false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
