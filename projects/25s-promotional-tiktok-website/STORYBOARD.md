---
format: 1080x1920
duration: 25s
message: "Practise on papers that behave exactly like MECEE-BL — and find out where your marks actually went."
arc: Hook → Problem → Product intro → Proof (blueprint weights) → Proof (AI tutor) → CTA
audience: Nepali +2 science students sitting the MECEE-BL (IOM) MBBS/BDS entrance exam
mode: autonomous
music: driving minimal underscore, steady pulse, restrained tension, small hopeful lift at the close
---

## Video direction

**Palette (from `frame.md` — never invented).** Two registers, one per frame, never mixed. **Dark register** (Frames 1, 2, 4, 5): `ink-black` ground, `cream` type, `fire-orange` (the brand teal) as the lone accent — kickers, the hero numeral, the one inked clause, bar fills, the `/` bullet. **Teal register** (Frames 3, 6): `fire-orange` as full environment with `ink-black` type on it and the `ink-on-orange` opacity ladder as the muted tones. Cream on teal does not exist. No second hue anywhere; no gradient ground, no shadow, no radius.

**Type (by role).** Barlow `display` / `h1` / `h2` lowercase weight 900, negative-tracked, fit-to-measure (≤2 words → `display`, 3–4 → `h1`, 5+ → `h2`), one display moment per frame. IBM Plex Mono is chrome only — uppercase, tracked, for kickers, catalogue numbers, subject labels and the `/` marker. Numerals are `tabular-nums`. Every figure on screen traces to the captured DOM (200 · 3 hours · −0.25 · 40 · 40 · 50 · 50 · 20 · 2,286); nothing is invented.

**Motion grammar + reveal model.** One camera, one feel. Long-tail decel settles (`power3`) on everything — smooth, never bouncy; no `back.out` / `elastic` defaults. Every frame is **paced to the voiceover**: at t=0 only what the voice is saying then is on screen, and each further piece reveals on its own spoken cue, weighted into the back ~50% of the shot. Internal seams are velocity-matched cuts (`cut-catalog.md`), never slideshow fades. All motion lives in the paused GSAP timeline — no CSS `transition`/`@keyframes`, no `repeat`/`yoyo`, no randomness, entrances via `fromTo`.

**Rhythm / held-frame allocation.** The piece breathes in a 2-3 pattern: Frames 1, 2 and 4 are reveal-dense (numbers and rows arriving on cue); **Frame 3 is the deliberate held breather** — the lockup lands and then simply reads, the stillness carrying the identity beat; **Frame 6 holds its last ~35%** on the URL so the one thing the viewer must retain sits still and unhurried. Frame 5 is mid-energy: two typed reveals, then still. Aliveness during a hold is subtle low-amplitude jitter only (`sine-wave-loop`) — no breathing, no back-half pan or push.

**Caption-band keep-out.** Captions are burned in. Every frame plans its content into the **top ~83%** of the 1080×1920 canvas; the bottom ~17% stays clear of anything load-bearing.

**Characters + glyphs (v3).** Every frame carries a real human presence and at least one hairline glyph. The people are photographic — live-action stills, not pictograms — duotoned into the frame's own register (ink-black -> cool cream on the dark frames; ink on teal for Frames 3 and 6), so the palette rule still holds: no second hue, no gradient ground, no drop shadow. Plates are hard-edged and seated on existing structure (a hairline, a rule, the frame edge), and every one enters on an existing spoken cue with the frame's own clip-path reveal, then holds still. Glyphs are 1px-stroke marks in the accent (or ink on teal), never filled illustrations.

**Negative list.** Never: uppercase Barlow display · a second accent hue · cream type on the teal ground · drop shadow, rounded surfaces (save nav dots) or gradient grounds · serif companions or Barlow chrome · nav bars, footers, scrollbars, browser chrome or real cursors · floating bokeh / "AI" gradients · more than three bullets or two display moments in a frame. And both motion failure modes: **slideshow** (everything dumped in the first 25%, then frozen) and **screensaver** (elements drifting independently to fake life).


