import { notFound } from "next/navigation";
import { getJob, versionsOf } from "@filmwright/engine";
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
  return <JobLive initial={job} versions={await versionsOf(job)} />;
}
