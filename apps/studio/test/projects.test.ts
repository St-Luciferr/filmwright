import { describe, expect, it } from "vitest";
import type { Job } from "@filmwright/engine/types";
import { groupByProject } from "@/lib/projects";

let n = 0;
function job(over: Partial<Job>): Job {
  return {
    id: `job-${++n}`,
    slug: "s",
    status: "succeeded",
    spec: {
      prompt: "p",
      workflow: "product-launch-video",
      aspect: "9:16",
      seconds: 25,
      destination: "web",
      language: "en",
      narration: true,
      captions: true,
      music: true,
    },
    createdAt: "2026-08-20T10:00:00Z",
    projectDir: "projects/s",
    stages: [],
    ...over,
  };
}

describe("groupByProject", () => {
  it("collapses runs that share a directory into one project", () => {
    const projects = groupByProject([
      job({ projectDir: "projects/a", finishedAt: "2026-08-20T11:00:00Z" }),
      job({ projectDir: "projects/a", status: "failed", finishedAt: "2026-08-21T11:00:00Z" }),
      job({ projectDir: "projects/b", finishedAt: "2026-08-19T11:00:00Z" }),
    ]);
    expect(projects).toHaveLength(2);
    expect(projects.map((p) => p.dir)).toEqual(["projects/a", "projects/b"]);
    expect(projects[0]!.versions).toHaveLength(2);
  });

  it("shows the newest render as head even when the latest run failed", () => {
    const rendered = job({
      projectDir: "projects/a",
      videoPath: "projects/a/renders/v1.mp4",
      finishedAt: "2026-08-20T11:00:00Z",
    });
    const failed = job({
      projectDir: "projects/a",
      status: "failed",
      finishedAt: "2026-08-21T11:00:00Z",
    });
    const [project] = groupByProject([rendered, failed]);
    expect(project!.latest.id).toBe(failed.id);
    expect(project!.head.id).toBe(rendered.id);
    expect(project!.renderCount).toBe(1);
    expect(project!.updatedAt).toBe("2026-08-21T11:00:00Z");
  });

  it("falls back to the latest run as head when nothing rendered", () => {
    const only = job({ projectDir: "projects/a", status: "failed" });
    const [project] = groupByProject([only]);
    expect(project!.head.id).toBe(only.id);
    expect(project!.renderCount).toBe(0);
  });

  it("sums cost across versions", () => {
    const [project] = groupByProject([
      job({ projectDir: "projects/a", costUsd: 8 }),
      job({ projectDir: "projects/a", costUsd: 2.5 }),
    ]);
    expect(project!.totalCostUsd).toBe(10.5);
  });

  it("keeps a job with no directory as its own card", () => {
    const stray = job({ projectDir: "" });
    const projects = groupByProject([stray]);
    expect(projects).toHaveLength(1);
    expect(projects[0]!.dir).toBe(stray.id);
  });

  it("sorts projects newest activity first", () => {
    const projects = groupByProject([
      job({ projectDir: "projects/old", finishedAt: "2026-08-18T10:00:00Z" }),
      job({ projectDir: "projects/new", finishedAt: "2026-08-25T10:00:00Z" }),
    ]);
    expect(projects.map((p) => p.dir)).toEqual(["projects/new", "projects/old"]);
  });
});
