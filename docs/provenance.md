# Asset provenance

Status: Phase 2 integration (2026-10-07); Phase 2b drafts (F0, A, B, E) merged at the 2b integration, 2026-10-09; Phase 2c G2 rows (§9), 2026-10-09; Phase 2c.1 (§10), 2026-10-10; Phase 2d G2 and G3 drafts merged at the 2d integration (§11; the font files modified, §6), 2026-10-10 · Required by [06 §2 step 4](phase1/06-legal-and-originality.md#2-clean-room-process).

This file records, for every asset that ships, who made it, how and when it was made, and with which tools. Each row is a clean-room asset: none uses material from the original game (Phase 2d measured sizes, timings and colours on the user's own recording as a look reference, D-2d-0, §11; no pixel, frame or file of it), its web build, a teardown of either, or the sources listed in 06 §4. Update this file in the same change that adds or changes an asset (06 §9 checklist).

## 1. Who made the assets

Phase 2b (the "parity" pass, [parity-spec](phase2b/parity-spec.md)) was made the same way, by the F0 lead and workstreams A (visual identity and art), B (animation and screens), C (logic), D (platform) and E (localization). Their own words on method, merged here, are in §8. Rows of the Phase 2 tables below that 2b replaced are marked **retired in 2b**; the retired art no longer ships (the retired-look guard in `tests/unit/ui/css-rules.spec.ts` fails if a ginger or teal value or `data-skin` reappears in `src/` or in the page shell).

All Phase 2 code, SVG art, sound recipes, copy and level data were written by AI coding agents (Claude, Anthropic) in parallel workstreams, coordinated by a lead agent. Each agent worked from the Phase 1 spec files 02–05 and from [`docs/phase2/CONTRACTS.md`](phase2/CONTRACTS.md). File 01 was background reading only. The workstreams were foundation, engine, content, game, platform, ui-board, ui-shell, app and integration. Every source file names its workstream in its first line (`// Owner: …`).

On AI use (06 §2 step 6):

- No reference images were used for any drawing.
- The art and the copy were written directly as code and text. No image or audio generator was used.
- The orchestration prompts (workstream briefs) are kept with the lead's session logs and are not reproduced here. **Open item for the lead:** archive them next to this file before any public release.

## 2. Art (SVG, hand-coded)

| Asset | File(s) | Author and date | Method and tools |
|---|---|---|---|
| **Retired in 2b** (replaced in place by Tux, §8.2). Cat head: loaf shape, ears, eyes for 4 moods, muzzle, nose, whiskers, blink lid | `src/ui/art/cat-parts.ts` | ui-board agent, 2026-10-07 | SVG path data typed by hand in TypeScript on a 100-unit grid. No reference images. Colours from 02 §17.3 (ginger `#F29A4A`, cream `#FFE9CF`, ink outline). |
| Sprite symbols: 4 cat moods and the blink overlay (**retired in 2b**: Tux behind the same ids), mark X (**retired in 2b**: the white X with an edge), wrong X with ring, 12 pattern glyphs, 15 icons (house, gear, bulb, paw, heart, empty heart, trophy, lock, calendar, play-video, close, chevron, 3 rule icons), heart-crack clip paths | `src/ui/art/sprite.ts` | ui-board agent, 2026-10-07 | Hand-coded SVG on a 24 px grid (icons, glyphs) and a 100 grid (cats, marks). The gear and the star are computed from polar coordinates. No reference images. |
| **Retired in 2b** (Tux poses, §8.2). Full-body poses: home mascot (idle, blinking) and boot (sleeping) | `src/ui/art/mascot.ts` | ui-board agent, 2026-10-07; split out of `illustrations.ts` without change by integration, 2026-10-07 | Hand-coded SVG on a 200-unit grid around the board head |
| **Retired in 2b** (Tux poses, §8.2). Full-body poses: win (party hat, confetti), fail (small bandage, sweat drop), daily (calendar, sparkles), tutorial (raised paw) | `src/ui/art/illustrations.ts` | ui-board agent, 2026-10-07 | Hand-coded SVG. Our own poses: never a trumpet cat or a crying cat (06 §3). |
| Region palette (12 colours, kept in 2b), UI tokens (the teal UI tokens **retired in 2b**: the Classic set, §8.2), `--wrong` `#A3193A` | `src/ui/art/palette.ts`, `src/styles/tokens.css` | Palette from 02 §17.2 (Phase 1, our own values); `--wrong` chosen by ui-board, 2026-10-07. Contrast pass after the Phase 2 review (ui fixer, 2026-10-07): `--accent` `#1F9E89` → `#17806F` (white labels 3.3:1 → 4.8:1), `--accent-deep` `#167565` → `#0F5A4E`, `--ink-2` `#7A6E80` → `#6F6375`, new `--amber-text` `#8A5A00` and `--stage` `#2D2435` | `scripts/palette-check.ts` checks them: CIEDE2000 between all pairs, simulated colour blindness, 3:1 for the X glyph, cat outline, wrong X and colour-pattern glyphs on every tile (normal and faded), and 4.5:1 for the UI text pairs |
| Tutorial pointing hand (coach, O8) | `src/ui/overlays/coach.ts` (`handArt()`) | ui-shell agent, 2026-10-07 | Hand-coded SVG on a 48-unit grid (three rounded finger rects and one hand-and-index-finger path, ink outline on the card colour), built with DOM calls. Drawn without reference images; a generic pointing hand, not traced from any tutorial pointer. |
| How-to-play rule illustrations (three mini boards: one cat per colour, per row and column, cats never touch) | `src/ui/overlays/how-to-play.ts` (`miniBoard()`, `artColours()`, `artLines()`, `artSpace()`) | ui-shell agent, 2026-10-07 | Generated at runtime from our palette tiles and our sprite symbols (`cat-idle`, `mark-x`) on our own 4×4 and 3×3 layouts. |
| Rotate-device drawing | `src/ui/overlays/rotate-notice.ts` | ui-shell agent, 2026-10-07 | Inline SVG built from DOM calls: a phone outline and a curved arrow |
| Loading indicator (three paw prints stepping in turn) | `src/ui/overlays/loading-indicator.ts`, `src/styles/overlays.css` | integration lead, 2026-10-07 | Reuses the sprite's `icon-paw`; the animation is CSS |
| Board, HUD and overlay styling (layout, region-aware gaps (**retired in 2b**: even gutters), animations; the O3 confetti **retired in 2b** with the O3 win overlay) | `src/styles/*.css` | ui-board agent (ui-shell proposed the overlay rules in `dev/shell-styles.ts`), 2026-10-07 | Hand-written CSS. Timings follow 02 §17.5. |
| Mock ad placeholder (dev and e2e builds only; never in production web or FBIG) | `src/platform/web/mock-ads.ts` | platform agent, 2026-10-07 | DOM and CSS; its text comes from `en.ts` |

## 3. Sound

| Asset | File | Author and date | Method |
|---|---|---|---|
| 11 sound effects: mark, unmark, cat, region, mistake, last heart, win, hint open, hint apply, kitty, UI click (2b adds `fish_pop` and `fish_plink`, §8.3) | `src/audio/sfx.ts` (recipes), `src/audio/audio-engine.ts` (context and master gain at −12 dBFS) | ui-shell agent, 2026-10-07 | Synthesized at runtime with WebAudio: oscillator tones with pitch and gain envelopes, plus filtered noise bursts. Designed from the 02 §16 word descriptions. No audio files or samples, and no sound names from any other game. |

## 4. Text

| Asset | File | Author and date | Method |
|---|---|---|---|
| Every user-facing English string (2b strings and the 16 translations: §8.4): UI, tutorial coach lines, hint templates (02 §9.1), praise words, rule chips, colour and glyph names, toasts, screen-reader text, About | `src/i18n/en.ts` | foundation agent; keys appended by the workstreams and by integration (`game.loading`, `kitty.unavailable`), 2026-10-07; review-fix keys appended 2026-10-07 (ui: `a11y.hintAt*`, `howto.keys`, `fail.continue.a11y.*Label`, `about.code*`) | Written in-house in English. `tests/unit/sanity.spec.ts` fails the build if a known phrase of the original appears (06 §3). |
| Page title and meta description | `index.html` | foundation and app agents, 2026-10-07 | Written in-house. "Mewdoku" is the internal code name only (06 §6). |

## 5. Level content

| Asset | File(s) | Author and date | Method |
|---|---|---|---|
| Tutorial board (Level 1, 4×4) | `src/game/tutorial.ts`, record in `pack-000.json` | Phase 1 design (02 §11.5) | Designed in-house. Unique and grade G1, checked by the engine. |
| Levels 2–1000 (10 packs) | `src/data/levels/pack-000…009.json`, `manifest.json` | content agent, 2026-10-07; regenerated byte for byte by integration on 2026-10-07 to check the `gen-pool.ts` split | Generated by our engine (`src/engine/generator.ts`, `mewdoku-gen/1.0.0`) with our seeds `mewdoku:level:v1:<L>`, the size schedule seeded with `mewdoku:schedule:v1` and the effort-sort noise. Scripts: `scripts/level-schedule.ts`, `gen-levels.ts`, `gen-pool.ts`. Every record is checked by `scripts/verify-levels.ts` and `tests/property/levels.spec.ts`. |
| Event puzzles (Phase 2b, §4.3 of the spec): Lantern Walk, Snow Paws, Yarn Hearts, 21 each | `src/data/events/*.json` (`events.json` names them) | workstream C, 2026-10-09 | Generated by our engine through `scripts/gen-events.ts` from each event's `gen` sizes and band, with our own seeds; checked by `scripts/verify-levels.ts` and `tests/property/events.spec.ts`. The event names and themes are ours (§8.2); none is an original event's name. |
| Daily puzzles 2026-10 to 2028-12 (823 days, 27 monthly files) | `src/data/daily/*.json` | Same as the level packs | Generated with seeds `mewdoku:daily:v1:<YYYY-MM-DD>` (`scripts/gen-daily.ts`), with the duplicate check shared with the level packs |
| Generator golden file | `tests/golden/gen-v1.json` | engine agent, 2026-10-07 | `generate()` output for 20 fixed specs of our own |

No level comes from the original game, fan walkthrough or solver sites, or third-party level sets (06 §3).

## 6. Third-party material

| Asset | File(s) | Licence | Source |
|---|---|---|---|
| Fredoka, weight 600, **Latin extended** subset (Phase 2b, for tr and pl; loaded lazily through its `unicode-range`) | `src/assets/fonts/display-latin-ext.woff2` (2 704 bytes) | SIL Open Font License 1.1, © 2016 The Fredoka Project Authors (same `OFL.txt`) | npm `@fontsource/fredoka` 5.3.0, file `files/fredoka-latin-ext-600-normal.woff2` (MD5 `abd04433096d82478e77921ff95ec727`, 2 692 bytes), added by workstream A, 2026-10-09. **Modified at Phase 2d integration** (2026-10-10): overlapping contours removed with `dev/font-overlaps.py` (§11.6); MD5 now `64a398951a78157f8d6a38e2fd3aac1c`. |
| Fredoka, weight 600, Latin subset (display font) | `src/assets/fonts/display-latin.woff2` (16 668 bytes) | SIL Open Font License 1.1, © 2016 The Fredoka Project Authors | npm `@fontsource/fredoka` 5.3.0, file `files/fredoka-latin-600-normal.woff2` (MD5 `f56ba4069e244c2dc8bbc09f5ac8301e`, 16 468 bytes). **Modified at Phase 2d integration** (2026-10-10): overlapping contours removed with `dev/font-overlaps.py` (§11.6), glyphs and metrics unchanged; MD5 now `dd3ebf455821f41b6503f1b491b95a89`. The licence ships as `src/assets/fonts/OFL.txt` and is linked from About. |
| FB Instant Games SDK 8.0 | loaded from `connect.facebook.net` at runtime (FBIG build only); not bundled | Meta platform terms | 05 §2 |
| FB SDK test stub | `tests/fixtures/fbinstant-stub.js` (tests only, never shipped) | ours | platform agent, 2026-10-07; written from the documented API shape in 05 |
| Vite's dynamic-import preload helper (`__vitePreload`: the `modulepreload` check, CSS preloading for lazy chunks (since the 2b integration it also loads the overlay and events chunks' stylesheets), the `vite:preloadError` event), about 1 KB | injected by the bundler into `index-*.js` of every build (web and FBIG) | MIT, © 2019-present VoidZero Inc. and Vite contributors | Vite 8 (`build.modulePreload: { polyfill: false }` drops only the polyfill, not this helper). The MIT notice ships as `src/ui/overlays/licences/vite-MIT.txt` and is credited and linked from About (`about.code`). |

