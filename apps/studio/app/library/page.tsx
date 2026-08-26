import { listJobs } from "@filmwright/engine";
import type { Metadata } from "next";
import { Film, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { LibraryView } from "./library-view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Library" };

export default async function LibraryPage() {
  const jobs = await listJobs();

  if (!jobs.length) {
    return (
      <EmptyState
        icon={Film}
        title="The library is empty"
        description="Every video you generate lands here, alongside any HyperFrames projects adopted with `npm run seed`."
        action={
          <Button asChild variant="primary">
            <Link href="/new">
              <Plus />
              New video
            </Link>
          </Button>
        }
      />
    );
  }

  return <LibraryView jobs={jobs} />;
}
