# Phase 2b contracts: ownership, cross-workstream APIs, data flow, conventions

Status: written by the F0 foundation step (2026-10-08); **updated at integration (2026-10-09) to the final APIs: §11 lists every change since F0**; **Phase 2c API changes: §12** (pointer to [fish-lives-spec §7.4](../phase2c/fish-lives-spec.md)) · Applies to: workstreams A–E of [parity-spec](parity-spec.md) §12 · Branch `claude/mewdoku-instant`

This file is the contract between the five Phase 2b workstreams. It extends [Phase 2 CONTRACTS](../phase2/CONTRACTS.md); where the two differ, this file wins for 2b.

- **The TypeScript in `src/**` and `scripts/*.ts` is the authoritative signature.** Every new module named in the spec exists, with its exports, parameter and return types, and a JSDoc that cites the spec section. Bodies that are a workstream's job throw `not implemented: <name> (<WS>, phase2b §x)`. Stubs that the running app must be able to call are safe minimal versions instead; §8 lists them.
- **Do not change a signature that another workstream calls** (§4) without the lead. A stub that only your own workstream calls (marked "C-internal" in its header, for example) may be reshaped freely.
- **Config is frozen after F0.** Every §10 key exists with the spec's value (§7.2). To change a value or add a key, ask the lead.
- Behaviour is in [parity-spec](parity-spec.md); the Phase 2 architecture is [04](../phase1/04-architecture.md).

F0 left the game working as in Phase 2, with the §10 values switched on (§9 lists what a player now sees differently). The tables in §3–§8 describe F0; where the built API differs, §11 (integration) wins, and every stub of §8 is now implemented. Gates at the end of F0: `npx tsc --noEmit` 0 errors, `npx vitest run` 76 files and 1 186 tests green, and `npm run build`, `build:fbig`, `build:e2e`, `build:fbig-e2e` and `build:release` succeed with no warnings (§10). Playwright, all four projects: 48 passed and 5 skipped by design, the same as at the end of Phase 2.

## 1. File ownership (disjoint)

Every file starts with `// Owner: <WS>` (CSS: `/* Owner: <WS>`). F0 rewrote the Phase 2 headers to the 2b owners; the old owner is kept in brackets, as in `(Phase 2b; was ui-board)`. **A file not listed here belongs to the lead: ask before touching it.**

| WS | Owns (create or modify) |
|---|---|
| **A: visual identity + art** | `src/styles/{tokens,base,board,hud,art}.css` · `src/ui/art/**` (incl. `event-art.ts`) · `src/ui/board/layout.ts`, `src/ui/board/board-cells.ts` · `src/ui/hud/{top-bar,tool-bar,rule-chips}.ts` · `src/assets/fonts/**` · `src/i18n/en/art.ts` · `scripts/palette-check.ts` · `tests/unit/ui/{layout,art-a11y-fx,css-rules,hud,palette-check}.spec.ts` · `tests/e2e/visual.spec.ts` · `dev/art-*` · `docs/phase2b/provenance-A.md` |
| **B: animation, win-flow UI, new screens** | `src/styles/{fx,overlays,screens}.css` · `src/ui/fx/**` · `src/ui/a11y/**` · `src/ui/board/{board-view,board-fx,board-highlight,board-types,gestures,keyboard}.ts` · `src/ui/hud/pills.ts` · `src/ui/overlays/**` · `src/ui/screens/**` · `src/audio/**` · `src/i18n/en/ui-2b.ts` · `tests/unit/shell/**` · `tests/unit/ui/{fx-fish,fx-a11y,board-entry,board-view,pills,gestures,review-fixes}.spec.ts` · `dev/**` except `dev/art-*` · `docs/phase2b/provenance-B.md` |
| **C: logic, save v2, app orchestration** | `src/game/**` · `src/app/**` **except `config.ts`** (incl. `events-chunk.ts`, `win-flow.ts`, `banner-flow.ts`, `event-flow.ts`, `ranking-flow.ts`, `group-flow.ts`, `shop-flow.ts`, `router.ts`, `overlay-chunk.ts`, `boot.ts`, `shell.ts`, `helper-flows.ts`, `session*.ts`, `views.ts`, `store.ts`, `events.ts`, `flags.ts`) · `src/main.ts` · `index.html` · `src/workers/**` · `src/data/events/**` · `src/i18n/en/events.ts` · `scripts/gen-events.ts`, `scripts/verify-levels.ts` · `tests/unit/game/**`, `tests/unit/app/**`, `tests/unit/workers/**`, `tests/unit/layering.spec.ts` · `tests/property/events.spec.ts` · `tests/e2e/{smoke,layout,winflow,events}.spec.ts` |
| **D: platform** | `src/platform/**` (incl. `fb/fb-banner.ts`, `fb-ranking.ts`, `fb-overlay-views.ts`, `fb/views/**`, `fb-groups.ts`, `fb-payments.ts`, `fb-social.ts`; `web/mock-ads.ts`) · `src/env.d.ts` · `src/i18n/en/platform.ts` · `platform-assets/**` · `tests/fixtures/**` · `tests/unit/platform/**` · `tests/e2e/fbig.spec.ts` · `scripts/size-check.ts`, `scripts/zip-fbig.ts`, `scripts/upload-fbig.ts` · `docs/phase2b/fb-dashboard.md` |
| **E: localization** | `src/i18n/index.ts`, `src/i18n/en.ts` (the aggregator and the Phase 2 keys), `src/i18n/{locale,format,plural,meta,build-locales}.ts`, `src/i18n/locales/**`, `src/i18n/en/i18n.ts` · `src/styles/i18n.css` · `scripts/i18n-check.ts` · `tests/unit/i18n/**` · `tests/e2e/i18n.spec.ts` · `docs/i18n/**` · `docs/phase2b/provenance-E.md` |

