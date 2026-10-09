# 04 · Architecture: the technical design down to source files

Status: Phase 1 deliverable · Date: 2026-10-06

This document describes how Phase 2 will be built: the stack, the full planned source tree, the core types, state management, rendering, input handling, persistence, the platform-adapter abstraction, build outputs and npm scripts. Behaviour is specified in [02](02-rebuild-spec.md), the engine in [03](03-puzzle-engine.md), and the FBIG platform in [05](05-fbig-platform.md).

## 1. Stack and constraints

| Concern | Choice | Notes |
|---|---|---|
| Language | **TypeScript, strict** | The repo `tsconfig.json` already sets `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` and `isolatedModules`. The scaffold pins TS ^7. |
| Bundler / dev server | **Vite** (^8, Rolldown-based) | Two build modes: `web` and `fbig`. |
| Rendering | **DOM + CSS + inline SVG**. No game engine and no UI framework. | A grid puzzle with at most 144 cells does not need canvas or WebGL. Plain DOM gives accessibility for free. |
| Unit and property tests | **Vitest** (^5) | Engine, reducer, pacing, save, and properties of the level packs. |
| E2E tests | **Playwright** (^1.56), Chromium | Browsers are preinstalled at `/opt/pw-browsers`; set `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`. |
| Runtime dependencies | **None** | Dev-only. Already installed: `tsx`, `vite`, `vitest`, `typescript`, `@playwright/test`, `@types/node`. To add in Phase 2: `jsdom` (Vitest environment for `tests/unit/ui`), `fflate` (zipping) and `@vitejs/plugin-basic-ssl` (HTTPS dev for FB embed testing, Phase 4). |
| Network at runtime | **None** except the FB SDK script and FB's own APIs in the `fbig` build. Our own static files (level packs) are fetched same-origin from the bundle. | No analytics SDKs, CDNs, fonts or telemetry endpoints. |
| Browser baseline | ES2020: Chrome/Android WebView 80+, iOS Safari 14+ | Covers the FB in-app browsers in use. Confirm in Phase 4. |

## 2. Layering rules

```
            ┌───────────────────────── ui/ (DOM, CSS, SVG, input) ─────────────────────────┐
            │                                   ▲ renders state, dispatches actions         │
            │              app/ (store, router, session orchestration, effects)             │
            │                 ▲ uses                       ▲ uses                           │
            │       game/ (pure reducer, rules,       platform/ (adapters: web | fbig)      │
            │        economy, pacing, save schema)           ▲ types only                   │
            │                 ▲ uses                                                        │
            │       engine/ (pure puzzle math: solver, generator, grader, hints, codec)     │
            └───────────────────────────────────────────────────────────────────────────────┘
```

- `engine/` and `game/` **never** touch the DOM, `window`, timers or the platform. They are pure and deterministic, and take an injected clock.
- `platform/` depends only on `game/` types, such as `SaveDataV1`.
- `ui/` never calls the platform directly. It dispatches to `app/`.
- A Vitest test, `tests/unit/layering.spec.ts`, scans import specifiers and fails the build if these rules are broken.

## 3. Planned source tree

