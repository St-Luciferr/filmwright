import path from "node:path";
import { notFound } from "next/navigation";
import { ROOT, getJob, readCaptions, versionsOf } from "@filmwright/engine";
import { JobLive } from "./live";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  // Read from disk rather than from the record: captions appear partway through
  // a run, and are edited on disk by this page.
  const captions = readCaptions(path.resolve(ROOT, job.projectDir));
  return (
    <JobLive
      initial={job}
      versions={await versionsOf(job)}
      captionCount={captions?.length ?? 0}
    />
  );
}
