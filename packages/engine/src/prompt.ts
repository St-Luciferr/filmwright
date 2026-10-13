import { ROOT } from "./config";
import {
  ASPECTS,
  KOKORO_VOICES,
  MEDIA_KINDS,
  findProvider,
  resolveProviders,
  type MediaKind,
  type MediaProviders,
  type RevisionNote,
  type VideoSpec,
} from "./types";

const yamlString = (s: string) => JSON.stringify(s);

/**
 * The BRIEF.md the workflows read. Writing it up front is what makes an
 * unattended run possible: the HyperFrames router opens with an intent-capture
 * step that would otherwise stop and ask the user to confirm these fields.
 */
export function buildBrief(spec: VideoSpec): string {
  const { width, height } = ASPECTS[spec.aspect];
  const media = effectiveProviders(spec);
  const front = [
    "---",
    `workflow: ${spec.workflow}`,
    "flow: automation",
    "storyboard: yes",
    `destination: ${spec.destination}`,
    `aspect: ${width}x${height}`,
    `language: ${spec.language}`,
    `length: ${spec.seconds}s`,
    `narration: ${spec.narration ? "yes" : "no"}`,
    `captions: ${spec.captions ? "yes" : "no"}`,
    `music: ${spec.music ? "yes" : "no"}`,
    spec.audience ? `audience: ${yamlString(spec.audience)}` : null,
    spec.sourceUrl ? `source: ${spec.sourceUrl}` : null,
    "media:",
    `  voice: ${media.voice}${media.voiceId ? ` (${media.voiceId})` : ""}`,
    `  music: ${media.music}`,
    `  image: ${media.image}`,
    `  video: ${media.video}`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  const assets = spec.sourceUrl
    ? `Capture the product's own visuals from ${spec.sourceUrl} and use them for the hero moment.`
    : "No source URL was supplied — design the visuals from the intent above.";

  return `${front}

## Intent

${spec.prompt.trim()}

## Assets

${assets}

## Customizations

- Target length is ${spec.seconds}s at ${width}x${height} for ${spec.destination}.
- Narration: ${spec.narration ? "voiceover required" : "no voiceover — carry the message visually"}.
- Captions: ${spec.captions ? "burned-in captions required, legible muted" : "no burned-in captions"}.
- Music: ${spec.music ? "music bed required, ducked under any narration" : "no music bed"}.
- Media sources are fixed for this run: voice \`${media.voice}\`, music
  \`${media.music}\`, imagery \`${media.image}\`, footage \`${media.video}\`.
  All are free and need no credential. Nothing else may be used.

## Notes

- This brief was generated from a single prompt submitted to the filmwright platform.
  Treat the frontmatter as confirmed intent; fill in every creative decision it
  does not pin down rather than asking for clarification.
`;
}

/**
 * The change list for a revision run.
 *
 * Each note carries the frame that was on screen at its timestamp, resolved
 * from index.html rather than guessed — that is what turns "the logo at 0:08 is
 * too small" into an instruction pointing at one file.
 */
export function buildRevision(notes: RevisionNote[]): string {
  const lines = notes.map((n) => {
    const where =
      n.timeSec !== undefined
        ? `at **${formatSeconds(n.timeSec)}**${n.clipId ? ` (frame \`${n.clipId}\`)` : ""}`
        : "**overall**";
    return `- ${where} — ${n.text}`;
  });
  return lines.join("\n");
}

const formatSeconds = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};

/**
 * The providers this run may actually use.
 *
 * The narration and music toggles win over the provider pickers: a run with
 * "no voiceover" ticked has no voice provider regardless of what was selected,
 * and saying so once here keeps the contradiction out of the prompt.
 */
function effectiveProviders(spec: VideoSpec): MediaProviders {
  const p = resolveProviders(spec.providers);
  const voice = spec.narration ? p.voice : "none";
  return {
    ...p,
    voice,
    music: spec.music ? p.music : "none",
    // A voice id is meaningless without a voice provider, and printing one
    // reads as though narration is still coming.
    voiceId: voice === "kokoro" ? p.voiceId : undefined,
  };
}

/**
 * The media section of the agent prompt.
 *
 * This is the load-bearing half of the "free platform" promise. The skills the
 * agent loads default to HeyGen for voice, music, images and avatar video, and
 * a run that follows them spends real turns discovering there is no credential
 * — that is measured behaviour from a previous run, not a hypothetical. So the
 * forbidden paths are named explicitly, and every permitted one is handed over
 * as a command that works.
 */
function describeMedia(spec: VideoSpec): string {
  const p = effectiveProviders(spec);
  const recipe = (kind: MediaKind) => {
    const provider = findProvider(kind, p[kind]);
    if (!provider) return "";
    const body = provider.recipe.replaceAll("<ROOT>", ROOT).replaceAll(
      "<voiceId>",
      p.voiceId ?? "af_heart",
    );
    const voice =
      kind === "voice" && p.voiceId
        ? ` — ${KOKORO_VOICES.find((v) => v.id === p.voiceId)?.label ?? p.voiceId}`
        : "";
    return `### ${kind} — ${provider.label}${voice}\n\n${body}\n${
      provider.attribution ? `\n${provider.attribution}\n` : ""
    }`;
  };

  const ROOT_HELPER = `node ${ROOT}/scripts/free-media.mjs`;
  return `## Media — free sources only

This machine has **no paid media credentials of any kind**, by design. The
person commissioning this video chose the sources below, and they are the only
ones you may use.

**Do not attempt, and do not spend a single turn checking for:** the \`heygen\`
CLI or any HeyGen endpoint (the media-use skill defaults to it — ignore that
default), ElevenLabs, Lyria, \`codex\` image generation, mflux, LTX, or any
provider that wants an API key, login or subscription. There is no credential
to find. Checking for one is wasted budget.

That includes the media-use skill's **local-model ladder** — \`python -m kokoro\`,
\`pip install kokoro\`, fish-speech and friends. Those packages are not installed
here, and the skill's own probe only checks that \`python\` is on PATH, so the
call is made and fails after the turn is spent. The commands below are the
installed path; go straight to them.

Ignore the provider cascade in the \`media-use\` skill. Use these commands
instead. They run from the project directory, write straight into
\`assets/\`, seed themselves from the intent so a re-run is reproducible, and
record Creative Commons attribution automatically.

${MEDIA_KINDS.map(recipe).join("\n")}
### sfx — Kenney (CC0)

${ROOT_HELPER} sfx --intent "<what it sounds like: whoosh, ding, click, impact, error>" --out assets/sfx/name.wav
Picks from Kenney's CC0 sound packs (no credit needed), downloaded once and
cached; falls back to a Creative Commons search when nothing matches. Do not use
\`media-use resolve --type sfx\` beyond its small bundled library — its catalog
search needs the HeyGen CLI.

If a chosen provider fails, do not reach for a paid one. Retry it, then fall
back within the free set (Pollinations → Openverse for images; MusicGen →
Openverse for music; any footage source → animated stills), and say in your
summary which provider actually produced each asset and why you switched.

Synthesised voice lines are cached by text, voice and speed, so regenerating an
unchanged line is instant — there is no need to work around re-running it.
`;
}

/** The instruction that drives the unattended authoring session. */
export function buildAgentPrompt(
  spec: VideoSpec,
  slug: string,
  existing?: string,
  interactive = false,
  decisions?: string,
  revision?: { notes: string; version: number },
): string {
  const { width, height } = ASPECTS[spec.aspect];

  const resume = existing
    ? `

## This is a CONTINUATION — work already exists

A previous run on this project stopped before finishing. Its output is on disk
and is **yours to reuse**:

${existing}

Everything above is established fact, read off the project this run inherits.
**Do not survey the project to confirm it.** A continuation that re-reads every
frame to rebuild the picture spends its budget learning what it was just told;
open a file when you are about to change it, and not before.

Do not regenerate anything listed above — re-running capture, voiceover or music
wastes the budget that ran out last time. Rebuild an artefact only if you open it
and find it genuinely unusable, and say so in the log when you do.

Your priority is to reach a rendered MP4. Go straight to the first step that is
still missing and spend the budget there.`
    : "";

  // A revision replaces the whole "produce a video" framing: the video exists,
  // and the job is to change specific things about it without disturbing the
  // rest. Saying so up front stops the agent re-running the whole workflow.
  if (revision) {
    return `You are making a **revision** to a video that is already finished and rendered.

The working directory is the HyperFrames project "${slug}" (${width}x${height}).
It has a complete composition and a rendered MP4 in \`renders/\`. This is
version ${revision.version}.

## What the client wants changed

${revision.notes}

## How to do it

1. Read \`STORYBOARD.md\` and \`index.html\` to map each timestamp to the
   frame that is on screen at it. \`index.html\` holds the real timing in
   \`data-start\` / \`data-duration\`; the frame named in each note above was
   resolved from it, so trust it.
2. Make the **smallest change that satisfies each note.** Do not redesign
   anything that was not criticised, do not re-record voiceover that no note
   mentions, and do not re-capture the site.
3. If a note is ambiguous or you believe it would hurt the video, ${
      interactive
        ? "use `mcp__studio__ask_user` rather than guessing"
        : "make the most conservative reading of it and say what you assumed"
    }.
4. If a change alters timing, re-check that the audio still lines up and that
   the root \`data-duration\` still matches the content.
5. Run \`npm run check\` and fix every error.
6. Re-render with \`npm run render\`.

Do not regenerate assets that already exist unless a note requires it. If a
note does require new media, source it with the commands below — the same free
providers this video was built from.

${describeMedia(spec)}

When the new render exists, reply with one line per note saying what you
changed.`;
  }

  const opening = interactive
    ? "You are producing a finished video end to end, consulting the person who commissioned it at the points below."
    : "You are producing a finished video end to end, unattended.";

  const settled = decisions
    ? `

## Decisions already settled

These were answered on a previous run. They are final — do not ask them again:

${decisions}`
    : "";

  return `${opening}${resume}${settled}

The working directory is an initialised HyperFrames project named "${slug}"
(${width}x${height}). \`BRIEF.md\` is already written and is the **confirmed
intent** for this run.

## How this run works

The platform drives this video **one stage at a time**. You will be asked for
exactly one stage, and the next instruction arrives only once the platform has
checked that the stage's artifact is really there and really valid.

1. Read the \`/hyperframes\` skill first — it is the mandatory entry point and
   routes to the owning workflow. \`BRIEF.md\` names the workflow to use:
   **${spec.workflow}**.
2. Skip the intent-capture / brief-confirmation step. The brief is already
   confirmed; do not re-ask its questions.
3. **Do the stage you are asked for, and stop.** Do not run ahead into later
   stages — work done out of order is not credited, and a stage you skip past
   will simply be asked for again.
4. End each stage by replying with a short plain-language summary of what you
   produced. At the gated stages that summary is what a person signs off, so
   write it for them, not for a log.

You do not run \`npm run check\` or \`npm run render\` yourself — the platform
runs both, and hands you anything check reports, grouped by file, so you can fix
it. The run is finished when the platform says so.

You are the **orchestrator**, not the frame author. At the frames stage the
platform builds one packet per frame and you dispatch one \`frame-worker\`
sub-agent per frame, in parallel — the instruction for that stage spells it
out. A check finding inside a frame file goes back to a fresh worker for that
frame, with the finding in its dispatch context.

To learn what is on the timeline, run \`npx hyperframes timeline --json\` rather
than reading \`index.html\` and every frame file; it costs a fraction of the
tokens and cannot be out of date.

${describeMedia(spec)}
## ${interactive ? "Working with the person who commissioned this" : "Decisions"}
${
  interactive
    ? `
You have two tools for involving them. Use them — a video built on a wrong
assumption wastes far more than a question does.

- \`mcp__studio__ask_user\` — when a decision would **materially change the
  finished video** and the brief does not settle it. Good reasons to ask: the
  visual approach for the hero beat, which of several angles the story takes,
  a factual claim you cannot verify, a tone call the brief leaves open. Offer
  2-4 concrete options with honest trade-offs. Ask early, while a change is
  still cheap. Do **not** ask about things the brief already answers, or about
  small craft decisions that are yours to make.

You do **not** need to ask for the fixed sign-off points. The platform opens
those gates itself — after the script, after the storyboard, and before the
render — using your end-of-stage summary as what it puts in front of them. If
they ask for changes, you will be told, and the run stays on that stage until
they are happy.

- \`mcp__studio__request_review\` — available if you want sign-off on something
  the fixed gates do not cover. You will rarely need it.

They may also send you a note mid-run. Treat it as direction from the client:
act on it, and say what you changed.

Budget your questions — aim for at most three \`ask_user\` calls across the run.
`
    : `
- **Never ask the user anything.** There is no human watching. Where the brief
  is silent, make a decisive, well-reasoned choice and note it in the brief's
  Notes section.`
}

## Rules for this run

- Write \`SCRIPT.md\` and \`STORYBOARD.md\` before authoring frames — the
  platform reports progress from those files.
- Put frame compositions in \`compositions/frames/\` so each one is tracked.
- Do not start a foreground preview server. If you need to inspect the
  composition, use \`npx hyperframes snapshot\` or
  \`npx hyperframes preview --background\` and stop it before you finish.
- Everything must be deterministic: no \`Date.now()\`, no \`Math.random()\`, no
  network fetches at render time.
- Stay inside this project directory.

When the render exists, reply with a two-line summary: the video's through-line,
and the output path.`;
}
