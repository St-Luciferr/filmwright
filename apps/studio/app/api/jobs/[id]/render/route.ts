import fs from "node:fs";
import { NextResponse } from "next/server";
import {
  ProjectPathRefused,
  SpecError,
  createRenderJob,
  getJob,
  jobsInProject,
  projectPath,
} from "@filmwright/engine";
import { BodyTooLarge, readJson } from "@/lib/body";

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

  // An adopted example is hand-authored work this platform never produced.
  // Re-rendering one archives its mp4 and replaces it with whatever the CLI
  // makes of a composition nobody here wrote — the same reason `deleteProject`
  // guards their files and `retryAvailability` refuses to re-run them.
  if (job.status === "imported") {
    return NextResponse.json(
      {
        error:
          "This project was adopted rather than generated here, so it is not " +
          "re-rendered from the studio. Render it yourself in its directory if " +
          "that is what you want.",
      },
      { status: 409 },
    );
  }

  let dir: string;
  try {
    dir = await projectPath(job.projectDir);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bad project path." },
      { status: 409 },
    );
  }
  if (!fs.existsSync(dir)) {
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

  let body: { reason?: unknown };
  try {
    body = await readJson(request, 16_000);
  } catch (err) {
    if (err instanceof BodyTooLarge) {
      return NextResponse.json({ error: err.message }, { status: 413 });
    }
    throw err;
  }
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 120)
      : "re-render";

  try {
    return NextResponse.json(await createRenderJob(job, reason), { status: 201 });
  } catch (err) {
    if (err instanceof SpecError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof ProjectPathRefused) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not queue a render." },
      { status: 500 },
    );
  }
}