```
Mewdoku-Instant/
├─ index.html                       Shell: <div id="app">, viewport meta, theme colour, module entry. The fbig build adds the SDK tag.
├─ package.json                     Scripts (§10). No runtime dependencies.
├─ tsconfig.json                    Strict TS (exists). Phase 2 adds "paths": {"@platform": ["./src/platform/web/index.ts"]} (§6.1)
├─ vite.config.ts                   Modes web|fbig|e2e, @platform alias, base './', per-mode outDir, html plugin
├─ vitest.config.ts                 Projects: unit, property; fake timers; jsdom only for ui tests; same '@platform' alias (web)
├─ playwright.config.ts             Chromium; webServer = preview of the e2e build; viewports 320/390/1280
├─ platform-assets/
│  └─ fbig/fbapp-config.json        Copied to the root of dist/fbig (05 §5.2)
├─ scripts/                         Node tooling, run with tsx; imports src/engine directly
│  ├─ level-schedule.ts             src/game/ramp.ts → per-level slots {n, grade band, hard, breather, sortable} (03 §8.2)
│  ├─ gen-levels.ts                 Generates src/data/levels/pack-000…009.json + manifest (03 §8)
│  ├─ gen-daily.ts                  Generates src/data/daily/YYYY-MM.json for a date range
│  ├─ verify-levels.ts              Re-verifies every shipped record (03 §11.2); used by CI
│  ├─ palette-check.ts              ΔE00 matrix, colour-blind simulation, glyph contrast (02 §17.2)
│  ├─ size-check.ts                 Enforces the bundle budget (§9) on dist/*
│  ├─ zip-fbig.ts                   dist/fbig → dist-zip/<name>-fbig-<ver>-<sha>.zip (index.html at root, ≤ 500 files)
│  └─ upload-fbig.ts                Phase 4: Graph API upload (05 §12); reads FB_APP_ID / FB_APP_SECRET from env
├─ src/
│  ├─ main.ts                       Entry: window.onerror/unhandledrejection, mount the SVG sprite, create the platform, run boot()
│  ├─ env.d.ts                      declare const __PLATFORM__, __E2E__; ImportMetaEnv (VITE_FB_PLACEMENT_INTERSTITIAL / _REWARDED)
│  ├─ app/
│  │  ├─ config.ts                  GameConfig: every tunable in 02 §3 (single source of truth)
│  │  ├─ flags.ts                   Feature flags (Phase 3 hook), all off by default
│  │  ├─ clock.ts                   Injectable now()/setTimeout wrapper (tests use a fake)
│  │  ├─ store.ts                   Tiny observable store: get / dispatch / subscribe (selector + equality)
│  │  ├─ events.ts                  Typed event bus (GameEvent and AppEvent)
│  │  ├─ boot.ts                    Boot sequence: platform.init → load save → load pack → progress → start
│  │  ├─ router.ts                  Screen switching, overlay stack, focus restore, Esc handling
│  │  ├─ session.ts                 Level-session orchestrator: reducer + effects (audio, haptics, save, analytics, fx);
│  │  │                             START/KITTY_DONE timers, 1 s TICK while visible, hint free-reopen cache, helper flows (§5.7)
│  │  ├─ ad-flow.ts                 Interstitial and rewarded flows: gate, readiness timeout, show watchdog, mute, input lock
│  │  └─ visibility.ts              visibilitychange + platform.onPause → pause timer, mute, flush save
│  ├─ engine/                       PURE: no DOM, no clocks
│  │  ├─ types.ts                   Puzzle, LevelRecord, packs, Grade, Unit, HintStep, GradeResult
│  │  ├─ bits.ts                    popcount, lowest-bit iteration, masks
│  │  ├─ rng.ts                     cyrb128 + sfc32; int(n) by rejection sampling; shuffle
│  │  ├─ geometry.ts                Index helpers, king neighbours, attack sets, unit tables
│  │  ├─ codec.ts                   LevelRecord ⇄ Puzzle; canonical labels; base-36; structural validation
│  │  ├─ solver.ts                  Solver B: countSolutions(n, regions, limit = 2)
│  │  ├─ solver-oracle.ts           Solver A (row DFS) for tests only; never imported by the app
│  │  ├─ generator.ts               randomKingPerm, growRegions(balanced|eden), repairUnique, generate(spec)
│  │  ├─ filters.ts                 Shape filters, 8-symmetry canonical key
│  │  ├─ techniques.ts              L0–L5 technique implementations returning trace steps
│  │  ├─ grader.ts                  grade(puzzle) and trace(state) loop; effort score
│  │  ├─ hint.ts                    getHintStep(puzzle, cells): mistaken-mark check + first new step; pickKittyCell (03 §6)
│  │  └─ colors.ts                  Region → palette assignment by adjacency and ΔE (03 §8.5)
│  ├─ game/                         PURE game rules and data
│  │  ├─ types.ts                   CellState, GameState, Action, GameEvent, Move, ModeId
│  │  ├─ reducer.ts                 reduce(state, action) → { state, events } (02 §6.2, §8)
│  │  ├─ factory.ts                 newGame(puzzle, mode) / restoreGame(puzzle, InProgressV1)
│  │  ├─ modes.ts                   GameMode registry: tutorial | level | daily → RuleFlags, title, win flow (Phase 3 hook)
│  │  ├─ tutorial.ts                Tutorial board, fixed colours, script (02 §11.5): per-step input filter, advance predicate, scripted marks
│  │  ├─ ramp.ts                    The 02 §11.2 ramp table + weekday table (02 §12); shared by scripts/ and the runtime
│  │  ├─ progression.ts             Level number → pack/record, isHard(L), endless/substitute GenSpec, daily unlock,
│  │  │                             localDateKey(now), weekdayOf(dateKey), daily date → record
│  │  ├─ levels-repo.ts             Loads the bundled pack 000 + fetched packs; cache; worker fallback
│  │  ├─ economy.ts                 Hint and kitty ledger; grants; fallback-grant cooldown
│  │  ├─ ad-pacing.ts               canShowInterstitial() (02 §13.2), with the clock passed in
│  │  ├─ save.ts                    SaveDataV1, defaults(), migrate(unknown), merge(local, cloud), encode cells
│  │  └─ stats.ts                   Per-level and daily records
│  ├─ platform/
│  │  ├─ types.ts                   PlatformAdapter and sub-interfaces (§6)
│  │  ├─ shared/haptics.ts          navigator.vibrate wrapper with feature detection
│  │  ├─ web/index.ts               createPlatform() for web: local storage, mock ads, no-op analytics
│  │  ├─ web/local-storage.ts       Safe localStorage JSON I/O (try/catch, quota handling)
│  │  ├─ web/mock-ads.ts            Dev mock: ?ads=ok|nofill|unsupported; placeholder ad overlay
│  │  ├─ fb/index.ts                createPlatform() for FBIG: lifecycle, capabilities via getSupportedAPIs
│  │  ├─ fb/fbinstant.d.ts          Our own minimal ambient types for the SDK subset we call
│  │  ├─ fb/fb-storage.ts           player.getDataAsync / setDataAsync (debounced) / flushDataAsync + local mirror
│  │  ├─ fb/fb-ads.ts               Interstitial and rewarded instances: preload, readiness timeout (4 s), show, error mapping
│  │  └─ fb/fb-analytics.ts         logEvent with name and param sanitising (05 §10)
│  ├─ ui/
│  │  ├─ dom.ts                     h() element helper, attribute and class utils, $ queries
│  │  ├─ screens/boot-screen.ts     Web-only splash with a progress bar
│  │  ├─ screens/home-screen.ts     S1: level button, daily card, stock readout
│  │  ├─ screens/game-screen.ts     S2: composes the HUD, board and tool bar; binds the session
│  │  ├─ board/board-view.ts        Builds the cell grid once per puzzle; diffs cell states on update
│  │  ├─ board/gestures.ts          Pointer gesture recogniser: tap, double-tap, drag paint (02 §6.1)
│  │  ├─ board/keyboard.ts          Roving tabindex, arrows, Space, Enter, H, K
│  │  ├─ board/layout.ts            Sizing math (02 §19); region-aware insets per cell
│  │  ├─ hud/top-bar.ts             Title, Hard badge, Home and Gear buttons, FB safe zone
│  │  ├─ hud/pills.ts               Cat counter and hearts pills, with animations
│  │  ├─ hud/rule-chips.ts          The three rule chips (icons + short text; compact mode)
│  │  ├─ hud/tool-bar.ts            Bulb and Paw buttons with count badges
│  │  ├─ overlays/hint-card.ts      O1: dim, outline focus cells, ghost effects, Apply; renders 02 §9.1 templates via i18n
│  │  ├─ overlays/rewarded-prompt.ts O2
│  │  ├─ overlays/win-overlay.ts    O3
│  │  ├─ overlays/fail-overlay.ts   O4
│  │  ├─ overlays/settings-modal.ts O5, including the "About & credits" sub-view
│  │  ├─ overlays/how-to-play.ts    O6
│  │  ├─ overlays/daily-result.ts   O7
│  │  ├─ overlays/coach.ts          O8: tutorial dimmer, target outline, animated hand
│  │  ├─ overlays/toast.ts          O9
│  │  ├─ overlays/rotate-notice.ts  O10
│  │  ├─ fx/confetti.ts             CSS particle burst (40 nodes, auto-cleanup)
│  │  ├─ fx/shake.ts                WAAPI board shake
│  │  ├─ fx/motion.ts               Reduced-motion resolution (system + setting)
│  │  ├─ art/sprite.ts              Inline SVG <symbol>s: cat moods, X, wrong-X, 12 pattern glyphs, icons
│  │  ├─ art/illustrations.ts       Larger cat poses (home, win, fail, boot)
│  │  ├─ art/palette.ts             Region colours and names, UI tokens (mirrors tokens.css)
│  │  ├─ a11y/announcer.ts          aria-live polite region
│  │  └─ a11y/focus-trap.ts         Modal focus management
│  ├─ audio/
│  │  ├─ audio-engine.ts            AudioContext lifecycle: unlock on gesture, suspend/resume, master gain
│  │  └─ sfx.ts                     Synthesised recipes (oscillators + envelopes + noise) per 02 §16
│  ├─ workers/
│  │  ├─ engine.worker.ts           generate(spec) and getHint(state) off the main thread
│  │  └─ rpc.ts                     ~30-line promise RPC over postMessage
│  ├─ i18n/
│  │  ├─ en.ts                      All UI strings and colour names (our copy)
│  │  └─ index.ts                   t(key, params), locale selection after platform.start()
│  ├─ styles/
│  │  ├─ tokens.css                 Colour, spacing and type tokens; region palette as --r0…--r11
│  │  ├─ base.css                   Reset, font-face (OFL font), body, buttons
│  │  ├─ board.css                  Board card, cells, insets, glyph states, region fade
│  │  ├─ hud.css                    Top bar, pills, chips, tool bar, compact mode
│  │  ├─ overlays.css               Scrims, sheets, modals, toasts
│  │  └─ fx.css                     Keyframes (drop, draw-in, crack, confetti); reduced-motion overrides
│  ├─ assets/fonts/                 display-latin.woff2 + OFL.txt (our chosen OFL font subset)
│  └─ data/
│     ├─ levels/pack-000…009.json   Generated and committed (03 §9). pack-000 is bundled; the rest are ?url assets.
│     ├─ levels/manifest.json       Version, ranges, SHA-256 per file
│     └─ daily/YYYY-MM.json         Generated and committed monthly daily packs
└─ tests/
   ├─ unit/engine/*.spec.ts         03 §11.1
   ├─ unit/game/*.spec.ts           Reducer tables, economy, ad pacing (fake clock), save migrate/merge
   ├─ unit/ui/*.spec.ts             Gesture recogniser with synthetic pointer streams; layout math
   ├─ unit/layering.spec.ts         Import-direction rules (§2)
   ├─ property/levels.spec.ts       03 §11.2 over all shipped records
   ├─ golden/gen-v1.json            Generator determinism snapshot
   ├─ fixtures/fbinstant-stub.js    Fake FBInstant used by the fbig e2e test
   └─ e2e/
      ├─ smoke.spec.ts              Web build happy and sad paths (§11)
      ├─ fbig.spec.ts               FB lifecycle, storage and ads calls against the stub
      └─ layout.spec.ts             No overflow at 320×568, 390×844, 1280×800
```

Pack loading uses Vite's asset handling. Packs 001–009 and the daily months are referenced through `import.meta.glob('../data/levels/pack-*.json', { query: '?url', import: 'default', eager: true })`, so they are emitted as hashed same-origin files and fetched on demand. Pack 000 is a normal JSON import, so the first level needs no fetch. The 03 §8.1 file names are relative to `src/data/`.

## 4. Core types (TypeScript)

### 4.1 Engine

```ts
// src/engine/types.ts
export type CellIndex = number;                       // r * n + c
export type Grade = 1 | 2 | 3 | 4 | 5;
export type PuzzleId = `T${number}` | `L${number}` | `D${string}`;   // T1, L37, D2026-10-06

export interface Puzzle {
  readonly id: PuzzleId;
  readonly n: number;                                 // 4..12
  readonly k: 1;                                      // cats per unit (Phase 3 hook, fixed at 1)
  readonly regions: Uint8Array;                       // n*n canonical labels 0..n-1
  readonly solution: Uint8Array;                      // solution[r] = c
  readonly givens: readonly number[];                 // rows whose cat is pre-placed
  readonly grade: Grade;
  readonly effort: number;
  readonly hard: boolean;
}

export interface LevelRecord {                         // on-disk form (03 §9.1)
  i?: number; n: number; r: string; s: string; g: Grade; e: number; h: 0 | 1; gv?: string; tut?: 0 | 1;
}
export interface LevelPack { v: 1; kind: 'levels'; first: number; count: number; gen: string; levels: LevelRecord[] }
export interface DailyPack { v: 1; kind: 'daily'; month: string; gen: string; days: Record<string, LevelRecord> }

export type UnitKind = 'row' | 'col' | 'region';
export interface Unit { kind: UnitKind; index: number }

export type HintKind =
  | 'mistaken_mark' | 'shadow' | 'single' | 'confine_region_line' | 'confine_line_region'
  | 'shadow_conflict' | 'pigeonhole' | 'trial' | 'reveal_fallback';

export interface HintStep {
  kind: HintKind;
  level: 0 | 1 | 2 | 3 | 4 | 5;
  focusUnits: Unit[];                                 // units named in the explanation
  focusCells: CellIndex[];                            // outlined cells
  effectCells: CellIndex[];                           // become Marks on Apply
  placeCell?: CellIndex;                              // becomes a Cat on Apply (always correct)
  k?: number;                                         // pigeonhole size
}

export interface GradeResult {
  grade: Grade | 6;                                   // 6 = stuck → reject
  counts: readonly [l0: number, l1: number, l2: number, l3: number, l4: number, l5: number];
  pigeonMaxK: number;
  effort: number;
}

export interface GenSpec {
  n: number; seed: string; gradeBand: readonly [Grade, Grade]; allowG5Steps: 0 | 1;
  minRegion: number; maxRegion: number; growth: 'mixed' | 'balanced' | 'eden'; maxAttempts: number;
}

export interface SolveResult { count: 0 | 1 | 2; solutions: Uint8Array[]; nodes: number }
export declare function countSolutions(n: number, regions: Uint8Array, limit?: number): SolveResult;
```

