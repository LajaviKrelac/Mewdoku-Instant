# What to set up in Meta's dashboards for Phase 2b (FB Instant Games)

Status: workstream D draft · Date: 2026-10-09 · Applies to: [parity-spec](parity-spec.md) §3 (banners), §5 (rankings, groups), §8 (payments), §11 (budgets), §14 (verify before production) · Code: `src/platform/fb/**`, `tests/fixtures/fbinstant-stub.js`

**Phase 2c update (G3, 2026-10-09; [fish-lives-spec](../phase2c/fish-lives-spec.md) §4, §5.3).** Fish are the lives, and the fish kept at a win are the leaderboard points of the current UTC week (user, first-hand, 2026-10-09). So the dashboard needs **one period board** (`period_points`, §3) instead of `paw_points` + `daily_fastest`, and **three products** (§4): the fish packs are retired. Changed below: §1 (map example and key rules), §3 (boards), §4 (products), §6 (L3, new L6), §8 (checklist).

This page lists everything the FB build expects to exist on Meta's side: the leaderboards, the ad placements and the in-app products, and the build-time `VITE_FB_*` values that connect them. It also lists every SDK behaviour our code relies on that **nobody has verified on developers.facebook.com yet** (§6). Until each item is verified, the code runs in the fallback the spec gives it, so nothing here blocks the build; it blocks only switching the related feature on in production.

How we know what we know (tags as in parity-spec §0.4):

| Tag | Meaning |
|---|---|
| [05: confirmed] | Read first-hand in Phase 1 (docs/phase1/05). |
| [meta-plugin] | Meta's own Unity plugin API reference, `documentation/API_REFERENCE.md` in `facebook/meta-instant-games-unity-plugin`, read 2026-10-09. It lists the JS functions the plugin wraps, not their exact JS semantics. |
| [meta-sample] | Meta's public NEZP sample (`fbsamples/fbinstant-nezp-samples`, `nezp_sample_xmls_picker`: `main.js`, `overlayManagementUtils.js`, `ig_views/*.xml`), read 2026-10-09. 06 allows reading Meta's own samples; nothing was copied. |
| [search: Meta docs] | Web-search summaries of developers.facebook.com pages (2026-10-08 and 2026-10-09). Direct fetches of developers.facebook.com fail from our environment (DNS), so these are second-hand. |
| [uncertain] | Not settled by any of the above. |

---

## 1. Build-time values (`VITE_FB_*`)

Set them in the environment of the FB build (`npm run build:fbig`, `npm run build:release`). None is committed. An empty value switches that feature off; it never breaks the build (spec §10).

| Variable | Value | Effect when empty |
|---|---|---|
| `VITE_FB_PLACEMENT_INTERSTITIAL` | Interstitial placement ID (Monetization Manager) | No interstitials (Phase 2) |
| `VITE_FB_PLACEMENT_REWARDED` | Rewarded video placement ID. **One ID serves every rewarded placement**, including the new `group_double` (§5.6) | Free fallback grant (02 §13.3) |
| `VITE_FB_PLACEMENT_BANNER` | Banner placement ID (§2 below) | No banner: `capabilities().banner` is false |
| `VITE_FB_LEADERBOARDS` | JSON map from our board key to the dashboard name (classic API) or id (NEZP), e.g. `{"period_points":"fish_week_v1","event_lantern_walk_2026":"event_lantern_walk_2026","event_snow_paws_2026":"event_snow_paws_2026","event_yarn_hearts_2027":"event_yarn_hearts_2027"}` (2c) | Every board is `unsupported`: the ranking panel shows personal records; the Home trophy stays hidden |

