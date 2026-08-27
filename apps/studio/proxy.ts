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

/**
 * Hosts this server will answer as.
 *
 * Checked on **every** API request, not just mutating ones, and this is the
 * control that actually holds. `Origin`-versus-`Host` alone is defeated by DNS
 * rebinding: the attacker's page is served from a name that then re-resolves to
 * 127.0.0.1, so every request it makes is genuinely same-origin and every
 * header tells the truth. Pinning the names this server accepts is what breaks
 * that chain — a rebound request arrives with the attacker's hostname in Host.
 */
function allowedHosts(): Set<string> {
  const hosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  const configured = process.env.HOST;
  if (configured && !/^(0\.0\.0\.0|::|\[::\])$/.test(configured)) hosts.add(configured);
  for (const extra of (process.env.FILMWRIGHT_ALLOWED_HOSTS ?? "").split(",")) {
    if (extra.trim()) hosts.add(extra.trim());
  }
  return hosts;
}

/** `host` carries the port; compare on the name alone. */
function hostname(host: string | null): string | null {
  if (!host) return null;
  const match = host.match(/^(\[[^\]]+\]|[^:]+)(?::\d+)?$/);
  return match ? match[1]!.toLowerCase() : null;
}

export function proxy(request: NextRequest) {
  const host = hostname(request.headers.get("host"));
  if (!host || !allowedHosts().has(host)) {
    return refuse(
      `a request addressed to "${request.headers.get("host") ?? "no host"}"`,
      "The studio answers as localhost only. Add FILMWRIGHT_ALLOWED_HOSTS to " +
        "reach it under another name.",
    );
  }

  if (!MUTATING.has(request.method)) return NextResponse.next();

  const site = request.headers.get("sec-fetch-site");
  if (site !== null) {
    // An empty value is not a browser's doing; treat anything unrecognised as
    // cross-site rather than as absent.
    if (site === "same-origin" || site === "none") return NextResponse.next();
    return refuse(`a ${site || "header-stripped"} request`);
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

function refuse(what: string, detail?: string) {
  return NextResponse.json(
    {
      error:
        `Refused ${what}. ${detail ?? "The studio only accepts changes from its own pages."} ` +
        "See docs/operations/security.md.",
    },
    { status: 403 },
  );
}

export const config = {
  // Every API request, not only the mutating ones: a rebound page reading the
  // job list learns prompts, paths and spend, and that is worth refusing too.
  matcher: "/api/:path*",
};
