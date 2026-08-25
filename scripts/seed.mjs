#!/usr/bin/env node
/**
 * Adopt HyperFrames projects that already exist in projects/ into the job
 * library, so hand-authored work shows up alongside generated work. Existing
 * jobs are left alone, so this is safe to re-run.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECTS_DIR = path.join(ROOT, "projects");
const JOBS_DIR = path.join(ROOT, "data", "jobs");

const STAGES = [
  "scaffold",
  "brief",
  "script",
  "storyboard",
  "frames",
  "media",
  "check",
  "render",
];

/** Pull what we can out of a hand-written BRIEF.md frontmatter block. */
function readBrief(dir) {
  const file = path.join(dir, "BRIEF.md");
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, "utf8");
  const block = text.match(/^---\n([\s\S]*?)\n---/);
  if (!block) return {};
  const out = {};
  for (const line of block[1].split("\n")) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function aspectFrom(value) {
  if (!value) return "9:16";
  const [w, h] = value.split("x").map(Number);
  if (!w || !h) return "9:16";
  if (w > h) return "16:9";
  if (w === h) return "1:1";
  return "9:16";
}

function findRender(dir) {
  const renders = path.join(dir, "renders");
  if (!fs.existsSync(renders)) return null;
  const mp4 = fs
    .readdirSync(renders)
    .filter((f) => f.endsWith(".mp4"))
    .map((f) => path.join(renders, f));
  return mp4[0] ?? null;
}

async function existingSlugs() {
  if (!fs.existsSync(JOBS_DIR)) return new Set();
  const slugs = new Set();
  for (const id of await fsp.readdir(JOBS_DIR)) {
    try {
      const job = JSON.parse(
        await fsp.readFile(path.join(JOBS_DIR, id, "job.json"), "utf8"),
      );
      slugs.add(job.slug);
    } catch {
      // Not a job directory; ignore.
    }
  }
  return slugs;
}

async function main() {
  if (!fs.existsSync(PROJECTS_DIR)) {
    console.log("No projects/ directory — nothing to seed.");
    return;
  }
  await fsp.mkdir(JOBS_DIR, { recursive: true });
  const known = await existingSlugs();
  let added = 0;

  for (const slug of await fsp.readdir(PROJECTS_DIR)) {
    const dir = path.join(PROJECTS_DIR, slug);
    if (!fs.statSync(dir).isDirectory()) continue;
    if (!fs.existsSync(path.join(dir, "hyperframes.json"))) continue;
    if (known.has(slug)) continue;

    const brief = readBrief(dir);
    const render = findRender(dir);
    const id = randomUUID();
    const stat = fs.statSync(dir);

    const job = {
      id,
      slug,
      status: "imported",
      spec: {
        prompt: brief.message || `Imported HyperFrames project "${slug}".`,
        workflow: brief.workflow || "general-video",
        aspect: aspectFrom(brief.aspect),
        seconds: Number(String(brief.length ?? "").replace(/[^0-9]/g, "")) || 0,
        destination: brief.destination || "web",
        language: brief.language || "en",
        narration: brief.narration === "yes",
        captions: brief.captions !== "no",
        music: brief.music !== "no",
        audience: brief.audience,
      },
      createdAt: stat.birthtime.toISOString(),
      finishedAt: stat.mtime.toISOString(),
      projectDir: path.relative(ROOT, dir),
      videoPath: render ? path.relative(ROOT, render) : undefined,
      stages: STAGES.map((stage) => ({ stage, status: "done" })),
    };

    await fsp.mkdir(path.join(JOBS_DIR, id), { recursive: true });
    await fsp.writeFile(
      path.join(JOBS_DIR, id, "job.json"),
      `${JSON.stringify(job, null, 2)}\n`,
      "utf8",
    );
    await fsp.writeFile(
      path.join(JOBS_DIR, id, "events.ndjson"),
      `${JSON.stringify({
        at: new Date().toISOString(),
        kind: "log",
        message: `Imported existing project from ${job.projectDir}`,
      })}\n`,
      "utf8",
    );
    console.log(`seeded ${slug}${render ? "" : " (no render)"}`);
    added++;
  }

  console.log(added ? `\n${added} project(s) added.` : "Nothing new to seed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
