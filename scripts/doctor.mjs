#!/usr/bin/env node
/** Preflight the things a generation run depends on but cannot install itself. */
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const results = [];

const ok = (name, detail) => results.push({ level: "ok", name, detail });
const warn = (name, detail) => results.push({ level: "warn", name, detail });
const fail = (name, detail) => results.push({ level: "fail", name, detail });

// ── node ────────────────────────────────────────────────────────────────────
const major = Number(process.versions.node.split(".")[0]);
if (major >= 20) ok("node", process.version);
else fail("node", `${process.version} — need 20 or newer`);

// ── auth ────────────────────────────────────────────────────────────────────
const credentials = path.join(os.homedir(), ".claude", ".credentials.json");
if (process.env.ANTHROPIC_API_KEY) {
  ok("auth", "ANTHROPIC_API_KEY is set");
} else if (fs.existsSync(credentials)) {
  ok("auth", "using the Claude Code login in ~/.claude");
} else {
  fail("auth", "no ANTHROPIC_API_KEY and no Claude Code login — run `claude` once to sign in");
}

// ── skills ──────────────────────────────────────────────────────────────────
const skillsDir = path.join(os.homedir(), ".claude", "skills");
const REQUIRED = ["hyperframes", "hyperframes-core", "hyperframes-cli", "media-use"];
if (!fs.existsSync(skillsDir)) {
  fail("skills", `${skillsDir} not found — run \`npx hyperframes skills update\``);
} else {
  const present = new Set(fs.readdirSync(skillsDir));
  const missing = REQUIRED.filter((s) => !present.has(s));
  if (missing.length) {
    fail("skills", `missing: ${missing.join(", ")} — run \`npx hyperframes skills update\``);
  } else {
    const workflows = [...present].filter((s) => s.startsWith("hyperframes") || s === "media-use");
    ok("skills", `${workflows.length} hyperframes skills installed`);
  }
}

// ── external binaries ───────────────────────────────────────────────────────
for (const [bin, args, required] of [
  ["npx", ["--version"], true],
  ["ffmpeg", ["-version"], false],
]) {
  try {
    const { stdout } = await run(bin, args);
    ok(bin, stdout.split("\n")[0].slice(0, 60));
  } catch {
    (required ? fail : warn)(
      bin,
      required ? "not found on PATH" : "not found — hyperframes will fetch its own build",
    );
  }
}

// ── hyperframes CLI ─────────────────────────────────────────────────────────
const version = process.env.VIDEOS_HYPERFRAMES_VERSION ?? "0.8.12";
try {
  const { stdout } = await run("npx", ["--yes", `hyperframes@${version}`, "--version"], {
    timeout: 180_000,
  });
  ok("hyperframes", stdout.trim());
} catch (err) {
  fail("hyperframes", `could not run hyperframes@${version}: ${err.message.split("\n")[0]}`);
}

// ── report ──────────────────────────────────────────────────────────────────
const icon = { ok: "\u001b[32m✔\u001b[0m", warn: "\u001b[33m!\u001b[0m", fail: "\u001b[31m✘\u001b[0m" };
console.log();
for (const r of results) {
  console.log(`  ${icon[r.level]} ${r.name.padEnd(14)} ${r.detail}`);
}
const failures = results.filter((r) => r.level === "fail").length;
console.log(
  failures
    ? `\n${failures} blocking problem(s). Generation will not work until they are fixed.\n`
    : "\nReady to generate.\n",
);
process.exit(failures ? 1 : 0);
