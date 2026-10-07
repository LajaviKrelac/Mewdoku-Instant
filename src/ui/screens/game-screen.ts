// Owner: ui-shell
// S2 Game (02 §5): composes ui-board pieces (top bar, pills, rule chips, board, tool bar), runs the
// 02 §19 layout on resize, and forwards input to the session through callbacks.
// Row heights from computeLayout() are published as CSS variables on the root so the HUD rows,
// the board stage and the tool row follow the same numbers (compact mode below 640 px).
//
// Classes: .screen.screen--game[data-mode][data-status][data-compact] > .game__col
//          (.game__hud .game__stage .game__tools); vars --col-w --top-bar --pills --chips --tools
//          --board --vgap
import type { CellIndex } from '../../engine/types';
import type { GameEvent, ModeId, PaintMode, Status } from '../../game/types';
import { cfg } from '../../app/config';
import { formatShortDate, t } from '../../i18n';
import { createBoardView, type BoardHighlight, type BoardModel } from '../board/board-view';
import { computeLayout, readViewport, type GameLayout } from '../board/layout';
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
    h('div', { class: 'game__col' }, h('div', { class: 'game__hud' }, pills.el, chips.el), stage, h('div', { class: 'game__tools' }, tools.el)),
  );

  const win = (): Window | null => el.ownerDocument.defaultView;

  const relayout = (): void => {
    const w = win();
    if (!w) return;
    const vp = readViewport(w);
    const next = computeLayout({ vw: vp.vw, vh: vp.vh, safeTop: vp.safeTop, safeBottom: vp.safeBottom, n: current.board.n });
    const compactChanged = next.compact !== layout.compact;
    layout = next;
    const L = cfg.layout;
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

  const onResize = (): void => relayout();
  const w0 = win() ?? (typeof window === 'undefined' ? null : window);
  w0?.addEventListener('resize', onResize);
  w0?.visualViewport?.addEventListener('resize', onResize);

  relayout();
  render(view, null);

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
      // The screen may have been created detached; measure again now that it is in the document.
      relayout();
      board.playEntry();
    },
    cellRect: (cell) => board.cellRect(cell),
    toolRect: (tool) => tools.toolRect(tool),
    boardRect: () => (board.el.isConnected ? board.el.getBoundingClientRect() : null),
    focusBoard() {
      const roving = board.el.querySelector<HTMLElement>('[tabindex="0"]');
      if (roving) roving.focus();
      else board.focusCell(0);
    },
    destroy() {
      w0?.removeEventListener('resize', onResize);
      w0?.visualViewport?.removeEventListener('resize', onResize);
      topBar.destroy();
      pills.destroy();
      chips.destroy();
      tools.destroy();
      board.destroy();
      el.remove();
    },
  };
}