## Frame 1 — The real paper

- type: hook
- blueprint: dataviz-countup
- register: dark
- scene: Three exam facts hit one after another; "200" explodes to fill the frame, then the clock and the penalty land beneath it
- duration: 5.483s
- poster: 3.4s
- transition_in: cut
- status: animated
- voiceover: "Two hundred questions. Three hours. Minus zero point two five for every wrong answer."
- asset_candidates: none
- src: compositions/frames/01-the-real-paper.html

Cold open on the exam itself, not the product. A Nepali medical aspirant knows these three numbers as dread; putting them on screen with no context is the tension. `200` is the hero numeral (Barlow 900, teal), `3 hours` and `−0.25` arrive as the voice names them. No brand yet — the viewer should not know this is an ad for the first four seconds.

Source: hero copy — "200 questions, three hours, +1 right and −0.25 wrong, Mental Agility Test included."

- persuasion: Cold-open tension — the exam's own arithmetic, before any pitch
- beat: dread
- blueprint: dataviz-countup (Adapt)
- focal: the `200` hero numeral
- roles: no captured files consumed — the numeral, rule stub and hairlines are the frame.md component set; the right column carries a live-action candidate plate (`assets/images/f01-candidate.jpg`, duotoned to the dark register) and three hairline row glyphs
- sfx: impact-bass-2, click-soft

Adapt: keep the signature **value-scaled count-up** as the spine, but drop the icon-burst and the camera lean-in — Broadside is a flat plane, so the escalation is carried by the numeral's own scale growth and hairline structure instead of depth. Three data facts, not one, because the voice names three.

Scene 1 (0.0–2.0s): ink-black field, ~60% empty. A mono kicker (`MECEE-BL · MBBS & BDS · NEPAL`) wipes on top-left over a short teal rule stub, then `200` **counts up 0→200 with its scale growing as the value climbs** (`counting-dynamic-scale`) — a teal Barlow-900 numeral seated in the upper third, ~45% of the canvas width. Nothing else exists yet. Upper-third anchor, 2 depth layers (hairline chrome behind, numeral in front).
Scene 2 (2.0–3.2s): as the voice says "questions", a cream mono label sets under the numeral on a 1px hairline; in the empty right column, beyond the vertical rule, a flat pictogram **candidate rises from behind the frame's own bottom hairline** — a hunched sitter in lifted-ink gray, a cream answer sheet and a teal pen — and writes in a short finite pass. Nothing else is added. On "Three hours", `3 HOURS` **hard-cuts in** (`discrete-text-sequence`) as a second stat row beneath the first, its own 1px hairline wiping open left→right beneath it. Layout resolves from single hero to a stacked stat column, left-anchored.
Scene 3 (3.2–5.483s): on "minus zero point two five", the third row lands — `−0.25` in teal, the largest thing after `200`, entering on a smooth long-tail settle (`spring-pop-entrance`, smooth register) with `PER WRONG ANSWER` mono beneath it. The candidate's head dips once on the penalty and settles low. All three rows now read as one column; the frame then **holds completely still** for the last beat. No jitter, no push, no drift — the three numbers simply read.

## Frame 2 — Not what you're practising on

- type: pain_point
- blueprint: kinetic-type-beats
- register: dark
- scene: The stat frame's numbers wipe away and one flat accusation replaces them, with the payoff clause inked teal
- duration: 2.539s
- poster: 2.8s
- transition_in: cut
- status: animated
- voiceover: "And you're practising on sets that look nothing like it."
- asset_candidates: none
- src: compositions/frames/02-not-what-youre-practising-on.html

The turn. One statement, one orange clause, ~55% empty — the Statement treatment exactly as `frame.md` defines it. The pain is not "studying is hard," it is "your practice is the wrong shape," which is the specific thing this product fixes. Hard cut in from Frame 1 so the numbers are yanked away mid-thought.

