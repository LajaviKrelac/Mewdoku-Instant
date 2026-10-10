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

## Phase 2c.1 (per-cat level points, 2026-10-10)

Spec: [fish-lives-spec §3.1–§3.2, §10](fish-lives-spec.md). G1 work is built and tested (unit + its four e2e specs on a private build); the lead runs these at 2c.1 integration.

| # | From → to | What | Why |
|---|---|---|---|
| P1 | G1 → lead (`tests/e2e/fbig.spec.ts` ≈ line 504, "no leaderboard API" test) | Replace `records.getByText('Perfect streak', { exact: true })` with `records.getByText('Total points', { exact: true })`. | D24: `personalRecords` no longer carries `streak`; the period records card shows Total points. The test will fail as written. |
| P2 | G1 → lead (I-1, `dev/b-harness.ts`) | Drop `streak` from the victory fixtures (≈ lines 174–185, 280–281, 450–488) and from the records fixture; give the victory fixtures level totals (`pointsEarned` e.g. 7 296); add `points` to the game-view fixtures and a `POINTS` demo. | §3.7 / §10.10: `VictoryProps.streak` and `PersonalRecordsView.streak` are deleted at I-3; `dev/**` then stops compiling. |
| P3 | G1 → G2 (info) | `tests/e2e/visual.spec.ts` (seeds `streak: {3, 9}`; expects `.victory__streak` "Perfect ×4", ≈ line 176) and `tests/e2e/i18n.spec.ts` (expects `.victory__streak` visible, ≈ line 216; `.victory__streak` in the overflow selector list, ≈ line 104) still test the retired chip. | §2.7: `.victory__streak` must not exist. |
| P4 | G1 → lead (I-3) | G1 already sets `GameView.points` on every view (`number \| null`) and passes no `VictoryProps.streak` / `PersonalRecordsView.streak`, so I-3 can make `points` required and delete both `streak` members without touching G1 code. | §10.9 I-3. |
| P5 | G1 → lead (I-4, info) | FBIG main JS measured on private builds (`vite build --mode fbig`): base (`23cc250` + the 2c.1 config) 278 155 B; base + G1 only 278 779 B (+624 B; ceiling 279 000 B); the shared tree with G2's work in progress at the time 281 147 B (over). G1 shared one `popcount` and trimmed its restore code; it adds no dependency. | §10.9 budget: the lead decides at I-4. |
| P6 | G1 → lead (I-5 docs) | `restoreGame` checks consistency (c) with a tighter upper bound than the spec text: `points ≤ runTotal(k − s) + runTotal(s)` (s = catStreak) instead of `runTotal(k)`. With s = k this is (d)'s `runTotal(k)`; with s < k it rejects totals no sequence of cats can produce (e.g. k = 3, s = 1: at most 1 824, not 2 016). A rejected slot is derived as the spec says. Record it in §3.2.3 / D20 if accepted. | A restore never inflates points (D20's intent). |
| P7 | G1 → lead (I-5 docs, info) | `tests/unit/app/streak-session.spec.ts` was replaced by `tests/unit/app/points-session.spec.ts` (§10.8); new `tests/unit/game/reducer-points.spec.ts`. STATUS-2c §9 names `streak-session`. | Docs pointer. |
| P8 | G1 → lead (info) | A slot with an invalid `points` / `catStreak` / `scoredRows` value is reported in the read's repair list (`inProgress.<mode>.<field>`), so boot logs `save_corrupt` for it, as for any repaired field; a slot merely without the fields (written before 2c.1) is not a repair (no event) and restores with derived values. | §3.2.3 "Read" and "Derived". |

## Integration (lead, Phase 2c.1, 2026-10-10)

Every 2c.1 request above was run or answered at integration; the outcome of each is in [STATUS-2c §10.2](STATUS-2c.md).
