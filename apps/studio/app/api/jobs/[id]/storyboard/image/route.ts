import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { ROOT, getJob } from "@filmwright/engine";

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

  const projectDir = path.resolve(ROOT, job.projectDir);
  const file = path.resolve(projectDir, rel);
  // Confine to the project's own storyboard directory.
  if (!file.startsWith(path.join(projectDir, "storyboard") + path.sep)) {
    return new Response("Forbidden", { status: 403 });
  }

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
