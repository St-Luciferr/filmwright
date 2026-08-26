import { config } from "@filmwright/engine";
import type { Metadata } from "next";
import { NewVideoForm } from "./new-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "New video" };

export default function NewVideoPage() {
  return (
    <NewVideoForm
      maxBudgetUsd={config.maxBudgetUsd}
      interactiveDefault={config.interactiveByDefault}
    />
  );
}
