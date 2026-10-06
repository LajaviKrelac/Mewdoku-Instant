# 05 · Facebook Instant Games platform: requirements, status and integration plan

Status: Phase 1 deliverable · Research date: 2026-10-06 · Used by: Phase 2 (adapter design), Phase 4 (publishing)

> **Research caveat.** `developers.facebook.com`, `connect.facebook.net` and `facebook.com` were blocked during research, and the web-search budget ran out. Nothing below was read on Meta's documentation site. The facts come from these readable sources:
>
> 1. Meta's own public GitHub repos, which were active in 2026:
>    - `facebook/meta-instant-games-unity-plugin`: five commits, from 2026-04-13 to **2026-06-02** (the commit list was re-read in the review pass on 2026-10-06, and there is nothing newer);
>    - `fbsamples/fbinstant-nezp-samples`: commits up to 2026-04-29.
> 2. The community SDK 7.1 type definitions, `@types/facebook-instant-games` 7.1.6 (2024-08-07), which copy Meta's reference text.
> 3. The open-source Playgama Bridge Facebook adapter and its git history. `@playgama/bridge` 2.3.0 was published 2026-09-30.
> 4. Engine documentation from Cocos Creator, Defold and GDevelop.
>
> **Everything marked *likely* or *inferred* must be re-verified on developers.facebook.com before Phase 4 submission.**
>
> **Review pass (2026-10-06).** The following were re-read first-hand and still match this document: Meta's `fbapp-config.json` samples (Unity plugin and NEZP), `PurchasePlatform.cs` (APPLE: "Not eligible"), `API_REFERENCE.md` (haptics, ad formats, banner position, tournaments, player data, `getSupportedAPIs`, overlay views; **no** leaderboard API), the Playgama Facebook bridge (`fbinstant.8.0.js`, `globalLeaderboards.*`, banner with position, `getLocale` before start), the npm registry (Playgama 2.3.0 on 2026-09-30, still the latest), the Defold and Cocos 4.0 docs, and the DefinitelyTyped reference text (`showAsync`, `setDataAsync`, `flushDataAsync`, 1 MB, `logEvent` limits, `getLocale`). The web-search budget for the session was already used up, so **no new evidence about whether Meta accepts new apps in 2026 could be gathered**. That row stays "Unknown".

## 1. Status at a glance

