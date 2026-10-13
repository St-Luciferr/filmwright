import { spawn } from "node:child_process";
import { config, hyperframes } from "./config";
import { childEnv } from "./env";

/**
 * The check stage as structured evidence (ADR-0017).
 *
 * `hyperframes check --json` writes one JSON document to stdout: a group per
 * pass (lint, runtime, layout, motion, contrast), each with its findings. This
 * module runs it with the flags that catch the failure modes measured in
 * agent-authored video — transition-seam overlaps, media out of frame, content
 * in the caption band — and turns the report into something an orchestrator can
 * act on frame by frame, instead of the last 25 lines of a log.
 */

export type CheckSeverity = "error" | "warning" | "info";

export type CheckFinding = {
  /** Which pass reported it. */
  group: string;
  code: string;
  severity: CheckSeverity;
  message: string;
  /** Seconds into the composition, for runtime findings. */
  time?: number;
  selector?: string;
  /** The frame (or other composition file) the element came from. */
  sourceFile?: string;
  line?: number;
  text?: string;
  fixHint?: string;
  /** Contrast findings carry a colour that would pass. */
  suggestedColor?: string;
};

export type CheckReport = {
  ok: boolean;
  browserSkipped: boolean;
  errors: number;
  warnings: number;
  findings: CheckFinding[];
  /** Where the CLI saved its full report, when it said. */
  reportPath?: string;
  version?: string;
};

const GROUPS = ["lint", "runtime", "layout", "motion", "contrast"] as const;

/**
 * The flags the engine passes (ADR-0017).
 *
 * `--at-transitions` samples at every tween boundary, which is where text laid
 * out for its final position collides mid-flight. `--frame-check` reports media
 * leaving the canvas. The caption zone is the bottom 18% at error severity,
 * only when the video will carry captions; the worker contract already tells
 * frames to stay above 83% of the height, so this is the check that makes the
 * rule binding.
 */