There are no other runtime dependencies. Apart from the preload helper above, dev tooling (Vite, Vitest, Playwright, TypeScript, tsx, jsdom, fflate) is not shipped: the web sourcemaps list only our `src/**` files.

## 7. Not yet made

| Asset | Phase |
|---|---|
| App icon, cover image, store screenshots | Phase 4 (06 §5): built from our own screens, in a caption style unlike the original's |
| Final name and logo | Phase 4, after the naming clearance in 06 §6 |

## 8. Phase 2b (merged from the workstream drafts, 2026-10-09)

The common rules of every 2b row (parity-spec §0.2, R1, R6): our own work, from the spec's words only; no reference images, screenshots, recordings, Spine files, audio or text from the original or any other game; nothing traced or sampled (every colour, size and timing is our own value); no source listed in 06 §4 was opened. The original's animation timings are unknown; every duration is a `GameConfig` value fitted to the spec's wait-time targets (the 4.5 s reward window, the panel tap, the next board), not measured from the original. The interim F0 placeholders (an ellipse-and-triangle fish, line icons, a triangle ear, circle accessories, a placeholder event-art `div`, one-voice `fish_pop` / `fish_plink`) were all replaced in place by A and B and no longer ship.

### 8.1 How the art was made (workstream A)

Every drawing is SVG path data typed by hand in TypeScript, on a 100-unit grid (head, moods, accessories), a 200-unit grid (poses) and a 24-unit grid (icons, fish); the pattern tiles are generated SVG on a 72-unit grid. Each was checked by rendering it in our own dev harness (`dev/art-harness.html`) and looking at Playwright screenshots, then adjusting coordinates by hand. No image or audio generator was used. The only knowledge of the original that reached A is the words of parity-spec §1.2 and 01 ("dark-furred cat, probably tuxedo", "orange buttons and titles", "white X", "even gutters", "off-white page", "cats glow"). Tux's signature marks (the notched left ear, the asymmetric blaze around the right eye), its poses, its fish and the event art are ours.

### 8.2 Art, tokens and layout

| Asset | File(s) | Author and date | Method and notes |
|---|---|---|---|
| **Tux, board head** (replaces the ginger loaf head): bun-shaped head, ears tilted 12° out with a round tip, **left ear with a small V nick**, **asymmetric white blaze** sweeping round the right eye, light-green irises, pink nose, "w" mouth, two whiskers per side, a sheen along the top | `src/ui/art/cat-parts.ts` | workstream A, 2026-10-09 | Hand-typed path data on the 100 grid; colours from the §1.6 palette (`CAT_COLORS` in `palette.ts`) |
| Tux moods (idle, happy, sad, surprised), the blink lid, the ear-flick overlay (the notched ear alone) | `src/ui/art/cat-parts.ts`, `src/ui/art/sprite.ts` | workstream A, 2026-10-09 | Same symbol ids as Phase 2; no tears in any mood (06 §3) |
| Tux poses: home (sitting, tail curled with a white tip, `.pose__tail` / `.pose__head`), boot (curled asleep, two Zs) | `src/ui/art/mascot.ts` | workstream A, 2026-10-09 | Hand-coded on the 200 grid around the board head at ×1.3 |
| Tux poses: win (mid-leap holding one of our fish; no instrument), fail (a flat "pancake", one paw over the eyes, two sweat drops; no heart, no tears), daily (peeking over a calendar page), tutorial (one paw raised) | `src/ui/art/illustrations.ts` | workstream A, 2026-10-09 | Hand-coded on the 200 grid |
| Home mascot idle loop: tail sway ±6° over 2 800 ms, head tilt ±3° every 6–10 s, static with reduced motion | `src/styles/art.css`, `src/ui/art/mascot.ts` | workstream A, 2026-10-09 | CSS keyframes and a JS timer |
| **Fish** (`icon-fish`): a plump fish facing right, forked tail, top fin, belly band, gill, sheen, eye | `src/ui/art/fish.ts`, `src/ui/art/sprite.ts` | workstream A, 2026-10-09 | Hand-coded on the 24 grid; the copy calls it "fish", never "golden fish" |
| Icons `icon-plus`, `icon-shop` (basket), `icon-globe`, `icon-crown`, `icon-users` | `src/ui/art/sprite.ts` | workstream A, 2026-10-09 | The 24-grid line style of the Phase 2 icons |
| The X mark: white X over a 20-unit edge in `--xe` (the tile mixed 70 % toward `--ink`), drawn in with B's timing | `sprite.ts` (`mark-x`), `board-cells.ts`, `board.css` | workstream A, 2026-10-09 | WCAG 1.4.11 carried by the edge (edge vs tile ≥ 3.32:1, white vs edge ≥ 6.27:1, `palette-check`) |
| Solved-board glow look (a radial of `--glow`, 1.3 × slot) | `src/styles/board.css` | workstream A, 2026-10-09 | CSS gradient; B animates it |
| Event accessories `acc-lantern`, `acc-scarf`, `acc-yarn` | `src/ui/art/accessories.ts` (added to the sprite from the lazy `events` chunk) | workstream A, 2026-10-09 | Hand-coded on the head's 100 grid; the notched ear stays clear |
| Event page patterns (paper lanterns, snowflakes, yarn balls with hearts; 72 × 72 tiles) and the event art (a 48 px Tux bust on the Home card, Tux sitting in the event-screen header, both wearing the accessory) | `src/ui/art/event-art.ts`, `[data-event-theme]` blocks of `src/styles/tokens.css` (the patterns moved to `events-chunk.css` at 2d I-4), `src/styles/events-chunk.css` | workstream A, 2026-10-09 | Generated SVG (snowflakes from polar coordinates); motif colours a shade off each page so text keeps ≥ 4.5:1. Our own themes for our own events |
| **The Classic token set** (one theme): page `#FAF6F0`, ink `#2F2A35`, orange accent `#E57010` and its title, text, deep, soft and focus shades, stage, scrim, gold, fish, glow, RGB triplets, the three event themes; tokens beyond the spec table listed in phase2b CONTRACTS §11.5 | `src/styles/tokens.css`, `src/ui/art/palette.ts` | Values from parity-spec §1.4 (our own, R6); derived shades chosen by workstream A, 2026-10-09 | `scripts/palette-check.ts` reproduces every §1.4 and §1.12 number |
| Per-script display stacks (ja, ko, zh, th, hi, ar, ru, vi) | `src/styles/tokens.css` | workstream A, 2026-10-09 | System font names only; no font files |
| Favicon (a paw on `#E57010`, toes `#FFF4E6`) and `theme-color` `#FAF6F0` | `public/favicon.svg`, `index.html`, dev harness pages | workstream A's proposal, applied by the integration lead, 2026-10-09 | Replaces the ginger favicon |
| **Motion** (workstream B): the fish flight (quadratic Bézier, fixed −10 % / 0 / +10 % spread, path sampled in JS, tilt capped at 70°, trail of five four-point stars), the solved-board glow, screen transitions (`to_game`, `from_game`, a reduced crossfade), the board entry wave, board-cat breathing and ear flicks, the heart break (crack, falling halves, three shards), fish pill motion (fade, number roll, bump, rising "+3"), victory sun rays (a 12-ray conic gradient), the ranking panel pop, tap pulse and fade-out | `src/ui/fx/*.ts`, `src/ui/board/board-fx.ts`, `board-view.ts`, `src/ui/hud/pills.ts`, `src/styles/fx.css`, `src/styles/overlay-chunk.css` | workstream B, 2026-10-09 | WAAPI and CSS keyframes; durations from `GameConfig` (§10 of the spec) |
| **Layouts** (workstream B): fish pill, ranking panel, rankings hub, victory screen, shop sheet, group result, event screen, Home event card, Settings language view, O2 swap button | `src/ui/overlays/*.ts`, `src/ui/screens/*.ts`, `src/styles/screens.css`, `overlay-chunk.css`, `events-chunk.css` | workstream B, 2026-10-09; stylesheets split into the lazy chunks unchanged by the integration lead, 2026-10-09 | Our own layouts from the spec's tables, with the Phase 2 component vocabulary and A's tokens only |
| RTL overrides (board and top bar stay LTR, mirrored chevrons and switches) | `src/styles/i18n.css` | workstream E, 2026-10-09 | Hand-written CSS |

