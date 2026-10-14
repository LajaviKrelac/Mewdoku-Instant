# UI batch (2026-10-13): messages — the level-start tickers

Workstream notes for the lead (plan: "messages (tickers)"). The user asked: "Flying messages in game: some are not fully
visible, they have '…' at the end (just make them longer so everything fits). Enrich these messages so the user feels
special or understands the difficulty of the level", plus level-start lines that set expectations or encourage, in the
manner of three example sentences from another game. Those sentences were used for their intent only: no wording and
no number of theirs is in our copy.

## What changed and why

1. **No more "…"** (`src/ui/fx/celebrate.css`). A pill is as wide as its whole line (`width: max-content`; the text
   `flex: none`); the `max-width: colW − 24 s` cap and the ellipsis are gone. The column (`.tickers`) still clips a pill
   while it crosses, as before (audit B14), so every character passes by. Measured in Chromium at 390 × 844 and
   320 × 568: every line's `scrollWidth` equals its `clientWidth` (the old cap cut ru/ja `ticker.tip.drag` and any line
   over about 45 Latin characters).
2. **Reduced motion** (`.tickers[data-reduced]`, set by `src/ui/fx/tickers.ts`). Nothing moves, so a line wider than
   the column would have been clipped where it stands: the two lines now stack from line 1's slot (11.5 s apart), each
   pill at most colW − 24 s, and a long line wraps (`text-wrap: balance`); the paw stays centred on the start of a taller
   pill and the body closes its own start edge. One-line pills keep the 29.3 s height.
3. **Speed ceiling** (`fx.tickers.maxPxPerSec` 110 s-px/s): a pair whose longer line would cross faster takes longer
   than `crossMs` (both lines, same spacing). English lines (≤ 60 characters) never reach it at a phone width; long
   translations (de, ru) slow down a little instead of racing.
4. **Richer lines** (`src/app/tickers.ts`, pure; `src/i18n/en/ui-tickers.ts`, 18 keys):
   - **Expectations** (`ticker.odds.*`, spec §0.4 H-2a): "About {pct}% of players crack this board on their first go",
     "On average, players take about {count} tries here. No rush!", and after a Retry "About {pct}% of players solve it
     on the next try. Your turn!". The numbers come from `src/game/level-odds.ts`, a pure model of the board's own
     difficulty (grade, effort, size, Hard): percentages rounded to 5 within 5…95, tries rounded to a half, worded
     "about", the same board always the same numbers.
   - **Encouragement on a Retry** from the lost attempt (session memory, never saved): "Just {count} cats short last
     time. So close!", "Last try: {placed} of {n} cats placed. Let's top that!", "Try {count}: you know this board
     better every time".
   - **Feeling special**, the player's own records: their first Hard level, Hard levels beaten, levels solved without a
     single mistake, a live streak, dailies solved, and every 50th level a milestone line.
   - Every 2d.1 line stays (cats hiding, best time, solved, points, period fish, daily, unique, tips).
5. **Limits** 40/32 → 60 for `ticker.*` and `toast.start.*` (meta, glossary, `sanity.spec`, `tickers-fx.spec`).

## Selection (pickTickerLines)

- **Line 1, a Retry:** the lost attempt was `retryCloseCats` (2) or fewer cats short → "so close"; otherwise by the
  seed among the odds after a retry, its cats placed (if any), the try number (from the third try) and the 2d cheer.
- **Line 1, a Hard level:** the player's first Hard level always says so (`ticker.hard.first`); later ones pick by the
  seed among the Hard levels beaten, the 2d cheer, the first-try odds and (when ≥ `oddsMinTries`) the tries estimate.
- **Line 1, the best time here** (level won before): unchanged.
- **Line 1, a tough board** (estimated first try ≤ `oddsMaxFirstTryPct` 55; any mode): the first-try or tries
  estimate. About 17 % of the normal levels and 11 % of the dailies (`tests/unit/game/level-odds.spec.ts` pins it).
- **Line 1 otherwise:** the 2d.1 cats line or cheer, half each.
- **Line 2:** the 2d.1 pool plus `ticker.flawless` (≥ 2), `ticker.streak` (alive, ≥ 2 days), `ticker.dailies` (≥ 1),
  `ticker.hard.beaten` (≥ 1, not on a Hard board, where line 1 speaks of it); on a fresh board of a level that is a
  multiple of `milestoneEvery` (50) the milestone takes line 2 (not on a Retry, a daily or an event).

## Decisions beyond the plan

