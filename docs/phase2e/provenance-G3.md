# Phase 2e provenance draft: workstream G3 (screens, overlays, HUD, copy, i18n)

Status: **merged** into [docs/provenance.md](../provenance.md) §13 at I-5 (2026-10-11; this draft keeps the longer notes) · Date: 2026-10-11 · Author: Claude (Anthropic), workstream G3

## How this was made

- **Words only.** G3 drew no art. Every medal, avatar, heart, flame, step, chest, tag and glyph on these screens is G2's (`ladder-art.ts`, `sprite.ts`; see [provenance-G2.md](provenance-G2.md)). G3 wrote, by hand, in TypeScript and CSS:
  - the DOM and CSS of the post-win panel's bracket state, the bracket list, the ranking sheet (list, info, records), the end-of-ranking card, the name sheet, the Home ranking chip and streak strip, the victory's streak row and daily-reward line, the Buy rows of the out-of-helpers card (O2), the Settings ranking rows and the How to play notes;
  - the motions listed below;
  - the copy (English in `src/i18n/en/ui-2e.ts`, then 16 AI-drafted locales) and the ranking-name word lists (`src/shared/nick-words.ts`).
- **Sources.** The written descriptions in [spec](spec.md) §0 (honesty), §1.8 (names), §2.3–§2.9, §4.1, §4.6, §5.3, §6.1, §7.6–§7.7, §9.4, Appendix A (the English copy, ours) and [CONTRACTS](CONTRACTS.md) §2.3 and §8, the Classic theme of Phase 2d ([look-spec](../phase2d/look-spec.md): tokens, type, warm shadows, round white discs, mauve-brown ink) and our own earlier screens (the 2b ranking panel, the 2c victory, the 2d Settings and O2).
- **What was not used.**
  - No image or recording of the original game, of another game or of any app was opened, traced or described. The user has sent no recording of these features (ask-user M1–M11 are open), so there was nothing to measure.
  - No source on the [06 §4](../phase1/06-legal-and-originality.md) list was opened (D-2e-0).
  - No image, audio or text generator other than the coding agent itself was used.
- **Honesty (spec §0) in the UI.** The list draws exactly the rows the server sends, in its order, with its ranks; the count is the server's `members`, never the rows drawn; one player sees "You're the only player in this ranking so far." with no promise that others will join; reward lines, "top N" and the minimum come from the server's rules (`paidPlaces`, `minMembers`, `durationMs`), never a literal; queued wins show on my row as "+2 waiting" without promising they will count; the countdown is plain text (never a live region, never red, no "hurry"); a heart is a cheer, never a life; every purchase button starts with "Buy" and shows the store's price as given.

## How it was checked

