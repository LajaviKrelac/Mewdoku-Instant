# Phase 2d contracts (cross-workstream interfaces)

Spec: [look-spec.md](look-spec.md) §4 (this file repeats it, copy-paste ready). Date 2026-10-10, base `ececec5`.
Owners: **G1** logic, app, platform · **G2** art, board, base tokens · **G3** HUD, screens, overlays, fx, i18n, audio · **lead** config, dev, size-check, docs.

Rules (as in 2b and 2c): S0 lands every interface **additively** before the build stage; a member another workstream uses is never deleted before integration step I-3; optional members marked "required at I-3" become required there. Config is lead-only and already done (`src/app/config.ts`, look-spec §0.6). `tsc` also checks the lead's `dev/**` harnesses, which call `computeLayout` and build `createTopBar`, `createPills`, `createRuleChips` and `createToolBar` directly: until I-1 / I-3 `GameLayout`, `TopBarProps`, `PillsProps`, `RuleChipsProps`, `ToolBarProps` and `ToolBarCallbacks` only gain **optional** members (look-spec §3.2 step 3). The four colour-name values and every test that names them change at L0 (lead), so no S0 turns another workstream's tests red.

---

## 1. Config (lead, done; read-only for G1–G3)

```ts
// src/app/config.ts
export type RewardedPlacementId = 'hint' | 'kitty' | 'revive' | 'group_double' | 'mouse';
export type BannerScreen = 'home' | 'victory' | 'event' | 'game'; // 'game' only while ads.banner.duringPlay
export type HelperPulseTarget = 'auto' | 'bulb' | 'kitty' | 'off';

cfg.layout.game  // { refWidth 402, minScale 0.6, maxScale 1.2, compactScale 0.85, topSpareMax 62,
                 //   bar 52, barToPills 10.3, pills 31.3, pillsToRules 8.3, rules 60.3, rulesGrowMax 2,
                 //   rulesToBoard 25.7, boardToTools 53, tools 60.3, toolsToBanner 23.4, bottom 12.3,
                 //   cardMargin 5.67, cardPad 5.17, cardRadius 11.6, gapFraction 0.079, tileRadiusFraction 0.11 }
cfg.layout.mark  // { armFraction 0.69, barFraction 0.182, cornerFraction 0.06, edgeFraction 0.035, edgeMix 0.85 }
cfg.fx.helperPulse // { target: 'auto', periodMs: 1500, peakScale: 1.08 }
cfg.fx.headFoundMs   // 300
cfg.fx.markPopMs     // 140
cfg.fx.mouseStaggerMs // 90
cfg.fx.startToast    // { enabled: true, delayMs: 150, inMs: 300, holdMs: 1200, exitPxPerSec: 100, reducedHoldMs: 1500 }
cfg.mouse            // { enabled: true, cells: 3 }
cfg.settingsDot      // { version: 1 }
cfg.ads.banner.duringPlay // true
cfg.ads.banner.bannerPx   // 50
cfg.ads.rewarded.placements // [..., 'mouse']
// @deprecated phase2d (unread once 2d is built): layout.gutter, colMax, topBar, pills, chips, tools, toolsGap,
// vGap, vGapCount, boardPad, boardRadius, compactHeight, compactPills, compactChips, cellRadiusFraction,
// insetPx, insetSmallPx, insetSmallBelowSlot, markScale, markStrokeFraction, markEdgeFraction, markEdgeMix;
// fx.markDrawMs (critic: the X pop replaces the draw-in).
```

## 2. G2 → G3: layout and board (S0)

