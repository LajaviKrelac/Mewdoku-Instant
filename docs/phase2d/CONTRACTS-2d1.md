# Phase 2d.1 contracts (cross-workstream interfaces)

Spec: [helpers-spec.md](helpers-spec.md) §7 (this file repeats it, copy-paste ready). Date 2026-10-10. Built **on top of the 2d build** ([CONTRACTS.md](CONTRACTS.md) stays in force; this file only adds or changes).
Owners: **G1** logic, app, platform, workers · **G2** art, board, tokens · **G3** HUD, overlays, fx, i18n, audio · **lead** config, the colour-name change, dev, size-check, docs.

Rules (as in 2b–2d): S0 lands every interface **additively**; a member another workstream uses is never deleted before integration step I-3; members marked "optional until I-3" become required there. Config is lead-only (L0). `tsc` covers `dev/**`, so props and callbacks the harnesses use only gain optional members until I-1 / I-3. Clean room: no test fixture, harness or capture uses the original's level layouts; tests build their own boards.

---

## 1. Config (lead, L0; read-only for G1–G3)

```ts
// src/app/config.ts — additions and changed values (helpers-spec §0.6)
cfg.fx.helperPulse   // { target: 'auto', periodMs: 1500, peakScale: 1.08, idleMs: 5000, needsStock: true, untilHelperUsed: true }  ('auto' = §4.6)
cfg.fx.headFoundMs   // 280 (was 300)
cfg.fx.markPopMs     // 170 (was 140): the mouse's X only, 1.15 → 1
cfg.fx.markDraw      // { squishMs: 80, stroke1Ms: 70, stroke2Ms: 130, overshoot: 1.1, settleMs: 250 }  (new group; the 2b fx.markDrawMs stays @deprecated, unread)
cfg.fx.mouse         // { appearMs: 115, dwellMs: 850, exitMs: 85 }
cfg.fx.catPlaced     // { celebrateUntilMs: 816, settleMs: 1400, shards: 10, shardLifeMs: 650 }
cfg.fx.points        // { starAtMs: 783, flightMs: 530, countMs: 350, burstMs: 650 }
cfg.fx.unitDone      // { waveStepMs: 33, labelMs: 720 }
cfg.fx.hint          // { dimMs: 300, ghostFirstMs: 333, ghostStaggerMs: 60, ghostPopMs: 500 }
cfg.fx.tickers       // { enabled: true, delayMs: 150, crossMs: 9000, lead: 0.086, reducedHoldMs: 3000 }
cfg.layout.hint      // { cardW: 334.4, cardMinH: 70.3, cardGap: 5.9, applyW: 278.7, applyH: 59.3, applyGap: 31 }  (× s)
cfg.kitty.revealMs   // 820 (was 600)
cfg.ads.banner.hideDuringHint // true
// @deprecated phase2d.1 (unread once 2d.1 is built): fx.mouseStaggerMs, fx.startToast;
// fx.levelPoints.rollMs / plusMs / plusRisePx are no longer read by the Score column
// (reducedPlusInMs / reducedPlusOutMs stay in use for the reduced-motion "+N").
```

Type shapes:

