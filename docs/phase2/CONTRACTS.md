# Phase 2 contracts: ownership, cross-module APIs, data flow, conventions

Status: written by the Foundation step · Date: 2026-10-07 · Applies to: the six parallel Phase 2 workstreams

This file is the contract between workstreams. The TypeScript stubs in `src/**` and `scripts/*.ts` are the authoritative signatures: every exported function, class and interface already exists with its final parameter and return types, and each stub body throws `not implemented: <name>`. Implement the bodies; **do not change a signature that another workstream calls** without asking the lead. Behaviour is specified in [02](../phase1/02-rebuild-spec.md), the engine in [03](../phase1/03-puzzle-engine.md), and the architecture in [04](../phase1/04-architecture.md). Each stub's JSDoc cites the section it implements.

## 1. File ownership

FILE OWNERSHIP (workstream: paths)
- foundation (done before the parallel phase): package.json, package-lock.json, tsconfig.json, vite.config.ts, vitest.config.ts, playwright.config.ts, index.html (initial), src/env.d.ts, src/engine/types.ts, src/game/types.ts, src/platform/types.ts, src/app/config.ts, src/game/ramp.ts, src/i18n/**, src/ui/dom.ts, src/app/store.ts, src/app/clock.ts, src/app/events.ts, src/assets/fonts/**, docs/phase2/CONTRACTS.md
- engine: src/engine/** (except types.ts: additive only), tests/unit/engine/**, tests/golden/**
- content (runs after engine): scripts/level-schedule.ts, scripts/gen-levels.ts, scripts/gen-daily.ts, scripts/verify-levels.ts, src/data/**, tests/property/**
- game: src/game/** (types.ts additive only; ramp.ts read-only), tests/unit/game/**
- platform: src/platform/** (types.ts additive only), platform-assets/**, scripts/zip-fbig.ts, scripts/size-check.ts, scripts/upload-fbig.ts, tests/fixtures/**, tests/unit/platform/**
- ui-board: src/ui/board/**, src/ui/hud/**, src/ui/art/**, src/ui/fx/**, src/ui/a11y/**, src/styles/**, scripts/palette-check.ts, tests/unit/ui/**, dev/board-*.html, dev/board-*.ts
- ui-shell: src/ui/screens/**, src/ui/overlays/**, src/audio/**, tests/unit/shell/**, dev/shell-*.html, dev/shell-*.ts
- app: src/app/** (config.ts additive only; store/clock/events may be extended), src/main.ts, src/workers/**, index.html, tests/unit/app/**, tests/unit/layering.spec.ts, dev/app-*.html
- ADDITIVE-SHARED for everyone: src/i18n/en.ts (append new keys only, never rename/remove), src/app/config.ts (append new keys only).
Dev-server ports: ui-board 5174, ui-shell 5175, app 5176.

Notes on ownership:

- Every source file starts with `// Owner: <workstream>`.
- Files the Foundation added beyond the 04 §3 tree: `src/app/saves.ts`, `src/app/views.ts`, `src/workers/engine-client.ts` (owner: app), `tests/unit/sanity.spec.ts` (foundation).
- `src/data/levels/pack-000.json` and `manifest.json` are **placeholders** (gen string `placeholder-prototype/0`): the tutorial record plus levels 2–100 generated with the Phase 1 prototype, so app and UI work have playable boards. Content replaces them with the real packs in the same format.
- `tests/e2e/**`: `smoke.spec.ts` and `layout.spec.ts` belong to **app**, `fbig.spec.ts` to **platform** (with `tests/fixtures/fbinstant-stub.js`).
- Dev pages: run `npx vite --port 5174` (ui-board), `5175` (ui-shell) or `5176` (app) and open `/dev/<name>.html`.

## 2. Layering and imports

The direction rules of 04 §2, made concrete for `tests/unit/layering.spec.ts` (app):

| Layer | May import | Must not import |
|---|---|---|
| `src/app/config.ts` | nothing (leaf) | — |
| `src/i18n/**` | `i18n/` only (leaf) | everything else |
| `src/engine/**` | `engine/` | anything outside `engine/` (no DOM, timers, `Math.random`) |
| `src/game/**` | `engine/`, `game/`, `app/config.ts`, `data/` (the shipped JSON, wired in `level-assets.ts`; lead decision, Phase 2 integration) | DOM, timers, `platform/`, `ui/`, other `app/` |
| `src/platform/**` | `platform/`, `game/types.ts` (types), `app/config.ts`, `i18n/` | `ui/`, other `app/`, `game/` values |
| `src/ui/**`, `src/audio/**` | `ui/`, `audio/`, `i18n/`, `app/config.ts`, `engine/` and `game/` (pure) | `platform/` values, other `app/` (UI gets props and callbacks) |
| `src/workers/**` | `engine/`, `workers/`, `app/config.ts` | `ui/`, `platform/` |
| `src/app/**`, `src/main.ts` | everything above | `engine/solver-oracle.ts` |
| `scripts/**` | `src/engine`, `src/game`, `src/app/config.ts`, `src/ui/art/palette.ts` | — |

Nothing in the app bundle may import `engine/solver-oracle.ts`.

## 3. Shared foundation modules (implemented, ready to use)

| Module | Exports |
|---|---|
| `engine/types.ts` | `CellIndex`, `Grade`, `GradeBand`, `PuzzleId`, `CellState` (value + type), `Puzzle`, `LevelRecord`, `LevelPack`, `DailyPack`, `PackManifest`, `UnitKind`, `Unit`, `HintKind`, `HintStep`, `GradeResult`, `GradeOptions`, `GrowthMode`, `SizeWeight`, `GenSpec` (+ `sizePool?`), `GenResult`, `SolveResult`, `Rng`, `PuzzleTables`, `RecordCheck`, `DeltaMatrix` |
| `game/types.ts` | re-exports `CellState`, `CellIndex`, `PuzzleId`; `ModeId`, `Status`, `PaintMode`, `CatSource`, `RuleFlags`, `GameState`, `Move`, `Action`, `GameEvent`, `ReduceResult`, `Settings`, `ReduceMotionSetting`, `LevelBest`, `DailyRecord`, `InProgressV1`, `SaveDataV1`, `SaveMode` |
| `platform/types.ts` | `PlatformAdapter`, `Capabilities`, `PlatformStorage`, `RawSave`, `StorageStatus`, `PlatformAds`, `AdKind`, `AdPlacement`, `InterstitialPlacement`, `RewardedPlacement`, `AdResult`, `AdFailReason`, `AnalyticsParams`, `PlatformTimers`, `PlatformId` |
| `app/config.ts` | `cfg: GameConfig` (frozen; every 02 §3 tunable plus fx, layout, save keys, gen, analytics limits), `dragStartPx(cellPx)`, `mergeConfig(patch)`, `DeepPartial` |
| `game/ramp.ts` | `RAMP`, `ENDLESS_ROW`, `rampRowFor(L)`, `isHardLevel(L)`, `bandFor(row, hard)`, `breatherPool`, `breatherBand`, `allowG5Steps`, `pickWeighted(pool, draw)`, `WEEKDAY_SLOTS`, `weekdayOfDateKey`, `dailySlotFor`, `SEEDS`, `makeGenSpec`, `shapeLimits`, `RETRY_BAND` |
| `i18n/index.ts` | `t(key, params)` (params type-checked from the English template), `translate(key, params?)` (computed keys), `tn(base, count)` (plurals), `setLocale`, `getLocale`, `registerCatalog`, `interpolate`, `colorName(i)`, `glyphName(i)`, `praise(i)`, `PRAISE_COUNT`, `joinList`, `capitalizeFirst`, `formatClock`, `formatDuration`, `formatShortDate`, key lists `COLOR_KEYS`, `GLYPH_KEYS`, `PRAISE_KEYS`, `TUTORIAL_STEP_KEYS` |
| `ui/dom.ts` | `h(tag, attrs, ...children)`, `s()` (SVG), `append`, `applyAttrs`, `setAttr`, `setData`, `setStyle`, `cssVar`, `classNames`, `toggleClass`, `setText`, `clear`, `$`, `$$`, `listen`, `playClass`, `detach`, `createDisposer`; contracts **`View<P>`** and **`OverlayView<P>`** |
| `app/store.ts` | `createStore<S>()` → `get / set / update / subscribe / select(selector, listener, {equals, immediate})`, `shallowEqual`; `AppState`, `ScreenId`, `OverlayId`, `SessionRequest`, `SessionMeta`, `UiState`, `initialAppState(save)` |
| `app/clock.ts` | `Clock` (`now`, `perf`, `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`), `systemClock`, `createFakeClock(start)` (`advance`, `advanceAsync`, `setNow`, `pending`, `runAll`), `delay(clock, ms)` |
| `app/events.ts` | `createEventBus<M>()` → `on / once / emit / clear`; `AppEventMap`, `AppBus`, `PauseReason`; analytics table `AnalyticsParamsMap`, `AnalyticsEvent`, `AnalyticsName`, `ANALYTICS_PARAM_KEYS`, `AdResultCode` |
| `ui/art/palette.ts` (ui-board, data filled) | `PALETTE` (12 hex), `PALETTE_DE00` (12×12 CIEDE2000 ×100, computed by Foundation, min pair Sky/Slate 10.12), `TOKENS`, `CAT_COLORS`, `PALETTE_SIZE` |

## 4. Component contracts (UI)

UI modules are plain functions that return handles. The UI never imports the store, the session or the platform: the app passes **view models** (data) and **callbacks**, and calls `update(view)` when the data changes.

- `View<P>`: `{ el, update(props), destroy() }`. The caller appends `el`.
- `OverlayView<P>`: `{ el, modal, open(props), update(props), close(), dismiss(): boolean, destroy() }`. Created lazily by the router and toggled. Modal overlays get a focus trap and an inert background from the router. **Overlays never close themselves**: their buttons call prop callbacks, and the app closes them through the router. `dismiss()` handles Esc and scrim taps by calling the matching callback.
- Text is rendered by the UI with `t()`. View models carry raw data (level numbers, date keys, palette indices), not strings, except `TopBarProps.title`, which the screen localises.

### 4.1 ui-board

| Module | API | Caller |
|---|---|---|
| `board/board-view.ts` | `createBoardView(model: BoardModel, input: BoardInput, opts: { reducedMotion() }): BoardView`. `BoardView`: `el`, `update(model)` (rebuild on new puzzleId, else diff), `setSlot(px)`, `geometry()`, `cellElement(i)`, `cellRect(i)`, `setHighlight(BoardHighlight \| null)`, `setLocked(bool)`, `setMood(CatMood)`, `playEvent(GameEvent)`, `playEntry()`, `focusCell(i)`, `destroy()` | game-screen |
| | `BoardModel { puzzleId, n, regions, colors, cells, regionsDone, patterns }`; `BoardHighlight = { kind:'hint', step } \| { kind:'coach', cells }`; `BoardInput { tap, doubleTap, paint, bulb, paw }`; `CatMood` | |
| `board/gestures.ts` | `attachGestures(boardEl, { tap(cell), doubleTap(cell), paint(cells, mode) }, { geometry(), cellState(cell), isLocked() }): detach`. No timestamps; the session stamps `t`. Handles double-tap window, drag threshold (`dragStartPx`), cell lock after a double-tap, primary pointer only, `contextmenu` suppressed | board-view |
| `board/keyboard.ts` | `attachKeyboard(boardEl, { tap, doubleTap, bulb, paw }, { n, cellElement, isLocked }): { focused(), focus(cell, dom?), detach() }`. Esc is global (router) | board-view |
| `board/layout.ts` | `computeLayout({ vw, vh, safeTop, safeBottom, n }): GameLayout`, `regionInsets(n, regions): CellInsets[]`, `hitTest(x, y, BoardGeometry)`, `cellsAlongSegment(from, to, n)`, `readViewport(win?)` | game-screen, board-view, gestures |
| `hud/top-bar.ts` | `createTopBar(TopBarProps, { onHome, onSettings, onTrophy }): View<TopBarProps>` | home-screen, game-screen |
| `hud/pills.ts` | `createPills(PillsProps): PillsView` (+ `playEvent(ev)`) | game-screen |
| `hud/rule-chips.ts` | `createRuleChips({ compact, highlight }): View` | game-screen |
| `hud/tool-bar.ts` | `createToolBar(ToolBarProps, { onBulb, onPaw }): ToolBarView` (+ `toolRect(tool)`) | game-screen |
| `art/sprite.ts` | `mountSprite(doc?)` (idempotent), `icon(SymbolId, { class?, label? }): SVGSVGElement`; `SymbolId` = cat moods, icons, `glyph-0…11`, `mark-x`, `wrong-x` | boot (app), all UI |
| `art/illustrations.ts` | `illustration(kind, { label?, class? })`, kinds `home \| boot \| win \| fail \| daily \| tutorial` | screens, overlays |
| `art/palette.ts` | `regionColorVar(i)`, `regionColorsFor(puzzle, fixed \| null): Uint8Array` (fixed tutorial colours, or engine `assignColors(puzzle, PALETTE_DE00)`) | app (session meta), board-view |
| `fx/*` | `shake(el, opts?)`, `burstConfetti(host, opts?)`, `systemPrefersReducedMotion`, `resolveReducedMotion(setting, system)`, `watchSystemReducedMotion(cb)`, `applyMotion(root, reduced)` | board-view, win overlay, app |
| `a11y/*` | `createAnnouncer(host?): { say(msg), clear(), destroy() }`; `trapFocus(container, opts?): release`, `setInert(els, on)`, `focusableElements(el)` | session (announcer), router (focus) |

### 4.2 ui-shell

| Module | API | Caller |
|---|---|---|
| `screens/boot-screen.ts` | `createBootScreen(): { el, setProgress(pct), destroy() }` (web only) | router |
| `screens/home-screen.ts` | `createHomeScreen(HomeView, HomeCallbacks): View<HomeView>`; `HomeView { level, hard, continueLevel, daily: DailyCardView, hints, kitties, showTrophy, fbSafeZone, extraCards }`; callbacks `onPlay, onDaily, onSettings, onTrophy, onCard` | router |
| `screens/game-screen.ts` | `createGameScreen(GameView, GameScreenCallbacks): GameScreen` with `playEvent(ev)`, `playEntry()`, `cellRect(i)`, `toolRect(tool)`, `focusBoard()`. Composes top bar, pills, rule chips, board view, tool bar, and runs layout on resize | router |
| `overlays/hint-card.ts` | `createHintCard(): OverlayView<HintCardProps>`; `hintText(step, { n, colors, patterns })` and `unitName(unit, ctx)` render the 02 §9.1 templates (also used for announcements). The text helpers live in `overlays/hint-text.ts` (main bundle; the session imports them from there) and are re-exported by `hint-card.ts` (lazy chunk) | router, session |
| `overlays/rewarded-prompt.ts` | `RewardedPromptProps { placement: 'hint'\|'kitty', variant: 'video'\|'free'\|'countdown', nextFreeAt, now(), onAccept, onDecline }` | router |
| `overlays/win-overlay.ts` | `WinOverlayProps { variant: 'level'\|'tutorial'\|'tutorial_replay', level, nextLevel, praise, buttonDelayMs, reducedMotion, onNext, onHome }` | router |
| `overlays/fail-overlay.ts` | `FailOverlayProps { continueOffer: 'video'\|'free'\|null, buttonDelayMs, busy, onContinue, onRetry, onHome }` | router |
| `overlays/settings-modal.ts` | `SettingsProps { settings, showVibration, version, onChange(patch), onHowToPlay, onClose }` (+ About sub-view) | router |
| `overlays/how-to-play.ts` | `HowToPlayProps { showSkip, showReplay, onSkip, onReplay, onClose }` | router |
| `overlays/daily-result.ts` | `DailyResultProps { dateKey, ms, mistakes, hints, kitties, nextPuzzleAt, now(), onDone }` | router |
| `overlays/coach.ts` | `CoachProps { step, hand, showGotIt, colorParam, targetRects(), onGotIt }`; **non-modal** (`modal: false`) | router |
| `overlays/toast.ts` | `createToastLayer(): { el, show(msg, { durationMs? }), clear(), destroy() }` | router |
| `overlays/rotate-notice.ts` | `shouldShowRotateNotice(w, h)`, `mountRotateNotice(host, win?)` (self-managing) | boot (app) |
| `audio/audio-engine.ts` | `createAudioEngine(win?): AudioEngine` with `unlock()` (first pointerdown), `context()`, `output()`, `setMuted(reason: 'setting'\|'hidden'\|'pause'\|'ad', on)`, `isMuted()`, `destroy()` | app |
| `audio/sfx.ts` | `createSfx(engine): { play(id: SfxId, { index? }) }`; `SfxId` = `mark, unmark, cat, region, mistake, heart_last, win, hint_open, hint_apply, kitty, ui` | session |

## 5. Pure logic APIs

### 5.1 engine (called by game, app/workers and scripts)

- `rng.ts`: `cyrb128(str)`, `sfc32(a, b, c, d)`, `makeRng(seed): Rng`. Seed strings come from `game/ramp.ts` `SEEDS`.
- `geometry.ts`: `cellIndex`, `rowOf`, `colOf`, `kingNeighbors`, `orthoNeighbors`, `unitId`, `unitFromId`, `buildTables(n, regions): PuzzleTables`, `solutionCell`, `isSolutionCell`.
- `codec.ts`: `canonicalLabels`, `encodeRegions`, `decodeRegions`, `encodeSolution`, `decodeSolution`, `decodeGivens`, `isKingPermutation`, `isConnectedPartition`, `checkRecord(rec): RecordCheck`, `recordToPuzzle(rec, id): Puzzle`, `puzzleToRecord(p, level?)`, `isLevelPack`, `isDailyPack`.
- `solver.ts`: `countSolutions(n, regions, limit = 2): SolveResult`. `solver-oracle.ts` (tests only): `solveRows`, `bruteForceCount`.
- `generator.ts`: `randomKingPerm`, `growRegions`, `repairUnique`, `generate(spec: GenSpec): GenResult`. When `spec.sizePool` is set, the **first** draw on the seed's stream picks n (02 §11.4).
- `filters.ts`: `regionSizes`, `shapeOk(n, regions, { minRegion, maxRegion })`, `canonicalKey`.
- `techniques.ts` / `grader.ts`: `Knowledge`, `KnowledgeStatus`, the finders `findSingle … findTrial`, `grade(n, regions, { maxLevel? }): GradeResult`, the lazy generator `trace(k, opts)`, `effortScore`.
- `hint.ts`: `getHintStep(puzzle, cells): HintStep`, `pickKittyCell(puzzle, cells): CellIndex`, `findMistakenMark`, `knowledgeFromBoard`. `cells` holds `CellState` values.
- `colors.ts`: `assignColors(puzzle, deltaE: DeltaMatrix, paletteSize = 12): Uint8Array`, `regionAdjacency`. It is palette-agnostic, and the caller passes `PALETTE_DE00`. It should throw when `deltaE.length !== paletteSize²`.

### 5.2 game (called by app, scripts and tests)

- `reducer.ts`: `reduce(state, action): { state, events }`, following the 04 §4.2 matrix.
- `factory.ts`: `newGame(puzzle, mode, rules?)`, `restoreGame(puzzle, slot, rules?)` (status `lost` when hearts are 0, `won` when the board is full), `toInProgress(state, savedAt)`, `regionsDoneMask`, `countCats`.
- `modes.ts`: `MODES`, `getMode(id): GameMode` (`rules`, `saveSlot`, `chargesHelpers`, `kittyAllowed`, `winFlow`, `winGate`, `fixedColors`, `analyticsMode`), `rulesFor(id)`, `fixedColorsFor(id, puzzle)`.
- `tutorial.ts`: `TUTORIAL_ID`, `TUTORIAL_RECORD`, `TUTORIAL_COLORS = [4, 7, 2, 0]`, `tutorialPuzzle()`, `tutorialStep(i): TutorialStepDef` (`focusCells`, `target`, `hand`, `gotIt`, `colorParam`), `filterTutorialAction(step, state, action): Action | { type: 'PULSE_ONLY', cell } | null`, `advance(step, state, signal?): { next: step | 'done', scriptedMarks } | null`, `tutorialAllowsTool(step, tool)`.
- `progression.ts`: `isHard`, `levelPuzzleId` (`T1` for level 1), `dailyPuzzleId`, `dateKeyOf`, `packIndexFor`, `packFirstLevel`, `packsToPrefetch`, `isEndless`, `endlessSpec`, `endlessRetrySpec`, `substituteSpec`, `dailySpec`, `isDailyUnlocked`, `localDateKey(now)`, `weekdayOf`, `msUntilLocalMidnight(now)`, `dailyCardState(save, today)`.
- `levels-repo.ts`: `createLevelsRepo({ bundled, loadPack(k), loadDailyMonth(month), generate(spec), delay(ms), onFallback? }): LevelsRepo` with `getTutorial()`, `getLevel(L): Promise<LoadedPuzzle>`, `getDaily(date)`, `ensurePackFor(L)`, `prefetch(L)`, `peekLevel(L)`. All I/O is injected: the app supplies `fetch` of Vite asset URLs and the worker's `generate`.
- `economy.ts` (returns new saves): `balance`, `spend`, `grant`, `fallbackAvailable(save, now)`, `fallbackReadyAt`, `recordFallbackGrant`, `recordAdShown`.
- `ad-pacing.ts`: `interstitialGate({ trigger, now, sessionStartedAt, save, interstitialSupported }): GateDecision`, `canShowInterstitial`, `tenureDays`, `cooldownSecFor`.
- `save.ts`: `defaults(now)`, `migrate(raw, now)`, `migrateReport(raw, now)`, `merge(local, cloud)`, `encodeCells` (also the hint-cache key), `decodeCells`, `validateInProgress(slot, puzzle, { mode, id })`.
- `stats.ts` (returns new saves): `applyLevelWin(save, L, state)`, `applyTutorialDone(save)`, `applyDailyWin(save, date, state)`, `levelBest`, `dailyRecord`.

### 5.3 platform (called only by app)

- `@platform` resolves to `platform/web/index.ts` or `platform/fb/index.ts`. Both export `createPlatform(): PlatformAdapter`, plus testable factories `createWebPlatform(opts)` and `createFbPlatform(opts)`.
- `storage.load(): Promise<RawSave>` returns `{ local, cloud, corrupt, localUnmerged? }`. The **app** runs `migrate()` on each copy and `merge()`s them (`app/restore.ts loadSave`; with `localUnmerged` the cloud copy's newest-wins fields win, §10).
- `storage.save(data, { cloud: 'debounced' | 'now' | 'flush' })` and `storage.status()`.
- Ads: `preload`, `isReady`, `showInterstitial(p)`, `showRewarded(p)`. **They never reject.** Readiness waits at most `ads.readyTimeoutMs`, and the show itself has no timeout.
- Helpers: `shared/haptics.ts` (`canVibrate`, `createVibrateHaptics`, `createHaptics`), `web/local-storage.ts` (`safeLocalStorage`, `createLocalStore(key)`), `web/mock-ads.ts` (`readMockAdMode`, `createMockAds`), and in `fb/`: `createFbStorage`, `createFbAds`, `mapAdError`, `createFbAnalytics`, `sanitizeEventName`, `sanitizeParams`, plus `fbinstant.d.ts`.

### 5.4 app (internal hub; signatures matter to tests and to `main.ts`)

- `boot(platform, root, opts?): Promise<AppHandle>` and `applyRestoreRules(save, { today, levels })`. In e2e builds it installs `window.__mewdoku: E2EHooks` (`state()`, `app()`, `solution()`, `seedSave(json)`).
- `createRouter(root, { bus?, doc?, factories? }): Router` with `showBoot`, `showHome(view, cb)`, `showGame(view, cb): GameScreen`, `open(id, OverlayPropsMap[id])`, `update`, `close`, `closeAll`, `isOpen`, `top`, `stack`, `toast`, `setLoading(on)`, `escape`, `preloadOverlays()`, `destroy`. Every overlay, the coach included (since the Phase 2 hardening, §10), comes from the lazy chunk `app/overlay-chunk.ts`; an `open()` before it lands is queued (see §9). `overlaysReady()` resolves whether the chunk is (or could be) loaded.
- `createSession(deps): Session`:
  - `start(req: SessionRequest)`, `state()`, `subscribe(fn)`, `pause(reason)`, `resume(reason)`, `saveNow()`, `dispose()`;
  - the commands that screens and overlays call: `onCellTap`, `onCellDoubleTap`, `onPaint`, `onBulb`, `onPaw`, `onHintApply`, `onHintClose`, `onCoachGotIt`, `onContinue`, `onRetry`, `onNext`, `onDailyDone`, `onHome`, `onSkipTutorial`.
- `createAdFlow({ platform, clock, bus, setInputLocked, setMuted }): AdFlow` with `interstitial(trigger)`, `rewarded(placement)` (both return `AdFlowResult`, which adds `watchdog`) and `showing()`. The **caller** checks the pacing gate first.
- `createSaveScheduler({ store, storage, clock, bus? })` provides `touch()`, `now()`, `critical()`, `flush()` and `dispose()` (04 §7.1).
- `watchVisibility({ doc, platform, onHide(reason), onShow })`.
- Flags: `isFlagOn`, `setFlagOverrides`, `parseFlagParam`, `DEFAULT_FLAGS` (all off).
- `selectHomeView(state, ctx)` and `selectGameView(state, ctx)` map `AppState` to the UI view models.
- Workers:
  - `createEngineClient(opts?)` provides `generate`, `getHint` (async; it rejects when the engine throws), `pickKittyCell` (async since integration: the hint engine is a lazy chunk), `preload()` and `dispose`.
  - `rpc.ts` provides `createRpcClient<T>(port)` and `exposeRpc(api, port)`.
  - `engine.worker.ts` exposes `EngineWorkerApi { generate, getHint }`.

## 6. Data flow

```
pointer / keys ─► ui/board (gestures, keyboard) ─► BoardInput ─► GameScreenCallbacks ─► Session.onCellTap(cell) …
                                                                                          │
   Session: action = { type, cell, t: clock.now() }                                       │
            tutorial? filterTutorialAction(step, state, action) ─► PULSE_ONLY → board.playEvent(PULSE)
            { state, events } = reduce(state, action)                                     ▼
            store.update(app => ({ ...app, game: state }))  ──►  views.selectGameView ──► gameScreen.update(view)
            bus.emit('game:events', { events, state, prev })
            for each event (effects):
              gameScreen.playEvent(ev)                 board FX, heart crack, sad/happy cats
              sfx.play(id) + platform.haptics.pulse()  gated by settings.sound / settings.haptics
              announcer.say(text)                      02 §18 live messages
              saves.touch()                            cells/hearts/revives changed (never tutorial or substitute)
              bus.emit('analytics', …)                 ──► platform.analytics.log(name, params)
              WON  → stats.apply*Win + saves.critical() → after fx.winOverlayDelayMs router.open('win' | 'daily_result')
              LOST → after fx.failOverlayDelayMs router.open('fail')
            tutorial? advance(step, state) → scripted PAINT (mark mode) + coach update
```

- **Timers (session):**
  - `START` fires `fx.boardEntryMs` after the board mounts.
  - `KITTY_DONE` fires `kitty.revealMs` after `KITTY`, unless the kitty's cat won the level.
  - `TICK { dtMs }` fires every `timer.tickMs` while the page is visible, the status is playing, hint or kitty, and nothing is paused (`hidden`, `fb_pause`, `modal` for O5/O6, `ad`). On pause the session sends a final partial `TICK`.
- **Helper flows** follow the 04 §5.7 pseudo-code exactly: the order is stock check → O2 → ad or fallback → engine → debit + `saves.now()` → dispatch. Stock and economy changes are app-level `store.update` calls that use `game/economy.ts`.
- **Input lock** (`UiState.inputLocked`) is on in READY, while an overlay is open (except the non-modal coach), during an ad and during the kitty reveal. game-screen passes it on through `board.setLocked()`.
- **Highlights** come from state:
  - `GameView.highlight = { kind: 'hint', step: game.openHint }` while the status is `hint`;
  - in the tutorial, `{ kind: 'coach', cells: tutorialStep(step).focusCells }`.
- **Colours:** at session start, `SessionMeta.colors = regionColorsFor(puzzle, getMode(mode).fixedColors)`. The same array feeds the board, `hintText()` and the announcements.
- **Boot** (04 §5.1):
  1. `platform.init()`, then `mountSprite()`.
  2. `storage.load()` → `migrateReport` + `merge`, then `sessions + 1` and `saves.touch()`.
  3. `levels.ensurePackFor()` and the fonts (and, on a first run, the overlay chunk with the coach), side by side, each with a deadline (`boot.packTimeoutMs`, `boot.fontTimeoutMs`, `boot.overlayTimeoutMs`).
  4. Set the loading progress to 100, then `platform.start()`, and record `sessionStartedAt = clock.now()`.
  5. `setLocale(platform.getLocale())`, then `applyRestoreRules`.
  6. Route to `home` (or straight to the tutorial), then preload ads.

## 7. Conventions

**i18n keys** (`src/i18n/en.ts`, ADDITIVE-SHARED):

- Append new keys at the end of the matching section. Never rename or remove a key, and never change the placeholders of an existing key.
- Name keys `area.thing[.variant]` in camelCase segments, for example `home.daily.solved` or `a11y.mistake.one`.
- Placeholders are `{name}`. `t()` infers them from the English string, so a missing or extra param is a type error. Use `translate()` only for computed keys.
- Plurals are a `.one` / `.other` pair read with `tn(base, count)`; `{count}` is filled in.
- An indexed family (colours, glyphs, praise words, weekdays, months, tutorial steps) also needs its key appended to the matching `*_KEYS` list.
- **All copy is ours** (06 §3). `tests/unit/sanity.spec.ts` fails on known original phrases ("Exclusive Territory", "Aloof", "Find the cats", "Test your IQ", the original rule-chip wording, and others). Extend that list when 01 or 06 names more.
- Colour and glyph names come only from `colorName(i)` / `glyphName(i)`, where `i` is the palette index and not the region label. Dates use `formatShortDate`; solve times use `formatClock`; "7 h 48 min" uses `formatDuration`.

**Config keys** (`src/app/config.ts`, ADDITIVE-SHARED):

- Add the key to **both** the `GameConfig` interface (with a JSDoc that cites its spec section) and the `cfg` value; tsc fails if one of the two is missing. Never rename, remove or retype a key.
- No magic numbers elsewhere: timings, sizes, limits and storage keys all live in `cfg`.
- A function that reads config takes `c: GameConfig = cfg` as its last parameter. Tests build variants with `mergeConfig({ ads: { enabled: false } })`.

**Types files** (`engine/`, `game/`, `platform/` `types.ts`):

- Changes are additive only: new types, or new optional fields.
- To change an existing shape, ask the lead.

**Code:**

- Follow 04 §12: kebab-case files, named exports only, no `any`, and aim for ≤ 300 lines per file.
- `engine/` and `game/` stay pure: inject the clock and I/O.
- Immutable state: `SaveDataV1`, `GameState` and `AppState` are replaced, never mutated, so store selectors can compare by reference.

**Browser baseline** (04 §1: Chrome/WebView 80+, iOS Safari 14+):

- `tsconfig` sets `lib: ES2020`. `@types/node` still leaks a few newer globals, so also avoid:
  - `Object.hasOwn`, `Array.prototype.at`, `findLast`, `structuredClone`, `String.replaceAll`, `Element.replaceChildren`;
  - in CSS: flex `gap`, `dvh` units, `:has()` and container queries.
- `inert` needs Chrome 102+, so `setInert` must also set `aria-hidden` and rely on the focus trap.

**Tests:**

- Vitest projects:
  - `unit`: Node, `tests/unit/**` except ui and shell;
  - `dom`: jsdom, `tests/unit/ui/**` and `tests/unit/shell/**`;
  - `property`: `tests/property/**`.
- An app test that needs the DOM adds the docblock `// @vitest-environment jsdom`.
- Timers in tests use `createFakeClock()`, not real time.
- Playwright: the `web-390` project runs every spec except `fbig.spec.ts`; `web-320` and `web-1280` run `layout.spec.ts`; `fbig-390` runs `fbig.spec.ts`. The two webServers serve `dist/e2e` on :4173 and `dist/fbig-e2e` on :4174; the latter has hooks on and test placement IDs. Never run `playwright install`.

**Build:**

- Modes:
  - `vite build` writes `dist/web`;
  - `--mode fbig` writes `dist/fbig` (with the SDK tag and `fbapp-config.json` when `platform-assets/fbig/` has it);
  - `--mode e2e` writes `dist/e2e`.
- Defines: `__PLATFORM__`, `__E2E__` (also forced on by `MEWDOKU_E2E=1`), `__APP_VERSION__`.
- `npm run dev:fbig` serves HTTPS through basic-ssl.

## 8. Deviations from 04 (decided by Foundation)

1. **`PlatformStorage.load()` returns `RawSave { local, cloud, corrupt }`**, not one merged `unknown`. Merging needs `game/save.ts`, which `platform/` may not import (04 §2), so the app merges. `storage.status()` and `PlatformTimers` were added.
2. **`CellState` is defined in `engine/types.ts`**, because the hint engine reads player cells, and `game/types.ts` re-exports it. `SaveDataV1` and `InProgressV1` live in `game/types.ts` (re-exported by `save.ts`), so `platform/` imports types only.
3. **Engine additions:**
   - `GenSpec.sizePool` (endless and substitute boards draw n first);
   - new types `GenResult`, `Rng`, `PuzzleTables`, `PackManifest`, `RecordCheck`, `DeltaMatrix`, `GradeOptions`;
   - `assignColors` takes the ΔE matrix as an argument, and the matrix lives in `ui/art/palette.ts`.
4. **Gesture and keyboard callbacks carry no timestamps.** The session stamps actions with `clock.now()`.
5. **The store API is `get / set / update / subscribe / select`**, with `update` serving as the "dispatch". `AppState` gained `session: SessionMeta` (mode, ids, colours, tutorial step).
6. **Tutorial typing:** `filterTutorialAction` may return `null` (ignore), and `advance()` reports `next: 'done'` at the end.
7. **One `Session.onHome()`** serves the top bar, O3 and O4. A `lost` status means discard; any other status means save the board first.
8. **`tsconfig` `lib` is ES2020** (it was ES2022), to enforce the browser baseline.
9. **Extra scripts:** `build:fbig-e2e`, `preview:e2e`, `preview:fbig-e2e`, `test:unit`, `levels:schedule`.

## 9. Phase 2 integration changes (integration lead, 2026-10-07)

**Tokens.** `--wrong: #A3193A` (`TOKENS.wrong` in `ui/art/palette.ts`, `tokens.css`) is the colour of the wrong-X glyph and its ring. The spec's `--danger` (`#D33A4A`) reaches only about 2.2:1 on the pastel tiles; `--wrong` passes the 3:1 non-text contrast check on every tile (`scripts/palette-check.ts`: min 3.18:1 on Slate). `--danger` stays the UI error colour (flash, lost heart). New tokens are added to `tokens.css` and, when scripts or SVG need them, to `TOKENS`.

**CSS class vocabulary.** There is no separate class list; each stylesheet's header comment is the reference, and each UI module's header repeats the classes it renders (`// Classes: …`):

- `styles/base.css`: buttons (`.btn --primary|--secondary|--ghost|--icon|--block|--lg`, `.btn__icon .btn__label .btn__badge .btn__chev`), `.badge`, `.icon`, `.sr-only`, `.screen --boot|--home|--game`;
- `styles/board.css`: the board DOM (`.board[role=grid][data-mood][data-hl][data-patterns]`, `.board__row`, `button.cell[data-s=e|m|c|w|g][data-done]…`, the `--c --it --ir --ib --il` cell variables);
- `styles/hud.css`: top bar, pills, rule chips, tool bar, compact mode;
- `styles/overlays.css`: `.overlay[data-overlay] > .overlay__scrim--clear|soft|dark + .overlay__panel--sheet|dialog|stage`, the screen layouts, toast, coach, rotate notice and the loading indicator (`.loading-layer > .loading-card`);
- `styles/fx.css`: animation classes and the reduced-motion rule (`[data-motion='reduced']`).

**Bundle split (04 §9).** Modules that the first screen does not need are lazy chunks: the overlays O1–O7 (`app/overlay-chunk.ts`, preloaded by boot after the first route), the hint engine (`engine/hint.ts` and the grader; `EngineClient.preload()`), the RPC layer (`workers/rpc.ts`, loaded with the worker), the sound recipes (`audio/lazy-sfx.ts` wraps `audio/sfx.ts`) and the win/fail/daily/tutorial poses (`ui/art/illustrations.ts`; the home and boot poses are in `ui/art/mascot.ts`). Rules for new code:

- Do not import `ui/overlays/*` values (except `toast`, `loading-indicator`, `rotate-notice`, `overlay-base`, `hint-text`) from main-bundle modules; open overlays through the router. Type-only imports of any overlay's props are fine. (The coach left this list in the Phase 2 hardening, §10.)
- `RouterFactories.loadOverlays` is the test seam for the chunk; tests that pass every overlay in `factories.overlays` stay synchronous.
- The S0 splash (`ui/screens/boot-screen.ts`) is web-only: boot passes it to the router as `factories.bootScreen` when `__PLATFORM__ === 'web'`, so FBIG builds drop it (FB shows its own loader).

**New app APIs.** `Router.setLoading(on)` (loading indicator, `aria-busy` on the app root; the session shows it when opening a level or daily takes longer than `cfg.loading.indicatorDelayMs` = 300 ms); `app/ui-sounds.ts` (`attachUiClickFeedback`: the 02 §16 UI click and 4 ms vibration for every enabled button outside the board, delegated on the app root); initial focus in a modal goes to its first focusable `[data-autofocus]` element; `E2EHooks.generate(spec, 'worker' | 'main')` for the cross-engine check (`tests/e2e/determinism.spec.ts`).

**New strings and config.** `game.loading`, `kitty.unavailable` (toast when the kitty cannot pick a cell; nothing is charged); `cfg.loading.indicatorDelayMs`.

**Layering.** `src/game/**` may import `src/data/**` (`level-assets.ts` wires the shipped JSON), see §2.

**Content scripts.** The worker pool and the resumable cache moved from `gen-levels.ts` to `scripts/gen-pool.ts` (shared with `gen-daily.ts`); `gen-levels.ts` re-exports the old names. Regenerating with `--no-cache --workers 4` reproduces every pack and daily month byte for byte.

## 10. Phase 2 hardening changes (integration lead, 2026-10-07)

A six-lens review found 56 issues; the fixes (groups A app resilience, B FB platform and boot, C UI, visuals and a11y) and the lead's follow-ups added the APIs below. All are additive; nothing that another module calls changed its signature, except where noted.

**Product name.** The product name lives in **one** place, the i18n key `app.name` (working title "Mewdoku", a code name pending the user's decision, 06 §6.1). Every other string takes it through `{name}` (`about.madeBy`); `index.html`'s `<title>` mirrors it, and `tests/unit/app/product-name.spec.ts` keeps the two in sync, fails if any other key or a shipped licence notice spells the name, and guards the favicon. The old `about.made` key (which spelled the name) was removed: this is the one key removal of Phase 2, made by the lead for LEGAL-1. Internal identifiers (storage keys, seeds, `window.__mewdoku`, the font-face alias) are not user-facing and stay.

**Router and overlays.**

- `Router.overlaysReady(): Promise<boolean>`: loads the lazy overlay chunk if needed; `false` when it cannot be loaded. Never rejects. Helper flows check it before charging for a card (O1, O2).
- `Router.preloadOverlays()`: starts the chunk; boot calls it after the first route, and on a first run boot awaits `overlaysReady()` during the loading screen (bounded by `boot.overlayTimeoutMs`).
- Event **`overlay:failed { id }`** (`app/events.ts`): the chunk failed after its retries; the router has closed the queued overlay. The session reconciles: `hint` → back to playing, nothing charged; `win` / `daily_result` / `fail` → toast, then Home with the result or the lost board saved; `coach` → toast, and the tutorial's "Got it" step moves on by itself; anything else → toast.
- **The coach (O8) is in the lazy chunk** (`overlay-chunk.ts` exports `createCoach`; `loadOverlayChunk()` returns it). It is still non-modal; a queued coach never makes the board inert.
- Focus: the router passes `restoreOnNextFrame: true` to `trapFocus`, so focus goes back to the opener on the next animation frame (RP-3). Tests that check the restored focus wait one frame. `RouterFactories.trapFocus` takes the same option.
- `GameScreen` recovers lost focus onto the board two frames after it drops to `<body>`, and handles **H / K** anywhere on the game screen while no modal is open (02 §6.3).

**Platform (all optional members, so test doubles need not implement them).**

- `RawSave.localUnmerged?: boolean`: FB mirror written by a session that never merged the cloud copy (PLAT-1).
- `PlatformStorage.onExternalSave?(cb: (copy: ExternalSave) => void): () => void`, `ExternalSave { source: 'cloud' | 'tab'; value }`: save copies that arrive after `load()` (the late FB cloud read; another web tab's write). The app merges each (`app/restore.ts mergeArrived`) and writes back only a cloud copy.
- `capabilities()` is final after `init()` **except** that an ad kind can switch off later: the FB adapter latches a kind off after an `unsupported` result (PLAT-4). Read capabilities at the moment of use, never cache them.
- FB local mirror per player: key `mewdoku.save.v1:<encodeURIComponent(playerId)>`, with the persistent marker `<key>#unmerged` (`web/local-storage.ts createLocalFlag(key)`, `LocalFlag { get, set }`). The web build keeps `mewdoku.save.v1`.
- `platform/shared/timers.ts`: `sleep(timers, ms)`, `within(timers, p, ms, onTimeout)`. `fb/fb-analytics.ts toSdkParams(params)`: values as strings (PLAT-7).

**App.**

- `app/fetch-json.ts fetchJsonWithTimeout(url, timeoutMs = levels.fetchTimeoutMs, fetchImpl?)`: aborts and rejects after the deadline; boot passes it to `createAssetLoaders`.
- `app/restore.ts`: `loadSave(raw, now)`, `mergePreferring(preferred, other)`, `mergeArrived(live, copy, now)`; `boot.ts` re-exports `applyRestoreRules` and `loadSave`.
- `boot.showBootFailure(root, reload?)`: the honest start-up error with "Try again" (PLAT-8); `main.ts` calls it when `boot()` rejects.
- `session-parts.ts withSlot(save, slot, value)` writes a level board only when its id is `L${progress.level}`; `withoutSlot(save, slot, puzzleId)` clears a slot only for its own board (late cloud merge, 04 §7.3).
- Helper flows: a rewarded request that returns `unsupported` after the player accepted O2 takes the free grant at once when the cooldown allows (PLAT-4); otherwise "no video".
- The hint context passed to O1 and to the announcement includes `regions` (`HintTextContext.regions?`), so `hintLocation()` names the tile's colour (A11Y-7).

**Workers.**

- `workers/lazy-chunk.ts`: `loadChunk(load, opts?)` retries a failed dynamic import from its URL with a cache-busting `?retry=N` after `chunks.retryDelaysMs`, each attempt capped by `chunks.timeoutMs`; `deadline(p, ms, onExpire?)`; `failedChunkUrl(err)`. The overlay chunk, the sound recipes (`createLazySfx(audio, () => loadChunk(() => import('../audio/sfx')))`) and the hint engine load through it. It lives in `workers/` and imports only `app/config.ts` (allowed, §2), so `app/` may use it.
- `EngineClient`: the worker's start-up and each call have `worker.callTimeoutMs`; on expiry the worker is dropped and the call runs on the main thread.

**UI.**

- `ui/a11y/focus-trap.ts trapFocus(container, { initialFocus?, returnFocus?, restoreOnNextFrame? })`.
- `ui/overlays/hint-card.ts hintLocation(step, ctx)`; `hint-text.ts regionName(label, ctx)`.
- `ui/overlays/overlay-base.ts setTextKeepTogether(el, text, phrases?)` (no orphaned dates or "Double-tap").
- `ui/overlays/rotate-notice.ts shouldShowRotateNotice(w, h, phone = true)`, `isPhone(win)`: phones only (coarse pointer, short side < 600 px), visual-viewport sizes at scale 1 (02 §19).
- `ui/overlays/toast.ts TOAST_SETTLE_MS`, `modalOverlayOpen(doc)`; `coach.ts LIVE_SETTLE_MS`, `placeCard(...)`, `roundSpot(...)`, `SoftRect`; `board-view.ts patternScaleFor(slotPx)`; `layout.ts readViewport(win, fresh?)`; `game/progression.ts localMidnightAfter(dateKey)`.
- O7 shows `daily.ready` instead of the countdown once `nextPuzzleAt <= now()` (logic-5).

**New config keys** (`app/config.ts`): `ads.loadTimeoutMs` (12 s), `levels.fetchTimeoutMs` (5 s), `save.cloudLateRetryDelaysMs` ([5, 15, 30, 60] s), `layout.patternOpacity` (0.85), `layout.patternOpacityDone` (0.65), `layout.patternMinPx` (7), `boot.packTimeoutMs` (1.5 s), `boot.platformRetryDelayMs` (1 s), `boot.overlayTimeoutMs` (1.5 s), `loading.failSafeMs` (25 s), `chunks.retryDelaysMs` ([500, 1500]), `chunks.timeoutMs` (8 s), `worker.callTimeoutMs` (10 s).

**New strings** (`src/i18n/en.ts`, appended): `daily.ready`, `about.madeBy`, `boot.failed`, `boot.retry`, `a11y.hintAt`, `a11y.hintAtColor`, `howto.keys`, `fail.continue.a11y.videoLabel`, `fail.continue.a11y.freeLabel`, `about.code`, `about.codeLicence`.

**Tokens** (02 §17.2): `--accent #17806F`, `--accent-deep #0F5A4E`, `--ink-2 #6F6375`, new `--amber-text #8A5A00` and `--stage #2D2435`; `scripts/palette-check.ts` checks the UI text pairs at 4.5:1 and the pattern glyphs at 3:1.

**Bundle budget** (04 §9, lead decision): main JS ≤ 190 KB, CSS ≤ 40 KB, first load ≤ 250 KB, lazy JS ≤ 48 KB (the coach moved there), worker ≤ 25 KB unchanged.

