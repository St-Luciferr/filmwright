import { NextResponse, type NextRequest } from "next/server";

/**
 * Refuse cross-site state changes.
 *
 * The studio is unauthenticated by design, which is defensible on a single
 * operator's machine — but it also means any page in that operator's browser
 * could POST to it. `POST /api/jobs` starts a run against the spend ceiling,
 * and the retry and render routes now do too, so a page on the open web could
 * quietly spend the operator's money by knowing nothing but the port.
 *
 * The check is the browser's own account of where the request came from, which
 * a page cannot forge:
 *
 * - `Sec-Fetch-Site` is attached by browsers and stripped by nobody. Only
 *   `same-origin` and `none` (typed in the address bar) are state-changing
 *   requests this app should honour.
 * - Failing that, `Origin` must match the host it was sent to.
 * - Neither header at all means it is not a browser — curl, a script, the
 *   `requeue` CLI — which is left alone, because those are the operator's own
 *   tools and blocking them would break the documented workflows.
 */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function middleware(request: NextRequest) {
  if (!MUTATING.has(request.method)) return NextResponse.next();

  const site = request.headers.get("sec-fetch-site");
  if (site) {
    if (site === "same-origin" || site === "none") return NextResponse.next();
    return refuse(`a ${site} request`);
  }

  const origin = request.headers.get("origin");
  if (!origin) return NextResponse.next();
  try {
    if (new URL(origin).host === request.headers.get("host")) {
      return NextResponse.next();
    }
  } catch {
    // An unparseable Origin is not one we can vouch for.
  }
  return refuse(`a request from ${origin}`);
}

function refuse(what: string) {
  return NextResponse.json(
    {
      error:
        `Refused ${what}. The studio only accepts changes from its own pages — ` +
        "see docs/operations/security.md.",
    },
    { status: 403 },
  );
}

export const config = {
  // Pages are read-only; everything that changes state is under /api.
  matcher: "/api/:path*",
};