### 4.2 Game state, actions and events

```ts
// src/game/types.ts
export const CellState = { Empty: 0, Mark: 1, Cat: 2, Wrong: 3, Given: 4 } as const;
export type CellState = (typeof CellState)[keyof typeof CellState];
export type ModeId = 'tutorial' | 'level' | 'daily';
export type Status = 'ready' | 'playing' | 'hint' | 'kitty' | 'won' | 'lost';

export interface RuleFlags {                            // set per mode by modes.ts (Phase 3 hook)
  readonly mistakeModel: 'solution';                    // only model in Phase 2 (02 §2)
  readonly mistakePenalty: boolean;                     // false in the tutorial (02 §11.5)
  readonly autoX: boolean;                              // false everywhere in Phase 2 (tutorial marks are scripted)
  readonly heartsPerAttempt: number;                    // cfg.hearts.perAttempt (3)
  readonly maxRevives: number;                          // cfg.revive.maxPerAttempt (1)
  readonly heartsOnRevive: number;                      // cfg.revive.heartsRestored (1)
}

export interface GameState {
  readonly puzzle: Puzzle;
  readonly mode: ModeId;
  readonly rules: RuleFlags;
  readonly cells: Readonly<Uint8Array>;               // CellState per cell; replaced, never mutated
  readonly hearts: number;
  readonly catsPlaced: number;
  readonly regionsDone: number;                       // bitmask of regions whose cat is placed
  readonly status: Status;
  readonly mistakes: number;
  readonly revivesUsed: number;
  readonly hintsUsed: number;
  readonly kittiesUsed: number;
  readonly elapsedMs: number;
  readonly openHint: HintStep | null;
  readonly moves: readonly Move[];                    // move log (Phase 3 hook: undo, replay)
}

export type Move =
  | { t: number; kind: 'mark' | 'unmark'; cells: CellIndex[] }
  | { t: number; kind: 'cat'; cell: CellIndex; source: 'player' | 'hint' | 'kitty' }
  | { t: number; kind: 'wrong' | 'uncat'; cell: CellIndex }
  | { t: number; kind: 'revive' };

export type Action =
  | { type: 'START' }
  | { type: 'TAP'; cell: CellIndex; t: number }                  // Empty⇄Mark; otherwise pulse
  | { type: 'DOUBLE_TAP'; cell: CellIndex; t: number }           // Empty/Mark → cat attempt; Cat → remove
  | { type: 'PAINT'; cells: CellIndex[]; mode: 'mark' | 'erase'; t: number }
  | { type: 'HINT_OPEN'; step: HintStep; charged: boolean }       // charged=false for a free reopen (02 §9.1)
  | { type: 'HINT_APPLY'; t: number }
  | { type: 'HINT_CLOSE' }
  | { type: 'KITTY'; cell: CellIndex; t: number }                // cell from pickKittyCell (03 §6)
  | { type: 'KITTY_DONE' }                                       // session, kitty.revealMs after KITTY
  | { type: 'REVIVE'; t: number }
  | { type: 'RETRY' }
  | { type: 'TICK'; dtMs: number };

export type GameEvent =
  | { type: 'MARKED' | 'UNMARKED'; cells: CellIndex[] }
  | { type: 'CAT_PLACED'; cell: CellIndex; source: 'player' | 'hint' | 'kitty' }
  | { type: 'CAT_REMOVED'; cell: CellIndex }
  | { type: 'MISTAKE'; cell: CellIndex; heartsLeft: number }
  | { type: 'REGION_DONE'; region: number }
  | { type: 'PULSE'; cell: CellIndex }
  | { type: 'HINT_APPLIED'; step: HintStep }
  | { type: 'REVIVED' } | { type: 'WON' } | { type: 'LOST' };

export interface ReduceResult { state: GameState; events: GameEvent[] }
export declare function reduce(s: GameState, a: Action): ReduceResult;
```

**Status × action matrix.** An action outside its allowed status returns `{ state: s, events: [] }`.

| Action | Allowed in | Effect |
|---|---|---|
| `START` | ready | → playing |
| `TAP`, `DOUBLE_TAP`, `PAINT` | playing | 02 §6.2 table. A cat attempt follows 02 §8. With `rules.mistakePenalty = false`, a wrong attempt only emits `PULSE`. |
| `HINT_OPEN` | playing | → hint; `openHint = step`; `hintsUsed += charged ? 1 : 0` |
| `HINT_APPLY` | hint | Apply `openHint` (02 §9.1 step 4); `openHint = null`; → playing, or won if the placed cat completes the board. Emits `HINT_APPLIED`, plus `MARKED`/`CAT_PLACED`/`REGION_DONE`/`WON` as applicable. |
| `HINT_CLOSE` | hint | `openHint = null`; → playing |
| `KITTY` | playing | Place a Cat on `cell` (a Mark there is replaced); `kittiesUsed += 1`; → kitty, or won if the board is complete |
| `KITTY_DONE` | kitty | → playing |
| `REVIVE` | lost, and `revivesUsed < rules.maxRevives` | `hearts = rules.heartsOnRevive`; `revivesUsed += 1`; → playing; emits `REVIVED` |
| `RETRY` | lost | `newGame(puzzle, mode)`: givens only, full hearts, all counters 0, empty move log → ready |
| `TICK` | playing, hint, kitty | `elapsedMs += dtMs` |

Every changing action appends to `moves`, except `TICK`, `START`, `HINT_OPEN`, `HINT_CLOSE` and `KITTY_DONE`. `RETRY` starts a new, empty log. `PULSE` (a locked or filtered cell) never changes state.

**Tutorial input filter.** `tutorial.ts` exports `filterTutorialAction(step, state, action): Action | { type: 'PULSE_ONLY'; cell }`. The session runs it **before** `reduce()` while the mode is `tutorial`. It also exports `advance(step, state, signal?: 'got_it'): { next: number; scriptedMarks: CellIndex[] } | null`. The session calls it after every reduce, and with `'got_it'` when the coach card's button is pressed (step 2). The session dispatches scripted marks itself, **bypassing** the filter, as a `PAINT` action in mark mode, so only Empty cells change. In the tutorial the bulb opens the hint with `charged: false` and no stock debit (02 §9.3).

Reducer core (illustrative):

```ts
case 'DOUBLE_TAP': {
  if (s.status !== 'playing') return { state: s, events: [] };
  const st = s.cells[a.cell] as CellState;
  if (st === CellState.Cat) return removeCat(s, a.cell, a.t);                  // no penalty
  if (st !== CellState.Empty && st !== CellState.Mark) return pulse(s, a.cell);
  const r = Math.floor(a.cell / s.puzzle.n), c = a.cell % s.puzzle.n;
  return s.puzzle.solution[r] === c
    ? placeCat(s, a.cell, 'player', a.t)        // may emit REGION_DONE, WON
    : wrongAttempt(s, a.cell, a.t);             // Wrong, hearts-1, MISTAKE, maybe LOST
}
```

### 4.3 Save data

> **Phase 2c (2026-10-09): save v3** ([fish-lives-spec](../phase2c/fish-lives-spec.md) §3.8; `src/game/types.ts`, `src/game/save-v3.ts`). `SaveDataV3 = Omit<SaveDataV2, 'v' | 'wallet'> & { v: 3; streak: { current, best }; period: { key, total, bestKey, bestTotal } }`; `SAVE_VERSION = 3`, same storage keys. `MIGRATIONS[2]` drops the wallet and any pending `paw_points` score; a document stored below v3 has its retired fish-pack ledger entries compensated once in hints and kitties. Merge: `streak.current` from the newer document and the higher `best`; `period` by key (equal keys: the higher total; else the later key), the higher `bestTotal`. A changed `period.kind` resets the period record. The v1/v2 text below is kept for history.