```ts
// src/ui/board/layout.ts
export interface LayoutInput {
  readonly vw: number;
  readonly vh: number;
  readonly safeTop: number;
  readonly safeBottom: number;
  readonly n: number;
  readonly textScale?: number;
  /** Phase 2d: the banner band is reserved on this game screen (GameView.bannerBand). Default false. */
  readonly banner?: boolean;
}

export interface GameLayout {
  /** Phase 2d: the screen's scale s (look-spec §1.1). */
  readonly s: number;
  /** refWidth × s: the game column, centred in the viewport. */
  readonly colW: number;
  /** s < layout.game.compactScale: the rule cards show diagrams only. */
  readonly compact: boolean;
  /** y0: the top of the bar band in viewport px (safeTop + spare above). */
  readonly top: number;
  /** Row heights in px: bar and rules (both grown by the text scale: barH, rulesH of look-spec §1.1), pills, tools (the disc diameter). */
  readonly bar: number;
  readonly pills: number;
  readonly rules: number;
  readonly tools: number;
  /** Gaps in px; toolsToBanner is 0 without the band. */
  readonly gaps: {
    readonly barToPills: number;
    readonly pillsToRules: number;
    readonly rulesToBoard: number;
    readonly boardToTools: number;
    readonly toolsToBanner: number;
    readonly bottom: number;
  };
  /** The banner itself: ads.banner.bannerPx with the band, else 0. */
  readonly band: number;
  readonly boardMax: number;
  /** Card edge → first slot edge, whole px ≥ 3. */
  readonly pad: number;
  /** Whole px. */
  readonly slot: number;
  /** slot × n + 2 × pad. */
  readonly board: number;
  /** gapFor(slot). */
  readonly gap: number;
  /** Board card corner radius: layout.game.cardRadius × s. */
  readonly radius: number;
  /** 2b names kept until I-3, with 2d values from S0: topBar = bar, chips = rules (and `pills`, `tools` above). */
  readonly topBar: number;
  readonly chips: number;
}

export function computeLayout(input: LayoutInput, c?: GameConfig): GameLayout;
/** Gap between tiles for a slot: max(1, round(slot × layout.game.gapFraction)). */
export function gapFor(slotPx: number, c?: GameConfig): number;
/** Unchanged signature: every inset = gapFor(slotPx) / 2. */
export function evenInsets(n: number, slotPx: number, c?: GameConfig): CellInsets[];
```

```ts
// src/ui/board/board-types.ts (re-exported by board-view.ts)
export interface BoardInput {
  tap(cell: CellIndex): void;
  doubleTap(cell: CellIndex): void;
  paint(cells: CellIndex[], mode: PaintMode): void;
  bulb(): void;
  paw(): void;
  /** Phase 2d: the M key on a focused cell. Optional until I-3. */
  mouse?(): void;
}

export interface BoardView {
  /* … 2b members unchanged … */
  /** Phase 2d: frame = the card padding and corner radius from computeLayout (absent: 2b behaviour). */
  setSlot(slotPx: number, frame?: { readonly pad: number; readonly radius: number }): void;
  /** MARKED with source 'mouse' pops the X's fx.mouseStaggerMs apart; every new Mark pops (fx.markPopMs). */
  playEvent(ev: GameEvent): void;
}
```

CSS custom properties the board sets on `.board`: `--pad`, `--board-radius`, `--slot`, `--gap`, `--cell-r` (the tile radius as a fraction of the slot, from `tileRadiusFraction`), `--it --ir --ib --il` (= `gap / 2`).

Dev/e2e safe-area override (G2, CSS only): the probe and the tokens use `max(env(safe-area-inset-top, 0px), var(--dev-safe-top, 0px))` and the same for the bottom. Never set in production.

## 3. G2 → G3: art, palette, tokens (S0 with placeholders; final art in the build stage)