- **Unit tests** (jsdom): `tests/unit/ui/ladder-2e.spec.ts` (40, with an Arabic / RTL case for the list since the resume), `tests/unit/ui/hud-2e.spec.ts` (28), `tests/unit/i18n/catalogs-2e.spec.ts` (56), plus the updated `tests/unit/shell/victory-ranking.spec.ts`, `tests/unit/shell/screens-2b.spec.ts` (the counter's 'ladder' kind) and `tests/unit/i18n/catalogs.spec.ts`.
- **A private fixture harness.** The bracket, the sheet, the result card and the name sheet need the local ranking server (lead L0b), so G3 rendered every surface from fixtures in a scratch harness (`g3.ts` + `vite.g3.config.ts`, kept in the session scratchpad `2e-G3/harness/`, not committed). It imports the real modules and stylesheets, builds with Vite into a scratch folder and is served by `vite preview` on port 4981. A Playwright script captured each view and flagged any element off the screen sideways or any clipped text. The fixtures are invented names from our own word lists ("Velvet Pounce 27", "Sleepy Whisker 27" …), invented counts (37 players, 3 paid places) and placeholder prices ($1.99, $3.99): fixture data for layout, not statistics.
- **The real app.** A private e2e build on port 4982 ran `tests/e2e/visual.spec.ts` (the new "Phase 2e (G3)" block: the records chip, the streak strip and the victory's streak row at 320, 390 and 1280) and `tests/e2e/i18n.spec.ts` (de, ru, ar, th, ja and the +40 % pseudo-locale at 320 and 390: no sideways overflow, no clipped text, with the chip, the strip and the streak row).
- **The real app with the ranking (resume, 2026-10-11).** Private e2e builds of the whole tree with a ranking origin (`VITE_LADDER_URL`, the web twin with `VITE_LADDER_WEB=anon`; ports 4982 web, 4981 FB) ran `tests/e2e/visual.spec.ts` "Phase 2e (G3): the ranking views in the real app". The ranking API is answered inside the page (`page.route`) with fixed answers in the server's wire shape (`src/shared/rank-api.ts`, checked by the client's own parsers): a bracket of 37 with my row 5th, a bracket with me alone, a paid result card, my profile. The O2 Buy rows run on the FB build with the FBInstant stub (its catalogue's $1.99 / $3.99). Every view is checked for sideways overflow, button text that spills or is cut, and (new) a dialog title running under its head's buttons; in de and ar at 320 × 568 the copy is checked to be the language's and `<html dir>` rtl in Arabic. Fixture data only: our own word-list names, made-up counts for layout, nothing in a bundle.
- **Screenshots** in `docs/phase2e/screenshots/`, quantised to 256 colours (no dithering) to keep the folder small:
  - `G3-<view>-402.png`, `-390`, `-320`, `-1280`, `-de-320`, `-ar-320` for the 14 main views (panel-bracket, panel-alone, sheet-list, sheet-info, sheet-records, result-paid, nick, o2-buy, home, home-locked, settings, settings-delete, victory-streak, victory-daily);
  - `G3-<state>-390.png` for 22 more states (panel-small, panel-stale, panel-records, panel-loading, sheet-hearts, sheet-final, sheet-info-only, result-paid-no-video, result-too-few, result-none, result-busy, nick-cooldown, nick-offline, home-join, home-day7, home-done, o2-buy-owned, o2-buy-busy, o2-kitty, settings-offline, victory-day7, howto);
  - `G3-2e-home-<width>.png` and `G3-2e-victory-<width>.png` from the real app (e2e build, the records path `?flags=-ladder`);
  - `G3-app-<view>-<variant>.png` from the real app with the ranking (resume): `panel`, `panel-scrolled` (my pinned copy), `panel-alone`, `home` (the chip "#5 · 28"), `sheet`, `info`, `nick`, `settings`, `settings-delete`, `result`, `o2-buy`, each at 402 (× 874), 390, 320, 1280 and in de and ar at 320 (`panel-alone` without 402). The `sheet`, `info` and `nick` captures show "Last updated …" and the offline line on a fresh answer: G1's R16 (requests-G3), not the intended state; the harness captures `G3-sheet-list-*.png` show it.
  - The harness set (`G3-<view>-…`) was re-captured on the resume with the fixes below (the German titles, the aria-busy values).
  - Phones at device scale 2, 1280 × 800 at 1.

## Layout decisions taken from the captures

| Decision | Why |
|---|---|
| A ranking row is two lines on a small grid: place and picture at the start, the heart at the end, the name on line 1 across the middle, line 2 my tags ("You", "+2 waiting", the pencil) then the fish | At 320 px a one-line row left a name 62 px ("Velvet…"). Names now keep about 140 px and wrap to a second line rather than being cut; rows stay ≥ 48 px. |
| My row's pencil is a 26 px disc on the tag line with a 44 × 44 tap area (`::after`) | Next to the name it cut the name to "Velvet Po…" at 390 px. |
| The card hugs a single row (`ol[data-single]`) | One player left an empty white area under the row. |
| The panel's (i) shows only when the bracket list's factory (the lazy `ladder` chunk) is there | Its glyph lives in the chunk's art; without it the button was a blank disc. Its soft fill is white at 25 % on the dark stage. |
| The ranking sheet fits its content (`data-fit`) when no list is reachable (records mode, an info view opened on its own) | A full-height sheet left half a screen of white. |
| The name sheet opens on the chosen picture (the radio group), not on Save; the cooldown line shows up front | Save starts gated (nothing changed); a player learns about the cooldown before picking words. |
| While one purchase is in flight, every Buy row is gated, whatever state the app passed | One purchase at a time even if a caller forgets to pass `disabled`. |
| The panel's subtitle is no longer `.num` | `.num` forces LTR; in Arabic "+2 fish · Your total: 14" came out scrambled (this also affected the 2c weekly subtitle). |
| In RTL a ranking name is right-aligned (`[dir=rtl] .rank-row__name, .nickname__name`) | `dir=auto` runs a Latin name LTR; `text-align: start` then followed the name, and Chromium ignores `match-parent`. |
| 320–359 px: the ladder sheet and the panel go nearly edge to edge (8–12 px) | The name column on the smallest phone. |
| The Settings ranking group draws its rows' dividers (`.settings__group-title + .settings-row` loses the top line only) | `:first-of-type` also matched the switch row (a `div`), which lost its line. |
| The victory's sticky actions get 6 px below the primary | The footer's stage-colour `::after` cut the primary's ring when no Home link follows (the daily variant). |
| Resume: on short screens (≤ 600 px high) with Buy rows, O2 drops the helper's art and tightens its padding and gaps | In the FB build at 320 × 568 the play band leaves the card ≈ 417 px; with the art the card needed 500 px (en, ar) and 526 px (de), so "Not now" and the No Ads line sat below the fold. Now 387 / 412 px: every button on screen, no scroll. The title still names the helper. |
| Resume: a dialog head's title breaks inside a long word (`overflow-wrap: anywhere`, `hyphens: auto`); the name sheet's and the delete confirmation's titles step down to `--fs-xl` below 360 px | "Dein Ranglistenname" and "Ranglistendaten löschen" ran under the round Close button at 320 px (seen in the real-app captures; the e2e fit check now looks for it). |
| Resume: the countdown O2 (no Watch video) puts the first focus on the first Buy row, else OK | Spec §4.6: Watch video when present, else the first Buy, else Not now. |
| Resume: `aria-busy` is set to "true" (Buy rows loading or busy, the result card's buttons, Save while saving), never left empty | An empty value reads as false to assistive technology. |
| Resume: Settings hides the "Ranking name" row and the player code while the name is empty | After "Delete my ranking data" there is no player on the server; "Show me in rankings" and Delete stay, so the player can join again (requests-G1 R2). |

## Motions (CSS keyframes and WAAPI, hand-written)

| Motion | Where | What it does | Reduced motion |
|---|---|---|---|
| Heart pop | `bracket-list.ts` (G2's `HEART_POP`, `HEART_POP_MS`) | When my heart turns filled (the server's `likedByMe` after a tap), the heart art pops once. | none |
| Today's step | `overlay-chunk.css` `@keyframes streak-fill` (520 ms, `--ease-drop`, 360 ms delay) | On the victory, today's paw step fades and grows in after the screen opens. | none (`data-reduced`) |
| My row in view | `bracket-list.ts` `centerMe()` | The list scrolls once (no animation) so my row sits in the middle; when my row scrolls out of the card, a pinned copy (aria-hidden, inert) shows under it. | the same (no motion) |
| Countdown | `bracket-list.ts` | "Ends in 7 h 47 min" updates on the minute; text only, never announced. | the same |

## Copy

- **English** (`src/i18n/en/ui-2e.ts`): spec Appendix A as written (our words), with `victory.streak` shipped as `victory.streakDay` (the 2c.1 retired key stays retired) and these additions, also ours: `common.cancel`, `nick.edit.a11y`, `ladder.chip.rank` ("#5", not translated), `ladder.total`, `ladder.pill.*`, `ladder.records.title`, `streak.best`, `streak.days.*`, and `nick.cooldown` as one phrase with `{time}`; `ladder.info.window.rolling` takes `{hours}` from the server's `durationMs`.
- **Ranking-name words** (`src/shared/nick-words.ts`, `NICK_WORDS_V1`): 64 first words and 64 second words, plain English, 3–10 letters, capitalised, unique. The first 28 and 24 are the CONTRACTS §2.3 starters in order; the rest are ours (cosy, cat-themed and neutral words). Screened by `catalogs-2e.spec.ts` against a list of rude fragments for every pair; the server's blocklist test is the gate (request R11 to G4). `RETIRED_V1` is empty; the lists are append-only.
- **16 locales**: AI drafts by Claude from our English, `meta.ts` and the glossary only (its new §6 "Phase 2e"), unreviewed, logged in [review-log](../i18n/review-log.md); `docs/i18n/drafted-from.json` rewritten. Width limits from spec §7.6 are in `meta.ts` (the chip's "Join" 12, the Buy labels 28, the strip's lines 36); `npm run i18n:check` passes with six width warnings (the No Ads Buy label in es, pt-BR, ru, tr and vi, 29–31 with the long sample price; it wraps at 320 px).

## Bytes (G3's share, esbuild-minified, gzip level 9, against `3389380`)

| Where | G3 files | Raw | Gzip (summed per file, an upper bound) |
|---|---|---|---|
| First load JS | `en/ui-2e.ts` 6.5, `streak-strip.ts` 2.0, `ladder-chip.ts` 1.5, `home-screen.ts` +0.4, `period-text.ts` +0.2, `pills.ts` +0.03 | +10.7 KB | +3.8 KB |
| First load CSS | `screens.css` (chip, strip) | +2.1 KB | +0.4 KB |
| Overlay chunk JS | `ranking-panel.ts` +2.1, `rewarded-prompt.ts` +2.5, `settings-modal.ts` +2.5, `victory-screen.ts` +1.0, `how-to-play.ts` +0.3 | +8.4 KB | +2.7 KB |
| Overlay chunk CSS | `overlay-chunk.css` | +2.6 KB | +0.5 KB |
| Ladder chunk JS (new) | `bracket-list.ts` 6.9, `ladder-sheet.ts` 4.5, `ladder-result.ts` 2.5, `nickname-sheet.ts` 5.2, `nick-words.ts` 1.2 | 20.3 KB | 8.6 KB |
| Ladder chunk CSS (new) | `ladder-chunk.css` | 10.4 KB | 2.4 KB |
| Locale chunks | the Phase 2e block in each catalogue | +7 KB (de) … +12 KB (ar) each | — |

**Resume re-measure (2026-10-11, web production build of the current tree against `3389380`, esbuild-minified per file):** first load JS +10.7 KB (`en/ui-2e.ts` 6.5, `streak-strip.ts` 2.0, `ladder-chip.ts` 1.5, `home-screen.ts` 0.4, `period-text.ts` 0.2) and CSS +2.1 KB (`screens.css`): **G3 first load +12.8 KB raw, ≤ +4.3 KB gzip**; overlay chunk +11.6 KB (`overlay-chunk.css` +3.1 with the resume's O2 and title rules); ladder chunk 20.4 KB JS + 10.5 KB CSS. Whole tree: first load 373.9 → 424.7 KB, gzip 139.0 → 154.6 KB (by owner, rendered bytes before minification: G1 +43.9 KB, `src/shared/rank-api.ts` +15.2 KB through G1's main-bundle imports, G3 +13.5 KB, G2 +2.2 KB; requests-G3 R18, R19).

Whole-tree web build at the time of measuring (all four workstreams, `size-check` on a scratch build): first-load total 373.9 → 426.0 KB, first-load gzip 139.0 → 154.9 KB; G3's share is about +12.8 KB raw / +4.2 KB gzip of it. The ladder chunk measured 29.6 KB JS (G3 20.3, the rest G2's art and G1's barrel) and 10.7 KB CSS against the L0 placeholder rows (26 / 4 KB); the locale chunks reach 40.7 KB (ar) against 29.3. Request R13 asks the lead to set those rows.
