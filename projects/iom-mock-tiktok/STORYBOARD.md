---
format: 1080x1920
duration: 22s
message: "Negative marking is what's costing you the rank — stop guessing, start seeing where you stand"
arc: PAS — hook → pain → agitation → solution tease → product intro → proof → CTA
audience: "Nepali MBBS/BDS aspirants preparing for MECEE-BL"
mode: collaborative
music: tense minimal underscore with a hard pulse, resolving bright and confident
---

## Video direction

Shared invariants for every frame. Per-frame Scene lines carry only the delta —
none of this is restated below.

**Palette system** (from `frame.md`, nothing invented) — the film has exactly
one accent. Ground is `ink-black` `#042A2C` (brand-950) on every frame; primary
type is `cream` `#FFFFFF`; secondary is `cream-muted` `#C5CAD1`; mono chrome and
de-emphasis are `cream-hint` `#737D89`; rules and panel edges are `border-dark`
`#134245`. The accent `fire-orange` `#1DA6AB` (brand-500) is rationed to exactly
two jobs and never decorates: **what guessing costs** (`−0.25`, `9.5`, `≈1,000`)
and **what the product returns** (`full mocks, free.`, the rank band). Because
the accent carries both the wound and the cure, the film's colour logic *is* its
argument. The three captured screenshots are the only light surfaces that ever
appear — they read as light entering a dark world, which is the arc in one image.

**Type** — by role from `frame.md`: `display`/`stat-value` (Barlow 800, tabular,
negative-tracked) for every hero numeral; `label` (IBM Plex Mono 500, uppercase,
0.14em) for kickers and the ESTIMATE stamp; `body`/`lead` (Barlow 400) for the
sub-lines. Hero numerals are the only thing allowed above ~150px.

**Motion grammar + reveal model** — long-tail decel throughout (`power3`
default; the worker may use the ζ=1 spring where a settle is the hero). No
overshoot, no `back`/`bounce`/`elastic` — this audience is anxious, and bouncy
reads as toy. Every frame is **VO-paced**: at t=0 only what the voiceover is
saying enters, and each further piece reveals on its spoken cue, weighted to the
back half. Entrances are `fromTo` so a seek to t=0 lands correctly.

**Rhythm / held-frame allocation** — the film accelerates through the pain and
then stops dead. Frames 2 and 3 are the busiest (the count-down and the
arithmetic); **Frame 6 is the designated held frame** — after the rank band
draws, it reads completely still, and that stillness is the payoff's whole
delivery. Frame 7 holds too, on the lockup. Aliveness during a hold is
low-amplitude **subtle jitter** only (`sine-wave-loop`, low register), used on
the gremlin's jaw and nowhere else.

**The gremlin is the continuity device** — it appears in frames 1, 2, 3, 4, 6
and 7 and its scale is the film's progress bar: it enters small, fattens through
frames 2–3, flinches back at 4, is starving and tiny at 6, and exits the frame
at 7. Nothing else recurs. A viewer who watches muted still reads the whole arc
off the creature's size.

**Negative list** — never: a second accent hue; nav bars, footers, scrollbars,
browser chrome or real cursors around the captured screens (they are cutouts,
not screen recordings); floating bokeh or purple-blue "AI" gradients; any claim
that the rank band is a prediction rather than an estimate; the MEC or IOM name
used as an endorsement. And both motion failure modes: **slideshow**
(front-load then freeze) and **screensaver** (elements floating independently,
lazy breathing, a slow back-half pan or push).

## Frame 1 — Nobody fails on what they don't know

- scene: A student at a desk in near-black; one MCQ card floats. She taps a guess, and a small teal gremlin bites a chunk out of her score.
- voiceover: "Nobody fails MECEE-BL on the questions they don't know."
- duration: 4.245s
- transition_in: cut
- status: animated
- src: compositions/frames/01-nobody-fails.html
- type: hook
- persuasion: Pain validation
- beat: recognition + unease
- poster: 2.6s
- blueprint: kinetic-type-beats (Adapt)
- sfx: impact-bass-1
- asset_candidates:

narrativeRole: Opens on the viewer's own experience, inverted. Every candidate
assumes the enemy is syllabus they haven't covered; the hook says it isn't,
which buys the next four seconds. The gremlin must appear inside the first
second — it is the piece's whole visual identity and the reason a thumb stops.
keyMessage: The thing costing you marks is not ignorance.