```ts
// src/ui/art/palette.ts
/** The 10 colours measured on the user's recording (palette indices); n ≤ 10 boards use only these. */
export const PALETTE_CORE: readonly number[]; // [0, 1, 2, 3, 5, 6, 7, 8, 10, 11]
/** Heads-pill order (around the colour wheel from green): Lime, Mint, Lagoon, Sky, Slate, Violet, Orchid, Pink, Coral, Apricot, Cocoa, Mustard. */
export const HEAD_ORDER: readonly number[];   // [3, 4, 5, 6, 10, 7, 8, 11, 0, 1, 9, 2]
export const PALETTE: readonly string[];      // ['#D57374','#FFAA6D','#E4BB49','#AED994','#52A982','#48B5B2','#6BBCE7','#9778D6','#EB85B7','#B0855A','#A7BFD7','#FAB4D0']
/** Signature unchanged; tiers: n ≤ 10 → PALETTE_CORE, 11 → + 9, 12 → all (look-spec §1.9). */
export function regionColorsFor(puzzle: Pick<Puzzle, 'id' | 'n' | 'regions'>, fixed: readonly number[] | null): Uint8Array;
/** mixHex(PALETTE[i], TOKENS['ink-deep'], layout.mark.edgeMix); used only with colour patterns on. */
export function xEdgeColor(paletteIndex: number, c?: GameConfig): string;
// TokenName gains: 'ink-deep' | 'ink-icon' | 'badge' | 'badge-video' | 'dot' | 'toast-fill' | 'toast-line'
//                  | 'rule-card' | 'rule-tile' | 'rule-tile-2' | 'rule-mark'

// src/ui/art/rule-art.ts (new)
import type { RuleChip } from '../hud/rule-chips';
/** The 3 × 3 mini diagram of a rule card as SVG markup (aria-hidden, our own layouts, look-spec §1.7). */
export function ruleDiagram(kind: RuleChip): string;

// src/ui/art/sprite.ts: IconSymbol gains
//   'icon-back' | 'icon-play' | 'tool-kitty' | 'tool-bulb' | 'tool-mouse' | 'cat-head-flat' | 'art-flex'
// redrawn in place (same ids): 'icon-gear', 'icon-fish', 'icon-fish-empty', 'mark-x'
// deleted: 'icon-rule-colours', 'icon-rule-lines', 'icon-rule-space', 'wrong-x'
```

Tokens (CSS custom properties in `src/styles/tokens.css`, values in look-spec §1.2): `--page #F7F2EF`, `--page-2 #F2EBE6`, `--ink #935A5A`, `--ink-2 #935A5A`, `--ink-3 #CDBAB6`, `--ink-deep #2F2A35`, `--ink-icon #996767` (the icons in the white round buttons; measured by the critic), `--ink-rgb 147, 90, 90`, `--line`, `--line-2`, `--page-rgb 247, 242, 239`, `--warm-rgb 239, 134, 39`, `--shadow-btn`, `--shadow-pill`, `--pulse-rgb 255, 165, 30`, `--badge #DC2F2F`, `--badge-video #03A84A`, `--dot #F34F4F`, `--toast-fill #FEF0C7`, `--toast-line #DD9045`, `--rule-card #FBF4EE`, `--rule-tile #DDBEAA`, `--rule-tile-2 #EEE1D7`, `--rule-mark #AF6D44`, `--fish #F1AA22`, `--fish-deep #D47E18`, `--fish-hi #FED95D`, `--wrong #6E0E25`, `--r0 … --r11` = `PALETTE`.

## 4. G1 → G3: view models (G3 declares them optional in S0, G1 fills them; required at I-3)

