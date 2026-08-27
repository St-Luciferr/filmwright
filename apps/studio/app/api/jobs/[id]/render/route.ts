import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  ROOT,
  SpecError,
  createRenderJob,
  getJob,
  jobsInProject,
} from "@filmwright/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIVE = new Set(["queued", "running", "awaiting-input"]);

/**
 * Queue a re-render of this job's project — no agent session, no model spend.
 *
 * This is what makes an on-disk edit (a fixed caption, a hand-tweaked frame)
 * show up in the video: captions and everything else are burned in at render
 * time, so the mp4 does not change until the project is rendered again.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!fs.existsSync(path.resolve(ROOT, job.projectDir))) {
    return NextResponse.json(
      { error: `${job.projectDir} no longer exists, so there is nothing to render.` },
      { status: 409 },
    );
  }

  const live = (await jobsInProject(job.projectDir)).find((j) => LIVE.has(j.status));
  if (live) {
    return NextResponse.json(
      {
        error:
          live.kind === "render"
            ? "This project is already re-rendering."
            : `A run in this project is ${live.status}. Wait for it to finish.`,
      },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 120)
      : "re-render";

  try {
    return NextResponse.json(await createRenderJob(job, reason), { status: 201 });
  } catch (err) {
    if (err instanceof SpecError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not queue a render." },
      { status: 500 },
    );
  }
}
