# Provenance draft, workstream A (visual identity + art)

Status: Phase 2b draft for the lead to merge into [`docs/provenance.md`](../provenance.md) · Date: 2026-10-09 · Spec: [parity-spec](parity-spec.md) §1, §1.7, §2.9, §4.4, §6.6, Appendix B

## 1. How the A assets were made

- **Who:** workstream A, an AI coding agent (Claude, Anthropic), working from the written brief in parity-spec §1.6 (Tux), §1.7 (fish and icons), §1.4–§1.5 (tokens, board look), §2.9 (Home idle loop) and §4.3–§4.4 (event themes).
- **How:** every drawing is SVG path data typed by hand in TypeScript, on a 100-unit grid (head, moods, accessories), a 200-unit grid (poses) and a 24-unit grid (icons, fish). The pattern tiles are generated SVG on a 72-unit grid. All of it was checked by rendering it in a dev harness (`dev/art-harness.html`, port 5181) and looking at Playwright screenshots, then adjusting coordinates by hand.
- **No references:** no reference images, no screenshots of the original or of any other game, no tracing and no image or audio generator were used. No source listed in 06 §4 was opened. Nothing was sampled (R6): every colour, size and timing below is our own value, chosen from the spec's tables or by eye in our own harness.
- **Clean-room words:** the only knowledge of the original that reached A is the words of parity-spec §1.2 and 01 (a "dark-furred cat, probably tuxedo", "orange buttons and titles", "white X", "even gutters", "off-white page", "cats glow"). Tux's signature marks (the notched left ear, the asymmetric blaze around the right eye), its poses, its fish and the event art are ours.

## 2. New and replaced assets

| Asset | File(s) | Author and date | Method and notes |
|---|---|---|---|
| **Tux, board head** (replaces the ginger loaf head): bun-shaped head x 10–90 / y 28–88, ears tilted 12° out with a round tip, **left ear with a small V nick** near the tip, **asymmetric white blaze** (inverted V from y 39.5 to the chin, sweeping round the right eye up to the brow), light-green irises with a rim, pink nose, "w" mouth, two whiskers per side (ink on the mask, light on the fur), a sheen along the flat top | `src/ui/art/cat-parts.ts` | workstream A, 2026-10-09 | Hand-typed path data on the 100 grid (`HEAD_PATH`, `MASK_PATH`, `earOuterPath`). Colours are the §1.6 palette (`CAT_COLORS` in `palette.ts`). |
| Tux moods: idle, happy (light `^ ^` arcs, blush, open mouth, ears 4° further out), sad (fur / white half-lids, worried brows, drooped ears, small frown), surprised (round irises, small pupils, pricked ears, "o" mouth); the blink lid (fur lid left, white lid right); the ear-flick overlay (the notched left ear alone, clipped to outside the head) | `src/ui/art/cat-parts.ts`, `src/ui/art/sprite.ts` (`cat-idle`, `cat-happy`, `cat-sad`, `cat-surprised`, `cat-blink`, `cat-ear-flick`) | workstream A, 2026-10-09 | Same symbol ids as Phase 2, so every `<use>` is unchanged. Expression lines are light on the dark fur and ink on the white mask. No tears in any mood (06 §3). |
| Tux poses: **home** (sitting, paws together in white socks, tail curled right with a white tip, head tilted 4°, `.pose__tail` / `.pose__head` groups), **boot** (curled asleep, the white tail tip over the nose, two Zs) | `src/ui/art/mascot.ts` | workstream A, 2026-10-09 | Hand-coded SVG on the 200 grid around the board head at ×1.3. Replaces the ginger home and boot poses in place. |
| Tux poses: **win** (mid-leap, both paws gripping one of our fish above the head, `^ ^`, three sparkles; no instrument), **fail** (a flat "pancake", ears back, one white mitten paw over the eyes, two sweat drops; no heart, no tears), **daily** (peeking over a calendar page, one paw on its edge), **tutorial** (sitting, one paw raised for the wave loop) | `src/ui/art/illustrations.ts` | workstream A, 2026-10-09 | Hand-coded SVG on the 200 grid. Replaces the party-hat, bandage, calendar and wave poses of the ginger cat in place. |
| Home mascot idle loop: tail sway ±6° over 2 800 ms, head tilt ±3° every 6–10 s (`fx.mascotHeadTiltMinMs/MaxMs`), static under reduced motion | `src/styles/art.css`, `src/ui/art/mascot.ts` (`startHeadTilt`) | workstream A, 2026-10-09 | CSS keyframes and a JS timer; the breathing and blink stay in B's `fx.css`. |
| **Fish** (`icon-fish`): a plump fish facing right, forked tail, top fin, belly band, gill, sheen arc, eye; used at 16 px and, scaled ×3.6, in the win pose | `src/ui/art/fish.ts`, `src/ui/art/sprite.ts` | workstream A, 2026-10-09 | Hand-coded on the 24 grid; colours are the `--fish`, `--fish-deep`, `--fish-hi` tokens. The copy calls it "fish". |
| New icons: `icon-plus`, `icon-shop` (basket), `icon-globe`, `icon-crown`, `icon-users` | `src/ui/art/sprite.ts` | workstream A, 2026-10-09 (the F0 placeholders, redrawn) | The existing 24-grid line style (`LINE`, 2 units, round caps). |
| The X mark: white X (23→77, stroke 12) over a 20-unit edge in `--xe` (the tile mixed 70 % toward `--ink`) | `src/ui/art/sprite.ts` (`mark-x`), `src/ui/board/board-cells.ts` (`.cell__xe`, `--xe`), `src/styles/board.css` | workstream A, 2026-10-09 | Replaces the 70 % ink X. The edge carries WCAG 1.4.11 (edge vs tile ≥ 3.32, white vs edge ≥ 6.27, `scripts/palette-check.ts`). |
| Solved-board glow look: a radial of `--glow`, 1.3 × slot, behind each cat | `src/styles/board.css` (`.cell__glow`) | workstream A, 2026-10-09 | CSS gradient; B animates its opacity. |
| Event accessories: `acc-lantern` (a paper lantern on a string from the right ear), `acc-scarf` (a striped knitted scarf under the chin), `acc-yarn` (a little yarn heart by the right ear) | `src/ui/art/accessories.ts` (added to the sprite from the lazy `events` chunk) | workstream A, 2026-10-09 | Hand-coded on the head's 100 grid, so they layer over any cat symbol or pose head. The notched left ear stays clear. |
| Event page patterns: paper lanterns, snowflakes, yarn balls with hearts (72 × 72 tiles) | `src/ui/art/event-art.ts` (`eventPatternUrl`), the `[data-event-theme]` blocks of `src/styles/tokens.css` | workstream A, 2026-10-09 | Generated SVG (snowflakes from polar coordinates). Motif colours are a shade off each event page so text over them keeps ≥ 4.5:1 (`EVENT_PATTERN_COLORS`, palette-check). Our own themes for our own events (§4.3); nothing from the original's event cards. |
| Event art for the Home card (a 48 px Tux bust wearing the accessory on the pattern) and the event-screen header (Tux sitting, wearing it) | `src/ui/art/event-art.ts` (`eventArt`), `src/styles/art.css` | workstream A, 2026-10-09 | Composed from the poses above and the accessory symbols. |
| The Classic token set: page `#FAF6F0`, ink `#2F2A35`, orange accent `#E57010` and its title, text, deep, soft and focus shades, stage, scrim, gold, fish, glow, RGB triplets; the three event themes | `src/styles/tokens.css`, `src/ui/art/palette.ts` (`TOKENS`, `CAT_COLORS`, `EVENT_THEME_TOKENS`, `EVENT_PATTERN_COLORS`) | Values from parity-spec §1.4 (our own, R6); the derived shades (`--stage-off`, `--card-off`, `--gold-soft`, `--gold-deep`, `--heart-empty-line`, side dots) chosen by workstream A, 2026-10-09 | Replaces the teal tokens in place. One set, no skins. `scripts/palette-check.ts` reproduces every §1.4 and §1.12 number. |
| Per-script display stacks (ja, ko, zh, th, hi, ar, ru, vi) | `src/styles/tokens.css` | workstream A, 2026-10-09 | System font names only (parity-spec §6.6); no font files. |
| Unchanged and still ours | the 12 region colours, the 12 pattern glyphs, the house, gear, bulb, paw, hearts, trophy, lock, calendar, play-video, close, chevron and rule icons, the wrong X | — | Kept from Phase 2 (provenance rows unchanged). |

