#!/usr/bin/env node
/**
 * free-media — every media asset a run needs, from sources that cost nothing.
 *
 * This is the only media fetcher the agent is given. Each provider here is
 * either a local model or a public endpoint that needs no account, no key and
 * no subscription, which is what makes the platform's "free" promise something
 * the code enforces rather than something the prompt asks for politely.
 *
 * Two things it does that a hand-rolled `curl` in the agent's turn does not:
 * results are seeded from the intent, so a re-render fetches the same asset;
 * and every Creative Commons download is written to an attribution ledger, so
 * the licence obligation survives past the turn that incurred it.
 *
 *   node scripts/free-media.mjs voice   --text "..."   --out assets/voice/01.wav
 *   node scripts/free-media.mjs music   --intent "..." --out assets/bgm/track.wav --seconds 25
 *   node scripts/free-media.mjs image   --intent "..." --out assets/images/f01.jpg
 *   node scripts/free-media.mjs footage --intent "..." --out assets/video/f01.mp4 --seconds 4
 *   node scripts/free-media.mjs doctor
 */
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const UA = "filmwright/0.1 (free-media)";
const OPENVERSE = "https://api.openverse.org/v1";
const COMMONS = "https://commons.wikimedia.org/w/api.php";
const POLLINATIONS = "https://image.pollinations.ai/prompt";

// ── argv ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) out[a.slice(2, eq)] = a.slice(eq + 1);
      else if (argv[i + 1] && !argv[i + 1].startsWith("--")) out[a.slice(2)] = argv[++i];
      else out[a.slice(2)] = true;
    } else out._.push(a);
  }
  return out;
}

const die = (message) => {
  console.error(`free-media: ${message}`);
  process.exit(1);
};

/**
 * Stable per-intent seed, so a re-run of the same brief fetches the same asset.
 *
 * Seven hex digits, not eight: Pollinations answers 500 to any seed at or above
 * 2^31, and a 28-bit space is far more than enough to keep frames distinct.
 */
const seedOf = (text) =>
  parseInt(crypto.createHash("sha256").update(text).digest("hex").slice(0, 7), 16);

// ── io ──────────────────────────────────────────────────────────────────────

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
  return res.json();
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} downloading ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`suspiciously small download (${buf.length} bytes)`);
  await fsp.mkdir(path.dirname(path.resolve(dest)), { recursive: true });
  await fsp.writeFile(dest, buf);
  return buf.length;
}

const ffprobe = async (file) => {
  try {
    const { stdout } = await run("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=nw=1:nk=1", file,
    ]);
    const d = Number(stdout.trim());
    return Number.isFinite(d) ? d : null;
  } catch {
    return null;
  }
};

/**
 * Record what was taken and under what licence.
 *
 * CC-BY and CC-BY-SA assets carry a credit obligation that outlives the agent
 * turn that downloaded them, so it goes to disk next to the asset — a ledger
 * line for machines, ATTRIBUTION.md for the human who ships the video.
 */
async function credit(outPath, record) {
  const project = process.cwd();
  const rel = path.relative(project, path.resolve(outPath));
  const entry = { at: new Date().toISOString(), file: rel, ...record };

  const dir = path.join(project, ".media");
  await fsp.mkdir(dir, { recursive: true });
  await fsp.appendFile(path.join(dir, "free-media.jsonl"), `${JSON.stringify(entry)}\n`);

  if (!record.license || record.license === "generated") return;

  const md = path.join(project, "ATTRIBUTION.md");
  const line =
    `- \`${rel}\` — "${record.title ?? "untitled"}" by ${record.creator ?? "unknown"}, ` +
    `${String(record.license).toUpperCase()}${record.licenseUrl ? ` (${record.licenseUrl})` : ""}` +
    `${record.source ? ` · ${record.source}` : ""}\n`;
  if (!fs.existsSync(md)) {
    await fsp.writeFile(
      md,
      "# Attribution\n\nCreative Commons media used in this video. These credits are a\n" +
        "licence condition — keep them with the render.\n\n",
    );
  }
  const existing = await fsp.readFile(md, "utf8");
  if (!existing.includes(`\`${rel}\``)) await fsp.appendFile(md, line);
}

