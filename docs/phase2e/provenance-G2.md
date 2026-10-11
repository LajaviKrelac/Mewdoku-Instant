# Phase 2e provenance draft: workstream G2 (art, tokens)

Status: **merged** into [docs/provenance.md](../provenance.md) §13 at I-5 (2026-10-11; this draft keeps the longer notes) · Date: 2026-10-11 · Author: Claude (Anthropic), workstream G2

## How this art was made

- **Words only.** Every drawing below is hand-typed SVG path data in TypeScript. Each was written by an AI coding agent (Claude) from the written descriptions in [spec](spec.md) Appendix C and §2.4, §2.8 and §5.3, and from our own earlier drawings: Tux, the 2b paw, the 2d pointed-ear head `cat-head-flat`, the 2d fish and the icon set's line style.
- **What was not used.**
  - No image of the original game, of another game or of any app was opened, traced or described while drawing. The user has sent no recording for these features (ask-user M1–M11 are open), so there was nothing to measure either.
  - No source on the [06 §4](../phase1/06-legal-and-originality.md) list was opened (D-2e-0).
  - No image, audio or text generator other than the coding agent itself was used.
- **Look.** The art follows the one Classic theme of Phase 2d ([look-spec](../phase2d/look-spec.md)):
  - colours come from our tokens (`--accent`, `--gold`, `--gold-deep`, `--fish-hi`, `--ink-icon`, `--ink-deep`), Tux's colours, the region palette, or the few new art colours listed below;
  - there are no outlines on the full-colour art, as with the fish and the bulb;
  - the line icons use the icon set's 2-unit round stroke and the soft `--icon-fill` wash.
- **Checks.** The art was checked only against our own renders. A scratch art lab (`lab.mts`, kept in the session scratchpad, not committed) draws every symbol from the real modules and `tokens.css`, at 16–32 px (real size, in mock ranking rows and streak strips) and at 48–160 px. The captures are `docs/phase2e/screenshots/G2-*.png`. The rows and strips in those captures are a lab mock-up for judging the art, not G3's UI.
- **Byte counts.** "Bytes" is the symbol's markup length at run time. Module totals are esbuild-minified (gzip level 9) and compared with `3389380`:
  - first-load sprite (`sprite.ts` + `palette.ts`): **+1.93 KB min / +0.67 KB gzip**. This covers the flame, the four steps, `CHEST_COLORS` and three tokens;
  - `ladder-art.ts`: **8.4 KB min / 3.5 KB gzip**, lazy;
  - `palette-2e.ts`: **1.9 KB min / 0.9 KB gzip**, lazy;
  - `lazy-art.ts`: unchanged (its chunk measures 4.3 KB against its 4.4 KB row).

## Art (SVG, hand-coded)