```ts
readonly helperPulse: {
  readonly target: HelperPulseTarget;
  readonly periodMs: number;
  readonly peakScale: number;
  /** Phase 2d.1 §4.6: no board change for this long before the suggested helper pulses. */
  readonly idleMs: number;
  /** Phase 2d.1 §4.6: a helper at 0 (the video badge) never pulses, and the other one does not take its place. */
  readonly needsStock: boolean;
  /** Phase 2d.1 §4.6 (critic): no pulse once a hint, the kitty or the mouse was used in this attempt. */
  readonly untilHelperUsed: boolean;
};
/** §4.4: "\" scales about the centre over stroke1Ms, then "/" grows from its top-right tip over stroke2Ms; the X group overshoots to `overshoot` and is back to 1 at settleMs (from the action). */
readonly markDraw: { readonly squishMs: number; readonly stroke1Ms: number; readonly stroke2Ms: number; readonly overshoot: number; readonly settleMs: number };
readonly mouse: { readonly appearMs: number; readonly dwellMs: number; readonly exitMs: number }; // under fx
readonly catPlaced: { readonly celebrateUntilMs: number; readonly settleMs: number; readonly shards: number; readonly shardLifeMs: number };
readonly points: { readonly starAtMs: number; readonly flightMs: number; readonly countMs: number; readonly burstMs: number };
readonly unitDone: { readonly waveStepMs: number; readonly labelMs: number };
readonly hint: { readonly dimMs: number; readonly ghostFirstMs: number; readonly ghostStaggerMs: number; readonly ghostPopMs: number };
readonly tickers: { readonly enabled: boolean; readonly delayMs: number; readonly crossMs: number; readonly lead: number; readonly reducedHoldMs: number };
// layout
readonly hint: { readonly cardW: number; readonly cardMinH: number; readonly cardGap: number; readonly applyW: number; readonly applyH: number; readonly applyGap: number };
// ads.banner
readonly hideDuringHint: boolean;
```

Lead L0 also changes `color.4` "Mint" → **"Denim"** in `src/i18n/en.ts` together with every test that names "Mint" (whoever owns it), so no S0 turns another workstream's tests red; G3 redrafts the 16 locales in the build.

## 2. G1 → G2 / G3: game events and the mouse's timing (S0)

```ts
// src/game/types.ts
/** Phase 2d.1 §4.1: a row, column or colour region that became complete in this action. */
export interface DoneUnit {
  readonly kind: 'row' | 'col' | 'region';
  /** Row or column, 0-based, or the region label. */
  readonly index: number;
  /** The unit's last tile in reading order among the tiles this action changed: the label's anchor and the wave's reference. */
  readonly anchor: CellIndex;
}

export type GameEvent =
  /* … 2d members unchanged (MARKED with source?: 'mouse', CAT_PLACED, POINTS, REGION_DONE, …) … */
  /**
   * Phase 2d.1 §4.1: after MARKED / CAT_PLACED / POINTS / REGION_DONE and before WON. A unit is complete
   * when it holds its cat (Cat or Given) and every other tile is Mark or Wrong; listed once per unit
   * that was not complete before the action: rows (ascending), then columns, then regions. Never on an unmark,
   * never in an action that ends in LOST (a mistake that completes a unit otherwise emits it). In HINT_APPLY,
   * HINT_APPLIED stays the first event (2b order) and UNITS_DONE follows the marks and the cat.
   */
  | { type: 'UNITS_DONE'; units: readonly DoneUnit[] };
```

```ts
// src/game/units.ts (new, pure)
export function isUnitComplete(state: Pick<GameState, 'puzzle' | 'cells'>, kind: DoneUnit['kind'], index: number): boolean;
/** The units complete in `next` and not in `prev`, each with its anchor among `changed`. */
export function completedUnits(
  prev: Pick<GameState, 'puzzle' | 'cells'>,
  next: Pick<GameState, 'puzzle' | 'cells'>,
  changed: readonly CellIndex[],
): DoneUnit[];
```

```ts
// src/game/mouse.ts (2d file; changed and added)
/** 2d.1: min(count, candidates) cells in PICK order (the seeded partial shuffle), which is the visit order. */
export function pickMouseCells(state: Pick<GameState, 'puzzle' | 'cells'>, count: number, seed: string): CellIndex[];
/** fx.mouse.dwellMs + fx.mouse.exitMs (935): one visit. */
export function mouseVisitMs(c?: GameConfig): number;
/** When the k-th (0-based) X appears, from the MARKED { source: 'mouse' } event: k × mouseVisitMs + dwellMs. */
export function mouseLandMs(k: number, c?: GameConfig): number;
/** The whole run: count × mouseVisitMs + fx.markPopMs; reduced motion: fx.reducedMotionFadeMs. */
export function mouseRunMs(count: number, reduced: boolean, c?: GameConfig): number;
```

