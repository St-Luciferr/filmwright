# Should filmwright stay on HyperFrames? — 13 October 2026

Companion to `2026-10-13-pipeline-improvements.md`. Prompted by a post claiming Claude
Code now makes motion reels without HyperFrames. Two research tracks: what that post
refers to, and a head-to-head of HyperFrames against every credible alternative for this
engine's workload (20–180 s narrated vertical videos, free-only media, 2-core CPU, no GPU,
agent-authored free-form code, human gate before render).

---

## 1. What the post most likely refers to

The exact post was not found (X and Reddit are not searchable from here). Two things match
the vocabulary and the timing:

**Claude Motion (Anthropic, beta since 8 Oct 2026).** A Claude.ai artifact type invoked
with `/motion`. Claude writes code that animates text, charts, shapes and images; every
word, number and timing stays editable; it exports MP4; it uses no video-generation model.
Available only on Team and Enterprise plans, off by default on Enterprise. **No API, SDK,
or Claude Code entry point is documented**, and the rendering technology is not named.
It cannot drive an automated engine today.
Sources: claude.com/resources/articles/dashboards-and-motion,
support.claude.com/en/articles/17454997-get-started-with-claude-motion.

**Framework-free "HTML + Playwright + ffmpeg" Claude Code skills (late Sep to Oct 2026).**
`howseen-ai/claude-motion-design` (MIT, ~500 stars), `charlie947/motion-graphics-skills`
(MIT, ~255 stars, lists "HyperFrames, or ffmpeg plus Chrome" as interchangeable export
paths), `TomBener/claude-motion-reel` (a literal "motion reel", Canvas 2D, Puppeteer, 0
stars), and a Substack post whose prompt said "Do not use Remotion, HyperFrames or any
video library". All of them do exactly what HyperFrames does underneath: write a page
whose state is a pure function of time, seek it in headless Chromium, screenshot every
frame, encode with ffmpeg. The difference is that they drop the CLI, the lint and layout
checks, the timeline contract, the registry, and the skills.

Also checked and ruled out as "native Claude Code video":
- `anthropics/skills` has no video, motion, animation or reel skill (directory listing
  verified 9 Oct). `canvas-design` is static, `slack-gif-creator` makes tiny PIL GIFs.
- Claude Design exports HTML prototypes, PDF, PPTX, zip; no MP4.
- Claude Code has no video artifact type. The only recording primitive is Playwright MCP
  screen recording, which is real-time WebM, not frame-accurate.

---

## 2. The comparison

Scores are 1–5, higher is better for this engine. Numbers verified 13 Oct from npm, PyPI
and GitHub APIs, and from `--help` output of the current releases.

| Framework | Agent tooling | Quality gates | CPU render | Media and captions | Ecosystem and velocity | Free-only licence | Migration cost |
|---|---|---|---|---|---|---|---|
| **HyperFrames 0.8.153** (Apache-2.0, 62k stars, 794k weekly downloads, 507 releases since Mar 2026) | 5 | 5 | 4 | 5 | 5 | 5 | 5 (none) |
| **Remotion 4.0.535** (63k stars, 2.2M weekly downloads, 136 releases in 2026) | 4 | 2 | 4 | 4 | 5 | 4 | 1 |
| **hypit** (22k stars in 10 weeks, modified Apache licence) | 4 | unknown | 4 | 5 | 3 | 3 | 1 |
| **Manim CE 0.22** (MIT, 41k stars, 4 releases in 2026) | 3 | 1 | 4 | 2 | 4 | 5 | 1 as engine, 4 as embedded clip |
| **Plain HTML + Playwright + ffmpeg** | 3 | 1 | 3 | 1 | 1 | 5 | 1 |
| **Revideo** (MIT, last release Jul 2026, docs moved to a hosted product) | 3 | 1 | 4 | 3 | 2 | 5 | 1 |
| **Motion Canvas / Canvas Commons** (MIT; original has had no release since Feb 2025) | 2 | 1 | 2 (no headless CLI) | 2 | 2 | 5 | 1 |
| MoviePy / ffmpeg / Editly | 2 | 1 | 3 | 3 | 3 | 5 | 1 |
| Diffusion Studio / Theatre.js / Lottie | 1 | 1 | 1 | 2 | 1 | 2 | 1 |
| Hosted AI video (Veo, Sora, HeyGen cloud) | n/a | n/a | n/a | n/a | n/a | 1 (none without an account) | n/a |

### Why each alternative scores the way it does

