# Asset provenance

Status: Phase 2 integration · Date: 2026-10-07 · Required by [06 §2 step 4](phase1/06-legal-and-originality.md#2-clean-room-process).

This file records, for every asset that ships, who made it, how and when it was made, and with which tools. Each row is a clean-room asset: none uses material from the original game, its web build, a teardown of either, or the sources listed in 06 §4. Update this file in the same change that adds or changes an asset (06 §9 checklist).

## 1. Who made the assets

All Phase 2 code, SVG art, sound recipes, copy and level data were written by AI coding agents (Claude, Anthropic) in parallel workstreams, coordinated by a lead agent. Each agent worked from the Phase 1 spec files 02–05 and from [`docs/phase2/CONTRACTS.md`](phase2/CONTRACTS.md). File 01 was background reading only. The workstreams were foundation, engine, content, game, platform, ui-board, ui-shell, app and integration. Every source file names its workstream in its first line (`// Owner: …`).

On AI use (06 §2 step 6):

- No reference images were used for any drawing.
- The art and the copy were written directly as code and text. No image or audio generator was used.
- The orchestration prompts (workstream briefs) are kept with the lead's session logs and are not reproduced here. **Open item for the lead:** archive them next to this file before any public release.

## 2. Art (SVG, hand-coded)

| Asset | File(s) | Author and date | Method and tools |
|---|---|---|---|
| Cat head: loaf shape, ears, eyes for 4 moods, muzzle, nose, whiskers, blink lid | `src/ui/art/cat-parts.ts` | ui-board agent, 2026-10-07 | SVG path data typed by hand in TypeScript on a 100-unit grid. No reference images. Colours from 02 §17.3 (ginger `#F29A4A`, cream `#FFE9CF`, ink outline). |
| Sprite symbols: 4 cat moods, the blink overlay, mark X, wrong X with ring, 12 pattern glyphs, 15 icons (house, gear, bulb, paw, heart, empty heart, trophy, lock, calendar, play-video, close, chevron, 3 rule icons), heart-crack clip paths | `src/ui/art/sprite.ts` | ui-board agent, 2026-10-07 | Hand-coded SVG on a 24 px grid (icons, glyphs) and a 100 grid (cats, marks). The gear and the star are computed from polar coordinates. No reference images. |
| Full-body poses: home mascot (idle, blinking) and boot (sleeping) | `src/ui/art/mascot.ts` | ui-board agent, 2026-10-07; split out of `illustrations.ts` without change by integration, 2026-10-07 | Hand-coded SVG on a 200-unit grid around the board head |
| Full-body poses: win (party hat, confetti), fail (small bandage, sweat drop), daily (calendar, sparkles), tutorial (raised paw) | `src/ui/art/illustrations.ts` | ui-board agent, 2026-10-07 | Hand-coded SVG. Our own poses: never a trumpet cat or a crying cat (06 §3). |
| Region palette (12 colours), UI tokens, `--wrong` `#A3193A` | `src/ui/art/palette.ts`, `src/styles/tokens.css` | Palette from 02 §17.2 (Phase 1, our own values); `--wrong` chosen by ui-board, 2026-10-07 | `scripts/palette-check.ts` checks them: CIEDE2000 between all pairs, simulated colour blindness, and 3:1 contrast for the X glyph and the cat outline |
| Rotate-device drawing | `src/ui/overlays/rotate-notice.ts` | ui-shell agent, 2026-10-07 | Inline SVG built from DOM calls: a phone outline and a curved arrow |
| Loading indicator (three paw prints stepping in turn) | `src/ui/overlays/loading-indicator.ts`, `src/styles/overlays.css` | integration lead, 2026-10-07 | Reuses the sprite's `icon-paw`; the animation is CSS |
| Board, HUD and overlay styling (layout, region-aware gaps, animations) | `src/styles/*.css` | ui-board agent (ui-shell proposed the overlay rules in `dev/shell-styles.ts`), 2026-10-07 | Hand-written CSS. Timings follow 02 §17.5. |
| Mock ad placeholder (dev and e2e builds only; never in production web or FBIG) | `src/platform/web/mock-ads.ts` | platform agent, 2026-10-07 | DOM and CSS; its text comes from `en.ts` |

## 3. Sound

| Asset | File | Author and date | Method |
|---|---|---|---|
| 11 sound effects: mark, unmark, cat, region, mistake, last heart, win, hint open, hint apply, kitty, UI click | `src/audio/sfx.ts` (recipes), `src/audio/audio-engine.ts` (context and master gain at −12 dBFS) | ui-shell agent, 2026-10-07 | Synthesized at runtime with WebAudio: oscillator tones with pitch and gain envelopes, plus filtered noise bursts. Designed from the 02 §16 word descriptions. No audio files or samples, and no sound names from any other game. |

## 4. Text

| Asset | File | Author and date | Method |
|---|---|---|---|
| Every user-facing string: UI, tutorial coach lines, hint templates (02 §9.1), praise words, rule chips, colour and glyph names, toasts, screen-reader text, About | `src/i18n/en.ts` | foundation agent; keys appended by the workstreams and by integration (`game.loading`, `kitty.unavailable`), 2026-10-07 | Written in-house in English. `tests/unit/sanity.spec.ts` fails the build if a known phrase of the original appears (06 §3). |
| Page title and meta description | `index.html` | foundation and app agents, 2026-10-07 | Written in-house. "Mewdoku" is the internal code name only (06 §6). |

## 5. Level content

| Asset | File(s) | Author and date | Method |
|---|---|---|---|
| Tutorial board (Level 1, 4×4) | `src/game/tutorial.ts`, record in `pack-000.json` | Phase 1 design (02 §11.5) | Designed in-house. Unique and grade G1, checked by the engine. |
| Levels 2–1000 (10 packs) | `src/data/levels/pack-000…009.json`, `manifest.json` | content agent, 2026-10-07; regenerated byte for byte by integration on 2026-10-07 to check the `gen-pool.ts` split | Generated by our engine (`src/engine/generator.ts`, `mewdoku-gen/1.0.0`) with our seeds `mewdoku:level:v1:<L>`, the size schedule seeded with `mewdoku:schedule:v1` and the effort-sort noise. Scripts: `scripts/level-schedule.ts`, `gen-levels.ts`, `gen-pool.ts`. Every record is checked by `scripts/verify-levels.ts` and `tests/property/levels.spec.ts`. |
| Daily puzzles 2026-10 to 2028-12 (823 days, 27 monthly files) | `src/data/daily/*.json` | Same as the level packs | Generated with seeds `mewdoku:daily:v1:<YYYY-MM-DD>` (`scripts/gen-daily.ts`), with the duplicate check shared with the level packs |
| Generator golden file | `tests/golden/gen-v1.json` | engine agent, 2026-10-07 | `generate()` output for 20 fixed specs of our own |

No level comes from the original game, fan walkthrough or solver sites, or third-party level sets (06 §3).

## 6. Third-party material

| Asset | File(s) | Licence | Source |
|---|---|---|---|
| Fredoka, weight 600, Latin subset (display font) | `src/assets/fonts/display-latin.woff2` (16 468 bytes) | SIL Open Font License 1.1, © 2016 The Fredoka Project Authors | npm `@fontsource/fredoka` 5.3.0, file `files/fredoka-latin-600-normal.woff2`, byte-identical (MD5 `f56ba4069e244c2dc8bbc09f5ac8301e`). The licence ships as `src/assets/fonts/OFL.txt` and is linked from About. |
| FB Instant Games SDK 8.0 | loaded from `connect.facebook.net` at runtime (FBIG build only); not bundled | Meta platform terms | 05 §2 |
| FB SDK test stub | `tests/fixtures/fbinstant-stub.js` (tests only, never shipped) | ours | platform agent, 2026-10-07; written from the documented API shape in 05 |

There are no other runtime dependencies. Dev tooling (Vite, Vitest, Playwright, TypeScript, tsx, jsdom, fflate) is not shipped.

## 7. Not yet made

| Asset | Phase |
|---|---|
| App icon, cover image, store screenshots | Phase 4 (06 §5): built from our own screens, in a caption style unlike the original's |
| Final name and logo | Phase 4, after the naming clearance in 06 §6 |
