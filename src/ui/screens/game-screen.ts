// Owner: ui-shell
// S2 Game (02 §5): composes ui-board pieces (top bar, pills, rule chips, board, tool bar), runs the
// 02 §19 layout on resize, and forwards input to the session through callbacks.
// Row heights from computeLayout() are published as CSS variables on the root so the HUD rows,
// the board stage and the tool row follow the same numbers (compact mode below 640 px).
//
// Keyboard (02 §6.3, §18): H / K work anywhere on the screen while no modal is open (the board's own
// handler covers them when a cell has focus), and whenever focus falls to <body> (a level starts, a
// tool button is disabled, the coach's "Got it" goes away) it is moved back to the board.
//
// Classes: .screen.screen--game[data-mode][data-status][data-compact] > main.game__col
//          (.game__hud .game__stage .game__tools); vars --col-w --top-bar --pills --chips --tools
//          --board --vgap
import type { CellIndex } from '../../engine/types';
import type { GameEvent, ModeId, PaintMode, Status } from '../../game/types';
import { cfg } from '../../app/config';
import { formatShortDate, t } from '../../i18n';
import { createBoardView, type BoardHighlight, type BoardModel } from '../board/board-view';
import { computeLayout, readViewport, type GameLayout, type ViewportInfo } from '../board/layout';
import { createPills, type PillsProps } from '../hud/pills';
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
  readonly hearts: number;
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
  /** Forwarded reducer events: board FX and heart crack. */
  playEvent(ev: GameEvent): void;
  /** Board entry animation after a (re)mount. */
  playEntry(): void;
  cellRect(cell: CellIndex): DOMRect | null;
  toolRect(tool: 'bulb' | 'paw'): DOMRect | null;
  /** Client rect of the board card (O1 hint card placement: HintCardProps.avoidRect). */
  boardRect(): DOMRect | null;
  focusBoard(): void;
}

/** The top-bar title for a game view ("Level 37", "Daily · Tue 6 Oct"). */
export function gameTitle(v: Pick<GameView, 'mode' | 'level' | 'dateKey'>): string {
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
  });
  const chipsProps = (v: GameView): RuleChipsProps => ({ compact: layout.compact, highlight: v.chipHighlight });
  const toolProps = (v: GameView): ToolBarProps => ({
    hints: v.hints,
    kitties: v.kitties,
    bulbEnabled: v.bulbEnabled,
    pawEnabled: v.pawEnabled,
    hintsFree: v.hintsFree,
  });

  const topBar = createTopBar(topBarProps(view), { onHome: () => cb.onHome(), onSettings: () => cb.onSettings(), onTrophy: () => undefined });
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
  const el = h(
    'div',
    { class: 'screen screen--game' },
    topBar.el,
    // The play area is the page's main landmark (Home uses <main> too).
    h('main', { class: 'game__col' }, h('div', { class: 'game__hud' }, pills.el, chips.el), stage, h('div', { class: 'game__tools' }, tools.el)),
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
    if (remeasure || !vp) vp = readViewport(w);
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

  const render = (v: GameView, prev: GameView | null): void => {
    el.dataset.mode = v.mode;
    el.dataset.status = v.status;
    topBar.update(topBarProps(v));
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
      board.playEntry();
      // A (re)started level (mount, Retry, revive): keyboard focus belongs on the board.
      recoverFocusSoon();
    },
    cellRect: (cell) => board.cellRect(cell),
    toolRect: (tool) => tools.toolRect(tool),
    boardRect: () => (board.el.isConnected ? board.el.getBoundingClientRect() : null),
    focusBoard: () => focusBoard(),
    destroy() {
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
