# Phase 2d requests from G1 (logic, app, platform)

Status: living list · Owner: G1 · Spec: [look-spec §3](look-spec.md#3-workstreams-disjoint-file-ownership) (ownership §3.1, order §3.2; the lead runs I-2) · Interfaces: [CONTRACTS.md](CONTRACTS.md).

## How to file a request

- Use this file when you need a change in a file you do not own (look-spec §3.1). Do not edit that file yourself. Running a script you do not own (`palette:check`, `i18n:check`, `size`) needs no request. Editing one does. A file the table does not list is the lead's: ask here first.
- Add one row per request: the next number (R1, R2, …), from → to (G2, G3 or lead), the file and the exact change (member, key, selector or line), and why (the spec or contract section). Keep it to one line where you can.
- Meanwhile, keep working against a placeholder in your own files (look-spec §3.2). Never delete or narrow a member another workstream may still use before I-3.
- The receiving workstream notes what it did in its own file, under "Done for other workstreams' requests". Then mark the row here **done by …**. The lead runs or answers anything still open at integration step I-2.

## Requests

| # | From → to | What | Why |
|---|---|---|---|
| R1 | G1 → G3 | Give the game bar's back and gear discs (`.top-bar--game .top-bar__btn`) their transparent 44 × 44 hit area at every s (a `::before` centred on the disc, inset `min(0, (d − 44) / 2)`). The `layout` e2e "every round button keeps a 44 × 44 hit area" checks `elementFromPoint` at the corners of a 44 × 44 square around each disc's centre; on the G1 private build (2026-10-10) the four corners of both top discs hit `.top-bar` / `.top-bar__mid` at 320, 390 and 1280. The helper discs already pass. | look-spec §1.1 Touch targets, §1.4 Hit area (critic C6) |
| R2 | G1 → G3 | The tutorial coach card at 320 × 568 covers the top bar by 10.8 px at step 2 (the `layout` e2e "the tutorial coach never covers the board or the top bar", web-320). It passes at 390 and 1280. | look-spec §1.11 Coach (critic C8) |
| R3 | G1 → G3 or lead | DOM names of the Score column: CONTRACTS §7 lists `.points-pill__label` as the label, but `game-bar.ts` labels it `.points-pill__name` and keeps `.points-pill__label` as the "+N" chip's host (the 2c.1 builder). Either rename, or let the lead change CONTRACTS §7 and look-spec §4.6 at I-5. The G1 e2e checks the label by its text ("Score"), so either way works. | CONTRACTS §7, look-spec §4.6 |
| R4 | G1 → lead | At I-3, when `GameScreen.playStartToast` becomes required: G1's fake game screen in `tests/unit/app/harness.ts` already implements it (it logs `startToast:<kind>`). The other fakes still need it: `tests/unit/app/boot.spec.ts`, `tests/unit/app/win-flow.spec.ts`, `tests/unit/shell/screens-2b.spec.ts`, `dev/b-harness.ts`. | look-spec §3.2 step 4 (I-3) |
| R5 | G1 → lead | At I-5, add G1's members beyond CONTRACTS §5 to CONTRACTS-2d. They are listed under "Notes from G1" below. | CONTRACTS §5, §9 |
| R6 | G1 → lead | At I-5: `docs/phase2b/fb-dashboard.md` has the new B7–B9 rows for the banner in play (G4) and a placement-table update. 05 §6 and the parity-spec banner lines are the lead's (Appendix B). | look-spec §1.16, Appendix B |

## Done for other workstreams' requests

(none filed to G1 so far)

## Notes from G1 for the others (no action needed)

- **New G1 exports and members beyond CONTRACTS** (all additive):
  - `src/game/mouse.ts`: `pickMouseCells(state, count, seed)` takes `Pick<GameState, 'puzzle' | 'cells'>`. It returns the picked cells in board order. Also: `mouseCandidates(state)`, `hasMouseCandidate(state)`, `mouseSeed(puzzleId, uses)` (= `` `${id}:mouse:${uses}` ``).
  - `GameMode.mouseAllowed` (= `kittyAllowed`). `tutorialAllowsTool(step, 'mouse')` is always false. `filterTutorialAction` ignores `MOUSE`.
  - `HelperFlows.newAttempt()`. The session calls it on mount and on `RETRY`, so the mouse's seed counter restarts with each attempt.
  - `BannerFlow.eligible(screen, opts?)` is the gate without the 60 s window and without side effects. `SessionMeta.bannerBand?` is the band decided at mount; `GameView.bannerBand` = `bannerBand && !noAds`.
  - `views.ts`: `selectPulse(state, ctx, enabled, c?)` and `untouchedBoard(game)` (Empty or Given everywhere). `selectGameView` / `selectEventView` take an optional config.
  - `save.ts` / `save-fields.ts`: `SETTINGS_SEEN_KEY`, `settingsSeenOf(save)`, `settingsDotOn(save, c?)`, `markSettingsSeen(save, c?)`, `readExt`, `mergeExt`.
  - `boot.ts`: `e2eBannerConfig(search)`. In e2e builds only, `?bannerPlay=0` turns `ads.banner.duringPlay` off for the banner flow. The fbig e2e uses it for the 2b "never in play" tests.
  - `analytics`: `mouse_used { mode, cells }`.
- **The view fields G3 reads.**
  - `pulse` is already null under reduced motion, under any overlay (the coach included), in the tutorial and from the win flow on.
  - `mouse.enabled` is false while no tile is left to cross out.
  - `videoRefill` is `ads.enabled && capabilities().rewarded`, so it is false on the web.
- **Banner on the game screen.**
  - `session.start` no longer hides a banner that is up when the new board may carry one (banner to banner, also from Home). It hides it before a board that may not: the tutorial, `duringPlay` off, No Ads, or fewer than 10 levels.
  - `screenGone()` is no longer a hide. A load in flight that lands on the next banner screen (no hide in between) stays up.
  - Over the game screen, the shell's modal list (Settings, How to play, the shop, the hub, the ranking panel) hides the banner, and closing them never re-shows it there. O4, O1, O2 and the coach keep it.
- **The mock banner** (`web/mock-ads.ts`) reads `--play-band` (any non-zero value means 320 px wide) and `--play-band-bottom` from `<html>`. G3 publishes them as px lengths and drops them when the game screen goes. This works on the current tree.
- **Settings dot.** The shell marks `settingsSeen` on every `overlay:open` of `'settings'`, so the game's gear, Home's and the event screen's are all covered. It saves with `saves.now()`. The game view now re-renders on `save.ext` and `save.purchases` changes.
- **L0 leftovers done.** `TUTORIAL_CELLS.lavender` is now `TUTORIAL_CELLS.violet`, and `LAVENDER` in `tutorial-session.spec.ts` is now `VIOLET`. `TUTORIAL_COLORS` is `[3, 7, 2, 0]`, with its comment updated.

## L0 (lead, 2026-10-10): what changed in G1's files

- The four colour names changed in the English catalogue (`color.0` Coral, `color.2` Mustard, `color.7` Violet, `color.11` Pink; look-spec §1.9, Appendix A, critic C14). Tests updated to match: `tests/unit/app/points-session.spec.ts` ("Mustard done."). Comments updated: `saves.spec.ts`, `resilience.spec.ts`, `tutorial-session.spec.ts` and the doc comments in `src/game/tutorial.ts`. One test title updated: `tests/unit/game/tutorial.spec.ts`. No assertion changed otherwise.
- Left for G1: the identifiers `TUTORIAL_CELLS.lavender` (`src/game/tutorial.ts`, asserted in `tutorial.spec.ts`) and the `LAVENDER` constant in `tutorial-session.spec.ts`. These are code names, not English text, so renaming them is up to G1. The `TUTORIAL_COLORS` comment now reads "Mint, Violet, Mustard, Coral" for today's `[4, 7, 2, 0]`. G1-2 changes both the value and the comment.

## I-2 (lead, 2026-10-10): status of every request

| # | Status |
|---|---|
| R1 | **Done by G3** (square 44 × 44 `::before` on the game bar's discs). At I-2 the square area moved into `base.css` `.btn--icon::before` for every round button (G3 R2), and the `layout` e2e probe clamps its corners into the viewport (G3 R3). |
| R2 | **Done by G3** (`coach.ts` row layout, `[data-row]`). |
| R3 | **Answered by the lead**: the DOM stays (`.points-pill__name` = the label; `.points-pill__label` = the "+N" chip's host, shared with the period counter). CONTRACTS §7 and look-spec §4.6 now say so (I-5). |
| R4 | **Done**: `boot.spec.ts`'s fake implements `playStartToast`; `win-flow.spec.ts` fakes `WinScreen` (no `playStartToast` needed); `screens-2b.spec.ts` and `dev/b-harness.ts` use the real `createGameScreen`. `GameScreen.playStartToast` is required since I-3 and the session calls it without `?.`. |
| R5 | **Done at I-5**: CONTRACTS §10 lists G1's members. |
| R6 | **Done at I-5**: 05 §6 and the parity-spec banner lines point at the banner in play (D-2d-15) and fb-dashboard B7–B9. |

---

## 2d.1 (helpers-spec, 2026-10-10)

Spec: [helpers-spec §7](helpers-spec.md#7-workstreams-interfaces-tests-and-acceptance) (ownership §7.1, order §7.2; the lead runs I-2) · Interfaces: [CONTRACTS-2d1.md](CONTRACTS-2d1.md). "How to file a request" above still applies, but ownership now follows helpers-spec §7.1, not look-spec §3.1. Number the 2d.1 rows **H1, H2, …** so they never clash with the 2d rows above.

### 2d.1 Requests

| # | From → to | What | Why |
|---|---|---|---|
| H1 | G1 → G3 | `tests/e2e/visual.spec.ts`, "the game screen in the recording's state …": it expects `.tool--bulb[data-pulse]` right after `markRow0`. With the 2d.1 rule the bulb pulses only after `fx.helperPulse.idleMs` (5 s) without a board change, with hint stock, and before any helper use in the attempt. Wait ≥ 5 s after the last mark (the view re-renders on the 1 s TICK, so allow up to 6 s), or drive `page.clock`. The `.start-toast` steps there become the tickers (yours at I-3). | helpers-spec §4.6, D-2d1-9 |
| H2 | G1 → lead | `dev/look-compare.ts` `openRecording`: the same pulse change. Wait idleMs (+1 s) after the five marks before `pulseAt(page, 480)` (the "pulse peak" capture), and replace the wait for `.start-toast` to leave with the tickers once they replace it. | helpers-spec §4.6, §5 |
| H3 | G1 → lead (I-5) | CONTRACTS-2d1 §2/§4: (a) `DoneUnit.anchor`: "the last changed tile in reading order; **for the mouse, the last in its visit order** (the X that lands last)". (b) The G1 members listed under "2d.1 Notes from G1" below. | CONTRACTS-2d1 |
| H4 | G1 → lead (I-3) | When `GameScreen.playTickers` becomes required and `playStartToast` goes: delete the fallback branch in `session.ts` `playBoardEntry` (the 2d toast for a screen without `playTickers`, still gated by `fx.startToast.enabled`) and the test "a screen without playTickers (until I-3) still gets the 2d toast" in `tests/unit/app/session-2d.spec.ts`. The fake game screen in `tests/unit/app/harness.ts` already implements `playTickers`; drop its `playStartToast` and `startToasts` then. `boot.spec.ts`'s fake needs `playTickers` too. `fx.mouseStaggerMs` has no G1 reader any more. | helpers-spec §7.2 I-3 |
| H5 | G1 → G3 (and G2) | With `page.clock.setFixedTime` (Date.now frozen; timers and `performance.now` keep running), `__mewdoku.solve()` on level 15 at 1280 × 800 now opens the ranking panel at ≈ 10 s instead of ≈ 4 s. The `layout` e2e "keyboard only: focus moves into every new screen" then fails: `.ranking__tap` is not enabled within 10 s. HEAD (`7048674`) and HEAD + only the G1 changes open it at ≈ 4 s; probe in `scratchpad/2d1-G1/tools/probe-win.mjs`. So the delay comes from the in-progress celebration fx on the board or the fx layer: something that measures Date.now, or a loop that starves the timers while n cats celebrate at once. Please check it. A real player does not freeze Date, but a busy main thread at the win would delay the panel the same way. | win flow §2.2 times; helpers-spec §2.4–§2.5 |

### 2d.1 Done for other workstreams' requests

*(none yet)*

### 2d.1 Notes from G1 for the others (no action needed)

- **S0 landed (2026-10-10).** All additive; `tsc` green.
  - `src/game/types.ts`: `DoneUnit { kind: 'row' | 'col' | 'region'; index; anchor }` and `GameEvent` `{ type: 'UNITS_DONE'; units: readonly DoneUnit[] }`.
  - The reducer emits `UNITS_DONE` for `TAP`, `PAINT`, `DOUBLE_TAP`, `HINT_APPLY`, `KITTY` and `MOUSE`: after `MARKED` / `CAT_PLACED` / `POINTS` / `REGION_DONE`, before `WON`; never on an unmark; never in an action that ends in `LOST`. In `HINT_APPLY` the order is `HINT_APPLIED`, `MARKED`, (`CAT_PLACED` …), `UNITS_DONE`, (`WON`).
  - **Anchor:** the unit's last changed tile in reading order, **except for the mouse**: there it is the last one in the mouse's visit order (`MARKED.cells` order), i.e. the X that lands last. This only matters when two mouse X's complete the same unit; with the reading-order anchor, `mouseLandMs(indexOf(anchor))` could fire the wave and label before the unit's other X has landed. G3's `mouseLandMs(ev.cells.indexOf(anchor))` is right as written. (The CONTRACTS-2d1 §2 doc comment says "reading order"; the lead may add "for the mouse, visit order" at I-5.)
  - A kitty's cat on a one-tile region gives `CAT_PLACED`, `POINTS`, `REGION_DONE`, `UNITS_DONE [{ region }]` in one action (the session plays no `unit_done` sound there and leaves that region out of the announcement, §4.3).
  - **New** `src/game/units.ts`: `isUnitComplete(state, kind, index)`, `completedUnits(prev, next, changed)`, plus `unitCells(puzzle, kind, index)` (reading order) and `changedCells(prev, next)`.
  - `src/game/mouse.ts`: `pickMouseCells` now returns **pick order** (not sorted); `mouseVisitMs(c?)` = 935, `mouseLandMs(k, c?)` = k × 935 + 850, `mouseRunMs(count, reduced, c?)` = count × 935 + 170 (reduced: 150).
- **Test fixture** (`tests/unit/game/fixtures.ts`): `P9C` / `SOL9C`, our own 9 × 9 (random region growth, unique solution) with a one-tile region in the top-right corner, for anyone who wants the kitty → hint sequence on a board of ours. It is not the original's Level 114 (helpers-spec §0.2).
- **Build landed (2026-10-10).** New and changed G1 members beyond CONTRACTS-2d1 (all additive):
  - `src/workers/hint-chunk.ts` (new): `pickKittyCell` (fewest candidates after the shadows; ties: the earlier solution cell) and `getHintStep` (re-exported). `engine-client.ts`'s lazy import and `engine.worker.ts` load it (chunk `hint-chunk-*.js`, ≈ 2.1 KB raw, in the core lazy JS row). `engine/hint.ts` is untouched; `reveal_fallback` still uses its most-candidates picker (accepted, §2.3).
  - `src/app/tickers.ts` (new): `pickTickerLines(input, c?)` and `eligibleLine2(input, c?)`. `TickerInput` has one member more than the contract: `now` (clock ms, for this period's total; a rolled-over period shows no fish line).
  - `src/app/views.ts`: `ViewContext.lastBoardChangeAt?` and `mouseUses?`; `selectPulse(state, ctx, enabled, c?)` now reads `ctx.now`. Pinned targets (`'kitty'`, `'bulb'`) keep the 2d behaviour (no idle, stock or use condition), as the config's doc comment says; only `'auto'` has the §4.6 conditions.
  - `src/app/helper-flows.ts`: `HelperHost.reducedMotion()`; `HelperFlows.mouseUses()`; `onMouse` resolves only when the run lock ends (`mouseRunMs` after the dispatch).
  - `src/app/banner-flow.ts`: `BannerFlow.hintOpened()` / `hintClosed()`. The session calls them on the router's `overlay:open` / `overlay:close` of `'hint'`. The re-show timer is cancelled by a new hint, a screen change or another close. When it fires it does nothing if the game screen is gone, a modal or an ad is up, or the board is won. It is not cancelled by other hides (a rewarded video), so the band refills after the window.
  - `src/app/session-effects.ts`: `feedbackFor(ev, state, colors, c?, events?)`. The fifth argument is the whole action's events: `UNITS_DONE` looks for its `REGION_DONE` there. The mouse's `MARKED` now has no sound of its own (only `a11y.mouse`).
  - `src/game/units.ts` also exports `unitCells` and `changedCells`.
- **Sounds the session plays now** (G3: nothing to do in `ui/`): `mouse` at k × 935 and `mark` (+ the mark haptic) at k × 935 + 850 for each mouse tile (reduced motion: one `mark`); `points` 1 330 ms after each `POINTS` (reduced motion: at once); `unit_done` (index = units − 1) with the action, or for a mouse action at `mouseLandMs(index of the earliest anchor)`. There is no `unit_done` when the action has `REGION_DONE`. These timers are cleared on a new board, a restore and a Retry.
- **A11y:** the action's one utterance gains "Row 1, column 9 and Violet complete." (`a11y.unitDone` with `unitName()` names joined by `joinList`, first letter capitalised). A region whose `REGION_DONE` is in the same action is left out.
- **Pulse inputs:** the session restarts the idle time at every board change (cells differ), at `START`, at `REVIVE` and on `resume` from `hidden` / `fb_pause`. The per-attempt mouse count lives in memory only (hintsUsed and kittiesUsed are saved with the slot), so after a reload the pulse may come back on a board where only the mouse was used. That is accepted; say if it should be stored.
- **Verification on our own board (scratch only, never committed):** the analysts' Level 114 map from `scratchpad/2d1/mouse-cat.md` §2, run through this build in `scratchpad/2d1-G1/tools/l114-check.ts`, gives the recorded results. The mouse cells (2,4), (8,6), (0,5) are candidates. The kitty picks (0,8); the engine's 2b rule would pick (4,1). The kitty emits `UNITS_DONE [{ region }]` with its `REGION_DONE`. The hint is the shadow of (0,8): Apply crosses exactly the 16 recorded tiles and emits `UNITS_DONE` row 0 (anchor (0,7)) and column 8 (anchor (8,8)). The committed tests use `P9C`, our own board with the same properties.

### 2d.1 L0 (lead, 2026-10-10): what changed for G1

- **No G1 file was edited at L0.** Every G1 spec passes unchanged.
- **Config** (`src/app/config.ts`, helpers-spec §0.6; read-only for G1–G3). It now holds everything G1 reads:
  - `fx.helperPulse.idleMs` 5000, `needsStock` true and `untilHelperUsed` true (`views.ts`, §4.6). `'auto'` changes meaning, as `HelperPulseTarget`'s doc comment explains. Today's `views.ts` ignores the three keys, so `flags-views.spec` still passes.
  - `fx.mouse` `{ appearMs: 115, dwellMs: 850, exitMs: 85 }` and `fx.markPopMs` **140 → 170** (§1.5), for `mouseVisitMs` (935), `mouseLandMs` and `mouseRunMs`. For 3 tiles that is 3 × 935 + 170 = 2 975; with reduced motion it is `fx.reducedMotionFadeMs`, 150.
  - `fx.points.starAtMs` 783 and `flightMs` 530 (§2.5). Schedule the `points` sound at 783 + 17 + 530 = 1 330 ms after `POINTS`.
  - `fx.tickers` `{ enabled: true, delayMs: 150, crossMs: 9000, lead: 0.086, reducedHoldMs: 3000 }` (§5). The session's trigger checks `fx.tickers.enabled` where 2d checked `fx.startToast.enabled`.
  - `ads.banner.hideDuringHint` true (`banner-flow.ts`, §3.2).
  - `kitty.revealMs` **600 → 820** (§2.4). `helper-flows.spec`, `timer.spec` and `points-session.spec` read it from the config, so they pass unchanged.
- **@deprecated phase2d.1.** These are still read today, and the readers go at I-3:
  - `fx.mouseStaggerMs`: the mark sounds in `session.ts`, and `session-2d.spec`.
  - `fx.startToast`: the toast trigger in `session.ts`, and `session-2d.spec`.
