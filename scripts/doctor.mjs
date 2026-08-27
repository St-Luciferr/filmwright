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

/**
 * Load the repo's `.env`, if there is one.
 *
 * The engine does this for anything it spawns; doing it here too means a
 * hand-run script honours the same declared values — the pinned CLI version,
 * and the interpreter `hyperframes tts` needs. Shell variables still win.
 */
function loadDotEnv() {
  const file = path.join(import.meta.dirname, "..", ".env");
  if (!fs.existsSync(file)) return;
  try {
    process.loadEnvFile(file);
  } catch (err) {
    console.warn(`could not read ${file}: ${err.message}`);
  }
}
loadDotEnv();


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
// Only npx is checked here; ffmpeg, ffprobe and python3 belong to the media
// providers and are probed by free-media's own doctor below.
try {
  const { stdout } = await run("npx", ["--version"]);
  ok("npx", stdout.split("\n")[0].slice(0, 60));
} catch {
  fail("npx", "not found on PATH");
}

// ── hyperframes CLI ─────────────────────────────────────────────────────────
const version = process.env.FILMWRIGHT_HYPERFRAMES_VERSION ?? "0.8.12";
try {
  const { stdout } = await run("npx", ["--yes", `hyperframes@${version}`, "--version"], {
    timeout: 180_000,
  });
  ok("hyperframes", stdout.trim());
} catch (err) {
  fail("hyperframes", `could not run hyperframes@${version}: ${err.message.split("\n")[0]}`);
}

// ── the interpreter the voice path will use ─────────────────────────────────
// free-media resolves the Kokoro venv for its own child process, so its
// `kokoro` check says nothing about what any *other* caller of
// `hyperframes tts` gets. Report that separately: when the variable is unset
// the CLI picks an interpreter itself, which may not be the venv `npm run
// setup` built and is not reproducible across machines.
// This script does not import the engine, so it applies the engine's own
// fallback rather than warning about something the worker already handles.
const kokoroVenv = path.join(os.homedir(), ".venvs", "kokoro", "bin", "python");
const declared = process.env.HYPERFRAMES_PYTHON;
if (declared && fs.existsSync(declared)) {
  ok("tts-python", `hyperframes tts will use ${declared} (declared)`);
} else if (declared) {
  warn("tts-python", `HYPERFRAMES_PYTHON="${declared}" does not exist — it is ignored`);
} else if (fs.existsSync(kokoroVenv)) {
  ok("tts-python", `hyperframes tts will use ${kokoroVenv} (managed venv)`);
}

// ── free media providers ────────────────────────────────────────────────────
/** Fold free-media's own checks in, without re-reporting what we already probed. */
function mergeChecks(checks) {
  for (const check of checks) {
    if (results.some((r) => r.name === check.name)) continue;
    // MusicGen is the only optional one — Openverse covers music without it.
    results.push({
      level: check.ok ? "ok" : check.name === "musicgen" ? "warn" : "fail",
      name: check.name,
      detail: check.detail,
    });
  }
}

// The platform promises free media end to end, so the things that promise
// depends on are preflighted here rather than discovered mid-run when the
// budget is already half spent.
try {
  const { stdout } = await run(
    "node",
    [path.join(import.meta.dirname, "free-media.mjs"), "doctor", "--json"],
    { timeout: 240_000, maxBuffer: 1 << 24 },
  );
  mergeChecks(JSON.parse(stdout).checks);
} catch (err) {
  // A non-zero exit still carries the JSON; only a crash lands here.
  let parsed = false;
  try {
    mergeChecks(JSON.parse(err.stdout ?? "").checks);
    parsed = true;
  } catch {
    /* fall through to the generic failure below */
  }
  if (!parsed) {
    fail("free-media", `provider preflight crashed: ${err.message.split("\n")[0]}`);
  }
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
