// Owner: B (Phase 2b); G2 (Phase 2c: the lives pill hooks of the win flow; Phase 2c.1: the level points); G3 (Phase 2d: the measured stack)
// S2 Game (02 §5): composes the HUD (game bar, pills, rule cards, tool row) and the board, runs the
// layout on resize, and forwards input to the session through callbacks.
// Phase 2b (B): the win-flow hooks C drives (glow, showScrim; phase2b §2.2), the back / gear lock during the win flow (GameView.chromeLocked), and event mode
// (§4.4): the "{event} · {index}" title, data-event-theme on the root and the accessory over the cats.
// Phase 2c (G2, fish-lives-spec §2, §7.4): the lives are fish; the win flow lifts the kept fish off the
// lives pill (lifeSlots, departLife) and flies them to the period counter (showPeriodCounter,
// periodRect, periodLabel).
// Phase 2d (G3, look-spec §1.1–§1.16): the screen is the original's top-down stack, scaled by one
// factor s (computeLayout): the game bar (back · Level / Score · gear with the settings dot), the
// pills row (heads, fish), the rule cards, the board card, the helper row (kitty · bulb · mouse with
// the idle pulse) and, on FBIG with a banner, the band. Every row height and gap is a CSS variable on
// the root (§4.7); the level points are the bar's Score column; --play-band / --play-band-bottom on
// <html> keep the overlays above the banner while the screen is mounted (§1.16). (2d's start toast and
// its column fx layer were retired at 2d.1 I-3: the tickers replace them.)
//
// Phase 2d.1 (G3, helpers-spec §2, §4, §5, D-2d1-3/4/6/12): the screen's fixed fx layer (.game-fx, above
// the board and the HUD rows, below every overlay) holds what the lazy fx chunk plays (fx/celebrate.ts,
// prefetched at idle after the first mount together with the board's lazy motion chunk, board-mouse.ts:
// [data-celebrate=ready] once both are in; integration I-4): the two level-start
// tickers (playTickers; asked before the chunk is in, they join their crossing late), and per event the
// shards (CAT_PLACED), the "+N", the star and the bar's count-up (POINTS; until the chunk is in: 2d's
// roll) and one "Done!" label per anchor tile (UNITS_DONE). A mouse action's units (the board's waves
// and the labels) wait for their anchor's X to land (mouseLandMs). A props render that resets the board
// (a new board, Retry, fewer points, a language change) ends every running celebration and shows the
// total at once. The tool row is busy (inert, no disabled fade) while input is locked or the kitty or
// the hint runs.
//
// Keyboard (02 §6.3, §18): H / K / M work anywhere on the screen while no modal is open (the board's own
// handler covers them when a cell has focus), and whenever focus falls to <body> (a level starts, a
// tool button is disabled, the coach's "Got it" goes away) it is moved back to the board.
//
// Classes: .screen.screen--game[data-mode][data-status][data-compact][data-banner] > header.top-bar--game
//          + main.game__col (.game__hud .game__stage .game__tools) + .game__scrim + .game-fx[data-celebrate]; vars of §4.7
import type { CellIndex } from '../../engine/types';
import type { EventDef } from '../../game/events';
import type { FxHandle } from '../fx/fish-flight';
import { playGlow } from '../fx/glow';
import type { TickerLine, Tickers } from '../fx/tickers';
import type { Celebrate } from '../fx/celebrate';
import { mouseLandMs } from '../../game/mouse';
import type { DoneUnit, GameEvent, ModeId, PaintMode, Status } from '../../game/types';
import { cfg } from '../../app/config';
import { formatShortDate, onLocaleChanged, t, translate } from '../../i18n';
import { createBoardView, loadMouseRun, type BoardHighlight, type BoardModel } from '../board/board-view';
import { computeLayout, readViewport, type GameLayout, type ViewportInfo } from '../board/layout';
import { createGameBar, type GameBarProps } from '../hud/game-bar';
import { createPills, type LifeSlotRect, type PillsProps } from '../hud/pills';
import { createRuleChips, type RuleChip, type RuleChipsProps } from '../hud/rule-chips';
import { createToolBar, type ToolBarProps } from '../hud/tool-bar';
import { h, type View } from '../dom';