Adapt: keep the beat-slam signature — the token that lands IS the beat — but the
slammed token is a numeral rather than a word, and a character enters underneath
it instead of the shape's usual bare canvas.
Scene 1 (0.0–0.8s): near-black field, nothing else on it. The accent numeral
&minus;0.25 slams in upper-left at ~45% of canvas via kinetic beat-slam
(`kinetic-beat-slam`) on a long-tail settle. Centered-hero framing, 2 depth
layers. This is the whole screen at t=0 — the cold open is one number.
Scene 2 (0.8–1.8s): as the VO reaches "MECEE-BL", the mono kicker types on above
the numeral (`discrete-text-sequence`) and the student cutout rises into the
lower-left third with a smooth spring-pop entrance (`spring-pop-entrance`).
Asymmetric 60/40, 3 depth layers.
Scene 3 (1.8–2.7s): on "questions they don't know", the gremlin punctures in
from the right edge (`spring-pop-entrance`) and takes its first bite — the
numeral's final glyph chips away on a hard-cut swap (`discrete-text-sequence`)
and the score readout 152.00 reveals bottom-right on the same beat.
Scene 4 (2.7–3.435s): held read. Nothing enters. Only the gremlin's jaw keeps a
low-amplitude subtle jitter (`sine-wave-loop`, low register); no camera move.

## Frame 2 — It eats the guesses

- scene: The gremlin feeds on a run of guessed answers. The score counter ticks down in quarter-marks — 152.00, 151.75, 151.50 — and the gremlin visibly fattens with each bite.
- voiceover: "They fail on the ones they guessed."
- duration: 2.005s
- transition_in: cut
- status: animated
- src: compositions/frames/02-it-eats-guesses.html
- type: pain_point
- persuasion: Pain agitation
- beat: anxiety
- poster: 2.8s
- blueprint: dataviz-countup (Adapt)
- sfx: impact-bass-1
- asset_candidates:

narrativeRole: Names the villain and shows its mechanism in one move. The line
is short on purpose: the counter's descent and the bite SFX carry the second
half of the frame, so the pain is felt rather than narrated.
keyMessage: Every guess is a quarter-mark handed back.


Adapt: keep the count-up instrument as the argument, but run it **downward** —
the number falling is the pain, and the gremlin's growth is the second
instrument reading the same data. The shot is 2.0s, so it is three hits, not a
traversal.
Scene 1 (0.0–0.5s): &times;38 slams in upper-left (`kinetic-beat-slam`); the
gremlin is already mid-frame left and visibly fatter than it left frame 1 —
no re-entrance, the cut carries it. Asymmetric 60/40.
Scene 2 (0.5–1.4s): on "the ones they guessed", the score column ticks down
through 152.00 → 151.75 → 151.50 as three hard-cut token swaps
(`discrete-text-sequence`), the live value in accent and the spent ones dropping
to 28% — one bite SFX per tick, and the gremlin scales a notch on each
(`counting-dynamic-scale`, read inverted: the value falls as the creature
grows). This is the frame's whole argument and it lands in the back half.
Scene 3 (1.4–2.005s): the guessed-chip row wipes in beneath the rule
(`stat-bars-and-fills`) and the frame settles still.

## Frame 3 — Nine and a half marks, gone

- scene: Punch in on the real results screen filtered to "Wrong 38", landing on the red −0.25 badge with the gremlin perched on it. The arithmetic stacks beside it: 38 × 0.25 = 9.5 marks.
- voiceover: "Thirty-eight guesses. Nine and a half marks gone. About a thousand ranks."
- duration: 4.117s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/03-nine-and-a-half.html
- type: pain_point
- persuasion: Statistical proof
- beat: tension → alarm
- poster: 3s
- blueprint: dataviz-countup (Reproduce)
- focal: assets/results-wrong.png
- roles: results-wrong = cutout (the hero surface; laid into the top ~55%, no browser chrome)
- sfx: whoosh
- asset_candidates: assets/results-wrong.png — real results review filtered to Wrong 38, carrying the red −0.25 badge, the picked-vs-correct options and the per-question pace line

narrativeRole: Converts the abstract quarter-mark into the only currency this
audience cares about — rank. Every number here is the product's own: 38 wrong
on a real paper, 0.25 per wrong, and the app's rank-band copy that five
percentage points is worth roughly a thousand ranks. This is the agitation
peak and the last beat before relief.
keyMessage: Guessing costs rank, and the cost is measurable.


