import { NextResponse } from "next/server";
import {
  RetryRefused,
  getJob,
  retryAvailability,
  retryJob,
  type RetryMode,
} from "@filmwright/engine";
import { BodyTooLarge, readJson } from "@/lib/body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What can be done with this run.
 *
 * Whether it can be continued depends on the filesystem, not on the record, so
 * the client asks rather than infers — a project directory deleted since the
 * page loaded must not be offered as something to continue.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await retryAvailability(job));
}

/** Queue another attempt: `resume` continues the work on disk, `fresh` starts over. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { mode?: string };
  try {
    body = await readJson(request, 16_000);
  } catch (err) {
    if (err instanceof BodyTooLarge) {
      return NextResponse.json({ error: err.message }, { status: 413 });
    }
    throw err;
  }
  if (body.mode && body.mode !== "resume" && body.mode !== "fresh") {
    return NextResponse.json(
      { error: `Unknown retry mode "${body.mode}". Use "resume" or "fresh".` },
      { status: 400 },
    );
  }

  // No mode named means "do the sensible thing": continue when there is work
  // on disk, start over when there is not.
  const mode: RetryMode =
    (body.mode as RetryMode | undefined) ?? (await retryAvailability(job)).recommended;

  try {
    return NextResponse.json(await retryJob(job, mode), { status: 201 });
  } catch (err) {
    // A refusal is a rule the caller broke, not a server fault.
    if (err instanceof RetryRefused) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not queue another attempt.",
      },
      { status: 500 },
    );
  }
}