```ts
// src/ui/screens/game-screen.ts (G3 declares)
export type HelperKind = 'paw' | 'bulb' | 'mouse';
export type StartToastKind = 'level' | 'hard' | 'retry';

export interface GameView {
  /* … 2c.1 members unchanged … */
  /** Which helper pulses now (fx.helperPulse.target; 'auto' = kitty on an untouched board, then the bulb); null = none. */
  readonly pulse?: 'paw' | 'bulb' | null;
  /** The third helper: shown (cfg.mouse.enabled, not the tutorial, the mode allows the kitty) and enabled (tools ready and ≥ 1 candidate cell). */
  readonly mouse?: { readonly shown: boolean; readonly enabled: boolean };
  /** A rewarded video can refill a helper (capabilities().rewarded): the kitty and bulb show the video badge at 0, the mouse always. */
  readonly videoRefill?: boolean;
  /** The banner band is reserved on this game screen (bannerGate with screen 'game' says a banner may show). */
  readonly bannerBand?: boolean;
  /** The gear's red dot (save.ext.settingsSeen < cfg.settingsDot.version). */
  readonly settingsDot?: boolean;
}

export interface GameScreenCallbacks {
  /* … onTap, onDoubleTap, onPaint, onBulb, onPaw, onHome, onSettings … */
  /** Phase 2d: the mouse button or the M key. Optional until I-3. */
  onMouse?(): void;
}

export interface GameScreen {
  /* … 2c.1 members … */
  toolRect(tool: HelperKind): DOMRect | null;
  /** Phase 2d: the level-start toast (look-spec §1.14). Optional until I-3. */
  playStartToast?(kind: StartToastKind): void;
}

// src/ui/screens/home-screen.ts
export interface HomeView { /* … */ readonly settingsDot?: boolean }
// src/ui/screens/event-screen.ts
export interface EventScreenView { /* … */ readonly settingsDot?: boolean }
// src/ui/hud/top-bar.ts
export interface TopBarProps { /* … */ readonly settingsDot?: boolean }
// src/ui/overlays/rewarded-prompt.ts
export interface RewardedPromptProps { /* … */ readonly placement: 'hint' | 'kitty' | 'mouse' }
```

## 5. G1 → G2 / G3: game, platform

```ts
// src/game/types.ts
export type Action =
  /* … 2c.1 members … */
  | { type: 'MOUSE'; cells: CellIndex[]; t: number }; // cells from pickMouseCells; ignored unless playing

export type GameEvent =
  | { type: 'MARKED' | 'UNMARKED'; cells: CellIndex[]; source?: 'mouse' } // source only on the mouse's MARKED
  /* … other 2c.1 members unchanged … */;

// src/game/mouse.ts (new, pure)
/** Empty cells (no mark, no cat, not wrong) outside the solution; min(count, candidates) of them, seeded. */
export function pickMouseCells(state: GameState, count: number, seed: string): CellIndex[];
// seed = `${puzzle.id}:mouse:${usesThisAttempt}`, hashed with the engine's cyrb128

// src/platform/types.ts
export type RewardedPlacement = 'hint' | 'kitty' | 'revive' | 'group_double' | 'mouse';

// src/app/helper-flows.ts
export type HelperPlacement = Exclude<RewardedPlacement, 'group_double'>; // now includes 'mouse'
export interface HelperFlows { /* … */ onMouse(): Promise<void> }

// src/game/ad-pacing.ts
export interface BannerGateInput { readonly screen: BannerScreen | 'game' | 'ranking' | 'boot' | 'overlay'; /* … */ }
// 'game' qualifies only with ads.banner.duringPlay (then the same enabled / capability / min_levels / no_ads / tutorial checks)

// src/app/events.ts: AnalyticsParamsMap gains
//   mouse_used: { mode: ModeId; cells: number }   // ANALYTICS_PARAM_KEYS.mouse_used = ['mode', 'cells']
```

`SaveData.ext.settingsSeen`: a finite number ≥ 0 (absent = 0); invalid values dropped on read; the cloud merge keeps the larger value; the save stays v3.

## 6. G3 → G1: strings (English final in S0, `src/i18n/en/ui-2d.ts`)