- persuasion: Pain agitation — the practice is the wrong shape
- beat: recognition
- blueprint: kinetic-type-beats (Reproduce)
- focal: the inked clause "nothing like it"
- roles: no captured files consumed — Statement treatment; a live-action practice-desk plate (`assets/images/f02-wrong-practice.jpg`) fills the lower field beneath the clause, plus one wrong-shape kicker glyph
- sfx: impact-bass-2

Scene 1 (0.0–0.9s): the stat column is gone on a hard cut. Ink-black, chrome suppressed, ~55% empty. `and you're practising on sets` enters as the first beat — Barlow-900 lowercase cream, left-anchored, upper-middle, set as two tight lines — via **per-word staggered reveal** on a shared percussive onset grid (`kinetic-beat-slam`), long-tail settle. This frame is the shortest in the piece; two beats, not three.
Scene 2 (0.9–1.8s): `that look nothing like it` slams in as the second and final beat directly beneath, one display step down so the block stays ≤78cqw (`kinetic-beat-slam`), its last three words inked **teal** — the frame's one accent and one display moment. Left-lean, 2 depth layers.
Scene 3 (1.8–2.539s): a teal **highlight sweep** draws under `nothing like it` as the voice clears it (`css-marker-patterns`), then everything **holds dead still** — the accusation reads, nothing moves.

## Frame 3 — This is IOM Mock

- type: product_intro
- blueprint: logo-assemble-lockup
- register: teal (fire-orange slot)
- scene: The register flips to full teal; the IOMMock mark assembles from its two rounded bars and the wordmark completes beside it
- duration: 4.395s
- poster: 3.6s
- transition_in: zoom-through
- status: animated
- voiceover: "This is IOM Mock. Every paper, built to the real exam blueprint."
- asset_candidates: none
- src: compositions/frames/03-this-is-iom-mock.html

The identity moment — this is the account's first video, so the mark has to be planted properly rather than flashed. Full teal environment, dark ink on it (ink-on-fire is absolute; no cream on teal). The lead line under the lockup carries "MECEE-BL" as type since the voice deliberately skips the acronym.

- persuasion: The name-drop and the promise — value stated plainly, once
- beat: arrival
- blueprint: logo-assemble-lockup (Adapt)
- focal: the IOMMock mark + wordmark lockup
- roles: no captured files consumed — mark rebuilt inline as SVG from the captured header DOM; a live-action student inked onto the teal ground (`assets/images/f03-student.png`) and a blueprint glyph anchor the lower field
- sfx: whoosh-short, impact-bass-2

Adapt: keep the signature **"the mark comes to exist on screen"** build, but strip the orbiting universe and the 3D tilt — Broadside forbids depth and gradient, so the assembly is the mark's own two rounded bars sliding into their cross and the wordmark cascading beside them on a flat teal field. This is the video's **held breather**: it assembles, then stops.

Scene 1 (0.0–1.3s): the register flips to full teal. Empty field, then the two rounded bars of the IOMMock mark **expand outward from the shared center** into their crossed position (`center-outward-expansion`) — vertical bar first, horizontal second — in dark ink on the teal ground, seated in the upper-middle at ~22% of canvas width. Nothing else on screen. Centered, 2 depth layers.
Scene 2 (1.3–2.5s): as the voice says the name, the wordmark **cascades letter-group by letter-group** to the right of the mark on a staggered slide with a smooth long-tail settle, no overshoot — `IOM` then `Mock` — completing the lockup; `BY NEPSOR` sets beneath it in mono chrome at 40% ink. Layout resolves to a centered horizontal lockup.
Scene 3 (2.5–4.395s): on "built to the real exam blueprint", the lead line — `every paper, built to the real MECEE-BL blueprint` — reveals **word by word** beneath the lockup (`dynamic-content-sequencing`) in 75% ink, one display moment above it. The frame then **holds completely still** for its final beat: no jitter, no drift. The stillness is the point — this is the identity beat.

## Frame 4 — Every subject at its official weight