| Asset | File(s) | Method and words drawn from | Bytes |
|---|---|---|---|
| `icon-streak-flame` | `src/ui/art/sprite.ts` (`art2e`) | "A small warm flame with a paw-shaped base". An `--accent` outer flame leans a little right and has a small side tongue on the left. Its round base ends in **three soft lobes, like a cat's main paw pad**: quadratic lobes with cusps between them. Inside is a `--gold` flame and a `--fish-hi` core. 24 grid, no outline. | 456 |
| `streak-step-empty` | `sprite.ts` | "A paw print outline". The 2b paw geometry (`PAW`: main pad + four toe beans, now shared with `icon-paw`) stroked 1.4 in `--step-line` (`#A6827C`, ours, 3.10 on `--page`) around a `--step-wash` white fill. The strip may recolour one step through `--step-line`; the lab uses `--accent-deep` for "the next step". | 591 |
| `streak-step-done` | `sprite.ts` | "Filled". The same paw filled `--accent` with a 0.9 `--accent-deep` rim, so "done" differs from "empty" by shape (fill vs outline), not by colour alone. | 554 |
| `streak-step-today` | `sprite.ts` | "Filled with a soft check". The done paw on a soft `--gold` halo at 40 %, with a white round-capped check on the main pad. | 744 |
| `streak-step-chest` | `sprite.ts` | "The day-7 chest step". A small wooden chest (`CHEST_COLORS`): a rounded lid with a dark seam, two `--gold` straps, and a gold fish-shaped lock with a `--gold-deep` tail. With `--chest-open: 1; --chest-shut: 0` the closed lid hides and an open lid (its darker inside) stands behind a pale gold light in a `--gold` glow, for spec §5.3's "7 done, the chest open". Kept to few shapes because it is first-load. | 831 |
| `medal-1`, `medal-2`, `medal-3` | `src/ui/art/ladder-art.ts` (`medal`), `palette-2e.ts` (`MEDAL_COLORS`) | "Round gold, silver and bronze medals with a ribbon and a paw emboss; the rank number is drawn by the UI on top". On a 32 grid: a short V ribbon behind (two strips, front and back tone; orange for 1st, sky for 2nd, lagoon for 3rd), then a rim, a face and a white highlight arc. The 2b paw is embossed on the face in a tone of the face's own colour. The disc is centred so the UI's number sits on the face (`MEDAL_FACE` 50 % / 53 %). There is no text in the art. The number in `--ink-deep` reaches 5.91–10.42 on the faces and 4.91–8.99 on the embosses. | 867 each |
| `avatar-0` (ginger) | `ladder-art.ts` (`avatar`, `markings`), `palette-2e.ts` (`AVATAR_COATS`) | "Our cat head (the 2d.1 head silhouette family) in 12 coats … front view, the same eyes; each reads at 28 px". The shared template, used by all twelve: a round tinted disc (r 47; a different palette colour mixed 58 % toward white for each avatar), our `cat-head-flat` silhouette scaled 0.84 inside it, pink inner ears, the coat's markings, an optional lighter muzzle, a 3-unit edge in the coat's shade, the same big eyes for all (Tux's light-green iris with an ink rim, a tall pupil, a catchlight), Tux's pink nose and a small "w" mouth. This one: orange fur, three forehead stripes and two cheek stripes a side in a darker orange, a pale muzzle; Sky disc. | 1 843 |
| `avatar-1` (grey tabby) | same | Grey fur with dark grey stripes (the tabby marks above), a pale muzzle; Apricot disc. | 1 843 |
| `avatar-2` (black) | same | Tux's fur colour, no markings, a light mouth line; Lime disc. | 1 416 |
| `avatar-3` (white) | same | Tux's white, a pale warm edge, no markings; Violet disc. | 1 416 |
| `avatar-4` (calico) | same | White with an orange patch over the left ear and brow (following the head's outline), a dark patch over the right ear, an orange cheek spot; Lagoon disc. | 1 736 |
| `avatar-5` (tuxedo) | same | Tux's family. Dark fur with a white blaze from the forehead to the chin that **sweeps up around the right eye** (Tux's asymmetric mark, redrawn for this head); Mustard disc. | 1 623 |
| `avatar-6` (cream) | same | Cream fur with faint darker cream stripes, a paler muzzle; Orchid disc. | 1 843 |
| `avatar-7` (siamese points) | same | Pale cream fur, dark brown ear points (whole ears, no pink inside) and a dark mask from between the eyes over the muzzle, a light mouth line; Slate disc. | 1 567 |
| `avatar-8` (brown tabby) | same | Brown fur with dark brown tabby stripes, a light muzzle; Pink disc. | 1 843 |
| `avatar-9` (blue-grey) | same | Solid blue-grey fur, a lighter muzzle; Coral disc. | 1 584 |
| `avatar-10` (tortoiseshell) | same | Dark brown-black fur with orange patches: the left ear and brow, the right cheek and a flash down the nose; Denim disc. | 1 754 |
| `avatar-11` (white with grey patches) | same | White with a grey patch over the right ear and eye and a small grey spot on the left brow; Cocoa disc. | 1 642 |
| `icon-heart-line` | `ladder-art.ts` | "A rounded heart, outline". A plump heart with round lobes, drawn as our own path (not the colour-pattern glyph 9). The icon set's 2-unit `currentColor` line with round joins rounds the bottom tip; the `--icon-fill` wash. | 345 |
| `icon-heart-fill` | `ladder-art.ts` | "… and filled (a cheer; never the lives' look)". The same path filled and stroked 2 in `--cheer` (`#D9466A`, ours: 4.17 on `--card`, 3.54 on my row's `--accent-soft`), so it is exactly as big as the outline, plus a soft white highlight. `HEART_POP` (scale 1 → 1.32 → 0.92 → 1 over 320 ms) is the like motion for `Element.animate`; the caller skips it with reduced motion (spec §7.7). | 437 |
| `reward-chest` | `ladder-art.ts` (`chestArt`) | "A small wooden chest with a fish-shaped lock, closed". On a 48 grid: a plank body and a rounded lid (`CHEST_COLORS`), grain strokes, a dark seam, two `--gold` straps with `--gold-deep` rivets and a soft highlight on the lid. The lock is **a gold fish facing left, like our fish**: an ellipse body and a triangle tail, with its eye as the keyhole. A soft ink ground shadow. | 1 178 |
| `reward-chest-open` | `ladder-art.ts` (`chestArt`) | "… open with a glow". A radial `--fish-hi` → `--gold` glow (gradient `chest-glow`). The lid is tilted back, showing its darker inside and straps. Pale light rays rise from a dark opening that holds a gold mound of light. The same body and fish lock, and three small white four-point sparkles. | 2 021 |
| `nick-tag` | `ladder-art.ts` | "A collar name tag (bone-free, round with a bell)". A Coral collar band curving across the top, with a darker lower edge and dashed light stitching. A `--gold-deep` ring holds a round `--gold` tag with a rim, a highlight and the 2b paw engraved at 50 %. A small gold bell (slit and ball) hangs beside it. No bone anywhere. | 1 466 |
| `icon-pencil` | `ladder-art.ts` | An edit glyph. A diagonal pencil with a rounded top, its tip at the lower left, a ferrule line and a tip line, in the icon set's 2-unit round line with the `--icon-fill` wash. | 410 |
| `icon-shuffle` | `ladder-art.ts` | A shuffle glyph. Two crossing curved strokes, the lower one broken where it passes under, each ending in an open arrowhead at the right, in the 2-unit round line. | 322 |
| `icon-info` | `ladder-art.ts` | An info glyph. A circle (with the wash), a 2.4-unit stem and a round dot. | 411 |

## Colours added (ours; all checked or reported by `scripts/palette-check.ts`)

| Colour | Where | Check |
|---|---|---|
| `--cheer` `#D9466A` (token) | The given heart | **≥ 3:1 rows**: 4.17 on `--card`, 3.54 on `--accent-soft` |
| `--step-line` `#A6827C` (token) | The empty paw step's outline | **≥ 3:1 row**: 3.10 on `--page` |
| `--gold-deep` (already in `tokens.css` since 2b; now mirrored in `TOKENS`) | Medal rim 1, chest rivets and lock, the tag's ring and bell | Mirrors `tokens.css` |
| `CHEST_COLORS` `#B9773F` / `#CC8A4E` / `#94582B` / `#5A3420` | Chest wood, lid, grain and inside | Informational (wood 3.64 on `--card`) |
| `MEDAL_COLORS` (silver `#9DA6B4` / `#D9DFE7` / `#C9D0DA`, bronze `#A9612C` / `#DE9A5E` / `#CE8A50`, two ribbon shades `#4B98C4` and `#33908D`, gold emboss `#F3B32F`; the gold face, the gold rim and the orange ribbon are tokens) | Medals | **≥ 4.5:1 rows** (`artContrast`, enforced in `palette-check.spec`; in the CLI after requests-G2 R5): the `--ink-deep` number on each face and on each emboss |
| `AVATAR_COATS` (12 fur colours, edges, marks and muzzles, ours; Tux's fur, white, iris, pupil, nose and ear pink reused) and the 12 disc tints (`mixHex(PALETTE[i], white, 0.58)`) | Avatars | Informational: fur on its disc and disc on `--card`. `art-2e.spec` keeps every two avatars ≥ ΔE00 10 apart in fur or disc, and gives each its own disc colour |
| `TAG_COLORS` (collar Coral `--r0`, `#B2575A`, `#F6D8D3`) | The name tag | Decorative |

## What was not drawn

- **A "missed" step.** Spec §5.1 and §5.3 have none: a missed day resets the run, and the strip shows seven empty steps with the neutral line "A new streak starts today." There is no red, no warning and no urgency (§0.4, §5.1).
- **New O2 pack art.** Spec Appendix C reuses `icon-bulb` and `icon-paw`.
- **`icon-trophy`.** It is unchanged.