| Topic | Status as of 2026-10-06 | Conf. | Source (date) |
|---|---|---|---|
| Platform alive and supported | Meta maintains official Instant Games tooling in 2026: a Unity plugin (last commit 2026-06-02) and NEZP samples. Third-party bridges target it as of 2026-09-30. There has been no Meta commit in the four months before 2026-10-06, which is a weak signal either way. | likely | [meta-unity] (2026-04/06), [nezp] (2026-04-29), [pg-npm] (2026-09-30) |
| Accepting **new** apps | **Unknown.** No evidence either way. | — | — |
| Current SDK | **8.0**, at `https://connect.facebook.net/en_US/fbinstant.8.0.js`. Meta's uploader lists 8.0 (default), `restricted.latest` and 7.1. | confirmed | [meta-uploader] (2026), [pg-e2d6069] (2025-04-17) |
| Privacy model | The "restricted SDK (aka NEZP)": game code sees player **IDs only**. Names and photos are rendered by Meta inside **overlay views**. | confirmed | [meta-connected], [nezp] |
| `player.getName()` / `getPhoto()` | Removed in 8.0 | likely | [pg-e2d6069], [cardsjd] (2026-05-27) |
| Stats APIs | Removed **2022-09-28** | confirmed | [dt-types], [dt-67927] (2024-01-09) |
| Ads | Interstitial, rewarded video, rewarded interstitial, and banner (with a position argument in 8.0) | confirmed | [meta-api], [meta-adtype], [dt-types] |
| Payments | Web (`FB`) and Android (`GOOGLE`) only. **iOS (`APPLE`): "Not eligible".** | confirmed | [meta-purchaseplatform] |
| Player cloud data | `player.setDataAsync` / `getDataAsync` / `flushDataAsync`, **1 MB per player** | confirmed | [dt-types], [meta-api] |
| Leaderboards (8.0) | `FBInstant.globalLeaderboards.*`, seen only in third-party adapters. Meta's 2026 plugin wraps **no** leaderboard API. | likely | [pg-7513a13] (2025-05-30), [dogcrash] |
| Bundle format | One `.zip` uploaded to Web Hosting, `index.html` at the root, **≤ 500 files**, **no server-side code** | likely | [cocos-fb] (2.4-era text), [meta-uploader] |
| `fbapp-config.json` | At the bundle root; an `instant_games` object (orientation, platform_version, navigation menu, …) | confirmed | [meta-fbapp], [nezp-fbapp] |
| Local testing | HTTPS localhost + `facebook.com/embed/instantgames/<APP_ID>/player?game_url=…` | confirmed | [meta-uploader], [cocos-fb] |
| CI upload | `POST https://graph-video.facebook.com/{app_id}/assets` with `type=BUNDLE` | confirmed | [meta-uploader] |
| Load-time guideline | Initial load **< 5 s** (Defold quoting Meta's best practices) | likely | [defold] |
| Total bundle size limit | **Unknown.** Third-party figures (64 MB, 200 MB) are not official. | inferred | [maoyu], [loudmouth] |
| Ad eligibility and frequency caps | **Unknown.** The SDK enforces rate limits (`ADS_FREQUENT_LOAD`, `RATE_LIMITED`). | inferred | [dt-types] |
| Messenger gameplay | **Unknown.** Messenger-related APIs (rooms, matchPlayer, share destination) still exist. | inferred | [meta-api], [dt-types] |
| Submission assets, review time, rejection reasons | **Unknown**; background knowledge only | inferred | — |

## 2. SDK version and loading

- **Pin `fbinstant.8.0.js`.** It is Meta's default in its own 2026 uploader ([meta-uploader]). Playgama moved from 7.1 to 8.0 on 2025-04-17 ([pg-e2d6069]) and still shipped 8.0 on 2026-09-30 ([pg-npm]).
- Alternatives:
  - `fbinstant.restricted.latest.js`, used by Meta's NEZP sample ([nezp]);
  - `www.facebook.com/assets.php/en_US/fbinstant.latest.js`, found only in a Cocos template ([cocos-tmpl]). This one is *likely*.

  Both are unpinned, so we **do not** use them.
- Feature-detect every non-core call with `FBInstant.getSupportedAPIs()`.
- Engine templates lag far behind: GDevelop still loads 6.0 and Defold 6.3. **Do not copy their templates.**
- Types: `@types/facebook-instant-games` stops at 7.1, and no public 8.0 typings were found. We write our own minimal `fbinstant.d.ts` covering only the calls we make (04 §3).

## 3. Privacy model (restricted SDK / NEZP) and what it means for us

- Game code gets `player.getID()` (scoped to the game), the ASID and signed-player-info APIs, and connected-player **IDs**. It does **not** get names or photos ([meta-connected]).
- Names and photos can only appear inside **overlay views**. These are XML templates (`View`, `Text`, `Image`, `Button`, `For`, `If`/`ElseIf`/`Else`, `Condition`) that Meta renders in its own iframe. They use bindings such as `{{FBInstant.player.name}}` and `{{FBInstant.player.photo}}`. The API is `overlayViews.createOverlayViewWithXMLString(xml, css, data, onLoad, onError, basePath)` and related calls ([meta-api], [nezp-lb]).
- **Design consequence:**
  - Phase 2 never displays a player's name or avatar, and the core game never depends on social data.
  - Any Phase 4 social UI (leaderboard lists, "friends who played") **must** be an overlay view.

## 4. Lifecycle integration plan

```
index.html loads fbinstant.8.0.js (sync, in <head>) → our module bundle
  │
  ├─ FBInstant.initializeAsync()           FIRST SDK call, before heavy work
  │     (Defold: on Android the FB progress bar stays at 0 unless init happens early)
  ├─ getSupportedAPIs() → capabilities
  ├─ setLoadingProgress(10 … 40 … 100)      while: save load + merge, pack-000, font
  ├─ FBInstant.startGameAsync()            the game becomes visible to the player
  ├─ getLocale()                           ONLY now accurate (do not copy Playgama's pre-start call)
  ├─ getEntryPointData() / getEntryPointAsync()   (Phase 4: share/context payloads, ≤ 1000 chars)
  ├─ onPause(cb)                           pause timer, mute audio, save now (setDataAsync, no flush; §7)
  └─ gameplay …  ads at transitions only; player data writes debounced
```

```ts
// src/platform/fb/index.ts (shape)
export function createPlatform(): PlatformAdapter {
  const FB = window.FBInstant;
  let apis = new Set<string>();
  return {
    id: 'fbig',
    async init() { await FB.initializeAsync(); apis = new Set(FB.getSupportedAPIs()); },
    setLoadingProgress: (p) => FB.setLoadingProgress(Math.max(0, Math.min(100, Math.round(p)))),
    async start() { await FB.startGameAsync(); },
    getLocale: () => FB.getLocale() ?? 'en_US',
    getPlayerId: () => FB.player.getID(),
    onPause: (cb) => FB.onPause(cb),
    capabilities: () => ({
      interstitial: apis.has('getInterstitialAdAsync') && !!import.meta.env.VITE_FB_PLACEMENT_INTERSTITIAL,
      rewarded: apis.has('getRewardedVideoAsync') && !!import.meta.env.VITE_FB_PLACEMENT_REWARDED,
      banner: false,                                   // not used in Phase 2 (02 §13)
      cloudSave: apis.has('player.setDataAsync'),
      leaderboards: false,                             // Phase 4, after doc verification
      share: false, payments: false,
      haptics: apis.has('performHapticFeedbackAsync'),
    }),
    storage: createFbStorage(FB),                      // §7
    ads: createFbAds(FB, import.meta.env),             // §6
    analytics: createFbAnalytics(FB),                  // §10
    haptics: createHaptics(FB, apis),
  };
}
```

Facts from the SDK 7.1 reference text ([dt-types]) that still apply:

- `getPlatform()` is null until init.
- Locale and context are accurate only after `startGameAsync`.
- `payments.purchaseAsync` rejects before start.
- Entry-point and session data must be ≤ 1 000 characters when stringified.

## 5. Bundle and hosting

### 5.1 Zip layout (output of `npm run zip:fbig`)

```
<name>-fbig-<ver>-<sha>.zip
├─ index.html                 (root — Meta's uploader zips the folder contents without a parent dir [meta-uploader])
├─ fbapp-config.json          (root)
├─ assets/index-<hash>.js     main bundle (includes pack-000)
├─ assets/engine.worker-<hash>.js
├─ assets/index-<hash>.css
├─ assets/display-latin-<hash>.woff2
├─ assets/pack-001-<hash>.json … pack-009-<hash>.json
└─ assets/2026-10-<hash>.json … (daily months)
```

That is about 45 files, against the platform cap of 500 (*likely*, [cocos-fb]). All URLs are relative (`base: './'`).

### 5.2 Our `fbapp-config.json`

```json
{
  "instant_games": {
    "platform_version": "RICH_GAMEPLAY",
    "orientation": "PORTRAIT",
    "override_web_orientation": "PORTRAIT",
    "navigation_menu_version": "NAV_FLOATING"
  }
}
```

Every key above appears in Meta's own samples ([meta-fbapp], [nezp-fbapp]). Other keys:

- `custom_update_templates`: only needed if we use `updateAsync` (Phase 4).
- `match_player_config`: only for matchmaking.
- `bot` and `surfaceable_stats`: legacy keys seen only in GDevelop's old template. **Do not use.**
- Some third parties add top-level `app_id` and `app_name` ([maoyu]); these are unverified and we do not use them.

### 5.3 Hosting constraints checklist

| Constraint | Our handling | Conf. |
|---|---|---|
| ≤ 500 files per upload | ~45 files; `zip-fbig.ts` fails above 500 (our own budget alarm is at 60) | likely |
| No server-side code | Static files only | likely |
| `index.html` at the zip root | Enforced by the zip script | likely |
| Runtime content from the same base URL | Packs are relative assets in the bundle | likely ([defold]) |
| Hosted on a sandbox domain (`*.fbsbx.com`) | Relative URLs only. No absolute origin assumptions. Profile images (unused) would need `crossOrigin` for canvas. | likely ([pg-detect], [dt-types]) |
| Pre-compressed files may not be served with Content-Encoding | We emit plain files, and our budget counts **raw** bytes (04 §9). Meta's Unity "Project Optimiser" disables WebGL compression, which is why we infer this. | inferred ([meta-uploader]) |
| External requests / CSP | **Unknown.** We make none apart from the SDK script. | inferred |

### 5.4 Performance targets for FBIG

- First-load download ≤ 220 KB raw (04 §9).
- Time to `startGameAsync` ≤ 2 s on a mid-range Android over 4G. Meta's guideline is < 5 s (*likely*, [defold]).
- `setLoadingProgress` reports real progress and must reach 100 before `startGameAsync`.

### 5.5 Floating menu safe zone

The NAV_FLOATING platform menu overlays a corner of the game. We **reserve the top-left 64 × 64 px** and keep all controls at the top right (02 §19).

*inferred.* The exact position and size of the menu must be checked on device in Phase 4.

## 6. Ads plan

### 6.1 Formats used

| Our placement (02 §13.1) | SDK call | Grant rule |
|---|---|---|
| `next_level`, `retry`, `daily_done` | `getInterstitialAdAsync(placementId)` → `loadAsync()` → `showAsync()` | Not applicable |
| `hint`, `kitty`, `revive` | `getRewardedVideoAsync(placementId)` → `loadAsync()` → `showAsync()` | **Grant only when `showAsync()` resolves.** It rejects if the ad "failed to present or was closed during the ad" ([dt-types], confirmed). |
| Banner | `loadBannerAdAsync(placementId, position)` (8.0) | **Not used** in Phase 2 (`ads.banner.enabled = false`) |
| Rewarded interstitial | `getRewardedInterstitialAsync` | Not used |

### 6.2 Implementation rules

- Keep **one preloaded instance per format**. Create a new instance after every show or failure. Never hold many instances: `ADS_TOO_MANY_INSTANCES` exists.
- Map error codes to `AdResult` as in 04 §6.3:
  - `ADS_NO_FILL` → `no_fill`
  - `ADS_FREQUENT_LOAD` and `RATE_LIMITED` → `rate_limited`
  - `ADS_NOT_LOADED` → `not_ready`
  - `CLIENT_UNSUPPORTED_OPERATION` → `unsupported`
- A 4 s **readiness** timeout (`ads.readyTimeoutMs`) covers loading only. `showAsync()` gets **no** timeout: Meta's reference text says its promise "resolves when user finished watching the ad, and rejects if it failed to present or was closed during the ad" ([dt-types], re-read 2026-10-06), so a timeout would cut off ads that are still playing. `ad-flow.ts` keeps a 120 s watchdog purely as a safety net (02 §3). The game never waits on an ad that is not ready.
- Mute our audio while an ad shows, and restore it afterwards.
- The pacing gate (02 §13.2) is applied **before** asking the SDK:
  - no interstitial before 10 completed levels or in the first 60 s of a session;
  - tenure cooldown of 120/100/90 s;
  - rewarded ads reset the clock.
- Placement IDs come from build-time env (`VITE_FB_PLACEMENT_INTERSTITIAL`, `VITE_FB_PLACEMENT_REWARDED`), so no IDs are committed. They are created in Meta Monetization Manager (*inferred*, verify). **If an ID is empty, the adapter reports that ad capability as false**, so builds made before monetization is approved use the free fallback (02 §13.3) instead of failing on every request.

### 6.3 Policy assumptions (verify in Phase 4)

These are *inferred* from background knowledge:

- interstitials only at natural breaks, never at game load;
- ads typically serve only once the game is live and monetisation is approved;
- frequency is throttled by the platform.

Until rewarded ads are actually available, the free-fallback rule (02 §13.3) means players are never stuck.

## 7. Data and storage plan

| Aspect | Plan | Basis |
|---|---|---|
| Key layout | One key, `save` → `SaveDataV1` JSON (04 §4.3), under 40 KB after heavy play | 1 MB limit ([dt-types]) |
| Read | `player.getDataAsync(['save'])` at boot, **merged** with the localStorage mirror (04 §7.3) | — |
| Write | `setDataAsync({save})` debounced 3 s. The promise resolves when the write is *scheduled*, and the value can be read back immediately. | [dt-types] |
| Critical writes | `flushDataAsync()` after a level win, a daily win and the first-run tutorial win or skip only, because it is "expensive" and "should primarily be used for critical changes". `setDataAsync` calls are rejected while a flush is pending, so writes are queued and coalesced. | [dt-types] |
| Pause / hide / Home | Immediate `setDataAsync` (debounce cancelled), **no** flush. Meta's text says a resolved `setDataAsync` "does not necessarily mean that the input has already been persisted", so a write made just before the app is killed may be lost. The localStorage mirror covers that case on the same device. | [dt-types] |
| Errors | `NETWORK_FAILURE` → retry with backoff. `PENDING_REQUEST` → coalesce. `INVALID_PARAM` → log and keep the local copy. | [dt-types] |
| Deleting a key | Write `null` (Playgama's practice) | [pg-npm] |
| Offline / first frame | The local mirror makes boot instant; the cloud merge follows | — |

## 8. Leaderboards and social (Phase 4, optional)

The store promises global fastest-time leaderboards for the original (confirmed, 01 §10.11). On FBIG:

| Option | API | Status | Notes |
|---|---|---|---|
| A. "Levels completed" global board | `globalLeaderboards.setScoreAsync(id, score)`, `getTopEntriesAsync(id, n)`, `getScoreAsync(id)`, `getTopFriendEntriesAsync(id, n)` | likely (third-party usage only) | Entries expose a `getPlayer().getSessionID()` binding for overlay XML. How leaderboard IDs are provisioned (in the dashboard?) is **unverified**. |
| B. Daily fastest time | `tournament.createAsync({initialScore, config: {sortOrder: 'LOWER_IS_BETTER', scoreFormat: 'TIME', endTime}})`, `postScoreAsync` | likely (Meta's 2026 plugin wraps the tournament APIs) | One tournament per day or week. Needs a design decision in Phase 4. |
| C. None | — | — | The trophy stays hidden (02 §4.1) |

The 7.1 `getLeaderboardAsync(name)` API was dropped by Playgama on 2025-05-30 ([pg-7513a13]). The 7.1 `updateAsync` LEADERBOARD action may be gone too: Meta's plugin lists only CUSTOM ([meta-updateaction]). **Decide in Phase 4 after reading the live docs.**

Sharing, invites, shortcuts, community follow and join, and context switching all exist ([meta-api]) but are **not** used in Phase 2. `createShortcutAsync` is Android-only and can be called once per session (*likely*, [defold]).

## 9. Payments (not in Phase 2)

- The API is `payments.onReady`, `getCatalogAsync`, `purchaseAsync({productID, developerPayload})`, `getPurchasesAsync` and `consumePurchaseAsync`.
- Purchases carry `purchasePlatform`, `purchasePrice`, `paymentActionType` (charge or refund) and `isConsumed` ([meta-purchase]).
- **iOS is not eligible** ([meta-purchaseplatform]). So the original's iOS Premium subscriptions (01 §11.7) cannot be mirrored on FBIG.
- Product IDs should be **lowercase**. This is Playgama's practice ([pg-b4ec522], [pg-0d4c3e0]), *inferred* as a rule.
- If Phase 3 or 4 adds a "remove ads" item, it would be web and Android only and gated by `payments.onReady`. Any `signedRequest` must be verified on a server, which this project does not have.

## 10. Analytics

- `FBInstant.logEvent(name, valueToSum?, params?)`.
- Limits ([dt-types]):
  - names are 2–40 characters from `[A-Za-z0-9 _-]`;
  - at most 25 parameters;
  - parameter keys are 2–40 characters;
  - parameter values are under 100 characters.
- `fb-analytics.ts` truncates and filters to fit these limits. Note the 2-character minimum on **keys**: our board-size parameter is therefore `size`, not `n` (02 §20).
- The event list is in 02 §20. **No other analytics SDK is used.**

## 11. Local testing

1. `npm run dev:fbig` serves HTTPS on `127.0.0.1:8080`, using `@vitejs/plugin-basic-ssl` or a local cert. Accept the certificate once at `https://localhost:8080`.
2. Open `https://www.facebook.com/embed/instantgames/<APP_ID>/player?game_url=https://localhost:8080` ([meta-uploader], [cocos-fb]).
3. The SDK initialises fully only inside the Facebook player. Outside it, use the e2e stub (04 §11).

## 12. Upload and release

**Manual** (Cocos manual; *likely*, labels may have changed):

1. Go to App Dashboard → Instant Games → Web Hosting.
2. Upload the zip and wait for "Standby".
3. Press the star to push the build to Production.

**CI** (confirmed, [meta-uploader]):

```bash
TOKEN=$(curl -s "https://graph.facebook.com/oauth/access_token?client_id=$FB_APP_ID&client_secret=$FB_APP_SECRET&grant_type=client_credentials" | jq -r .access_token)
curl -X POST "https://graph-video.facebook.com/$FB_APP_ID/assets" \
  -F "access_token=$TOKEN" -F "type=BUNDLE" -F "asset=@dist-zip/<file>.zip" -F "comment=<version> <sha>"
```

The app secret lives **only** in CI secrets. Meta's uploader also contains an unfinished resumable flow (`graph.facebook.com/v24.0/{APP_ID}/uploads` → `rupload.facebook.com`). That flow is unverified and we do not use it.

## 13. Phase 4 submission checklist

Legend: `[ours]` = handled by our design · `[verify]` = must be verified on developers.facebook.com or in the dashboard first

**Account and app**

- [ ] `[verify]` Meta developer account; business verification requirements in 2026; whether new Instant Games apps are accepted at all
- [ ] Create the app, add the Instant Games product, category Puzzle `[verify]` (labels)
- [ ] Store the App ID and placement IDs as build env. The secret goes to CI only.
- [ ] `[verify]` Developer and test roles for internal testers

**Legal and policy**

- [ ] Name cleared (06 §6). No "Meowdoku" or confusable branding.
- [ ] `[verify]` Privacy policy URL (our own policy, describing local storage, FB player data, ads and analytics). Terms URL if required.
- [ ] `[verify]` Data Use Checkup and content or age questionnaire
- [ ] No unsupported claims in the listing ("Test your IQ"-style claims are avoided, 06 §3)
- [ ] `[ours]` All art, text, audio and code original; OFL font licence included in About (06 §5)

**Listing assets** (all `[verify]` for exact sizes)

- [ ] App icon (commonly 1024×1024)
- [ ] Cover or hero image (commonly about 1.91:1)
- [ ] Screenshots and/or gameplay video
- [ ] Short and long descriptions in our own words; supported languages (EN at launch)

**Build quality**

- [ ] `[ours]` `fbinstant.8.0.js` pinned; `initializeAsync` is the first SDK call
- [ ] `[ours]` `setLoadingProgress` reaches 100, then `startGameAsync`; no stall at the load screen
- [ ] `[ours]` `onPause` mutes audio, pauses the timer and saves at once (`setDataAsync`; `flushDataAsync` only on wins, §7)
- [ ] `[ours]` No ads at load or during gameplay; rewards granted only on completed rewarded ads
- [ ] `[ours]` No incentivised sharing (sharing is not used at all in Phase 2)
- [ ] `[ours]` Portrait layout correct on: iOS FB app, Android FB app, facebook.com desktop, mobile web; FB safe zone respected
- [ ] `[ours]` Zip: `index.html` at the root, `fbapp-config.json` present, ≤ 60 files, no source maps or precompressed files
- [ ] `[ours]` First-load ≤ 220 KB raw; time to start ≤ 2 s (target)
- [ ] `[verify]` Test via the embed URL, then upload, then test with testers in development, then push to production

**Monetization**

- [ ] `[verify]` Monetization Manager: property, interstitial and rewarded placements, payout and tax information
- [ ] `[verify]` Ads tested with test placements before going live
- [ ] `[ours]` Pacing defaults are in `GameConfig` and can be changed without code changes

**Review and launch**

- [ ] `[verify]` Submit for review; note the typical review time and rejection reasons from the live docs
- [ ] Post-launch: `logEvent` dashboards (02 §20); tune ad pacing and difficulty bands from data

## 14. Uncertain or possibly deprecated items

| Item | Concern | Source date | Action |
|---|---|---|---|
| `getLeaderboardAsync` (7.1 leaderboards) | Replaced by `globalLeaderboards` in third-party 8.0 adapters | 2025-05-30 | Do not use. Verify `globalLeaderboards` in the docs. |
| `player.getName` / `getPhoto` | Gone under 8.0 / NEZP | 2025-04-17, 2026 | Never use |
| `getConnectedPlayersAsync` | Returns IDs only under NEZP | 2026 | Not used |
| Stats APIs | Removed | 2022-09-28 | Never use |
| `updateAsync` action `LEADERBOARD` | Meta's 2026 plugin lists only `CUSTOM` | 2026 | Not used |
| Context type `POST` | Meta's 2026 plugin lists SOLO, THREAD and GROUP only | 2026 | Not used |
| Messenger rooms, squads, `matchPlayerAsync` | Still in the API surface; whether gameplay surfaces still exist is unknown | 7.1 types 2024; plugin 2026 | Not used |
| `fbinstant.latest.js` via facebook.com/assets.php | Cocos template only; Meta uses `restricted.latest` | Undated / 2026 | Pin 8.0 |
| 500-file cap; no server code; Standby/star flow | From Cocos docs whose text dates from the 2.4 era | Old | Verify |
| `bot` / `surfaceable_stats` config keys | Legacy (GDevelop template) | Old | Do not use |
| Lowercase product IDs | Playgama practice | 2026-03 | Follow it if IAP is ever added |
| `LEADERBOARD_SCORE_NOT_IMPROVED` error code | Seen only in a third-party adapter | 2026 | Handle defensively |

## 15. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Meta stops accepting new Instant Games, or restricts them | Phase 4 blocked | The PlatformAdapter keeps the game portable. A web build exists, and other portals (Yandex, Playgama, CrazyGames) could get adapters later. |
| No ad fill early on | No revenue; players blocked on hints | Free fallback grant (02 §13.3); no hard dependency on ads |
| Listing rejected for a confusable name or trade dress | Delay | Name decision before Phase 4 (06 §6); our own art and palette |
| The SDK changes again (9.0) | Breakage | Minimal SDK surface; feature detection; pinned version; an e2e stub contract test |
| Hosting does not compress files | Slower load | Raw-byte budget of 220 KB |

<!-- References -->
[meta-unity]: https://github.com/facebook/meta-instant-games-unity-plugin
[meta-uploader]: https://github.com/facebook/meta-instant-games-unity-plugin/blob/main/Assets/Meta.InstantGames/Editor/InstantGameBundleUploadWindow.cs
[meta-api]: https://github.com/facebook/meta-instant-games-unity-plugin/blob/main/documentation/API_REFERENCE.md
[meta-connected]: https://github.com/facebook/meta-instant-games-unity-plugin/blob/main/Assets/Meta.InstantGames/Runtime/Plugins/UtilClasses/ConnectedPlayer.cs
[meta-purchaseplatform]: https://github.com/facebook/meta-instant-games-unity-plugin/blob/main/Assets/Meta.InstantGames/Runtime/Plugins/UtilClasses/PurchasePlatform.cs
[meta-purchase]: https://github.com/facebook/meta-instant-games-unity-plugin/blob/main/Assets/Meta.InstantGames/Runtime/Plugins/UtilClasses/Purchase.cs
[meta-adtype]: https://github.com/facebook/meta-instant-games-unity-plugin/blob/main/Assets/Meta.InstantGames/Runtime/Plugins/UtilClasses/AdType.cs
[meta-updateaction]: https://github.com/facebook/meta-instant-games-unity-plugin/blob/main/Assets/Meta.InstantGames/Runtime/Plugins/UtilClasses/UpdateAction.cs
[meta-fbapp]: https://github.com/facebook/meta-instant-games-unity-plugin/blob/main/Assets/WebGLTemplates/FB/fbapp-config.json
[nezp]: https://github.com/fbsamples/fbinstant-nezp-samples/blob/main/nezp_sample_xmls_picker/index.html
[nezp-fbapp]: https://github.com/fbsamples/fbinstant-nezp-samples/blob/main/nezp_sample_xmls_picker/fbapp-config.json
[nezp-lb]: https://github.com/fbsamples/fbinstant-nezp-samples/blob/main/nezp_sample_xmls_picker/ig_views/leaderboard_list.xml
[dt-types]: https://raw.githubusercontent.com/DefinitelyTyped/DefinitelyTyped/master/types/facebook-instant-games/index.d.ts
[dt-67927]: https://github.com/DefinitelyTyped/DefinitelyTyped/pull/67927
[pg-npm]: https://registry.npmjs.org/@playgama/bridge
[pg-e2d6069]: https://github.com/playgama/bridge/commit/e2d6069
[pg-7513a13]: https://github.com/playgama/bridge/commit/7513a13
[pg-b4ec522]: https://github.com/playgama/bridge/commit/b4ec522
[pg-0d4c3e0]: https://github.com/playgama/bridge/commit/0d4c3e0
[pg-detect]: https://github.com/playgama/bridge/blob/main/src/platformDetectors.ts
[cardsjd]: https://registry.npmjs.org/@cardsjd/fbinstantgame
[dogcrash]: https://github.com/lizzardchen/dog-crash/blob/1d97ef5e1ff8ef079e863dafa19e5d0bfc1c3152/assets/script/ADSDK/PlatformFacebook.ts
[cocos-fb]: https://github.com/cocos/cocos-docs/blob/master/versions/4.0/en/editor/publish/publish-fb-instant-games.md
[cocos-tmpl]: https://github.com/cocos/cocos-engine/blob/develop/templates/fb-instant-games/index-plugin.ejs
[defold]: https://github.com/defold/extension-fbinstant/blob/master/docs/index.md
[maoyu]: https://registry.npmjs.org/@maoyugames/phaser-platform-facebook
[loudmouth]: https://github.com/MichaelAScott43/Loudmouth-Spin-Lab/blob/main/scripts/upload-fb.js