export interface GameView {
  readonly mode: ModeId;
  /** Level number (tutorial: 1); null for a daily. */
  readonly level: number | null;
  /** Daily date YYYY-MM-DD; null otherwise. */
  readonly dateKey: string | null;
  readonly hard: boolean;
  /** false during the first-run tutorial (02 §4.2). */
  readonly showHome: boolean;
  /** Lives left: hearts = lives = fish (Phase 2c §0.5; the stored name stays). */
  readonly hearts: number;
  /** Lives at the start of an attempt (3). */
  readonly maxHearts: number;
  readonly catsPlaced: number;
  readonly status: Status;
  readonly hints: number;
  readonly kitties: number;
  readonly hintsFree: boolean;
  readonly bulbEnabled: boolean;
  readonly pawEnabled: boolean;
  readonly inputLocked: boolean;
  readonly board: BoardModel;
  /** Open hint (O1) or tutorial coach focus (O8). */
  readonly highlight: BoardHighlight | null;
  readonly chipHighlight: RuleChip | null;
  readonly fbSafeZone: boolean;
  readonly reducedMotion: boolean;
  /**
   * Event mode (phase2b §4.4): title "{event} · {index + 1}" (event.title.game), root
   * data-event-theme={def.id}, the accessory over the board cats. null in every other mode.
   */
  readonly event: { readonly def: EventDef; readonly index: number } | null;
  /**
   * phase2b §2.2: the win flow runs and the ranking panel has not opened yet: the top bar's Home and
   * Gear are aria-disabled and ignore presses. Optional (absent = false).
   */
  readonly chromeLocked?: boolean;
  /**
   * Phase 2c.1 §10.2: level points of this attempt (GameState.levelPoints), forwarded to
   * PillsProps.points; null or absent hides the counter (the tutorial, a mode outside
   * levelPoints.modes). Required since 2c.1 I-3.
   */
  readonly points: number | null;
  /** Phase 2d §1.11: which helper pulses now (fx.helperPulse.target); null = none. */
  readonly pulse: 'paw' | 'bulb' | null;
  /** Phase 2d §1.12: the third helper, shown (cfg.mouse.enabled, not the tutorial, the mode allows the kitty) and enabled. */
  readonly mouse: { readonly shown: boolean; readonly enabled: boolean };
  /** Phase 2d §1.11: a rewarded video can refill a helper (the video badge at 0, always on the mouse). */
  readonly videoRefill: boolean;
  /** Phase 2d §1.16: the banner band is reserved on this game screen. */
  readonly bannerBand: boolean;
  /** Phase 2d §1.15: the gear's red dot. */
  readonly settingsDot: boolean;
}

/** Phase 2d: the three helpers of the tool row (kitty, bulb, mouse). */
export type HelperKind = 'paw' | 'bulb' | 'mouse';
/** Session commands (app/session.ts GameCommands) bound by the app. */
export interface GameScreenCallbacks {
  onTap(cell: CellIndex): void;
  onDoubleTap(cell: CellIndex): void;
  onPaint(cells: CellIndex[], mode: PaintMode): void;
  onBulb(): void;
  onPaw(): void;
  onHome(): void;
  onSettings(): void;
  /** Phase 2d §1.12: the mouse button or the M key. */
  onMouse(): void;
}

export interface GameScreen extends View<GameView> {
  /** Forwarded reducer events: board FX, the fish loss / revive pop (Phase 2c §1.3, §1.4) and the points roll (2c.1 §10.2). */
  playEvent(ev: GameEvent): void;
  /** Board entry animation after a (re)mount; returns BoardView.playEntry()'s entryEndMs (when START is due). */
  playEntry(): number;
  cellRect(cell: CellIndex): DOMRect | null;
  toolRect(tool: HelperKind): DOMRect | null;
  /** Client rect of the board card (O1: HintCardProps.boardRect anchors the card and Apply to it). */
  boardRect(): DOMRect | null;
  focusBoard(): void;
  /** Phase 2c §2.3: full life slots in departure order (highest slot first), with their icon's client rect; [] while hidden. */
  lifeSlots(): readonly LifeSlotRect[];
  /** Phase 2c §2.2: the life in `slot` leaves for the win flight: it shows empty at once, no loss animation. Idempotent. */
  departLife(slot: number): void;
  /** Phase 2c §2.2 t = 1 000: shows the period counter (fade in at the first call); a higher total later rolls + bumps. */
  showPeriodCounter(total: number): void;
  /** Phase 2c §2.3: client rect of the counter's icon (flight target), null while hidden. */
  periodRect(): DOMRect | null;
  /** Phase 2c §2.2: the rising "+N" chip at the counter. */
  periodLabel(text: string): void;
  /** Win flow (§2.2 t = 300): ui/fx/glow.ts playGlow on these cat cells of this board, with the screen's reduced-motion flag. */
  glow(cells: readonly CellIndex[]): FxHandle;
  /**
   * Win flow (§2.2 t = 4 200): the dark --scrim fades in over the screen (fx.win.scrimFadeMs; 150 ms
   * with reduced motion) so the ranking panel opens on it at 4 500. It hides itself while a modal
   * overlay is open (the overlay brings its own scrim). Optional (phase2b B addition).
   */
  showScrim?(): void;
  /**
   * Phase 2d.1 §5: the two level-start tickers (the session calls it from playBoardEntry on a fresh
   * board or a Retry; replaced 2d's playStartToast at I-3).
   */
  playTickers(lines: readonly [TickerLine, TickerLine]): void;
}

