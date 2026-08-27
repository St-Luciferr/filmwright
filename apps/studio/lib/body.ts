/**
 * Read a JSON request body with a size ceiling.
 *
 * App Router handlers have no body limit of their own, so `request.json()`
 * buffers whatever is sent. These routes take a handful of short strings; a
 * multi-megabyte body is a mistake or an attempt to exhaust the studio's
 * memory, and either way there is nothing to gain by parsing it.
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
  // Content-Length can be absent or lie, so the text is measured as well.
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new BodyTooLarge(`Request body is too large (max ${maxBytes} bytes).`);
  }
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}
