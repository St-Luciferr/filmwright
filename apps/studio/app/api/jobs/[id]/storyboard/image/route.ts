import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { confinedPath, getJob, projectPath } from "@filmwright/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return new Response("Not found", { status: 404 });

  const rel = new URL(request.url).searchParams.get("file");
  if (!rel) return new Response("Missing file", { status: 400 });

  // Confine to the project's own storyboard directory, symlinks included.
  let projectDir: string;
  try {
    projectDir = await projectPath(job.projectDir);
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  const confined = await confinedPath(path.join(projectDir, "storyboard"), rel);
  if (!confined.ok) {
    return new Response(confined.reason === "outside" ? "Forbidden" : "Not found", {
      status: confined.reason === "outside" ? 403 : 404,
    });
  }
  const file = confined.file;

  let size: number;
  try {
    size = (await fsp.stat(file)).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return new Response(
    Readable.toWeb(fs.createReadStream(file)) as ReadableStream<Uint8Array>,
    {
      headers: {
        "content-type": file.endsWith(".jpg") ? "image/jpeg" : "image/png",
        "content-length": String(size),
        // Stills are replaced wholesale on re-capture, so a short cache is safe.
        "cache-control": "private, max-age=30",
      },
    },
  );
}
