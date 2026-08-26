import { NextResponse } from "next/server";
import { DeleteRefused, deleteProject } from "@filmwright/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Delete a whole project — every version's record, and optionally the
 * generated files.
 *
 * `?files=1` is the destructive half and is never the default: it removes
 * `projects/<slug>/`, which for an adopted example is hand-authored work this
 * platform never produced and cannot regenerate.
 */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const dir = url.searchParams.get("dir");
  if (!dir) {
    return NextResponse.json({ error: "A project directory is required." }, { status: 400 });
  }

  try {
    const result = await deleteProject(dir, {
      removeFiles: url.searchParams.get("files") === "1",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof DeleteRefused) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete that." },
      { status: 500 },
    );
  }
}
