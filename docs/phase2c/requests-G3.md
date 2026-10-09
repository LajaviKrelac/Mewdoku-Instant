# Phase 2c requests from G3 (platform)

Status: living list · Owner: G3 · Process: [fish-lives-spec §7.5](fish-lives-spec.md) (the lead runs I-2). One line each: from → to, what, why.

## Notes for the other workstreams (no action required, but useful)

- G3 → G1 (info, answers G1's R5): **S0 is in, and the band reads set `boardRank`.** `RankEntry.boardRank?: number` exists in `src/platform/types.ts`; every entry of a band read (`top(board, n, keep)`) carries it (classic: the entry's `getRank()`; NEZP: its 1-based position in the API list, or `getRank()` when the API offers one), and reads without `keep` never carry it. `parseLeaderboardMap` accepts `period_points` (and still parses the retired `paw_points`).
- G3 → G1 (info): **a band read now stops as soon as it holds `n` band entries** (or the band or the board ends, or `BAND_MAX_PAGES` pages were read). For the period board, whose band sits at the top, this is one or two `getEntriesAsync` calls instead of four, well inside `rank.fetchTimeoutMs`. Consequence for `ranking-flow.ts`: the 2b fallback "my position among the read band entries" now covers at most `n` entries (you pass `rank.fetchCount`, 50), but it is reached only when no band entry was read, because every band entry carries `boardRank`. `RankingProvider.top`'s doc comment says so.
- G3 → G1 (info): the overlay list (`showList` with `keep`) pins my row with my rank inside the band from the same anchor (`mine.rank − (band[0].boardRank − 1)`, exported as `placeInBand` in `fb-ranking.ts`); it pins nothing when the band was read to its end without me, or when the numbers disagree with the rows read.
- G3 → G1 (info): `PaymentsProvider.catalog()` and `purchase()` take only `cfg.iap.catalog` ids (a retired id answers `'error'` without an SDK call); `purchases()` also passes on `cfg.iap.retired` ids (`fish_250`, `fish_900`), so `shop-flow.ts`'s restore receives them. The e2e "boot restore of an unconsumed `fish_250`" passes against your restore (10 hints + 3 kitties, ledger `fish_250|…`, consumed once, nothing more after a reload).
- G3 → all (info): stub additions (`tests/fixtures/fbinstant-stub.js`): the default catalogue is the three products on sale and `purchaseAsync` rejects anything it does not list; `payments.unconsumed: [{ productID: 'fish_250' }]` is filled in as an unconsumed charge (token `stub-unconsumed-<n>-<productID>`), also as the preset `?fbstub=unconsumed-fish-250`; leaderboard rows can be seeded by period band, `{ playerId, band: <index>, total }` or `{ playerId, period: <offset from the stub clock's current UTC week>, total }` (`leaderboards.periods` = `{ kind, epoch, span }`, defaults week / 2026-01-05 / 100 000); `control.periodIndex(offset?)`.

## Requests

| # | From → to | What | Why |
|---|---|---|---|
| R1 | G3 → lead (I-1) | `playwright.config.ts`, the fbig web server's `VITE_FB_LEADERBOARDS`: add `period_points: 'e2e_period_points'`; drop `paw_points` and `daily_fastest` (the three `event_*` entries stay). G3's private run used exactly `{"period_points":"e2e_period_points","event_lantern_walk_2026":"e2e_event_lantern_walk_2026","event_snow_paws_2026":"e2e_event_snow_paws_2026","event_yarn_hearts_2027":"e2e_event_yarn_hearts_2027"}`. | `tests/e2e/fbig.spec.ts`'s four ranking tests read the stub's `e2e_period_points` board; without the entry the board is `unsupported` and they fail. Same as G1's R6. |
| R2 | G3 → lead (info, I-6) | `fbig.spec.ts` no longer has the 2b daily-band test "twelve next-day entries above today … (FB2B-4, FB2B-7)": `rank.dailyBoard` is `false` by default, so a daily win submits and shows the period board, and an e2e build cannot flip the flag. Its replacement is the period-band test (a future-dated entry and older weeks skipped; 250 better players this week → "Your rank: #251" and the list pins `#251`). The daily band reader keeps its unit tests (`tests/unit/platform/fb-ranking.spec.ts`, G1's `ranking-flow` tests). If the lead turns `rank.dailyBoard` on, the old test can come back from `78cbad1`. | Spec §4.1 (`daily_fastest` off). |
| R3 | G3 → lead (info, I-5) | `docs/phase2b/fb-dashboard.md` is updated (§4.9): §1 map example and key rules, §3 one period board (`fish_week_v1`) with the band notes and the `period.kind` warning, `paw_points` retired, `daily_fastest` only with `rank.dailyBoard`; §4 three products and the retired fish packs; §6 L3 (board-wide `getRank`) and a new L6 (best score per player); §8 checklist. No G3 provenance rows (no drawings or animations). | Spec §6, §4.9. |
| R4 | G3 → lead (info) | `src/env.d.ts` (given to G3 in this phase's brief; the spec's §7.1 lists it under the lead): only the `VITE_FB_LEADERBOARDS` doc comment changed (the 2c example). | Ownership note. |

## Done for other workstreams' requests

- G2's R5 (`fbig.spec.ts`: no `.fish-pill__plus`; the shop opens from Settings → Shop `.settings__shop-link`; only `.shop__section--buy`): done; the safe-zone test, the purchase tests and the banner-under-shop test go through Settings → Shop, and two tests assert the Home "+" is gone.
- G1's R5 (`boardRank` on band reads): done (see the notes above).

## Integration (lead, I-2, 2026-10-09)

Every request above was run or answered at integration; the outcome of each is in [STATUS-2c §2](STATUS-2c.md).