- type: feature_showcase
- blueprint: grid-card-assemble
- register: dark
- scene: Five subject rows build downward, each with its official MECEE-BL question count and a bar sized to that count; the total resolves to 200
- duration: 5.291s
- poster: 3.8s
- transition_in: push-slide LEFT
- status: animated
- voiceover: "Zoology, Botany, Chemistry, Physics, Mental Agility — each at its official weight."
- asset_candidates: none
- src: compositions/frames/04-official-weight.html

The evidence beat for Frame 3's claim. This is the frame that proves "built to the blueprint" is a fact rather than a slogan: the five subjects at their real counts, summing to the 200 from Frame 1 — which quietly closes the loop the hook opened.

Verified counts from the captured DOM: Zoology 40 · Botany 40 · Chemistry 50 · Physics 50 · Mental Agility Test 20 = 200.

- persuasion: Evidence — the blueprint claim proven with the real per-subject counts
- beat: proof
- blueprint: grid-card-assemble (Adapt)
- focal: the five-row subject weight table resolving to 200
- roles: no captured files consumed — bar-track + stat-card components from frame.md; every figure verified against the captured DOM. Five hairline subject glyphs sit beside the labels and a knocked-back live-action exam-hall plate (`assets/images/f04-exam-hall.jpg`) carries the candidates behind the total
- sfx: click-soft, impact-bass-2

