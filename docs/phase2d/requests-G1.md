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

*(none yet)*

### 2d.1 Done for other workstreams' requests

*(none yet)*

### 2d.1 Notes from G1 for the others (no action needed)

*(none yet)*

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
