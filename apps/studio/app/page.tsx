import { listJobs } from "@videos/engine";
import type { Job } from "@videos/engine/types";
import { NewVideo } from "./new-video";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function StatusBadge({ status }: { status: Job["status"] }) {
  const label = status === "imported" ? "example" : status;
  return (
    <span className={`badge ${status}`}>
      {(status === "running" || status === "queued") && <i className="dot" />}
      {label}
    </span>
  );
}

function JobCard({ job }: { job: Job }) {
  return (
    <a className="job-card" href={`/jobs/${job.id}`}>
      <div className="thumb">
        {job.videoPath ? (
          <video
            src={`/api/jobs/${job.id}/video`}
            preload="metadata"
            muted
            playsInline
          />
        ) : (
          <span>{job.spec.aspect}</span>
        )}
      </div>
      <div className="body">
        <div className="slug">{job.slug}</div>
        <div className="prompt">{job.spec.prompt}</div>
        <StatusBadge status={job.status} />
      </div>
    </a>
  );
}

export default async function Home() {
  const jobs = await listJobs();

  return (
    <>
      <NewVideo />

      <h2 className="section">Library · {jobs.length}</h2>
      {jobs.length === 0 ? (
        <p className="empty">
          Nothing yet. Describe a video above and the worker will build it.
        </p>
      ) : (
        <div className="jobs">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </>
  );
}
