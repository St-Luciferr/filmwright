import fsp from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { ROOT, confinedPath, getJob } from "@filmwright/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serve a text artifact from inside the job's project directory, for review. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rel = new URL(request.url).searchParams.get("path");
  if (!rel) return NextResponse.json({ error: "Missing path" }, { status: 400 });

  // Confine reads to the job's own project directory, symlinks included: the
  // agent writes freely in there, and a link pointing outward would otherwise
  // be followed.
  const projectDir = path.resolve(ROOT, job.projectDir);
  const confined = await confinedPath(projectDir, rel);
  if (!confined.ok) {
    return confined.reason === "outside"
      ? NextResponse.json({ error: "Forbidden" }, { status: 403 })
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const file = confined.file;

  try {
    const stat = await fsp.stat(file);
    if (stat.size > 512_000) {
      return NextResponse.json({ error: "File too large to preview" }, { status: 413 });
    }
    return NextResponse.json({ path: rel, text: await fsp.readFile(file, "utf8") });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
