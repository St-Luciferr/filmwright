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
| **Media sources** | Where voice, music, imagery and footage come from. See below. |
| **Involve me in decisions** | Interactive mode. On by default — see [chapter 3](03-while-it-runs.md). |

## Media sources

Every option is free and needs no account, key or subscription — that is the
entry requirement, not a tier. The run is told this catalog is the only thing
that exists, so it will not wander off to a paid provider.

| Slot | Options |
|---|---|
| **Voiceover** | **Kokoro** — a speech model running on your machine. Twelve voices; pick one and it is used for the whole piece. Offline, and the first line of the first run is slow while the model downloads. |
| **Music** | **MusicGen** writes an original bed on your CPU — minutes, not seconds, but nothing to credit. **Openverse** pulls a real Creative Commons track instead: fast, and credited automatically. |
| **Imagery** | **Pollinations** generates images from a description — you get exactly the shot you asked for, but the people in it are not real and the images are not licensed stock. **Openverse** finds genuine Creative Commons photographs — real, credited, but you take what exists rather than what you described. |
| **Footage** | **Animated stills** (the default) sources a still and moves the camera over it. **Wikimedia Commons** downloads real Creative Commons clips — genuinely live action, but documentary-grade and thin outside common subjects. |

**On "live action".** There is no free live-action video generator; every one of
them needs a subscription. So live action here means real Creative Commons
footage, or a camera move over a still. If you ask for live action and the run
cannot find footage that fits, it falls back to a moved still and says so rather
than pretending.

Creative Commons assets carry a credit condition. Anything downloaded under one
is listed in the project's `ATTRIBUTION.md` — keep that file with the video.

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
