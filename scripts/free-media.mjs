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
 *   node scripts/free-media.mjs sfx     --intent "..." --out assets/sfx/whoosh.wav
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

/**
 * Load the repo's `.env`, if there is one.
 *
 * The engine does this for anything it spawns; doing it here too means a
 * hand-run script honours the same declared values — the pinned CLI version,
 * and the interpreter `hyperframes tts` needs. Shell variables still win.
 */
function loadDotEnv() {
  const file = path.join(import.meta.dirname, "..", ".env");
  if (!fs.existsSync(file)) return;
  try {
    process.loadEnvFile(file);
  } catch (err) {
    console.warn(`could not read ${file}: ${err.message}`);
  }
}
loadDotEnv();

const UA = "filmwright/0.1 (free-media)";
const OPENVERSE = "https://api.openverse.org/v1";
const COMMONS = "https://commons.wikimedia.org/w/api.php";
const POLLINATIONS = "https://image.pollinations.ai/prompt";
const ARCHIVE = "https://archive.org";

/** Where downloaded libraries and synthesised assets are kept between runs. */
const CACHE_DIR =
  process.env.FILMWRIGHT_MEDIA_CACHE ?? path.join(os.homedir(), ".cache", "filmwright");

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
  const query = async (q) => {
    const data = await fetchJson(
      `${OPENVERSE}/${type}/?q=${encodeURIComponent(q)}` +
        `&page_size=20&license_type=commercial,modification`,
    );
    return (data.results ?? []).filter((r) => r.url);
  };

  // Openverse is a keyword search over a catalog far thinner than a stock
  // library's, and the commercial-use filter narrows it again. A four-word
  // phrase often matches nothing while its first two words match plenty, so
  // shorten the query rather than failing the asset.
  const words = intent.split(/\s+/).filter(Boolean);
  for (let take = words.length; take >= 1; take--) {
    const q = words.slice(0, take).join(" ");
    const results = await query(q);
    if (results.length) {
      if (take < words.length) {
        console.error(`free-media: openverse had nothing for "${intent}" — used "${q}"`);
      }
      // Rotate rather than slice: the caller walks this list until one
      // actually downloads, and the seed decides where the walk starts.
      const start = seed % results.length;
      return [...results.slice(start), ...results.slice(0, start)];
    }
  }
  throw new Error(
    `Openverse found no ${type} for "${intent}", even on its first word. ` +
      `Try different keywords, or a provider that generates rather than searches.`,
  );
}

/**
 * Download the first Openverse candidate that actually serves.
 *
 * A hit's `url` points at the original host, and some of them — Freesound's CDN
 * especially — answer 403 to a plain request. Walking the candidates turns that
 * from a failed asset into a slightly different one.
 */
async function openverseDownload(type, intent, seed, dest) {
  const candidates = await openverseSearch(type, intent, seed);
  const tried = [];
  for (const hit of candidates.slice(0, 8)) {
    try {
      const bytes = await download(hit.url, dest);
      if (tried.length) {
        console.error(`free-media: skipped ${tried.length} unreachable openverse result(s)`);
      }
      return { hit, bytes };
    } catch (err) {
      tried.push(`${new URL(hit.url).host}: ${err.message.slice(0, 40)}`);
    }
  }
  throw new Error(
    `Openverse matched ${type} for "${intent}" but none could be downloaded ` +
      `(${tried.slice(0, 3).join("; ")}).`,
  );
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
    const { hit, bytes } = await openverseDownload("images", intent, seed, out);
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
    const raw = `${path.resolve(out)}.download`;
    const { hit } = await openverseDownload("audio", intent, seed, raw);
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

  const python = await venvPython("musicgen");
  if (!python) {
    await fsp.rm(script, { force: true });
    throw new Error(
      `MusicGen's dependencies are not installed. Run ` +
        `\`node scripts/free-media.mjs setup --only musicgen\` once, ` +
        `or retry with --provider openverse for a Creative Commons track.`,
    );
  }

  try {
    // CPU generation is slow but bounded; the ceiling sits well under the job's
    // own timeout so a stuck model surfaces as a media error, not a dead run.
    await run(python, [script, intent, String(seconds), seedWav, String(seed)], {
      timeout: 20 * 60_000,
      maxBuffer: 1 << 24,
    });
  } catch (err) {
    throw new Error(
      `MusicGen failed: ${String(err.stderr ?? err.message).split("\n").slice(-3).join(" ")}. ` +
        `Retry with --provider openverse for a Creative Commons track.`,
    );
  } finally {
    await fsp.rm(script, { force: true });
  }

  await loopToLength(seedWav, out, seconds);
  await fsp.rm(seedWav, { force: true });
  await credit(out, { license: "generated", provider: "musicgen", prompt: intent, seed });
  report("music", out, `musicgen (local), ${seconds}s, original`);
}