```ts
// src/game/save.ts
export interface SaveDataV1 {
  v: 1;
  updatedAt: number;                                   // epoch ms; drives merge of "newest wins" fields
  firstSeenAt: number;                                 // tenure for ad pacing (02 §13.2)
  sessions: number;
  tutorialDone: boolean;
  progress: {
    level: number;                                     // next level to play (≥ 1)
    completed: number;                                 // levels won
    best: Record<number, [ms: number, mistakes: number]>;
  };
  stock: { hints: number; kitties: number };
  daily: Record<string, [ms: number, mistakes: number, hints: number, kitties: number]>;  // YYYY-MM-DD
  settings: { sound: boolean; haptics: boolean; patterns: boolean; reduceMotion: 'system' | 'on' | 'off' };
  ads: { lastAdAt: number; lastFallbackGrantAt: number };
  inProgress: {                                        // one slot per mode, so a level never discards the daily (02 §12)
    level: InProgressV1 | null;                        // mode 'level' (L2+; the tutorial is never saved)
    daily: InProgressV1 | null;                        // mode 'daily'
  };
  ext: Record<string, unknown>;                        // Phase 3 hook: new data without a schema bump
}

export interface InProgressV1 {
  id: PuzzleId; mode: 'level' | 'daily';
  cells: string;                                       // one char per cell: '0'..'4' = CellState
  hearts: number; revivesUsed: number; mistakes: number;
  hintsUsed: number; kittiesUsed: number; elapsedMs: number; savedAt: number;
}

export declare function defaults(now: number): SaveDataV1;
export declare function migrate(raw: unknown, now: number): SaveDataV1;         // vN → v1 chain; corrupt → defaults
export declare function merge(local: SaveDataV1, cloud: SaveDataV1): SaveDataV1;
```

Size: about 0.5 KB plus 15 B per completed level plus 25 B per daily, plus up to 2 × ~0.3 KB of in-progress boards. That is under 40 KB after 1 000 levels and a year of dailies, far below the FB 1 MB per-player limit (05 §7).

`defaults(now)`: `v: 1`, `updatedAt: now`, `firstSeenAt: now`, `sessions: 0`, `tutorialDone: false`, `progress: {level: 1, completed: 0, best: {}}`, `stock: {hints: cfg.hints.startStock, kitties: cfg.kitty.startStock}`, `daily: {}`, `settings: {sound: true, haptics: true, patterns: false, reduceMotion: 'system'}`, `ads: {lastAdAt: 0, lastFallbackGrantAt: 0}`, `inProgress: {level: null, daily: null}`, `ext: {}`. The UI label for `haptics` is "Vibration".

### 4.4 Platform adapter

```ts
// src/platform/types.ts
export interface Capabilities {
  interstitial: boolean; rewarded: boolean; banner: boolean; cloudSave: boolean;
  leaderboards: boolean; share: boolean; payments: boolean; haptics: boolean;
}

export type AdPlacement = 'next_level' | 'retry' | 'daily_done' | 'hint' | 'kitty' | 'revive';
export type AdResult =
  | { ok: true }                                       // interstitial shown / rewarded watched to the end
  | { ok: false; reason: 'unsupported' | 'no_fill' | 'not_ready' | 'skipped' | 'rate_limited' | 'timeout' | 'error' };

export interface PlatformAdapter {
  readonly id: 'web' | 'fbig';
  capabilities(): Capabilities;                        // final after init(), except that an ad kind can
                                                       // switch OFF later: FB latches it after an 'unsupported'
                                                       // (CLIENT_UNSUPPORTED_OPERATION) result (PLAT-4)
  init(): Promise<void>;                               // FB: initializeAsync (call early)
  setLoadingProgress(pct: number): void;               // FB: setLoadingProgress(0..100)
  start(): Promise<void>;                              // FB: startGameAsync
  getLocale(): string;                                 // valid after start()
  getPlayerId(): string | null;                        // game-scoped ID or null
  onPause(cb: () => void): void;
  storage: {
    load(): Promise<RawSave>;                          // both raw copies; the app migrates and merges (§7.3)
    // Writes the local mirror at once. cloud: 'debounced' = setDataAsync after save.cloudDebounceMs;
    // 'now' = setDataAsync at once; 'flush' = setDataAsync then flushDataAsync (§7.1). Web: cloud is ignored.
    save(data: SaveDataV1, opts: { cloud: 'debounced' | 'now' | 'flush' }): Promise<void>;
    status(): 'ok' | 'memory';                         // 'memory' = no localStorage (private mode, quota)
    onMemoryFallback?(cb: () => void): void;           // once, when the store is or becomes memory-only
    // Save copies that arrive after load(): FB 'cloud' (the late cloud read, §7.3) or web 'tab'
    // (another tab wrote the save). The app merges each into the live save; returns an unsubscribe.
    onExternalSave?(cb: (copy: { source: 'cloud' | 'tab'; value: unknown | null }) => void): () => void;
  };
  ads: {
    preload(kind: 'interstitial' | 'rewarded'): void;
    isReady(kind: 'interstitial' | 'rewarded'): boolean;
    showInterstitial(p: AdPlacement): Promise<AdResult>;
    showRewarded(p: AdPlacement): Promise<AdResult>;   // ok only when watched to completion
  };
  analytics: { log(name: string, params?: Record<string, string | number>): void };
  haptics: { pulse(pattern: number | readonly number[]): void };
  leaderboards?: {                                     // Phase 4, optional capability
    submit(board: string, score: number, extra?: string): Promise<void>;
    show?(board: string): Promise<void>;               // FB overlay view (05 §8)
  };
}

export interface RawSave {
  local: unknown | null;                               // parsed local mirror
  cloud: unknown | null;                               // parsed FB cloud copy (null on web)
  corrupt: boolean;                                    // a stored copy could not be parsed (backed up, §7.2)
  localUnmerged?: boolean;                             // FB: the mirror holds writes from a session that never
                                                       // merged the cloud copy, so the newest-wins fields come
                                                       // from the cloud (§7.3, PLAT-1)
}
```

## 5. Runtime design

### 5.1 Boot sequence

```ts
// src/app/boot.ts (shape)
export async function boot(platform: PlatformAdapter) {
  await retryOnce(() => platform.init());                  // FIRST: lets FB show its progress bar early
  platform.setLoadingProgress(10);
  mountSprite(); applyTokens();
  const raw = await platform.storage.load();               // FB: cloud read bounded by save.cloudLoadTimeoutMs
  const save = migrateAndMerge(raw, clock.now());          // §7.3 (localUnmerged → the cloud's fields win)
  save.sessions += 1; saves.touch();                       // firstSeenAt is set by defaults() on the very first boot
  platform.setLoadingProgress(40);
  await Promise.all([                                      // each wait is bounded; none can hold the start
    within(boot.packTimeoutMs, levels.ensurePackFor(save.progress.level)),   // pack-000 is bundled → instant
    within(boot.fontTimeoutMs, fonts.ready),               // the font is ≤ 25 KB; never block on failure
    !save.tutorialDone && within(boot.overlayTimeoutMs, router.overlaysReady()), // first run: the coach's chunk
  ]);
  platform.setLoadingProgress(100);
  await retryOnce(() => platform.start());                 // FB: startGameAsync; locale is valid after this
  session.startedAt = clock.now();                         // ad-gate session grace (02 §13.2)
  i18n.setLocale(platform.getLocale());
  applyRestoreRules(save);                                 // 02 §15 "Restoring on launch", steps 1-5
  router.go(save.tutorialDone ? 'home' : 'game:tutorial');
  if (caps.interstitial) platform.ads.preload('interstitial');
  if (caps.rewarded) platform.ads.preload('rewarded');
}
```

Restore step 4 (a saved board that is already full) and step 5 (hearts = 0) only take effect when the player opens that board from Home. `applyRestoreRules` validates the boards and clears stale or invalid slots; it does not navigate.

Bounded waits and an honest failure (Phase 2 review RP-1, PLAT-8):

- Nothing on the way to `platform.start()` waits without a bound. A pack still loading after `boot.packTimeoutMs` (1.5 s) goes on in the background, and `getLevel()` waits for it later behind the loading indicator. The font gets `boot.fontTimeoutMs`. On a **first run** the lazy overlay chunk, which holds the tutorial coach (O8), is fetched in the same parallel wait, capped by `boot.overlayTimeoutMs` (1.5 s), so the tutorial's first board shows with its coach; returning players fetch it at the last step.
- `platform.init()` and `platform.start()` are each **retried once** after `boot.platformRetryDelayMs` (1 s). A second failure rejects `boot()`, and `main.ts` shows an honest error ("The game couldn't start…", `boot.failed`) with a **Try again** button that reloads. It never shows the "you can keep playing" toast, because nothing can be played.
- Save copies that arrive after launch (`storage.onExternalSave`: the FB late cloud read, another web tab) are merged into the live save (`restore.ts mergeArrived`, §7.3). Only a cloud copy is written back.

### 5.2 State management