/** The top-bar title for a game view ("Level 37", "Daily · Tue 6 Oct", "Lantern Walk · 13"). */
export function gameTitle(v: Pick<GameView, 'mode' | 'level' | 'dateKey'> & { readonly event?: GameView['event'] }): string {
  if (v.event) return t('event.title.game', { event: translate(v.event.def.nameKey), index: v.event.index + 1 });
  if (v.mode === 'daily') return t('game.title.daily', { date: formatShortDate(v.dateKey ?? '') });
  return t('game.title.level', { level: v.level ?? 1 });
}

/** Structural equality, so a fresh-but-equal highlight object does not restart the board's pulse. */
export function sameHighlight(a: BoardHighlight | null, b: BoardHighlight | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'hint' && b.kind === 'hint') return a.step === b.step;
  if (a.kind === 'coach' && b.kind === 'coach') return a.cells.length === b.cells.length && a.cells.every((c, i) => c === b.cells[i]);
  return false;
}

/**
 * The last viewport reading, shared by every game screen of a window (review PERF-1). A new game
 * screen is built while the document is dirty (the previous screen is leaving), and reading
 * innerWidth / visualViewport / the probe there forced a full style and layout pass on every mount
 * (about 29 ms at 4× CPU). The values only change with a resize (window or visual viewport), which
 * clears this cache before any screen's own resize handler re-reads it.
 */
const viewportCache = new WeakMap<Window, ViewportInfo>();
const viewportWatched = new WeakSet<Window>();
function sharedViewport(w: Window, fresh: boolean): ViewportInfo {
  if (!viewportWatched.has(w)) {
    viewportWatched.add(w);
    const drop = (): void => void viewportCache.delete(w);
    // Capture: at the window target these run before the screens' own (bubble) resize listeners.
    w.addEventListener('resize', drop, { capture: true });
    w.visualViewport?.addEventListener('resize', drop, { capture: true });
  }
  let v = fresh ? undefined : viewportCache.get(w);
  if (!v) {
    v = readViewport(w);
    viewportCache.set(w, v);
  }
  return v;
}

type CelebrateModule = typeof import('../fx/celebrate');
let celebrateMod: CelebrateModule | null = null;
let celebrateLoad: Promise<CelebrateModule | null> | null = null;

/**
 * Phase 2d.1 (helpers-spec §7.3 bundle note): the lazy fx chunk (points flight, cat burst, completion
 * labels), loaded once per page; a failed load is retried on the next call. Never rejects.
 */
export function loadCelebrate(): Promise<CelebrateModule | null> {
  celebrateLoad ??= import('../fx/celebrate').then(
    (m) => (celebrateMod = m),
    () => {
      celebrateLoad = null;
      return null;
    },
  );
  return celebrateLoad;
}

/**
 * The game bar's discs in s-units (look-spec §1.4): the back disc's left edge (31.5 − 18.4) and the
 * gear's (370 − 18.4) at refWidth 402. On FBIG the physically-left one keeps the top-left safe zone
 * clear: it moves right until its edge is fbSafeZonePx + 4 from the viewport's left edge (§1.1).
 */
const BACK_LEFT = 13.1;
const GEAR_LEFT = 351.6;
const DISC = 36.8;
/** The helper row's badges reach this far above the discs (s-units, §1.11). */
const BADGE_REACH = 9;