### 8.3 Sound

| Asset | File | Author and date | Method |
|---|---|---|---|
| `fish_pop` ("bloop" as each fish pops) | `src/audio/sfx.ts` | workstream B, 2026-10-09 | Synthesized: a sine bending 360 → 1 020 Hz in 110 ms, a sub-octave body and a short low-passed noise splash |
| `fish_plink` (each arrival) | `src/audio/sfx.ts` | workstream B, 2026-10-09 | Synthesized: a sine at E6 raised `audio.fishPlinkStepSemitones` per fish, an inharmonic ×2.76 partial, a soft ×2 triangle and a 15 ms high-passed click |
| `board_in` (a board enters; review PAR-8) | `src/audio/sfx.ts` | review fix group U, 2026-10-09 | Synthesized: a band-passed noise swell opening 500 → 2 600 Hz over 420 ms under two soft sines a fifth apart (G4, then D5) and a faint ×2 triangle; our own recipe from the words "a board-entry sound" (01 §13.1), no reference audio |

### 8.4 Text and translations

| Asset | File | Author and date | Method |
|---|---|---|---|
| The Appendix A English strings, split by owner | `src/i18n/en/{art,ui-2b,events,platform,i18n}.ts` | F0 lead from the spec's Appendix A, 2026-10-08; refined by the owners until the copy freeze; B added `rank.entries.*`, `rank.records.thisPuzzle`, `rank.tab.*`, `shop.swap.a11y`, `shop.buy.a11y`, `shop.retry`, `group.wins`, `event.track.*` | Our own wording; "fish" (never "golden fish") and "kitty". `tests/unit/sanity.spec.ts` checks every catalogue against the banned phrases (one list, shared with `scripts/i18n-check.ts`: 06 §3 plus the original's event names and "golden fish") |
| Changed values of `a11y.mascot`, `a11y.illustration.{boot,win,fail}` (the black-and-white cat) | `src/i18n/en.ts` | F0 lead, 2026-10-08 | Appendix A |
| Event names and taglines: Lantern Walk, Snow Paws, Yarn Hearts | `src/i18n/en/events.ts` | spec §4.3 (ours), 2026-10-08 | Not the original's event names; gate G8 still clears them against store listings |
| Endonyms (`LOCALE_NAMES`) and `time.daysHours` | `src/i18n/en/i18n.ts` | workstream E, 2026-10-08/09 | Each language's own name (public facts) |
| **16 translations (AI drafts, unreviewed)**: es (Latin American), pt-BR, fr, de, it, id, tr, pl, ru, vi, th, ja, ko, zh-Hans, hi, ar | `src/i18n/locales/*.ts` | Claude (Anthropic) for workstream E, 2026-10-09 | Written directly as TypeScript catalogues in one session from our English catalogue, the per-key notes and length limits (`src/i18n/meta.ts`) and the glossary (`docs/i18n/glossary.md`). The brief never named or described the original game, and no localized UI of any other game was consulted (06 §2 step 6). `docs/i18n/drafted-from.json` records each key's English source at drafting time. Revised the same day (shorter strings after the 320 px screenshots; Hindi shortened for its chunk budget; English-only date parts and unused `.one` forms dropped). They ship only in dev, e2e and preview builds until a native review approves them in [`docs/i18n/review-log.md`](i18n/review-log.md) (`i18n.releaseLocales` is `['en']`) |
| Glossary (term choices, colour and glyph names in 16 languages) | `docs/i18n/glossary.md` | Claude for workstream E, 2026-10-09 | Written before the catalogues as part of the same brief |

The translation brief, as given to the model (one session, all 16 languages):

> Translate the English UI copy of a calm cat logic puzzle game (`src/i18n/en.ts`) into es (neutral Latin American), pt-BR, fr, de, it, id, tr, pl, ru, vi, th, ja, ko, zh-Hans, hi and ar. Use the per-key notes, placeholders and length limits in `src/i18n/meta.ts` and the terms in `docs/i18n/glossary.md`. Keep every `{placeholder}`; keep strings short where the layout is tight (chips 18, buttons 22, titles 28; check the longest German and Russian strings at 320 px); write warm, natural copy rather than literal translations; use the colour as a name in apposition; keep placeholders in a case-free position in languages with case; add the plural forms each language needs; use Latin digits; call the paw booster by one cute word for a small cat and the currency plain "fish". Do not reuse any other game's wording.

### 8.5 Dev-only material (not shipped)

`dev/art-harness.*` (A) and `dev/b-harness.*` (B), and the screenshots taken from them and from the built app with Playwright (`docs/phase2b/screenshots/`, `docs/i18n/screenshots/`): our own build and our own art.

### 8.6 The drafts

The workstream drafts `docs/phase2b/provenance-{F0,A,B,E}.md` are merged above; each now only points here. C and D added no art, sound or text beyond the event content (§5) and the platform strings (`src/i18n/en/platform.ts`, D: none new in 2b).

## 9. Phase 2c: fish are lives (workstream G2, 2026-10-09)

The full rows, with method notes, are in the draft [`docs/phase2c/provenance-G2.md`](phase2c/provenance-G2.md); the lead merges any further 2c rows (G1, G3) here at I-5. Everything below is ours, written as code and text by Claude (Anthropic) for G2 from [fish-lives-spec](phase2c/fish-lives-spec.md) §1–§5 and Appendix A. No reference image, no source of 06 §4, and no colour, size or timing sampled from the original (spec R6).