- **One store** (`app/store.ts`) holds `AppState = { screen, overlay[], save, game: GameState | null, ui }`.
- The game slice changes only through `reduce()`. Its events go to `session.ts`, which runs the side effects:
  - audio (`sfx.play`);
  - haptics;
  - announcer messages;
  - save scheduling (debounced, or immediate for critical moments);
  - analytics;
  - progression on `WON` (next level, unlocks);
  - routing to the win and fail overlays after the delays in 02 §3.
- Economy and settings changes are **app actions** that update `save` and schedule a save.
- **Timer.** While the page is visible and the status is playing, hint or kitty, the session dispatches `TICK { dtMs }` every 1 000 ms, where `dtMs` is measured with `performance.now()`. On hide or `onPause` it sends one last `TICK` with the partial delta and stops. It restarts on return. It also stops while O5 or O6 is open or an ad is showing (02 §7.2).
- **Timed transitions.** The session dispatches `START` `fx.boardEntryMs` after mounting a board, and `KITTY_DONE` `kitty.revealMs` after `KITTY`. The win and fail overlays open `fx.winOverlayDelayMs` / `fx.failOverlayDelayMs` after the `WON` / `LOST` events.
- Views subscribe with selectors and re-render only when their slice changes, compared by reference since everything is immutable.
- `cells` is copy-on-write: a new `Uint8Array` per change. That costs ≤ 144 bytes per move.

### 5.3 Rendering

- **Board.** A CSS grid of `<button class="cell">`, built once per puzzle. Per-cell CSS variables:
  - `--c` (region colour);
  - `--it`, `--ir`, `--ib`, `--il` (region-aware insets, 02 §17.4);
  - `--pat` (pattern glyph id).
  
  The state lives in a `data-s` attribute (`e|m|c|w|g`). CSS shows the matching SVG `<use>` (X, cat or wrong-X). An update diffs the previous `cells` against the new ones and touches only the cells that changed. Region fade uses a `data-done` attribute on cells of done regions.
- **Glyphs.** One hidden inline SVG sprite (`art/sprite.ts`) holds the `<symbol>`s. Cats use `<use href="#cat-idle">`; mood changes swap the href on the board-level class (`.board[data-mood=sad] .cell use.cat`).
- **Animations.** CSS keyframes are triggered by adding a class and removed on `animationend`. The shake uses WAAPI. Only `transform` and `opacity` are animated. No layout thrash: the board size is computed once on resize, in `layout.ts`, using `ResizeObserver` on the app root plus `visualViewport` resize.
- **Overlays.** Each is a DOM subtree mounted lazily on first use, with `hidden` toggling, a focus trap and `inert` on the background.
- **No canvas** anywhere. Confetti uses 40 absolutely positioned `<i>` elements with random CSS variables.

### 5.4 Input handling

```ts
// src/ui/board/gestures.ts (shape)
board.style.touchAction = 'none';                          // the board owns gestures; no scroll or zoom
board.addEventListener('pointerdown', (e) => {
  if (!e.isPrimary || inputLocked()) return;
  board.setPointerCapture(e.pointerId);
  start = { x: e.clientX, y: e.clientY, cell: hit(e), t: e.timeStamp }; dragging = false;
});
board.addEventListener('pointermove', (e) => {
  if (!start) return;
  if (!dragging && dist(e, start) >= cfg.input.dragStartPx(slot)) {
    dragging = true; pending = null;                       // a drag cancels the double-tap window
    mode = cellState(start.cell) === Mark ? 'erase' : 'mark';
    paint([start.cell]);
  }
  if (dragging) paint(cellsAlongSegment(last, hit(e)));    // DDA through the grid; no skipped cells
});
board.addEventListener('pointerup', (e) => {
  if (!start || dragging) return reset();
  const c = start.cell, t = e.timeStamp;
  if (locked(c, t)) return reset();                        // cellLockAfterCatMs
  if (pending && pending.cell === c && t - pending.t <= cfg.input.doubleTapMs) {
    dispatch({ type: 'DOUBLE_TAP', cell: c, t }); lockCell(c, t); pending = null;
  } else {
    dispatch({ type: 'TAP', cell: c, t }); pending = { cell: c, t };   // applied instantly
  }
  reset();
});
board.addEventListener('pointercancel', reset);
board.addEventListener('contextmenu', (e) => e.preventDefault());
```

- **Hit-testing** is pure math from the board's bounding rect and slot size. The gap belongs to the nearest cell; the coordinates are clamped to the grid.
- **Paint.** `paint(cells)` batches the cells crossed in each pointermove into one `PAINT` action. Sound is throttled to one tick per 40 ms.
- **Keyboard.** `keyboard.ts` keeps a roving `tabindex=0` on the focused cell and maps keys to the same actions (02 §6.3).
- **Input lock.** It is on during READY, overlays, ads and kitty reveal. Pointer streams that are still in progress are dropped.

### 5.5 Workers

`engine.worker.ts` exposes two methods:

- `generate(spec)`: endless levels past 1 000, and missing daily months.
- `getHint(snapshot)`: used if the main-thread budget is exceeded (03 §6).

It is created lazily on first need, never during boot. The worker is a separate module that Vite emits, which adds one file to the bundle.

### 5.6 Audio

- `audio-engine.ts` creates the `AudioContext` on the first `pointerdown` and keeps one master `GainNode`.
- `sfx.ts` defines each sound as a tiny recipe: oscillator type, frequency envelope, gain ADSR and an optional filtered-noise burst. Sounds are scheduled at `ctx.currentTime`.
- There are no audio files, which means zero bytes of audio and no licensing questions.
- Sound mutes on Sound-off, on `visibilitychange: hidden`, on `platform.onPause` and during any ad.

### 5.7 Helper and ad flows (session + ad-flow)

These sequences fix the order of the stock debit, the ad and the reducer action. They are the contract for `session.ts`; the behaviour is in 02 §9, §10.2 and §13.

```text
onBulb():                                     // only when status == playing
  if mode == tutorial: step = getHintStep(...); dispatch HINT_OPEN{step, charged:false}; return
  if hintCache.boardHash == cellsString(state): dispatch HINT_OPEN{hintCache.step, charged:false}; return
  if save.stock.hints == 0:
     granted = await rewardedOrFallback('hint')     // opens O2; resolves true/false
     if !granted: return
     save.stock.hints += 1; saves.now()
  step = await getHint(state)                        // throws → toast "Hint unavailable", no debit
  save.stock.hints -= 1; saves.now()
  hintCache = {boardHash: cellsString(state), step}
  dispatch HINT_OPEN{step, charged:true}

onPaw():                                      // only when status == playing
  if save.stock.kitties == 0:
     if !(await rewardedOrFallback('kitty')): return
     save.stock.kitties += 1; saves.now()
  cell = pickKittyCell(puzzle, state.cells)
  save.stock.kitties -= 1; saves.now()
  dispatch KITTY{cell}; after kitty.revealMs: dispatch KITTY_DONE (unless WON)

onContinue():                                 // O4, only if revivesUsed < maxRevives
  if await rewardedOrFallback('revive'): dispatch REVIVE   // else stay on O4 (toast already shown)

rewardedOrFallback(p):                        // for 'hint' and 'kitty' it opens O2 first; for 'revive' the O4 button is the prompt
  if cfg.ads.enabled && caps.rewarded:
     if p != 'revive' && !(await o2.ask(p)): return false   // "Not now"
     r = await adFlow.rewarded(p)                   // readiness ≤ ads.readyTimeoutMs, then show without timeout
     if r.ok: if cfg.ads.rewarded.resetsInterstitialClock: save.ads.lastAdAt = now; return true
     toast(no-video); return false
  if now − save.ads.lastFallbackGrantAt ≥ cfg.ads.unsupportedFallback.cooldownSec × 1000:
     (O2 fallback variant, 02 §5 O2) on accept: save.ads.lastFallbackGrantAt = now; saves.touch(); return true
  show the countdown variant; return false

onNext(trigger):                              // 'next_level' | 'retry' | 'daily_done'
  if canShowInterstitial(trigger, ...): r = await adFlow.interstitial(trigger)   // never throws
  if r?.ok: save.ads.lastAdAt = now; saves.touch()
  continue the transition                      // always, whatever the ad result
```

`adFlow` locks board input and mutes audio from the request until the ad settles, logs `ad_*` analytics with the result, and asks the adapter to preload a new instance afterwards.

## 6. Platform adapters

### 6.1 Build-time selection