Board (G2) plays the visits in **event order** of `MARKED.cells` (the reducer keeps the action's order) and clears every `.fx-pend` once `mouseRunMs` has passed whatever the animation state; the game screen (G3) defers the `UNITS_DONE` effects of a mouse action to `mouseLandMs(indexOf(anchor))`; the session (G1) keeps the board locked for `mouseRunMs` and schedules the `mouse` / `mark` sounds at `k × mouseVisitMs` and `mouseLandMs(k)`, and that action's `unit_done` at the anchor's landing. G1-internal: `HelperHost` gains `reducedMotion(): boolean` (for `mouseRunMs`), and the view context gains the per-attempt mouse-use count and the last board-change / visibility time (the pulse, §4.6).

## 3. G1 internal: the kitty's target (workers)

```ts
// src/workers/hint-chunk.ts (new, pure; the lazy hint chunk's entry and the worker's import)
export { getHintStep } from '../engine/hint';
/**
 * Phase 2d.1 §2.3: the cat-less region with the FEWEST candidate tiles after every known cat's shadow
 * (knowledge as engine/hint.knowledgeFromBoard); ties: the region whose solution cell comes first in
 * reading order. Returns that solution cell. Throws when every region has a cat.
 */
export function pickKittyCell(puzzle: Puzzle, cells: Readonly<Uint8Array>): CellIndex;

// src/workers/engine-client.ts
export type HintEngine = Pick<typeof import('./hint-chunk'), 'getHintStep' | 'pickKittyCell'>;
// the lazy import and engine.worker.ts load './hint-chunk' instead of '../engine/hint'
```

## 4. G1 → G3: view model and session calls

```ts
// GameView.pulse (2d field): same type; G1's rule changes (helpers-spec §4.6)
readonly pulse: 'paw' | 'bulb' | null;
```

```ts
// src/ui/fx/tickers.ts (new, G3 declares; G1 imports the types)
import type { PeriodKind } from '../../app/config';
export type TickerKey =
  | 'toast.start.level' | 'toast.start.hard' | 'toast.start.retry'
  | 'ticker.best' | 'ticker.cats'
  | 'ticker.solved' | `period.pill.${PeriodKind}` | 'ticker.points'
  | 'ticker.daily' | 'ticker.unique' | 'ticker.tip.cat' | 'ticker.tip.drag';
export interface TickerLine {
  readonly key: TickerKey;
  /** Plural keys (ticker.cats, ticker.solved, ticker.points, period.pill.*): rendered with tn(key, count, { count: formatNumber(count) }). */
  readonly count?: number;
  /** ticker.best (level mode only): the stored best time in ms (LevelBest[0]), rendered with formatClock ("4:12"). */
  readonly ms?: number;
}
```

```ts
// src/app/tickers.ts (new, G1, pure)
import type { TickerLine } from '../ui/fx/tickers';
export interface TickerInput {
  readonly save: SaveData;
  readonly mode: ModeId;
  readonly level: number | null;
  readonly n: number;
  readonly hard: boolean;
  readonly retry: boolean;
  readonly dailyOpen: boolean;   // the daily is unlocked and not solved today
  readonly todayKey: string;
  /** puzzleId + ':' + attempt: picks among the eligible lines. */
  readonly seed: string;
}
/** helpers-spec §5.4: line 1 (this board), line 2 (the player); every number comes from the input. */
export function pickTickerLines(input: TickerInput, c?: GameConfig): readonly [TickerLine, TickerLine];
```

```ts
// src/ui/screens/game-screen.ts (G3 declares; G1 calls from playBoardEntry on a fresh board or a Retry)
export interface GameScreen {
  /* … 2d members … */
  /** Phase 2d.1 §5: the two level-start tickers. Optional until I-3; replaces playStartToast (removed at I-3). */
  playTickers?(lines: readonly [TickerLine, TickerLine]): void;
}
```

```ts
// src/ui/overlays/hint-card.ts (G3; the session passes the new members)
export interface HintCardProps extends HintTextContext {
  readonly step: HintStep;
  onApply(): void;
  onClose(): void;
  readonly closable?: boolean;
  /** Phase 2d.1: the cell states when the hint opened (which effect cells are Empty). Optional until I-3. */
  readonly cells?: Readonly<Uint8Array>;
  /** Phase 2d.1: GameScreen.boardRect (the card and Apply are anchored to the board card). Optional until I-3. */
  boardRect?(): DOMRect | null;
  /** Phase 2d.1: GameScreen.cellRect (the dim's tile holes). Optional until I-3. */
  cellRect?(cell: CellIndex): DOMRect | null;
  /** @deprecated phase2d.1: the sheet placement is gone; removed at I-3. */
  avoidRect?(): DOMRect | null;
}

// src/ui/overlays/hint-text.ts (G3, pure)
/** focusCells ∪ Empty effectCells ∪ placeCell; mistaken_mark: the mark to clear. */
export function hintCutouts(step: HintStep, cells: Readonly<Uint8Array>): CellIndex[];
```

The banner flow (G1) hides the banner when the hint overlay opens (`ads.banner.hideDuringHint`); after close it re-loads at once when `minReloadSec` has passed since the last load, else one timer re-loads it when the window ends (if the game screen is still up, no modal is open and the board is not won). O1 is the only modal whose close re-shows the banner on the game screen.

## 5. G2 → G1 / G3: palette, art, board helpers (S0 with placeholders; final art in the build)

```ts
// src/ui/art/palette.ts
export const PALETTE: readonly string[];      // index 4 = '#5B75B2' (Denim, measured; was Mint '#52A982')
/** Phase 2d.1: the 11 measured colours; boards with n ≤ 11 draw only from these, n = 12 adds 9 (Cocoa). */
export const PALETTE_CORE: readonly number[]; // [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11]
/** Phase 2d.1: the measured hue ring (Lime, Lagoon, Sky, Slate, Denim, Violet, Orchid, Pink, Coral, Apricot, Cocoa, Mustard). */
export const HEAD_ORDER: readonly number[];   // [3, 5, 6, 10, 4, 7, 8, 11, 0, 1, 9, 2]
/** The board's colours in HEAD_ORDER, rotated to start at hash(puzzleId) mod count; null id (tutorial): no rotation. */
export function headOrderFor(colors: ArrayLike<number>, puzzleId: string | null): number[];
/** White on the tile ≥ 4.0:1 (relative luminance ≤ 0.2125): today only index 4. */
export function isDarkTile(paletteIndex: number): boolean;
// TokenName gains: 'plus' | 'done-top' | 'done-bottom' | 'done-line' | 'hint-card' | 'apply'
// Changed values: 'wrong' '#560A1C', 'toast-fill' '#FFF1C8', 'toast-line' '#E98E33'

// src/ui/art/sprite.ts: IconSymbol / SymbolId gain
//   'board-mouse' (and its part ids) | 'fx-star4' | 'fx-shard' | 'art-paw-cap' | 'art-bolt' | 'art-star'
// the cat moods gain 'wink'; 'art-flex' is deleted at I-3
```

```ts
// src/ui/board/board-fx.ts (pure helpers)
/** Ghost slots (helpers-spec §3.3): Empty effect cells only; shadow: the focus cat's row L→R, its column T→B, then reading order; other kinds: reading order. */
export function ghostOrder(step: HintStep, cells: Readonly<Uint8Array>, n: number): CellIndex[];
/** Wave steps (helpers-spec §4.2): lines from the end nearer the anchor; regions by king distance from the anchor. waveOrder(u)[k] = the cells starting at k × waveStepMs. */
export function waveOrder(unit: DoneUnit, n: number, regions: ArrayLike<number>): readonly (readonly CellIndex[])[];
/** The union outline of the two X bars, grown by the ghost margin, in the cell's 100-unit box (path data). */
export function xOutlinePath(c?: GameConfig): string;
```

`BoardView` keeps its 2d signature; `playEvent` now handles `MARKED` (draw-in, or the mouse run for `source: 'mouse'`), `CAT_PLACED` (the cat sequence), `UNITS_DONE` (the waves); `setHighlight({ kind: 'hint' })` sets the ghost delays. The game screen calls `board.playEvent(UNITS_DONE)` itself after any mouse deferral.

## 6. G3 internal (listed so G1 / the lead know the names)

```ts
// src/ui/hud/game-bar.ts
export interface GameBarView extends View<GameBarProps> {
  playEvent(ev: GameEvent): void;             // 2d.1: POINTS no longer rolls, bumps or raises a chip here
  fit(): void;
  /** Phase 2d.1: the Score number's client rect (the star's target). */
  scoreRect(): DOMRect | null;
  /** Phase 2d.1 §2.5: count up from the number on screen to `total` over fx.points.countMs (quadratic ease-out, every frame, no bump). */
  countTo(total: number): void;
}
// src/ui/fx/points-flight.ts, cat-burst.ts, done-label.ts (one lazy fx chunk, prefetched at idle), tickers.ts
// src/audio/sfx.ts: SfxId gains 'mouse' | 'points' | 'unit_done' AT S0 (placeholder tones), because G1's session plays
// all three: sounds are played by the app layer, never by ui/ (points at the star's landing, starAtMs + 17 + flightMs
// after POINTS; unit_done skipped when the action has REGION_DONE).
```

## 7. Strings (G3, English final in S0, `src/i18n/en/ui-2d1.ts`)

New: `fx.done` ("Done!", ≤ 8 characters), `a11y.unitDone` ("{unit} complete."), `ticker.best` ({time}), `ticker.cats.one|other`, `ticker.solved.one|other`, `ticker.points.one|other`, `ticker.daily`, `ticker.unique`, `ticker.tip.cat`, `ticker.tip.drag`. Reused: `toast.start.*`, `period.pill.*`, `fish.plus`, `hint.*`, `a11y.mouse`. Changed at L0: `color.4` "Denim". English text: helpers-spec Appendix A. G1 builds `a11y.unitDone` lines with `unitName()` from `ui/overlays/hint-text.ts` (already used by the session's announcements) and joins them with `joinList`.

## 8. Which event plays what

| Event (order within an action; `HINT_APPLY` emits `HINT_APPLIED` first, see the last row) | Board (G2) | Game screen / fx (G3) | Session (G1) |
|---|---|---|---|
| `MARKED` (tap, paint, Apply) | draw-in + squish on every new cell at once | — | `mark` sound, announcement (2d) |
| `MARKED { source: 'mouse' }` | the visits in cell order; X pops at `mouseLandMs(k)` | defers this action's `UNITS_DONE` to the anchor's landing | lock for `mouseRunMs`; `mouse` / `mark` sounds per visit; `a11y.mouse` |
| `CAT_PLACED` (any source) | cat pop / celebrate / wink / settle, tile flash, halo | shards, light, twinkles at `cellRect` | sounds and announcement (2d) |
| `POINTS` | — | "+N" over the tile → star (from the "+N" centre + (−4, +9.5) s) → `gameBar.countTo(total)` + burst | announcement (2c.1); `points` sound at the landing (1 330 ms; at once with reduced motion) |
| `REGION_DONE` | veil on the region's tiles except the cat's | the head becomes the face + dot | sound, announcement (2d) |
| `UNITS_DONE` | waves | one label per anchor | `unit_done` sound (not with `REGION_DONE` in the same action; at the anchor's landing for a mouse action), `a11y.unitDone` (a region whose `REGION_DONE` is in the same action left out) |
| `HINT_APPLIED` (first in `HINT_APPLY`'s events, before `MARKED`) | — (the overlay already closed) | — | `hint_apply` sound (2b) |

## 9. DOM contract (e2e)

| Element | Selector |
|---|---|
| X bars | `.cell__xg > g.cell__xb.cell__xb--a|--b > rect.cell__xe (patterns on) + rect.cell__x`; draw-in `.cell.fx-mark` |
| Ghost X | `.cell[data-ghost=x][data-s=e]` (inline `--gd`) with `path.cell__xo` |
| Mouse | `.board > .board__mouse[data-cell][data-face=blink|glance|grin]`; pending X `.cell.fx-pend` |
| Cat sequence, wave, dark tile | `.cell.fx-cat`, `.cell__flash`; `.cell.fx-wave` (inline `--wd`); `.cell[data-dark]` |
| Fx layer | `.game-fx > .fx-plus`, `.fx-star`, `.fx-burst`, `.fx-shard`, `.fx-done-label[data-anchor]`; `.game-fx[data-celebrate=ready]` once the lazy fx chunk has loaded |
| Busy | `.tool-bar[data-busy]` (inputLocked, status `kitty` or `hint`: tools inert without the 0.45 disabled fade); `.board[aria-busy=true]` during the mouse run |
| Score | `.top-bar--game .points-pill__n[data-counting]` |
| Heads | `.pills > .pill.pill--heads > .head[data-color][data-done] > svg.head__shape` / `svg.head__face` + `span.head__dot` |
| Hint overlay | `.overlay[data-overlay=hint][data-instant] > svg.hint-dim`, `.hint-card > .hint-card__text`, `button.hint-apply`, `button.hint-close` (visually hidden until focused) |
| Tickers | `.tickers > .ticker[data-line=1|2][data-key] > svg.ticker__paw + span.ticker__text + svg.ticker__icon` |
| Gone at I-3 | `.start-toast`, `.hint-card__icon`, `.overlay[data-overlay=hint][data-placement]`, `.points-pill__chip` in the game bar, `svg.head` as a direct child of the heads pill |

CSS custom properties: tokens `--plus`, `--done-top`, `--done-bottom`, `--done-line`, `--hint-card`, `--apply` (G2, `tokens.css`); per cell `--gd` (ghost delay), `--wd` (wave delay), `--xg` if G2 needs an opaque ghost fill; on `.screen--game` the 2d set is unchanged.

## 10. Landing order

| Interface | Producer | Lands | Consumer meanwhile |
|---|---|---|---|
| Config, `color.4` | lead | L0 | — |
| `DoneUnit`, `UNITS_DONE` (emitted), `mouseVisitMs` / `mouseLandMs` / `mouseRunMs`, pick order | G1 | S0 | — |
| `hint-chunk.ts` kitty picker | G1 | build | the 2b picker |
| `ghostOrder`, `waveOrder`, `xOutlinePath`, `headOrderFor`, `isDarkTile`, tokens (final values), symbols (placeholders) | G2 | S0; final art in the build | placeholders behind the same ids |
| `TickerLine`, `playTickers?`, `HintCardProps` new members, `hintCutouts`, English keys, `SfxId` additions (placeholder tones) | G3 | S0 (copy freeze) | — |
| `pickTickerLines`, the session's calls, the pulse rule, the banner hide | G1 | after G3's S0 | 2d behaviour |
| Required members, deletions | lead | I-3 | — |

---

## Critic changes (independent critic, 2026-10-10; details in helpers-spec "Critic changes")

1. §1: `fx.markDraw` reshaped to `{ squishMs, stroke1Ms, stroke2Ms, overshoot, settleMs }` (the re-measured draw-in: "\" from the centre, "/" from its top-right tip, a 1.1 overshoot, 250 ms); `fx.helperPulse.untilHelperUsed` added.
2. §2: the `UNITS_DONE` doc comment covers `LOST` (never) and the `HINT_APPLY` order; the mouse paragraph adds the `.fx-pend` finaliser, the deferred `unit_done`, `HelperHost.reducedMotion()` and the view-context additions (G1-internal).
3. §4: `TickerLine.ms` is rendered with `formatClock`, level mode only; the banner re-show timer after the hint.
4. §6, §10: `SfxId` additions land at G3's S0; sounds are played by G1 (`points` at the star's landing, `unit_done` skipped with `REGION_DONE`).
5. §8: `HINT_APPLIED` is the first event of `HINT_APPLY` (the reducer's order), not the last; the `POINTS` and `UNITS_DONE` rows gain the sound rules and the star's start point.
6. §9: `.game-fx[data-celebrate=ready]`, `.tool-bar[data-busy]`, `.board[aria-busy]`.
