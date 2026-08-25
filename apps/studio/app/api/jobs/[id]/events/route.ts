import { getJob, readEvents } from "@videos/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TERMINAL = new Set(["succeeded", "failed", "cancelled", "imported"]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return new Response("Not found", { status: 404 });

  // One-shot mode: the whole history, for a job that is already finished.
  if (new URL(request.url).searchParams.has("once")) {
    const { events } = await readEvents(id);
    return Response.json({ job, events });
  }

  const encoder = new TextEncoder();
  let cursor = 0;
  let timer: NodeJS.Timeout | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        timer = undefined;
        try {
          controller.close();
        } catch {
          // Already closed by the client disconnecting.
        }
      };

      const send = (payload: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };

      const tick = async () => {
        try {
          const current = await getJob(id);
          if (!current) return close();
          const { events, nextByte } = await readEvents(id, cursor);
          cursor = nextByte;
          send({ job: current, events });
          // Send the terminal state before hanging up, so the client's last
          // frame is the finished job rather than the one before it.
          if (TERMINAL.has(current.status)) close();
        } catch {
          close();
        }
      };

      request.signal.addEventListener("abort", close);
      await tick();
      if (closed) return;
      timer = setInterval(() => void tick(), 1000);
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Nginx and friends buffer SSE into uselessness without this.
      "x-accel-buffering": "no",
    },
  });
}
