#!/usr/bin/env node
/**
 * Run the studio and the worker together, forwarding signals so Ctrl-C stops
 * both. Kept dependency-free so `npm run dev` works straight after install.
 */
import { spawn } from "node:child_process";

const prod = process.argv.includes("--prod");

const procs = [
  {
    name: "web",
    color: "36",
    args: prod
      ? ["run", "start", "--workspace", "@videos/studio"]
      : ["run", "dev", "--workspace", "@videos/studio"],
  },
  {
    name: "worker",
    color: "35",
    args: prod
      ? ["run", "start", "--workspace", "@videos/engine"]
      : ["run", "dev", "--workspace", "@videos/engine"],
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
