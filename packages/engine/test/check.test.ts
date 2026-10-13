import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config", () => import("./helpers/tmp-config"));

import {
  checkArgs,
  checkPassed,
  describeFindings,
  parseCheckReport,
} from "../src/check";

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "check-report.json"), "utf8"),
) as unknown;

describe("checkArgs", () => {
  it("always asks for JSON, transition samples and the frame check", () => {
    const args = checkArgs({ captions: false });
    expect(args).toContain("--json");
    expect(args).toContain("--at-transitions");
    expect(args).toContain("--frame-check");
    // Uncapped transition sampling timed out on word-by-word captions.
    expect(args[args.indexOf("--max-transition-samples") + 1]).toBe("40");
    expect(args).not.toContain("--caption-zone");
    expect(args).not.toContain("--strict");
  });

  it("adds the caption keep-out at error severity only when captions are on", () => {
    const args = checkArgs({ captions: true });
    const i = args.indexOf("--caption-zone");
    expect(i).toBeGreaterThan(0);
    expect(args[i + 1]).toMatch(/y0=\.82/);
    expect(args[i + 1]).toMatch(/severity=error/);
  });

  it("passes --strict through", () => {
    expect(checkArgs({ captions: false, strict: true })).toContain("--strict");
  });
});

describe("parseCheckReport", () => {
  it("flattens every pass into one finding list with its group", () => {
    const report = parseCheckReport(fixture);
    expect(report.ok).toBe(false);
    expect(report.browserSkipped).toBe(false);
    expect(report.errors).toBe(2);
    expect(report.warnings).toBe(1);
    expect(report.findings.map((f) => f.group)).toEqual(["layout", "layout", "contrast"]);
    const occluded = report.findings[0]!;
    expect(occluded.code).toBe("text_occluded");
    expect(occluded.severity).toBe("error");
    expect(occluded.sourceFile).toBe("compositions/frames/05-near-miss.html");
    expect(occluded.selector).toBe("#f5-chip");
    expect(occluded.time).toBe(26);
    expect(occluded.fixHint).toMatch(/data-layout-allow-occlusion/);
    const contrast = report.findings[2]!;
    expect(contrast.suggestedColor).toBe("rgb(123,140,169)");
    expect(report.reportPath).toMatch(/\.hyperframes\/artifacts\/checks\//);
    expect(report.version).toBe("0.8.153");
  });

  it("tolerates an empty or unexpected document", () => {
    expect(parseCheckReport({}).findings).toEqual([]);
    expect(parseCheckReport(null).ok).toBe(false);
    expect(parseCheckReport({ ok: true, lint: { findings: "nope" } }).ok).toBe(true);
  });
});

describe("checkPassed", () => {
  const base = parseCheckReport({ ok: true, browserSkipped: false });

  it("fails on errors, and on warnings only when strict", () => {
    expect(checkPassed(base, false)).toBe(true);
    expect(checkPassed({ ...base, errors: 1 }, false)).toBe(false);
    expect(checkPassed({ ...base, warnings: 3 }, false)).toBe(true);
    expect(checkPassed({ ...base, warnings: 3 }, true)).toBe(false);
  });

  it("treats a skipped browser as a failure, not a pass", () => {
    expect(checkPassed({ ...base, browserSkipped: true }, false)).toBe(false);
  });
});

describe("describeFindings", () => {
  it("groups findings by the file they came from and names the worker to re-dispatch", () => {
    const text = describeFindings(parseCheckReport(fixture), false);
    expect(text).toContain("### compositions/frames/05-near-miss.html");
    expect(text).toContain("text_occluded (error) t=26.00s #f5-chip");
    expect(text).toContain("Fix: Give the text its own zone");
    // Warnings are listed only under strict.
    expect(text).not.toContain("contrast_aa_failure");
    expect(text).toContain("frame-worker");
  });

  it("includes warnings and the suggested colour when strict", () => {
    const text = describeFindings(parseCheckReport(fixture), true);
    expect(text).toContain("contrast_aa_failure (warning)");
    expect(text).toContain("Suggested colour: rgb(123,140,169)");
    expect(text).toContain("Warnings fail this run");
  });

  it("summarises a clean report in one line", () => {
    const clean = parseCheckReport({ ok: true, layout: { errorCount: 0, warningCount: 2, findings: [] } });
    expect(describeFindings(clean, false)).toBe("Check: 0 error(s), 2 warning(s).");
  });

  it("explains a skipped browser with nothing to show for it", () => {
    const skipped = parseCheckReport({ ok: false, browserSkipped: true });
    expect(describeFindings(skipped, false)).toMatch(/skipped its browser passes and reported no lint/);
  });

  it("lists the lint errors that made the browser passes skip", () => {
    const report = parseCheckReport({
      ok: false,
      browserSkipped: true,
      lint: {
        errorCount: 1,
        warningCount: 0,
        findings: [
          {
            code: "font_unavailable",
            severity: "error",
            message: "Impact cannot be supplied at render time.",
            file: "compositions/frames/01-question.html",
            line: 12,
          },
        ],
      },
    });
    const text = describeFindings(report, false);
    expect(text).toContain("did not run, so this is a failure");
    expect(text).toContain("### compositions/frames/01-question.html");
    expect(text).toContain("font_unavailable (error) line 12");
  });
});