// ── internet archive ────────────────────────────────────────────────────────

/**
 * A licence URL as a short credit label. Public-domain marks need no credit
 * at all, but recording one is harmless and keeps the ledger complete.
 */
function licenceLabel(url = "") {
  if (/publicdomain/i.test(url)) return "public domain";
  const m = url.match(/licenses\/([a-z-]+)\/([\d.]+)/i);
  return m ? `cc-${m[1]} ${m[2]}` : "cc";
}

/**
 * Footage from the Internet Archive — NASA and the Prelinger Archives only.
 *
 * An Archive item's licence is whatever its uploader typed. An open search for
 * "ocean waves" filtered to public domain returned a fan-uploaded Disney DVD
 * rip labelled public domain, so the search is restricted to two institutional
 * collections whose rights are genuine: NASA (~13.8k videos) and Prelinger
 * (~10.5k public-domain historical films). Narrower, but safe to automate.
 *
 * Prefers a 720p-or-better MP4 under a size cap, smallest first, so a
 * 4-second beat does not download a feature.
 */
const ARCHIVE_COLLECTIONS = ["nasa", "prelinger"];

async function archiveFootage(intent, seed) {
  // Slashes are escaped: unescaped, Lucene reads `/…/` as a regular
  // expression and the whole query silently matches nothing.
  const licence =
    "(licenseurl:*publicdomain* OR licenseurl:*licenses\\/by\\/* OR licenseurl:*licenses\\/by-sa\\/*)";
  const search = async (terms) => {
    const q = `collection:(${ARCHIVE_COLLECTIONS.join(" OR ")}) AND mediatype:movies AND ${licence} AND (${terms})`;
    const data = await fetchJson(
      `${ARCHIVE}/advancedsearch.php?q=${encodeURIComponent(q)}` +
        "&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=licenseurl" +
        "&rows=25&output=json",
    );
    return data.response?.docs ?? [];
  };
  const words = intent.split(/\s+/).filter(Boolean);
  let docs = [];
  for (let take = words.length; take >= 1 && !docs.length; take--) {
    docs = await search(words.slice(0, take).join(" "));
  }
  if (!docs.length) {
    throw new Error(
      `NASA and the Prelinger Archives have no footage for "${intent}". ` +
        "They cover space, science and vintage film; for anything else use animated stills.",
    );
  }
  const start = seed % docs.length;
  for (const doc of [...docs.slice(start), ...docs.slice(0, start)].slice(0, 6)) {
    const meta = await fetchJson(`${ARCHIVE}/metadata/${encodeURIComponent(doc.identifier)}`).catch(() => null);
    const files = (meta?.files ?? [])
      .filter((f) => /\.mp4$/i.test(f.name))
      .map((f) => ({ ...f, size: Number(f.size) || Infinity, height: Number(f.height) || 0 }))
      .filter((f) => f.size < 150 * 1024 * 1024);
    if (!files.length) continue;
    const good = files.filter((f) => f.height >= 720).sort((a, b) => a.size - b.size);
    const pick = good[0] ?? files.sort((a, b) => b.height - a.height)[0];
    return {
      url: `${ARCHIVE}/download/${encodeURIComponent(doc.identifier)}/${encodeURIComponent(pick.name)}`,
      title: Array.isArray(doc.title) ? doc.title[0] : doc.title,
      creator: Array.isArray(doc.creator) ? doc.creator[0] : doc.creator,
      licenseUrl: doc.licenseurl,
      source: `${ARCHIVE}/details/${doc.identifier}`,
    };
  }
  throw new Error(`Internet Archive matched "${intent}" but no item had a usable MP4.`);
}

// ── sfx ─────────────────────────────────────────────────────────────────────

/**
 * Kenney's CC0 audio packs: no credit, no account, direct zips. Downloaded once
 * into the media cache on first use (or by `setup --only sfx`).
 */
const KENNEY_PACKS = {
  "ui-audio": "https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip",
  "interface-sounds": "https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip",
  "impact-sounds": "https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip",
  "digital-audio": "https://kenney.nl/media/pages/assets/digital-audio/216eac4753-1677590265/kenney_digital-audio.zip",
};
const KENNEY_DIR = path.join(CACHE_DIR, "sfx", "kenney");