```ts
// vite.config.ts (shape)
import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';

const FB_SDK = 'https://connect.facebook.net/en_US/fbinstant.8.0.js';      // pinned (05 §2)

function platformHtml(fb: boolean): Plugin {
  return {
    name: 'platform-html',
    transformIndexHtml: (html) =>
      fb ? html.replace('<!--PLATFORM_HEAD-->', `<script src="${FB_SDK}"></script>`)
         : html.replace('<!--PLATFORM_HEAD-->', ''),
  };
}

export default defineConfig(({ mode }) => {
  const fb = mode === 'fbig';
  const e2e = mode === 'e2e';
  const platformEntry = fb ? './src/platform/fb/index.ts' : './src/platform/web/index.ts';
  return {
    base: './',                                            // relative URLs: required inside the FB zip
    define: {
      __PLATFORM__: JSON.stringify(fb ? 'fbig' : 'web'),
      __E2E__: JSON.stringify(e2e),                        // enables window.__mewdoku test hooks
    },
    resolve: { alias: { '@platform': fileURLToPath(new URL(platformEntry, import.meta.url)) } },
    build: {
      outDir: fb ? 'dist/fbig' : e2e ? 'dist/e2e' : 'dist/web',
      target: 'es2020',
      sourcemap: !fb,                                      // no maps in the FB zip
      assetsInlineLimit: 0,                                // keep packs as files
      cssCodeSplit: false,
    },
    plugins: [platformHtml(fb)],
  };
});
```

`src/main.ts` imports `createPlatform` from `'@platform'`. Only the selected adapter is bundled: the web build contains no FB code, and the FB build contains no mock ads.

Type-checking and tests need the alias too. `tsconfig.json` gets `"paths": { "@platform": ["./src/platform/web/index.ts"] }`, and `vitest.config.ts` gets the same alias. Both adapters export `createPlatform(): PlatformAdapter`, so checking against the web adapter is enough, and `tsc` still type-checks `src/platform/fb/**` because the whole `src` folder is included. `src/env.d.ts` declares `__PLATFORM__`, `__E2E__` and the `VITE_FB_PLACEMENT_*` env keys.

### 6.2 WebAdapter (`platform/web`)

| Concern | Behaviour |
|---|---|
| Lifecycle | `init`, `start` and `setLoadingProgress` drive our own splash (S0) |
| Storage | `localStorage['mewdoku.save.v1']`, wrapped in try/catch. On failure (private mode, quota) it falls back to in-memory storage and shows a one-time toast. |
| Ads | **Dev and e2e builds** (`import.meta.env.DEV \|\| __E2E__`): `MockAds`, controlled by `?ads=ok\|nofill\|unsupported\|close` (default `ok`; `close` simulates closing a rewarded ad early). It shows a 1.5 s "Ad placeholder" overlay. **Production web**: ads are unsupported, so the free fallback grant (02 §13.3) applies. |
| Analytics | No-op (`console.debug` in dev) |
| Haptics | `navigator.vibrate` when available |
| Capabilities | `mock = DEV \|\| __E2E__`; `{interstitial: mock && ads≠unsupported, rewarded: mock && ads≠unsupported, banner: false, cloudSave: false, leaderboards: false, share: false, payments: false, haptics: 'vibrate' in navigator}` |

### 6.3 FBInstantAdapter (`platform/fb`)

| Concern | Behaviour (details in 05) |
|---|---|
| Lifecycle | `FBInstant.initializeAsync()` → `setLoadingProgress()` → `startGameAsync()`. `onPause` → pause the timer, mute audio, flush the save. The locale is read **after** start. |
| Capabilities | Derived from `FBInstant.getSupportedAPIs()`, e.g. `'getRewardedVideoAsync'`, `'player.setDataAsync'`, `'performHapticFeedbackAsync'`, `'globalLeaderboards.setScoreAsync'`. |
| Storage | `player.getDataAsync(['save'])` merged with the local mirror (§7.3), which is kept **per player** (`mewdoku.save.v1:<playerId>`); a cloud read slower than `save.cloudLoadTimeoutMs` is merged when it arrives, with cloud writes off until then (§7.3 "Late cloud merge"). `setDataAsync({save})` is debounced 3 s. `flushDataAsync()` only on critical saves: win, daily win, purchase (none in Phase 2). Every write is mirrored to localStorage. Write errors are retried with backoff; `PENDING_REQUEST` is coalesced. |
| Ads | One preloaded interstitial and one rewarded instance (`getInterstitialAdAsync(id)` / `getRewardedVideoAsync(id)` → `loadAsync()`). **Readiness timeout**: if the instance's `loadAsync()` has not resolved within `ads.readyTimeoutMs` (4 s) of the show request, return `{ok: false, reason: 'timeout'}` without showing it. **No timeout on `showAsync()`**: it resolves only when the ad is finished or closed, and rejects if it fails or the player closes it early (05 §6.2). `ad-flow.ts` adds the `ads.showWatchdogMs` safety net. FB error codes map to `AdResult` (`ADS_NO_FILL` → `no_fill`; `ADS_FREQUENT_LOAD` / `RATE_LIMITED` → `rate_limited`; `ADS_NOT_LOADED` → `not_ready`; `CLIENT_UNSUPPORTED_OPERATION` → `unsupported`; a rewarded rejection after the show began → `skipped`). A new instance is reloaded after every show or failure, after a failed load only once the reload backoff (`ads.reloadDelaysMs`) allows; a `loadAsync()` still pending after `ads.loadTimeoutMs` is abandoned as failed. An `unsupported` result latches that ad kind off for the session and turns its capability false, so the free fallback applies (05 §6.2). Placement IDs come from `import.meta.env.VITE_FB_PLACEMENT_INTERSTITIAL` and `VITE_FB_PLACEMENT_REWARDED`. **An empty ID makes that capability false**, so builds made before monetization is approved use the free fallback. |
| Analytics | `FBInstant.logEvent(name, undefined, params)`. Names and params are sanitised (05 §10). |
| Haptics | `performHapticFeedbackAsync()` if supported, else `navigator.vibrate` |
| Leaderboards | Phase 4 and feature-detected only (05 §8) |
| Player | `player.getID()`. No name or photo: SDK 8.0 does not expose them to game code (05 §3). |

## 7. Persistence

### 7.1 What and when

See 02 §15 for which data uses which mode. The `SaveScheduler` (`saves`, owned by the app layer) sets `updatedAt = now` on every write and has three modes:

- `touch()`: local write debounced by 400 ms; cloud `setDataAsync` debounced by 3 s (inside the adapter);
- `now()`: cancels both debounces; immediate local write and immediate cloud `setDataAsync`, **no** flush. Used on page hide, `onPause`, Home and stock changes;
- `critical()`: `now()`, then `flushDataAsync()`. Used only on level win, daily win and the first-run tutorial win or skip. This matches 05 §7: flush only on critical changes, because Meta calls it "expensive".

On the web adapter, `now()` and `critical()` are the same thing: a synchronous `localStorage` write.

### 7.2 Versioning and migration

- `SaveDataV1.v = 1`. A future `v2` adds `migrate_1_to_2(d)`. `migrate()` runs the chain, then **validates** every field: types, ranges and enum values. Invalid fields are replaced with defaults, and the whole object is never thrown away for one bad field.
- If the raw data is not parseable at all, it is copied to `localStorage['mewdoku.save.corrupt.<ts>']` (keeping the last 2) and defaults are used. An analytics event is logged.
- Each `InProgressV1` slot is validated against its puzzle, and a slot that fails is cleared (the level starts fresh). The checks:
  - `mode` matches the slot and `id` matches the expected puzzle (current level, or a daily date);
  - `cells.length === n²` and every char is `'0'…'4'`;
  - Cat only on solution cells, Wrong only on non-solution cells, Given exactly on the puzzle's given cells;
  - the number of Wrong cells equals `mistakes`;
  - `hearts === 3 + revivesUsed × heartsRestored − mistakes`, `0 ≤ hearts ≤ 3` and `revivesUsed ≤ maxPerAttempt`.

### 7.3 Merge rules (local mirror vs FB cloud)

| Field | Rule |
|---|---|
| `progress.level`, `progress.completed`, `sessions` | max |
| `progress.best[level]`, `daily[date]` | union; per key, the smaller `ms` wins |
| `firstSeenAt` | min |
| `tutorialDone` | OR |
| `stock`, `settings`, `ads`, `inProgress.level`, `inProgress.daily`, `ext` | Taken from the document with the newer `updatedAt` |
| After merging | An `inProgress.level` whose id is not `L${progress.level}` is cleared (that level was already won on the other device), and so is an `inProgress.daily` whose date has a `daily` record |

**FB local mirror per player (PLAT-2).** The FB build's mirror lives under `mewdoku.save.v1:<playerId>` (`save.storageKey` + `:` + the URL-encoded `player.getID()`), so another FB account on the same device never sees or merges it. With no player ID the unscoped key is a cache only: it is never merged with a cloud copy and never adopted by a player. The web build keeps the single key `mewdoku.save.v1`.

**Late cloud merge (PLAT-1).** If the boot cloud read fails or takes longer than `save.cloudLoadTimeoutMs` (4 s), the session starts from the mirror (or defaults) with **cloud writes off**, so it can never overwrite a cloud copy it has not merged. The read goes on in the background (`save.cloudLateRetryDelaysMs`, the last delay repeating). When it arrives, `onExternalSave({ source: 'cloud' })` hands it to the app, which merges it into the live save, taking the newest-wins fields from the cloud copy; only then do cloud writes start. A session that ran unmerged sets the persistent marker `mewdoku.save.v1:<playerId>#unmerged`; the next load that does read the cloud returns `localUnmerged: true`, so the mirror's fresher `updatedAt` does not win stock, settings, ads, in-progress boards or `ext`. The first save after a merge clears the marker.

