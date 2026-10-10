# Phase 2e platform research: what Facebook Instant Games allows for the five requested features

Status: research note, read-only (no repo files changed) · Checked: **2026-10-10** · Repo state: `claude/mewdoku-instant` @ 9b171ed · For: Phase 2e spec (leaderboards, ads, IAP, daily streak, daily challenge "same as Meowdoku")

Compared against (repo paths): `docs/phase1/05-fbig-platform.md`, `docs/phase2b/fb-dashboard.md` §6 (B/L/O/T/P rows), `docs/phase2b/parity-spec.md` §3, §5.2, §8.2, §14, `src/platform/fb/*`, `src/app/config.ts` (`ads`, `iap`).

---

## 0. How this was researched and how far to trust it

| Source kind | Access on 2026-10-10 | Tag used below |
|---|---|---|
| `developers.facebook.com`, `developers.secure.facebook.com` | **Blocked** for direct fetch: egress proxy answered `403` to CONNECT (`connect_rejected`), WebFetch gave `ENOTFOUND`. The same holds for `docs.unity3d.com`, `web.archive.org`, `context7.com`, `ppc.land`. | — |
| Search-engine summaries of Meta's pages (WebSearch, standard and extended) | Worked. The summaries quote Meta's current `developers.facebook.com/documentation/games/...` pages, but they are **second-hand** and sometimes disagree between runs. | **[S]** = one search summary; **[S×2]** = two or more independent searches agreed |
| Meta's own GitHub repos, cloned 2026-10-10 into the scratchpad | Worked (read first-hand). `facebook/meta-instant-games-unity-plugin` HEAD `ec32ba7` (2026-06-01, no newer commit); `fbsamples/fbinstant-nezp-samples` HEAD `2e2c2eb` (2026-04-29); `fbsamples/fbinstant-samples` (last commit 2021-02-10, stale). | **[meta-gh]** |
| Third-party code, read first-hand | `playgama/bridge` HEAD `e33dc66` (2026-10-07), `src/platform-bridges/FacebookPlatformBridge.ts`; `@types/facebook-instant-games` 7.1.6 from npm (copies Meta's 7.1 reference text). | **[pg]**, **[dt]** |
| Trade press | PocketGamer.biz, Softgames, Zynga help pages (via search) | **[press]** |

Everything tagged [S] must be re-read on the live page before production; that is the same rule as the existing gates G1–G8. The clean-room list in 06 §4 was respected: none of those sources was opened.

---

## 1. Headline findings (what changes the plan)

1. **Banner ads are being retired on Instant Games.** Meta's banner and in-app-ads pages: impressions "gradually decrease" from **April 2026**, **full deprecation by 2027-03-31**, after which banners are no longer served; no code change needed (slots just fill less); Meta recommends rewarded video and/or IAP instead. [S×2: in-app-ads overview, banner-ads page, 2026-10-10] Combined with Meta's standing guidance to **hide banners during active gameplay** [S×2], the user's item 2a ("banner during level, always there") is against Meta's guidance **and** buys a format with falling fill and a hard end date. Our code already handles "no banner" safely (B-rows), so nothing breaks; the band we reserve on the game screen is the main cost.
2. **Global leaderboards appear to be gone.** Meta's current leaderboards page (as summarised by search) says global leaderboards were "completely removed on December 31, 2025 with no replacement APIs; all calls to global leaderboard APIs will immediately reject", and that only **contextual** leaderboards (one instance per context, name = `<board>.<contextID>`) remain. [S, single summary of `documentation/games/retain/leaderboards`; four follow-up searches could not re-find the sentence] It fits everything else we know: Meta's 2026 Unity plugin (v8.0) wraps **no** leaderboard API at all [meta-gh], the NEZP `globalLeaderboards` page was already described as "the older way" with a hint to use your own backend (fb-dashboard §3, 2026-10-09), and a developer report of "global leaderboard service deprecated" dates back to 2020. **A Meowdoku-style weekly worldwide board cannot be built on FB APIs** if this holds; our adapter would fall back to personal records (L-rows), but see risk R-L2: one latch only covers `LEADERBOARD_NOT_FOUND`.
3. **IAP works on iOS now.** Meta's IAP page: "From Sep 16, 2024, In-App Purchase functionality is now supported in the native Facebook iOS app"; IAP runs on web, iOS and Android. [S×2 + press: PocketGamer.biz, Softgames] Our probe **switches payments off on iOS** (`fb-probe.ts paymentsSupported`: `platform === 'IOS'` → false), based on the Unity plugin's `PurchasePlatform.APPLE // Not eligible` comment, which looks like stale enum text. For item 3 ("buy helpers during play") that excludes the iOS FB app, likely the largest single audience. Conflict to settle: an older line of the launch checklist says iOS users must not see "any payments functionality" [S]. New gate G10.
4. **IAP needs Audience Network approval even with no ads, plus an IAP review.** Meta: Instant Games "require Meta Audience Network approval and must pass an In-App Purchase review"; the review asks for a description of the items and screenshots or a video of the purchase flow, takes "a few business days"; business verification and a payout account are prerequisites. Payments are not available on Messenger.com. [S×2]
5. **Zero Permissions (NEZP) is mandatory for us.** All Instant Games created on or after 2025-08-01 must use Zero Permissions (SDK 8.0); older games had until 2026-09-30; Facebook Web Games (Canvas) sunset 2026-09-30. [S×2 + press; Meta blog post 2025-07-31] We already pin `fbinstant.8.0.js` and show names only in overlay views, so this matches; it also means the "standard" (permissioned) APIs some older tutorials rely on are not an option.
6. **No backend-free way to send daily-streak reminders was confirmed.** Meta documents an **A2U** (app-to-user) notifications API that is sent **from your server** with an app access token (title 1–30 chars, body 10–180, up to 5 per user, within 10 days of the last open) and a "Notification Service" page whose content we could not read [S]. Messenger bot subscription (`player.canSubscribeBotAsync` / `subscribeBotAsync`) is still in the API surface (Meta Unity v7 docs; Playgama's 2026 FB bridge calls it) but a bot needs a webhook server. Custom updates (`updateAsync`, one per context session, `PUSH`/`NO_PUSH`) exist but only into the current context. New gate G9.
7. **Smaller corrections.** Rewarded interstitial API removed from the SDK in April 2026 [S] (we never used it); `ADS_NO_FILL` → Meta says retry after **30–60 s**, never in a tight loop; `ADS_FREQUENT_LOAD` → wait **≥ 30 s between loads of the same placement** [S×2]. Our first reload backoff step is **5 s**, and every rewarded use (hint, kitty, mouse, revive, group_double) shares **one** placement ID, so back-to-back videos can trip `ADS_FREQUENT_LOAD` (R-A3). The old `developers.facebook.com/docs/games/...` SDK reference "will be deprecated by end of June 2026"; links in 05 should move to `/documentation/games/...`.

---

## 2. Platform-wide context (affects all five features)

| Fact | Source (checked 2026-10-10) | Conf. |
|---|---|---|
| SDK 8.0 is the latest; its changelog entry is "Only for Zero Permission Games": overlay-views module added, profile picture and name APIs removed. | https://developers.facebook.com/docs/games/build/instant-games/reference/instant-games-sdk/ [S×2] | likely |
| That reference page "will be deprecated by end of June, 2026"; current docs live under `https://developers.facebook.com/documentation/games` (overview last updated 2026-03-03 per the summary) with sections Build, Retain, Monetize, Tools, and a changelog at `/documentation/games/whats-new/changelog/`. | same + https://developers.facebook.com/documentation/games [S×2] | likely |
| New Instant Games (created ≥ 2025-08-01) must use Zero Permissions; standard connection ended 2026-09-30 for older ones; Web Games sunset 2026-09-30. | https://developers.facebook.com/blog/post/2025/07/31/web-and-instant-games-changes/ ; https://ppc.land/meta-announces-web-games-sunset-by-september-2026/ ; Zynga help pages [S×2, press] | likely |
| Unity marks its Facebook Instant Games support deprecated in Unity 6.3 ("not recommended for production"), removal in 6.4; the Unity C# SDK package 1.3.1 / 2.0.1 carry a deprecation notice. | https://docs.unity3d.com/Manual/instant-games.html ; https://discussions.unity.com/t/deprecation-notice-unity-support-for-facebook-instant-games/1694214 [S] | likely |
| Meta's own Unity plugin for SDK 8.0 had its last commit on 2026-06-01; it wraps ads (interstitial, rewarded video, rewarded interstitial, banner), payments, tournaments, context, share/invite/custom update, bot subscription, overlay views; **no leaderboard API**. | `facebook/meta-instant-games-unity-plugin` `documentation/API_REFERENCE.md`, `Runtime/Plugins/*.cs` [meta-gh] | confirmed (what the plugin wraps) |
| Launch checklist: business association + verification; **Apple Developer Team ID** required to distribute on iOS (App Store Review Guideline 4.7); initial download ≤ 3 MB (≤ 1 MB for "lightweight" games); iOS users must not see cross-promotion of other instant games or gifting to friends (and, in older wording, no payments functionality). | https://developers.facebook.com/docs/games/build/instant-games/get-started/launch-checklist [S] | likely (parts may be stale) |

**Platform health signal.** Meta keeps shipping docs (2026-03 update, banner FAQ) but is also removing features (global leaderboards, banners, rewarded interstitial, Canvas). Unity is dropping its integration. Plan for a shrinking API surface; keep every FB feature behind feature detection and a fallback, as the code already does.

---

## 3. Ads

### 3.1 Facts

| # | Fact | Source (2026-10-10) | Conf. |
|---|---|---|---|
| A1 | **Banner deprecation**: impressions decline from April 2026 (slowly, then faster), full deprecation 2027-03-31; no code changes needed; replace with rewarded video and/or IAP. Players who bought "Ad-Free"/"Remove Ads" must not be shown banners "or any other ads" (wording as summarised). | https://developers.facebook.com/documentation/games/monetize/in-app-ads/banner-ads (and `.md`); https://developers.facebook.com/documentation/games/monetize/in-app-ads/overview [S×2] | likely |
| A2 | `loadBannerAdAsync(placementID, position)` **loads and shows**; no separate show; `hideBannerAdAsync()` hides. Banners need SDK ≥ 7.0; 7.1 added "top banner ads". | banner-ads page [S×2]; 7.1 changelog [S]; `FBInstant.cs LoadBannerAdAsync(bannerId, position)` [meta-gh] | confirmed (signature), likely (semantics) |
| A3 | Meta's own sample passes **`"bottom"`** as the position. | `Runtime/Scripts/PluginExample.cs` line 346 [meta-gh] | confirmed (sample usage) |
| A4 | 45 s rate limit on `loadBannerAdAsync`, `RATE_LIMITED` inside it. Size "50 dp, full width" on one page, "typically 50–60 px" on another. | banner-ads page [S×2] | likely |
| A5 | Placement: **hide banners when gameplay begins**, show on menus, level select, leaderboards, pause, results; target non-paying players. | https://developers.facebook.com/documentation/games/monetize/best-practices [S×2] | likely (guidance, not a stated enforcement rule) |
| A6 | Interstitials at natural breaks (between levels, after game over); rewarded at player-initiated moments (extra lives, hints, continue). Suggested model: interstitial + banner for all, rewarded opt-in, "Remove Ads" one-time purchase after several sessions that removes interstitials and banners (rewarded stays). | best-practices page [S] | likely |
| A7 | No published numeric interstitial frequency cap was found (searches for seconds-between-ads came back empty). | — | unknown |
| A8 | `ADS_NO_FILL`: normal; retry after **30–60 s**, never in a tight loop; Meta's sample handler gives up after 3 tries 30 s apart for the session. Typical fill 90–99 % in major markets, lower elsewhere; low in development mode. Revenue share ≈ 70/30. | https://developers.facebook.com/documentation/games/monetize/in-app-ads/interstitial-ads ; in-app-ads overview; https://developers.facebook.com/documentation/games/tools/monetization-manager [S×2] | likely |
| A9 | `ADS_FREQUENT_LOAD`: wait **≥ 30 s between load requests for the same placement**. | in-app-ads overview error table [S] | likely |
| A10 | `ADS_TOO_MANY_INSTANCES`: about 3+ preloaded unshown instances make new ones fail until one is shown. | `getInterstitialAdAsync`/`getRewardedVideoAsync` @throws [dt]; https://forum.defold.com/t/facebook-instant-games-ads-not-loading-more-than-once/43392 (2019) | confirmed (code exists), inferred (threshold) |
| A11 | Rewarded **interstitial** API fully removed from FBInstant in April 2026. | banner/IAA pages as summarised [S] | likely |
| A12 | Setup: add the Audience Network product, get the app **approved by Audience Network**, create placements (Interstitial / Rewarded video / Banner, platform Instant Games) in Monetization Manager; **no ads are served until payout info is added**; payout needs a financial admin who is also a property manager, a USD-capable bank account and a tax ID; new properties are reviewed (≈ 72 h for AN apps generally). | https://www.facebook.com/business/help/355647874927053 ; https://www.facebook.com/help/publisher/103628146695524 ; https://en-gb.facebook.com/business/help/331129351478041 [S] | likely |

### 3.2 Our adapter vs the facts

| Our code / doc | Fact | Verdict |
|---|---|---|
| `fb-banner.ts`: load = show, hide only after a resolved load, `'bottom'`, 45 s handled by a 60 s window (`ads.banner.minReloadSec`), both APIs required (B1–B5). | A2–A4 | **Matches.** B2 (`'bottom'`) is now backed by Meta's own sample (A3). |
| `ads.banner.duringPlay: true` (Phase 2d, B7): banner on the game screen during play. | A1, A5 | **Mismatch with Meta guidance** (was already a known risk) **plus** the format is being retired (new). |
| `ads.banner.*` still reserves a 50 px band on the game screen from mount. | A1 | The band will be empty more and more often in 2026–27; after 2027-03-31 always. |
| `remove_ads` removes interstitials and banners; rewarded stays (parity-spec §3.2, fb-dashboard §4). | A1 "or any other ads", A6 rewarded stays opt-in | Probably fine (rewarded is opt-in in A6); re-read A1's exact wording (G4). |
| `fb-ads.ts`: one preloaded instance per kind, new instance after every show/failure; error mapping `ADS_NO_FILL→no_fill`, `ADS_FREQUENT_LOAD/RATE_LIMITED→rate_limited`, `ADS_NOT_LOADED→not_ready`, `CLIENT_UNSUPPORTED_OPERATION→unsupported` latch. | A8–A10 | **Matches.** |
| `ads.reloadDelaysMs: [5000, 30000, 120000]`; `show()` reloads **at once** after every show (`void load(slot)`). | A8 (30–60 s after no fill), A9 (≥ 30 s between loads of a placement) | **Mismatch (R-A3).** First retry 5 s is below Meta's floor; an immediate reload after a short/skipped rewarded video can land < 30 s after the previous load of the same placement. Harmless (maps to `rate_limited`, backoff) but wastes calls and may cost fill. |
| `VITE_FB_PLACEMENT_REWARDED`: **one ID** for `hint`, `kitty`, `revive`, `group_double`, `mouse`. | A9 is per placement; Meta suggests eCPM tracking per placement | Risk R-A4: separate placement IDs per use would avoid A9 collisions and give per-placement eCPM. |
| `fbinstant.d.ts` has no `getRewardedInterstitialAsync`; 05 §6.1 lists it as "Not used". | A11 | Matches; 05's table should say "removed April 2026". |
| Interstitial gate: ≥ 10 completed levels, 60 s session grace, cooldown 120/100/90 s by tenure, rewarded resets the clock (`ads.interstitial`). | A6, A7 | Allowed (natural breaks). No Meta cap found, so "after every level" is a game-design choice, not a platform limit; only A9 (≥ 30 s between loads) and possible `RATE_LIMITED` bound it technically. |
| Rewarded: grant only when `showAsync()` resolves; free fallback when unsupported. | A6 | Matches the "player-initiated" rule. Offering a video when "out of helpers" is the textbook use. |

### 3.3 What this means for the user's item 2

- **2a Banner during level, always there.** Technically possible today (our 2d build does it), but (1) Meta's guidance says not during active gameplay (review/monetisation risk B7), (2) banner fill is declining since April 2026 and stops on 2027-03-31. Recommendation for the spec: keep `ads.banner.duringPlay` as a switch but default it to **off** for FB, or keep it on knowing it earns little and ends in under six months; in both cases do not spend layout on it after 2027-03-31 (plan a config flip, `ads.banner.enabled: false`). **Decision for the user.**
- **2b Interstitial after every level from level N.** Allowed. Use ≥ 30 s spacing between loads; keep the "never during the win flow" rule; Meta gives no number, so the cadence is ours.
- **2c Rewarded when out of helpers.** Allowed and recommended by Meta. Use a dedicated placement per helper if possible; respect ≥ 30 s between loads per placement.

---

## 4. In-app purchases

### 4.1 Facts

| # | Fact | Source (2026-10-10) | Conf. |
|---|---|---|---|
| P-a | API: `payments.onReady(cb)`, `getCatalogAsync()`, `purchaseAsync({productID, developerPayload})`, `getPurchasesAsync()` (unconsumed purchases; Meta's NEZP sample also renders entries with `isConsumed`), `consumePurchaseAsync(purchaseToken)`. Purchase fields: `developerPayload, isConsumed, paymentActionType ('charge'/'refund'), paymentID, productID, purchasePlatform, purchasePrice, purchaseTime (unix, string), purchaseToken, signedRequest`. | `Payment.cs`, `UtilClasses/Purchase.cs`, `Product.cs` [meta-gh]; `nezp_sample_xmls_picker/main.js` lines 232–416 [meta-gh] | confirmed (shape) |
| P-b | **Platforms**: web (facebook.com), Android FB app, and **iOS FB app since 2024-09-16**. **Not Messenger.com.** | https://developers.facebook.com/documentation/games/monetize/in-app-purchases ; https://developers.secure.facebook.com/docs/games/monetization/in-app-purchases/instant-games ; https://www.facebook.com/business/help/472362043174078 [S×2]; https://www.pocketgamer.biz/metas-in-app-purchases-bring-instant-games-to-ios/ , https://www.softgames.com/instant-games-iap-on-ios/ [press] | likely (iOS), likely (Messenger.com no) |
| P-c | Conflicting older text: `PurchasePlatform.APPLE // Not eligible` in Meta's plugin; launch checklist "for iOS users ... should not show any payments functionality". | `UtilClasses/PurchasePlatform.cs` [meta-gh]; launch checklist [S] | likely stale (predates 2024-09-16) — verify |
| P-d | Prerequisites: **Audience Network approval even without ads**; IAP review requested under App Dashboard → Instant Games → In-App Purchases, with a description of the items and how they fit the game plus screenshots/video of the purchase flow; "a few business days" (checklist: under a week); test purchases possible meanwhile; at least one product registered; business-verified account (a Cocos forum fix needed a verified business). | IAP pages above [S×2]; https://forum.cocosengine.org/t/facebook-instant-games-inapps/44946 | likely |
| P-e | Order: Meta's reference wording (mirrored by Unity's Meta package and Gideros) says **request consumption before provisioning**, then grant immediately on success; call `getPurchasesAsync` as soon as payments are ready to process leftovers. | Unity package docs `Meta.InstantGames.Payments` [S]; https://wiki.giderosmobile.com/index.php/FBInstant.payments.getPurchasesAsync [S] | likely |
| P-f | Product types: only consumable-style purchases + game-side `consumePurchaseAsync` were found; **no non-consumable or subscription type** in the 7.1 typings or Meta's 2026 plugin. | [dt] 7.1.6 (no `subscri*`), [meta-gh] | likely (absence) |
| P-g | `purchaseAsync` rejects before `startGameAsync`. | [dt] (05: confirmed) | confirmed |

### 4.2 Our adapter vs the facts

| Our code / doc | Fact | Verdict |
|---|---|---|
| `fb-probe.ts paymentsSupported`: false when `getPlatform() === 'IOS'`; fb-dashboard P8 "[05: confirmed] iOS not eligible"; 05 §9 "iOS is not eligible". | P-b | **Mismatch (R-P1, high).** iOS has had IAP since 2024-09-16. The probe should rely on `getSupportedAPIs()` + `onReady` (which already handles Messenger.com) and not hard-code iOS out — **after** G10 confirms it and the launch-checklist iOS rule (P-c) is cleared. |
| `toPurchase` drops `isConsumed === true` and non-`charge` entries; `consume(token)` passes the token. | P-a | Matches (the NEZP sample also consumes by token and shows consumed entries in `getPurchasesAsync`). |
| Grant order: record token → grant → flush save → `consumePurchaseAsync` (`iap.grantBeforeConsume: true`). | P-e | **Differs from Meta's wording** (consume first). Our ledger makes either order idempotent, so it is safe; but IAP review may test the documented order. Keep the switch; mention in the review notes. (G5 already lists it.) |
| `remove_ads` is consumed and kept as a save entitlement; no non-consumable relied on. | P-f | Matches. |
| Shop entry is Settings → Shop only; purchases not offered in play. | user item 3 | **Gap** (app layer, not platform): the platform allows `purchaseAsync` at any time after start. The game must pause its timer while FB's payment dialog is up (whether `onPause` fires is unknown). |
| `fb-dashboard §4` products: `remove_ads`, `hints_15`, `kitties_8` (consumable, lowercase ids). | P-d | Fine; the IAP review needs the item descriptions and a recording of the purchase flow (add to the Phase 4 checklist). A "mouse" helper pack would be a new product id. |
| `signedRequest` not verified (no server). | — | Accepted risk (unchanged). |

### 4.3 What this means for the user's item 3 ("buy helpers during play")

Platform-wise allowed on facebook.com, Android and (very likely) iOS; not on Messenger.com. Blockers are administrative: Audience Network approval, business verification, payout/tax setup, IAP review with a recording of the in-play purchase flow. Code change needed in the probe for iOS once G10 is confirmed.

---

## 5. Leaderboards

### 5.1 Facts

| # | Fact | Source (2026-10-10) | Conf. |
|---|---|---|---|
| L-a | **Global leaderboards removed 2025-12-31, no replacement APIs, calls reject.** Contextual leaderboards remain: each context gets its own instance; name the board `<name>.<contextID>`; scores can only be set from that context; "not supported in Messenger Lightspeed"; boards cannot be deleted. | https://developers.facebook.com/documentation/games/retain/leaderboards [S, single summary — could not be reproduced in 4 follow-up searches] | **likely, single-source** |
| L-b | Classic API shape (7.1): `getLeaderboardAsync(name)`; `setScoreAsync(score, extraData?)` (64-bit int, keeps the better score, `LEADERBOARD_WRONG_CONTEXT`, `RATE_LIMITED`); `getEntriesAsync(count ≤ 100, offset)`; `getPlayerEntryAsync()`; `getConnectedPlayerEntriesAsync`; `getContextID()` null for global boards. | [dt] 7.1.6 lines 925–990 | confirmed (7.1 text) |
| L-c | Meta's 2026 Unity plugin (SDK 8.0) has **no** leaderboard wrapper; Unity's separate C# package 1.3.0 (2025-10-20) *added* `Leaderboard.GetEntriesAsync` for SDK 7.x. | [meta-gh]; https://docs.unity3d.com/Packages/com.unity.meta-instant-games-sdk@1.3/changelog/CHANGELOG.html [S] | confirmed / likely |
| L-d | NEZP `globalLeaderboards.setScoreAsync/getTopEntriesAsync` (session ids, no "me") is still called by Playgama's FB bridge (code last touched 2026-06-17). That is evidence of code, not of a working service. | [pg] lines 425–490 | confirmed (code exists) |
| L-e | Under NEZP, other players' names/photos only render inside overlay views. Meta's NEZP leaderboard sample binds **only the current player's** name/photo (`{{FBInstant.player.name}}`) and uses anonymous local icons and data-supplied names for every other row. | `ig_views/leaderboard_list.xml` [meta-gh] | confirmed (sample) |
| L-f | **Tournaments** are the leaderboard surface Meta still wraps in 2026: `tournament.createAsync({initialScore, config, data})` with config `title` (no user names), `sortOrder`, `scoreFormat` (`NUMERIC`/`TIME`), `endTime` (unix; default one week), `forceScoreValidation`, score-range validation, `tournamentType` (`DEEP` default or `COLLABORATIVE` with a `goal`), `image`; `getTournamentsAsync`, `joinAsync(id)`, `postScoreAsync(score)` (only inside a tournament context, rate-limited), `shareAsync`, top-level `getTournamentAsync()`. Standings are shown in FB's own UI; no standings API found. | `Tournament.cs`, `UtilClasses/CreateTournamentConfig.cs` [meta-gh]; Unity 1.3 docs [S] | confirmed (shape) |

### 5.2 Our adapter vs the facts

| Our code / doc | Fact | Verdict |
|---|---|---|
| `fb-ranking.ts` probe: classic `getLeaderboardAsync` on **global** dashboard boards, then NEZP `globalLeaderboards.*`, else none; `period_points` (weekly band board), `daily_fastest`, three event boards, all **global** (fb-dashboard §3 "Create these global (not context-scoped) leaderboards"). | L-a | **Mismatch (R-L1, high, single-source).** If L-a holds, every board we planned is a global board and will reject; the "Meowdoku" weekly worldwide ranking has no FB-native implementation. The code falls back to personal records, so nothing crashes. |
| Missing-board latch: `note()` latches a board as missing only on `LEADERBOARD_NOT_FOUND`; `mapSubmitError` maps `CLIENT_UNSUPPORTED_OPERATION` to `unsupported` but does not latch. | L-a ("calls reject", code unknown) | **Risk (R-L2, medium).** If removed boards reject with another code (`INVALID_OPERATION`, `CLIENT_UNSUPPORTED_OPERATION`, a generic error), `supports(board)` stays true: the Home trophy shows, every panel open costs a failing call inside the 3 s deadline, and C's pending score is retried after every win. Latching on any non-network rejection of `getLeaderboardAsync` (or on two consecutive failures) would close it. |
| `rankingCaps.global` = API present + non-empty `VITE_FB_LEADERBOARDS`. | L-a | With global boards gone, the honest production setting is to leave `VITE_FB_LEADERBOARDS` empty (trophy hidden) unless contextual boards are adopted. |
| Overlay list binds other rows via `{{FBInstant.player.friends[{{row.id}}].name}}` (O3). | L-e | Consistent: non-friends will show no name; rank and score still show. A contextual board's rows are mostly connected players, so names have a better chance there. |
| `fb-groups.ts` sends `createAsync({initialScore, config:{title, sortOrder, scoreFormat, endTime}})`; G2 called the shape uncertain. | L-f | **Matches** Meta's 2026 plugin (`initialScore` + `config` + optional `data`); G2's shape question is answered. New options (`COLLABORATIVE` + `goal`, score-range validation) are unused. `endTime` units still not stated ("unix timestamp"). |
| `B6` probe strings `getLeaderboardAsync`, `globalLeaderboards.setScoreAsync`, `globalLeaderboards.getTopEntriesAsync`. | L-a, L-c | Unverifiable; a device check of `getSupportedAPIs()` remains part of G1. |

### 5.3 What a game can show in-game (as of 2026-10-10)

- **Contextual leaderboard** (if L-a is right): only when the player is in a context (a Messenger thread or group, or a context chosen via `context.chooseAsync`/`createAsync`); board created in the dashboard as contextual; entries are that context's players; names via overlay views. Good fit for "this group's ranking" or a "daily challenge with friends", not for a worldwide weekly board.
- **Tournaments**: player-created, per context, standings in FB's UI, our game posts scores; `COLLABORATIVE` tournaments could support a group "daily challenge" goal. Rewards tied to tournaments remain a policy question (G2).
- **Own backend**: the only route to a worldwide board. Needs a server (the bundle may not contain server code, but the game may call an external HTTPS API; CSP for external requests is still unknown, 05 §5.3), and under NEZP it could show only ids, scores and anonymous labels (no names of strangers). Out of scope unless the user accepts a backend.
- **Personal records** (current fallback).

---

## 6. Daily streak and daily challenge

Neither feature needs a platform API to *work*: the daily puzzle packs, the save (`player.setDataAsync`, 1 MB, cloud + local mirror) and the streak counter are ours. The platform matters for time, reminders and the social side.

| # | Fact | Source (2026-10-10) | Conf. |
|---|---|---|---|
| D1 | No server-time API in FBInstant was found (8.0 plugin, 7.1 typings). `player.getSignedPlayerInfoAsync()` returns a signed payload (it carries an issue time in Meta's signed-request format), but trusting it needs a server to check the signature. | [meta-gh] `Player.cs`; [dt] | confirmed (no API) / inferred (issue time) |
| D2 | **A2U notifications**: POST from your server to a Gaming Graph endpoint with an app access token ("should only be used on your game servers"); title 1–30, body 10–180 chars, media 300×200, delay up to 10 days, at most 5 per user, window 10 days after the last open; skip players inactive 28 days. | https://developers.facebook.com/docs/games/gaming-services/gaming-services-sdk/appnotifications ; https://developers.facebook.com/documentation/games/retain/notifications/overview [S] | likely (and needs a backend) |
| D3 | A "**Notification Service**" page exists (`/documentation/games/retain/notifications/notification-service.md`), described as a managed service for pre-defined notification types and scheduling; its content was not readable. | [S] | unknown — could be backend-free; **gate G9** |
| D4 | Bot subscription: `player.canSubscribeBotAsync()` then `subscribeBotAsync()`; dialog once per 90 days (6.1 docs) or once per week (Unity v7 docs); Playgama's 2026 bridge still calls it and tolerates `INVALID_OPERATION` on web Messenger. Sending bot messages needs a Messenger webhook/server. | https://developers.facebook.com/docs/games/instant-games/sdk/fbinstant6.1 ; https://docs.unity3d.com/Packages/com.unity.meta-instant-games-sdk@2.0/api/Meta.InstantGames.v7.Player.html [S]; [pg] lines 757–790; `Player.cs` [meta-gh] | likely |
| D5 | Custom updates `updateAsync` (template from `fbapp-config.json custom_update_templates`, `notification: 'PUSH' | 'NO_PUSH'`, default `NO_PUSH`, push not guaranteed), **one per context session**, always to the current context. | 6.1/7.0 changelog text [S]; `UpdateAction.cs` (CUSTOM only) [meta-gh] | likely |
| D6 | Sharing: `shareAsync({image, text, data})`; v7.0 removed the unused `intent` parameter, yet Meta's NEZP sample still passes `intent: 'CHALLENGE'`; `inviteAsync`; context `chooseAsync`/`createAsync`/`switchAsync`; entry-point data ≤ 1000 chars. No current Meta rule on rewarding shares was found. | `main.js` lines 30–45 [meta-gh]; SDK reference changelog [S]; [dt] | confirmed (APIs) / unknown (policy) |
| D7 | Launch checklist bot guidance: no message right after the player closes the game, no context-free re-engagement, respect time zones, let players control frequency. | launch checklist [S] | likely |

**Our adapter today:** `capabilities().share` is hard-coded `false`; no notification, bot, `updateAsync`, `shareAsync` or context code exists; `daily_fastest` is a **global** band board (affected by R-L1); the daily is keyed to the player's local date (parity-spec §5.3).

**Implications for items 4 and 5:**

- **Daily streak**: fully client-side; the streak day boundary must come from the device clock (D1), so a changed clock can fake or break a streak. Use the same date key as the daily (local date) and tolerate small clock jumps; keep it in the save (cloud-merged). Reminders ("don't lose your streak") are **not** possible without a backend unless G9 finds the Notification Service is backend-free.
- **Daily challenge**: the puzzle side exists. A daily *ranking* cannot be global (R-L1); options are a contextual board per group, a per-context tournament (FB UI standings), or personal best times only. Sharing a result into a chat (`shareAsync`/`updateAsync`) is available; incentivising it stays off (no policy found; same stance as `groupChallenges`).

---

## 7. Mismatch and risk register

| ID | Area | Our code / doc | Platform fact | Sev. | Suggested action |
|---|---|---|---|---|---|
| R-L1 | Leaderboards | All boards are global (`period_points`, `daily_fastest`, `event_*`); fb-dashboard §3 says "create global boards" | Global leaderboards removed 2025-12-31 [S, single] | **High** | Confirm on the live page first (G1+G11). If true: ship FB with `VITE_FB_LEADERBOARDS` empty (personal records), and choose contextual boards / tournaments / a backend for "same as Meowdoku". User decision. |
| R-L2 | Leaderboards | Missing latch only on `LEADERBOARD_NOT_FOUND` (`fb-ranking.ts note()`) | Removal error code unknown | Medium | Latch the board on any non-network rejection of `getLeaderboardAsync`/`setScoreAsync` (or on 2 consecutive failures). |
| R-P1 | IAP | `paymentsSupported` false on iOS; 05 §9 and P8 say iOS not eligible | iOS FB app supports IAP since 2024-09-16 [S×2, press] | **High** | Gate G10; then drop the iOS exclusion and rely on `getSupportedAPIs` + `onReady`; update 05 §1/§9, fb-dashboard P8. |
| R-P2 | IAP | Launch-checklist iOS rule "no payments functionality" (old) | Conflicts with R-P1 | Medium | Read the current checklist; if it still applies to iOS, keep iOS out. |
| R-P3 | IAP | Grant → flush → consume | Meta wording: consume, then provision | Low | Keep `iap.grantBeforeConsume` switch; tell the IAP reviewer; ledger already idempotent. |
| R-P4 | IAP | No in-play purchase entry; no timer pause for the FB dialog | User item 3 | Medium (app) | Spec: offer the pack when helpers run out; pause timer/audio while `purchaseAsync` is pending. |
| R-P5 | IAP/Ads admin | Phase 4 checklist lists Monetization Manager and IAP as `[verify]` | AN approval required **even for IAP-only**; IAP review needs item descriptions + purchase-flow video; business verification | Medium | Add these to the Phase 4 checklist. |
| R-A1 | Ads | `ads.banner.duringPlay: true` (game-screen banner) | Meta: hide banners in gameplay | Medium | User decision; recommend default off on FB (review/monetisation risk). |
| R-A2 | Ads | Banners on Home/victory/event + in play; 58/50 px reserves | Banner deprecation, full stop 2027-03-31 | Medium | Expect falling fill now; plan `ads.banner.enabled: false` (FB) by 2027-03-31; do not design new layout around the band. |
| R-A3 | Ads | `reloadDelaysMs [5000, 30000, 120000]`; immediate reload after every show | No-fill retry 30–60 s; ≥ 30 s between loads of a placement | Low | Start the backoff at 30 s and enforce a 30 s floor per placement between `loadAsync` calls. |
| R-A4 | Ads | One rewarded placement ID for 5 uses | A9 is per placement; per-placement eCPM advice | Low | Optional: one placement per helper (hint, kitty, mouse, revive); env vars per placement. |
| R-A5 | Ads | 05 §6.1 lists rewarded interstitial as "Not used" | Removed from SDK April 2026 | Info | Doc fix only. |
| R-A6 | Ads | `remove_ads` keeps rewarded videos | Banner FAQ: Ad-Free buyers should see no banner "or any other ads" [S] | Low | Re-read the exact wording (G4); rewarded is opt-in per best practices. |
| R-N1 | Streak | No reminders possible | A2U needs a server; bots need a webhook; Notification Service unknown | Medium | Gate G9; otherwise ship the streak without reminders. |
| R-N2 | Streak | Device clock is the only time source | No server-time API | Low | Accept; clamp obviously wrong jumps; same date key as the daily. |
| R-S1 | Challenge | `share: false`, no context code | `shareAsync`/`updateAsync`/tournaments available; incentive policy not found | Low | If the daily challenge needs a social share, add a non-incentivised share; keep rewards off until policy is read. |
| R-D1 | Docs | 05 links to `/docs/games/...` | Those pages are deprecated since end of June 2026 | Info | Move references to `/documentation/games/...` when 05 is next edited. |
| R-T1 | Tournaments | G2 "createAsync payload uncertain" | Meta's 2026 plugin uses the same `{initialScore, config, data}` | Info (resolved) | Close that part of G2; `COLLABORATIVE` tournaments are a new option for group challenges. |

---

## 8. Gates: changes and additions (developers.facebook.com, before production)

| Gate | Change |
|---|---|
| G1 (leaderboard API) | Add: read `documentation/games/retain/leaderboards` for the **global-leaderboard removal (2025-12-31)**; if confirmed, record the rejection code (for R-L2) and switch the plan to contextual boards/tournaments/personal records. |
| G2 (tournaments) | Payload shape answered by Meta's plugin; still open: standings API, reward policy, `endTime` units. Add `COLLABORATIVE` + `goal` as an option. |
| G4 (banners) | Add: the **deprecation timeline** (April 2026 → 2027-03-31), the Ad-Free wording, and whether in-game banners are merely discouraged or enforced. |
| G5 (payments) | Add: Audience Network approval prerequisite; IAP review contents. |
| **G9 (new)** | Notifications: read `documentation/games/retain/notifications/overview` and `notification-service`; is any reminder schedulable **without our own server** under Zero Permissions? Bot subscription status under NEZP. |
| **G10 (new)** | iOS IAP: confirm 2024-09-16 support on the live IAP page, the current iOS rules in the launch checklist, and `getPlatform()`/`purchasePlatform` values on iOS. |
| **G11 (new)** | Banner/rewarded placements per helper (A9) and the 30 s per-placement load floor on a device. |

---

## 9. Sources (all checked 2026-10-10)

Meta documentation (read through search summaries; direct fetch blocked):

- Banner ads: https://developers.facebook.com/documentation/games/monetize/in-app-ads/banner-ads (+ `.md`); older https://developers.facebook.com/docs/games/monetize/banner-ads
- In-app ads overview: https://developers.facebook.com/documentation/games/monetize/in-app-ads/overview
- Interstitial ads: https://developers.facebook.com/documentation/games/monetize/in-app-ads/interstitial-ads
- Rewarded ads: https://developers.facebook.com/documentation/games/monetize/in-app-ads/rewarded-ads
- Monetization best practices: https://developers.facebook.com/documentation/games/monetize/best-practices
- Monetization Manager: https://developers.facebook.com/documentation/games/tools/monetization-manager
- Audience Network for Instant Games (help): https://www.facebook.com/business/help/355647874927053 ; payout: https://www.facebook.com/help/publisher/103628146695524 ; app status: https://en-gb.facebook.com/business/help/331129351478041
- In-app purchases: https://developers.facebook.com/documentation/games/monetize/in-app-purchases ; https://developers.secure.facebook.com/docs/games/monetization/in-app-purchases/instant-games ; https://www.facebook.com/business/help/472362043174078
- Launch checklist: https://developers.facebook.com/docs/games/build/instant-games/get-started/launch-checklist
- Leaderboards: https://developers.facebook.com/documentation/games/retain/leaderboards ; NEZP global leaderboards: https://developers.secure.facebook.com/docs/games/build/instant-games/network-enabled-zero-permissions/social-features/global-leaderboards/
- SDK reference and changelog: https://developers.facebook.com/docs/games/build/instant-games/reference/instant-games-sdk/ ; https://developers.facebook.com/documentation/games/whats-new/changelog/ ; v6.1: https://developers.facebook.com/docs/games/instant-games/sdk/fbinstant6.1
- Notifications: https://developers.facebook.com/documentation/games/retain/notifications/overview ; https://developers.facebook.com/documentation/games/retain/notifications/notification-service.md ; A2U: https://developers.facebook.com/docs/games/gaming-services/gaming-services-sdk/appnotifications
- Web and Instant Games changes (2025-07-31): https://developers.facebook.com/blog/post/2025/07/31/web-and-instant-games-changes/

First-hand code (cloned 2026-10-10):

- https://github.com/facebook/meta-instant-games-unity-plugin @ `ec32ba7` (2026-06-01): `documentation/API_REFERENCE.md`; `Assets/Meta.InstantGames/Runtime/Plugins/{FBInstant,Payment,Tournament,Player}.cs`; `UtilClasses/{PurchasePlatform,Purchase,Product,CreateTournamentConfig}.cs`; `Runtime/Scripts/PluginExample.cs`
- https://github.com/fbsamples/fbinstant-nezp-samples @ `2e2c2eb` (2026-04-29): `nezp_sample_xmls_picker/{main.js,overlayManagementUtils.js,ig_views/leaderboard_list.xml}`
- https://github.com/playgama/bridge @ `e33dc66` (2026-10-07): `src/platform-bridges/FacebookPlatformBridge.ts`
- `@types/facebook-instant-games` 7.1.6 (npm registry)

Press and third party:

- https://www.pocketgamer.biz/metas-in-app-purchases-bring-instant-games-to-ios/ ; https://www.softgames.com/instant-games-iap-on-ios/
- https://ppc.land/meta-announces-web-games-sunset-by-september-2026/ ; Zynga Canvas sunset notices (zyngasupport.helpshift.com)
- Unity: https://docs.unity3d.com/Manual/instant-games.html ; https://docs.unity3d.com/Packages/com.unity.meta-instant-games-sdk@1.3/changelog/CHANGELOG.html ; https://discussions.unity.com/t/deprecation-notice-unity-support-for-facebook-instant-games/1694214
- https://forum.defold.com/t/facebook-instant-games-ads-not-loading-more-than-once/43392 (2019, ADS_TOO_MANY_INSTANCES); https://forum.defold.com/t/facebook-instant-game-global-leaderboard-with-playfab/66997 (2020)
