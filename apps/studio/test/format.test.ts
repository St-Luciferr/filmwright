import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { absolute, duration, jobDuration, money, relative } from "@/lib/format";

describe("money", () => {
  it("formats dollars to cents and dashes the unknown", () => {
    expect(money(8.184)).toBe("$8.18");
    expect(money(0)).toBe("$0.00");
    expect(money(undefined)).toBe("—");
  });
});

describe("duration", () => {
  it("picks the coarsest useful unit", () => {
    expect(duration(0)).toBe("0s");
    expect(duration(42_000)).toBe("42s");
    expect(duration(510_000)).toBe("8m 30s");
    expect(duration(480_000)).toBe("8m");
    expect(duration(4_320_000)).toBe("1h 12m");
    expect(duration(7_200_000)).toBe("2h");
  });

  it("dashes the unknowable", () => {
    expect(duration(undefined)).toBe("—");
    expect(duration(-1)).toBe("—");
    expect(duration(Number.NaN)).toBe("—");
  });
});

describe("relative", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

  it("walks up the units", () => {
    vi.setSystemTime(new Date("2026-08-28T12:00:00Z"));
    expect(relative(at(10_000))).toBe("just now");
    expect(relative(at(5 * 60_000))).toBe("5m ago");
    expect(relative(at(3 * 3_600_000))).toBe("3h ago");
    expect(relative(at(2 * 86_400_000))).toBe("2d ago");
  });

  it("treats the future as just now — clock skew happens", () => {
    vi.setSystemTime(new Date("2026-08-28T12:00:00Z"));
    expect(relative(at(-60_000))).toBe("just now");
  });

  it("dashes missing and garbage input", () => {
    expect(relative(undefined)).toBe("—");
    expect(relative("not a date")).toBe("—");
  });
});

describe("absolute", () => {
  it("dashes missing and garbage input", () => {
    expect(absolute(undefined)).toBe("—");
    expect(absolute("garbage")).toBe("—");
    expect(absolute("2026-08-28T12:00:00Z")).not.toBe("—");
  });
});

describe("jobDuration", () => {
  it("is undefined before the job started", () => {
    expect(jobDuration({})).toBeUndefined();
  });

  it("measures start to finish", () => {
    expect(
      jobDuration({
        startedAt: "2026-08-28T12:00:00Z",
        finishedAt: "2026-08-28T12:10:00Z",
      }),
    ).toBe(600_000);
  });

  it("measures to now while still running", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T12:05:00Z"));
    expect(jobDuration({ startedAt: "2026-08-28T12:00:00Z" })).toBe(300_000);
    vi.useRealTimers();
  });

  it("is undefined for unparseable timestamps", () => {
    expect(jobDuration({ startedAt: "garbage" })).toBeUndefined();
  });
});