**A level slot belongs to the current level.** The session writes a board to `inProgress.level` only when its id is `L${progress.level}`, and clears the slot only for its own board: after a late merge moved progress on, the session still playing the older level never overwrites or drops the newer level's board.

**Another web tab (RP-5).** The web adapter turns the `storage` event into `onExternalSave({ source: 'tab' })`: the app merges the other tab's copy (progress never goes backwards) and does not write it back, so two tabs never echo each other.

## 8. Error handling and resilience

- `window.onerror` and `unhandledrejection` log an analytics event and show a non-blocking toast. The game keeps running.
- Pack fetch failure: retry ×2 (after 500 ms and 2 s), then play a **substitute board** generated in the worker (02 §11.4, seed `mewdoku:fallback:v1:<L>`), which is not saved as in-progress, and log `pack_fallback`. The player never sees a dead end.
- **No request can hang** (RP-1). Every pack and daily-month fetch has a per-attempt deadline, `levels.fetchTimeoutMs` (5 s); a request that has not answered counts as a failed attempt (retry, then the substitute board or the generated daily).
- **Lazy chunks** (RP-2). Chromium remembers a failed dynamic `import()` and rejects the same URL again without a new request, so `workers/lazy-chunk.ts loadChunk()` retries a failed chunk from its URL plus a cache-busting `?retry=N`, after `chunks.retryDelaysMs` ([500, 1500] ms), with `chunks.timeoutMs` (8 s) per attempt. The overlay chunk, the sound recipes and the hint engine all load through it. When the overlay chunk still fails, the router closes the queued overlays and emits `overlay:failed`; the session reconciles: a hint is never charged without its card, a win or a loss goes Home with the result saved, other overlays toast, and the tutorial's "Got it" step moves on by itself. A later open retries the chunk.
- **Worker** (§5.5). The worker's start-up and each call have `worker.callTimeoutMs` (10 s); on expiry the worker is dropped and the work runs on the main thread.
- **Loading fail-safe.** A level or daily still not ready after `loading.failSafeMs` (25 s) goes back Home with a toast instead of leaving the loading indicator up forever.
- Waiting for an ad to become **ready** never blocks progress for more than `ads.readyTimeoutMs` (4 s). An ad that is showing is not interrupted; the `ads.showWatchdogMs` net unlocks input if its promise never settles (02 §13.2). FB: a `loadAsync()` that never settles is dropped after `ads.loadTimeoutMs` (12 s) and counts as a failed load (05 §6.2).
- Storage failure falls back to memory; the session still works. A store that fails mid-session (quota, revoked) switches to memory at once, shows the one-time toast and marks `ui.storage` (RP-4). On FB a blocked localStorage does not show the toast while cloud save works (PLAT-3).

## 9. Bundle budget (enforced by `scripts/size-check.ts`)

**Policy (lead decision, Phase 2b integration, 2026-10-09).** The first load is kept as small as practical and well within Meta's < 5 s load guideline on 4G (05 §5.4): everything a first screen does not need is lazy, and its stylesheet travels with its chunk. Each ceiling is the largest measured build (FBIG for JS, which carries the SDK glue) plus about 3 % headroom, so growth is noticed early. A ceiling moves only by a lead decision recorded here and in the `size-check.ts` history comment. The locale chunk cap is 28 KB per file (Devanagari and Thai take 3 bytes a character), and the FB zip stays ≤ 1 MB. Sizes are raw bytes (FB hosting may not compress, 05 §5); the first load is also budgeted gzipped (woff2 counted as it is), which is what a compressing CDN sends.

