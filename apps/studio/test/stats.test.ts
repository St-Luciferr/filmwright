import { describe, expect, it } from "vitest";
import type { Job } from "@filmwright/engine/types";
import { summarise } from "@/lib/stats";

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

describe("summarise", () => {
  it("returns zeros for an empty library", () => {
    const stats = summarise([]);
    expect(stats.total).toBe(0);
    expect(stats.successRate).toBeNull();
    expect(stats.medianDurationMs).toBeNull();
    expect(stats.spendUsd).toBe(0);
    expect(stats.spendByDay).toEqual([]);
  });

  it("excludes adopted projects from every rate and total", () => {
    const stats = summarise([
      job({ status: "succeeded", costUsd: 10 }),
      job({ status: "imported", costUsd: 99 }),
    ]);
    expect(stats.total).toBe(2);
    expect(stats.generated).toBe(1);
    expect(stats.succeeded).toBe(1);
    expect(stats.spendUsd).toBe(10);
    expect(stats.successRate).toBe(100);
  });

  it("leaves cancelled runs out of the success rate", () => {
    const stats = summarise([
      job({ status: "succeeded" }),
      job({ status: "failed" }),
      job({ status: "cancelled" }),
      job({ status: "cancelled" }),
    ]);
    expect(stats.successRate).toBe(50);
  });

  it("counts live and awaiting-input runs separately", () => {
    const stats = summarise([
      job({ status: "running" }),
      job({ status: "queued" }),
      job({ status: "awaiting-input" }),
    ]);
    expect(stats.live).toBe(2);
    expect(stats.needsYou).toBe(1);
  });

  it("takes the median duration of successful runs only", () => {
    const done = (mins: number) =>
      job({
        status: "succeeded",
        startedAt: "2026-08-20T10:00:00Z",
        finishedAt: `2026-08-20T10:${String(mins).padStart(2, "0")}:00Z`,
      });
    const stats = summarise([
      done(10),
      done(20),
      done(50),
      job({ status: "failed", startedAt: "2026-08-20T10:00:00Z", finishedAt: "2026-08-20T19:00:00Z" }),
    ]);
    expect(stats.medianDurationMs).toBe(20 * 60_000);
  });

  it("buckets spend by finish day, oldest first", () => {
    const stats = summarise([
      job({ costUsd: 5, finishedAt: "2026-08-22T10:00:00Z" }),
      job({ costUsd: 3, finishedAt: "2026-08-21T10:00:00Z" }),
      job({ costUsd: 2, finishedAt: "2026-08-22T18:00:00Z" }),
      job({ costUsd: 4 }), // no finishedAt — falls back to createdAt (08-20)
    ]);
    expect(stats.spendByDay).toEqual([
      { day: "2026-08-20", usd: 4 },
      { day: "2026-08-21", usd: 3 },
      { day: "2026-08-22", usd: 7 },
    ]);
  });
});