1. **The model's weights** (`ODDS_MODEL`, documented and pinned by a test): base 0.94; effort above 30 takes up to
   0.52 over 110 effort; 0.04 per grade above G3 and 0.06 more for G5; Hard 0.10; 0.012 per size above 8 × 8; floor
   0.20, ceiling 0.96; a retry keeps 30 % of the gap (q = p + 0.3 (1 − p)); average tries 1 + (1 − p)/q. Calibrated so
   the numbers read plausibly over our packs: normal levels 35–95 % (median 70 %), most Hard levels 45–65 %, the six
   G5 boards 25–45 %; the tries line (≥ 2) shows on the hardest boards only (2 or 2.5). The Hard weight (0.10) is
   larger than effort alone would give, because our Hard levels differ from normal ones mostly by their label and grade
   band (effort median 80 vs 68); without it a "Hard" level would read as easy as a normal one. It is an estimate by
   decision (H-2a); recalibrate when the server ever counts tries.
2. **The table lives in `src/game/level-odds.ts`, the thresholds in config** (`fx.tickers.oddsMaxFirstTryPct`,
   `oddsMinTries`, `retryCloseCats`, `milestoneEvery`, `maxPxPerSec`), like `RAMP` in `ramp.ts` vs `levels.*`.
3. **`fx.tickers.reducedHoldMs` 3000 → 4500:** with reduced motion both lines (now up to 60 characters each) show at
   once and still; 3 s was short to read both.
4. **Hard levels beaten** come from `progress.level` (levels are played in order: every Hard level below the next one
   was won), not from `progress.best` (a merged or older save may lack records). Closed form, cross-checked against
   `isHardLevel` in the spec.
5. **The lost attempt stays in session memory** (`session.ts`: `lastTry` set at RETRY from the lost `GameState`, reset
   at mount). No save field, no tries counter on disk: a Retry after a reload or Home starts fresh, as `attempt` does.
6. **Strings in a new first-load part** `src/i18n/en/ui-tickers.ts` (`enUiTickers`, wired into `en-first.ts`, `en.ts`
   and `EN_PARTS`): `app/tickers.ts` names them (first load) and `sanity.spec` pins the exact `enUi2d1` key list.
7. **No screen-reader announcement** for the new lines: the tickers stay decorative and `aria-hidden` (helpers-spec
   §5.5); nothing in them is needed to play.
8. **No level tier from the levelbutton workstream** is read (it lands in parallel): the model already sees grade 5 and
   effort, which is what "Extra hard" is built from. If the lead wants Extra-hard boards to say so, `line1` can use
   `levelTier()` once merged.
9. **CSS size:** the reduced rule uses the physical `border` / `border-radius` shorthands (the same on every side, so no
   RTL variant): the build's Lightning CSS expands logical corner radii into long `:lang()` selector lists (+1.3 KB).
10. **Dev harness** (`dev/board-harness.ts`): `?tickers=odds|retry|records|long` (and `&lang=`, `&rm=1`) shows the new
    lines; `?tickers=1` is unchanged.
11. **The glossary's "Real players only" row** (`docs/i18n/glossary.md:143`) is shared with the victory workstream
    (`victory.stat.*`): left for the lead (suggested text below). The ticker and toast rows (26, 28) are updated.

## Sizes (FBIG build, `npx vite build --mode fbig`, then `scripts/size-check.ts`; before = the map's 2026-10-13 build)

| Row | Before | After (this branch alone) | Ceiling |
|---|---|---|---|
| Main JS (index + core + coach-chunk + rich-text) | 353,731 | 357,476 (+3.7 KB: the 18 English strings 1.4 KB, `app/tickers.ts` +1.7 KB, `level-odds.ts` 0.7 KB) | 360,000 |
| Lazy JS, fx chunk (`celebrate-*.js`) | 14,865 | 15,519 | 15,300 **over** |
| Lazy CSS, fx chunk (`celebrate-*.css`) | 3,161 | 3,876 | 3,260 **over** |
| Locale chunk (largest: ar 44,349; hi 44,274) | 41,839 (hi) | 44,349 (ar) | 41,900 **over** |
| First load + 1 locale | 465,755 | 472.0 KB | 470,000 **over** |
| First-load total | 423,916 | 427.7 KB | 427,000 **over** |
| CSS first load | 52,409 | 52.4 KB (unchanged) | 51,700 over before |

## Provenance rows (for `docs/provenance.md` §13.4-style, copy and code; no new art)