| Asset | File(s) | Author and date | Method |
|---|---|---|---|
| Empty-life fish `icon-fish-empty` (one outline of our fish silhouette, ink at 30 %, `--life-empty` wash) | `src/ui/art/fish.ts`, `src/ui/art/sprite.ts` | G2, 2026-10-09 | Hand-coded on the 24-unit grid of `icon-fish`. `icon-heart`, `icon-heart-empty` and `clip-heart-*` are retired (deleted) |
| Lives pill (three fish slots) | `src/ui/hud/pills.ts`, `src/styles/hud.css` | G2, 2026-10-09 | DOM and CSS; replaces the hearts pill |
| Fish loss (wriggle, flip out, three droplets, outline fades in, pill swell; 700 / 400 ms) and the revive pop (520 ms, two droplets) | `src/ui/hud/pills.ts`, `src/styles/fx.css` | G2, 2026-10-09 | Designed in words in spec §1.3–§1.4, keyframes and timings ours, tuned on captures of our own build |
| Period pill (Home) and in-game period counter (roll, bump, rising "+N") | `src/ui/hud/pills.ts`, `src/styles/screens.css`, `src/styles/fx.css` | G2, 2026-10-09 (motion from B's 2b fish pill) | Our `icon-trophy` in `--gold` on a white pill; replaces the fish pill and its "+" |
| Victory kept-fish row, level points chip, perfect-streak chip; period board, records rows and "This week" tab; How to play lives and points notes; out-of-fish badge | `src/ui/overlays/{victory-screen,ranking-panel,rank-hub,how-to-play,fail-overlay}.ts`, `src/styles/overlay-chunk.css` | G2, 2026-10-09 | Layouts ours, from our own icons |
| Fish flight from the lives pill (`startScale`, spread for 1–N fish, size from the icon) | `src/ui/fx/fish-flight.ts` | G2, 2026-10-09, extending B's 2b flight | Bézier path in JS |
| English copy (Appendix A.1, A.2, `rank.records.streakBest`) and the 16 redrafted catalogues (**AI drafts, unreviewed**) | `src/i18n/en.ts`, `src/i18n/en/ui-2c.ts`, `src/i18n/locales/*.ts`, `src/i18n/meta.ts`, `docs/i18n/glossary.md` | G2 (Claude), 2026-10-09 | Same brief as §8.4: our English, `meta.ts` and the glossary only; logged in `docs/i18n/review-log.md` |

No new sound: the fish loss keeps the `mistake` and `heart_last` cues (ids unchanged).

**Integration (lead, I-5, 2026-10-09).** No further rows: G1 (game and app logic, the event milestone data) and G3 (platform, the FB stub) made no drawing, animation, sound or player-facing copy; the lead's integration changes are code and text only (the `dev/**` harnesses, which are never shipped, and the removal of the paw-points strings `rank.points` and `rank.records.thisLevel`). The `docs/phase2c/screenshots/final-*.png` set was captured by the lead from our own built e2e apps (STATUS-2c §6). No source of 06 §4 was opened.

## 10. Phase 2c.1: level points per cat (workstream G2, 2026-10-10)

Everything below is ours, written as code and text by Claude (Anthropic) for G2 from [fish-lives-spec](phase2c/fish-lives-spec.md) §10 (the user's first-hand rule F5 says only that a running total shows during play and the level's total at the win; how the original draws it is not reported, so the look is ours). No reference image, no source of 06 §4, and no colour, size or timing sampled from the original (spec R6). Draft rows with method notes: [`docs/phase2c/provenance-G2.md`](phase2c/provenance-G2.md) §2c.1.

| Asset | File(s) | Author and date | Method |
|---|---|---|---|
| `icon-points` (a plump four-point sparkle with a small solid sparkle at its top end; gold `--icon-fill`, ink outline) | `src/ui/art/sprite.ts` | G2, 2026-10-10 | Hand-coded on the 24-unit grid as two cubic-curve paths, drawn anew in the shape family of our own victory-illustration sparkles; the same line style as `icon-trophy` |
| HUD level-points counter (white pill, centred in a `1fr auto 1fr` pills row; `[data-final]` highlight at the win; tight fallback) | `src/ui/hud/pills.ts`, `src/styles/hud.css` | G2, 2026-10-10 | DOM and CSS; layout D21 of the spec, sizes ours, checked on captures of our own build at 320, 390 and 1280 and in de and ar |
| Counter motion: number roll (`fx.levelPoints.rollMs` 360), icon bump (×1.18) and the rising "+576" chip (`plusMs` 700, 6 px rise; reduced motion: a 150 / 600 ms fade) | `src/ui/hud/pills.ts` (`buildCounter`, shared with the period counter), `src/styles/fx.css`, `src/styles/screens.css` | G2, 2026-10-10 (roll and chip from our 2c period counter) | The 2c roll and chip code generalised into one builder; the per-cat chip is smaller than the win flow's and pops out of the pill's top edge so its rise stays clear of the title |
| Win flow: the period counter fades in in the cat counter's cell while the cat counter fades out (200 ms) | `src/ui/hud/pills.ts`, `src/styles/fx.css` (`pill-fade-out`) | G2, 2026-10-10 | CSS keyframe; spec §10.3 |
| Victory points row ("7,296 points" with `icon-points` in a white pill); the "Perfect ×N" chip and its row are retired | `src/ui/overlays/victory-screen.ts`, `src/styles/overlay-chunk.css` | G2, 2026-10-10 | Layout ours |
| Period records row "Total points" (replaces "Perfect streak"); How to play level-points note with `icon-points` | `src/ui/overlays/{ranking-panel,how-to-play}.ts` | G2, 2026-10-10 | Our layout and our sentences |
| English copy (§10.7: `game.points.a11y`, `a11y.points.*`, `points.count.*`, `howto.levelPoints`; `howto.points.*` without the streak sentence) and the 16 redrafted catalogues (**AI drafts, unreviewed**) | `src/i18n/en/ui-2c.ts`, `src/i18n/locales/*.ts`, `src/i18n/meta.ts`, `docs/i18n/{glossary,review-log}.md`, `docs/i18n/drafted-from.json` | G2 (Claude), 2026-10-10 | Same brief as §8.4: our English, `meta.ts` and the glossary only |

No new sound or haptic (spec D23): the cat's own cue marks the moment. Screenshots `docs/phase2c/screenshots/points-*.png` are of our own private e2e build.

**Integration (lead, 2c.1, 2026-10-10).** No further rows: G1 (the scoring rule, the reducer and the save fields) made no drawing, animation, sound or player-facing copy, and the lead's integration changes are code and text only (the `dev/**` harness fixtures, which are never shipped; the top bar's title split that keeps the level number visible, N1). The final screenshots `docs/phase2c/screenshots/final-*.png` are captures of our own built e2e app.

## 11. Phase 2d: the game screen from the user's recording (workstreams G2 and G3, integration, 2026-10-10)

Merged at integration I-5 from the workstream drafts [`docs/phase2d/provenance-G2.md`](phase2d/provenance-G2.md) (art, board, tokens) and [`docs/phase2d/provenance-G3.md`](phase2d/provenance-G3.md) (HUD, motions, copy), which keep the longer method notes. Spec: [look-spec](phase2d/look-spec.md).

- **Decision D-2d-0 (user, 2026-10-10).** The user's own recording and screenshot of the original's game screen may be used as a **look and layout reference**: measuring sizes, positions and proportions, timing motion and sampling colours are allowed (parity-spec §0.3 R6 is reversed for this recording). **No tracing**, no file of the original, our own copy. Gate G-LEGAL still blocks a public release.
- **How it was made.** Every drawing was written by an AI coding agent (Claude, Anthropic) as hand-typed SVG path data in TypeScript from the written descriptions in look-spec §1 and Appendix C; every motion and layout as hand-written CSS / WAAPI; every string as our own words. Where a shape could only come out like the original's (a left arrow, a cog, a play triangle, a white disc), it is drawn with our own proportions on our 24- or 100-unit grid.
- **What was not used.** No frame of the recording was traced, copied or opened in an editor while drawing; no source of [06 §4](phase1/06-legal-and-originality.md) was opened; no image, audio or text generator other than the coding agent. The numbers from the recording (sizes, positions, ratios, timings, the sampled colours) come from the measurement notes and look-spec §1, never from pixels in our files.
- **How it was checked.** Only against our own renders (the workstreams' private builds; `docs/phase2d/screenshots/G2-*.png`, `G3-*.png`; the lead's `INT-*.png` from `dev/look-compare.ts`). The side-by-side images with the user's recording are made in the session scratchpad only and never committed (D-2d-0 d); `dev/look-compare.ts` reads the reference from `$MEWDOKU_ORIG_REF` and refuses a folder inside the repo.

### 11.1 Art (SVG, hand-coded; G2)

