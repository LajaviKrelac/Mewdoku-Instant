# UI batch (2026-10-13): levelbutton — Hard and Extra-hard frames on Home's "Level N" button

Workstream notes for the lead (plan: "levelbutton (Home Play button, tiers)"). The user's request, verbatim: "Add level
button frames for HARD (red) and EXTRA HARD (purple) levels."

## 1. What changed, and why

- **An honest Extra-hard tier.** Nothing in the game knew "Extra hard". It is now derived from the level data
  (`src/game/ramp.ts`): `levelTier(level, c, board?)` returns `normal | hard | extra`. A level is Extra hard only when it
  is Hard (the schedule is unchanged: L ≥ 30 and L % 10 = 0) **and its own board** needs our hardest technique (grade 5,
  one-step trial) or has a grader effort of at least `levels.extraHardMinEffort` (new config key, **90**). The label
  therefore always describes a real property of the board being offered (spec §0.4 honesty).
  - Shipped levels: 30 of the 98 Hard levels (30.6 %) qualify: 140, 160, 200, 210, 270, 330, 340, 370, 390, 410, 450,
    490, 510, 540, 550, 560, 590, 600, 630, 640, 660, 710, 750, 760, 770, 790, 840, 880, 900, 940. All 6 G5 boards are
    among them. The first one a player meets is level 140.
  - Threshold choice (computed from the packs, Hard levels with `g = 5 || e ≥ t`): t = 85 → 38 (38.8 %), 88 → 31
    (31.6 %), **90 → 30 (30.6 %)**, 92 → 26 (26.5 %), 100 → 21, 110 → 14. 90 is the round value in the middle of the
    plan's 25–35 % band.
  - The runtime does not load a pack to label Home: `src/game/level-tiers.ts` is a **generated** list
    (`npx tsx scripts/gen-level-tiers.ts`; `--check` exits 1 when stale). `tests/property/level-tiers.spec.ts`
    re-reads every pack record and fails when the list, its header or the share (25–35 %) drifts, and checks that the
    list path and the board path of `levelTier` agree for all 1 000 levels.
  - When a board is in memory it decides (`ViewContext.levelBoard`, wired boot → shell from `levels.peekLevel`): a
    loaded pack record (same answer as the list), a **cached substitute board** (the board the player will really get),
    or a **generated endless board**. An endless Hard level whose board is not generated yet shows **Hard**, never Extra
    hard (we never claim more than the board can back). Only Hard levels look the board up.
  - The game bar's badge uses the board being played (`selectGameView`: `session.hard` + `isExtraHardBoard(game.puzzle)`).
- **Frames on Home's Play button** (`.home__play[data-tier=hard|extra]`, first-load `src/styles/overlays.css`): the
  button's own shadow draws a white 3 px separator ring, a 4 px ring in the tier colour (red / purple) and a 4 px 3D
  edge in the tier's deep colour, plus a soft drop shadow; pressing compresses the edge like the plain button's (the
  frame moves with the press). Box-shadow sits outside the box, so the layout and every e2e bounding box keep their
  size. `outline` is untouched (it stays the keyboard focus ring; on a framed button it moves 10 px out, outside the
  frame).
- **The tag**: "Hard" / "Extra hard" sits as a small pill (tier fill, white text, 2 px white border) centred on the
  frame's top edge. It stays inside the button element, so the button's name reads "Level 340 Extra hard" (WCAG 2.5.3:
  the name starts with the visible label) and a tap on the tag is a tap on Play. A framed Play button gets 22 px above
  it (was 14) so the tag clears the event card (6 px measured at 320 and 390 px); the frame clears the daily pill by
  11 px. Not colour alone: the tag's text carries the meaning; the frame is decoration.
- **Badges follow the same colours** (`base.css`): `.badge--hard` is now red (`--tier-hard`), `.badge--extra` (added
  next to it on the same element) purple (`--tier-extra`). The game bar shows "Extra hard" on an Extra-hard board.
