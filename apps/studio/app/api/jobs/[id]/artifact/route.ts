import fsp from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { ROOT, getJob } from "@filmwright/engine";

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

  const projectDir = path.resolve(ROOT, job.projectDir);
  const file = path.resolve(projectDir, rel);
  // Confine reads to the job's own project directory.
  if (!file.startsWith(projectDir + path.sep)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
