# Asset provenance

Status: Phase 2 integration (2026-10-07); Phase 2b drafts (F0, A, B, E) merged at the 2b integration, 2026-10-09 · Required by [06 §2 step 4](phase1/06-legal-and-originality.md#2-clean-room-process).

This file records, for every asset that ships, who made it, how and when it was made, and with which tools. Each row is a clean-room asset: none uses material from the original game, its web build, a teardown of either, or the sources listed in 06 §4. Update this file in the same change that adds or changes an asset (06 §9 checklist).

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
| Fredoka, weight 600, **Latin extended** subset (Phase 2b, for tr and pl; loaded lazily through its `unicode-range`) | `src/assets/fonts/display-latin-ext.woff2` (2 692 bytes) | SIL Open Font License 1.1, © 2016 The Fredoka Project Authors (same `OFL.txt`) | npm `@fontsource/fredoka` 5.3.0, file `files/fredoka-latin-ext-600-normal.woff2`, byte-identical (MD5 `abd04433096d82478e77921ff95ec727`). Added by workstream A, 2026-10-09. |
| Fredoka, weight 600, Latin subset (display font) | `src/assets/fonts/display-latin.woff2` (16 468 bytes) | SIL Open Font License 1.1, © 2016 The Fredoka Project Authors | npm `@fontsource/fredoka` 5.3.0, file `files/fredoka-latin-600-normal.woff2`, byte-identical (MD5 `f56ba4069e244c2dc8bbc09f5ac8301e`). The licence ships as `src/assets/fonts/OFL.txt` and is linked from About. |
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
| Event page patterns (paper lanterns, snowflakes, yarn balls with hearts; 72 × 72 tiles) and the event art (a 48 px Tux bust on the Home card, Tux sitting in the event-screen header, both wearing the accessory) | `src/ui/art/event-art.ts`, `[data-event-theme]` blocks of `src/styles/tokens.css`, `src/styles/events-chunk.css` | workstream A, 2026-10-09 | Generated SVG (snowflakes from polar coordinates); motif colours a shade off each page so text keeps ≥ 4.5:1. Our own themes for our own events |
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
