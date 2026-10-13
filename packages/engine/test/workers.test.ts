import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../src/config", () => import("./helpers/tmp-config"));

import { config } from "../src/config";
import {
  FRAME_WORKER,
  PACKETS_DIR,
  assembleScript,
  buildFramePackets,
  frameWorkerDefinition,
  listPackets,
  packetScript,
} from "../src/workers";

const skills = config.skillsDir;
const project = fs.mkdtempSync(path.join(config.skillsDir, "..", "worker-project-"));

/**
 * A stand-in for the skills' packet builder: honours the same CLI shape
 * (`--project`, `--storyboard`) and writes one packet per `## Frame` block plus
 * `_role.md`, which is all the engine relies on.
 */
const FAKE_BUILDER = `
import fs from "node:fs";
import path from "node:path";
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
const project = flag("project", ".");
const text = fs.readFileSync(flag("storyboard", path.join(project, "STORYBOARD.md")), "utf8");
const out = path.join(project, ".hyperframes", "frame-packets");
fs.mkdirSync(out, { recursive: true });
const ids = [...text.matchAll(/^- src: compositions\\/frames\\/([^\\s.]+)\\.html$/gm)].map(m => m[1]);
if (!ids.length) { console.error("✗ frame packets: Frame 01: missing src"); process.exit(1); }
for (const id of ids) fs.writeFileSync(path.join(out, id + ".md"), "# Frame packet: " + id);
fs.writeFileSync(path.join(out, "_role.md"), "role");
console.log("✓ frame packets: " + ids.length + " bounded packet(s)");
`;

beforeAll(() => {
  fs.mkdirSync(path.join(skills, "general-video", "scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(skills, "general-video", "scripts", "frame-packets.mjs"),
    FAKE_BUILDER,
  );
  fs.mkdirSync(path.join(skills, "product-launch-video", "scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(skills, "product-launch-video", "scripts", "assemble-index.mjs"),
    "// assembler",
  );
});
afterAll(() => fs.rmSync(project, { recursive: true, force: true }));

describe("frameWorkerDefinition", () => {
  it("carries its own model, effort and a file-only tool set", () => {
    const def = frameWorkerDefinition();
    expect(def.model).toBe("test-worker-model");
    expect(def.effort).toBe("medium");
    expect(def.maxTurns).toBe(10);
    expect(def.background).toBe(false);
    expect(def.tools).toEqual(["Read", "Write", "Edit", "Glob", "Grep"]);
    expect(def.tools).not.toContain("Bash");
    expect(def.tools).not.toContain("Agent");
    expect(def.prompt).toContain("_role.md");
    expect(def.prompt).toContain("compositions/frames/<frame_id>.html");
    expect(FRAME_WORKER).toBe("frame-worker");
  });
});

describe("script resolution", () => {
  it("prefers the workflow's own builder and falls back to general-video", () => {
    expect(packetScript("product-launch-video")).toBe(
      path.join(skills, "general-video", "scripts", "frame-packets.mjs"),
    );
    fs.writeFileSync(
      path.join(skills, "product-launch-video", "scripts", "frame-packets.mjs"),
      FAKE_BUILDER,
    );
    expect(packetScript("product-launch-video")).toBe(
      path.join(skills, "product-launch-video", "scripts", "frame-packets.mjs"),
    );
  });

  it("finds the assembler only where a workflow ships one", () => {
    expect(assembleScript("product-launch-video")).toMatch(/assemble-index\.mjs$/);
    expect(assembleScript("general-video")).toBeNull();
  });
});

describe("buildFramePackets", () => {
  const signal = new AbortController().signal;

  it("writes one packet per frame and lists them in order", async () => {
    fs.writeFileSync(
      path.join(project, "STORYBOARD.md"),
      [
        "## Frame 01 — Hook",
        "- src: compositions/frames/01-hook.html",
        "- duration: 4s",
        "## Frame 02 — Proof",
        "- src: compositions/frames/02-proof.html",
        "- duration: 5s",
      ].join("\n"),
    );
    const log: string[] = [];
    const result = await buildFramePackets(project, "general-video", signal, (l) => log.push(l));
    expect(result.ok).toBe(true);
    expect(result.frames).toEqual(["01-hook", "02-proof"]);
    expect(listPackets(project)).toEqual(["01-hook", "02-proof"]);
    expect(fs.existsSync(path.join(project, PACKETS_DIR, "_role.md"))).toBe(true);
    expect(log.join("\n")).toContain("2 bounded packet(s)");
  });

  it("explains a storyboard the builder cannot split, and how to fix it", async () => {
    fs.rmSync(path.join(project, ".hyperframes"), { recursive: true, force: true });
    fs.writeFileSync(path.join(project, "STORYBOARD.md"), "## Frame 01 — No src\n- duration: 4s\n");
    const result = await buildFramePackets(project, "general-video", signal, () => {});
    expect(result.ok).toBe(false);
    expect(result.frames).toEqual([]);
    expect(result.detail).toContain("missing src");
    expect(result.detail).toContain("--storyboard STORYBOARD.md");
  });
});