- **Copy**: `common.extraHard` = "Extra hard" (first-load `src/i18n/en/core.ts`, right after `common.hard`), meta
  maxLength 12, drafts in all 16 locales after the `common.hard` line, glossary row "Difficulty tags".

## 2. Decisions beyond the plan

| # | Decision | Why |
|---|---|---|
| LB-1 | The tier label is a **tag on the frame's top edge for both tiers**, never inline. The old inline white pill (`.btn--primary .badge--hard`, white with `--hard` text) is removed. | At 320 px the button has 224 px of content; "Level 1000" (≈ 130 px) and "EXTRA HARD" (≈ 100 px) do not fit side by side, and de/ru/hi are longer. One placement for both tiers keeps Home consistent; the label stays centred. |
| LB-2 | The frame replaces the orange 3D edge on framed buttons (the deep edge is in the tier colour). | Red on orange is 1.66:1 and purple 2.01:1; the white ring separates them, the tier-coloured edge makes the frame read as one object. |
| LB-3 | The game bar shows the tier too (Extra hard in purple, Hard in red). | Plan: "Make the game-bar badge follow the same colours"; a red "Hard" in game after a purple "Extra hard" on Home would contradict itself. The h1's accessible name stays the title only (unchanged behaviour). |
| LB-4 | `ViewContext.levelBoard` (+ `ShellDeps.levelBoard`, boot's `levelBoard`) instead of only the list. | The plan's "endless levels use the puzzle when known"; it also keeps a substitute board honest. |
| LB-5 | No npm script for the generator (command in the generated file's header and the script's usage line). | Keeps `package.json` out of the six-way merge. The property test is the guard. |
| LB-6 | The guard is a **new** property file, not an edit of `tests/property/levels.spec.ts` (its header says read-only). | Ownership. |
| LB-7 | Tokens (ours, not measured): `--tier-hard #CF2A2A` (white 5.23), `--tier-hard-deep #9E1C1C` (7.96), `--tier-extra #7A3CC8` (white 6.35), `--tier-extra-deep #55278F` (10.13). `--hard` keeps `#6C3FB5` (the bulb art's violet; no stylesheet uses it any more, its comment says so). | Distinct from `--badge` (count badges) and from `--hard`; every small-text pair ≥ 4.5. |
| LB-8 | Locale drafts kept within 12 columns: fr "Très dur", it "Durissimo", pt-BR "Dificílimo", pl "Arcytrudny", ru "Сверхсложный", de "Sehr schwer", es "Muy difícil", id "Sangat sulit", tr "Çok zor", vi "Rất khó", th "ยากมาก", ja "とても難しい", ko "매우 어려움", zh-Hans "非常困难", hi "बहुत कठिन", ar "صعب جدًا". | The game bar's badge shares a 320 px bar with the number and the Score; the longer natural forms (fr "Très difficile", it "Molto difficile", pt-BR "Muito difícil", pl "Bardzo trudny", ru "Очень сложный") exceed 12. Native reviewers may prefer them (widths are only warnings). |
| LB-9 | Not built: an Extra-hard start ticker, a `tier` analytics param on `level_start`, any reward tied to the tier. | Not requested (map Q8); the messages workstream can call `levelTier` / `isExtraHardBoard` for its odds lines. |

## 3. Files

- Logic: `src/game/ramp.ts` (`LevelTier`, `BoardDifficulty`, `isExtraHardBoard`, `levelTier`), `src/game/level-tiers.ts`
  (generated), `scripts/gen-level-tiers.ts`, `src/app/config.ts` (`levels.extraHardMinEffort: 90`).
- App: `src/app/views.ts` (`ViewContext.levelBoard`; `HomeView.tier` in `selectHomeView`; `GameView.tier` in
  `selectGameView`), `src/app/shell.ts` (`ShellDeps.levelBoard`, passed into the view context), `src/app/boot.ts`
  (`levelBoard` from `peekLevel`).
- UI: `src/ui/screens/home-screen.ts` (`HomeView.tier?`, the tag `.home__tier`, `data-tier`; `data-hard` is gone, nothing
  read it), `src/ui/screens/game-screen.ts` (`GameView.tier?` → bar), `src/ui/hud/game-bar.ts` (`GameBarProps.tier?`,
  `.badge--extra`, relabel on a tier change).
- Styles: `src/styles/tokens.css`, `src/styles/base.css`, `src/styles/overlays.css`; `src/ui/art/palette.ts`
  (`TokenName`, `TOKENS`); `scripts/palette-check.ts` (6 rows).
- i18n: `src/i18n/en/core.ts`, `src/i18n/meta.ts`, 16 × `src/i18n/locales/<id>.ts`, `docs/i18n/glossary.md`.
- Dev: `dev/b-harness.ts` (`&lang=<id>` with `i18n.css`; views `home-hard`, `home-extra`, `game-tier&tier=hard|extra`).
- Tests: new `tests/unit/game/level-tier.spec.ts`, `tests/property/level-tiers.spec.ts`; updated
  `tests/unit/shell/screens.spec.ts`, `tests/unit/shell/review2b-fixes.spec.ts`, `tests/unit/app/flags-views.spec.ts`,
  `tests/unit/ui/hud.spec.ts`, `tests/unit/ui/palette-check.spec.ts`; e2e `tests/e2e/i18n.spec.ts` (new describe),
  `tests/e2e/visual.spec.ts` (new describe at the end).

## 4. Provenance rows (format of docs/provenance.md; for the lead to merge)

Colours (§ "Colours (ours; checked or reported by scripts/palette-check.ts)"):

| Colour | Where | Check |
|---|---|---|
| `--tier-hard` `#CF2A2A` | The Hard badge (game bar), Home's Hard frame ring and tag | White on it 5.23 (≥ 4.5 row); on white 5.23 (≥ 3 row) |
| `--tier-hard-deep` `#9E1C1C` | The Hard frame's 3D edge | 7.17 on `--page` (≥ 3 row) |
| `--tier-extra` `#7A3CC8` | The Extra-hard badge, Home's Extra-hard frame ring and tag | White on it 6.35 (≥ 4.5 row); on white 6.35 (≥ 3 row) |
| `--tier-extra-deep` `#55278F` | The Extra-hard frame's 3D edge | 9.12 on `--page` (≥ 3 row) |

Screens (§ "Screens, overlays and motions"):

| Surface | File(s) | Notes |
|---|---|---|
| Home's Play button frames and tier tag | `src/ui/screens/home-screen.ts`, `src/styles/overlays.css`, `src/styles/base.css` | Hand-written CSS from a written description ("a white ring, then a ring in the tier colour and a deeper 3D edge; a small pill with the tier's name on the frame's top edge"). No art file; no motion of its own (the button's existing press). |

Copy (§ "Copy and words"):

- `common.extraHard` "Extra hard" (`src/i18n/en/core.ts`): a generic two-word difficulty label, named by the lead's plan
  (map Q5 noted it may also be the original's label; it is a plain English phrase, not a slogan). The 16 drafts are AI
  drafts by the same agent from our English, `meta.ts` and the glossary only; unreviewed (review-log entry for the lead).

## 5. Spec and doc lines that are now stale (file:line → suggested text)

- `docs/phase1/02-rebuild-spec.md:201` → "The primary button reads "Level L"; on a Hard level it wears a red frame with a
  "Hard" tag on its top edge, on an Extra-hard level (§11.3) a purple frame with an "Extra hard" tag."
- `docs/phase1/02-rebuild-spec.md:621-627` (§11.3) → add: "**Extra hard** (UI batch 2026-10-13): a Hard level whose own
  board needs G5 or has effort ≥ `levels.extraHardMinEffort` (90): 30 of the 98 shipped Hard levels
  (`game/level-tiers.ts`, generated from the packs; an endless level is Extra hard once its board is generated). It
  plays like any Hard level; it changes only the label and the frame (purple)." and change "shows a "Hard" badge on the
  Home button" to "a red frame and a "Hard" tag on the Home button, a red "Hard" badge next to the title".
- `docs/phase2/differences-vs-original.md:180` → "Every 10th level from level 30 is Hard (98 levels), with a red badge and
  a red frame on Home's button; the 30 whose boards are our hardest are Extra hard (purple)".
- `docs/phase2/differences-vs-original.md:283` → "… Level pill (orange; a red frame on Hard levels, purple on Extra-hard
  levels) …" (the "teal Level pill with a Hard badge" text is older than the 2d look).
- `docs/phase2d/look-spec.md:227` → the Hard badge is `--tier-hard` (red) now, `--tier-extra` with "Extra hard" on an
  Extra-hard board.
- `docs/phase1/01-game-deconstruction.md` → a first-hand row: "User, 2026-10-13: the original's level button wears a red
  frame on Hard levels and a purple one on Extra-hard levels" (the request is the only evidence; no frame measurement).
- `docs/phase1/04-architecture.md` §9 / `scripts/size-check.ts`: the first-load CSS row (see §7).

## 6. Tests and checks (all green in this worktree)

- `npx tsc --noEmit` clean.
- Unit/property: `tests/unit/game/level-tier.spec.ts` (thresholds, the list path, the board path, non-Hard never extra,
  config overrides), `tests/property/level-tiers.spec.ts` (packs ↔ list ↔ file text, 25–35 % share, list path = board
  path for 1 000 levels), Home (`data-tier`, tag text/classes, the name order), German relabel of the Extra-hard tag,
  `selectHomeView` tiers with and without a board in memory (only Hard levels ask), `selectGameView` tiers from the
  board, the game bar's badge, the palette ratios.
- `npm run i18n:check`, `npm run palette:check` OK (only the 6 pre-existing width warnings).

## 7. e2e (not run here: the lead runs Playwright)

- `tests/e2e/i18n.spec.ts` new describe "UI batch: the Extra-hard level button in <de|ar|hi|ru> at the small phone"
  (web-320 only): level 340 with the event card on (`IN_EVENT_MS`), asserts `data-tier="extra"`, the tag's catalogue
  text and whole width, the tag inside the button's width and ≥ 2 px under the event card, the frame inside the
  viewport and ≥ 2 px above the daily pill, `noOverflow` + `noClipping`, then in game the badge (`.badge--extra`,
  catalogue text) apart from "340" and `barFits`. Added the `hi` catalogue import. Measured in the dev harness at
  320 × 568: tag 6 px under the event card, frame 11 px above the daily pill, no sideways scroll in de/ar/hi/ru.
- `tests/e2e/visual.spec.ts` new describe at the end: Home at levels 40 and 340 (`data-tier`, tag text, accessible name
  by regex, ≥ 13 px under the frame) and captures `docs/phase2e/screenshots/UI-levelbutton-home-<hard|extra>-<w>.png`
  (new files on the lead's run; review and commit them).
- Existing specs that render a Hard Home: `layout.spec.ts` "Home at 320 × 568" (`veteranSave(30)`, level 30 = Hard, tier
  hard): Play moves 8 px down (margin 22 instead of 14) and the hero's `fitHero` absorbs it; the frame and tag are
  outside the measured boxes, so the overlap checks are unchanged. Re-check that "Play on screen" still holds with the
  banner in de. Nothing read `data-hard`.

## 8. Sizes (FBIG build, bytes; base = `3067892` built the same way)

| Chunk | Base | Now | Δ | Ceiling |
|---|---|---|---|---|
| `index-*.css` (first load, + `coach-chunk-*.css` 2 898) | 49 511 (52 409) | 50 229 (53 127) | +718 | 51 700 (already over at base) |
| `index-*.js` | 282 977 | 283 814 | +837 | Main JS row 354.7 / 360.0 KB, ok |
| `core-*.js` (preloaded) | 62 728 | 62 882 | +154 | (in Main JS) |
| `locale-hi-*.js` | 41 839 | 41 886 | +47 | 41 900 (14 B left) |