**Remotion.** The only other mature, officially agent-tooled option: `npx skills add
remotion-dev/skills` (12 skills), `llms.txt`, markdown docs, `@remotion/captions` (MIT)
with local whisper.cpp word timestamps. Licence is free for an individual or a company of
three or fewer; Remotion 5.0 will count contractors, and beyond that it is $0.01 per render
with a $100 per month minimum. It has **no layout, overlap, contrast, safe-zone or motion
verification**, only ESLint and TypeScript. Every animation must derive from
`useCurrentFrame()`; raw GSAP (what the agent writes today) renders silently wrong unless
routed through `@remotion/gsap`. Same Chromium screenshot-per-frame architecture, so the
same render speed class on this CPU; GPU-off slows blur, shadows, gradients. Migration
means rewriting the skills, prompts, check stage, storyboard capture and frame-to-file
mapping for no measured quality gain. HeyGen's own AI Engineer talk claims the thin HTML
contract beat Remotion for agent creativity; that is a vendor observation, not a test.

**hypit.** Strongest community momentum. Own DSL compiled to HTML, 64 parallel Chromium
processes, word-anchored captions via WhisperX. Ten weeks old, non-OSI licence (free for
single-tenant use, commercial licence for SaaS, logo must stay in CLI output), and the
agent would author hypit's DSL with hypit's skills, not this project's. Worth revisiting in
a quarter.

**Manim.** The best research evidence for agent-written educational video:
TheoremExplainAgent (93.8% success on 240 theorems), NUS Code2Video planner-coder-critic
(40% over direct generation). But ManiBench puts zero-shot executability at 66.7% for the
best model, so a repair loop is mandatory, there are no layout or caption gates, and the
look is vector maths, not motion graphics. **Useful as an embedded clip provider**: Manim
renders vertical with alpha (`-t --format mov -r 1080,1920`) and HyperFrames extracts
alpha sources as PNG, so a maths derivation can sit inside a frame unchanged.

**Plain HTML + Playwright.** Rebuilding HyperFrames' seek contract (BeginFrame or virtual
time, font waits, paused WAAPI) and losing its check, registry and skills, to arrive at
the same screenshot-per-frame speed. The one real gain is zero vendor drift. Net negative.

**Motion Canvas, Revideo, Theatre.js, Editly, Diffusion Studio.** Dormant, editor-bound,
browser-only, or drifting to a hosted product. None has a headless, free, agent-tooled
path that matches today's.

### Independent evidence

There is **no independent benchmark** comparing HyperFrames, Remotion and others for agent
output. HeyGen's Code2Video (168 briefs, 5 axes, judge 82% human-aligned) is the only
large-scale agent-output evaluation and it runs only on HyperFrames. The comparison posts
in circulation are vendor or affiliate blogs.

---

## 3. Recommendation

**Stay on HyperFrames. Do not migrate the engine.** Spend the effort on the improvements
in the companion report instead (fan-out, pin bump, check flags, model routing, judge).

The decision-relevant facts:

1. Rendering is 2 to 2.5 minutes of a 40 to 65 minute run. No change of renderer pays back.
2. HyperFrames is the only option with built-in overlap, contrast, caption-zone and motion
   verification, and `content_overlap` is already the top measured failure.
3. The "without HyperFrames" routes are the same mechanism minus the safety rails, or a
   closed Claude.ai feature with no API.
4. Remotion is legally fine for one person but adds a React rewrite, a GSAP determinism
   trap and no quality gate.
5. The engine's HyperFrames surface is about eight files (workflow, stages, prompt,
   timeline, storyboard, render, captions, config). The queue, store, worker, interaction
   tools and studio are framework-agnostic, so a future swap stays possible behind the
   existing `Renderer` interface. Keep it that way.

**Optional hybrid:** add Manim as a clip provider only when a maths-heavy brief appears.

**Risks of staying:** 70+ HyperFrames releases a month means pins and skills drift (11 of
12 installed skills are already stale, and 0.8.152 moved artifact paths). Anonymous render
telemetry is on. HeyGen could steer defaults toward paid cloud render. Mitigations: pin
exact versions, keep the renderer interface, and Apache-2.0 permits a fork.

**What would change this:** HyperFrames stops releasing or relicenses; a check-equivalent
ships for Remotion; an independent benchmark shows React beats HTML+GSAP for agents;
Claude Motion gains an API; render grows past roughly 30% of wall-clock; or the content
mix shifts to maths derivations.

---

## 4. Unverified

The post itself. Claude Motion's rendering technology and limits. Remotion's per-render
pricing figures (search summary, not the page). Motion Canvas maintainer status (third-party
blog). Remotion and Manim render speed on this CPU (not measured; `npx remotion benchmark`
would take under an hour if wanted).