- `src/i18n/en/ui-tickers.ts` (UI batch, messages) is ours: 18 level-start lines written from the intent of the user's
  request (expectations, encouragement after a Retry, the player's own records). The three example sentences the user
  quoted belong to another game: neither their wording nor their numbers are used. The only approximate statistics are
  the `ticker.odds.*` lines (spec §0.4 H-2a, `ESTIMATE_KEY_PREFIXES`), estimated by our own model.
- `src/game/level-odds.ts` (UI batch, messages): our own estimate model, written from our grader's grade and effort and
  calibrated on our packs only; no data or number from another game.
- The 16 locales' `ticker.odds.*`, `ticker.retry.*`, `ticker.hard.*`, `ticker.flawless.*`, `ticker.streak.*`,
  `ticker.dailies.*` and `ticker.milestone` drafts are AI drafts by the same agent from our English, `meta.ts` and the
  glossary only, unreviewed (inserted after `'ticker.tip.drag'` in each catalogue).

## For the lead (not done here by the plan's rules)

- `npx tsx scripts/i18n-check.ts --write-drafted-from` and a "Drafts awaiting review" section in
  `docs/i18n/review-log.md` for the 18 keys (all 16 locales).
- Budget rows above (`scripts/size-check.ts`, `tests/unit/platform/scripts.spec.ts`, 04 §9).

## Stale doc lines (suggested text)

- `docs/phase2d/helpers-spec.md:77` (`fx.tickers` row): `{ enabled: true, delayMs: 150, crossMs: 9000, lead: 0.086,
  reducedHoldMs: 4500, maxPxPerSec: 110, oddsMaxFirstTryPct: 55, oddsMinTries: 2, retryCloseCats: 2, milestoneEvery:
  50 }` (UI batch, messages).
- `docs/phase2d/helpers-spec.md:421` (Text row): "… weight 600, one line, no wrap (reduced motion: wraps, balanced,
  UI batch) …".
- `docs/phase2d/helpers-spec.md:423` (Width row): "content (paw + text + icon), never cut: the column clips a pill only
  while it crosses (UI batch, messages; the `colW − 24` cap and the ellipsis are gone). Reduced motion: at most
  `colW − 24`, the text wraps."
- `docs/phase2d/helpers-spec.md:429` (Motion): append "UI batch: T = max(crossMs, (vw + the longer width) /
  (maxPxPerSec × s)) for both lines, so a long translation never races."
- `docs/phase2d/helpers-spec.md:433` (Reduced motion): "no movement: both fade in (150 ms) stacked from line 1's slot
  (11.5 s apart) at the inline start of the column (x = 12 s), a long line wrapping; hold `reducedHoldMs` (4 500), fade
  out."
- `docs/phase2d/helpers-spec.md:437` (honesty): append "UI batch (spec §0.4 H-2a): the one exception is
  `ticker.odds.*`, an approximate expectation from the board's own difficulty (`game/level-odds.ts`), rounded and
  worded 'about'."
- `docs/phase2d/helpers-spec.md:439-452` (the line table) and `:454` (Selection): add the UI batch lines and the
  selection order of "Selection (pickTickerLines)" above.
- `docs/phase2d/helpers-spec.md:569`: "`ticker.*` ≤ 40 characters" → "≤ 60 (UI batch)".
- `docs/phase2d/helpers-spec.md:606` (`tickers.spec`): add "the UI batch lines: odds equal `levelOdds`, every other
  number from the input".
- `docs/phase2d/look-spec.md:417` (Copy row of the level-start toast): add "(UI batch: up to 60 characters; the
  approximate statistics live only in `ticker.odds.*`, H-2a)".
- `docs/phase2e/spec.md:41` (H-2, "also not in tickers"): add "(except H-2a's `ticker.odds.*`)".
- `docs/i18n/glossary.md:143` ("Real players only"): append "The only approximate statistics are the encouragement lines
  under `ticker.odds.*` and `victory.stat.*`, always worded 'about' (H-2a)."

## Tests

- New: `tests/unit/game/level-odds.spec.ts` (rounding, bounds, monotone, determinism, the weights, calibration over the
  shipped levels and dailies).
- Rewritten / extended: `tests/unit/app/tickers.spec.ts` (every new line and threshold, honesty: odds equal the model,
  every other number the input's), `tests/unit/shell/tickers-fx.spec.ts` (texts, ≤ 60, the speed ceiling, the reduced
  flag), `tests/unit/app/session-2d1.spec.ts` (the session passes grade, effort, attempt and the lost attempt),
  `tests/unit/app/session-2d.spec.ts` (first Hard level, the Retry line family), `tests/unit/ui/hud-css.spec.ts` (the
  pill's width, no ellipsis, the reduced layout), `tests/unit/sanity.spec.ts` (limits 60).
- e2e (not run here): `tests/e2e/smoke.spec.ts` #23 accepts the odds lines on a fresh board and the Retry line family,
  and checks no ticker text is cut; `tests/e2e/i18n.spec.ts` `noClipping` includes `.ticker__text`.
