import { NextResponse } from "next/server";
import {
  getJob,
  recordAnswered,
  updateJob,
  writeAnswer,
  type InteractionAnswer,
} from "@filmwright/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!job.pending) {
    return NextResponse.json(
      { error: "This job is not waiting on anything." },
      { status: 409 },
    );
  }

  const body = (await request.json()) as Partial<InteractionAnswer>;
  const answer: InteractionAnswer = {
    id: job.pending.id,
    answeredAt: new Date().toISOString(),
    answers: Array.isArray(body.answers)
      ? body.answers.map((a) => String(a))
      : undefined,
    decision: body.decision === "revise" ? "revise" : body.decision === "approve" ? "approve" : undefined,
    notes: typeof body.notes === "string" ? body.notes : undefined,
  };

  // The running worker polls for this file and picks the answer up in-session.
  await writeAnswer(id, answer);

  // A parked job has no live session, so record the answer here and put it back
  // on the queue as a resumed run.
  if (job.status === "awaiting-input") {
    const pending = job.pending;
    await recordAnswered(id, pending, answer);
    await updateJob(id, (j) => {
      j.status = "queued";
      j.resume = true;
      j.error = undefined;
      j.finishedAt = undefined;
    });
    return NextResponse.json({ ok: true, requeued: true });
  }

  return NextResponse.json({ ok: true, requeued: false });
}