export function checkArgs(opts: { captions: boolean; strict?: boolean }): string[] {
  const args = [
    "--yes",
    hyperframes,
    "check",
    ".",
    "--json",
    "--at-transitions",
    "--frame-check",
  ];
  if (opts.captions) {
    args.push("--caption-zone", "x0=0;y0=.82;x1=1;y1=1;severity=error");
  }
  if (opts.strict) args.push("--strict");
  return args;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.length ? v : undefined;
const numOrUndef = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

function severityOf(v: unknown): CheckSeverity {
  return v === "error" || v === "warning" ? v : "info";
}

/** Normalise the CLI's report into a flat finding list. Tolerant of shape drift. */
export function parseCheckReport(json: unknown): CheckReport {
  const root = (json ?? {}) as Record<string, unknown>;
  const findings: CheckFinding[] = [];
  let errors = 0;
  let warnings = 0;

  for (const group of GROUPS) {
    const pass = root[group] as Record<string, unknown> | undefined;
    if (!pass) continue;
    errors += numOrUndef(pass.errorCount) ?? 0;
    warnings += numOrUndef(pass.warningCount) ?? 0;
    const list = Array.isArray(pass.findings) ? pass.findings : [];
    for (const raw of list) {
      const f = (raw ?? {}) as Record<string, unknown>;
      findings.push({
        group,
        code: str(f.code) ?? str(f.rule) ?? str(f.id) ?? "finding",
        severity: severityOf(f.severity),
        message: str(f.message) ?? "",
        time: numOrUndef(f.time),
        selector: str(f.selector),
        sourceFile: str(f.sourceFile) ?? str(f.file),
        line: numOrUndef(f.line),
        text: str(f.text),
        fixHint: str(f.fixHint) ?? str(f.hint),
        suggestedColor: str(f.suggestedColor),
      });
    }
  }

  const saved = root.saved as Record<string, unknown> | undefined;
  const meta = root._meta as Record<string, unknown> | undefined;
  return {
    ok: root.ok === true,
    browserSkipped: root.browserSkipped === true,
    errors,
    warnings,
    findings,
    reportPath: str(saved?.report),
    version: str(meta?.version),
  };
}

/** Whether the stage passes under the configured strictness. */
export function checkPassed(report: CheckReport, strict: boolean): boolean {
  if (report.browserSkipped) return false;
  if (report.errors > 0) return false;
  if (strict && report.warnings > 0) return false;
  return report.ok || !strict;
}

const fmtTime = (t: number | undefined): string =>
  t === undefined ? "" : ` t=${t.toFixed(2)}s`;

/**
 * Render findings for the agent, grouped by the file they came from.
 *
 * Grouping by file is the point: each frame was written by one worker, so the
 * orchestrator can hand a frame's findings back to a fresh worker for that
 * frame alone rather than re-reading the whole project.
 */
export function describeFindings(report: CheckReport, strict: boolean): string {
  const relevant = report.findings.filter(
    (f) => f.severity === "error" || (strict && f.severity === "warning"),
  );
  if (report.browserSkipped) {
    return (
      "`hyperframes check` could not open a browser, so the layout, motion and " +
      "contrast passes did not run. That is a failure, not a pass — fix whatever " +
      "stopped the runtime from loading (a JS error, a missing asset) and the check runs again."
    );
  }
  if (!relevant.length) {
    return `Check: ${report.errors} error(s), ${report.warnings} warning(s).`;
  }

  const byFile = new Map<string, CheckFinding[]>();
  for (const f of relevant) {
    const key = f.sourceFile ?? "(project)";
    byFile.set(key, [...(byFile.get(key) ?? []), f]);
  }

  const lines: string[] = [
    `\`hyperframes check\` reported ${report.errors} error(s) and ${report.warnings} warning(s).` +
      (strict ? " Warnings fail this run." : ""),
    "",
  ];
  for (const [file, list] of byFile) {
    lines.push(`### ${file}`);
    for (const f of list) {
      const where = [f.selector, f.text ? `"${f.text.slice(0, 40)}"` : null]
        .filter(Boolean)
        .join(" ");
      lines.push(
        `- [${f.group}] ${f.code} (${f.severity})${fmtTime(f.time)}${where ? ` ${where}` : ""}` +
          `${f.line ? ` line ${f.line}` : ""} — ${f.message}` +
          (f.suggestedColor ? ` Suggested colour: ${f.suggestedColor}.` : "") +
          (f.fixHint ? `\n  Fix: ${f.fixHint}` : ""),
      );
    }
    lines.push("");
  }
  lines.push(
    "Fix every file listed. A finding inside `compositions/frames/` belongs to that " +
      "frame alone — re-dispatch its `frame-worker` with the findings above pasted into " +
      "the dispatch context, rather than rewriting the frame yourself. " +
      "Run those workers in the foreground and reply only once every one has returned — " +
      "the platform re-runs check the moment you reply.",
  );
  return lines.join("\n");
}

export type CheckRun = {
  ok: boolean;
  /** Logged on success; handed to the agent on failure. */
  detail: string;
  report?: CheckReport;
};

/**
 * Run the pinned CLI's check against a project and interpret the result.
 *
 * stdout is the JSON report and is captured whole; stderr is the CLI's human
 * progress and goes to the log line by line.
 */
export async function runCheck(
  projectDir: string,
  opts: {
    captions: boolean;
    signal: AbortSignal;
    log: (line: string) => void;
    strict?: boolean;
  },
): Promise<CheckRun> {
  const strict = opts.strict ?? config.checkStrict;
  const args = checkArgs({ captions: opts.captions, strict });
  opts.log(`> npx ${args.slice(1).join(" ")}`);

  const { code, stdout, stderrTail } = await new Promise<{
    code: number | null;
    stdout: string;
    stderrTail: string[];
  }>((resolve, reject) => {
    const child = spawn("npx", args, {
      cwd: projectDir,
      signal: opts.signal,
      env: childEnv(),
    });
    let out = "";
    const tail: string[] = [];
    let buffer = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const clean = line.replace(/\u001b\[[0-9;]*m/g, "").trimEnd();
        if (!clean) continue;
        opts.log(clean);
        tail.push(clean);
        if (tail.length > 30) tail.shift();
      }
    });
    child.on("error", reject);
    child.on("close", (exit) => resolve({ code: exit, stdout: out, stderrTail: tail }));
  });

  let parsed: unknown;
  try {
    // The CLI keeps stdout pure JSON, but a stray line before it would not be
    // the first time a tool broke that promise — find the document.
    const start = stdout.indexOf("{");
    parsed = JSON.parse(start >= 0 ? stdout.slice(start) : stdout);
  } catch {
    return {
      ok: false,
      detail:
        `\`hyperframes check\` exited ${code} without a readable report.\n\n` +
        `${stderrTail.slice(-15).join("\n")}\n\nFix what it reports.`,
    };
  }

  const report = parseCheckReport(parsed);
  if (report.reportPath) opts.log(`Check report: ${report.reportPath}`);
  const ok = checkPassed(report, strict);
  return { ok, detail: describeFindings(report, strict), report };
}
