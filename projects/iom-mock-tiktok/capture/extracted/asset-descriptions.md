# Asset Descriptions

One line per file. Read this instead of opening every image individually.

To find a specific brand or icon, **grep this file for the brand name in the description text** (e.g. `grep -i 'autodesk' asset-descriptions.md`). The Gemini Vision captions identify what's actually in each file — that's the agent's selector.

The `logo-<hash>.svg` filename prefix is a cheap structural hint (DOM said this SVG was inside a `<header>`, home-link `<a>`, or had an aria-label matching the page brand). It is NOT a content claim — many `logo-*` files are nav icons or decorative shapes. Trust the captions, not the filename prefix.

- svgs/logo-0547a039.svg — A black icon featuring two stylized, four-pointed sparkle shapes of different sizes.
- svgs/logo-1ba8b8c3.svg — A black, circular icon with a right-angle extension at the top right, resembling the letter "G."
- svgs/logo-248a07e7.svg — This is a black, minimalist icon of a leaf outline containing a single diagonal vein.
- svgs/logo-255bbbe2.svg — A simple black outline of a camera icon on a white background.
- svgs/logo-28e8bc51.svg — A simple black-and-white line art icon of a trophy.
- svgs/logo-2e4a8b29-2.svg — A black, thick-lined outline of a calendar icon.
- svgs/logo-2e4a8b29.svg — A black, outlined calendar icon with no text.
- svgs/logo-3588d1bd.svg — A black outline icon of a trophy on a white background.
- svgs/logo-4a08a521.svg — A black, S-shaped line icon with a circle at each endpoint.
- svgs/logo-5e8ffa6c.svg — A black, thick-lined camera icon centered on a white background.
- svgs/logo-7dbd19f3.svg — A black icon consisting of two stylized four-pointed sparkle shapes of different sizes.
- svgs/logo-8948ce0d.svg — A black icon featuring a solid central circle flanked by two curved, concentric lines on either side.
- svgs/logo-899ca013.svg — This is a black, thick-outlined document icon with a folded top-right corner and two horizontal lines representing text.
- svgs/logo-91d18d4f.svg — A black, atomic-style icon featuring two intersecting ellipses encircling a central circular core.
- svgs/logo-93bdd5f9.svg — A black, stylized line-art icon of a beetle or insect.
- svgs/logo-9dc7a1c0.svg — This is a black and white graphic consisting of a solid central dot surrounded by two concentric rings.
- svgs/logo-a4d7b542.svg — A black, stylized circular icon featuring a right-angle bracket symbol inside.
- svgs/logo-a6ad24b1.svg — A black bar chart icon with three vertical bars of varying heights sitting on a horizontal base line.
- svgs/logo-b0ed5fe6.svg — A black outlined icon of a laboratory flask.
- svgs/logo-ba1cf7ed.svg — This is a black, thick-outlined lightning bolt icon on a white background.
- svgs/logo-bd0f1b70.svg — This is a black, minimalist clipboard icon featuring two horizontal lines representing text.
- svgs/logo-c1c979f5.svg — A black icon featuring two four-pointed star shapes, one larger than the other.
- svgs/logo-d6b68cd6.svg — A simple black plus sign icon with rounded ends.
- svgs/logo-f9e8da00.svg — A black-outlined icon of an open book set against a white background.
- svgs/svg-038643a7.svg — A simple black line-art icon of a leaf shape with a single curved vein in the center.
- svgs/svg-75d5130b.svg — A black icon featuring a central circle surrounded by two intersecting elliptical rings.
- svgs/svg-adcd7140.svg — A black, minimalist lightbulb icon on a white background.
- svgs/svg-b64f056a.svg — This is a black, thick-lined icon of a laboratory flask.
- svgs/svg-fba7d72c.svg — This image is a black-outlined lightning bolt icon on a white background.
- svgs/svg-ff3d27c4.svg — A simple black line-art icon of a beetle or bug.

## Authenticated app screens (`app-screens/`)

Captured from the running app at localhost:3000 signed in as the premium demo
account, 2x device scale so they survive a punch-in on a 1080x1920 canvas.
The mock history behind them is locally seeded demo data (six MECEE-BL papers
on a rising curve), not a real student's result.

- `app-screens/readiness-card.png` — **HERO.** The dashboard "Exam readiness" card:
  62.6%, a ▲12.3 pts momentum pill, "averaged over 6 papers · best 72.3%", the
  score sparkline, and the modelled rank band `#3,067 – #4,149 · MBBS/BDS
  paying-seat range` stamped ESTIMATE. Its advice line reads "target the topics
  where you lose marks to negative marking" — the video's own thesis, in the
  product's words. 1436x852.
- `app-screens/results-wrong.png` — **THE −0.25 EVIDENCE.** Results review filtered
  to "Wrong 38": a real Physics question with a red **−0.25** badge top-right,
  the picked option in red ("Your answer"), the right one in green ("Correct"),
  "35s on this question · exam pace is 54s per question", a worked explanation,
  and the "Explain why my answer is wrong" AI button. Also carries the
  subject-wise breakdown bars (Zoology 90% / Physics 64% / Botany 83% /
  Chemistry 74% / MAT 80%).
- `app-screens/results-top.png` — results header: score, rank, percentile cards.
- `app-screens/results-main.png` — the same page at CSS scale.
- `app-screens/dashboard-full.png` — the whole dashboard: readiness, today's quiz
  with the streak strip, flashcards due, subject strength, weak topics.
- `app-screens/analytics.png` — /analytics: score trend chart and subject accuracy.
- `app-screens/landing-phone.png` — the public landing page at 430x932 (3x), phone
  width. The hero card here already says "200 questions · −0.25 per wrong".
