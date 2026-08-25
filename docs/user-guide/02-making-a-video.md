# 2. Making a video

Open <http://localhost:3100>. The form at the top is the whole input.

## The prompt

This is the brief. Everything the form does not pin down, the agent decides
alone — so say what matters and leave the rest.

A weak prompt:

> a tiktok video for my website

A strong one:

> A 25s TikTok promo for IOM Mock, a MECEE-BL mock-test platform for Nepal.
> Negative marking is the villain — personify it as a small gremlin that bites a
> quarter mark off every guess, and the app starves it. Fast and funny-anxious,
> then decisive. Must stop a thumb in the first 0.6s and stay legible muted.

The difference is a **through-line**, a **tone**, and a **constraint**. Those are
the three things a prompt can give that the form cannot.

## The fields

| Field | What it does |
|---|---|
| **Workflow** | Which HyperFrames workflow authors the video. Pick by what the video *is*, not by subject. See below. |
| **Aspect** | `9:16` (1080×1920), `16:9` (1920×1080) or `1:1` (1080×1080). Sets the canvas at scaffold time. |
| **Length** | Target seconds, 5–180. A target, not a contract — the finished cut usually lands within a second or two. |
| **Destination** | Free text (`tiktok`, `youtube`, `web`). Goes into the brief and informs pacing and safe areas. |
| **Language** | Language code for narration and captions. |
| **Source URL** | Optional. When set, the workflow captures the site's own visuals and uses them. |
| **Audience** | Optional but high value. "Nepali MBBS aspirants, 16–20, and their parents" changes the writing far more than the workflow does. |
| **Voiceover / Captions / Music** | Which audio layers to build. Captions matter for feeds watched muted. |
| **Involve me in decisions** | Interactive mode. On by default — see [chapter 3](03-while-it-runs.md). |

## Choosing a workflow

| Workflow | Use it for |
|---|---|
| **Product launch / promo** | A product, feature or company. The default, and the right choice for any commercial URL. |
| **Faceless explainer** | Explaining a topic from text, with no site to capture. |
| **Motion graphic** | Short, design-led, no narration — a logo sting, a stat count-up, kinetic type. |
| **Music / beat-synced** | A track drives the pacing. |
| **General video** | Anything else, any length. |
| **Slideshow / deck** | A navigable deck rather than a rendered video. |

## What happens next

Pressing **Generate** queues the job and takes you to its page. If the worker is
idle it starts within a couple of seconds; if it is busy, the job waits — the
queue is strictly one at a time.

The first thing the worker does is scaffold a real HyperFrames project in
`projects/<slug>/` and write `BRIEF.md` from your form. That file is the
confirmed intent for the run, and you can read it at any time.
