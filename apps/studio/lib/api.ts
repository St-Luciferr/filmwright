/**
 * Talk to the studio's own API from the browser.
 *
 * Every route under `app/api` answers with JSON, so a body that is *not* JSON
 * means the request never reached one. Next's HTML 404 page is the usual
 * culprit: in dev the route table occasionally goes stale and stops matching
 * files that are plainly on disk, and the studio then posts an answer into a
 * page of markup. Handing that to `res.json()` raises
 *
 *     Unexpected token '<', "<!DOCTYPE "... is not valid JSON
 *
 * which is the sentence the operator reads instead of anything they can act on.
 * Every browser-side fetch goes through here so the failure is named, and so a
 * 404 says which route went missing and what to do about it.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiInit = RequestInit & {
  /** Shown when the server fails without naming a reason of its own. */
  fallback?: string;
};

const JSON_TYPE = /\bjson\b/i;

function notJson(res: Response, url: string): string {
  if (res.status === 404) {
    return (
      `The studio has no route at ${url} — it answered with an HTML 404 page. ` +
      "Restart the dev server (npm run dev): Next can stop matching API routes " +
      "that are still on disk."
    );
  }
  return (
    `The studio answered ${res.status} with an HTML page instead of JSON at ` +
    `${url}. The dev server's terminal has the real error.`
  );
}

/** Fetch and parse a studio API response, or throw an `ApiError` saying why not. */
export async function api<T>(url: string, init: ApiInit = {}): Promise<T> {
  const { fallback, ...request } = init;

  let res: Response;
  try {
    res = await fetch(url, request);
  } catch (err) {
    // Nothing answered at all: the studio was stopped, or the browser refused
    // to send the request.
    throw new ApiError(
      `Could not reach the studio at ${url} — is it still running? ` +
        `(${err instanceof Error ? err.message : String(err)})`,
      0,
    );
  }

  // Read as text first. `res.json()` on a page of HTML throws a parser error
  // that names the markup rather than the request.
  const text = await res.text();

  if (!JSON_TYPE.test(res.headers.get("content-type") ?? "")) {
    // A successful empty body is a legitimate "nothing to say" (204, HEAD).
    if (res.ok && !text.trim()) return {} as T;
    throw new ApiError(notJson(res, url), res.status);
  }

  let data: unknown;
  try {
    data = text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(
      `The studio sent a malformed reply from ${url}.`,
      res.status,
    );
  }

  if (!res.ok) {
    const named = (data as { error?: unknown } | null)?.error;
    throw new ApiError(
      typeof named === "string" && named.trim()
        ? named
        : (fallback ?? `The studio refused that (${res.status}).`),
      res.status,
    );
  }

  return data as T;
}

/** POST a JSON body. The studio's mutations all take one, even if it is empty. */
export function postJson<T>(
  url: string,
  body?: unknown,
  fallback?: string,
): Promise<T> {
  return api<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    fallback,
  });
}
