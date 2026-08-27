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
    const declared = process.env[variable];
    if (declared) {
      // These values are executed — `free-media.mjs` runs them directly, and a
      // GET on the health page is enough to trigger it. A path that is not an
      // absolute path to a real file is a mistake or worse, and silently
      // executing it is not something to do on a typo.
      if (isInterpreter(declared)) continue;
      console.warn(
        `[filmwright] ignoring ${variable}="${declared}" — not an absolute path ` +
          "to an existing file. Falling back to the managed venv.",
      );
      delete process.env[variable];
    }
    const managed = path.join(os.homedir(), ".venvs", venv, "bin", "python");
    if (fs.existsSync(managed)) process.env[variable] = managed;
  }
}

/**
 * A sanity check, not a sandbox.
 *
 * It rejects the realistic accidents — a relative path, a stale venv, a value
 * that is not an interpreter at all — and stops `.env` from being a one-line
 * way to point an unauthenticated health check at an arbitrary binary. It does
 * not pretend to stop someone who can already write files here: anything that
 * can edit `.env` can usually run code by easier means.
 */
function isInterpreter(value: string): boolean {
  if (!path.isAbsolute(value)) return false;
  if (!/^python(\d+(\.\d+)?)?$/.test(path.basename(value))) return false;
  try {
    return fs.statSync(value).isFile();
  } catch {
    return false;
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

/**
 * Keys whose values are credentials, by name.
 *
 * `.env` is now read, so anything in it reaches `process.env` and from there
 * every child this platform spawns — including `npx`, which fetches and runs a
 * package from the registry at render time. The authoring session is the only
 * child that has any business seeing an API key.
 */
const SECRET =
  // Substring, not separator-anchored: npm's own registry token arrives as
  // `npm_config_//registry.npmjs.org/:_authToken`, which no `_`-delimited
  // pattern matches — and `npx` is the very child this exists for.
  /KEY|TOKEN|SECRET|CREDENTIAL|PASSWORD|PASSWD|PASSPHRASE|BEARER|AUTH|COOKIE|SESSION_ID/i;

/**
 * Names that are not secrets by the pattern above but carry one, or hand one
 * out. `PAT` is a personal-access-token; it is anchored so it cannot swallow
 * `PATH` or `PATTERN`.
 */
const ALSO_SECRET =
  /^(PGPASSFILE|MYSQL_PWD|NETRC|KUBECONFIG|GNUPGHOME|VAULT_ADDR)$|_PWD$|_DSN$|_WEBHOOK(_URL)?$|(?:^|_)PAT(?:_|$)|SERVICE_ACCOUNT/i;

/** A URL with credentials embedded in it, e.g. postgres://user:pass@host/db. */
const URL_WITH_CREDENTIALS = /^[a-z][a-z0-9+.-]*:\/\/[^/@\s]+:[^/@\s]+@/i;

/**
 * The environment to hand a child process that is not the agent session.
 *
 * Everything the toolchain needs (PATH, HOME, npm and node configuration, the
 * interpreter variables) survives. Names that read as credentials do not, and
 * neither does `SSH_AUTH_SOCK` — matched by `AUTH`, and deliberately left
 * matched: nothing this spawns needs the agent socket, and handing it to a
 * package fetched from the registry is how key-forwarding gets abused.
 *
 * This reduces accidental exposure. It is **not** a boundary against a hostile
 * dependency: the child keeps `HOME`, so anything it runs can still read
 * `~/.npmrc`, `~/.aws/credentials` or `~/.claude/.credentials.json` for itself.
 */
export function childEnv(
  extra: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (SECRET.test(key) || ALSO_SECRET.test(key)) continue;
    if (value && URL_WITH_CREDENTIALS.test(value)) continue;
    env[key] = value;
  }
  return { ...env, ...extra } as NodeJS.ProcessEnv;
}

/** Which interpreter each local model will actually use, for reporting. */
export function localPython(): Record<string, string | undefined> {
  return Object.fromEntries(
    LOCAL_PYTHON.map(({ variable }) => [variable, process.env[variable]]),
  );
}