/**
 * The game screen that last published the band on <html>: a new screen is built (and publishes)
 * before the old one is destroyed, so only the owner clears it.
 */
const bandOwner = new WeakMap<Document, object>();

/** How far (px) the physically-left disc moves right for the FB safe zone; 0 off FBIG. */
export function fbShift(o: { readonly vw: number; readonly colW: number; readonly s: number; readonly rtl: boolean; readonly fb: boolean }): number {
  if (!o.fb) return 0;
  const colLeft = (o.vw - o.colW) / 2;
  const discLeft = colLeft + (o.rtl ? cfg.layout.game.refWidth - GEAR_LEFT - DISC : BACK_LEFT) * o.s;
  return Math.max(0, Math.round((cfg.layout.fbSafeZonePx + 4 - discLeft) * 10) / 10);
}

export function createGameScreen(view: GameView, cb: GameScreenCallbacks): GameScreen {
  let current = view;
  let layout: GameLayout = computeLayout({ vw: 402, vh: 874, safeTop: 0, safeBottom: 0, n: view.board.n, banner: view.bannerBand });

  const barProps = (v: GameView): GameBarProps => ({
    title: gameTitle(v),
    hard: v.hard,
    showBack: v.showHome,
    fbSafeZone: v.fbSafeZone,
    settingsDot: v.settingsDot,
    points: v.points,
    final: v.catsPlaced >= v.board.n && v.board.n > 0,
    reducedMotion: v.reducedMotion,
    starPoints: starMode(v),
  });
  const pillsProps = (v: GameView): PillsProps => ({
    catsPlaced: v.catsPlaced,
    n: v.board.n,
    hearts: v.hearts,
    maxHearts: v.maxHearts,
    reducedMotion: v.reducedMotion,
    colors: v.board.colors,
    regionsDone: v.board.regionsDone,
    boardId: String(v.board.puzzleId),
    // §6.5: the heads ring starts at a per-board offset; the tutorial starts at its first colour.
    ringId: v.mode === 'tutorial' ? null : String(v.board.puzzleId),
  });
  const chipsProps = (v: GameView): RuleChipsProps => ({ compact: layout.compact, highlight: v.chipHighlight });
  const toolProps = (v: GameView): ToolBarProps => ({
    hints: v.hints,
    kitties: v.kitties,
    bulbEnabled: v.bulbEnabled,
    pawEnabled: v.pawEnabled,
    hintsFree: v.hintsFree,
    mouse: v.mouse,
    videoRefill: v.videoRefill,
    pulse: v.pulse,
    busy: v.inputLocked || v.status === 'kitty' || v.status === 'hint',
  });

  /** The lazy fx chunk's player for this screen (null until it has loaded). */
  let celebrate: Celebrate | null = null;
  /** §2.5: stars fly to the Score (the chunk is in and motion is on). */
  const starMode = (v: GameView): boolean => celebrate !== null && !v.reducedMotion;

  const locked = (): boolean => current.chromeLocked === true;
  const mouseReady = (): boolean => current.mouse.shown && current.mouse.enabled;
  const onMouse = (): void => {
    if (mouseReady()) cb.onMouse();
  };
  const topBar = createGameBar(barProps(view), {
    onBack: () => {
      if (!locked()) cb.onHome();
    },
    onSettings: () => {
      if (!locked()) cb.onSettings();
    },
  });
  const pills = createPills(pillsProps(view));
  const chips = createRuleChips(chipsProps(view));
  const board = createBoardView(
    view.board,
    {
      tap: (c) => cb.onTap(c),
      doubleTap: (c) => cb.onDoubleTap(c),
      paint: (cells, mode) => cb.onPaint(cells, mode),
      bulb: () => cb.onBulb(),
      paw: () => cb.onPaw(),
      mouse: onMouse,
    },
    { reducedMotion: () => current.reducedMotion },
  );
  const tools = createToolBar(toolProps(view), { onBulb: () => cb.onBulb(), onPaw: () => cb.onPaw(), onMouse });

  const stage = h('div', { class: 'game__stage' }, board.el);
  /** The win flow's scrim (§2.2 t = 4 200), under the overlays. */
  const scrim = h('div', { class: 'game__scrim', 'aria-hidden': 'true', hidden: true });
  /** Phase 2d.1: the fixed fx layer over the viewport (tickers, "+N", star, shards, labels). */
  const gameFx = h('div', { class: 'game-fx', 'aria-hidden': 'true' });
  const el = h(
    'div',
    { class: 'screen screen--game' },
    topBar.el,
    // The play area is the page's main landmark (Home uses <main> too).
    h('main', { class: 'game__col' }, h('div', { class: 'game__hud' }, pills.el, chips.el), stage, h('div', { class: 'game__tools' }, tools.el)),
    scrim,
    gameFx,
  );
  let tickers: Tickers | null = null;
  /** Tickers asked for before the chunk loaded: the lines and when (performance.now). */
  let tickersDue: { lines: readonly [TickerLine, TickerLine]; at: number } | null = null;
  const nowMs = (): number => win()?.performance.now() ?? Date.now();

  let destroyed = false;
  const bindCelebrate = (m: CelebrateModule | null): void => {
    if (!m || destroyed || celebrate) return;
    celebrate = m.createCelebrate(gameFx, {
      cellRect: (c) => board.cellRect(c),
      color: (c) => {
        const label = current.board.regions[c] ?? 0;
        return `var(--r${current.board.colors[label] ?? label})`;
      },
      pitch: () => layout.slot,
      s: () => layout.s,
      reduced: () => current.reducedMotion,
      scoreRect: () => topBar.scoreRect(),
      countTo: (total) => topBar.countTo(total),
    });
    tickers = m.createTickers({ host: gameFx, reduced: () => current.reducedMotion });
    // I-4: ready once the board's lazy motion (the cat sequence, the mouse, the wave) is in too (or failed).
    void loadMouseRun()
      .catch(() => undefined)
      .then(() => {
        if (!destroyed) gameFx.dataset.celebrate = 'ready';
      });
    topBar.update(barProps(current));
    const due = tickersDue;
    tickersDue = null;
    if (due) tickers.play(due.lines, nowMs() - due.at);
  };

  // ── Phase 2d.1: the celebrations (§2.4, §2.5, §4.1, §4.3) ──
  /** Deferred waves and labels of a mouse action (§4.1). */
  const deferred = new Set<ReturnType<typeof setTimeout>>();
  /** The MARKED { source: 'mouse' } cells of the action being played (cleared after the action). */
  let mouseCells: readonly CellIndex[] | null = null;
  /** A higher total came with the props; its POINTS (same action) clears this before the check runs. */
  let awaitingPoints = false;
  const cancelFx = (): void => {
    celebrate?.cancel();
    for (const id of deferred) clearTimeout(id);
    deferred.clear();
  };
  /** UNITS_DONE: the board's waves and our labels; a mouse action's wait for their anchor's X (§4.1). */
  const playUnits = (ev: Extract<GameEvent, { type: 'UNITS_DONE' }>): void => {
    const cells = mouseCells;
    const groups = new Map<number, DoneUnit[]>();
    for (const u of ev.units) {
      const k = cells && !current.reducedMotion ? cells.indexOf(u.anchor) : -1;
      const at = k < 0 ? 0 : mouseLandMs(k);
      groups.set(at, [...(groups.get(at) ?? []), u]);
    }
    for (const [at, units] of groups) {
      const run = (): void => {
        const e: GameEvent = { type: 'UNITS_DONE', units };
        board.playEvent(e);
        celebrate?.play(e);
      };
      if (at <= 0) {
        run();
        continue;
      }
      const id = setTimeout(() => {
        deferred.delete(id);
        run();
      }, at);
      deferred.add(id);
    }
  };

  const doc = el.ownerDocument;
  const root = doc.documentElement;
  const win = (): Window | null => doc.defaultView;

  /** Fine pointer (mouse): a short window scrolls over the 568 px minimum column (base.css) instead of shrinking it. */
  const finePointer = (w: Window): boolean => typeof w.matchMedia === 'function' && w.matchMedia('(pointer: fine)').matches;

  /**
   * The last viewport reading. Reading visualViewport / the safe-area probe forces a style and layout
   * update when the document is dirty (RP-3: 90-140 ms at 4× CPU on a 12×12 board mount), so it is
   * re-read only on a resize, not on every relayout (playEntry, a new board size).
   */
  let vp: ViewportInfo | null = null;
  /** The band on <html> (§1.16): published while this screen is mounted, removed on destroy. */
  const owner = {};
  const publishBand = (band: number, bandBottom: number, toastBottom: number): void => {
    bandOwner.set(doc, owner);
    root.style.setProperty('--play-band', `${band}px`);
    root.style.setProperty('--play-band-bottom', `${bandBottom}px`);
    root.style.setProperty('--toast-bottom', `${toastBottom}px`);
    // '1' with a band, '0' without: the overlays keep above the band; the O9 toast uses --toast-bottom.
    root.setAttribute('data-play-band', band > 0 ? '1' : '0');
  };
  const relayout = (remeasure = false): void => {
    const w = win();
    if (!w) return;
    if (remeasure || !vp) vp = sharedViewport(w, remeasure);
    const vh = finePointer(w) ? Math.max(vp.vh, cfg.layout.minViewportH) : vp.vh;
    const next = computeLayout({
      vw: vp.vw,
      vh,
      safeTop: vp.safeTop,
      safeBottom: vp.safeBottom,
      n: current.board.n,
      textScale: vp.remPx / 16,
      banner: current.bannerBand,
    });
    const compactChanged = next.compact !== layout.compact;
    layout = next;
    const g = next.gaps;
    const px = (v: number): string => `${Math.round(v * 100) / 100}px`;
    const rtl = w.getComputedStyle(root).direction === 'rtl';
    const P = cfg.fx.helperPulse;
    const vars: Record<string, string> = {
      '--s': String(Math.round(next.s * 10000) / 10000),
      '--col-w': px(next.colW),
      '--y-top': px(next.top),
      '--bar': px(next.bar),
      '--pills': px(next.pills),
      '--rules': px(next.rules),
      '--chips': px(next.rules),
      '--tools': px(next.tools),
      '--g-bp': px(g.barToPills),
      '--g-pr': px(g.pillsToRules),
      '--g-rb': px(g.rulesToBoard),
      '--g-bt': px(g.boardToTools),
      '--g-tb': px(g.toolsToBanner),
      '--g-bottom': px(g.bottom),
      '--band': px(next.band),
      '--board': px(next.board),
      '--safe-top': px(vp.safeTop),
      '--safe-bottom': px(vp.safeBottom),
      '--pulse-ms': `${P.periodMs}ms`,
      '--pulse-scale': String(P.peakScale),
    };
    // The FB safe zone (§1.1): the disc at the physical left moves right; that is the bar's inline
    // start in LTR (the back disc, --fb-s) and its inline end in RTL (the gear, --fb-e).
    const fb = px(fbShift({ vw: vp.vw, colW: next.colW, s: next.s, rtl, fb: current.fbSafeZone }));
    vars[rtl ? '--fb-e' : '--fb-s'] = fb;
    vars[rtl ? '--fb-s' : '--fb-e'] = '0px';
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
    el.dataset.compact = String(next.compact);
    el.toggleAttribute('data-banner', next.band > 0);
    const toolsTop = next.top + next.bar + g.barToPills + next.pills + g.pillsToRules + next.rules + g.rulesToBoard + next.board + g.boardToTools;
    publishBand(
      next.band > 0 ? g.toolsToBanner + next.band : 0,
      g.bottom + vp.safeBottom,
      Math.max(vp.safeBottom + 12, vh - toolsTop + BADGE_REACH * next.s + 4),
    );
    board.setSlot(next.slot, { pad: next.pad, radius: next.radius });
    if (compactChanged) chips.update(chipsProps(current));
    topBar.fit();
  };

  // ── keyboard: H / K / M at screen level, focus recovery (SPEC-01, A11Y-4, A11Y-8) ──
  const focusBoard = (preventScroll = false): void => {
    const roving = board.el.querySelector<HTMLElement>('[tabindex="0"]');
    if (roving) roving.focus({ preventScroll });
    else board.focusCell(0);
  };
  /** In the document and not behind a modal (the router makes the screen inert while one is open). */
  const screenActive = (): boolean => el.isConnected && !el.closest('[inert]');
  let focusRaf = 0;
  /**
   * Two frames later (after any focus restore, which the focus trap may run on the next frame), focus
   * the board if focus is still lost (on <body> or a removed element). No scroll: the player did not ask.
   */
  const recoverFocusSoon = (): void => {
    const w = win();
    if (!w?.requestAnimationFrame) return;
    w.cancelAnimationFrame(focusRaf);
    focusRaf = w.requestAnimationFrame(() => {
      focusRaf = w.requestAnimationFrame(() => {
        focusRaf = 0;
        const a = doc.activeElement;
        if (screenActive() && (!a || a === doc.body || !a.isConnected)) focusBoard(true);
      });
    });
  };
  const onFocusOut = (e: FocusEvent): void => {
    if (!e.relatedTarget) recoverFocusSoon();
  };
  const onDocKey = (e: KeyboardEvent): void => {
    const t = e.target as Node;
    const key = e.key.toLowerCase();
    // Not when a cell has focus (the board's own handler did it and called preventDefault), not for
    // keys typed inside an overlay (the coach's Got it, a dialog), not behind a modal.
    if ((key !== 'h' && key !== 'k' && key !== 'm') || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!screenActive() || (t !== doc.body && !el.contains(t)) || board.el.contains(t)) return;
    e.preventDefault();
    if (e.repeat || current.inputLocked) return;
    if (key === 'h') {
      if (current.bulbEnabled) cb.onBulb();
    } else if (key === 'k') {
      if (current.pawEnabled) cb.onPaw();
    } else onMouse();
  };
  doc.addEventListener('keydown', onDocKey);
  doc.addEventListener('focusout', onFocusOut, true);

  /** Back and gear while the win flow runs (§2.2): aria-disabled, presses ignored (see `locked`). */
  const renderChromeLock = (on: boolean): void => {
    for (const sel of ['.top-bar__btn--home', '.top-bar__btn--settings']) {
      const b = topBar.el.querySelector<HTMLElement>(sel);
      if (!b) continue;
      if (on) b.setAttribute('aria-disabled', 'true');
      else b.removeAttribute('aria-disabled');
    }
  };

  const render = (v: GameView, prev: GameView | null): void => {
    el.dataset.mode = v.mode;
    el.dataset.status = v.status;
    if (v.event) el.dataset.eventTheme = v.event.def.id;
    else delete el.dataset.eventTheme;
    if (!prev || prev.event?.def.theme.accessory !== v.event?.def.theme.accessory) board.setAccessory(v.event?.def.theme.accessory ?? null);
    topBar.update(barProps(v));
    if (!prev || (prev.chromeLocked === true) !== (v.chromeLocked === true)) renderChromeLock(v.chromeLocked === true);
    pills.update(pillsProps(v));
    chips.update(chipsProps(v));
    tools.update(toolProps(v));
    board.update(v.board);
    if (!prev || !sameHighlight(prev.highlight, v.highlight)) board.setHighlight(v.highlight);
    if (!prev || prev.inputLocked !== v.inputLocked) board.setLocked(v.inputLocked);
  };

  const onResize = (): void => relayout(true);
  const w0 = win() ?? (typeof window === 'undefined' ? null : window);
  w0?.addEventListener('resize', onResize);
  w0?.visualViewport?.addEventListener('resize', onResize);

  relayout();
  render(view, null);
  // The router appends the screen right after creating it; focus left on <body> (the previous screen
  // was removed) goes to the board so keyboard play works without a click (02 §6.3, §18).
  recoverFocusSoon();
  // Settings → Language during a level (review A11Y-I18N-1): the title and the pills follow at once
  // (the cards and tools relabel themselves); the board and its state are untouched. The direction
  // may have changed too (RTL), so the layout re-runs (the FB shift and the bar's fit).
  const offLocale = onLocaleChanged(() => {
    // §2.5: a language change ends the celebrations (their words were the old language's).
    cancelFx();
    topBar.update(barProps(current));
    pills.update(pillsProps(current));
    relayout();
  });

  // Prefetch the fx chunk at idle after the first mount (§7.3), and with it the board's lazy motion chunk
  // (I-4: the cat sequence, the mouse, the wave); a screen built after they loaded binds at once.
  if (celebrateMod) bindCelebrate(celebrateMod);
  else {
    const w = win() as (Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }) | null;
    const go = (): void => {
      void loadMouseRun().catch(() => undefined);
      void loadCelebrate().then(bindCelebrate);
    };
    if (w?.requestIdleCallback) w.requestIdleCallback(go, { timeout: 2000 });
    else setTimeout(go, 200);
  }

  return {
    el,
    update(v) {
      const prev = current;
      current = v;
      if (v.board.n !== prev.board.n || v.bannerBand !== prev.bannerBand || v.fbSafeZone !== prev.fbSafeZone) relayout();
      // A reset (a new board, Retry, fewer points, the motion setting): every celebration ends and the
      // Score shows the total at once (§2.5 queue).
      const reset =
        v.board.puzzleId !== prev.board.puzzleId ||
        v.points === null ||
        prev.points === null ||
        v.points < prev.points ||
        v.reducedMotion !== prev.reducedMotion;
      if (reset) cancelFx();
      else if (v.points !== prev.points && starMode(v) && !awaitingPoints) {
        // The POINTS of this action follows in the same task; if none does, show the total.
        awaitingPoints = true;
        queueMicrotask(() => {
          if (!awaitingPoints) return;
          awaitingPoints = false;
          topBar.syncPoints();
        });
      }
      render(v, prev);
      if (reset) topBar.syncPoints();
    },
    playEvent(ev) {
      if (ev.type === 'MARKED' && ev.source === 'mouse') {
        // §4.1: this action's UNITS_DONE waits for its anchor's X; the action's events arrive together.
        mouseCells = ev.cells;
        queueMicrotask(() => {
          mouseCells = null;
        });
      }
      if (ev.type === 'UNITS_DONE') playUnits(ev);
      else board.playEvent(ev);
      pills.playEvent(ev);
      if (ev.type === 'POINTS') {
        awaitingPoints = false;
        // The "+N" and the star (or, until the chunk is in, 2d's roll in the bar).
        if (celebrate && current.points !== null) celebrate.play(ev);
        else topBar.playEvent(ev);
      } else if (ev.type === 'CAT_PLACED') celebrate?.play(ev);
    },
    playEntry() {
      // Re-apply the layout now that the screen is in the document (the viewport reading is cached
      // since creation; a resize re-reads it).
      relayout();
      // A (re)started board (mount, Retry, revive): nothing of the last attempt keeps playing.
      cancelFx();
      topBar.syncPoints();
      const startInMs = board.playEntry();
      // A (re)started level (mount, Retry, revive): keyboard focus belongs on the board.
      recoverFocusSoon();
      return startInMs;
    },
    cellRect: (cell) => board.cellRect(cell),
    toolRect: (tool) => tools.toolRect(tool),
    boardRect: () => (board.el.isConnected ? board.el.getBoundingClientRect() : null),
    focusBoard: () => focusBoard(),
    lifeSlots: () => pills.lifeSlots(),
    departLife: (slot) => pills.departLife(slot),
    showPeriodCounter: (total) => pills.showPeriodCounter(total),
    periodRect: () => pills.periodRect(),
    periodLabel: (text) => pills.periodLabel(text),
    glow: (cells) => playGlow(board.el, cells, current.reducedMotion),
    showScrim() {
      if (!scrim.hidden) return;
      const ms = current.reducedMotion ? cfg.fx.reducedMotionFadeMs : cfg.fx.win.scrimFadeMs;
      scrim.style.setProperty('--scrim-ms', `${ms}ms`);
      scrim.hidden = false;
      if (typeof scrim.animate === 'function') {
        try {
          scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'ease-out' });
        } catch {
          // the scrim simply shows
        }
      }
    },
    playTickers(lines) {
      if (tickers) {
        tickers.play(lines);
        return;
      }
      // The chunk is not in yet: the pair plays when it is, where its crossing would be by then.
      tickersDue = { lines, at: nowMs() };
      void loadCelebrate().then(bindCelebrate);
    },
    destroy() {
      destroyed = true;
      offLocale();
      cancelFx();
      tickers?.destroy();
      tickersDue = null;
      w0?.removeEventListener('resize', onResize);
      w0?.visualViewport?.removeEventListener('resize', onResize);
      doc.removeEventListener('keydown', onDocKey);
      doc.removeEventListener('focusout', onFocusOut, true);
      if (focusRaf) win()?.cancelAnimationFrame(focusRaf);
      focusRaf = 0;
      if (bandOwner.get(doc) === owner) {
        bandOwner.delete(doc);
        for (const k of ['--play-band', '--play-band-bottom', '--toast-bottom']) root.style.removeProperty(k);
        root.removeAttribute('data-play-band');
      }
      topBar.destroy();
      pills.destroy();
      chips.destroy();
      tools.destroy();
      board.destroy();
      el.remove();
    },
  };
}
