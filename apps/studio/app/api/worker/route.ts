import { NextResponse } from "next/server";
import { readWorkerStatus } from "@filmwright/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readWorkerStatus());
}
