import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { ROOT, childEnv, config, localPython, readWorkerStatus } from "@filmwright/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const run = promisify(execFile);

export type Check = {
  name: string;
  /** `warn` means degraded but usable — an optional provider with a fallback. */
  level: "ok" | "warn" | "fail";
  detail: string;
  group: "worker" | "toolchain" | "media";
};

/**
 * Probing costs real seconds — it shells a script that pings three endpoints
 * and imports torch. Cache the result so re-rendering the page, or two tabs
 * watching it, does not re-run all of that.
 */
let cache: { at: number; checks: Check[] } | null = null;
const TTL_MS = 30_000;

async function probe(): Promise<Check[]> {
  const checks: Check[] = [];

  const worker = await readWorkerStatus();
  checks.push({
    name: "worker",
    group: "worker",
    level: worker.running ? "ok" : "fail",
    detail: worker.running
      ? worker.currentJobId
        ? `running — building ${worker.currentJobId.slice(0, 8)}`
        : `running — idle, last beat ${Math.round((worker.sinceMs ?? 0) / 1000)}s ago`
      : "no heartbeat — queued jobs will not start. Run `npm run dev:worker`.",
  });

  checks.push({
    name: "hyperframes",
    group: "toolchain",
    level: "ok",
    detail: `pinned at ${config.hyperframesVersion}`,
  });

  // The provider check below resolves the Kokoro venv on its own behalf, so it
  // says nothing about what any other caller of `hyperframes tts` gets. Report
  // the interpreter this platform hands the CLI.
  const tts = localPython().HYPERFRAMES_PYTHON;
  checks.push({
    name: "tts-python",
    group: "media",
    level: tts ? "ok" : "warn",
    detail: tts
      ? `hyperframes tts will use ${tts}`
      : "no managed venv resolved — the CLI will choose its own interpreter. " +
        "Run `npm run setup -- --only kokoro` to build the one this platform expects.",
  });

  try {
    const { stdout } = await run(
      "node",
      [path.join(ROOT, "scripts", "free-media.mjs"), "doctor", "--json"],
      // The probe shells out to local model runtimes and pings public
      // endpoints. It has no use for a credential.
      { timeout: 120_000, maxBuffer: 1 << 24, env: childEnv() },
    );
    for (const c of JSON.parse(stdout).checks as { name: string; ok: boolean; detail: string }[]) {
      checks.push({
        name: c.name,
        // MusicGen is the one provider with a free alternative, so its absence
        // degrades rather than breaks.
        level: c.ok ? "ok" : c.name === "musicgen" ? "warn" : "fail",
        detail: c.detail,
        group: ["ffmpeg", "ffprobe", "python3", "npx"].includes(c.name) ? "toolchain" : "media",
      });
    }
  } catch (err) {
    // A non-zero exit still carries the JSON on stdout; only a crash lands here.
    const out = (err as { stdout?: string }).stdout;
    let parsed = false;
    try {
      for (const c of JSON.parse(out ?? "").checks as { name: string; ok: boolean; detail: string }[]) {
        checks.push({
          name: c.name,
          level: c.ok ? "ok" : c.name === "musicgen" ? "warn" : "fail",
          detail: c.detail,
          group: ["ffmpeg", "ffprobe", "python3", "npx"].includes(c.name) ? "toolchain" : "media",
        });
      }
      parsed = true;
    } catch {
      /* fall through */
    }
    if (!parsed) {
      checks.push({
        name: "media providers",
        group: "media",
        level: "fail",
        detail: `preflight could not run: ${(err as Error).message.split("\n")[0]}`,
      });
    }
  }

  return checks;
}

export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.has("refresh");
  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ checks: cache.checks, checkedAt: new Date(cache.at).toISOString() });
  }
  const checks = await probe();
  cache = { at: Date.now(), checks };
  return NextResponse.json({ checks, checkedAt: new Date(cache.at).toISOString() });
}
