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
