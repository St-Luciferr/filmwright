import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Local model interpreters, and the variable each one is declared in.
 *
 * These mirror `VENVS` in `scripts/free-media.mjs`, which is what builds the
 * venvs — the two have to agree on where they land.
 */
const LOCAL_PYTHON = [
  { variable: "HYPERFRAMES_PYTHON", venv: "kokoro" },
  { variable: "FILMWRIGHT_MUSICGEN_PYTHON", venv: "musicgen" },
] as const;

/**
 * Read `.env` from the repo root.
 *
 * The file has always been documented; nothing ever loaded it, so every value
 * in it was silently ignored. Shell variables win over the file, which is the
 * precedence `process.loadEnvFile` already implements and the one people
 * expect: `FILMWRIGHT_EFFORT=low npm run dev` must beat what is on disk.
 */
function loadDotEnv(root: string): void {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return;
  try {
    process.loadEnvFile(file);
  } catch (err) {
    console.warn(
      `[filmwright] could not read ${file}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/**
 * Point the tooling at the managed venvs, if nothing else has.
 *
 * `hyperframes tts` takes its interpreter from `HYPERFRAMES_PYTHON`; without
 * it the CLI discovers one for itself, which works but is not something this
 * platform gets to decide or reproduce. `free-media.mjs` already resolves the
 * venv and injects the variable for its own child process — this does the same
 * thing once, for every child at once, so the agent session, the render driver,
 * the storyboard capture and the health probe all synthesise through the
 * interpreter `npm run setup` built rather than whichever one happens to be
 * discoverable. An interpreter someone named explicitly is left alone.
 */
function exportLocalPython(): void {
  for (const { variable, venv } of LOCAL_PYTHON) {
    if (process.env[variable]) continue;
    const managed = path.join(os.homedir(), ".venvs", venv, "bin", "python");
    if (fs.existsSync(managed)) process.env[variable] = managed;
  }
}

/**
 * Settle the environment before anything reads it. Called once, at the top of
 * `config.ts`, so importing the engine is enough to get it.
 */
export function loadEnvironment(root: string): void {
  loadDotEnv(root);
  exportLocalPython();
}

/** Which interpreter each local model will actually use, for reporting. */
export function localPython(): Record<string, string | undefined> {
  return Object.fromEntries(
    LOCAL_PYTHON.map(({ variable }) => [variable, process.env[variable]]),
  );
}
