# User guide

How to use the studio to make, review and change videos. No code required.

| | |
|---|---|
| [1. Getting started](01-getting-started.md) | Install, check your machine, open the studio |
| [2. Making a video](02-making-a-video.md) | The form, field by field, and what each choice does |
| [3. While it runs](03-while-it-runs.md) | Reading the activity feed, answering questions, sending notes |
| [4. Reviewing the frames](04-reviewing-frames.md) | The storyboard gate, before anything renders |
| [5. Changing a finished video](05-revising.md) | Timestamped notes, revisions, version history |
| [6. When something goes wrong](06-troubleshooting.md) | Failures, parked runs, re-queueing |

## The shape of it

You describe a video. A worker builds it as a real
[HyperFrames](https://hyperframes.heygen.com) project — script, storyboard,
frame compositions, voiceover, music, captions — and renders it to MP4.

You are involved at three points, and can interrupt at any time:

```
   prompt
     │
     ▼
  building ──► question?  ──► you answer ──┐
     │                                     │
     ├──► script gate     ──► you approve ─┤
     ├──► storyboard gate ──► you approve ─┤
     ├──► frame review    ──► you approve ─┘
     ▼
   render ──► watch it ──► pin notes ──► revise ──► v2, v3 …
```

Nothing is thrown away. A run that fails, runs out of budget, or parks waiting
for you keeps everything it produced, and picking it back up continues from
there.
