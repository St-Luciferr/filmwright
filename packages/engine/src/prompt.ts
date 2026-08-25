import { ASPECTS, type RevisionNote, type VideoSpec } from "./types";

const yamlString = (s: string) => JSON.stringify(s);

/**
 * The BRIEF.md the workflows read. Writing it up front is what makes an
 * unattended run possible: the HyperFrames router opens with an intent-capture
 * step that would otherwise stop and ask the user to confirm these fields.
 */
export function buildBrief(spec: VideoSpec): string {
  const { width, height } = ASPECTS[spec.aspect];
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

Read those files first and carry on from where they stop. Do not regenerate
anything listed above — re-running capture, voiceover or music wastes the budget
that ran out last time. Rebuild an artefact only if you open it and find it
genuinely unusable, and say so in the log when you do.

Your priority is to reach a rendered MP4. Spend the budget on the steps that are
still missing.`
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

Do not regenerate assets that already exist unless a note requires it.

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

## What to do

1. Read the \`/hyperframes\` skill first — it is the mandatory entry point and
   routes to the owning workflow. \`BRIEF.md\` names the workflow to use:
   **${spec.workflow}**.
2. Skip the intent-capture / brief-confirmation step. The brief is already
   confirmed; do not re-ask its questions.
3. Run that workflow all the way through: script, storyboard, frame
   compositions, media, audio, captions, assembly.
4. Run \`npm run check\` and fix every error it reports. Warnings should be
   reviewed and fixed where they affect the output.
5. Render with \`npm run render\`. The job is not finished until
   \`renders/*.mp4\` exists.

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

- \`mcp__studio__request_review\` — call it exactly three times:
  1. right after \`SCRIPT.md\` is written,
  2. right after \`STORYBOARD.md\` is written,
  3. immediately before you render.
  Summarise what you are asking them to sign off in plain language. If they
  ask for changes, make them and call it again for the same stage.

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