Reproduce: the shape's signature is a camera that pushes THROUGH one data
instrument into the next and resolves on a hero metric — here the real penalty
badge → the arithmetic → the rank. This is the film's agitation peak and the
only frame that traverses.
Scene 1 (0.0–1.0s): the captured results screen arrives already framed on its
red &minus;0.25 badge via an inverse zoom-through seam off frame 2
(`cut-catalog.md`), held by a target zoom that keeps the badge off-centre and
legible (`coordinate-target-zoom`). Layered-depth, screen at ~60% of canvas.
Scene 2 (1.0–2.2s): on "Thirty-eight guesses", the gremlin drops onto the badge
and the arithmetic 38 &times; 0.25 = 9.5 assembles token by token beneath
(`dynamic-content-sequencing`), the 9.5 landing in accent with a keyword glow
(`asr-keyword-glow`) exactly on the spoken "nine and a half".
Scene 3 (2.2–3.3s): the camera pushes THROUGH the arithmetic into the rank line
— &asymp;1,000 counts up from zero (`counting-dynamic-scale`) as the VO says
"a thousand ranks". The signature move; it lands on the shot's key reveal.
Scene 4 (3.3–4.117s): hold. A depth-of-field blur (`depth-of-field-blur`) drops
the screenshot back so the rank number owns the frame alone. No further move.

## Frame 4 — Stop feeding it

- scene: Light floods in from the product. The worked explanation and the "35s on this question · exam pace is 54s" line rise off the real screen; the gremlin flinches back from the lit panel and shrinks.
- voiceover: "So stop guessing. Every wrong answer comes back worked out."
- duration: 3.605s
- transition_in: blur-crossfade
- status: animated
- src: compositions/frames/04-stop-feeding-it.html
- type: benefit_highlight
- persuasion: Friction reduction
- beat: relief
- poster: 2.6s
- blueprint: device-surface-showcase (Adapt)
- focal: assets/results-wrong.png
- roles: results-wrong = cutout (the same surface as frame 3, now read for its explanation block rather than its penalty badge)
- sfx: sparkle
- asset_candidates: assets/results-wrong.png — the same screen, now read for its explanation block and per-question pace line rather than its penalty badge

narrativeRole: The turn. The same screen that delivered the bad news is the
one that fixes it — reusing the frame-3 asset makes the solution feel like a
consequence rather than an advert. The gremlin's first retreat is the visual
promise the rest of the video pays off.
keyMessage: The mistakes come back explained, so they stop repeating.


Adapt: keep the signature — the feature shown being USED inside its real
interface, the surface as hero — but reuse frame 3's exact screen instead of a
fresh device, so the fix visibly happens to the thing that just hurt.
Scene 1 (0.0–0.9s): on "So stop guessing", the word explained. lands via
per-word staggered reveal (`dynamic-content-sequencing`) top-left. The ground
does not change from frame 3 — the cut reads as arrival, not a new place.
Scene 2 (0.9–2.1s): the captured card rises as the hero surface
(`spring-pop-entrance`) and its worked-explanation block lights with a keyword
glow (`asr-keyword-glow`) — the light in the frame comes from the product.
Layered-depth, surface ~50% of canvas.
Scene 3 (2.1–3.0s): as the VO reaches "worked out", the pace chip (35s against
the 54s exam budget) wipes in (`stat-bars-and-fills`) and the gremlin retreats
out of the lit area, shrinking as it goes (`scale-swap-transition`) — its first
loss, and the frame's emotional turn.
Scene 4 (3.0–3.605s): the tutor line reveals last and the frame holds still.

## Frame 5 — Marked like the real paper

- scene: Recreated exam card in brand teal: 200 questions · 3 hours · +1 / −0.25 · MAT included, with the five subject weight bars filling to their blueprint counts.
- voiceover: "Two hundred questions. Three hours. Marked like the real paper."
- duration: 3.883s
- transition_in: push-slide UP
- status: animated
- src: compositions/frames/05-real-paper.html
- type: product_intro
- persuasion: Show-don't-tell proof
- beat: credibility
- poster: 2.8s
- blueprint: grid-card-assemble (Adapt)
- focal: assets/landing-phone.png
- roles: landing-phone = supporting (the source of truth for the spec and the per-subject counts; the card itself is rebuilt as vector because a 200-question spec table is unreadable at phone size in under four seconds)
- sfx: pop
- asset_candidates: assets/landing-phone.png — the public landing page at phone width, whose hero card already states "200 questions · −0.25 per wrong" and the per-subject blueprint counts

narrativeRole: Establishes that this is an exam-real simulator, not a quiz app
— the claim the whole piece rests on. Recreated as vector rather than
screenshotted because a 200-question spec table is unreadable at phone size in
under four seconds.
keyMessage: The mock is marked exactly like MECEE-BL, negative marking included.


