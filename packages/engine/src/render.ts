import { spawn } from "node:child_process";
import { config, hyperframes } from "./config";
import { findRender } from "./stages";

export type RenderResult = { ok: boolean; output?: string; error?: string };

export type Renderer = {
  name: string;
  render(
    projectDir: string,
    onLine: (line: string) => void,
    signal: AbortSignal,
  ): Promise<RenderResult>;
};

/** hyperframes colours its progress output; the job log wants it plain. */
const ANSI = new RegExp("\\u001b\\[[0-9;]*m", "g");

export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  onLine: (line: string) => void,
  signal: AbortSignal,
): Promise<{ code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, signal, env: process.env });
    let buffer = "";
    const consume = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const clean = line.replace(ANSI, "").trimEnd();
        if (clean) onLine(clean);
      }
    };
    child.stdout.on("data", consume);
    child.stderr.on("data", consume);
    child.on("error", reject);
    child.on("close", (code) => {
      const tail = buffer.replace(ANSI, "").trim();
      if (tail) onLine(tail);
      resolve({ code });
    });
  });
}

/** Renders on this machine with the pinned hyperframes CLI. */
export const localRenderer: Renderer = {
  name: "local",
  async render(projectDir, onLine, signal) {
    try {
      const { code } = await runCommand(
        "npx",
        ["--yes", hyperframes, "render", "."],
        projectDir,
        onLine,
        signal,
      );
      const output = findRender(projectDir);
      if (!output) {
        return {
          ok: false,
          error: `render exited with code ${code} and produced no mp4`,
        };
      }
      return { ok: true, output };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

const RENDERERS: Record<string, Renderer> = {
  local: localRenderer,
};

export function getRenderer(): Renderer {
  const renderer = RENDERERS[config.renderer];
  if (!renderer) {
    throw new Error(
      `Unknown renderer "${config.renderer}". Available: ${Object.keys(RENDERERS).join(", ")}`,
    );
  }
  return renderer;
}