**Lead (read-only for A–E):** `src/app/config.ts` · `src/i18n/virtual-locales.d.ts` · `scripts/locale-loaders.ts` · `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `tsconfig.json`, `package.json`, `package-lock.json` · `tests/unit/sanity.spec.ts`, `tests/unit/build-config.spec.ts` · `public/**` · `docs/phase2b/{parity-spec,CONTRACTS,provenance-F0}.md`. The lead also updates `docs/provenance.md`, 02, 04, 05, 06, Phase 2 CONTRACTS and STATUS at integration, from the `provenance-*.md` drafts (spec Appendix B).

**Read-only for everyone in 2b:** `src/engine/**` (F0 made the one additive change: `PuzzleId` accepts `E…`, §7.1), `tests/unit/engine/**`, `tests/golden/**`, `src/ui/dom.ts`, the level and daily packs (`src/data/levels/**`, `src/data/daily/**`), the content scripts (`scripts/{gen-levels,gen-daily,gen-pool,level-schedule}.ts`) and their tests (`tests/property/{levels,hints,pipeline}.spec.ts`, `tests/e2e/determinism.spec.ts`). **Exception (review PAR-1, 2026-10-09):** every second Sunday from 2026-10-18 is now a 12×12 G4 daily (`game/ramp.ts` `DAILY_12_FROM`, `isTwelveSunday`), so `gen-daily --from 2026-10` regenerated the daily packs: exactly those 58 days changed (every other day is byte-identical) and the levels manifest's content version changed with them; `verify-levels` reports 0 issues.

**Shared after F0: none.** Need a change in another workstream's file? Ask its owner. Need a change in a lead file (config value, a Playwright project, a package script)? Ask the lead.

Notes:

- **Strings.** Each workstream adds its keys **only to its own `src/i18n/en/*.ts` file** (§6.1). `sanity.spec.ts` fails if a key appears in two files.
- **RTL.** A and B use logical properties in their own stylesheets; E owns only `i18n.css`. A owns every `--font-display` value, the per-script stacks included.
- **Provenance.** A, B and E each keep a `docs/phase2b/provenance-<WS>.md` draft; the lead merges them.

## 2. Layering (04 §2, Phase 2 CONTRACTS §2) — 2b changes

The Phase 2 table holds, with four lead-approved widenings (enforced by `tests/unit/layering.spec.ts`):

| Layer | New in 2b | Why |
|---|---|---|
| `src/i18n/**` | may import `app/config.ts` | locale lists, `rtl`, timeouts (`cfg.i18n.*`) |
| `src/i18n/**` only | may import `virtual:mewdoku-locales` | the build's locale loader map (§5.6) |
| `src/game/**` | may import **types** from `i18n/` | `EventDef.nameKey: I18nKey` (spec §4.2) |
| `scripts/**` | may import `src/i18n/**` and `src/data/**` | `i18n-check` reads catalogues; `palette-check` and `verify-levels` read the event data |

Unchanged and worth repeating:

- `platform/` never imports `game/` values. That is why `RankListView.formatScore` exists (§4.4).
- `ui/` never imports the store, the session or platform values; it gets props and callbacks.
- **Lazy chunks:** a module that belongs to a lazy chunk (§5.5) is never imported statically from a main-bundle module.

## 3. Shared types (fixed in F0)

| Where | What |
|---|---|
| `app/config.ts` | `LocaleId` (17 ids), `ProductId`, `InterstitialTrigger`, `RewardedPlacementId`, `BannerScreen`, `IapProductDef`; all §10 keys (§7.2) |
| `engine/types.ts` | `PuzzleId` = `` `T${number}` \| `L${number}` \| `D${string}` \| `E${string}` `` |
| `game/types.ts` | `ModeId` + `'event'` · `EventId` · `BoardKey` · `InProgressV2` · `SettingsV2` (= `Settings & { locale: 'auto' \| LocaleId }`) · `EventRecord` · `GroupRecord` · `SaveDataV2` · **`SaveData` = `SaveDataV2`** (everything that holds a live save uses `SaveData`; `SaveDataV1` is only the stored Phase 2 shape) · re-exports `LocaleId`, `ProductId` |
| `game/events.ts` | `EventDef`, `EventTheme`, `EventPageArt`, `EventAccessory`, `Reward`, `Milestone`, `EventDefCheck`, `EventWinResult`; `eventPuzzleId(id, i)` = `E<id>/<i>`; `eventBoardKey(id)` = `event_<id with - → _>` (both implemented) |
| `platform/types.ts` | re-exports `BoardKey`, `ProductId` · `Capabilities` + `overlayViews`, `groups` (`leaderboards` and `payments` reused) · `InterstitialPlacement` + `'event_next'` · `RewardedPlacement` + `'group_double'` · `PlatformAds.banner?` · `RankEntry`, `RankingCaps`, `RankListView`, `RankingProvider` · `GroupProvider` · `Product`, `Purchase`, `PurchaseFailReason`, `PaymentsProvider` · `PlatformAdapter.ranking?`, `.groups?`, `.payments?` · `leaderboards?` is `@deprecated` · `PlatformStorage.save(data: SaveData, …)` |
| `app/store.ts` | `ScreenId` + `'event'` · `OverlayId` + `'ranking' \| 'victory' \| 'shop' \| 'rank_hub' \| 'group_result'` · `UiState` + `locale`, `dir`, `bannerReserved` · `AppState.save: SaveData` |
| `app/events.ts` | bus events `'locale:changed'`, `wallet`, `'rank:result'` (payload `RankResult`); analytics rows `event_start`, `event_win`, `event_milestone`, `rank_panel`, `group_create`, `group_result`, `iap` (in `ANALYTICS_PARAM_KEYS`; the logEvent limits test covers them) |
| `app/flags.ts` | `events`, `banners`, `shop`, `rankings` **on**; `groupChallenges` **off** (§14 G2) |
| `app/router.ts` | `OverlayPropsMap` has the five new overlays; `loadOverlayChunk()` returns their factories |

## 4. Cross-workstream APIs (spec §12.3, as built)

### 4.1 A → B

| API | Where | Status |
|---|---|---|
| `icon(id)` with `icon-fish`, `icon-plus`, `icon-shop`, `icon-globe`, `icon-crown`, `icon-users`, `cat-ear-flick`, `acc-lantern`, `acc-scarf`, `acc-yarn` | `ui/art/sprite.ts` | **final art (A)**; the `acc-*` symbols moved to the lazy `ui/art/accessories.ts` (`mountAccessories()`, re-exported by `event-art.ts`), added to the sprite when the events chunk loads |
| `illustration(kind)`, `mascotIllustration(kind)` | `ui/art/illustrations.ts`, `mascot.ts` | unchanged signatures; today's art is the interim until Tux lands; the Home mascot animates itself (§2.9) |
| `eventArt(def, 'card' \| 'header'): HTMLElement`, `eventPatternUrl(art)` | `ui/art/event-art.ts` (lazy `events` chunk) | **implemented (A)**; the Home card gets it through `HomeEventCardView.art` once the chunk has loaded (§11) |
| `xEdgeColor(paletteIndex, c?)` | `ui/art/palette.ts` | **implemented** (`mixHex(tile, TOKENS.ink, layout.markEdgeMix)`) |
| `evenInsets(n, slotPx, c?): CellInsets[]` | `ui/board/layout.ts` | **implemented**; `board-view` uses it and re-applies it when the slot crosses `layout.insetSmallBelowSlot`. `regionInsets` is `@deprecated`; A deletes it (and its test) |
| `buildCell(…)` DOM: `span.cell__glow` (every cell, between tile and SVG) and `use.cell__ear` (`href="#cat-ear-flick"`, in each cat group after the blink lid) | `ui/board/board-cells.ts`, `styles/board.css` | **nodes in place, invisible**: `.cell__glow` opacity 0 and size 0, `.cell__ear` shown only under `.cell.is-flick`. A styles the glow (radial `--glow`, `fx.win.glowScale` × slot) and adds the X edge underlay `.cell__xe` and `--xe` |
| `createTopBar(props, cb, slots?: { lead?: HTMLElement })` | `ui/hud/top-bar.ts` | **implemented**: `.top-bar__slot` sits after the safe-zone lead and before the title; A styles it |
| `.screen[data-banner]` reserve rule and `--banner-reserve` | `styles/base.css` | A (CSS) |

### 4.2 B → B (shared component)

`createFishPill(props: FishPillProps): FishPillView` in `ui/hud/pills.ts` (`FishPillProps { count, onPlus: (() => void) | null }`; `FishPillView.iconRect()`). Home puts it in the top bar's `lead` slot; the victory screen uses it too. The in-game pill lives in `PillsView` (`showFish`, `fishRect`, `fishLabel`).

### 4.3 B → C (UI contracts C calls or fills) and C → B (selectors)

| B export | Where | Notes |
|---|---|---|
| `flyFish(layer, from: DOMRect[], to: DOMRect, opts: FlyFishOptions): FxHandle` | `ui/fx/fish-flight.ts` | `FlyFishOptions { sizePx, reduced, onArrive?(i) }`; `FxHandle { done, cancel(), finish() }` (`finish()` jumps to the end state for the hidden-page rule, §2.2); also `fishSourceRows(n)`, `fishControlPoint(s, t, i)`, `fishSizePx(slot)`, `ensureFxLayer(root)` |
| `playGlow(board, cells, reduced): FxHandle` | `ui/fx/glow.ts` | C calls it through `GameScreen.glow(cells)` |
| `playScreenTransition(oldEl, newEl, kind: 'to_game' \| 'from_game', reduced): Promise<void>` | `ui/fx/transitions.ts` | called by C's `router.replaceScreen` |
| `BoardView.playEntry(): number`, `GameScreen.playEntry(): number` | `ui/board/board-types.ts`, `ui/screens/game-screen.ts` | returns `entryEndMs(n)`. F0 returns the cap `fx.boardEntryMs` (reduced: `reducedMotionFadeMs`); C schedules `START` from the return value |
| `GameScreen.fishRect()`, `showFishPill(count)`, `fishLabel(text)`, `glow(cells)` | `ui/screens/game-screen.ts` | the win-flow hooks: C never touches B's DOM |
| `HomeView.fish`, `HomeView.event: HomeEventCardView \| null`, `HomeView.bannerReserved`; `HomeCallbacks.onShop`, `.onEvent` | `ui/screens/home-screen.ts` | the event card renders in the extra-cards area (spec "event card variant of `extraCards`"); `extraCards` stays for Phase 3 |
| `GameView.event: { def, index } \| null` | `ui/screens/game-screen.ts` | title "{event} · {index+1}", `data-event-theme`, accessory |
| `RankingPanelProps` (+ `RankingListState`, `RankMineView`, `RankScoreView`, `PersonalRecordsView`, `RankingResultView`, `RankingBoardKind`) | `ui/overlays/ranking-panel.ts` | the list states are exactly §2.4's: loading, overlay, see_top, mine, records. `onListArea(rect)` hands the list rect to C for `showList(…, rect)` |
| `VictoryProps` (+ `VictoryVariant`, `VictoryDailyView`, `VictoryEventView`) | `ui/overlays/victory-screen.ts` | `bannerReserved` is a prop |
| `ShopProps` (+ `ShopBuyState`, `ShopProductView`) | `ui/overlays/shop-sheet.ts` | |
| `RankHubProps` (+ `RankHubTab`, `RankHubGroupsView`) | `ui/overlays/rank-hub.ts` | |
| `GroupResultProps` (+ `GroupResultOutcome`) | `ui/overlays/group-result.ts` | `participation` never renders "won" |
| `EventScreenView`, `EventScreenCallbacks`, `createEventScreen` | `ui/screens/event-screen.ts` (lazy `events` chunk) | `bannerReserved` in the view |
| `RewardedPromptProps.swap?: { price, balance, onSwap() }` | `ui/overlays/rewarded-prompt.ts` | |
| `SettingsProps.language?`, `.onShop?`, `.onRemoveAds?` | `ui/overlays/settings-modal.ts` | optional; absent means the row is hidden |
| `SfxId` + `'fish_pop'`, `'fish_plink'` (`opts.index` = fish index) | `audio/sfx.ts` | F0 placeholder recipes (our own simple synth voices); B designs them |

C → B: `selectHomeView` (now fills `fish`, `bannerReserved`; `event: null` until C), `selectGameView` (`event: null` until C), and the stubs `selectVictoryView → VictoryData`, `selectRankingView → RankingData`, `selectEventView → EventScreenView | null` in `app/views.ts`. Their **return types** are the contract; C may change their parameter lists.

### 4.4 D → C

`platform.ads.banner?` (`show('bottom'): Promise<AdResult>`, `hide()`), `platform.ranking?`, `platform.groups?`, `platform.payments?` and `capabilities()` (`banner`, `leaderboards` = `ranking.caps().global`, `overlayViews`, `groups`, `payments`). All of them never reject. As built (D): `RankingProvider.showList` resolves `{ close(): void; readonly closed?: Promise<void> } | null`; `caps().global` (so `capabilities().leaderboards`) also needs at least one board id in `VITE_FB_LEADERBOARDS`; on FB `platform.ranking` is always defined and `platform.groups` / `platform.payments` are getters (the social code lands lazily after `start()`). Integration adds `RankListView.keep?(score)` (§11); the review fixes add `RankingProvider.top(board, n, keep?)`, `RankingProvider.supports?(board)` and `RankListView.formatMine?(score)` (§11.7).

`RankListView.formatScore(score)` is supplied **by C**: C decodes with `game/scoring.ts` and formats with i18n. D renders rows `{ id, rankText, scoreText, isMe }` (`fb/views/rank-list.ts`) only from entries the API returned.

D's stubs: `bannerSupported`, `createFbBanner` (main bundle); `probeRankingApi`, `parseLeaderboardMap`, `createFbRanking`, `createFbOverlayViews`, `rankListTemplate`, `groupsSupported`, `createFbGroups`, `paymentsSupported`, `createFbPayments`, all re-exported by `fb/fb-social.ts` (the lazy `fb-social` chunk). The web adapter leaves `ranking`, `groups` and `payments` undefined.

### 4.5 E → all

From `src/i18n` (index):

- unchanged: `t`, `translate`, `tn`, `formatShortDate`, `formatClock`, `formatDuration`;
- **`setLocale(input: string | readonly string[], opts?: SetLocaleOptions): Promise<LocaleId>`** (was synchronous; boot and Settings → Language are the callers; `opts.override` is the saved choice, `opts.doc` the document whose `lang`/`dir` it sets);
- `getLocale()`, `getDir(): 'ltr' | 'rtl'`, `onLocaleChanged(cb): unsubscribe`, `buildLocales(): readonly LocaleId[]` (the locales this build contains, for the Language row);
- `formatNumber(n)` (Latin digits);
- as built (E, additive): `prefetchLocale(id)`, `prefetchGuess(nav?)`, `localeName(id)`, `stripIsolates(s)`; re-exports `resolveLocale`, `guessLocale`, `normalizeTag`, `isLocaleId`, `localeCandidates`; types `PluralExtraKey`, `LocaleCatalog` (accepts extra plural forms); `LOCALE_NAMES` in `en/i18n.ts`; `formatShortDateFor` returns `string | null`; `tn()` formats `{count}` with `formatNumber`.

F0 implemented minimal working versions of these, so A–D can call them today. E replaces the internals: `locale.ts` resolution, `plural.ts` with Intl.PluralRules in `tn`, `format.ts`, bidi isolation, and chunk loading in `setLocale`. The signatures stay.

### 4.6 C-internal stubs (C may reshape)

`game/`:

- `events.ts`: `validateEventDef`, `activeEvent`, `teaserEvent`, `milestonesBetween`, `applyEventWin`;
- `scoring.ts`: `pointsFor`, `dayIndex`, the encoders, `decodeScore`, `canSubmit`;
- `purchases.ts`: `isRecorded`, `applyPurchase` (`ledgerEntry`, `parseLedgerEntry` and `productDef` are implemented);
- `economy.ts`: `fishForWin`, `addFish`, `spendFish`, `canAfford`;
- `ad-pacing.ts`: `bannerGate`.

`app/`: `createWinFlow`, `createBannerFlow`, `createEventFlow`, `createRankingFlow`, `createGroupFlow`, `createShopFlow`.

`scripts/`: `gen-events.ts` (`genEvents`).

The B, D and E calls these modules make are fixed (§4.3–4.5); their own deps and handles are C's to design.

## 5. Data flow

### 5.1 Win flow (spec §2.2, level mode; t = 0 at `WON`)

```
WON ─► session.onWon ─► winBookkeeping: applyLevelWin + fish (economy) + points (scoring) [+ applyEventWin]
       └► saves.critical()                          rewards are saved BEFORE any animation (t = 0)
       └► ranking-flow: submit(board, score) FIRST → rank.pending on failure; then fetch mine + top (≤ rank.fetchTimeoutMs);
          flushPending({ except: board }) once the submit settled
       └► win-flow.start({ screen, catCells, fishSources, fishBefore, fishBase, fishBonus, reduced })
            300   screen.glow(catCells)                         (B: playGlow on .cell__glow)
            1000  screen.showFishPill(fishBefore)               (B: PillsView, centred, no "+")
            0     GameView.chromeLocked = true (Home and Gear aria-disabled; win-flow onBlockingChange)
            1200  flyFish(ensureFxLayer(root), rects, screen.fishRect(), { onArrive, onPop })
                    onPop(i)    → sfx 'fish_pop' {index: i}
                    onArrive(i) → screen.showFishPill(n+1) + sfx 'fish_plink' {index: i} + haptics.fish
            2550  screen.fishLabel('+3')   2900  fishLabel('+2') + showFishPill(total)   (bonus only)
            4200  screen.showScrim()      4500  router.open('ranking', …); chromeLocked = false
            tap ≥ rank.panelTapMinMs → the panel fades (.is-leaving, rank.panelOutMs) → router.open('victory', …), close 'ranking'
            "Level N" → interstitial gate (trigger by mode) → next session → transition 'to_game' → board entry → START at playEntry()
       teardown (Home, overlay:failed, dispose): win-flow.cancel() — rewards already saved
```

### 5.2 Rankings

`RankingProvider` (D) → `ranking-flow` (C) emits `'rank:result'` and decides the `RankingListState` (B renders it):

| What the provider gives | What the panel shows |
|---|---|
| `caps().overlayInRect` | `overlay` (C calls `showList(board, view, rect)` with the rect from `onListArea`) |
| overlay views, not in a rect | `see_top` (my line + "See top players" → `showList` without a rect) |
| no overlay views | `mine` |
| nothing, a timeout or `api: 'none'` | `records` (`local` / `unavailable`) |

`rank_panel` analytics.

### 5.3 Banners

Screen mount → C's `banner-flow`: `bannerGate`, then the 60 s window, then `platform.ads.banner.show('bottom')`, and `UiState.bannerReserved = true` → views → B sets `data-banner` → A's CSS reserves `ads.banner.reservePx`. `hide()` runs before unmount, before a transition to the game screen, before any interstitial or rewarded ad, and before a modal opens.

### 5.4 Purchases

Shop sheet (B) → `shop-flow` (C):

1. `payments.purchase(id, playerId:nonce)` (D);
2. `applyPurchase(save, p)`, which records the ledger entry;
3. `saves.critical()`;
4. `payments.consume(token)`.

The boot restore replays the same order (tokens already in the ledger are only consumed). `iap` analytics.

### 5.5 Lazy chunks (vite.config.ts + `scripts/locale-loaders.ts`)

| File | Entry (one dynamic import each) | Loaded |
|---|---|---|
| `assets/overlay-chunk-*.js` | `src/app/overlay-chunk.ts` | as in Phase 2; now also ranking, victory, shop, rank hub, group result |
| `assets/events-*.js` | `src/app/events-chunk.ts` (event screen + event art) | when an event is active or teased (C's `event-flow.preload()`) |
| `assets/fb-social-*.js` | `src/platform/fb/fb-social.ts` | by D's `fb/index.ts` after `start()`, never blocking the first route |
| `assets/social-flows-*.js` | `src/app/social-flows.ts` (rankings hub, event top list, group flows) | by `boot.ts` on first use (C; named explicitly at integration) |
| `assets/overlay-chunk-*.css`, `assets/events-chunk-*.css` | `src/styles/overlay-chunk.css`, `events-chunk.css`, imported by the two barrels | with their chunk (Vite `cssCodeSplit`, integration) |
| `assets/locale-<id>-*.js` | `src/i18n/locales/<id>.ts` through `virtual:mewdoku-locales` | by `setLocale` (E) |

Chunk names come from `chunkFileName()` in `scripts/locale-loaders.ts`, so `size-check` (D) can budget them by name.

Rolldown `codeSplitting` groups were **not** used: they pull the captured modules' dependencies into the group by default, which would drag shared code out of the main bundle.

### 5.6 Locales (spec §6.7 step 4)

`virtual:mewdoku-locales` exports `BUILD_LOCALES` and `LOCALE_LOADERS`, generated per build mode:

- **release modes** list `i18n.releaseLocales`;
- **every other mode** (dev, e2e, web, fbig, tests) lists `i18n.locales`.

Only locales that have a catalogue file are included, so E can add files one by one. A catalogue file is `src/i18n/locales/<id>.ts` exporting `catalog: LocaleCatalog` (`Partial<Catalog>`). Read it through `src/i18n/build-locales.ts` (`buildLocaleIds()`, `localeLoader(id)`). Adding a file needs a dev-server restart.

### 5.7 Save v2

`migrate()` runs `MIGRATIONS[1] = migrate_1_to_2` (`game/save-v2.ts`), then `validateV2`. Storage keys stay `mewdoku.save.v1` and the cloud key `save` [DECISION, §9.2].

`merge()` applies the 04 §7.3 rules plus `mergeV2Fields`. Then `clearStaleSlots` clears an event slot whose index is below `events[id].solved`.

## 6. Conventions

1. **Config.** Read every tunable from `cfg` and take `c: GameConfig = cfg` last. Frozen after F0: ask the lead. CSS-only motion constants (keyframe %, angles, scales) may be custom properties at the top of your own stylesheet (spec §0.4); anything JS reads lives in config.
2. **Strings.**
   - Add keys only to your own `src/i18n/en/<file>.ts`: A `art.ts`, B `ui-2b.ts`, C `events.ts`, D `platform.ts`, E `i18n.ts` (plus E's Phase 2 keys in `en.ts`).
   - Never rename or remove a key or change its placeholders. Plurals are `.one` / `.other` pairs.
   - Copy is ours: "fish", never "golden fish"; the booster is "kitty".
   - The M1 copy freeze is day 4.
   - `sanity.spec.ts` checks the banned phrases (06 §3 plus "Meow Cup", "Long Live Meow", "Moonlit Meows" and "golden fish") in **every** catalogue, and that no key exists in two files.
3. **Never fabricate** a player, a rank, a score or a list row. Show fewer rows, or personal records with an honest line (spec §5.1).
4. **Tokens only.** No colour literal outside `tokens.css` (allowlist in A's `css-rules.spec.ts`, spec §1.12). The retired ginger and teal values must disappear from `src/` (A's guard).
5. **Placeholders.** Until A's final art lands, B uses the F0 placeholder shapes and today's cat art behind the same ids and exports. Nothing ginger ships (spec §1.8).
6. **Stubs.** `throw new Error('not implemented: <name> (<WS>, phase2b §x)')`. A stub reached by the running app must be a safe minimal version instead.
7. **Tests.** Each workstream writes and runs the tests in its own paths (§1). Fake clocks (`createFakeClock`), not real time. Vitest projects: `unit` (Node), `dom` (jsdom: `tests/unit/ui/**`, `tests/unit/shell/**`) and `property`.
8. **Playwright projects.**
   - `web-390` runs every spec but `fbig.spec.ts` (smoke, layout, winflow, events, visual, i18n).
   - `web-320` runs layout, visual and i18n.
   - `web-1280` runs layout and visual.
   - `fbig-390` runs `fbig.spec.ts`; its build gets `VITE_FB_PLACEMENT_BANNER=e2e-banner` and a `VITE_FB_LEADERBOARDS` map for all five boards.
   - Never run `playwright install`.
9. **Browser baseline** (04 §1): ES2020, iOS Safari 14. No `Intl.ListFormat`; no flex `gap`, `dvh` or `:has()` in CSS.
10. **Clean room** (spec §0.2, 06): our own art, sounds and words only; nothing sampled from the original (R6); a provenance row for every new asset.

## 7. F0 decisions and deviations from the spec text (lead)

### 7.1 Types and layering

| # | Spec text | As built | Why |
|---|---|---|---|
| 1 | `LocaleId` in `game/types.ts` | defined in `app/config.ts` (it types `cfg.i18n.*`), re-exported by `game/types.ts` and `i18n` | config is the leaf every layer may import; i18n may not import game |
| 2 | `BoardKey` in `platform/types.ts` | defined in `game/types.ts` (needed by `SaveDataV2.rank`), re-exported by `platform/types.ts` | game may not import platform |
| 3 | `inProgress.event` id `E<eventId>/<i>` | `engine/types.ts` `PuzzleId` + `` `E${string}` `` (the one engine change of 2b) | otherwise the slot id does not typecheck |
| 4 | `RankListView { title, scoreFormat, highlightMe, count }` | + `formatScore(score): string` | the overlay rows need decoded scores, and platform may not import `game/scoring.ts` |
| 5 | — | layering widenings of §2 | spec needs (`I18nKey` in `EventDef`, `cfg.i18n` in i18n, scripts reading catalogues and event data) |
| 6 | "`HomeView.event`" and "`extraCards` gets the event card" | `HomeView.event: HomeEventCardView \| null`, rendered in the extra-cards area | one typed source |
| 7 | B → C lists `fishRect`, `showFishPill` | + `GameScreen.fishLabel(text)`, `GameScreen.glow(cells)`; `PillsView.showFish/fishRect/fishLabel` | C drives every §2.2 step without touching B's DOM |
| 8 | `flyFish(…): { done; cancel() }` | + `finish()` | the hidden-page rule (§2.2: missed steps run, jumped to their end state) |
| 9 | `selectHomeView.extraCards`… | see 6; `selectVictoryView` / `selectRankingView` return `Omit<Props, callbacks>` | callbacks are bound by the flows |

### 7.2 Config additions beyond the §10 table

These are prose values from the spec, so that nothing JS reads is a magic number:

- `fx.screenBackInMs` 200 (§2.9 table, row 2);
- `fx.win.fishPathSamples` 12 (§2.3);
- `fx.win.reduced.glowInMs` 150, `plusLabelInMs` 150 and `plusLabelOutMs` 600 (§2.7).

Every §10 key and changed value is in place. `layout.insetSamePx` and `insetDiffPx` are `@deprecated` and keep their values.

### 7.3 Build

| Spec | As built |
|---|---|
| "`vite build --mode release`" | two modes: `release` (web, `dist/release-web`) and `release-fbig` (`dist/release-fbig`). `npm run build:release` = both, then `i18n:check --release`. D points `zip-fbig` at `dist/release-fbig` for the production zip (spec §6.7) |
| "the lazy chunks `events`, `fb-social`" | barrel modules plus `chunkFileNames` (§5.5) |
| `package.json` | new scripts `events:gen`, `i18n:check` and `build:release`; `verify` gains `i18n:check` |
| `scripts/i18n-check.ts` (E) | F0 baseline: list sanity always; with `--release`, review-log lines and no stray `locale-*` chunk. E adds the catalogue rules |
| `scripts/gen-events.ts` (C) | stub, exits 1 |
| `tsconfig.json` | `allowImportingTsExtensions`, so `vite.config.ts` can import `scripts/locale-loaders.ts` with an explicit extension (no Vite native-loader warning) |
| `src/main.ts` | imports the new empty `art.css` (A), `screens.css` (B) and `i18n.css` (E) |
| `index.html` | no F0 change needed; C owns it from now on |

### 7.4 Working baselines F0 implemented (so the app runs; owners refine)

- **Save v2 (C).**
  - Done: `SAVE_VERSION` 2, v2 `defaults()`, `migrate_1_to_2` exactly per §9.2, and validation of every new field (ranges, id and ledger patterns, dedupe, caps).
  - Done: the §9.3 merge rows (wallet newer; points max; events by more solved, then smaller ms; groups union with max; `noAds` OR; ledger union, newest 50; `rank.pending` newer; event slot newer) and clearing an event slot below `events[id].solved`.
  - **Left to C (done in 2b):** the paid-grant repair (needs `applyPurchase`) and clearing an event slot whose event has ended.
  - Tests: `save.spec.ts` has 10 new cases.
- **Event mode (C).** Registered in `MODES` (slot `event`, `winFlow: 'event'`, gate `event_next`, HUD title `event`); `restoreGame` and slot validation accept `E…` ids. F0's `winBookkeeping` threw for event wins; C implemented them.
- **i18n (E).** `setLocale` is async but keeps the Phase 2 lookup, and boot calls it without awaiting, so the boot timing is unchanged. `getDir`, `onLocaleChanged`, `buildLocales` and `formatNumber` work.
- **Board (B/A).** `evenInsets` replaces the region-aware insets in `board-view`. `.cell__glow` and `.cell__ear` nodes and their hiding CSS are in place.
- **Top bar (A).** The lead slot is implemented.
- **Sounds (B).** `fish_pop` and `fish_plink` have placeholder recipes.
- **Ownership headers.** 174 existing files had their `Owner:` header updated to the 2b owner (§1).

## 8. Stubs to implement, by workstream

| WS | Throwing stubs (fill these) | Already working (refine or replace) |
|---|---|---|
| A | `eventPatternUrl` | `eventArt` (placeholder), `xEdgeColor`, `evenInsets`, the top-bar slot, the placeholder symbols, the inert cell nodes; plus all of spec §1 (tokens, Tux, white X with edge, retired-look guard, fonts) |
| B | `flyFish`, `fishSourceRows`, `fishControlPoint`, `fishSizePx`, `ensureFxLayer`, `playGlow`, `playScreenTransition`, `createFishPill`, `PillsView.showFish/fishRect/fishLabel`, `GameScreen.glow`, `createRankingPanel`, `createVictoryScreen`, `createShopSheet`, `createRankHub`, `createGroupResult`, `createEventScreen` | `playEntry(): number` (returns the cap), the `fish_*` sounds |
| C | `validateEventDef`, `activeEvent`, `teaserEvent`, `milestonesBetween`, `applyEventWin`, `pointsFor`, `dayIndex`, `encode*Score`, `decodeScore`, `canSubmit`, `isRecorded`, `applyPurchase`, `fishForWin`, `addFish`, `spendFish`, `canAfford`, `bannerGate`, `createWinFlow`, `createBannerFlow`, `createEventFlow`, `createRankingFlow`, `createGroupFlow`, `createShopFlow`, `selectVictoryView`, `selectRankingView`, `selectEventView`, `genEvents` | save v2 baseline (§7.4), event mode registration, `eventPuzzleId`, `eventBoardKey`, ledger helpers |
| D | `bannerSupported`, `createFbBanner`, `probeRankingApi`, `parseLeaderboardMap`, `createFbRanking`, `createFbOverlayViews`, `rankListTemplate`, `groupsSupported`, `createFbGroups`, `paymentsSupported`, `createFbPayments` | capabilities report `overlayViews: false`, `groups: false` until the probes exist |
| E | `normalizeTag`, `resolveLocale`, `guessLocale`, `pluralCategory`, `formatShortDateFor`, `isolate` | `setLocale` (async), `getDir`, `onLocaleChanged`, `buildLocales`, `formatNumber`, `i18n-check` baseline, empty `META` |

## 9. What changed for a player at F0 (interim, intended)

The §10 values are live, while the code that uses them is still to come:

| Area | Change | Who finishes it |
|---|---|---|
| Board entry | `START` comes at 700 ms (`fx.boardEntryMs`), not 250. The old row stagger reads `boardEntryStaggerMs` 18, so the interim entry runs longer | B's diagonal wave |
| Win | the Phase 2 O3 win overlay opens 4.5 s after `WON` (`fx.winOverlayDelayMs`); its Next button enables after 600 ms | C's win flow fills the 4.5 s with glow, fish and the ranking panel |
| Board look | even gutters (1.5 px below a 30 px slot, 2 px from 30 px) instead of region-aware gaps; card padding 10 and radius 18; tile radius 0.2; cat 0.84; X 23→77 with a 12-unit stroke at **full ink** (`markOpacity` 1) | A makes the X white with its edge |
| Strings | the four cat descriptions say "black-and-white cat" | A draws Tux to match (the art is still the interim cat until then) |
| Flags | `events`, `banners`, `shop`, `rankings` default on | nothing uses them yet |

**Bundle at F0** (raw, `size-check`, still within the Phase 2 ceilings that D raises per spec §11):

| | Web | FBIG |
|---|---|---|
| Main JS | 179.8 KB | 187.7 KB (Phase 2: 173.3) |
| CSS | 37.9 KB | 37.9 KB |
| First load | 234.9 KB | 242.9 KB |
| Lazy JS | 46.4 KB | 46.1 KB |
| Files | 58 | 51 |

FBIG main JS grew by about 14 KB: the English strings, the save v2 baseline, config and the sprite placeholders. It now sits 2.3 KB under the old 190 KB ceiling.

## 10. Test splits done at F0 (spec §12.1 item 8)

| From | To | Owner |
|---|---|---|
| `tests/unit/ui/hud.spec.ts`: pills cases | new `tests/unit/ui/pills.spec.ts` | B |
| `tests/unit/ui/art-a11y-fx.spec.ts`: fx and a11y cases | new `tests/unit/ui/fx-a11y.spec.ts` | B (the sprite, illustration and palette cases stay with A) |
| `tests/unit/ui/review-fixes.spec.ts`: `readViewport` and large-text `computeLayout` cases | `tests/unit/ui/layout.spec.ts` | A (`review-fixes` stays with B) |

New lead tests:

- `tests/unit/build-config.spec.ts`: locale lists per mode, the generated module, chunk names;
- `tests/unit/sanity.spec.ts`: banned phrases over every catalogue, the per-owner key split, the Appendix A values.

## 11. Integration (2026-10-09): the final APIs and what changed since F0

Every F0 stub of §8 is implemented. This section lists each signature or behaviour that differs from §3–§8, by producer. All are additive unless marked **changed** or **removed**.

### 11.1 C (logic, app)

| What | As built |
|---|---|
| `EventDef.gen` | optional `{ sizes, band }` in `events.json`; `gen-events.ts` and the runtime substitute build each puzzle from it |
| `game/events.ts` | + `EventPack`, `eventSizeSchedule`, `eventSpec`, `usableEventDefs` (the light runtime check; the full validator runs only in tests and scripts), `clearEndedEventSlot` |
| Event packs | `src/data/events/<id>.json`, named by `events.json`, not in the read-only levels manifest; `verify-levels` finds them through `events.json`; records carry `i = index + 1` |
| `PuzzleSource` | + `'event_pack'` |
| `SessionRequest` | + `{ mode: 'event', eventId, index }`; `SessionMeta.event?` |
| `SessionDeps` | 2b fields (`events`, `goEvent`, `rankings`, `groups`, `banners`, `openShop`, `root`, `winFx`); integration: `events.preload?()`, called when an event board mounts (its accessories live in the events chunk) |
| `Router` | + `showEvent(view, cb)`; `RouterFactories.screenTransition`, `loadEventScreen`, `eventScreen` |
| `GateDecision` | + `'no_ads'` |
| `E2EHooks` | + `solve()` |
| New modules | `rank-hub-flow.ts`, `social-flows.ts` (lazy chunk `social-flows`) |
| `win-flow.ts` | `WinFlowDeps.onBlockingChange?(blocking)`; the timeline has a `scrim` step at `fx.win.scrimAtMs` (not with reduced motion, not for the tutorial variants) calling `GameScreen.showScrim?()`; fish pops play `fish_pop` from `FlyFishOptions.onPop` while B's flight runs (the flow's own pop steps only without a flight); **changed:** `continueFromRanking()` opens the victory `rank.panelOutMs` later (the panel's fade-out), as a step on the flow clock (teardown cancels it, a hidden page catches it up) |
| `views.ts` | `ViewContext.chromeLocked?` → `GameView.chromeLocked`; `ViewContext.eventArt?` → `HomeEventCardView.art` |
| `ranking-flow.ts` | **changed:** `flushPending(opts?: { except?: BoardKey })`; `showList(board, title, rect?, eventTotal?, day?)`; `ListContext.day?`; new `dayFilter(board, day)` (daily_fastest keeps only the shown day, spec §5.3) |
| Session order at `WON` | **changed:** `submit` starts before `fetch` (spec §5.5 steps 2 then 3); older queued scores are flushed after it, except the same board's |
| `OverlayId` | **removed:** `'win'` (the Phase 2 O3 win overlay, replaced by the victory screen; `win-overlay.ts`, `fx/confetti.ts`, their CSS and `fx.confettiMs` / `fx.confettiCount` are gone). O7 `daily_result` stays for reopening a solved daily from Home |
| Fish | bought fish (IAP) do not count toward `wallet.earned` |

### 11.2 B (animation, screens)

All optional, so existing callers compile: `FlyFishOptions.onPop`, `GameScreen.showScrim?()`, `GameView.chromeLocked?`, `PillsProps.reducedMotion?`, `HomeEventCardView.art?`, `BoardViewOptions.random?`. One required member: `BoardView.setAccessory(acc)`. The rankings hub's event tab reads "Event" (`rank.tab.event`).

### 11.3 D (platform)

| What | As built |
|---|---|
| `RankingProvider.showList` | resolves `{ close(): void; readonly closed?: Promise<void> } \| null` |
| `RankListView.keep?(score)` | integration: entries the list may show (daily_fastest: the shown day only); fewer rows, never padded; my pinned row only when kept |
| New main-bundle modules | `fb/fb-probe.ts` (probes, `parseLeaderboardMap`), `fb/fb-social-glue.ts` (facades over the lazy chunk, so `capabilities()` is final after `init()`) |
| Ranking reads | wait for an in-flight submit on the same board (read after write) |
| `size-check.ts` | integration: CSS row = the stylesheet `index.html` links; new rows "First load (gzip)", "Lazy CSS"; `social-flows` counts as optional lazy JS; ceilings in 04 §9 |
| `zip-fbig.ts` | production zip from `dist/release-fbig` (locale guard); `--preview` for `dist/fbig`; e2e builds refused; hard 1 MB on the zip's bytes, warning above 750 KB |

### 11.4 E (i18n)

See §4.5 ("as built"). `?i18n=pseudo` (dev and e2e builds only) applies the `xx-long` pseudo-locale over the active catalogue; it is a URL switch, not a `LocaleId`.

### 11.5 A (art)

Tokens added beyond the spec's §1.4 table: `--board-card`, `--glow-0`, `--page-rgb`, `--scrim-rgb`, `--accent-shadow-rgb`, `--fs-btn`, `--font-num`, `--display-weight`, `--stage-off`, `--stage-off-edge`, `--card-off`, `--gold-soft`, `--heart-empty-line`, `--side-dot-a`, `--side-dot-b`, `--banner-reserve`; `--gold-deep` is `#DD9A12`. Display-face text uses `var(--display-weight)` (600 Latin, 700 system-font scripts) and digits `.num` / `var(--font-num)`. The X edge draws in with `--x-draw-ms` / `--x-draw-gap`, shared with B's X draw-in.

### 11.6 Lead (build, styles)

- **CSS code splitting** (`vite.config.ts` `cssCodeSplit: true`). `src/styles/overlay-chunk.css` (imported by `app/overlay-chunk.ts`) holds every rule that styles a lazy overlay; `src/styles/events-chunk.css` (imported by `app/events-chunk.ts`) the event screen and the event art. The rules moved unchanged and in source order; a lazy stylesheet loads after the main one, so the reduced-motion and media-query rules that override moved rules moved with them. Rule for new CSS: style a lazy-only element in its chunk's stylesheet; a rule in a main stylesheet that must win over a lazy rule needs a higher specificity, not a later position.
- `chunkFileName` names `social-flows-*.js`.
- Physical spacing in A's and B's stylesheets is logical now (E's list); `i18n.css` keeps only the absolute offsets (`inset-inline-*` needs iOS 14.1) and the forced-LTR `.boot__pct`.
- Favicon and `theme-color` use the Classic colours (`#E57010`, `#FFF4E6`; `theme-color` = `--page` `#FAF6F0`); `css-rules.spec.ts` guards the page shell too.
- `tests/unit/sanity.spec.ts` imports `BANNED_PHRASES` from `scripts/i18n-check.ts` (one list).
- `package.json`: `release:fbig` = verify → `build:release` → `size -- dist/release-fbig` → `zip:fbig`; new `zip:fbig:preview`.

### 11.7 Review fixes (2026-10-09): API changes after the six-lens review

The fixer groups P (platform, banner, data), R (app core, performance) and U (UI, accessibility, i18n), then the lead, changed these signatures. All are additive unless marked **changed**; every one has tests (STATUS-2b §11).

| Area | What |
|---|---|
| `RankingProvider` (D) | `top(board, n, keep?)`: with `keep` (daily_fastest) the shown day's band is read past next-day entries (≤ `BAND_MAX_PAGES` = 4 pages of 50) and numbered inside it (FB2B-4). `supports?(board)`: false without a board id or after `LEADERBOARD_NOT_FOUND` (latched for the session, FB2B-6) |
| `RankListView` (D) | `formatMine?(score)`: the text of **my** row when it differs from `formatScore` (the solve just made shows my exact time, FB2B-7) |
| `ranking-flow.ts` (C) | `fetch(board, day?)`; **changed:** `showList(board, title, rect?, eventTotal?, day?, mine?)` (`mine`: my `RankScoreView`, FB2B-7); new `formatScoreView(view)` |
| `BannerFlow` (C) | `entitlementChanged()`: No Ads became true (purchase, boot restore, late merge) → the banner and its reserve go (L2B-2). `fb-banner`: `HIDE_RETRY_MS`, `HIDE_RETRIES`, `stuckLoadMs()` (FB2B-1) |
| `ShopFlowDeps.onOpen` (C) | now wired in boot: opening the shop hides a banner (FB2B-2) |
| Build marker (D) | the FB builds carry `FB_IDS_MARKER` (`mewdoku-fb-ids:` + which ids are empty, never the ids); `zip-fbig` reads it and warns |
| `Router` (C) | `beginLeave(to)` (PERF-1: the outgoing half of a screen change starts at the tap); `RouterFactories.screenOut`; a new screen is inserted before a leaving one; the victory is the outgoing layer (PAR-6). Lead: `reserveModal?()` / `releaseModal?()` (PERF-3: the screen turns inert at the win scrim, ahead of the ranking panel); the screen host carries `[data-modal]` while a modal is open, and the win scrim steps aside by that marker, not by `[inert]` |
| `ui/fx/transitions.ts` (B) | `startScreenOut`, `releaseScreenOut`, `screenOutMs`, `screenOutStarted`; `playScreenTransition` joins an outgoing half that has already started |
| `win-flow.ts` (C) | `victoryCrossfadeMs(reduced)`: the victory opens at the panel's tap and the panel closes once the victory is opaque (UX-4). Lead: `WinFlowDeps.onScrim?()` |
| `session.ts` (C, lead) | the victory's fish pill follows the wallet while it is open (L2B-3); `nextEventIndex` is null after the event's end and the event victory's `last` is true then, so the primary reads "Back to event" (L2B-4); `board_in` plays with every board-entry wave (PAR-8) |
| `workers/lazy-chunk.ts` (C) | `ChunkOptions.css` (the chunk's stylesheet pattern) and `ChunkOptions.reloadCss`; `failedCssUrl`, `reloadStylesheet`, `resetChunkCssState`: a failed lazy stylesheet is re-fetched with a cache-busting URL before the chunk resolves (ROB-1). Both loaders of the events chunk (router, event-flow) pass the same pattern |
| Board (A, B) | custom properties sit on the element that uses them (PERF-1): `.board` has `--n --slot --pad --it --ir --ib --il --entry-*`; `.cell` `--xe`; `.cell__tile` `--c --diag`; `svg.cell__g` `--diag --breathe-delay`; `.cell__blink` `--blink-dur --blink-delay`. `board-cells.ts` `registerCellProperties()` registers `--diag`, `--breathe-delay`, `--blink-dur`, `--blink-delay` as non-inherited (`CELL_PROPERTIES`); `blinkTiming(cell)`. The input lock is one `::after` layer, not a rule on every cell. The board and cell labels follow a language change (A11Y-I18N-1) |
| i18n (E) | `setLocale` retries a failed chunk from a cache-busting URL (`failedChunkUrl`, `setLocaleUrlImport` for tests, ROB-2); `translate`, `translateMarked`; `format.ts` `FSI PDI LRI RLI`, keyword marks `MARK`, `stripMarks`, `markCount`, `splitMarks` |
| UI text (B) | `ui/locale-text.ts` `createLocaleText()` (static labels that follow the language); `ui/rich-text.ts` `richNodes`, `setRichText`, `stripTokens`; `ui/rich-tokens.ts` (keyword and colour-name tokens, PAR-7); `SettingsProps.feedbackUrl?` (PAR-5); `fittedMascot`, `MASCOT_MIN_PX` (UX-2); `fitLevel`, `FIT_LEVELS` (UX-1); `splitTitle` (I18N-TEXT-2); `arrowStep`, `inlineDir` (A11Y-HUB-1); `fbTopInset` (UX-9) |
| `ShellDeps.applyLocale` (C) | **changed:** returns the locale now active (`Promise<LocaleId \| undefined>`); a pick that fell back toasts `toast.languageUnavailable` and restores the previous choice, so picking it again retries (ROB-2) |
| Audio (B) | `AudioEngine.prewarm?()`: the context is created at an idle moment after the first route and only resumed in the first gesture (PERF-1). `attachUiClickFeedback(root, fb, { defer? })`, `afterNextFrame`: the click sound plays after the next frame, the haptic at once |
| `game/ramp.ts` (C) | `DAILY_12_FROM`, `SUNDAY_12`, `isTwelveSunday(dateKey)` (PAR-1) |
| Config (lead) | `support.feedbackUrl` (empty), `support.feedbackOnFbig` (false) |
| Boot (C) | `<html data-fb-safe>` is set right after `init()` on FBIG (UX-3); the top bar keeps it in step |

## 12. Phase 2c (2026-10-09): fish are lives — API changes

The exact Phase 2c interfaces (G1 game + app, G2 UI, G3 platform) are **[fish-lives-spec §7.4](../phase2c/fish-lives-spec.md)**; where this file's §3–§11 disagree with them, §7.4 wins. Ownership for 2c was spec §7.1. What integration (I-1…I-3) settled beyond §7.4:

| Area | Final state |
|---|---|
| Save (G1) | `SaveData = SaveDataV3` (`streak` (2c.1: frozen, §13), `period`; no `wallet`), `SAVE_VERSION = 3`, `src/game/save-v3.ts`; `BoardKey` keeps `'paw_points'` only so old saves parse |
| Scoring (G1) | `periodKeyAt`, `periodIndex`, `PERIOD_SPAN`, `encodePeriodScore`, `periodTotal`, `addPeriodPoints`, `keptPoints`, `levelPointsFor`, `streakAfterWin`, `breakStreak` (2c.1: the last three deleted, §13); `DecodedScore` is `'period' \| 'time' \| 'event'` (**the `'points'` kind was removed at I-3**); `boardFormat` has no paw-points format; `pointsFor` and `encodePointsScore` are gone |
| Events (G1) | `Reward` is `{ hints?, kitties? }` (**`fish` removed at I-3**) |
| Win flow (G1) | `WinSummary { kept, perfect, streak, period, pointsEarned, pointsTotal, … }` (2c.1: no `perfect` / `streak`, §13); `panelAt(N)`, `winTimeline` by N; `WinFlowInput { kept, perFish, periodBefore, periodKind, … }` |
| Ranking flow (G1) | `submitAll(entries, solveMs)` (one limiter check per win), `fetch(board, band?)`, `bandFilter`; reads `RankEntry.boardRank` directly (the local intersection type went at I-3) |
| Game screen / pills (G2) | `lifeSlots()`, `departLife(slot)`, `showPeriodCounter(total)`, `periodRect()`, `periodLabel(text)`; `createPeriodPill`. **Removed at I-3:** `GameScreen.fishRect / showFishPill / fishLabel`, `PillsView.showFish / fishRect / fishLabel` |
| Fish flight (G2) | `FlyFishOptions.startScale`, `fishSpread(index, count)`, `fishSizeFromRect`. **Removed at I-3:** `fishSourceRows`, `fishSizePx` |
| Overlays and screens (G2) | **Removed at I-3:** `VictoryProps.fish / bonus / onShop`, `HomeView.fish`, `HomeCallbacks.onShop`, `ShopProps.fish / hintPrice / kittyPrice / onSwap`, `RewardedPromptProps.swap`, `RankHubTab 'points'`, `RankingBoardKind 'points'`, `RankScoreView 'points'`, `RankingResultView 'level'` (the paw-points subtitle). `GroupResultOutcome 'place'` carries `hints` |
| i18n (G2, lead) | Appendix A of the spec; **removed at I-3:** `rank.points`, `rank.records.thisLevel` (17 catalogues, `meta.ts`, `drafted-from.json`) |
| Platform (G3) | `RankEntry.boardRank?` (set on every band read); `parseLeaderboardMap` accepts `period_points` (still parses the retired `paw_points`); `PaymentsProvider.catalog()` / `purchase()` take `iap.catalog` ids only, `purchases()` also returns `iap.retired` ids; band reads stop once they hold `n` band entries (lead accepted, STATUS-2c §5) |
| Build (lead, I-1) | `playwright.config.ts` maps `period_points → e2e_period_points` and the three event boards; `paw_points` and `daily_fastest` are not mapped |
| Config (lead) | 2c keys per spec §8; the 2b fish, shop and points keys stay `@deprecated` and unread (the config file never removes a key) |


## 13. Phase 2c.1 (2026-10-10): per-cat level points — API changes

The exact Phase 2c.1 interfaces (G1 game + app, G2 UI) are **[fish-lives-spec §10.10](../phase2c/fish-lives-spec.md)**; where §12 above or §3–§11 disagree with them, §10.10 wins. The rule and the data model are spec §3.1–§3.2. What integration (lead, 2026-10-10) settled beyond §10.10:

| Area | Final state |
|---|---|
| Rules and state (G1) | `PointsRule { first, step }`, `RuleFlags.points` (`rulesFor` / `eventRules`; {0, 0} for the tutorial and for a mode outside `levelPoints.modes`); `GameState.levelPoints / catStreak / scoredRows` (0 at `newGame` and `RETRY`); `GameEvent 'POINTS' { cell, gained, total, streak }`, emitted right after the scoring `CAT_PLACED` (a winning cat: CAT_PLACED, POINTS, REGION_DONE, WON) |
| Scoring (G1) | `pointsRuleFor(mode, c?)`, `catIncrement(s, rule)`, `runTotal(k, rule)` (576 / 96 from `levelPoints.firstIncrement` / `step`). **Deleted:** `levelPointsFor`, `LevelPointsInput`, `streakAfterWin`, `breakStreak` (`STREAK_MAX` stays for save validation) |
| Factory and save (G1) | `toInProgress` always writes `InProgressV2.points / catStreak / scoredRows` (optional on read; the save **stays v3**). `restoreGame` takes them through `slotPoints(puzzle, cells, slot, rule)` when consistent, else derives them (spec §3.2.3, D20; the tighter upper bound of check (c) is accepted, STATUS-2c §10). `popcount` is exported from `factory.ts`. `copySlot` drops an invalid field (repair `inProgress.<mode>.<field>`) and keeps the slot. `StreakRecord` / `SaveDataV3.streak` are `@deprecated`: validated and merged, never written |
| Session (G1) | `streakBreaks` / `breakStreak` gone; the slot (with the points) is written in the same store update as the board. `feedbackFor('POINTS')` → `tn('a11y.points', total)`, joined into the cat's one announcement. `WinSummary` has no `perfect`, `streak`, `streakUp`; `pointsEarned` = `state.levelPoints` (counted or not; only a counted win adds it to `points.total`). Analytics `win_points { mode, fish, total, points, run }` |
| Views (G1) | `selectGameView.points` (`number \| null`; null where nothing scores); `selectVictoryView` has no `streak`; `personalRecords` has no `streak` |
| Pills and game screen (G2) | `PillsProps.points` and `GameView.points` are **required** `number \| null` since I-3 (null hides the counter). `PillsView.playEvent(POINTS)` rolls, bumps and shows the "+N" chip (ignored while hidden). The period pill and the points pill share one counter builder. DOM: `.points-pill` (`[data-final]`, `hidden`), `.points-pill__n`, `.points-pill__chip` |
| Overlays (G2) | `VictoryProps.pointsEarned` is the level's total (null or 0 hides `.victory__points`). **Deleted at I-3:** `VictoryProps.streak`, `PersonalRecordsView.streak`; `.victory__streak` does not exist. The period records rows are This week · best · Total points · Levels solved |
| Art (G2) | `icon-points` (sprite symbol; provenance §10) |
| Top bar (lead, N1) | `splitTitle` also keeps a trailing level number ("Level 310", "المستوى 310") in the non-shrinking suffix when the title has no " · " |
| i18n (G2) | Appendix A.4: 6 new keys, 3 changed, 6 removed (all 17 catalogues, `meta.ts`, `drafted-from.json`) |
| Dev harness (lead, I-1) | `dev/shell-fixtures.ts gameView` derives `points` (as a restore would); `dev/b-harness.ts` has a `game-points` view (two scoring cats, a mistake, a 576 after it) and level totals on the victories; `dev/board-harness.ts` feeds the real reducer's `levelPoints`; `icon-points` in the art and board harness icon lists |
| Config (lead) | 2c.1 keys per spec §10.6; `levelPoints.perSize / hardMultiplier / streakStep / streakCap` stay `@deprecated` and unread |
| Budgets (lead, I-4) | `scripts/size-check.ts`: see STATUS-2c §10 and 04 §9 |

## 14. Phase 2d (2026-10-10): the game screen from the user's recording — see [phase2d/CONTRACTS.md](../phase2d/CONTRACTS.md)

The Phase 2d interfaces (the layout stack and `setSlot`'s frame, the palette tiers and `HEAD_ORDER`, the new symbols, the five `GameView` fields, `onMouse`, `playStartToast`, the `MOUSE` action, `MARKED.source`, `RewardedPlacement` `'mouse'`, `BannerScreen` `'game'`, `ext.settingsSeen`) and the DOM contract of the new game screen are in [phase2d/CONTRACTS.md](../phase2d/CONTRACTS.md) (final at the 2d integration, its §10 lists the members added beyond it). Deleted at 2d I-3: `PillsProps.compact` and `points`, `GameLayout.topBar` and `chips`, the sprite ids `icon-rule-*` and `wrong-x`.