| Item | Ceiling | Measured 2026-10-09, final (web · FBIG) | Notes |
|---|---|---|---|
| Main JS (entry + modulepreload chunks; incl. the main-thread engine parts, bundled pack-000, English strings) | ≤ 279 KB | 256.4 · 271.0 | Phase 2 final 173.3 (FBIG). 2b added Tux art, save v2, economy, scoring, events, the win flow, the FB banner and social facades, the i18n runtime and about 8 KB of English strings; the review fixes added 13 KB (banner and ranking hardening, the router's screen-out and focus, lazy-CSS retry, relabelling, the shared viewport reading). Was ≤ 266 (243.6 · 257.7) at the integration pass |
| CSS (the stylesheet `index.html` links) | ≤ 43.5 KB | 42.6 · 42.6 | 70.9 KB before the integration split: the overlays' and the event screen's rules moved into their chunks' stylesheets |
| Font (first load, the latin subset) | ≤ 17 KB | 16.5 | The latin-ext face is lazy (unicode-range), listed only |
| `index.html` | ≤ 1 KB | 0.8 · 0.9 | — |
| **First-load total** (the four rows above) | **≤ 340 KB** | 316.3 · 331.0 | 2b spec §11 projected ≈ 266 KB; was ≤ 327 (302.9 · 317.2). 340 is 2.7 % over the FBIG build, kept below the sum of the rows' ceilings so it still binds |
| **First load + 1 locale** (the largest non-English catalogue added) | **≤ 365 KB** | 339.8 · 354.4 | A non-English player loads exactly one locale chunk; was ≤ 351 |
| **First load, gzip** | **≤ 126.5 KB** | 117.9 · 122.9 | Was ≤ 121.5 (113.1 · 117.9). Measured times: STATUS-2b §4 (the transfer alone understates the first load 4–7×, review DOC-1) |
| Worker JS (lazy) | ≤ 18.5 KB | 17.7 · 17.6 | Created on the first generation, never during boot (§5.5) |
| Locale chunk (each of 16) | ≤ 28 KB | 23.5 (hi) | Only the active locale loads; release builds carry only `i18n.releaseLocales` |
| Lazy JS, core (overlay chunk with the 2b overlays, hint engine, sound recipes, RPC, main-thread generator and grader) | ≤ 74 KB | 71.8 · 71.5 | Fetched right after the first screen (boot step 8), or during boot on a first run (the coach). Was ≤ 68 (65.9 · 65.7); the review fixes' overlay work (relabelling, rich teaching text, the victory's fit steps, the shop's live line) added 6 KB |
| Lazy JS, optional (`events`, `fb-social`, `social-flows`) | ≤ 29.3 KB | 15.2 · 28.4 | `events` when an event is active or teased (or an event board mounts); `fb-social` after `start()`; `social-flows` on the first hub, top-list or group use |
| Lazy CSS (`overlay-chunk-*.css`, `events-chunk-*.css`) | ≤ 31.2 KB | 30.3 | Loaded by Vite's preload helper before its chunk resolves (and re-fetched once with a cache-busting URL when it fails, review ROB-1). Was ≤ 28.5 (27.4); the dark victory, the FB safe zone and the sticky victory actions added 2.9 KB |
| Event packs (3 × 21 records), other packs (9 × ~15 KB), daily months (27 × ~4.7 KB) | listed | 9.6 + 273 | Fetched on demand |
| Files in the FB zip | ≤ 100 (platform cap 500) | 77 (preview) · 61 (release) | — |
| FB zip size | ≤ 1 MB hard (zip bytes), warning above 750 KB | see STATUS-2b | `zip-fbig.ts` (§10) |

Before the integration pass the same builds measured: web first load 330.7 KB raw / 117.9 KB gzip (CSS 70.9 KB), FBIG 345.0 KB raw / 122.7 KB gzip. The split took 28 KB raw off every first load (and the dead O3 win overlay with its confetti about 4 KB of lazy JS and CSS).

What stays in the main bundle, and why: the game screen and board (the first screen of a first run is the tutorial board), pack-000 (the first hundred levels play without a fetch, Phase 2), the save migration and merge, the win flow (it starts on the frame of `WON`, with the rewards already saved, §2.2 of the 2b spec; lazy-loading it would only save about 8 KB and add a load race at the moment that matters), and the FB social facades (they keep `capabilities()` final at `init()` while the social code stays lazy). Accidental duplication was checked from the source maps: only the engine modules appear twice, in the worker and in the lazy main-thread fallback chunks, by design (§5.5).

**Review fixes (lead decision, 2026-10-09, final integration).** The 47 fixes of the six-lens review pushed five rows over. Cheap reductions in the lazy chunks were tried first: no selector in the lazy stylesheets is unused (three candidates are all built at runtime), and the source maps show no module in two chunks except the by-design engine fallback; moving the rankings-hub and group-result UIs into the optional chunk would save 4.8 KB of core lazy JS but needs a second overlay loader in the router, which is not a cheap change. So each over-budget ceiling was set to the measured maximum plus about 3 % (table), and the optional lazy JS too (within its 28.5 KB at 28.4, with no headroom left). The first load stays within Meta's < 5 s on Slow 4G (measured, STATUS-2b §4).

**Phase 2c (2026-10-09, STATUS-2c §3): no ceiling moved.** The fish-lives work (save v3, scoring, the period counter and fish loss, the new strings) roughly balanced what it removed (the fish wallet, swaps, packs, paw points, the heart art and the deprecated members deleted at integration step I-3). Measured (web · FBIG): main JS 263.4 · 278.0 KB (≤ 279), first load 322.6 · 337.3 (≤ 340), + 1 locale 348.6 · 363.3 (≤ 365), gzip 119.8 · 124.8 (≤ 126.5), core lazy JS 70.7 · 70.5 (≤ 74), optional lazy JS 15.4 · 29.1 (≤ 29.3), lazy CSS 29.7 (≤ 31.2), locale chunk 26.0 (≤ 28); FB files 77 (preview) · 61 (release), release zip 290.9 KB. The FBIG main JS and optional lazy JS have under 1 KB of headroom: the next feature that adds to the FB first load needs a reduction or a recorded lead decision.

History: Phase 1 estimated 140 KB of main JS; integration (2026-10-07) set CSS 36 KB and main JS 170 KB; Phase 2 hardening raised main JS to 190 KB, CSS to 40 KB and the first load to 250 KB after moving the coach into the overlay chunk; the 2b spec (§11) proposed 210 / 53 / 280 / 305 KB, which the integrated 2b code exceeded; the integration pass split the CSS, removed dead code and set ceilings of 266 / 43.5 / 327 / 351 / 121.5 KB (lazy core 68, lazy CSS 28.5); the review fixes raised main JS, the first-load totals, the gzip row, the core and optional lazy JS and the lazy CSS to the values in the table.

## 10. npm scripts

As in `package.json` after the Phase 2b integration (2026-10-09):

```jsonc
{
  "dev": "vite",                                       // web build, mock ads (?ads=…), ?i18n=pseudo
  "dev:fbig": "vite --mode fbig --host 127.0.0.1 --port 8080",   // HTTPS via basic-ssl; open the FB embed URL (05 §11)
  "build": "vite build",                               // → dist/web (all 17 locales)
  "build:fbig": "vite build --mode fbig",              // → dist/fbig (+ fbapp-config.json; a preview build, all locales)
  "build:e2e": "vite build --mode e2e",                // → dist/e2e (test hooks on)
  "build:fbig-e2e": "vite build --mode fbig --outDir dist/fbig-e2e",   // with MEWDOKU_E2E=1 (Playwright fbig-390)
  "build:release": "vite build --mode release && vite build --mode release-fbig && npm run i18n:check -- --release",
                                                       // → dist/release-web, dist/release-fbig (i18n.releaseLocales only)
  "zip:fbig": "tsx scripts/zip-fbig.ts",               // the production zip, from dist/release-fbig
  "zip:fbig:preview": "tsx scripts/zip-fbig.ts --preview",   // a preview zip from dist/fbig, for testing on FB
  "preview": "vite preview --outDir dist/web",
  "preview:e2e": "vite preview --mode e2e --host 127.0.0.1 --port 4173 --strictPort",
  "preview:fbig-e2e": "vite preview --mode fbig --outDir dist/fbig-e2e --host 127.0.0.1 --port 4174 --strictPort",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:unit": "vitest run --project unit --project dom --passWithNoTests",
  "test:property": "vitest run --project property --passWithNoTests",
  "test:e2e": "playwright test",
  "levels:schedule": "tsx scripts/level-schedule.ts",
  "levels:gen": "tsx scripts/gen-levels.ts",
  "daily:gen": "tsx scripts/gen-daily.ts --from 2026-10 --to 2028-12",
  "events:gen": "tsx scripts/gen-events.ts",           // the three event packs (src/data/events/<id>.json)
  "levels:verify": "tsx scripts/verify-levels.ts",     // levels, dailies and the event packs
  "palette:check": "tsx scripts/palette-check.ts",     // tokens and the three event themes
  "i18n:check": "tsx scripts/i18n-check.ts",           // catalogues; --release: the review log and the shipped locales
  "size": "tsx scripts/size-check.ts",                 // §9; dist/web, dist/fbig, dist/release-* by default
  "verify": "npm run typecheck && npm run test && npm run levels:verify && npm run palette:check && npm run i18n:check",
  "release:fbig": "npm run verify && npm run build:release && npm run size -- dist/release-fbig && npm run zip:fbig",
  "upload:fbig": "tsx scripts/upload-fbig.ts"          // Phase 4 (Graph API); ignores preview zips unless --preview
}
```

The FBIG builds copy `platform-assets/fbig/fbapp-config.json` into their dist folder using a small `closeBundle` hook in the same Vite plugin. `zip-fbig.ts` (rules as of Phase 2b):

1. zips `dist/release-fbig/**` by default (the release-mode build, only `i18n.releaseLocales`; refused when it holds any other locale chunk); `--preview` zips `dist/fbig` instead and says "preview" in the file name;
2. refuses source maps, `.gz`/`.br` files, a build carrying the e2e test hooks, a missing `index.html` or `fbapp-config.json` at the root, more than 500 files, and a zip over **1 MB of zip bytes** (it was 1 MB raw before 2b; a preview build with all 17 locales is about 1 MB raw but well under 0.5 MB zipped); it warns above 100 files or a 750 KB zip;
3. zips with `index.html` at the root (no parent folder), deterministically (sorted entries, fixed timestamps);
4. writes `dist-zip/<name>-fbig[-preview]-<version>-<gitsha>.zip` and prints a size table.

## 11. Testing strategy

| Layer | Tool | Scope |
|---|---|---|
| Engine | Vitest | 03 §11.1 (oracles, soundness, determinism golden) |
| Content | Vitest (property) | 03 §11.2 over every shipped record |
| Game rules | Vitest | Table-driven reducer tests for every row of 02 §6.2 and §8; revive and retry; win and lose; region done; move log |
| Economy and pacing | Vitest + fake clock | Gate truth table (min level, session grace, tenure cooldowns 120/100/90, rewarded resets clock); fallback grant cooldown |
| Save | Vitest | migrate (v0 garbage → defaults; partial fields), merge table, size bound |
| Gestures | Vitest (jsdom) | Synthetic pointer streams: tap, double-tap inside and outside 300 ms, drag mark and erase, cell lock, multi-touch ignored |
| Layout | Vitest | Board-size math at a grid of viewports; compact thresholds |
| E2E web | Playwright (Chromium) | (1) first run → tutorial completes → Level 2; (2) double-tap a non-solution cell → 2 hearts and a red X; (3) three mistakes → fail overlay → Retry → fresh board; (4) win via the test hook's solution → win overlay → Next → Level 3; (5) reload mid-level → exact board restored; (6) hint opens, Apply marks cells; (7) drag paints Xs; (8) daily locked before level 20, unlocked after (seeded save); (9) reload while O4 is open → O4 shown again, with Continue still offered; (10) `?ads=unsupported`: bulb at 0 hints → free hint, then the countdown variant within 10 min; (11) a level and a daily both in progress → both restored; (12) `?ads=close` → no reward granted |
| E2E fbig | Playwright + `fbinstant-stub.js` | `page.route('https://connect.facebook.net/**')` serves the stub. Asserts `initializeAsync` is called first; progress reaches 100 before `startGameAsync`; `setDataAsync` is called after a move (debounced) and `flushDataAsync` on a win; an interstitial is requested at the next-level transition only when the save has ≥ 10 completed levels and the cooldown has passed (fake `Date.now`); a stub rewarded ad that takes 10 s to finish is **not** cut off and grants the reward; a stub ad that is never ready is skipped after 4 s; `flushDataAsync` is **not** called on pause |
| Layout E2E | Playwright | At 320×568, 390×844 and 1280×800: no horizontal overflow; board fully visible; the FB safe zone is empty in fbig mode |

Test hooks are present only in `--mode e2e`: `window.__mewdoku = { state(), solution(), seedSave(json) }`. The `web` and `fbig` builds compile them out through `__E2E__`.

Playwright config essentials: `use: { browserName: 'chromium' }`, a `webServer` that serves `dist/e2e` via `vite preview`, and the environment variable `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.

## 12. Conventions

- File names in kebab-case. One module, one responsibility; aim for ≤ 300 lines per file.
- No default exports. Named exports only, to keep tree-shaking explicit.
- No `any`. Interop with the FB SDK goes through `fbinstant.d.ts`.
- Every tunable lives in `app/config.ts` (02 §3). Every string lives in `i18n/en.ts`.
- Commits reference the spec section they implement (e.g. `feat(game): reducer DOUBLE_TAP per 02 §6.2`).
- The clean-room rule applies to code review: no snippet may come from the original game, its web build bundle, or the contaminated repositories listed in 06 §4.
