"use client";

import { useEffect, useState } from "react";
import type { Job, JobEvent } from "@videos/engine/types";
import { Activity } from "./activity";
import { Decision } from "./decision";
import { Review, Versions } from "./review";
import { Storyboard } from "./storyboard";

const MARKS = { done: "✔", active: "▸", pending: "○" } as const;

const LIVE = new Set(["running", "queued"]);

export function JobLive({
  initial,
  versions,
}: {
  initial: Job;
  versions: Job[];
}) {
  const [job, setJob] = useState(initial);

  // A server re-render (navigation, router.refresh) delivers a fresh record;
  // without this the state seeded at mount would silently win.
  useEffect(() => {
    setJob(initial);
  }, [initial]);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const isLive = LIVE.has(job.status);
  const parked = job.status === "awaiting-input";

  useEffect(() => {
    // Poll while live or parked: a parked job becomes live again the moment the
    // answer re-queues it, and the page should follow that without a reload.
    if (!isLive && !parked) {
      fetch(`/api/jobs/${initial.id}/events?once=1`)
        .then((r) => r.json())
        .then((d) => {
          setEvents(d.events ?? []);
          if (d.job) setJob(d.job);
        })
        .catch(() => {});
      return;
    }

    const source = new EventSource(`/api/jobs/${initial.id}/events`);
    source.onmessage = (message) => {
      const payload = JSON.parse(message.data) as {
        job?: Job;
        events?: JobEvent[];
      };
      if (payload.job) setJob(payload.job);
      if (payload.events?.length) {
        setEvents((prev) => [...prev, ...payload.events!]);
      }
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [initial.id, isLive, parked]);

  async function cancel() {
    await fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" });
  }

  return (
    <>
      <div className="job-head">
        <span className={`badge ${job.status}`}>
          {isLive && <i className="dot" />}
          {job.status === "imported"
            ? "example"
            : job.status === "awaiting-input"
              ? "needs you"
              : job.status}
        </span>
        <strong className="job-slug">{job.slug}</strong>
        {(job.version ?? 1) > 1 && (
          <span className="chip subtle">v{job.version}</span>
        )}
        {job.interactive && <span className="chip subtle">interactive</span>}
        <div className="head-actions">
          {isLive && (
            <button className="ghost" onClick={cancel}>
              Cancel
            </button>
          )}
          {job.videoPath && (
            <a className="ghost" href={`/api/jobs/${job.id}/video?download=1`}>
              Download mp4
            </a>
          )}
        </div>
      </div>

      {job.pending && (
        <Decision jobId={job.id} interaction={job.pending} parked={parked} />
      )}

      {job.error && <div className="err-box">{job.error}</div>}

      <div className="detail">
        <div className="col">
          <div className="panel">
            <h2 className="section" style={{ margin: "0 0 10px" }}>
              Pipeline
            </h2>
            <ul className="stages">
              {job.stages.map((s) => (
                <li key={s.stage} className={s.status}>
                  <span className="mark">{MARKS[s.status]}</span>
                  <span>{s.stage}</span>
                  {s.detail && <span className="detail-text">{s.detail}</span>}
                </li>
              ))}
            </ul>
          </div>

          <div className="panel">
            <h2 className="section" style={{ margin: "0 0 10px" }}>
              Spec
            </h2>
            <dl className="meta">
              <dt>workflow</dt>
              <dd>{job.spec.workflow}</dd>
              <dt>aspect</dt>
              <dd>{job.spec.aspect}</dd>
              <dt>length</dt>
              <dd>{job.spec.seconds}s</dd>
              <dt>audio</dt>
              <dd>
                {[
                  job.spec.narration && "vo",
                  job.spec.music && "bgm",
                  job.spec.captions && "captions",
                ]
                  .filter(Boolean)
                  .join(" · ") || "none"}
              </dd>
              <dt>project</dt>
              <dd>{job.projectDir}</dd>
              {job.costUsd !== undefined && (
                <>
                  <dt>cost</dt>
                  <dd>${job.costUsd.toFixed(2)}</dd>
                </>
              )}
            </dl>
          </div>

          <Versions versions={versions} current={job.id} />

          {!!job.answered?.length && (
            <div className="panel">
              <h2 className="section" style={{ margin: "0 0 10px" }}>
                Decisions
              </h2>
              <ul className="decided">
                {job.answered.map(({ interaction, answer }, i) => (
                  <li key={i}>
                    {interaction.kind === "question" ? (
                      <>
                        <span className="d-q">
                          {interaction.questions?.[0]?.header}
                        </span>
                        <span className="d-a">{answer.answers?.[0]}</span>
                      </>
                    ) : (
                      <>
                        <span className="d-q">{interaction.stage}</span>
                        <span className="d-a">
                          {answer.decision === "revise" ? "revised" : "approved"}
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="col">
          {job.videoPath &&
            (job.status === "succeeded" || job.status === "imported" ? (
              <Review job={job} onJob={setJob} />
            ) : (
              <video
                className="player"
                src={`/api/jobs/${job.id}/video`}
                controls
                playsInline
              />
            ))}
          {!job.pending && job.stages.some((s) => s.stage === "frames" && s.status === "done") && (
            <Storyboard jobId={job.id} manifest={null} allowCapture />
          )}

          <Activity
            jobId={job.id}
            events={events}
            live={isLive}
            canSteer={job.status === "running"}
          />
        </div>
      </div>
    </>
  );
}
