// Owner: B (Phase 2b); G2 (Phase 2c: the lives pill hooks of the win flow; Phase 2c.1: the level points)
// S2 Game (02 §5): composes ui-board pieces (top bar, pills, rule chips, board, tool bar), runs the
// 02 §19 layout on resize, and forwards input to the session through callbacks.
// Phase 2b (B): the win-flow hooks C drives (glow, showScrim; phase2b §2.2), the Home / Gear lock during the win flow (GameView.chromeLocked), and event mode
// (§4.4): the "{event} · {index}" title, data-event-theme on the root and the accessory over the cats.
// Phase 2c (G2, fish-lives-spec §2, §7.4): the lives are fish; the win flow lifts the kept fish off the
// lives pill (lifeSlots, departLife) and flies them to the period counter (showPeriodCounter,
// periodRect, periodLabel). The 2b fish-pill hooks were removed at integration step I-3.
// Phase 2c.1 (§10.2, §10.10): GameView.points goes to the pills' level-points counter (null hides it);
// playEvent already forwards every event, so a POINTS event rolls the counter.
// Row heights from computeLayout() are published as CSS variables on the root so the HUD rows,
// the board stage and the tool row follow the same numbers (compact mode below 640 px).
//
// Keyboard (02 §6.3, §18): H / K work anywhere on the screen while no modal is open (the board's own
// handler covers them when a cell has focus), and whenever focus falls to <body> (a level starts, a
// tool button is disabled, the coach's "Got it" goes away) it is moved back to the board.
//
// Classes: .screen.screen--game[data-mode][data-status][data-compact] > main.game__col
//          (.game__hud .game__stage .game__tools) + .game__scrim; vars --col-w --top-bar --pills
//          --chips --tools --board --vgap
import type { CellIndex } from '../../engine/types';
import type { EventDef } from '../../game/events';
import type { FxHandle } from '../fx/fish-flight';
import { playGlow } from '../fx/glow';
import type { GameEvent, ModeId, PaintMode, Status } from '../../game/types';
import { cfg } from '../../app/config';
import { formatShortDate, onLocaleChanged, t, translate } from '../../i18n';
import { createBoardView, type BoardHighlight, type BoardModel } from '../board/board-view';
import { computeLayout, readViewport, type GameLayout, type ViewportInfo } from '../board/layout';
import { createPills, type LifeSlotRect, type PillsProps } from '../hud/pills';
import { createRuleChips, type RuleChip, type RuleChipsProps } from '../hud/rule-chips';
import { createToolBar, type ToolBarProps } from '../hud/tool-bar';
import { createTopBar, type TopBarProps } from '../hud/top-bar';
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
}

/** Session commands (app/session.ts GameCommands) bound by the app. */
export interface GameScreenCallbacks {
  onTap(cell: CellIndex): void;
  onDoubleTap(cell: CellIndex): void;
  onPaint(cells: CellIndex[], mode: PaintMode): void;
  onBulb(): void;
  onPaw(): void;
  onHome(): void;
  onSettings(): void;
}