## 3. Third-party material

| Asset | File | Licence | Source |
|---|---|---|---|
| Fredoka, weight 600, **Latin extended** subset (for tr, pl), loaded lazily through its `unicode-range` | `src/assets/fonts/display-latin-ext.woff2` (2 692 bytes) | SIL Open Font License 1.1, © 2016 The Fredoka Project Authors (the licence already ships as `src/assets/fonts/OFL.txt`) | npm `@fontsource/fredoka` 5.3.0, file `files/fredoka-latin-ext-600-normal.woff2`, byte-identical (MD5 `abd04433096d82478e77921ff95ec727`). Same package as the Latin face. |

## 4. Retired in 2b (mark these rows in `docs/provenance.md`)

| Phase 2 row | Status |
|---|---|
| "Cat head: loaf shape … (ginger `#F29A4A`, cream `#FFE9CF`)" (`cat-parts.ts`) | **retired in 2b**: replaced in place by Tux |
| "Sprite symbols: 4 cat moods, the blink overlay, mark X …" | cat moods and blink **retired in 2b** (Tux behind the same ids); mark X **retired** (white X with edge); glyphs and icons kept |
| "Full-body poses: home mascot … and boot" (`mascot.ts`) | **retired in 2b**: Tux poses |
| "Full-body poses: win (party hat, confetti), fail (small bandage, sweat drop), daily, tutorial" (`illustrations.ts`) | **retired in 2b**: Tux poses |
| "Region palette (12 colours), UI tokens …" | region palette kept; the teal UI tokens (`--accent` `#17806F`, `--accent-deep` `#0F5A4E`, `--accent-soft` `#DCF2EC`) **retired in 2b** |
| "Board, HUD and overlay styling (layout, region-aware gaps, animations)" | region-aware gaps **retired in 2b** (even gutters, `evenInsets`; `regionInsets` deleted) |

`tests/unit/ui/css-rules.spec.ts` (the retired-look guard) fails if any retired teal or ginger value, or `data-skin`, reappears anywhere in `src/`.

## 5. Not in A's files (for the lead)

- `public/favicon.svg` (lead) still uses the ginger `#F29A4A` and cream `#FFE9CF`. A proposal in the Classic colours (the same paw on `#E57010`, toes `#FFF4E6`) is in A's scratch folder, `2b-A/proposals/favicon.svg`; its markup is in A's hand-off notes.
- `index.html` (C) still has `theme-color` `#FBF6EE` (the Phase 2 page); the Classic page is `#FAF6F0`.
