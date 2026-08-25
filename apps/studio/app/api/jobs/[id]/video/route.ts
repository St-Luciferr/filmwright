import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { ROOT, getJob } from "@videos/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job?.videoPath) return new Response("Not found", { status: 404 });

  // videoPath is written by the worker, but resolve-and-check anyway so a
  // corrupted job record can never read outside the repo.
  const file = path.resolve(ROOT, job.videoPath);
  if (!file.startsWith(ROOT + path.sep)) {
    return new Response("Forbidden", { status: 403 });
  }

  let size: number;
  try {
    size = (await fsp.stat(file)).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const headers = new Headers({
    "content-type": "video/mp4",
    "accept-ranges": "bytes",
    "cache-control": "no-cache",
  });
  if (url.searchParams.has("download")) {
    headers.set(
      "content-disposition",
      `attachment; filename="${job.slug}.mp4"`,
    );
  }

  // Range support is what makes scrubbing work in the <video> element.
  const range = request.headers.get("range");
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (match) {
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : size - 1;
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start > end ||
      start >= size
    ) {
      return new Response("Range not satisfiable", {
        status: 416,
        headers: { "content-range": `bytes */${size}` },
      });
    }
    const last = Math.min(end, size - 1);
    headers.set("content-range", `bytes ${start}-${last}/${size}`);
    headers.set("content-length", String(last - start + 1));
    const stream = Readable.toWeb(
      fs.createReadStream(file, { start, end: last }),
    ) as ReadableStream<Uint8Array>;
    return new Response(stream, { status: 206, headers });
  }

  headers.set("content-length", String(size));
  const stream = Readable.toWeb(
    fs.createReadStream(file),
  ) as ReadableStream<Uint8Array>;
  return new Response(stream, { status: 200, headers });
}