/** Words a brief uses, mapped onto the words Kenney's file names use. */
const SFX_SYNONYMS = {
  whoosh: ["swish", "swoosh", "phaser", "maximize", "minimize", "switch"],
  swoosh: ["swish", "phaser", "maximize"],
  transition: ["switch", "phaser", "maximize", "minimize"],
  pop: ["pop", "drop", "click", "plop"],
  ding: ["confirmation", "bong", "select", "chime"],
  chime: ["confirmation", "bong", "select"],
  success: ["confirmation", "select", "powerup"],
  correct: ["confirmation", "select"],
  wrong: ["error", "glitch", "lowdown"],
  error: ["error", "glitch"],
  tick: ["tick", "click"],
  tap: ["click", "tick", "switch"],
  hit: ["impact"],
  thud: ["impact", "drop"],
  punch: ["impact"],
  reveal: ["maximize", "phaser", "powerup"],
  rise: ["phaserup", "powerup", "maximize"],
  typing: ["click", "tick", "switch"],
};

async function ensureKenney() {
  const have = fs.existsSync(KENNEY_DIR) ? fs.readdirSync(KENNEY_DIR) : [];
  for (const [pack, url] of Object.entries(KENNEY_PACKS)) {
    if (have.includes(pack)) continue;
    const zip = path.join(os.tmpdir(), `kenney-${pack}.zip`);
    await download(url, zip);
    const dir = path.join(KENNEY_DIR, pack);
    await fsp.mkdir(dir, { recursive: true });
    await run("unzip", ["-q", "-o", zip, "-d", dir], { maxBuffer: 1 << 24 });
    await fsp.rm(zip, { force: true });
  }
}

/** Every sound file in the Kenney library, relative to its root. */
function kenneyFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ogg|wav|mp3)$/i.test(entry.name)) out.push(path.relative(KENNEY_DIR, full));
    }
  };
  if (fs.existsSync(KENNEY_DIR)) walk(KENNEY_DIR);
  return out.sort();
}

/** Rank library files against an intent; ties broken by the seed. */
function rankSfx(files, intent, seed) {
  const words = intent.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 1);
  const wanted = new Set(words.flatMap((w) => [w, ...(SFX_SYNONYMS[w] ?? [])]));
  const scored = files.map((file) => {
    const tokens = path
      .basename(file)
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean);
    const score = tokens.reduce((n, t) => n + (wanted.has(t) ? 2 : [...wanted].some((w) => t.startsWith(w)) ? 1 : 0), 0);
    return { file, score };
  });
  const best = Math.max(0, ...scored.map((s) => s.score));
  if (!best) return [];
  const top = scored.filter((s) => s.score === best).map((s) => s.file);
  const start = seed % top.length;
  return [...top.slice(start), ...top.slice(0, start)];
}

