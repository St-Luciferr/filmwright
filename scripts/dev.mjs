#!/usr/bin/env node
/**
 * Run the studio and the worker together, forwarding signals so Ctrl-C stops
 * both. Kept dependency-free so `npm run dev` works straight after install.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Load `.env` before spawning either half.
 *
 * The engine loads it too, but too late for `PORT`: the studio's npm script
 * expands `${PORT:-3100}` in the shell, which only sees what this process
 * passes down. Shell variables still win over the file.
 */
const envFile = path.join(import.meta.dirname, "..", ".env");
if (fs.existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch (err) {
    console.warn(`could not read ${envFile}: ${err.message}`);
  }
}

const prod = process.argv.includes("--prod");

const procs = [
  {
    name: "web",
    color: "36",
    args: prod
      ? ["run", "start", "--workspace", "@filmwright/studio"]
      : ["run", "dev", "--workspace", "@filmwright/studio"],
  },
  {
    name: "worker",
    color: "35",
    args: prod
      ? ["run", "start", "--workspace", "@filmwright/engine"]
      : ["run", "dev", "--workspace", "@filmwright/engine"],
  },
];

const children = [];
let stopping = false;

for (const { name, color, args } of procs) {
  const child = spawn("npm", args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  children.push(child);

  const label = `\u001b[${color}m${name.padEnd(6)}\u001b[0m │ `;
  const pipe = (stream) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) process.stdout.write(label + line + "\n");
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);

  child.on("exit", (code) => {
    if (stopping) return;
    process.stdout.write(`${label}exited with code ${code}\n`);
    shutdown(code ?? 1);
  });
}

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 400);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}