Adapt: keep the signature **staggered self-assembly into a resolved layout**, but the 9:16 canvas turns the card grid into a stacked five-row list (per `frame.md`'s aspect table: Stat Grid stacks on 9:16). Each row is a hairline stat-card, not a boxed tile. Rows arrive on their spoken subject, one per name — the assembly IS the voiceover's list.

Scene 1 (0.0–1.0s): ink-black with the top and bottom hairline chrome bars present (this is the frame's dense exception). Mono kicker `EVERY SUBJECT AT ITS OFFICIAL WEIGHT` wipes on top-left; the empty five-slot column is implied only by a single 1px hairline drawing down the left margin (`svg-path-draw`).
Scene 2 (1.0–3.9s): the five rows **assemble one per spoken subject** (`center-outward-expansion`, direct-into-slot form) — `ZOOLOGY 40`, `BOTANY 40`, `CHEMISTRY 50`, `PHYSICS 50`, `MENTAL AGILITY 20` — each row a mono label left, a teal Barlow-900 numeral right, and a teal **bar filling left→right to a width proportional to its count** (`stat-bars-and-fills`) as the row lands. Nothing arrives before its name is spoken. Full-width strip stack, left-anchored, 3 depth layers (hairline grid / bars / numerals).
Scene 3 (3.9–5.291s): on "each at its official weight", a hairline rule closes the column and `200` **counts up across the five row values** (`counting-dynamic-scale`) in the total slot beneath it, mono `TOTAL` beside it — quietly closing the loop the hook opened. Then still; subtle jitter (`sine-wave-loop`, low amplitude) on the total only.

## Frame 5 — A tutor that read your paper

- type: feature_showcase
- blueprint: prompt-type-submit-generate
- register: dark
- scene: A student's question types into a hairline panel — "Why is my answer wrong? I picked B." — and the tutor's reply lands underneath it
- duration: 3.52s
- poster: 3.6s
- transition_in: push-slide LEFT
- status: animated
- voiceover: "Get one wrong, and a tutor that's read your paper explains why."
- asset_candidates: none
- src: compositions/frames/05-tutor-read-your-paper.html

The differentiator, and the emotional beat: the fear is not getting things wrong, it is not knowing why. Copy is lifted verbatim from the page's own AI-tutor example so the claim is source-traceable — the student's question and the opening of the tutor's answer ("B is what you get if you balance the atoms before the charge.").

- persuasion: The differentiator — the fear isn't being wrong, it's not knowing why
- beat: reassurance
- blueprint: prompt-type-submit-generate (Adapt)
- focal: the tutor's reply line
- roles: no captured files consumed — the exchange rebuilt as a Broadside hairline panel; both lines quoted verbatim from the captured AI-tutor section. A live-action student reading the reply back (`assets/images/f05-tutor-reply.jpg`) rises under the panel, with ask/answer glyphs in the right margin
- sfx: key-press, impact-bass-2

Adapt: keep the signature **"watch me ask, watch it answer"** type-and-respond loop, but there is no product chrome, no cursor and no status theater — Broadside has no cards or radii, so the exchange is two hairline-ruled text blocks on the flat ink field, and the "generate" beat is the reply setting word by word rather than a streaming UI.

Scene 1 (0.0–1.4s): ink-black, chrome suppressed. Mono kicker `AI TUTOR · ON YOUR OWN PAPER` top-left. Beneath it a wrong-answer stub sets instantly — mono `Q. 14` and a teal `✗ YOU PICKED B` — then the student's line **types on character by character behind a teal block caret that blinks on a finite, stepped tween** (`discrete-text-sequence`): `Why is my answer wrong? I picked B.` Left-anchored, upper-middle, ~50% empty below.
Scene 2 (1.4–2.6s): the caret clears and a 1px hairline wipes open across the full measure — the seam between ask and answer, cut at the caret's own velocity. As the voice reaches "a tutor that's read your paper", the reply reveals **word by word** (`dynamic-content-sequencing`) in cream Barlow-700: `B is what you get if you balance the atoms before the charge.` Two-block vertical split, 3 depth layers. This is the frame's one display moment — no second quoted line, the shot is only 3.5s.
Scene 3 (2.6–3.52s): on "explains why", a teal **highlight sweep** draws under `before the charge` (`css-marker-patterns`) — the clause naming the actual mistake. The panel **holds still**; only the caret's final blink remains, a finite tween, not a loop.

## Frame 6 — Sit your first paper free

- type: cta
- blueprint: kinetic-type-beats
- register: teal (fire-orange slot)
- scene: Back to full teal; the closing line snaps in beat by beat and settles on the URL with the mark above it
- duration: 3.883s
- poster: 3.0s
- transition_in: zoom-through
- status: animated
- voiceover: "Sit your first paper free tonight. Entrance dot nepsor dot com."
- asset_candidates: none
- src: compositions/frames/06-sit-your-first-paper-free.html

Bookends Frame 3's teal so the piece reads as one object rather than six. The free-forever proof line ("free forever · no card") is the objection-killer and rides as mono chrome under the URL, which holds longest on screen — this is the one thing a viewer must retain.

- persuasion: The ask, plus the objection-killer — free, no card
- beat: invitation
- blueprint: kinetic-type-beats (Reproduce)
- focal: the URL
- roles: no captured files consumed — mark rebuilt inline as SVG, same construction as Frame 3; a live-action student inked onto the teal ground (`assets/images/f06-student.png`) holds the right column and an arrow glyph closes the URL line
- sfx: impact-bass-2, whoosh-short

Scene 1 (0.0–1.0s): register flips back to full teal. The IOMMock mark is already seated small in the upper third in dark ink (arriving on the transition, not re-assembled — it is the same object Frame 3 introduced). `sit your first paper` slams in beneath it as the first beat, Barlow-900 lowercase ink, left-anchored (`kinetic-beat-slam`).
Scene 2 (1.0–2.0s): `free tonight.` lands as the second beat directly below, one size step down, on the same onset grid (`kinetic-beat-slam`) — the two lines now read as one statement. Mono `FREE FOREVER · NO CARD · NOTHING AUTO-RENEWS` sets under them at 55% ink as the objection-killer.
Scene 3 (2.0–3.883s): a 1px ink rule draws the full measure (`svg-path-draw`) and `entrance.nepsor.com` reveals beneath it in Barlow-800 — the last thing on screen and the only thing still moving, entering on a long-tail settle. The frame then **holds completely still for its final ~35%**, the URL centred in the read. This is the video's only real exit beat; everything else clears via the harness transition.
