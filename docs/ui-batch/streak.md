# UI batch (2026-10-13): streak — the Daily Streak screen and the Home streak pill

Workstream **streak** of the UI batch (lead plan, "streak" decisions 1–6). Base `3067892`. This file records what changed,
every decision taken beyond the plan, the provenance rows, the docs that are now stale, the measured sizes and the merge
notes for the lead.

## 1. What the player sees now

- **Home's streak pill** (top centre): our flame stays **faded and grey until today counts** (`data-today`), then lights
  up; the number is the run; the pill is **44 px tall** (was 40, spec §7.7); a **tap opens the Daily Streak screen**
  (it was a toast of the sentence). Its accessible name is still the whole sentence ("Streak: day 3 of 7. Solve a
  puzzle today for day 4."), plus `aria-haspopup="dialog"`.
- **The Daily Streak screen** (new overlay `streak`, lazy overlay chunk), full screen on the page colour. Top to bottom,
  in the order of the user's reference screenshots (order and positions only; art and words are ours): the title
  "Daily streak"; our flame on a soft gold glow (faded and grey while today is not counted); the run as a big number
  with "days in a row" under it; a white pill "Best: 9 days"; the **week row** (seven dates, each with its real short
  weekday in the current language, orange discs with a white check for solved days, grey discs for the rest, today
  ringed, the reward day a chest that stands open once paid); the status sentence (the existing streak copy, or "Streak
  reward: +2 hints and +2 kitties" on a reward win); then **Continue** (after a win) — or a **back disc** at the top start
  (from Home, also after today counted). Esc = back / Continue.
- **After the day's first counted win** the screen shows between the victory and what its primary does: the victory's
  primary press opens it; its Continue runs the primary's own action (the `next_level` / `daily_done` / `event_next`
  interstitial gate, then the next board or Home). Never for the tutorial, a second win the same day or a restored board
  (`WinSummary.streak` is null then), and only with `dayStreak.screenAfterWin` and the `dayStreak` flag. The victory's
  own streak row is off (`dayStreak.victoryRow: false`; its code stays).
- The day's first win lights the flame and pops today's check once; reduced motion: neither (the overlay fade only).

## 2. Files

New: `src/ui/overlays/streak-screen.ts` (view), `src/app/streak-screen-flow.ts` (data + when it opens),
`tests/unit/ui/streak-screen.spec.ts`, `tests/unit/app/streak-screen-flow.spec.ts`, `tests/e2e/helpers/streak-screen.ts`,
`dev/streak-harness.{html,ts}` (dev only, not shipped), this file.

Changed (all local): `src/game/day-streak.ts` (+`streakWeek`, `dateKeyOfDay`), `src/i18n/format.ts`
(+`formatWeekdayFor`), `src/i18n/index.ts` (+`formatWeekday`), `src/i18n/en/lazy.ts` + `meta.ts` + 16 locales (7 keys
after `streak.a11y`), `src/app/config.ts` (`dayStreak.screenAfterWin` new, `victoryRow` → false), `src/app/views.ts`
(`streakStripOf` extracted from `selectStreakStrip`), `src/app/store.ts` (`OverlayId` `'streak'`), `src/app/router.ts`
(props map, loader, the PAR-6 stand-in), `src/app/overlay-chunk.ts` (export), `src/app/session.ts` (one wrapping call +
`'streak'` in the overlay-failure list), `src/app/shell.ts` (`onStreak`), `src/ui/hud/streak-strip.ts` (`onPress()`,
`aria-haspopup`), `src/ui/screens/home-screen.ts` (`onStreak?()` signature, one header line), `src/styles/screens.css`
(pill 40 → 44 px), `src/styles/overlay-chunk.css` (faded flame + the screen's block, after the pill rules).

Tests changed: `day-streak.spec`, `format.spec`, `hud-2e.spec` (pill tap), `router.spec` (chunk keys, the streak stand-in),
`session-leave.spec`, `win-flow.spec` (victory `streak` prop now null), `css-rules.spec` (`PRIMARY` +
`streak-screen__continue`); e2e: `continueStreak(test)` registered next to every `gotItNewRanking(test)` (10 specs),
`smoke` 4e/4f rewritten, `visual` (Home pill + screen captures), `layout` (pill hit area, audit B1 incl. the screen),
`i18n` (the screen per locale), `preview` (day 7 on the screen), `winflow` (PAR-6).

## 3. Decisions beyond the plan

1. **Title "Daily streak"**: the user's own name for the feature, a generic two-word label; the reference's other words
   ("Current Streak", "Best Streak: N") are not used: ours are "days in a row" and "Best: {best}".
2. **Keys** live in one block right after `streak.a11y` (en and all 16 locales): `streak.screen.title`,
   `streak.screen.run.one/.other` (label only, no number: plural forms per locale), `streak.screen.best` (`{best}` =
   `streak.days`, new placeholder note; `{days}` already means the cycle length), `streak.screen.continue` (kept in the
   streak block rather than a `common.continue`, so all my keys sit at my anchor), `streak.week.a11y` (`{done}`, new
   placeholder note) and `streak.week.gift.a11y` (a11y names never inherit the group's width limit).
3. **The week row** (plan decision 2, made exact): with a live run, the cycle that holds the last counted day; when that
   day closed a cycle (day 7) and today is not counted yet, the next cycle starts today (the pill's sentence then says
   "day 1"); without a live run day 1 is today. *Played* = days of the live run only, so an older broken run's dates in
   the same week never show (map R9). The gift is drawn on every cycle day `rewardForDay` pays (today only day 7; also any
   `dayRewards` row), open when `paid` holds that date. It reads SUN … SAT only when the cycle started on a Sunday.
   After a win (mode `win`) "today" is the date the win counted (the record's last date), not the clock's: a victory
   primary pressed after the day boundary still shows the day just lit (review F15). From Home it is the clock's day.
4. **Status line**: on a reward win the reward line ("Streak reward: +2 hints and +2 kitties", `victory.streakReward`,
   reused) replaces the sentence (the two said the same thing).
5. **Continue is gated** for `fx.winButtonDelayMs` (600 ms), like the victory's primary, so a double tap on the victory
   cannot skip the screen; Esc is ignored while gated.
6. **Only the victory's primary** goes through the screen (plan wording); its Home did not (the victory workstream removes
   it). Shown at most once per win, keyed by the `WinSummary` object (a `router.update('victory', …)` with props wrapped
   again does not show it twice).
7. **No close before the action.** Continue runs the primary's action with the screen still up; the screen change that
   follows closes every overlay. The router's PAR-6 stand-in (`shownVictory`) now takes the top-most of `streak` and
   `victory`, so the streak screen is the layer that fades out and neither the victory nor the solved board shows in
   between. `data-anim` is cleared on close so the light-up does not replay on that leaving layer.
8. **Light screen** (`--page`) with a white week card, not the victory's dark stage: it follows Home's look and the
   reference's light screen. Colours: number `--accent-title` (large text), label and today's weekday `--accent-text`,
   played disc `--accent` with an `--accent-deep` edge and a white CSS check, empty disc `--life-empty` with an
   `--ink-3` rim, today's ring `--accent-deep` (4.6:1 on white), the gift-today disc `--gold-soft`. No new token.
9. **Long weekday names** (ar, pl "niedz.", the pseudo-locale) set `data-long` on the row: 11 px labels so neighbours do
   not touch at 320 px.
10. **Selector placement**: `selectStreakScreen` lives in `app/streak-screen-flow.ts` (not `views.ts`) to keep the shared
    `views.ts` edit to one extraction (`streakStripOf`, also used by `selectStreakStrip`).
11. **No analytics event** (`streak_open` was optional in the map): none added.
12. **e2e helper** (`tests/e2e/helpers/streak-screen.ts`): a Playwright locator handler never runs inside
    `page.waitForFunction`, and most victory exits are followed by such a wait. So `continueStreakOn(page)` adds a small
    page script (MutationObserver on `hidden` / `aria-disabled`) that presses Continue once it is live, plus a no-op
    locator handler that makes actions and assertions wait for the screen to close. Specs that check the screen call
    `keepStreakScreen(page)` first. Extra pages made with `gotItOn(await ctx.newPage())` in `visual*.spec.ts` also get it;
    `fbig.spec.ts`'s extra pages never win, so they do not.
13. **PAR-6 e2e**: the two victory sampler tests now start with today already counted (a later win of the day), so the
    victory stays their leaving layer; a new test covers the day's first win (the streak screen fades out into "Level 3",
    the victory and the solved board never show again).
14. **smoke 4e/4f** no longer use `.victory__home`: primary → the screen → Continue → the game bar's Back → Home's pill.

## 4. Provenance rows (for `docs/provenance.md` §13; copy and layout, no new art)

| Asset | Files | Author, date | Method |
|---|---|---|---|
| Daily Streak screen layout (title, flame, run, best pill, week row, status, Continue / back disc) | `src/ui/overlays/streak-screen.ts`, `src/styles/overlay-chunk.css` | streak workstream (Claude), 2026-10-13 | Our layout; the order of the parts measured from the user's own screenshots (D-2d-0 a), nothing traced. Reuses our `icon-streak-flame` and `streak-step-chest` (G2, 2e); the discs, the check and the ring are CSS from tokens |
| Week row data (the run's current cycle, the gift where a reward pays) | `src/game/day-streak.ts` `streakWeek` | streak workstream (Claude), 2026-10-13 | Ours, from our reward rule (D-2e-12), not the reference's calendar week |
| Faded pill flame until today counts | `src/styles/overlay-chunk.css` | streak workstream (Claude), 2026-10-13 | Ours (opacity + grayscale of our flame), from the user's description of a washed-out icon |
| English copy: `streak.screen.*`, `streak.week.*` and the 16 drafts (**AI drafts, unreviewed**) | `src/i18n/en/lazy.ts`, `src/i18n/meta.ts`, `src/i18n/locales/*.ts` | streak workstream (Claude), 2026-10-13 | Our sentences; the drafts from our English, `meta.ts` and the glossary only (06 §2 step 6). "Daily streak" is the user's own feature name |

## 5. Facts for 01 (first-hand, suggested row, the lead adds it)

"**The Daily Streak screen (user's screenshots, first-hand, 2026-10-13).** Title at the top centre; a large colourful
streak icon; the current run as a big orange number with a label under it; a white pill with the best run; a row of the
seven weekdays SUN … SAT, played days as orange discs with a white check, the rest grey, a gift box on the last weekday;
a large orange Continue at the bottom after a match. Before the day's match (opened from Home): the same layout with the
icon washed out, a round back arrow at the top left and no Continue. Home's streak pill shows the same washed-out icon
until the day is played." — confirmed · user (first-hand, 2026-10-13). Our build differs on purpose: the row is our run's
cycle (the gift where our reward pays), see §3.3.

## 6. Docs now stale (file:line → suggested text; the lead edits them)

- `docs/phase2e/spec.md:995` (Home: the streak strip) → "Home: the streak **pill** at the top centre (Home layout
  2026-10-11): our flame, faded until today counts, and the run; a tap opens the Daily Streak screen (UI batch)."
- `docs/phase2e/spec.md:1004` (Victory streak row) → "Victory: no streak row (`dayStreak.victoryRow` false since the UI
  batch); the day's first counted win shows the **Daily Streak screen** after the victory's primary press
  (`dayStreak.screenAfterWin`): the run, the best, the run's current cycle with the reward day, the status, Continue."
- `docs/phase2e/spec.md:1008` ("The strip is one role="img" element…") → "The pill is a button named by the strip's
  sentence; the screen is a dialog described by the run, the best, the row (one image named 'Streak days: 3 of 7 solved.
  Day 7 earns a reward.') and the status."
- `docs/phase2e/spec.md:1019` (daily result) → "… the daily victory, then on the day's first counted win the Daily Streak
  screen, and Done (`daily_done` gate, then Home)" (the victory workstream changes Done itself).
- `docs/phase2e/spec.md:1231` (selectors) → `button.streak-pill[data-state][data-today=0|1]`;
  `.overlay[data-overlay=streak] > .streak-screen[data-mode=win|home][data-today]`, `.streak-week__day[data-played]
  [data-today][data-gift][data-paid]`, `.streak-screen__continue`, `.streak-screen__back`; `.victory__daily-reward`.
- `docs/phase2e/spec.md:1290-1292` (layout / smoke e2e) → add "the Daily Streak screen fits at 320 × 568 with the band;
  the pill's 44 px hit area; smoke: win → the screen (day 1) → Continue → the next level; the pill opens the screen".
- `docs/phase2e/spec.md:1423` (Q-M9) → "Home pill + the Daily Streak screen (after the day's first win and from the pill)".
- `docs/phase2e/CONTRACTS.md:46-48` (`cfg.dayStreak`) → `victoryRow: false, screenAfterWin: true`.
- `docs/phase2e/STATUS-2e.md:16` → "… a Home pill (faded until today counts) opening the Daily Streak screen, which also
  follows the day's first victory …".
- `docs/phase1/02-rebuild-spec.md:5` (2) → "a pill on Home and the Daily Streak screen after the day's first win".
- `docs/phase1/04-architecture.md` §9 budgets: see §7 (lead).

## 7. Sizes (FBIG build, bytes; base `3067892` vs this branch, measured 2026-10-14)

| Chunk | Base | Streak | Δ | Ceiling |
|---|---|---|---|---|
| Main JS row (`index` + preloads) | 353.7 KB | 355.6 KB | +1.9 KB (`index-*.js` 282,977 → 284,427) | 360.0 KB (ok) |
| First-load CSS (`index-*.css`) | 49,511 | 49,511 | 0 | row 51.7 KB (already over before) |
| Lazy JS overlay chunk | 55,416 | 58,708 | +3,292 | 56,200 (**over**) |
| Lazy CSS overlay chunk | 33,229 | 38,426 | +5,197 | 33,500 (**over**) |
| Lazy JS English (`en-lazy`) | 13,590 | 13,892 | +302 | 13,600 (**over**) |
| Locale chunk hi / ar | 41,839 / 40,170 | 42,324 / 40,794 | +485 / +624 | 41,900 (**hi over**) |
| First-load total | 423.9 KB | 425.8 KB | +1.9 KB | 427.0 KB (ok) |

The main-JS share is the screen's data and trigger (`streak-screen-flow.ts`, `streakWeek`, `formatWeekday`): both are
called from first-load code (the session's victory, Home's pill). They could move into the overlay chunk (the screen
computing its own data from the raw record) if main JS binds.

## 8. Merge notes for the lead

- `src/app/session.ts` `openVictory`: the victory workstream edits the callbacks inside the same `router.open('victory',
  …)` call that this branch wraps (`afterStreakScreen(host, w.summary, { … })` and the closing `}));`). Keep the wrap
  around whatever props the victory branch builds; if it adds a `router.update('victory', …)`, pass those props through
  `afterStreakScreen` too (same `w.summary`).
- `victory-screen.ts` `rewardText` is imported by the streak screen: keep it exported.
- e2e: the victory branch edits victory lines in `smoke`, `visual`, `layout` (B1), `i18n`, `preview`, `winflow`; this
  branch touched only streak lines there, but some are adjacent (e.g. `visual.spec` 274–275 next to the victory's period
  lines; `layout` B1 next to `.victory__kept`).
- `tests/unit/app/session-leave.spec.ts` and `win-flow.spec.ts` changed here for the screen (Continue step; the victory's
  `streak` prop is now null).
- Budget rows over (see §7): overlay JS and CSS, en-lazy, locale chunks.