| Asset | File(s) | Method and words drawn from | Bytes |
|---|---|---|---|
| `icon-back` (the game bar's back arrow) | `src/ui/art/sprite.ts` (`art2d`) | One path on the 24 grid: a horizontal shaft and two head strokes meeting at the left, stroke 3.1 with round caps and joins, `currentColor`. The 20 × 17 box and the 3.1 stroke are measured numbers (look-spec §1.4). | 195 |
| `icon-gear` (redrawn; the 2c.1 line cog with a computed polar outline is retired) | `src/ui/art/sprite.ts` (`iconSymbols`) | A filled cog in `currentColor`. The body is a stroked ring (r 6, width 4.2), so its open centre (Ø 7.8) lets the white disc show through, as the spec's even-odd hole does. The six teeth are 5.4-wide round-capped strokes at 60° steps, pointing up and down. These are our own proportions on the 24 grid, not an outline copied from any cog. | 271 |
| `icon-play` (the video badge's mark) | `src/ui/art/sprite.ts` (`art2d`) | A right-pointing triangle filled and stroked in `currentColor` with round joins (rounded corners). | 167 |
| `tool-kitty` (the kitty helper's art) | `src/ui/art/sprite.ts` (`art2d`), `src/ui/art/cat-parts.ts` | Our own Tux head (phase2b §1.6, `catHead`) with the `wink` eyes and the `open` mouth, both already in our cat parts. The left eye is an open light-green iris. The right eye is a closed arc, drawn in ink because that eye sits on Tux's white blaze, where a light arc would not show. The open smile has the pink tongue. The asymmetric blaze and the notched left ear complete it. No new drawing; the viewBox is cropped to the head. Integration (I-polish c): drawn in a 36 × 36 s box so the art measures 34.7 × 34.3 like the original's. | 2 605 (generated; about 80 B of code) |
| `tool-bulb` (the hint helper's art) | `src/ui/art/sprite.ts` (`art2d`) | A round glass bulb in `--gold` narrowing to a neck. It has a softer `--fish` shade along the lower glass and a white highlight ellipse (75 %). The screw base is two `--hard` violet rings with a lighter violet ring between them, plus a rounded tip. Hand-typed on the 100 grid; the viewBox is fitted to the art (21.3 × 34 at s = 1). | 763 |
| `tool-mouse` (the mouse helper's art) | `src/ui/art/sprite.ts` (`art2d`) | A grey mouse face in front view, with the colours given in look-spec §1.11. The round head is `#B8B4BC` with a lighter muzzle `#D9D6DC`. Two large round ears have Tux's pink `#F2A3B4` inside. It has bead eyes with a white catchlight, Tux's pink nose, two white front teeth with a thin grey edge, a small mouth line and three thin whiskers a side. Circles, ellipses and two short paths; the viewBox is fitted to the art (35 × 31.3). | 975 |
| `cat-head-flat` (the heads pill's head, D-2d-18) | `src/ui/art/sprite.ts` (`art2d`) | A plain cat-head silhouette, one closed path in `currentColor`. The head is wide and soft, slightly wider than tall. Two triangular ears are set a little outward, with softly rounded (quadratic) tips. The top edge between the ears is flat. No notch, no face, no outline. Drawn from look-spec §1.6's words on the 100 grid. Integration (I-polish e): the viewBox is the silhouette's own box (`4 5.7 92 90.3`), so a head draws 21.3 wide like the measured ones. | 252 |
| `art-flex` (the start toast's flexed arm) | `src/ui/art/sprite.ts` (`art2d`) | One silhouette on the 24 grid: a horizontal upper arm with a bicep hump, an elbow at the lower right, a forearm rising to a rounded raised fist. It is `--fish` gold with a `--fish-deep` underside and wrist crease and two `--fish-hi` highlights. No outline. | 620 |
| `icon-fish` (redrawn; the 2c.1 fish facing right with an ink outline is retired) | `src/ui/art/fish.ts` (`fishMarkup`, `FISH_BODY`), `src/ui/art/sprite.ts` | A plump round body with the head at the left, facing left. The forked tail sits at the lower right: two rounded lobes with a notch, the lower lobe in `--fish-deep`. It has a darker lower-body crescent in `--fish-deep`, a `--fish-hi` highlight on the upper body, three small scale arcs toward the tail and one `--ink-deep` eye dot. No outline. Drawn on the 24 grid. The tail was first drawn at 0° and turned 28° about the body's lower right, with the turned coordinates baked into the path. Not mirrored in RTL. The win pose draws the same markup larger (`illustrations.ts`). | 908 |
| `icon-fish-empty` (redrawn with the new silhouette) | `src/ui/art/fish.ts` (`fishOutlineMarkup`) | The 2c idea is kept: the same silhouette (tail, body) as one outline only, `--ink` at **40 %** (look-spec §1.5; was 30 %), around a `--life-empty` wash, with no eye, shade or scales. It is scaled about the fish's centre so its outer edge matches the full fish. | 754 |
| `mark-x` (redrawn; How to play) | `src/ui/art/sprite.ts` (`markSymbols`, `markRects`, `crossRects`) | The board's X: two white rounded rects crossed at ±45° about the centre of the 100 box (below). | 243 |
| `ruleDiagram(kind)` (the rule cards' 3 × 3 mini diagrams) | `src/ui/art/rule-art.ts` (new) | Cells are 10.2 squares at an 11.25 pitch on a 32.7 box, radius 1.5. Plain cells are `--rule-tile` tan; `colours` uses `--rule-tile-2` for its second region. A marked cell is a `--rule-mark` box with a white X: two bars 1.53 thick and 7.85 long, so the bars are 15 % of the box and the X spans 65 %. The cat cell shows our `#cat-idle` Tux at 90 %. **Our own three layouts** (look-spec §1.7), not the original's: colours, cat at (1, 0), X on (0, 0–2) and (2, 0); lines, cat in the centre, X on the four edge midpoints; space, cat at (0, 0), X on (0, 1), (1, 0), (1, 1). | 0.84 KB code; 1.8 KB markup |

### 11.2 The board look (geometry from measured numbers; our own CSS; G2)

| Item | File(s) | Method |
|---|---|---|
| The X glyph: two white rounded bars | `src/ui/board/board-cells.ts` (`markGroup`), `src/ui/art/sprite.ts` (`markRects`), `src/styles/board.css` | Two `rect`s per cell in `g.cell__xg` on the slot's 100-unit box, with values from `layout.mark` (measured on the user's recording, look-spec §1.10): 69 long, 18.2 thick, corner 6, centred, rotated ±45°. At slot 38 / tile 35 this gives a 6.9 px bar, 26.2 px tip to tip and a 21.5 px box. The fill is opaque white with no outline. Two edge rects, grown 3.5 per side and filled with `--xe` (the tile mixed 85 % toward `--ink-deep`), show only under `.board[data-patterns]` (D-2d-5). The wrong X uses the same rects in `--wrong`; the hint ghost uses the white rects at 40 %. Replaces the 2b round-capped strokes, their edge stroke and the dash draw-in (`xe-draw`, `--x-len`). |
| The X pop and the mouse's staggered X's | `src/ui/board/board-view.ts`, `src/styles/board.css` (`@keyframes x-pop`) | Ours (motion is not measured; the recording shows no X appearing). A new X scales 0.6 → 1.06 at 60 % → 1 over `fx.markPopMs` (140 ms, ease-out) about the cell centre. The mouse's X's pop `fx.mouseStaggerMs` (90 ms) apart, each hidden under `.fx-pend` until its turn. Reduced motion: no pop. |
| Board card and tiles | `src/styles/board.css`, `src/ui/board/board-view.ts` (`setSlot(slot, frame)`), `src/ui/board/layout.ts` (`gapFor`, `evenInsets`) | Measured ratios (look-spec §1.8): no shadow and no border on the card, radius `cardRadius × s`, padding `max(3, round(cardPad × s))`. The gap is `round(slot × 7.9 %)`; every tile is inset gap / 2. The tile radius is 11 % of the tile edge, published as `--cell-r`, a fraction of the slot. |
| The game screen's vertical stack | `src/ui/board/layout.ts` (`computeLayout`) | The measured rows and gaps of `layout.game`, all scaled by one factor s (look-spec §1.1, D-2d-1). Spare height goes above the bar (at most 62 s) and the rest below. The dev and e2e safe-area override (`--dev-safe-top` / `--dev-safe-bottom`) is read by the probe and by `--safe-*`. |
| Round icon buttons (`.btn--icon`) | `src/styles/base.css` | A white disc at a fixed Ø 37 px on Home and the event screen, with no border. It carries the warm `--shadow-btn` (a measured fit), an `--ink-icon` glyph at 22 px and a transparent hit area of at least 44 × 44 (`::before`). |

### 11.3 Colours (look-spec §1.2, §1.9; G2)

| Item | File(s) | Source |
|---|---|---|
| Region palette | `src/ui/art/palette.ts` (`PALETTE`, `PALETTE_DE00`, `PALETTE_CORE`, `HEAD_ORDER`, `paletteTier`, `regionColorsFor`), `src/styles/tokens.css` (`--r0…--r11`) | Ten colours sampled from the user's PNG screenshot (D-2d-0 a, D-2d-2): Coral `#D57374`, Apricot `#FFAA6D`, Mustard `#E4BB49`, Lime `#AED994`, Lagoon `#48B5B2`, Sky `#6BBCE7`, Violet `#9778D6`, Orchid `#EB85B7`, Slate `#A7BFD7`, Pink `#FAB4D0`. Mint `#52A982` and Cocoa `#B0855A` are ours, chosen by search in the measured L\*/C\* band (D-2d-10). Boards up to 10 × 10 use only the measured ten. `PALETTE_DE00` is recomputed by `palette:check`; the minimum pair is Sky / Slate at 10.40. `HEAD_ORDER` is the recording's order (around the wheel from green), with our two extras slotted in. |
| UI tokens | `src/ui/art/palette.ts` (`TOKENS`), `src/styles/tokens.css` | Sampled from the screenshot: page `#F7F2EF`, ink `#935A5A`, icon ink `#996767`, dot `#F34F4F`, toast `#FEF0C7` / `#DD9045`, rule card `#FBF4EE`, rule tile `#DDBEAA`, rule mark `#AF6D44`, fish `#F1AA22` / `#FED95D`, and the warm shadow and pulse fits. Darkened only to reach a contrast floor (D-2d-17): count badge `#DC2F2F` (measured `#E93636`), video badge `#03A84A` (measured `#02BE52`), fish shade `#D47E18` (measured `#D8811A`). Ours: `--page-2`, `--ink-3`, `--rule-tile-2`, `--wrong` `#6E0E25`, and `--ink-deep` (the 2c.1 ink, kept). |
| Event motif colours (lightened) | `src/ui/art/palette.ts` (`EVENT_PATTERN_COLORS`), `src/styles/events-chunk.css` (`--page-art` URLs; in `tokens.css` until 2d I-4) | Ours. Each motif `a` colour was mixed 15 % toward white so the new `--ink` keeps 4.5:1 on it (look-spec §2.3): lanterns `#FCE3CA` → `#FCE7D2`, snowflakes `#E0E8F3` → `#E5EBF5`, yarn `#FCE0E6` → `#FCE5EA`. |

### 11.4 Motions (CSS keyframes and WAAPI, hand-written; G3)

| Motion | Where | What it does | From the recording | Ours |
|---|---|---|---|---|
| Helper idle pulse | `hud.css` `@keyframes tool-pulse`, `tool-glow`; `tool-bar.ts` `[data-pulse]`; `game-screen.ts` `--pulse-ms`, `--pulse-scale` | The suggested helper's disc grows to `fx.helperPulse.peakScale` (1.08) and its warm glow fades in (0 → 32 %). It holds (→ 36 %), shrinks back (→ 69 %) and rests (→ 100 %). One cycle is `periodMs` 1 500 ms, forever. The count badge does not scale. Reduced motion: no pulse. | the period, the peak scale and the glow's colour (timed and sampled) | the keyframe shape (two plateaus), the glow as a separate `::after` layer, and which helper pulses (`target` 'auto': the kitty while nothing is marked or placed in the attempt, then the bulb; [DECISION] in config) |
| Head found | `fx.css` `.head--pop` (the shared `bump` keyframes, `--head-ms` = `fx.headFoundMs` 300 ms); `pills.ts` | When a colour gets its cat, its head goes from 50 % to full opacity with one pop (scale 1.25 at 40 %). | the 50 % tint until found (look-spec §1.6) | the pop itself (D-2d-9, look-spec §1.6: no description of the original's change was found) |
| Head un-found | `fx.css` `.head--out`, `@keyframes head-out` | An undo (or a revive restore) on the same board fades the head back to 50 % over `fx.reducedMotionFadeMs`, with no pop. | none | all |
| Level-start toast | `start-toast.ts` (WAAPI); `fx.css` `.start-toast` | A pill with our line and our flexed-arm art (G2's `art-flex`) slides in from the inline start (`inMs` 300 ms, ease-out), `delayMs` 150 ms after the board entry starts. It holds `holdMs` 1 200 ms, then drifts out to the inline start at `exitPxPerSec` 100 px/s × s (linear) until it is off the screen. In RTL it moves the other way. Reduced motion: fade in, hold `reducedHoldMs` 1 500 ms, fade out. | the slide-in from the left edge over the rules row, the hold, the 100 px/s drift, the pill's height and inset | the copy ("You can solve this one!", "A hard one. You've got this!", "Fresh start. You can do it!"), the easing and the timings other than the drift |
| Score "+N" chip | `hud.css` `.points-pill__label`; `game-bar.ts` `clampChip` | The 2c.1 level-points "+N" sits at the Score number's inline end, centred on it. When it would reach the gear, it moves back toward the number (`--chip-dx`) so it stays at least 4 px clear of the gear. | none (the recording shows Score 0) | all |
| Period counter over the heads | `pills.ts`; `fx.css` `.pill--heads[data-out]`; `screens.css` `.period-pill[data-in-game]` | In the win flow, the heads pill fades out and the weekly period counter takes its cell (2c.1's counter, moved from column 1). Its "+3" chip sits at the number's inline end. | none | all |
| Coach card row layout | `coach.ts` `[data-row]`; `overlay-chunk.css` | On a short screen with no slot clear of the top bar and the board, "Got it" sits beside the text (a shorter card). | none | all |

### 11.5 Copy (G3)

- Every English string in `src/i18n/en/ui-2d.ts` and the changed `howto.helpers` and `settings.patterns.note` are our own words (look-spec Appendix A). The recording's lines were not copied. The start toast's line is honest: it never claims that other players solved the level.
- The 16 locales' Phase 2d keys are AI drafts by the same agent, marked "Phase 2d (AI draft, unreviewed)" in each catalogue and logged in [review-log.md](../i18n/review-log.md). Terms follow [glossary.md](../i18n/glossary.md) (Score, mouse, the start toast; colour names Coral, Mustard, Violet, Pink).

### 11.6 Integration (lead, I-1 to I-5, 2026-10-10)

| Asset | File(s) | Method |
|---|---|---|
| **Display font, overlaps removed** (both Fredoka 600 files) | `src/assets/fonts/display-latin.woff2` (16 468 → 16 668 bytes), `display-latin-ext.woff2` (2 692 → 2 704 bytes); `dev/font-overlaps.py` | fontTools 4.66.1 `removeOverlaps` (skia-pathops) merged the overlapping contours and decomposed the composite glyphs; glyph set, metrics, kerning and unicode ranges unchanged, plain rendering identical (42 of 183 310 ink pixels differ by more than 32 levels at the antialiased edges). Why: a text stroke in the background colour, used to render the bar's labels and the rule-card text lighter than Fredoka's one 600 face (look-spec §1.3 as built), drew seams where two contours crossed (`t`, `p`, `a`, `1`, …). SIL OFL 1.1 allows modified versions; Fredoka declares no Reserved Font Name. |
| Lighter "Level" / "Score" labels and rule-card text; the numbers without the 2d text stroke | `src/styles/hud.css` | Measured like for like on the recording by `dev/look-compare.ts` (stroke width = 2 × area ÷ perimeter of the ink): the original's labels 1.40 / 1.33 px, numbers 2.39 / 2.65 px, rule text 0.97–1.00 px at s = 1. Ours now 1.51 / 1.53, 2.64 / 2.77, 1.05–1.06 (before: 2.11 / 2.12, 3.40 / 3.43, 1.35–1.38). |
| Fish, heads and helper art sizes; the warm shadow re-fitted | `src/styles/hud.css`, `src/styles/tokens.css` (`--shadow-btn`), `src/ui/art/sprite.ts` (`cat-head-flat` viewBox) | Sizes to the measured ones (look-spec §1.5, §1.6, §1.11); the shadow re-fitted to the recording's profile below the discs (`0 3.5px 8px -2px rgba(--warm-rgb, .22)` × s). Numbers in STATUS-2d. |
| The comparison script | `dev/look-compare.ts` (dev only, never shipped) | Drives the built e2e app with Playwright; reads the reference only from `$MEWDOKU_ORIG_REF` and writes composites only to `$LOOK_SCRATCH` outside the repo. |

The event page patterns moved from `tokens.css` to the lazy `events-chunk.css` (I-4; unchanged art). No new sound in 2d. G1 (the mouse logic, the view fields, the banner in play, the settings dot data) made no drawing, animation, sound or player-facing copy; the mock banner's 320 × 50 position on the game screen is a dev and e2e placeholder only.

### 11.7 Retired in 2d (no longer ship)

| Asset | Why |
|---|---|
| The 2b/2c.1 X: round-capped white strokes over a `--xe` edge stroke, with the dash draw-in (`xe-draw`) | Replaced by the measured rounded bars and the pop (look-spec §1.10) |
| `wrong-x` symbol | It was unused; the wrong X is the board's rects in `--wrong`. The id was deleted from `SymbolId` at I-3. |
| `icon-rule-colours`, `icon-rule-lines`, `icon-rule-space` | Replaced by `ruleDiagram`; the ids were deleted from `IconSymbol` at I-3 |
| The 2c.1 line gear (polar outline, `gearPath()`), the 2c.1 fish (facing right, ink outline, top fin, belly band) and its 30 % empty outline | Redrawn above |
| The 2c.1 palette and the page, ink, fish and wrong tokens | Replaced by the measured values; css-rules' retired-look guard now also fails on the 2c.1 values (`RETIRED_2D`) |

G3's files: 
- The cat counter pill (`.pill--cats`), the in-row points pill, the tight fallback and the compact pill sizes (`pills.ts`, `hud.css`, `screens.css`).
- The 2c.1 rule chips' icons (the chips are now cards with G2's `ruleDiagram`).
- `fx.css`' X draw-in rules (G2's X now pops; look-spec §1.10).
- `.pill--bump .pill__icon` and the old chip CSS.

## 12. Phase 2d.1: the three helpers, the tickers and the palette from the user's recordings (workstreams G2 and G3, integration, 2026-10-10)

Merged at integration I-5 from the "Phase 2d.1" sections of [`docs/phase2d/provenance-G2.md`](phase2d/provenance-G2.md) (art, the board's motion, colours) and [`docs/phase2d/provenance-G3.md`](phase2d/provenance-G3.md) (the HUD, overlay and fx motions, copy), which keep the longer method notes and the byte counts. Spec: [helpers-spec](phase2d/helpers-spec.md). File paths below are the ones after integration I-4 (some rules and symbols moved into lazy chunks; the art and the motion did not change).

- **Decision D-2d1-0 (user, 2026-10-10)** under D-2d-0's terms: the user's three recordings (v1 the mouse, v2 the kitty's cat, v3 the hint, iOS, Level 114, 9 × 9) and two level-start stills may be used to **measure** sizes, positions, timings and sequences and to **sample colours**. **No tracing**, no file of the original in the repo, our own art and our own words. G-LEGAL still blocks a public release.
- **How it was made.** Every drawing was written by an AI coding agent (Claude, Anthropic) as hand-typed SVG in TypeScript from the words in helpers-spec §1.4, §2.4, §5.2 and Appendix C; every motion as hand-written CSS keyframes, WAAPI or one requestAnimationFrame loop whose pieces are pure functions of time; every string as our own words. Where a shape can only come out one way (a four-point star, a paw print, a lightning bolt), it is drawn with our own proportions on our own grid. The timings, scales, orders and colours are the spec's measured numbers; the easing of each segment is fitted to the measured samples (numbers only).
- **What was not used.** No frame of the recordings was traced, copied or opened in an editor while drawing or coding; no source of [06 §4](phase1/06-legal-and-originality.md) was opened; no image, audio or text generator other than the coding agent. The original's hint sentences, its confirm label, its completion word and its ticker statistics are not in our copy (the completion word was readable in the frames and was deliberately avoided).
- **How it was checked.** Only against our own renders: the workstreams' private builds (`docs/phase2d/screenshots/G2-2d1-*.png`, `G3-2d1-*.png`) and the lead's `dev/helpers-compare.ts` on the integrated build (`docs/phase2d/screenshots/FINAL-*.png`), each frozen at an exact ms after the action with Playwright's clock. The side-by-sides with the user's frames are made in the session scratchpad only and never committed (D-2d-0 d); the script reads the frames only from `$MEWDOKU_ORIG_REF2` / `$MEWDOKU_ORIG_FRAMES2` and refuses a folder inside the repo.

### 12.1 Art (SVG, hand-coded; G2)

| Asset | File(s) | Method and words drawn from | Markup (B) |
|---|---|---|---|
| `cat-wink` (the celebrating cat, §2.4) | `src/ui/art/sprite.ts` (`catSymbols`), `cat-parts.ts` | Our Tux head with the existing `wink` eyes and `smile` mouth: the left eye open, the right a closed upward arc in ink on the white blaze, a tiny white four-point glint past the arc's outer end. No new face drawing. | 2 602 (generated) |
| `board-mouse` with `-eyes`, `-lids`, `-grin` (the board's mouse, §1.4) | `src/ui/art/helper-art.ts` (`mouseHead`, `mouseEyes`; first load, shared with `tool-mouse`), `src/ui/art/lazy-art.ts` (the parts; lazy) | Our 2d `tool-mouse` face split into parts on its own box (`1 4.5 98 88`): head (ears with pink insides, muzzle, whiskers, nose, closed mouth, two teeth), bead eyes with catchlights, two grey lids with a closed-eye curve, an open grin with a pink tongue. `tool-mouse` is `mouseHead()` + `mouseEyes()` and draws as before. | 782 + 255 + 300 + 383 |
| `fx-star4` (the points star, §2.5) | `src/ui/art/lazy-art.ts` | A four-point star with concave sides on the 24 grid in `currentColor`, with a round soft core (`var(--star-core, #FFFD79)`). | 348 |
| `fx-shard`, `fx-shard-2`, `fx-shard-3` (the cat's shards) | `src/ui/art/lazy-art.ts` (`shard`) | Three irregular rounded polygons (chunky crystal bits) on the 24 grid: a lit face in `currentColor` (the tile's colour), a shaded lower-right facet (black 18 %) and a small white highlight facet. | 408 / 399 / 390 |
| `art-paw-cap` (the ticker's inline-start cap, §5.2) | `src/ui/art/lazy-art.ts` (`pawCap`; moved from `helper-art.ts` at I-4) | On a 30 × 31 box: the pill's outline around four scallops, each with a round toe bean (`#FFCD9B`), and a large main pad with a soft radial gradient into `--toast-fill`; stroked in `--toast-line`. | 867 |
| `art-bolt`, `art-star` (the tickers' end icons) | `src/ui/art/lazy-art.ts` (moved from `helper-art.ts` at I-4) | A chunky zig-zag bolt in `--gold` with a `--fish` lower facet and a pale highlight; a plump five-point star (radii 9.4 / 4.6) in `--gold` with rounded tips, a pale facet and a white highlight. No outlines. | 290 / 537 |
| The trail and burst sparkle (`SPARK_PATH`; G3) | `src/ui/fx/points-flight.ts` | A plump four-point star with gently concave sides and a cream heart, from the words "four-point sparkles" (§2.5). | code |
| The ghost X's outline (`path.cell__xo`, §3.3) | `src/ui/board/board-fx.ts` (`xOutlinePath`), `board-cells.ts` | Computed, not drawn: the union outline of the two X bars of `layout.mark`, grown so the 1.5 px white non-scaling stroke ends 0.8 px outside the X on a 39 px tile (measured). | 357 (path data) |

The lazy art (the mouse's parts, the star, the shards and the ticker art) is mounted into the sprite by `mountLazyArt()` when the board's motion chunk or the fx chunk loads; the first screen never draws it.

### 12.2 The board's motion (measured numbers; our own CSS and code; G2)

| Item | File(s) | Method |
|---|---|---|
| X draw-in (§4.4, D-2d1-8) | `board-cells.ts` (bar groups), `src/styles/board.css` (`.fx-mark`, `tile-squish`, `x-grow`, `x-reveal`, `x-over`; first load) | On every new X of a tap, a paint or Apply at once: the tile squishes 0.90 → 1 over 80 ms; "\" scales 0.3 → 1 about the X's centre over 70 ms; "/" is revealed from its top-right tip over 130 ms after that; the group overshoots to 1.1 and is back to 1 at 250 ms (`fx.markDraw`). Reduced motion: a 150 ms fade. |
| The mouse's visits (§1.4–§1.5, D-2d1-1) | `src/ui/board/board-mouse.ts`, `src/styles/board-mouse.css` (lazy since I-4: `.board__mouse*`, `mouse-in`, `mouse-out`, `mouse-blink`, `mouse-glance`, `mouse-grin`, `mouse-narrow`, `mouse-tilt`, `x-pop`, the tile press) | One sprite per visit, 0.86 × 0.79 T (measured 0.88 × 0.77), `mouseVisitMs` (935) apart in event order; the tile presses 0.87 → 1 (70 ms); the mouse comes in from 0.5 to 1 by +115; the face is blink, glance or grin (k mod 3, ours); at +850 the X pops 1.15 → 1 (170 ms) under it while it shrinks to 0.77 and fades by +85. A finaliser at `mouseRunMs` removes every hidden X (`.fx-pend`, first-load `board.css`). |
| The cat-placed sequence (§2.4, D-2d1-3) | `src/ui/board/board-cat.ts` (in the lazy board chunk since I-4), `src/styles/board-mouse.css` (`.fx-cat`, `cat-placed`, `.cell__flash`, `cat-wash`, `cat-rays`, `cat-halo`, `.cell__light`, `cat-light`, `cat-twinkle`) | Scale in units of the resting size: 0.3 at 16 ms, 1.56 at 116–133, 1.25 at 300 held to 816, 0.89 at 950, 1 at 1 400; the wink 350–780; our twelve soft rays and a white wash; the halo with the measured `#FEFFEA`; a 3-slot light and six twinkles at our own offsets. `CAT_REMOVED` or a props render cancels it. Before the chunk is in, a cat appears at rest (no flash). |
| Ghost X pop (§3.3) | `board-highlight.ts`, `src/styles/overlay-chunk.css` (`ghost-pop`; moved from `board.css` at I-4: ghosts show only under the hint overlay) | At 333 + 60 i ms in `ghostOrder` (`--gd`), the measured keyframes 0.25 → 1.22 → 0.92 → 1 over 500 ms. |
| Completion waves (§4.2, D-2d1-6) | `board-fx.ts` (`waveOrder`), `board-view.ts`, `src/styles/board-mouse.css` (`wave-bump`, `wave-glow`) | k × 33 ms from the end nearer the anchor (regions by king distance, ours); 0.93 → 1.10 → 1 with a pale yellow glow. |
| Done veil and resting cat (§4.7, D-2d1-15) | `board.css`, `board-cells.ts` (`CAT_BOX`) | The veil skips the found cat's tile; the resting cat's box 86.4 units (0.80 × 0.76 T in our build; measured 0.78 × 0.77). |
| Dark tiles (§6.4, D-2d1-11) | `palette.ts` (`isDarkTile`), `board-cells.ts` (`data-dark`), `board.css` | A white pattern glyph on a tile where white reaches 4:1 (Denim), unless faded. |

### 12.3 Colours (helpers-spec §6; G2)

| Item | File(s) | Source |
|---|---|---|
| Denim `#5B75B2` (palette index 4) | `src/ui/art/palette.ts`, `src/styles/tokens.css` (`--r4`) | Sampled from the user's PNG still (helpers-spec §6.1); replaces our Mint `#52A982`. `PALETTE_DE00` recomputed (nearest: Violet, 14.19). |
| Tiers, the heads ring and its start | `palette.ts` (`PALETTE_CORE`, `paletteTier`, `HEAD_ORDER`, `headOrderFor`) | n ≤ 11 boards draw from the 11 measured colours, n = 12 adds our Cocoa; the ring is measured (§6.5); its start is ours (`cyrb128(puzzleId)[0] mod count`). |
| `--wrong` `#560A1C`; `--toast-fill` `#FFF1C8`, `--toast-line` `#E98E33` | `palette.ts` (`TOKENS`), `tokens.css` | `--wrong` is ours (2d's crimson darkened to 3:1 on Denim); the ticker colours are re-sampled from the PNG still. |
| `--plus` `#FB8515`, `--done-top` / `--done-bottom` / `--done-line`, `--hint-card` (measured); `--apply` `#D38025` (the measured `#F0912A` darkened to 3.05:1 for its white label, D-2d1-16) | `palette.ts`, `tokens.css` | helpers-spec §2.5, §3.2, §4.3 |
| `--halo-rgb` (measured), `--wave-rgb` (measured edge), `--twinkle-cyan` (ours) | `tokens.css` | the cat's halo, the wave glow, the twinkles |

### 12.4 Motions of the HUD, the overlay and the fx layer (G3)

| Motion | Where | From the recordings | Ours |
|---|---|---|---|
| Hint dim with tile cut-outs | `hint-card.ts` `dimPath`, `overlay-chunk.css` `.hint-dim` | black α 0.75, the linear 0.30 s fade, what stays bright, the one-frame close | the SVG even-odd path and its re-measure at `dimMs` |
| Hint card and Apply | `hint-card.ts` `hintLayout`, `overlay-chunk.css` | the boxes, gaps, radius, fill, shadow, type size, the 0.90 press | Apply centred (the original's sits 6.9 px right); a visually hidden close button shown on focus |
| "+N" pop | `points-flight.ts` (`PLUS_SCALE`, `PLUS_ALPHA`) | 0.53 → 1.0 at 83 → 1.15 at 166–216 → 1.0 at 350; the fade 683–916; the orange and the 3 px margin | the type face and the soft shadow |
| Star flight, landing burst | `points-flight.ts` (`playStar`, `playBurst`) | born at 783 on the "+N", the quadratic Bézier over 530 ms, the landing at 1 330, the spread and the warm glow | the comet tail, the sparkle drawing, the drift |
| Count-up | `game-bar.ts` `countTo`, `countValue` | the measured 0, 54, 104, 153 … 576 (quadratic ease-out over 350 ms), no bump | the hold-and-sync rules |
| Shards | `cat-burst.ts` | count, sizes, speeds, gravity, fade | the seeded plan |
| Completion label ("Done!") | `done-label.ts` | place (0.82 pitch below the anchor), size, gradient fill and dark outline colours, timings | the word |
| Found head (face + tint dot) | `pills.ts`, `hud.css`, `fx.css` `.head--pop` | the face, the dot's place and tint, the 0.56 → 1.2 → 1 pop over 280 ms | the dot's ring |
| Helper press and release | `hud.css` `.tool:active`, `@keyframes tool-spring`, `tool-bar.ts` | the 0.90 press, the overshoot ≈ 1.03, settled by +250 | the spring keys |
| Level-start tickers | `src/ui/fx/tickers.ts` (WAAPI), `src/ui/fx/celebrate.css` `.ticker` | the slots, the fill and border, the paw cap, the end icons, the equal crossing time, the 0.086 T lead | the copy, T = 9 s (helpers-spec §8 Q1), the late join |

The fx pieces (points, shards, labels, tickers) are one lazy chunk (`src/ui/fx/celebrate.ts` + `celebrate.css`), prefetched at idle after the first game screen mounts.

### 12.5 Sound (G3; ours, the recordings are silent)

| Sound | File | Recipe (Web Audio, our own design) |
|---|---|---|
| `mouse` | `src/audio/sfx.ts` | Two short high squeaks (sines bending up, the second a little higher), quiet, once per visit. |
| `points` | `src/audio/sfx.ts` | A bell "ting" on A6 with an inharmonic partial and a soft high air click, when the star lands. |
| `unit_done` | `src/audio/sfx.ts` | A bright two-note rise (a fourth) stepping up a pentatonic ladder with the number of units completed in the action. |

### 12.6 Copy (G3)

- `src/i18n/en/ui-2d1.ts` is ours: the completion word "Done!" and its screen-reader line, and eleven ticker lines that state only the player's own numbers (best time, levels solved, level points), the board's (cats hiding) or general true facts (one solution, a daily puzzle, two play tips). The original's tickers state very large player totals and country counts; ours never claim numbers we cannot back.
- The 16 locales' 2d.1 keys and `color.4` "Denim" are AI drafts by the same agent, marked "Phase 2d.1 (AI draft, unreviewed)", logged in [review-log.md](i18n/review-log.md) and following [glossary.md](i18n/glossary.md).

### 12.7 Integration (lead, I-1 to I-5, 2026-10-10)

| Asset | File(s) | Method |
|---|---|---|
| The lazy chunks of I-4 (no new art or motion) | `src/app/coach-chunk.ts` + `src/styles/coach-chunk.css` (the tutorial coach and the shared rich-text styles, preloaded by `index.html`), `src/styles/board-mouse.css` (the board's lazy motion, above), the ghost rules into `overlay-chunk.css`, the ticker art into `lazy-art.ts`, `vite.config.ts` (`preloadFirstRun`, the `core` chunk group) | Rules and symbols moved unchanged; numbers in [STATUS-2d](phase2d/STATUS-2d.md) §11. |
| The comparison scripts | `dev/helpers-compare.ts` (new), `dev/look-compare.ts` (2d.1 changes), `dev/compare-kit.ts` (shared PNG helpers) — dev only, never shipped | Drive the built e2e app with Playwright's clock; read the user's frames only from environment folders outside the repo and write composites only to a scratch folder outside it; the repo gets our side alone (`FINAL-*.png`). |

### 12.8 Retired in 2d.1 (no longer ship)

| Asset | Why |
|---|---|
| Mint `#52A982`, 2d's `--wrong` `#6E0E25`, the video-sampled toast `#FEF0C7` / `#DD9045` | Replaced by measured or contrast-fitted values (§12.3); css-rules' retired-look guard fails on them |
| The 2d level-start toast (`src/ui/fx/start-toast.ts`, `.start-toast`, `GameScreen.playStartToast`, `StartToastKind`) and its flexed arm `art-flex` | Replaced by the two tickers (D-2d1-12); deleted at I-3 |
| The 2d X pop for player and hint marks, and the mouse's 90 ms stagger | Replaced by the draw-in and the visiting mouse; `x-pop` stays only as the mouse's X |
| The kitty's surprised mood on `CAT_PLACED`, the 2b kitty sparkle (`sparkle()`, `.cell__spark`, `@keyframes spark`) and the cat drop (`.fx-drop`, `cat-drop`) | Replaced by the cat sequence; deleted at I-3 (requests-G2 H6) |
| The board's hint dim (`--hint-dim`), its focus ring and `ghost-pulse`; the 2b hint sheet placement (`sheetPlacement`, `fbTopInset`, `HintCardProps.avoidRect`, the top-placed card rule) | The hint overlay dims the screen and the ghosts are outlines; the card is anchored to the board (requests-G3 H2) |
| The Score's "+N" chip and its gear clamp (`clampChip`, `.points-pill__chip`, the `.points-pill__label[data-reduced]` rule) | Replaced by the "+N" over the tile and the star (requests-G3 H3) |
