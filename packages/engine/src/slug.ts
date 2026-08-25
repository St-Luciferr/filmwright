import fs from "node:fs";
import path from "node:path";
import { PROJECTS_DIR } from "./config";

const STOP_WORDS = new Set([
  "a", "an", "the", "for", "with", "and", "of", "to", "in", "on", "that",
  "this", "make", "create", "video", "about", "into", "my", "our", "your",
]);

/**
 * Derive a short, readable directory name from the prompt, then de-duplicate
 * against what already exists in projects/.
 */
export function projectSlug(prompt: string): string {
  const words = prompt
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .slice(0, 4);

  const base = words.join("-").slice(0, 48) || "video";
  let candidate = base;
  let n = 2;
  while (fs.existsSync(path.join(PROJECTS_DIR, candidate))) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}
