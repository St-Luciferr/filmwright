import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { config } from "./config";
import { childEnv } from "./env";

/**
 * The frame worker (ADR-0016).
 *
 * HyperFrames' workflows are built around an orchestrator that dispatches one
 * sub-agent per frame. Each worker's whole world is two files the packet
 * builder writes — `_role.md` (the worker contract) and its own frame packet —
 * plus `frame.md`. The engine defines that worker here so it has its own model,
 * effort and tool set, and so the orchestrator cannot forget to use it.
 */

export const FRAME_WORKER = "frame-worker";

/** Where the packet builder writes, relative to the project. */
export const PACKETS_DIR = path.join(".hyperframes", "frame-packets");

/**
 * The worker's standing instructions. The dispatch message from the
 * orchestrator carries the specifics: project dir, frame id, file paths,
 * canvas, captions.
 */
export const FRAME_WORKER_PROMPT = `You are a HyperFrames frame worker. You build exactly one frame of a video as a
sub-composition and nothing else.

Your dispatch message names PROJECT_DIR, your frame_id, the role file and your
packet. Work in this order:

1. Read the role file (\`.hyperframes/frame-packets/_role.md\`) in full. It is the
   contract you are held to.
2. Read your packet (\`.hyperframes/frame-packets/<frame_id>.md\`). It carries your
   frame's storyboard block, the blueprint and every motion rule selected for it.
3. Read \`frame.md\` at the project root if it exists — the design tokens are binding.
4. Write \`compositions/frames/<frame_id>.html\`: one bare \`<template>…</template>\`
   fragment, one paused GSAP timeline registered at \`window.__timelines["<frame_id>"]\`,
   every id and reusable class prefixed with the frame id. Run the role file's
   self-check before you finish, and rewrite the file if it fails.

Do not open \`STORYBOARD.md\`, the skill documents, or any other frame's file. Do not
author \`<audio>\`. Do not run the CLI, start a preview, or edit anything but your own
frame file. If the dispatch context includes check findings for this frame, fix
exactly those and keep everything else.

Finish with one line: the file you wrote and what the frame shows.`;

/** The SDK agent definition the session registers. */
export function frameWorkerDefinition(): AgentDefinition {
  return {
    description:
      "Builds one HyperFrames frame sub-composition from its packet and the worker " +
      "role file. Dispatch one per frame, in parallel.",
    prompt: FRAME_WORKER_PROMPT,
    tools: ["Read", "Write", "Edit", "Glob", "Grep"],
    model: config.workerModel,
    effort: config.workerEffort,
    maxTurns: config.workerMaxTurns,
  };
}

/**
 * The workflow skill's packet builder, or the general one when the workflow
 * has none of its own. Each is a thin wrapper over the shared builder in the
 * `hyperframes` skill, pinning that workflow's role delta.
 */
export function packetScript(workflow: string): string | null {
  const candidates = [workflow, "general-video"].map((skill) =>
    path.join(config.skillsDir, skill, "scripts", "frame-packets.mjs"),
  );
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

/** The workflow skill's index assembler, when it ships one. */
export function assembleScript(workflow: string): string | null {
  const p = path.join(config.skillsDir, workflow, "scripts", "assemble-index.mjs");
  return fs.existsSync(p) ? p : null;
}

/** Frame ids with a packet on disk, in storyboard order. */
export function listPackets(projectDir: string): string[] {
  try {
    return fs
      .readdirSync(path.join(projectDir, PACKETS_DIR))
      .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
      .map((f) => f.replace(/\.md$/, ""))
      .sort();
  } catch {
    return [];
  }
}

export type PacketBuild = {
  ok: boolean;
  /** What happened, for the log and for the agent when it failed. */
  detail: string;
  frames: string[];
};

/**
 * Build the per-frame packets and the worker role file.
 *
 * Done by the engine on entering `frames`, so the orchestrator starts with the
 * packets already on disk instead of being asked to remember a script path.
 */
export async function buildFramePackets(
  projectDir: string,
  workflow: string,
  signal: AbortSignal,
  log: (line: string) => void,
): Promise<PacketBuild> {
  const script = packetScript(workflow);
  if (!script) {
    return {
      ok: false,
      detail:
        `No frame-packets.mjs found under ${config.skillsDir} for "${workflow}" or ` +
        "general-video. Run `npx hyperframes skills update`.",
      frames: [],
    };
  }
  const lines: string[] = [];
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [script, "--project", projectDir, "--storyboard", path.join(projectDir, "STORYBOARD.md")],
      { cwd: projectDir, signal, env: childEnv() },
    );
    const consume = (chunk: Buffer) => {
      for (const line of chunk.toString("utf8").split("\n")) {
        const clean = line.trimEnd();
        if (!clean) continue;
        lines.push(clean);
        log(clean);
      }
    };
    child.stdout.on("data", consume);
    child.stderr.on("data", consume);
    child.on("error", reject);
    child.on("close", resolve);
  });
  const frames = listPackets(projectDir);
  if (code !== 0 || !frames.length) {
    return {
      ok: false,
      detail:
        `The frame packet builder failed (exit ${code}):\n${lines.slice(-10).join("\n")}\n\n` +
        "It splits STORYBOARD.md on `## Frame` headings and needs a `src:` line in every " +
        "frame block. Fix the storyboard, then run it yourself:\n" +
        `\`node ${script} --project . --storyboard STORYBOARD.md\``,
      frames,
    };
  }
  return { ok: true, detail: `${frames.length} frame packet(s) built in ${PACKETS_DIR}/`, frames };
}