const report = (kind, outPath, detail) =>
  console.log(`resolved ${kind} → ${outPath} (${detail})`);

// ── openverse ───────────────────────────────────────────────────────────────

/**
 * Search Openverse for a commercially-usable, modifiable asset.
 *
 * The seed picks which of the top hits to take rather than always the first:
 * the first result for a given phrase is often the same overused photo, and a
 * deterministic offset gives variety across frames without giving up
 * reproducibility.
 */
async function openverseSearch(type, intent, seed) {
  const url =
    `${OPENVERSE}/${type}/?q=${encodeURIComponent(intent)}` +
    `&page_size=20&license_type=commercial,modification`;
  const data = await fetchJson(url);
  const results = (data.results ?? []).filter((r) => r.url);
  if (!results.length) throw new Error(`Openverse found no ${type} for "${intent}"`);
  return results[seed % results.length];
}

const openverseCredit = (hit) => ({
  title: hit.title,
  creator: hit.creator,
  license: `cc-${hit.license}${hit.license_version ? ` ${hit.license_version}` : ""}`,
  licenseUrl: hit.license_url,
  source: hit.foreign_landing_url ?? hit.provider,
  provider: "openverse",
});

// ── image ───────────────────────────────────────────────────────────────────

async function cmdImage(args) {
  const intent = args.intent || die("--intent is required");
  const out = args.out || die("--out is required");
  const provider = args.provider ?? "pollinations";
  const seed = seedOf(intent);

  if (provider === "openverse") {
    const hit = await openverseSearch("images", intent, seed);
    const bytes = await download(hit.url, out);
    await credit(out, openverseCredit(hit));
    report("image", out, `openverse, ${(bytes / 1024).toFixed(0)}KB, ${hit.license} — credited`);
    return;
  }

  if (provider !== "pollinations") die(`unknown image provider "${provider}"`);

  const width = Number(args.width ?? 768);
  const height = Number(args.height ?? 1024);
  const url =
    `${POLLINATIONS}/${encodeURIComponent(intent)}` +
    `?width=${width}&height=${height}&seed=${seed}&nologo=true`;

  // The free tier rate-limits per client and renders on demand, so 429 and 5xx
  // are both routine and both transient. Back off rather than fail the frame —
  // a run authoring six images will trip the limiter at least once.
  const ATTEMPTS = 5;
  let bytes;
  for (let attempt = 1; ; attempt++) {
    try {
      bytes = await download(url, out);
      break;
    } catch (err) {
      if (attempt === ATTEMPTS) {
        throw new Error(
          `${err.message} (after ${ATTEMPTS} attempts). Pollinations is the only free ` +
            `no-key image generator available; if it stays down, switch this run to ` +
            `--provider openverse for real Creative Commons photographs.`,
        );
      }
      const wait = /429/.test(err.message) ? 20_000 * attempt : 5_000 * attempt;
      console.error(
        `free-media: pollinations ${err.message.slice(0, 40)}… retrying in ${wait / 1000}s ` +
          `(${attempt}/${ATTEMPTS - 1})`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  await credit(out, { license: "generated", provider: "pollinations", prompt: intent, seed });
  report(
    "image",
    out,
    `pollinations, ${width}x${height}, ${(bytes / 1024).toFixed(0)}KB, AI-generated`,
  );
}

// ── music ───────────────────────────────────────────────────────────────────

const MUSICGEN_PY = `
import sys, torch, soundfile as sf
from transformers import AutoProcessor, MusicgenForConditionalGeneration

prompt, seconds, out, seed = sys.argv[1], float(sys.argv[2]), sys.argv[3], int(sys.argv[4])
model_id = "facebook/musicgen-small"
processor = AutoProcessor.from_pretrained(model_id)
model = MusicgenForConditionalGeneration.from_pretrained(model_id)
model.eval()

sr = model.config.audio_encoder.sampling_rate
# MusicGen emits 50 audio tokens per second and degrades past ~30s, so a long
# bed is built by looping a shorter seed rather than generated end to end.
span = min(max(seconds, 5.0), 20.0)
torch.manual_seed(seed)
inputs = processor(text=[prompt], padding=True, return_tensors="pt")
with torch.no_grad():
    audio = model.generate(**inputs, do_sample=True, guidance_scale=3.0,
                           max_new_tokens=int(span * 50))
sf.write(out, audio[0, 0].numpy(), sr)
print(f"{sr} {span}")
`;

async function cmdMusic(args) {
  const intent = args.intent || die("--intent is required");
  const out = args.out || die("--out is required");
  const seconds = Number(args.seconds ?? 25);
  const provider = args.provider ?? "musicgen";
  const seed = seedOf(intent);

  if (provider === "openverse") {
    const hit = await openverseSearch("audio", intent, seed);
    const raw = `${out}.download`;
    await download(hit.url, raw);
    await loopToLength(raw, out, seconds);
    await fsp.rm(raw, { force: true });
    await credit(out, openverseCredit(hit));
    report("music", out, `openverse, ${seconds}s, ${hit.license} — credited`);
    return;
  }

  if (provider !== "musicgen") die(`unknown music provider "${provider}"`);

  const script = path.join(os.tmpdir(), `musicgen-${seed}.py`);
  await fsp.writeFile(script, MUSICGEN_PY);
  const seedWav = `${path.resolve(out)}.seed.wav`;
  await fsp.mkdir(path.dirname(path.resolve(out)), { recursive: true });

  try {
    // CPU generation is slow but bounded; the ceiling sits well under the job's
    // own timeout so a stuck model surfaces as a media error, not a dead run.
    await run("python3", [script, intent, String(seconds), seedWav, String(seed)], {
      timeout: 20 * 60_000,
      maxBuffer: 1 << 24,
    });
  } catch (err) {
    throw new Error(
      `MusicGen failed: ${String(err.stderr ?? err.message).split("\n").slice(-3).join(" ")}. ` +
        `Install deps with \`pip install transformers torch soundfile\`, ` +
        `or retry with --provider openverse.`,
    );
  } finally {
    await fsp.rm(script, { force: true });
  }

  await loopToLength(seedWav, out, seconds);
  await fsp.rm(seedWav, { force: true });
  await credit(out, { license: "generated", provider: "musicgen", prompt: intent, seed });
  report("music", out, `musicgen (local), ${seconds}s, original`);
}

/** Loop or trim a seed track to exactly `seconds`, with a short fade at each end. */
async function loopToLength(src, dest, seconds) {
  const fade = Math.min(1.5, seconds / 8);
  await fsp.mkdir(path.dirname(path.resolve(dest)), { recursive: true });
  await run(
    "ffmpeg",
    [
      "-y", "-stream_loop", "-1", "-i", src,
      "-t", String(seconds),
      "-af",
      `afade=t=in:st=0:d=${fade},afade=t=out:st=${(seconds - fade).toFixed(2)}:d=${fade}`,
      "-ar", "44100", "-ac", "2",
      dest,
    ],
    { maxBuffer: 1 << 24 },
  );
}

// ── footage ─────────────────────────────────────────────────────────────────

async function cmdFootage(args) {
  const intent = args.intent || die("--intent is required");
  const out = args.out || die("--out is required");
  const seconds = Number(args.seconds ?? 5);
  const provider = args.provider ?? "wikimedia";
  if (provider !== "wikimedia") die(`unknown video provider "${provider}"`);
  const seed = seedOf(intent);

  const search = await fetchJson(
    `${COMMONS}?action=query&format=json&list=search&srnamespace=6&srlimit=20` +
      `&srsearch=${encodeURIComponent(`filetype:video ${intent}`)}`,
  );
  const hits = search.query?.search ?? [];
  if (!hits.length) {
    throw new Error(
      `Wikimedia Commons has no CC footage for "${intent}". ` +
        `Commons is documentary-grade and thin on b-roll — fall back to animated stills.`,
    );
  }
  const title = hits[seed % hits.length].title;

  const info = await fetchJson(
    `${COMMONS}?action=query&format=json&prop=imageinfo&iiprop=url%7Cextmetadata` +
      `&titles=${encodeURIComponent(title)}`,
  );
  const page = Object.values(info.query?.pages ?? {})[0];
  const ii = page?.imageinfo?.[0];
  if (!ii?.url) throw new Error(`no downloadable URL for ${title}`);
  const meta = ii.extmetadata ?? {};
  const strip = (v) => (v?.value ? String(v.value).replace(/<[^>]*>/g, "").trim() : undefined);

  const raw = `${path.resolve(out)}.download`;
  await download(ii.url, raw);
  await fsp.mkdir(path.dirname(path.resolve(out)), { recursive: true });

  // Commons serves webm/ogv; the composition needs h264 with no audio track,
  // trimmed to the beat it has to fill.
  await run(
    "ffmpeg",
    [
      "-y", "-i", raw, "-t", String(seconds), "-an",
      "-c:v", "libx264", "-preset", "medium", "-crf", "20",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      path.resolve(out),
    ],
    { maxBuffer: 1 << 24, timeout: 10 * 60_000 },
  );
  await fsp.rm(raw, { force: true });

  await credit(out, {
    title: title.replace(/^File:/, ""),
    creator: strip(meta.Artist) ?? "unknown",
    license: strip(meta.LicenseShortName) ?? "cc",
    licenseUrl: strip(meta.LicenseUrl),
    source: ii.descriptionurl,
    provider: "wikimedia",
  });
  const dur = await ffprobe(out);
  report("footage", out, `wikimedia, ${dur ? `${dur.toFixed(1)}s` : `${seconds}s`}, CC — credited`);
}

// ── voice ───────────────────────────────────────────────────────────────────

/**
 * Kokoro's Python deps live in their own venv.
 *
 * System Python on this platform is externally managed (PEP 668), so
 * `pip install kokoro-onnx` there either refuses or breaks the OS packages.
 * A dedicated venv is the path `hyperframes tts` itself suggests, via
 * HYPERFRAMES_PYTHON.
 */
const KOKORO_VENV = path.join(os.homedir(), ".venvs", "kokoro");

function kokoroPython() {
  if (process.env.HYPERFRAMES_PYTHON) return process.env.HYPERFRAMES_PYTHON;
  const candidate = path.join(KOKORO_VENV, "bin", "python");
  return fs.existsSync(candidate) ? candidate : null;
}

/** Create the Kokoro venv. Idempotent, and the only setup this platform needs. */
async function cmdSetup() {
  if (kokoroPython()) {
    console.log(`kokoro: already set up (${kokoroPython()})`);
    return;
  }
  const uv = await run("uv", ["--version"]).then(() => true).catch(() => false);
  if (!uv) {
    throw new Error(
      "uv is not installed. Get it from https://docs.astral.sh/uv/, or create " +
        `the venv by hand: python3 -m venv ${KOKORO_VENV} && ` +
        `${KOKORO_VENV}/bin/pip install kokoro-onnx soundfile`,
    );
  }
  console.log(`kokoro: creating ${KOKORO_VENV} …`);
  await run("uv", ["venv", KOKORO_VENV], { timeout: 5 * 60_000 });
  await run("uv", ["pip", "install", "kokoro-onnx", "soundfile"], {
    timeout: 20 * 60_000,
    maxBuffer: 1 << 24,
    env: { ...process.env, VIRTUAL_ENV: KOKORO_VENV },
  });
  console.log(`kokoro: ready (${path.join(KOKORO_VENV, "bin", "python")})`);
}


async function cmdVoice(args) {
  const out = args.out || die("--out is required");
  const voice = args.voice ?? "af_heart";
  const speed = String(args.speed ?? "1.0");

  let text = args.text;
  if (args["text-file"]) text = await fsp.readFile(args["text-file"], "utf8");
  if (!text || !String(text).trim()) die("--text or --text-file is required");

  const version = process.env.FILMWRIGHT_HYPERFRAMES_VERSION ?? "0.8.12";
  await fsp.mkdir(path.dirname(path.resolve(out)), { recursive: true });

  const python = kokoroPython();
  if (!python) {
    throw new Error(
      `Kokoro needs the kokoro-onnx package, which is not installed. ` +
        `Run \`node scripts/free-media.mjs setup\` once to create ${KOKORO_VENV}.`,
    );
  }

  // `hyperframes tts` reports synthesis failures on stdout and still exits 0,
  // so neither the exit code nor stderr can be trusted here. The output file
  // is the only honest signal.
  let output = "";
  try {
    // The first call downloads Kokoro-82M, which is why the timeout is generous.
    const res = await run(
      "npx",
      [
        "--yes", `hyperframes@${version}`, "tts", String(text).trim(),
        "-o", path.resolve(out), "-v", voice, "-s", speed,
      ],
      {
        timeout: 15 * 60_000,
        maxBuffer: 1 << 24,
        env: { ...process.env, HYPERFRAMES_PYTHON: python },
      },
    );
    output = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
  } catch (err) {
    output = `${err.stdout ?? ""}\n${err.stderr ?? err.message}`;
  }

  if (!fs.existsSync(path.resolve(out))) {
    // Strip the CLI's spinner frames so the real sentence survives.
    const detail = output
      .replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, "")
      .split("\n")
      .map((l) => l.replace(/^[\s│◇◆○●]+/, "").trim())
      .filter(Boolean)
      .slice(-3)
      .join(" ");
    throw new Error(
      `Kokoro TTS produced no file. ${detail || "no output from the CLI"}. ` +
        `It is the only free voice path on this machine — do not substitute a paid one.`,
    );
  }
  const dur = await ffprobe(out);
  await credit(out, { license: "generated", provider: "kokoro", voice, text: String(text).trim() });
  report("voice", out, `kokoro ${voice}${dur ? `, ${dur.toFixed(2)}s` : ""}`);
}

// ── doctor ──────────────────────────────────────────────────────────────────

const GREEN = "\u001b[32m\u2714\u001b[0m";
const RED = "\u001b[31m\u2718\u001b[0m";

async function cmdDoctor(args) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  for (const bin of ["ffmpeg", "ffprobe", "python3", "npx"]) {
    try {
      await run(bin, ["-version"]).catch(() => run(bin, ["--version"]));
      add(bin, true, "on PATH");
    } catch {
      add(bin, false, "not found on PATH");
    }
  }

  const python = kokoroPython();
  if (!python) {
    add("kokoro", false, "run `node scripts/free-media.mjs setup` (voice needs kokoro-onnx)");
  } else {
    try {
      await run(python, ["-c", "import kokoro_onnx, soundfile"], { timeout: 180_000 });
      add("kokoro", true, `kokoro-onnx importable (${python})`);
    } catch {
      add("kokoro", false, `${python} cannot import kokoro_onnx — re-run \`free-media setup\``);
    }
  }

  try {
    await run("python3", ["-c", "import torch, transformers, soundfile"], { timeout: 180_000 });
    add("musicgen", true, "torch + transformers + soundfile importable");
  } catch {
    add("musicgen", false, "pip install transformers torch soundfile (or pick Openverse for music)");
  }

  const ping = async (name, url) => {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA },
        signal: AbortSignal.timeout(25_000),
      });
      add(name, res.ok, res.ok ? "reachable, no key needed" : `HTTP ${res.status}`);
    } catch (err) {
      add(name, false, err.message);
    }
  };
  await ping("openverse", `${OPENVERSE}/images/?q=test&page_size=1`);
  await ping("wikimedia", `${COMMONS}?action=query&format=json&list=search&srsearch=test&srlimit=1`);
  await ping("pollinations", `${POLLINATIONS}/test?width=64&height=64&seed=1&nologo=true`);

  if (args.json) {
    console.log(JSON.stringify({ checks }, null, 2));
  } else {
    for (const c of checks) {
      console.log(`  ${c.ok ? GREEN : RED} ${c.name.padEnd(14)} ${c.detail}`);
    }
  }
  // MusicGen is optional — Openverse covers music without it. Everything else
  // failing means a provider the user can pick would not actually work.
  process.exit(checks.some((c) => !c.ok && c.name !== "musicgen") ? 1 : 0);
}

// ── main ────────────────────────────────────────────────────────────────────

const COMMANDS = {
  image: cmdImage,
  music: cmdMusic,
  footage: cmdFootage,
  voice: cmdVoice,
  setup: cmdSetup,
  doctor: cmdDoctor,
};

const args = parseArgs(process.argv.slice(2));
const command = args._[0];
if (!command || !COMMANDS[command]) {
  console.error(`usage: free-media <${Object.keys(COMMANDS).join("|")}> [options]`);
  process.exit(1);
}

try {
  await COMMANDS[command](args);
} catch (err) {
  die(err instanceof Error ? err.message : String(err));
}
