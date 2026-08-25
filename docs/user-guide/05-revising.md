# 5. Changing a finished video

A finished render is not the end. Open a succeeded job and you get a player, a
clickable frame strip, and a feedback panel.

## Pin a note to a moment

Scrub to what you want changed and describe it. The note pins to the playhead
and is resolved to the frame that was on screen — using the composition's real
timing, not a guess.

```
0:08.3  →  frame 03-this-is-iom-mock
```

The frame strip under the player is the fast way to navigate: each segment is a
frame, clicking it seeks to that frame's start. Pinned notes show as markers.

Untick **Pin to** for a note about the whole video.

## Apply the changes

Adding notes only records feedback. Nothing runs until you press:

```
[ Apply 2 changes → v2 ]
```

That queues a revision: the same project directory, the same decisions you
already made, and your notes as a change list. The revision is framed as a
**change, not a rebuild** — the agent is told to make the smallest edit that
satisfies each note, not to re-record voiceover or re-capture the site.

Scale your expectations to the note. "Make the logo bigger at 0:08" is a small
edit. "Add a human character to every frame" is close to a re-illustration and
will cost like one.

## Versions

Every render is kept. When a revision re-renders, the previous MP4 moves into
`renders/history/` and the job that produced it is repointed at that file — so
each version still plays from its own page.

A **Versions** panel lists them:

```
v1   Aug 25, 02:13
v2   Aug 25, 21:40    1 change
v3   Aug 25, 23:07    1 change   ← current
```

Nothing is overwritten and nothing is lost, so you can always go back and
compare.