export interface GameScreen extends View<GameView> {
  /** Forwarded reducer events: board FX, the fish loss / revive pop (Phase 2c §1.3, §1.4) and the points roll (2c.1 §10.2). */
  playEvent(ev: GameEvent): void;
  /** Board entry animation after a (re)mount; returns BoardView.playEntry()'s entryEndMs (when START is due). */
  playEntry(): number;
  cellRect(cell: CellIndex): DOMRect | null;
  toolRect(tool: 'bulb' | 'paw'): DOMRect | null;
  /** Client rect of the board card (O1 hint card placement: HintCardProps.avoidRect). */
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

export function createGameScreen(view: GameView, cb: GameScreenCallbacks): GameScreen {
  let current = view;
  let layout: GameLayout = computeLayout({ vw: 390, vh: 844, safeTop: 0, safeBottom: 0, n: view.board.n });

  const topBarProps = (v: GameView): TopBarProps => ({
    title: gameTitle(v),
    hard: v.hard,
    showHome: v.showHome,
    showSettings: true,
    showTrophy: false,
    fbSafeZone: v.fbSafeZone,
  });
  const pillsProps = (v: GameView): PillsProps => ({
    catsPlaced: v.catsPlaced,
    n: v.board.n,
    hearts: v.hearts,
    maxHearts: v.maxHearts,
    compact: layout.compact,
    reducedMotion: v.reducedMotion,
    points: v.points,
  });
  const chipsProps = (v: GameView): RuleChipsProps => ({ compact: layout.compact, highlight: v.chipHighlight });
  const toolProps = (v: GameView): ToolBarProps => ({
    hints: v.hints,
    kitties: v.kitties,
    bulbEnabled: v.bulbEnabled,
    pawEnabled: v.pawEnabled,
    hintsFree: v.hintsFree,
  });

  const locked = (): boolean => current.chromeLocked === true;
  const topBar = createTopBar(topBarProps(view), {
    onHome: () => {
      if (!locked()) cb.onHome();
    },
    onSettings: () => {
      if (!locked()) cb.onSettings();
    },
    onTrophy: () => undefined,
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
    },
    { reducedMotion: () => current.reducedMotion },
  );
  const tools = createToolBar(toolProps(view), { onBulb: () => cb.onBulb(), onPaw: () => cb.onPaw() });

  const stage = h('div', { class: 'game__stage' }, board.el);
  /** The win flow's scrim (§2.2 t = 4 200), under the overlays. */
  const scrim = h('div', { class: 'game__scrim', 'aria-hidden': 'true', hidden: true });
  const el = h(
    'div',
    { class: 'screen screen--game' },
    topBar.el,
    // The play area is the page's main landmark (Home uses <main> too).
    h('main', { class: 'game__col' }, h('div', { class: 'game__hud' }, pills.el, chips.el), stage, h('div', { class: 'game__tools' }, tools.el)),
    scrim,
  );

  const doc = el.ownerDocument;
  const win = (): Window | null => doc.defaultView;

  /** Fine pointer (mouse): a short window scrolls over the 568 px minimum column (base.css) instead of shrinking it. */
  const finePointer = (w: Window): boolean => typeof w.matchMedia === 'function' && w.matchMedia('(pointer: fine)').matches;

  /**
   * The last viewport reading. Reading visualViewport / the safe-area probe forces a style and layout
   * update when the document is dirty (RP-3: 90-140 ms at 4× CPU on a 12×12 board mount), so it is
   * re-read only on a resize, not on every relayout (playEntry, a new board size).
   */
  let vp: ViewportInfo | null = null;
  const relayout = (remeasure = false): void => {
    const w = win();
    if (!w) return;
    if (remeasure || !vp) vp = sharedViewport(w, remeasure);
    const L = cfg.layout;
    const vh = finePointer(w) ? Math.max(vp.vh, L.minViewportH) : vp.vh;
    const next = computeLayout({ vw: vp.vw, vh, safeTop: vp.safeTop, safeBottom: vp.safeBottom, n: current.board.n, textScale: vp.remPx / 16 });
    const compactChanged = next.compact !== layout.compact;
    layout = next;
    const vars: Record<string, string> = {
      '--col-w': `${next.colW}px`,
      '--top-bar': `${next.topBar}px`,
      '--pills': `${next.pills}px`,
      '--chips': `${next.chips}px`,
      '--tools': `${next.tools}px`,
      '--board': `${next.board}px`,
      '--vgap': `${L.vGap}px`,
      '--safe-top': `${vp.safeTop}px`,
      '--safe-bottom': `${vp.safeBottom}px`,
    };
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
    el.dataset.compact = String(next.compact);
    board.setSlot(next.slot);
    if (compactChanged) {
      pills.update(pillsProps(current));
      chips.update(chipsProps(current));
    }
  };

  // ── keyboard: H / K at screen level, focus recovery (SPEC-01, A11Y-4, A11Y-8) ──
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
    if ((key !== 'h' && key !== 'k') || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!screenActive() || (t !== doc.body && !el.contains(t)) || board.el.contains(t)) return;
    e.preventDefault();
    if (e.repeat || current.inputLocked) return;
    if (key === 'h') {
      if (current.bulbEnabled) cb.onBulb();
    } else if (current.pawEnabled) cb.onPaw();
  };
  doc.addEventListener('keydown', onDocKey);
  doc.addEventListener('focusout', onFocusOut, true);

  /** Home and Gear while the win flow runs (§2.2): aria-disabled, presses ignored (see `locked`). */
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
    topBar.update(topBarProps(v));
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
  // (the chips and tools relabel themselves); the board and its state are untouched.
  const offLocale = onLocaleChanged(() => {
    topBar.update(topBarProps(current));
    pills.update(pillsProps(current));
  });

  return {
    el,
    update(v) {
      const prev = current;
      current = v;
      if (v.board.n !== prev.board.n) relayout();
      render(v, prev);
    },
    playEvent(ev) {
      board.playEvent(ev);
      pills.playEvent(ev);
    },
    playEntry() {
      // Re-apply the layout now that the screen is in the document (the viewport reading is cached
      // since creation; a resize re-reads it).
      relayout();
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
    destroy() {
      offLocale();
      w0?.removeEventListener('resize', onResize);
      w0?.visualViewport?.removeEventListener('resize', onResize);
      doc.removeEventListener('keydown', onDocKey);
      doc.removeEventListener('focusout', onFocusOut, true);
      if (focusRaf) win()?.cancelAnimationFrame(focusRaf);
      focusRaf = 0;
      topBar.destroy();
      pills.destroy();
      chips.destroy();
      tools.destroy();
      board.destroy();
      el.remove();
    },
  };
}