`VITE_FB_LEADERBOARDS` rules (`parseLeaderboardMap`, `src/platform/fb/fb-probe.ts`): keys must be `period_points` (2c), `daily_fastest`, `event_<event id with - → _>` or the retired `paw_points` (still parsed so an old map does not break, but the app never submits to or reads it: leave it out); values are 1–64 characters of `A–Z a–z 0–9 _ . : -`. Anything else is dropped silently, so a typo degrades that one board to personal records. A board that is in the map but missing in the dashboard is also treated as `unsupported` (classic API: `LEADERBOARD_NOT_FOUND` [uncertain]): the first call that gets that answer (a submit **or a read**) latches the board as missing for the session, `RankingProvider.supports(board)` turns false, and the ranking panel and the rankings hub show personal records instead of an empty "See top players" list (review FB2B-6, 2026-10-09).

**Every new event needs a new board and a new map entry**, in the same release as the event. The e2e build uses `e2e_*` names (`playwright.config.ts`; 2c: `period_points` → `e2e_period_points` and the three event boards, lead step I-1). `daily_fastest` belongs in the map only when `rank.dailyBoard` is turned on (§3).

## 2. Ad placements (Monetization Manager)

| Placement | Type | Used where | Notes |
|---|---|---|---|
| (existing) interstitial | Interstitial | `next_level`, `retry`, `daily_done`, new `event_next` | Unchanged pacing: from 10 completed levels, 60 s session grace, 120/100/90 s cooldown (§3.2). Owning No Ads turns it off. |
| (existing) rewarded | Rewarded video | `hint`, `kitty`, `revive`, new `group_double` | Unchanged. No Ads does not remove rewarded ads. |
| **new** banner | Banner | Home, the victory screen and the event screen only; never during play, the ranking panel, the boot screen or a full-screen overlay | From 10 completed levels, not on the first-run tutorial's victory screen, not with No Ads. Loaded at most every 60 s (ours; Meta's limit is reported as 45 s). The app reserves a 58 px band (50 px banner + 8 px, plus the safe-area inset) at the bottom of those screens, and primary buttons sit at least 16 px above it. |

The banner is used only when the SDK lists **both** `loadBannerAdAsync` and `hideBannerAdAsync` and both are functions, and the placement ID is set. A `CLIENT_UNSUPPORTED_OPERATION` from either call turns banners off for the rest of the session.

## 3. Leaderboards to create

Create these **global** (not context-scoped) leaderboards. Every score we post is an integer below 2³¹ where **higher is better**, so every board's sort order must be descending / "higher is better" wherever the dashboard asks. The app decodes the scores itself (`src/game/scoring.ts`), so the dashboard's score format only matters for FB's own surfaces: choose a plain integer format.

| Board key (`VITE_FB_LEADERBOARDS` key) | Suggested dashboard name | What it ranks | Score we post | Range |
|---|---|---|---|---|
| **`period_points`** (2c) | `fish_week_v1` | **THE leaderboard:** the fish kept this UTC week (Monday 00:00 UTC to the next Monday), summed over every counted level, daily and event win; one board for all weeks | `periodIndex × 100 000 + total` (fish-lives-spec §4.3); `periodIndex` = whole UTC weeks from `rank.periodEpoch` 2026-01-05, `total` ≤ 99 999 (`period.max`). This week (index 39) with 42 fish posts `3 900 042` | about 4 × 10⁶ in 2026; below 2³¹ until period index 21 473 (centuries of weeks) |
| `daily_fastest` | `daily_fastest` | Today's fastest daily solve; one board for all days. **Create only if `rank.dailyBoard` is turned on** (2c default: off; the code stays) | `dayIndex × 100 000 + (99 999 − secs)`; `dayIndex` = days from 2026-01-01 to the daily's date | about 1.1 × 10⁸ by 2028-12-31 |
| ~~`paw_points`~~ | — | **Retired in 2c: do not create.** The all-time paw points board is never submitted to or read from 2c on; pending scores for it are dropped by the save migration | — | — |
| `event_lantern_walk_2026` | `event_lantern_walk_2026` | Lantern Walk (2026-11-13 → 2026-11-27 UTC): solved, then least total time | `solved × 1 000 000 + (999 999 − min(totalSecs, 999 999))` | ≤ 21 999 999 |
| `event_snow_paws_2026` | `event_snow_paws_2026` | Snow Paws (2026-12-18 → 2027-01-08 UTC) | same as above | ≤ 21 999 999 |
| `event_yarn_hearts_2027` | `event_yarn_hearts_2027` | Yarn Hearts (2027-02-05 → 2027-02-19 UTC) | same as above | ≤ 21 999 999 |

