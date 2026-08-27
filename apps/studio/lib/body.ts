/**
 * Read a JSON request body with a size ceiling.
 *
 * App Router handlers have no body limit of their own, so `request.json()`
 * buffers whatever is sent. These routes take a handful of short strings; a
 * multi-megabyte body is a mistake or an attempt to exhaust the studio's
 * memory.
 *
 * The body is read as a stream and abandoned the moment it goes over, rather
 * than buffered and then measured — measuring afterwards rejects the request
 * but has already spent the memory the cap exists to protect.
 */
export class BodyTooLarge extends Error {}

export async function readJson<T>(
  request: Request,
  maxBytes = 256_000,
): Promise<T> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new BodyTooLarge(`Request body is too large (max ${maxBytes} bytes).`);
  }

  const body = request.body;
  if (!body) return {} as T;

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      // Content-Length can be absent or lie, so the running total decides.
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new BodyTooLarge(`Request body is too large (max ${maxBytes} bytes).`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {} as T;
  try {
    const parsed = JSON.parse(text) as unknown;
    // `null`, `7` and `"x"` are valid JSON but not bodies these routes can read;
    // handing one back would have the caller dereference it and 500.
    if (parsed === null || typeof parsed !== "object") return {} as T;
    return parsed as T;
  } catch {
    return {} as T;
  }
}
