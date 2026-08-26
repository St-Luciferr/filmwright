# 0013 — Source all media from free providers, chosen per job

- **Status:** Accepted
- **Date:** 2026-08-26

## Context

The platform configured no media providers at all. Voice, music and imagery
were whatever the agent could improvise from the `media-use` skill during the
run, and that skill's documented cascade starts at HeyGen for every asset type
— bgm, sfx, image, icon, voice and avatar video.

There is no HeyGen subscription on this machine, and there will not be one.
What that cost is on the record in `data/jobs`. Producing
`25s-promotional-tiktok-website` meant the run:

- spent turns probing `heygen`, `codex login status`, `mflux-generate` and
  `python3 -c "import mlx"` before concluding it had no credential for any of
  them;
- fell back to Kokoro for voice only after six TTS lines had already failed;
- `pip install`ed `transformers` and CPU `torch` mid-run to reach MusicGen for
  the music bed, because the HeyGen catalog and Lyria were both shut;
- and, asked for "realistic live action characters", ended at an undeclared
  `curl` to `image.pollinations.ai`.

Every one of those landed somewhere free and workable. The waste was that the
agent had to rediscover the free path from scratch each time, at ~$8 per run
against a $25 ceiling, and the choice of source was invisible to the person who
commissioned the video until they read the log afterwards.

The provider choice is also not a detail. "Real CC photograph" and
"AI-generated still" are different products with different usage rights, and
that is a decision the commissioner should make on the form, not one the agent
should reach by elimination at turn 60.

## Decision

Two changes, together.

**Media providers are a fixed, free-only catalog.** `packages/engine/src/providers.ts`
lists what may be used for voice, music, imagery and footage. The entry
requirement is that a provider costs nothing and needs no account, key or
subscription. Nothing credentialed goes in the file, and the agent prompt names
the excluded paths explicitly — HeyGen, ElevenLabs, Lyria, `codex`, mflux, LTX
— so a run does not spend budget rediscovering that they are shut.

**The user picks per job.** Each kind gets a picker in the studio, carried on
`VideoSpec.providers`, written into `BRIEF.md`, and rendered into the prompt as
the exact command to run.

`scripts/free-media.mjs` implements the catalog: local Kokoro for voice, local
MusicGen or Openverse for music, Pollinations or Openverse for stills,
Wikimedia Commons for footage. It seeds every request from the intent so a
re-run fetches the same asset, and it writes `ATTRIBUTION.md` for Creative
Commons downloads, because that obligation has to outlive the turn that
incurred it.

## Consequences

Runs stop paying to discover their own constraints, and the free guarantee is
enforced by the catalog rather than requested by the prompt. `npm run doctor`
now preflights every provider, so a broken one surfaces before the budget is
committed rather than at the media stage.

The honest cost is at the top of the range. There is no free live-action video
*generator* — none exists without a subscription — so the video picker offers
real Creative Commons footage from Wikimedia Commons or animated stills, and
the default is stills because Commons is documentary-grade and thin on b-roll.
A brief asking for polished live action will not get it, and the agent is told
to say so rather than quietly substitute.

Local MusicGen is slow on CPU (minutes per bed) and Pollinations rate-limits
the free tier, so the fetcher backs off and retries rather than failing a
frame. Both are real constraints the picker's hint text states up front.

Free catalogs are also thinner and less reliable than paid ones, which the
fetcher has to absorb rather than pass on. Openverse returns nothing for a
four-word phrase that its first two words match easily, so queries shorten
until they hit; and a matched result's URL may 403 on the origin host —
Freesound's CDN routinely does — so it walks the candidate list instead of
failing. One measured search skipped six unreachable results before landing.

Setup is heavier than it was: `npm run setup` builds two Python environments
(~2 GB, mostly CPU torch). That is the price of local models, and the honest
trade against a subscription. MusicGen is separable for anyone who would rather
take Creative Commons music than pay for it in disk.

Keeping the catalog current is now a maintenance burden: these are free public
endpoints with no contract, and one will eventually change or disappear.
`free-media.mjs doctor` exists so that shows up as a failed check.

## Alternatives considered

**Leave it to the agent, but tell it to prefer free paths.** This is roughly
what the prompt already implied, and the run above is what it produced. Guidance
without a fetcher meant re-deriving the same fallbacks every time and landing on
an undeclared endpoint.

**Support paid providers behind optional keys.** Rejected on the explicit
requirement that the platform be free end to end. An optional paid path also
quietly becomes the default quality bar, and the free path rots.

**One global provider setting in `.env`.** Cheaper to build, but wrong: real CC
photos versus AI stills is a per-video editorial choice, not an install-time
one.