New: `game.score`, `game.tool.mouse`, `game.tool.mouse.a11y` (`{count}`), `game.tool.video.a11y` (`{tool}`), `a11y.mouse.one` / `.other` (`{count}`), `rewarded.title.mouse`, `rewarded.video.mouse` (`{count}`), `rewarded.free.mouse`, `rewarded.countdown.mouse` (`{time}`), `toast.start.level`, `toast.start.hard`, `toast.start.retry`, `common.settings.new`, `mouse.unavailable` (G1's `cardsReady` toast for the mouse). `{count}` of the mouse keys = `formatNumber(cfg.mouse.cells)`. Changed values: `color.0`, `color.2`, `color.7`, `color.11` (at **L0**, lead, with the tests), `howto.helpers`, `settings.patterns.note` (G3, S0). Removed: `game.cats`. English text: look-spec Appendix A.

G1 calls: `tn('a11y.mouse', cells.length, { count: formatNumber(cells.length) })` as the mouse action's one utterance.

## 7. DOM contract (e2e)

| Element | Selector |
|---|---|
| Game bar | `header.top-bar.top-bar--game`; back `button.top-bar__btn--home.top-bar__btn--back`; gear `button.top-bar__btn--settings` (+ `.top-bar__dot` while shown); Level column `h1.top-bar__text[aria-label]` > `.top-bar__name`, `.top-bar__suffix`, `.badge--hard` |
| Score column | `.top-bar--game .points-pill` (`[data-final]`, `[hidden]`) > `.points-pill__label`, `.points-pill__n`, `.points-pill__chip` |
| Pills row | `.pills > .pill.pill--heads[role=img][aria-label] > svg.head[data-color][data-done]`; `.pills > .pill.pill--lives > .life[data-full]`; win flow `.pills > .period-pill[data-in-game]` > `.period-pill__n` |
| Rule cards | `ul.rule-chips[data-compact] > li.chip.chip--colours|lines|space[data-hl] > svg.chip__art, span.chip__text, span.sr-only` |
| Board | `.board[data-patterns]`, `.cell[data-s=e|m|c|w|g]`, `.cell__xg > rect.cell__xe` ×2 (visible only under `[data-patterns]`) + `rect.cell__x` ×2 |
| Tools | `.tool-bar > button.tool.tool--paw|bulb|mouse[data-pulse][data-empty][data-free][data-off]` (`data-off`: the mouse slot kept but invisible) > `.tool__disc > svg.tool__icon`, `.tool__badge.tool__badge--count|--video|--free` |
| Start toast | `.start-toast[data-kind=level|hard|retry]` |
| Banner | `.screen--game[data-banner]` (band reserved; its `padding-bottom` is reset to `var(--safe-bottom)`, the band is in `computeLayout`); mock `[data-testid=mock-banner]` (320 × 50, centred, `bottom: var(--play-band-bottom, 0px)`); FB stub `[data-testid=fb-stub-banner]` |
| Gone | `.pill--cats`, `.pill__count`, `.pills > .points-pill`, `.pills[data-tight]`, `.points-pill__icon` in the game bar |

## 8. CSS custom properties set by the game screen (G3)

On `.screen--game`: `--s`, `--col-w`, `--y-top`, `--bar`, `--pills`, `--rules`, `--chips` (= `--rules`), `--tools`, `--g-bp`, `--g-pr`, `--g-rb`, `--g-bt`, `--g-tb`, `--g-bottom`, `--band`, `--board`, `--safe-top`, `--safe-bottom`, `--pulse-ms`, `--pulse-scale`. On `<html>` while a game screen is mounted: `--play-band` (px: `toolsToBanner × s + bannerPx`; 0 without the band) and `--play-band-bottom` (px: `bottom × s` + safe bottom), read by O9, O1, O2, O4, the coach and the start toast (they keep their controls above the band) and by the mock banner (G1, inline style).

## 9. Landing order

| Interface | Producer | Lands | Consumer meanwhile |
|---|---|---|---|
| `GameLayout` fields, `gapFor`, `setSlot(frame)`, `BoardInput.mouse?` | G2 | S0 | the 2b names |
| Symbols (placeholders), `ruleDiagram` (placeholder grid), `PALETTE_CORE`, `HEAD_ORDER`, tokens | G2 | S0; final art in the build | placeholders behind the same ids |
| `GameView` fields, `onMouse?`, `playStartToast?`, `toolRect('mouse')`, `settingsDot?` props, `RewardedPromptProps.placement` | G3 declares | S0 | — |
| Filling the `GameView` fields, `onMouse`, the toast trigger | G1 | after G3's S0 | neutral values |
| `MOUSE`, `MARKED.source`, `pickMouseCells`, `RewardedPlacement` + `'mouse'` | G1 | S0 | — |
| English keys (Appendix A) | G3 | S0 (M1 copy freeze) | — |
| Required members, deletions | lead | I-3 | — |
