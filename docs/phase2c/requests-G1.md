# Phase 2c requests from G1 (game + app logic)

Status: living list · Owner: G1 · Process: [fish-lives-spec §7.5](fish-lives-spec.md) (the lead runs I-2). One line each: from → to, what, why.

## Requests

| # | From → to | What | Why |
|---|---|---|---|
| R1 | G1 → lead (I-3) | When I-3 deletes `GameScreen.fishRect / showFishPill / fishLabel`, delete the same three members from the fake game screen in `tests/unit/app/boot.spec.ts` (≈ line 74; an object literal, so it will fail the excess-property check). `tests/unit/app/harness.ts` declares them on `FakeGameScreen` itself and compiles either way; drop them there too. | The fakes must keep the 2b members until I-3 (G2 keeps them required meanwhile). |
| R2 | G1 → G2 | `a11y.fishEarned.one|other`, `rank.title.points` and `shop.notEnough` are no longer called by G1 code: delete them now. `rank.points` is still called by `src/app/ranking-flow.ts` `formatScoreView` for the deprecated `RankScoreView 'points'` kind only. | Appendix A.3; G2's note says it waits for G1. |
| R3 | G1 → lead (I-3) | When `RankScoreView 'points'` is removed, delete the two `'points'` branches in `src/app/ranking-flow.ts` (`scoreView`, `formatScoreView`); then `rank.points` can go (Appendix A.3, "at I-3 if nothing uses it"). | Only the retired `paw_points` decodes to `'points'`; nothing reads that board after 2c. |
| R4 | G1 → lead (info) | Ownership of `tests/e2e/layout.spec.ts`: the G1 brief gives it to G1 (the spec §7.1 gives it to G2 and `determinism.spec.ts` to G1). G1 changed only the keyboard test (G2's R3): no wallet seed; the shop part is now "Settings by keyboard shows no Shop row" (no shop on the web, §5.2). G2 should not edit the same test. | Avoid two writers on one file. |
| R5 | G1 → G3 (info) | `ranking-flow.ts` reads `RankEntry.boardRank` through a local intersection type, so it compiles before and after G3's S0. For the exact "Your rank" past 200 entries the band reads must set `boardRank` (§4.5): rank = `mine.rank − (first band entry's boardRank − 1)`; without it G1 falls back to the position inside the read band, else "Your score" only. `fetch('period_points')` passes `keep` = the current UTC period's index in the score's high digits. | §4.5, §7.4 G3 → G1. |
| R6 | G1 → lead (I-1) | `playwright.config.ts` `VITE_FB_LEADERBOARDS`: add `period_points: 'e2e_period_points'`, drop `paw_points` and `daily_fastest` (already listed as I-1). A scored win submits `period_points` = `encodePeriodScore(this UTC week, total)`; an event win also its event board in the same batch. | §4.4. |

## Done for other workstreams' notes

- G2's R3 (`layout.spec.ts` shop keyboard test, `wallet` seed) and R4 (`smoke.spec.ts` / `winflow.spec.ts` fish-pill selectors, web shop): done by G1 (see R4 above).

## Integration (lead, I-2, 2026-10-09)

Every request above was run or answered at integration; the outcome of each is in [STATUS-2c §2](STATUS-2c.md).
