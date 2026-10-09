# Phase 2c requests from G2 (UI, art, fx, audio, styles, i18n)

Status: living list · Owner: G2 · Process: [fish-lives-spec §7.5](fish-lives-spec.md) (the lead runs I-2). One line each: from → to, what, why.

## Notes for the other workstreams (no action required, but useful)

- G2 → G1 (info): **S0 is in.** Every §7.4 G2 → G1 member exists with a working implementation: `PillsView` / `GameScreen` `lifeSlots()`, `departLife(slot)`, `showPeriodCounter(total)`, `periodRect()`, `periodLabel(text)`; `createPeriodPill`; `FlyFishOptions.startScale`; `HomeView.period`; `VictoryProps.streak` / `kept`; `RankingBoardKind 'period'`, `RankScoreView { kind: 'fish' }`, `RankingResultView { kind: 'period' }`, `PersonalRecordsView.period` / `streak`, `RankingPanelProps.periodKind`; `RankHubTab 'period'`, `RankHubProps.periodKind`; `ShopProps` swap fields optional; `GroupResultOutcome 'place'.hints`. The 2b `GameScreen.fishRect / showFishPill / fishLabel` still work (they forward to the period counter) until I-3.
- G2 → G1 (info): helpers you may use instead of writing your own: `fishSizeFromRect(rect, c)` in `src/ui/fx/fish-flight.ts` (spec §2.3 size: `clamp(round(width), fishMinPx, fishMaxPx)`; pass it as `FlyFishOptions.sizePx` with `startScale: 1`); `flyFish` picks the arc spread from `from.length` (1 → 0, 2 → ±½, 3 → 2b, more → evenly spaced). `src/ui/period-text.ts` maps a `PeriodKind` to the literal keys: `fishKeptText(kind, kept, total)` (the `a11y.fishKept.<kind>` line of §1.6), `periodRankTitle(kind)` (`rank.title.period.<kind>`), `periodTabLabel(kind)`, `periodTotalText(kind, total)`, `periodResultText(kind, gained, total)`.
- G2 → G1 (info): i18n keys removed (Appendix A.3): `victory.bonus.hard|daily`, `shop.swap`, `shop.swap.hint|kitty|action|done|a11y`, `rewarded.swap`, `shop.product.fish_250|900.name|desc`, `event.reward.fish.one|other`, and, after G1's R2 (G1 no longer calls them), `a11y.fishEarned.one|other`, `rank.title.points`, `shop.notEnough`. The @deprecated `'points'` board and hub tab now read as the period board ("Weekly ranking" / "This week") until I-3 removes them. Only `rank.points` stays (G1's `ranking-flow.ts` `formatScoreView` and G2's `formatRankScore` for the deprecated `RankScoreView 'points'`; G1's R3 at I-3).
- G2 → all (info): one i18n key beyond Appendix A.2: `rank.records.streakBest` "{count} (best {best})", the Perfect streak row's value when the best is longer (§4.6 "with 'best N' when best > current"). The UI builds that row itself (`periodRecordRows` in `ranking-panel.ts`).
- G2 → all (info): DOM contract (spec §7.4) is live: `.pill--lives`, `.life[data-full]`, `.period-pill` (Home and in game, `[data-in-game]` in the pills row), `.period-pill__n`, `.victory__kept[data-count]`, `.victory__period`, `.victory__points`, `.victory__streak`, `[data-overlay="shop"] .shop__section--buy`. Gone: `.fish-pill*` (incl. `.fish-pill__plus`, `.fish-pill__main`, `.fish-pill__label`), `.heart*`, `.pill--hearts`, `.victory__top`, `.victory__chips`, `.victory__chip--bonus|points` (now `.victory__points`), `.shop__section--swap`, `.shop__swap`, `.shop__balance`, `.rewarded__swap`. The in-game counter's label is `.period-pill__label .period-pill__chip`; its accessible name is on `.period-pill` itself (`role="img"`, "3 fish this week").

## Requests

| # | From → to | What | Why |
|---|---|---|---|
| R1 | G2 → lead | `dev/art-harness.ts` line 119 and `dev/board-harness.ts` line 204: replace `'icon-heart', 'icon-heart-empty'` with `'icon-fish-empty'` in the icon lists. | `icon-heart*` were deleted from the sprite (spec §7.3 G2 item 1); `tsc` fails in `dev/**`, which no 2c workstream owns. |
| R2 | G2 → lead | `dev/b-harness.ts`: victory props (line ~166) add `streak: 4, kept: { fish: 2, max: 3, gained: 2, total: 42, kind: 'week' }` and drop `fish`, `bonus`, `onShop`; rank-hub props (lines ~336, ~342) add `periodKind: 'week'` (and use `'period'` instead of `'points'` for the first tab); group result (line ~486) `fish: 10` → `hints: 1`. `dev/shell-fixtures.ts` line ~154: `fish: …` → `period: { kind: 'week', total: 42 }`. | The §7.4 interfaces made `streak`, `kept`, `periodKind`, `period` required and `hints` replaced `fish`. |
| R3 | ~~G2 → lead~~ **done by G1** (G1 R4) | `layout.spec.ts`: the shop keyboard test is now "Settings by keyboard shows no Shop row"; no `wallet` seed. G2 did not edit the file again; it passes in G2's private run (web-390/320/1280). | Spec §5.2, §3.8. |
| R4 | G2 → G1 (**done by G1**) | `tests/e2e/smoke.spec.ts` (lines ~150–170: Home "+" → shop swap) and `tests/e2e/winflow.spec.ts` (`.pills .fish-pill`, `.fish-pill__main` aria-label "3 fish", `.fish-pill__label .fish-pill__chip`): switch to `.pills .period-pill` (its own `aria-label`, e.g. "3 fish this week"), `.period-pill__n`, `.period-pill__label .period-pill__chip`; no shop on the web. | The fish pill is now the period counter (§2.1). |
| R5 | G2 → G3 (**done by G3**: `fbig.spec.ts` now asserts the Home "+" is gone) | `tests/e2e/fbig.spec.ts` line ~743: `.screen--home .fish-pill__plus` no longer exists; open the shop from Settings → Shop (`.settings__shop-link`). The sheet has only `.shop__section--buy`. | §5.2. |

## Done for other workstreams' requests

- G1's R2 (delete `a11y.fishEarned.*`, `rank.title.points`, `shop.notEnough` now): done in `src/i18n/en/ui-2b.ts`, `meta.ts`, the 16 catalogues and `drafted-from.json`; `tests/unit/i18n/catalogs.spec.ts` checks they stay gone.

## Notes for the lead (I-5 docs)

- `docs/phase2c/provenance-G2.md` is the full draft; `docs/provenance.md` §9 already carries G2's rows (the G2 brief gives G2 that file), so I-5 only adds G1 / G3 rows if they have any.
- `docs/i18n/screenshots/` was re-captured for the 2c UI (`I18N_SHOTS=1`, 320 px: Home, game, Settings, ranking, victory for de, ru, ar, th, ja and the pseudo-locale).
- Screenshots: `docs/phase2c/screenshots/G2-visual-*.png` (from `tests/e2e/visual.spec.ts`) and the frame sheets `G2-fish-loss-frames.png`, `G2-revive-frames.png`, `G2-win-flight-frames.png`, `G2-counter-roll-frames.png`, `G2-lives-gallery.png`, `G2-victory-variants.png`, `G2-overlays.png`, `G2-real-app-*.png`.

## Integration (lead, I-2, 2026-10-09)

Every request above was run or answered at integration; the outcome of each is in [STATUS-2c §2](STATUS-2c.md).