Notes:

- **The period board is one global board with the week in the high digits** (fish-lives-spec §4.2), like `daily_fastest`. A per-week reset in the App Dashboard would be simpler, but a 2026-10-09 search found nothing about a reset period for Instant Games leaderboards [uncertain]; one board per week would need a new dashboard board and a new build every week. Both APIs keep a player's best score (L6), and a newer week's index is higher, so a player's first win of a new week replaces last week's entry and the total only grows within a week: "a total that resets". Because the weeks are **UTC**, every player shares one boundary, so this week's band sits at the **top** of the board; only devices whose clocks run ahead can post above it, and the readers page past them (below). If Phase 4 finds a dashboard reset option, the band still works (older bands simply disappear).
- **Changing `period.kind`** (`'day'`, `'week'`, `'month'`) changes what a period index means: create a **new** board (e.g. `fish_month_v1`) and point `period_points` at it in `VITE_FB_LEADERBOARDS`. Never reuse a board across kinds: old entries would decode into the wrong periods.
- **Which API serves them is not known** (§14 G1). The adapter probes, in order: the classic API (`getLeaderboardAsync`, boards created in the App Dashboard by name), then NEZP (`globalLeaderboards.*`, boards addressed by id; how ids are provisioned is unverified), then none. 2026-10-09 search summaries describe the NEZP `globalLeaderboards` API as the older way and say zero-permissions games should run their own backend for leaderboards; we have no backend, so if neither API is served, rankings stay on personal records (the spec's fallback).
- **`daily_fastest` is one board for every day, keyed to each player's local date** (spec §5.3), so a newer day outranks any older one: players in time zones ahead of you who already posted tomorrow's daily sit above every entry of your today, for most of each day on a worldwide audience (review FB2B-4, 2026-10-09). The readers handle it: the "Today" list and "Your rank" read the board from the top, page by page (`getEntriesAsync(50, offset)`, at most 4 pages, inside the 3 s deadline; NEZP has no offset and gets one read of 50), skip the entries above the shown day, keep that day's band, and number its rows #1, #2… by their position inside it. That is the true rank for the day, because every better entry of the day was read. The board's own rank (which counts other days) is never shown for the daily; when my entry is not inside the band that was read, the panel shows "Your score" without a rank. The list is honest but bounded: a band that starts more than 200 entries down shows the empty state. **Alternative for Phase 4** (needs no reader logic): per-day or per-week boards, or a daily keyed to one UTC date for everyone; decide when G1 is checked.
- **The period board is read the same way** (2c), and a band read stops as soon as it holds the rows it needs (the panel 50, the list 10), so a week whose band starts at the top costs one or two reads. Each band entry also carries the board's own rank (`RankEntry.boardRank`, classic `getRank()`, NEZP its position in the list), so **"Your rank" inside the week is exact at any depth** on the classic API: my board rank minus the entries above the band (`mine.rank − (band[0].boardRank − 1)`); the overlay list pins my row with that rank. NEZP has no "me", as before.
- The client submits at most every 10 s and never a solve under 3 s or over 24 h (spec §5.3). There is no server-side check: boards can be spoofed by a modified client. There are no rank-based prizes, by design.
- Names and photos of other players are shown only inside an FB overlay view (§5 below). Game code sees ids, ranks and scores only.

## 4. In-app products to create (Payments)

All three are **consumable** products (2c: `iap.catalog`). Product IDs are lowercase (Playgama's practice, followed). The game shows **our** names and descriptions (i18n `shop.product.<id>.*`), never the dashboard's text, and always the catalogue's localised `price` string. Prices are the default `[DECISION: default, user may change]` and are set **only** in the dashboard.

| productID | Our name (en) | Grants | Price (USD, default) |
|---|---|---|---|
| `remove_ads` | No Ads | Interstitials and banners off for good (kept in the save as `purchases.noAds`; the purchase itself is consumed at once) | 3.99 |
| `hints_15` | Bulb Bundle | +15 hints | 1.99 |
| `kitties_8` | Kitty Basket | +8 kitties | 1.99 |

**Retired in 2c (fish are lives, not a currency): `fish_250` (Fish Bucket) and `fish_900` (Fish Crate). Do not create them; if a test app has them, deactivate them.** The build still recognises them in a restore and compensates them (fish-lives-spec §5.3, `iap.retired`): an unconsumed `fish_250` grants 10 hints + 3 kitties and `fish_900` 30 hints + 15 kitties (the fish they gave, at the old 15 / 30 swap rates), recorded in the ledger once and then consumed. A ledger entry of one in an old save is compensated once by the save migration.

- **Create no other products.** The adapter's catalogue (`catalog()`) and `purchase()` take only the three ids on sale (`cfg.iap.catalog`): a retired product a test app still lists is never shown and never bought. Purchases found at boot (`purchases()`) also pass on the retired ids (`cfg.iap.retired`), so an old fish pack reaches the restore instead of staying unconsumed forever. A purchase of any other id could not be granted, so it is never surfaced (and never consumed).
- No subscriptions, no non-consumable type: not used (spec §8.2).
- Payments are offered on facebook.com and Android only. iOS is not eligible [05: confirmed]; on Messenger.com `payments.onReady` never fires [search: Meta docs]. 2c: the shop's only entry is Settings → Shop, shown only where the Buy section can show something (loading, an error with Retry, or the products), so iOS has no shop at all and Messenger.com shows the row only in the first `iap.readyTimeoutMs` (5 s) after the start, while the shop may still be getting ready (fish-lives-spec §5.2).
- Grant order (C's shop flow): record the token in the save, grant, save to the cloud with a flush, **then** consume. A purchase found unconsumed at boot is granted only if its token is not already recorded, and is always consumed. Refunds revoke nothing (accepted risk, spec §8.7).
- Purchases are client-trusted: `signedRequest` is not verified (no server).
- The tax, payout and Payments activation steps of the App Dashboard are outside this document (Phase 4 checklist, 05 §13).

## 5. Tournaments and overlay views

- **Tournaments (group challenges):** nothing to create. The game calls `tournament.createAsync` with `sortOrder: 'HIGHER_IS_BETTER'`, `scoreFormat: 'NUMERIC'`, an `endTime` 72 h ahead and `initialScore: 0`; FB's dialog handles sharing. The feature is behind the flag `groupChallenges`, **off** until §14 G2 confirms that FB policy allows rewards for taking part in a tournament.
- **Overlay views (leaderboard lists with names and photos):** nothing to create, as far as we know; whether the app needs a zero-permissions opt-in in the dashboard is [uncertain]. Our template is our own XML (`src/platform/fb/views/rank-list.ts`), styled inline, with no stylesheet file.

## 6. SDK behaviours our code relies on, and their status

Everything below except the [05: confirmed] rows is **unverified**. "If wrong" says what a player would see and what to change; in every case the code already falls back safely.

| # | Behaviour the code assumes | Where | Source | If wrong |
|---|---|---|---|---|
| B1 | `loadBannerAdAsync(placementID, position)` loads **and shows**; there is no show call | `fb-banner.ts` | (signature) [05: confirmed], [meta-plugin]; (load = show) [search: Meta docs] | A banner never appears, or needs a show call. G4. |
| B2 | Position value `'bottom'` | `cfg.ads.banner.position` | [uncertain] | A wrong value may reject (`INVALID_PARAM` → `error`, no banner) or show at the top. G4. |
| B3 | `hideBannerAdAsync()` removes the banner; we call it only after a load resolved | `fb-banner.ts` | [meta-plugin] | If a hide before any load is needed, change `hide()`. G4. |
| B4 | One load per 45 s, else `RATE_LIMITED`; the app waits 60 s anyway | stub, `banner-flow.ts` | [search: Meta docs] | Fewer banners than possible, nothing worse. G4. |
| B5 | The banner is 50 dp tall, overlays the bottom of the webview, does not resize it | reserve `ads.banner.reservePx` 58 | [search: Meta docs] | Overlap with the bottom band, or a wasted band. Lead adjusts the config value. G4. |
| B6 | `getSupportedAPIs()` lists `loadBannerAdAsync`, `hideBannerAdAsync`, `getLeaderboardAsync`, `globalLeaderboards.setScoreAsync`, `globalLeaderboards.getTopEntriesAsync`, `overlayViews.createOverlayViewWithXMLString`, `tournament.createAsync`, `tournament.postScoreAsync`, `getTournamentAsync`, `payments.purchaseAsync` under exactly these names | `fb-probe.ts` (`FB_2B_API`) | names follow the `namespace.method` form of `player.setDataAsync` [05: confirmed]; the 2b names are [uncertain] | That feature stays off (fallback). Fix the string in `FB_2B_API`. G1–G5. |
| L1 | Classic `getLeaderboardAsync(name)` exists in 8.0 | `fb-ranking.ts` | [search: Meta docs] (current guide); a third-party 8.0 adapter dropped it in 2025 | The probe falls through to NEZP or none. G1. |
| L2 | Classic `setScoreAsync(score)` keeps the better score and answers the stored entry, so a lower answer means "not improved" | `fb-ranking.ts` | 7.1 behaviour, [uncertain] in 8.0 | A non-improving score reports `ok`; harmless (C's pending queue only). G1. |
| L3 | Classic entries: `getRank()`, `getScore()`, `getPlayer().getID()`; `getPlayerEntryAsync()` gives my entry or null; `getEntriesAsync(count, offset)` sorted best first. 2c: `getRank()` is the entry's rank **on the whole board** (it becomes `RankEntry.boardRank` on band reads), and `getPlayerEntryAsync()`'s rank counts the same way | `fb-ranking.ts` | 7.1 shape, [uncertain] in 8.0 | Entries without a valid rank or score are dropped (never patched): the list shows fewer rows or personal records. If `getRank()` counted inside a page, "Your rank" in a band would be off: the reader would then need the 2b position search only. G1. |
| L4 | `LEADERBOARD_NOT_FOUND` for a board that is not in the dashboard | `mapSubmitError` | [uncertain] | Shows as `error` instead of `unsupported`: C keeps retrying the pending score on later wins. G1. |
| L5 | NEZP: `globalLeaderboards.setScoreAsync(id, score)`, `getTopEntriesAsync(id, n)`; entries carry `getScore()` and `getPlayer().getSessionID()`, no rank, no way to tell "me"; `LEADERBOARD_SCORE_NOT_IMPROVED` when not better | `fb-ranking.ts` | [05: likely], [search: Meta docs] (session ids, `getScore`); the error code is third-party only | Ranks are positions in the API's list. G1. |
| L6 | (2c) Both APIs keep **one best score per player** on a board (as L2 / L5 assume), so the period band works: a new week's first win replaces last week's entry (a higher index), and within a week the total only grows. Devices whose clocks run ahead post into a later band, above the current one | `fb-ranking.ts` band reads, `period_points` | [uncertain] (same basis as L2, L5) | If a board kept every score, or kept the latest instead of the best, a player could appear in several bands or drop out of this week: the band reader still shows only this week's entries, but "Your rank" could be missing. Then use one board per period (§3 note). G1. |
| O1 | `overlayViews.createOverlayViewWithXMLString(xml, css, data, onLoad, onError, basePath)` returns the view (or a promise of it); the game appends `view.iframeElement` itself; `onLoad` fires once loaded; then `showAsync()`; `dismissAsync()` hides; `data` is a JSON string | `fb-overlay-views.ts` | (signature) [05: confirmed]; (mounting, data as string) [meta-sample] | The list never shows: `showList` answers null and the panel shows "Your rank" / "Your score" instead. G3. |
| O2 | The `css` argument may be empty (Meta's sample passes a stylesheet **path**); our XML is styled inline | `views/rank-list.ts` | [uncertain] | If a path is required, ship a stylesheet file and pass its path. G3. |
| O3 | Binding syntax: `{{FBInstant.player.name}}`, `{{FBInstant.player.photo}}` for me; `{{FBInstant.player.friends[{{row.id}}].name}}` / `.photo` for others; `For source/itemName/sortKey`, `If` + `Condition lhs/operator="EQUALS"/rhs` + `Else`, `onTapEvent` | `views/rank-list.ts` (`PLAYER_BINDING`) | [meta-sample] for every form; **how to bind a non-friend's name from a leaderboard id is not documented in anything we could read** | Other players' rows may show no name or photo (rank and score always show). Fix `PLAYER_BINDING`. G3. |
| O4 | `For` sorts ascending by `sortKey` by default (we pass a position field) | `views/rank-list.ts` | [uncertain] | The list shows in reverse order: add `order` or invert the field. G3. |
| O5 | Taps inside a view reach the game only as `setCustomEventHandler((event, viewId) => …)` custom events | `fb-overlay-views.ts` | [meta-plugin], [meta-sample] | Our own close button outside the iframe and Esc still close the full-screen list. G3. |
| O6 | A view can be placed inside a rect by sizing the host element we append it to | `fb-overlay-views.ts` | [meta-sample] (the sample positions the iframe itself) | Stays off: `cfg.rank.overlayPlacement` is `'fullscreen'` until G3; then the lead flips it to `'rect'`. |
| T1 | `tournament.createAsync({ initialScore, config: { title, sortOrder, scoreFormat, endTime } })` opens FB's dialog; rejects when the player is already in a tournament | `fb-groups.ts` | [05: likely], [meta-plugin] (the plugin passes score, config and data), [search: Meta docs] | `create()` answers null; the hub shows nothing new. G2. |
| T2 | `getTournamentAsync()` (top level) gives the current context's tournament and rejects outside one; `getEndTime()` is unix **seconds** | `fb-groups.ts` | [meta-plugin] (top-level call); [uncertain] (rejection, units) | Wins are not counted for a challenge, or a wrong end time. G2. |
| T3 | `tournament.postScoreAsync(score)` posts to the current context's tournament without a dialog | `fb-groups.ts` | [search: Meta docs] | A failed post is not retried; the next win posts the higher total. G2. |
| T4 | No API returns tournament standings to game code | (no `standings`) | [search: Meta docs] | If one exists, implement `GroupProvider.standings` and allow `groups.rewardMode: 'rank'`. G2. |
| P1 | `payments.onReady(cb)` fires once payments work, and never where they do not (Messenger.com) | `fb-payments.ts` | [search: Meta docs] | The shop shows "Getting the shop ready…" for 5 s, then "Purchases aren't available here". G5. |
| P2 | `payments.purchaseAsync` rejects before `startGameAsync` | — | [05: confirmed] | — |
| P3 | Catalogue rows carry `productID`, `price` (localised string), `priceCurrencyCode` | `toProduct` | [meta-plugin], [meta-sample] | Rows without a price are dropped. G5. |
| P4 | Purchases carry `productID`, `purchaseToken`, `paymentID`, `purchaseTime` (unix seconds, string or number), `developerPayload`, `paymentActionType` (`charge` / `refund`), `isConsumed` | `toPurchase` | [05: likely], [meta-plugin], [meta-sample] (seconds) | Purchases without our id or a token are ignored; consumed ones and non-charges are never granted. G5. |
| P5 | `consumePurchaseAsync(purchaseToken)` takes the token (the Unity plugin names the parameter `productId`, Meta's JS sample passes the token) | `fb-payments.ts` | [meta-sample] | Consume fails (false): the purchase stays unconsumed; the ledger prevents a second grant. G5. |
| P6 | Error codes `USER_INPUT` (cancel), `PAYMENTS_NOT_INITIALIZED`, `NETWORK_FAILURE`, `INVALID_PARAM`, `INVALID_OPERATION` | `mapPurchaseError` | [search: Meta docs] | An unknown code is a plain `error` toast. G5. |
| P7 | Granting before consuming is accepted; an unconsumed purchase does not break `getPurchasesAsync` | C's `shop-flow.ts`; `iap.grantBeforeConsume` | [search: Meta docs] (contradictory), [search: Meta forum] (single report) | Lead flips `iap.grantBeforeConsume` / `iap.removeAdsMode`. G5. |
| P8 | `getPlatform()` is `'IOS'` on iOS, and iOS is not eligible for payments | `fb-probe.ts` | [05: confirmed] | — |

## 7. Builds and zips (spec §6.7, §11)

| Purpose | Commands | Output |
|---|---|---|
| **Production** (only `i18n.releaseLocales`, default English) | `npm run build:release`, then `npm run zip:fbig` | `dist-zip/<name>-fbig-<version>-<sha>.zip` from `dist/release-fbig`. The zip is refused if the build holds any locale chunk outside `i18n.releaseLocales`, or the e2e test hooks. |
| Preview on FB (all 17 locales) | `npm run build:fbig`, then `npm run zip:fbig -- --preview` | `dist-zip/<name>-fbig-preview-<version>-<sha>.zip` from `dist/fbig`. Never picked by `upload:fbig` unless `--preview` is passed. |
| Budgets | `npm run size` (dist/web, dist/fbig, dist/release-web, dist/release-fbig when present) | The 2b ceilings in [04 §9](../phase1/04-architecture.md) (measured + about 3 %, 2026-10-09, re-set after the review fixes): main JS 279 KB, first-load CSS 43.5 KB, first load 340 KB (365 KB with one locale chunk; 126.5 KB gzipped), core lazy JS 74 KB, optional lazy JS (events + fb-social + social-flows) 29.3 KB, lazy CSS 31.2 KB, each locale chunk 28 KB, FB files 100 (platform cap 500); zip 750 KB warns, over 1 MB refused. |

## 8. Phase 4 checklist (dashboard side)

- [ ] Banner placement created; ID in `VITE_FB_PLACEMENT_BANNER`; G4 items B1–B5 checked on facebook.com, Android and iOS.
- [ ] Leaderboard API identified (G1); the boards created with "higher is better": **one period board** (`fish_week_v1` for `period_points`) and the event boards; **no** `paw_points`, and `daily_fastest` only if `rank.dailyBoard` is turned on (2c); L6 (best score per player) checked with two posts in two weeks; `VITE_FB_LEADERBOARDS` set; the probe strings (B6) checked against `getSupportedAPIs()` on a device.
- [ ] Overlay views: binding syntax for other players' names (O3), placement (O6) and taps (O5) checked (G3); `rank.overlayPlacement` flipped to `'rect'` only after.
- [ ] Tournaments: G2 items T1–T4 and the reward policy; `groupChallenges` stays off until then.
- [ ] The three products (`remove_ads`, `hints_15`, `kitties_8`) created with the default prices; `fish_250` / `fish_900` not created (deactivated in a test app that has them); P1–P7 checked with a test purchase on facebook.com and Android, including a refund (G5).
- [ ] Interstitial frequency policy vs. 120/100/90 s (G6).