async function cmdSfx(args) {
  const intent = args.intent || die("--intent is required");
  const out = args.out || die("--out is required");
  const provider = args.provider ?? "kenney";
  const seed = seedOf(intent);
  const seconds = args.seconds ? Number(args.seconds) : null;
  const toOut = async (src) => {
    await fsp.mkdir(path.dirname(path.resolve(out)), { recursive: true });
    await run(
      "ffmpeg",
      ["-y", "-i", src, ...(seconds ? ["-t", String(seconds)] : []), "-ar", "44100", "-ac", "2", path.resolve(out)],
      { maxBuffer: 1 << 24 },
    );
  };

  if (provider === "kenney") {
    try {
      await ensureKenney();
    } catch (err) {
      console.error(`free-media: Kenney library unavailable (${err.message.slice(0, 60)}) — trying openverse`);
    }
    const match = rankSfx(kenneyFiles(), intent, seed)[0];
    if (match) {
      await toOut(path.join(KENNEY_DIR, match));
      const pack = match.split(path.sep)[0];
      await credit(out, { license: "cc0", title: path.basename(match), creator: "Kenney", source: `https://kenney.nl/assets/${pack}`, provider: "kenney" });
      report("sfx", out, `kenney ${path.basename(match)}, CC0`);
      return;
    }
    console.error(`free-media: no Kenney sound matches "${intent}" — trying openverse`);
  } else if (provider !== "openverse") {
    die(`unknown sfx provider "${provider}"`);
  }

  const raw = `${path.resolve(out)}.download`;
  const { hit } = await openverseDownload("audio", `${intent} sound effect`, seed, raw);
  await toOut(raw);
  await fsp.rm(raw, { force: true });
  await credit(out, openverseCredit(hit));
  report("sfx", out, `openverse, ${hit.license} — credited`);
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

/**
 * Sources serve webm, ogv or arbitrary mp4; the composition needs h264 with no
 * audio track, trimmed to the beat it has to fill.
 */
async function transcodeClip(raw, out, seconds) {
  await fsp.mkdir(path.dirname(path.resolve(out)), { recursive: true });
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
}

async function cmdFootage(args) {
  const intent = args.intent || die("--intent is required");
  const out = args.out || die("--out is required");
  const seconds = Number(args.seconds ?? 5);
  const provider = args.provider ?? "wikimedia";
  const seed = seedOf(intent);

  if (provider === "archive") {
    const found = await archiveFootage(intent, seed);
    const raw = `${path.resolve(out)}.download`;
    await download(found.url, raw);
    await transcodeClip(raw, out, seconds);
    await fsp.rm(raw, { force: true });
    await credit(out, {
      title: found.title,
      creator: found.creator ?? "unknown",
      license: licenceLabel(found.licenseUrl),
      licenseUrl: found.licenseUrl,
      source: found.source,
      provider: "archive",
    });
    const dur = await ffprobe(out);
    report("footage", out, `internet archive, ${dur ? `${dur.toFixed(1)}s` : `${seconds}s`}, ${licenceLabel(found.licenseUrl)} — credited`);
    return;
  }

  if (provider !== "wikimedia") die(`unknown video provider "${provider}"`);

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

  await transcodeClip(raw, out, seconds);
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
 * The two local models keep their Python deps in separate venvs.
 *
 * System Python is externally managed on most distributions (PEP 668), so
 * installing there either refuses or breaks OS packages. Separate venvs rather
 * than one shared venv because the sizes are lopsided: MusicGen pulls torch
 * (hundreds of MB) and is optional — Openverse covers music — while Kokoro is
 * the default voice path and needs a fraction of that. Someone who only wants
 * voice should not download torch to get it.
 */
const VENVS = {
  kokoro: {
    dir: path.join(os.homedir(), ".venvs", "kokoro"),
    /** Install steps, in order. Each is a full argument list for `uv pip install`. */
    steps: [["kokoro-onnx", "soundfile"]],
    imports: "import kokoro_onnx, soundfile",
    /** `hyperframes tts` takes its interpreter from this variable. */
    envVar: "HYPERFRAMES_PYTHON",
    serves: "voice",
  },
  musicgen: {
    dir: path.join(os.homedir(), ".venvs", "musicgen"),
    // torch comes from PyTorch's CPU index deliberately. The default PyPI
    // resolution pulls CUDA wheels — gigabytes of GPU runtime for a model that
    // runs on CPU here anyway.
    steps: [
      ["torch", "--index-url", "https://download.pytorch.org/whl/cpu"],
      ["transformers", "soundfile"],
    ],
    imports: "import torch, transformers, soundfile",
    envVar: "FILMWRIGHT_MUSICGEN_PYTHON",
    serves: "music (local generation)",
  },
};

/**
 * Resolve the interpreter for one local model: an explicit override, then the
 * managed venv, then bare `python3` — the last so a machine that already has
 * the packages installed globally keeps working without a venv.
 */
async function venvPython(name) {
  const venv = VENVS[name];
  if (process.env[venv.envVar]) return process.env[venv.envVar];

  const managed = path.join(venv.dir, "bin", "python");
  if (fs.existsSync(managed)) return managed;

  const usable = await run("python3", ["-c", venv.imports], { timeout: 180_000 })
    .then(() => true)
    .catch(() => false);
  return usable ? "python3" : null;
}

/** Create one managed venv. Idempotent. */
async function createVenv(name) {
  const venv = VENVS[name];
  const managed = path.join(venv.dir, "bin", "python");

  // Skip if the packages are already reachable at all — an override, a venv
  // from a previous run, or a global install. Building a venv anyway would
  // re-download hundreds of megabytes to reach a state that already works.
  const existing = await venvPython(name);
  if (existing) {
    console.log(`${name}: already set up (${existing})`);
    return;
  }

  const uv = await run("uv", ["--version"]).then(() => true).catch(() => false);
  if (!uv) {
    const byHand = venv.steps
      .map((step) => `  ${venv.dir}/bin/pip install ${step.join(" ")}`)
      .join("\n");
    throw new Error(
      `uv is not installed. Get it from https://docs.astral.sh/uv/, or build ` +
        `the venv by hand:\n  python3 -m venv ${venv.dir}\n${byHand}`,
    );
  }

  console.log(`${name}: creating ${venv.dir} (serves ${venv.serves}) …`);
  await run("uv", ["venv", venv.dir], { timeout: 5 * 60_000 });
  for (const step of venv.steps) {
    console.log(`${name}: installing ${step[0]} …`);
    await run("uv", ["pip", "install", ...step], {
      timeout: 30 * 60_000,
      maxBuffer: 1 << 24,
      env: { ...process.env, VIRTUAL_ENV: venv.dir },
    });
  }
  console.log(`${name}: ready (${managed})`);
}

/**
 * Install the local models' Python dependencies.
 *
 * `--only <name>` installs one. MusicGen is the heavy, optional half, so
 * `--only kokoro` is a reasonable minimum for anyone using Openverse for music.
 */
async function cmdSetup(args) {
  const only = typeof args.only === "string" ? args.only : null;
  const known = [...Object.keys(VENVS), "sfx"];
  if (only && !known.includes(only)) {
    throw new Error(`unknown component "${only}". Known: ${known.join(", ")}`);
  }
  for (const name of only ? [only] : known) {
    if (name === "sfx") {
      await ensureKenney();
      console.log(`sfx: Kenney CC0 library ready (${kenneyFiles().length} sounds in ${KENNEY_DIR})`);
      continue;
    }
    await createVenv(name);
  }
}


async function cmdVoice(args) {
  const out = args.out || die("--out is required");
  const voice = args.voice ?? "af_heart";
  const speed = String(args.speed ?? "1.0");

  let text = args.text;
  if (args["text-file"]) text = await fsp.readFile(args["text-file"], "utf8");
  if (!text || !String(text).trim()) die("--text or --text-file is required");

  const version = process.env.FILMWRIGHT_HYPERFRAMES_VERSION ?? "0.8.153";
  await fsp.mkdir(path.dirname(path.resolve(out)), { recursive: true });

  // Same line, voice, speed and CLI version → same audio. A resumed run or a
  // revision that keeps the narration takes the cached file instead of paying
  // ~12 s a line to synthesise it again.
  const key = crypto
    .createHash("sha256")
    .update(JSON.stringify({ version, voice, speed, text: String(text).trim() }))
    .digest("hex")
    .slice(0, 32);
  const cached = path.join(CACHE_DIR, "voice", `${key}.wav`);
  if (!args["no-cache"] && fs.existsSync(cached) && fs.statSync(cached).size > 1024) {
    await fsp.copyFile(cached, path.resolve(out));
    const dur = await ffprobe(out);
    await credit(out, { license: "generated", provider: "kokoro", voice, text: String(text).trim() });
    report("voice", out, `kokoro ${voice}${dur ? `, ${dur.toFixed(2)}s` : ""}, cached`);
    return;
  }

  const python = await venvPython("kokoro");
  if (!python) {
    throw new Error(
      `Kokoro needs the kokoro-onnx package, which is not installed. ` +
        `Run \`node scripts/free-media.mjs setup --only kokoro\` once.`,
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
  await fsp.mkdir(path.dirname(cached), { recursive: true });
  await fsp.copyFile(path.resolve(out), cached).catch(() => {});
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

  for (const name of Object.keys(VENVS)) {
    const python = await venvPython(name);
    if (!python) {
      add(name, false, `run \`node scripts/free-media.mjs setup --only ${name}\` (serves ${VENVS[name].serves})`);
      continue;
    }
    try {
      await run(python, ["-c", VENVS[name].imports], { timeout: 180_000 });
      add(name, true, `ready (${python})`);
    } catch {
      add(name, false, `${python} cannot ${VENVS[name].imports} — re-run \`free-media setup --only ${name}\``);
    }
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
  await ping("archive", `${ARCHIVE}/advancedsearch.php?q=mediatype%3Amovies&fl%5B%5D=identifier&rows=1&output=json`);
  const sounds = kenneyFiles().length;
  add("kenney-sfx", true, sounds ? `${sounds} CC0 sounds cached` : "downloads on first use (or run `setup --only sfx`)");

  if (args.json) {
    console.log(JSON.stringify({ checks }, null, 2));
  } else {
    for (const c of checks) {
      console.log(`  ${c.ok ? GREEN : RED} ${c.name.padEnd(14)} ${c.detail}`);
    }
  }
  // MusicGen is optional — Openverse covers music without it. Everything else
  // failing means a provider the user can pick would not actually work.
  // MusicGen is optional: Openverse covers music without it.
  const optional = new Set(["musicgen"]);
  process.exit(checks.some((c) => !c.ok && !optional.has(c.name)) ? 1 : 0);
}

// ── main ────────────────────────────────────────────────────────────────────

const COMMANDS = {
  image: cmdImage,
  music: cmdMusic,
  footage: cmdFootage,
  voice: cmdVoice,
  sfx: cmdSfx,
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