Adapt: keep the staggered self-assembling cascade, but the items are the five
official blueprint weights rather than feature tiles — the enumeration IS the
credibility claim.
Scene 1 (0.0–0.8s): on "Two hundred questions. Three hours.", 200 and 3h slam in
as a two-up across the top third (`kinetic-beat-slam`), each on its own spoken
beat. Full-width strip, 2 depth layers.
Scene 2 (0.8–1.6s): &minus;0.25 drops in beneath in accent
(`spring-pop-entrance`) — the film's motif returning, now as a spec rather than
a wound.
Scene 3 (1.6–3.1s): on "marked like the real paper", the five subject rows
self-assemble top to bottom in a staggered cascade, each label and count
arriving with its bar filling to the official weight
(`stat-bars-and-fills`, staggered by index). The signature move.
Scene 4 (3.1–3.883s): the MAT line lands last under the rule and the frame holds
still.

## Frame 6 — Where you actually stand

- scene: The real dashboard readiness card lands: 62.6%, ▲12.3 pts, and the rank band #3,067 – #4,149 punching up under an ESTIMATE stamp. The gremlin is now tiny and starving at the frame's edge.
- voiceover: "Then it shows you where you actually stand."
- duration: 2.368s
- transition_in: crossfade
- status: animated
- src: compositions/frames/06-where-you-stand.html
- type: benefit_highlight
- persuasion: Future pacing
- beat: control + confidence
- poster: 2.6s
- blueprint: dataviz-countup (Adapt)
- focal: assets/readiness-card.png
- roles: readiness-card = cutout (the real dashboard card; its ESTIMATE stamp must stay legible at phone size)
- sfx: chime
- asset_candidates: assets/readiness-card.png — the real dashboard readiness card: 62.6% averaged over six papers, the momentum pill, the score sparkline and the modelled rank band stamped ESTIMATE

narrativeRole: The payoff the hook promised. Rank is what this audience
actually wants, and the card delivers it with the honesty stamp attached — the
ESTIMATE label stays legible on screen, because overclaiming a rank prediction
is the one thing that would break trust with this audience.
keyMessage: You stop guessing at your own standing too.


Adapt: keep the count-up-to-a-hero-metric spine, but drop the camera traversal
entirely — this is the film's designated **held** frame, and the stillness after
frames 2–5 is what makes the payoff land.
Scene 1 (0.0–0.8s): 62.6 counts up from zero (`counting-dynamic-scale`) at the
top of the frame, the &#9650;12.3 momentum pill popping in beside it on the
number's arrival (`spring-pop-entrance`).
Scene 2 (0.8–1.5s): the real readiness card reveals beneath it
(`spring-pop-entrance`) and the gremlin — now tiny and starving — is already at
the lower-left, arriving with no fanfare. Centered hero, 3 depth layers.
Scene 3 (1.5–2.368s): on "where you actually stand", the rank band's accent
border draws itself around #3,067 &ndash; #4,149 (`svg-path-draw`) and the frame
stops. Completely still — no camera, no drift, nothing enters. The ESTIMATE
stamp holds at full legibility beside the number.

## Frame 7 — Sit one tonight

- scene: The mark assembles; beneath it "2 full mocks, free · no card". The gremlin scurries off the bottom edge and the frame goes still on the wordmark.
- voiceover: "Two full mocks, free. Sit one tonight."
- duration: 2.475s
- transition_in: crossfade
- status: animated
- src: compositions/frames/07-sit-one-tonight.html
- type: cta
- persuasion: Risk reversal
- beat: urgency-to-act
- poster: 2.4s
- blueprint: logo-assemble-lockup (Adapt)
- sfx: impact-bass-1
- asset_candidates:

narrativeRole: Closes the loop the gremlin opened — it leaves the frame, which
is the whole promise in one gesture. The ask is deliberately small and same-day
("tonight"), and free-tier honesty ("2 full mocks") does the risk reversal
rather than a discount.
keyMessage: It costs nothing to find out tonight.


Adapt: keep the signature — elements clear the stage and the mark comes to exist
on screen — but the thing that clears is the antagonist, so the lockup is
literally what remains once the gremlin is gone.
Scene 1 (0.0–0.7s): on "Two full mocks, free", the numeral 2 slams in
(`kinetic-beat-slam`) and full mocks, free. resolves beneath it in accent via
per-word staggered reveal (`dynamic-content-sequencing`).
Scene 2 (0.7–1.5s): the no-card line reveals under the rule, then the IOMMock
wordmark assembles from its parts and draws on (`svg-path-draw`) — the mark
coming to exist, the shape's signature.
Scene 3 (1.5–2.475s): the gremlin scurries out through the bottom edge — the
film's only exit tween, permitted because this is the final frame — and
everything settles still on the lockup for the last beat.
