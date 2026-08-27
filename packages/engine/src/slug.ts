import fs from "node:fs";
import fsp from "node:fs/promises";
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

/**
 * The next project name nobody has taken.
 *
 * Slugs are assigned when a job is created but the directory is claimed much
 * later, so the name has to be settled against the filesystem as it is right
 * now — both when a job is queued (so it does not sit in the library grouped
 * into an unrelated project) and again at scaffold time, where it is decisive.
 */
export async function freeSlug(slug: string): Promise<string> {
  const taken = async (name: string) => {
    try {
      return (await fsp.readdir(path.join(PROJECTS_DIR, name))).length > 0;
    } catch {
      return false;
    }
  };
  if (!(await taken(slug))) return slug;
  for (let n = 2; n < 100; n++) {
    const candidate = `${slug}-${n}`;
    if (!(await taken(candidate))) return candidate;
  }
  throw new Error(`Could not find a free project name for "${slug}"`);
}
