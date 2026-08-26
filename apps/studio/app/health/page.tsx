import type { Metadata } from "next";
import { HealthView } from "./health-view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Health" };

export default function HealthPage() {
  return <HealthView />;
}
