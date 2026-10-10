// Owner: B (Phase 2b; was ui-board); G2 (Phase 2d: the card frame, gap / 2 insets, the X pop, the mouse's
// staggered X's, the M key). Board view: build once, diff-only updates, region fade, highlights, moods, keyboard (04 §5.3).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import type { HintStep } from '../../../src/engine/types';
import { CellState } from '../../../src/game/types';
import { mountSprite } from '../../../src/ui/art/sprite';
import { createBoardView, type BoardInput, type BoardModel, type BoardView } from '../../../src/ui/board/board-view';

// 4×4: regions A B C C / A A C C / A D D C / D D D D (the tutorial board), colours Mint Violet Mustard Coral.
const REGIONS = Uint8Array.from([0, 1, 2, 2, 0, 0, 2, 2, 0, 3, 3, 2, 3, 3, 3, 3]);
const COLORS = Uint8Array.from([4, 7, 2, 0]);

function model(over: Partial<BoardModel> = {}): BoardModel {
  return { puzzleId: 'T1', n: 4, regions: REGIONS, colors: COLORS, cells: new Uint8Array(16), regionsDone: 0, patterns: false, ...over };
}

function withCells(changes: Record<number, number>, base = new Uint8Array(16)): Uint8Array {
  const out = Uint8Array.from(base);
  for (const [k, v] of Object.entries(changes)) out[Number(k)] = v;
  return out;
}

describe('createBoardView', () => {
  let board: BoardView;
  let input: { [K in keyof BoardInput]: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mountSprite();
    input = { tap: vi.fn(), doubleTap: vi.fn(), paint: vi.fn(), bulb: vi.fn(), paw: vi.fn() };
    board = createBoardView(model(), input as unknown as BoardInput, { reducedMotion: () => false });
    document.body.appendChild(board.el);
  });

  afterEach(() => {
    board.destroy();
    vi.useRealTimers();
  });

  const cell = (i: number): HTMLElement => board.cellElement(i) as HTMLElement;

  it('builds an accessible grid of n×n cell buttons', () => {
    expect(board.el.getAttribute('role')).toBe('grid');
    expect(board.el.getAttribute('aria-label')).toBe('Puzzle board, 4 by 4');
    expect(board.el.querySelectorAll('[role=row]')).toHaveLength(4);
    const buttons = board.el.querySelectorAll('button.cell[role=gridcell]');
    expect(buttons).toHaveLength(16);
    expect(cell(1).getAttribute('aria-label')).toBe('Row 1, column 2, Violet, empty');
    expect(cell(0).dataset.s).toBe('e');
    // The region colour sits on the tile that paints it (PERF-1: never on the cell button).
    expect((cell(0).querySelector('.cell__tile') as HTMLElement).style.getPropertyValue('--c')).toBe('var(--r4)');
    // look-spec §1.8 even gutters (no region dependence): every tile inset gap / 2 with gap =
    // round(slot × 7.9 %) — one board-level value that every tile inherits (PERF-1).
    board.setSlot(38);
    for (const k of ['--it', '--ir', '--ib', '--il']) expect(board.el.style.getPropertyValue(k)).toBe('1.5px');
    expect(board.el.style.getPropertyValue('--gap')).toBe('3px');
    board.setSlot(24);
    expect(board.el.style.getPropertyValue('--il')).toBe('1px');
    expect(board.el.style.getPropertyValue('--gap')).toBe('2px');
    // roving tabindex: only the first cell is tabbable
    expect(Array.from(buttons).filter((b) => b.getAttribute('tabindex') === '0')).toHaveLength(1);
  });

  it('PERF-1: no per-cell custom property is inherited by a cell\'s subtree (only the leaf readers carry one)', () => {
    board.update(model({ cells: withCells({ 1: CellState.Cat }) }));
    for (let i = 0; i < 16; i++) {
      const c = cell(i);
      // The cell button carries --xe only (the two edge strokes read it); nothing else that its
      // ~10 descendants would inherit (a board-level change restyled ~1 400 nodes at 12×12).
      const own = Array.from(c.style).filter((k) => k.startsWith('--'));
      expect(own).toEqual(['--xe']);
      for (const node of Array.from(c.querySelectorAll<HTMLElement | SVGElement>('[style]'))) {
        const props = Array.from(node.style).filter((k) => k.startsWith('--'));
        const cls = node.getAttribute('class');
        if (cls === 'cell__tile') expect(props.sort()).toEqual(['--c', '--diag']);
        else if (cls === 'cell__g') expect(props.sort()).toEqual(['--breathe-delay', '--diag']);
        else if (cls === 'cell__blink') expect(props.sort()).toEqual(['--blink-delay', '--blink-dur']);
        else expect(props).toEqual([]);
      }
    }
    const blink = cell(1).querySelector('.cell__blink') as SVGElement;
    expect(parseInt(blink.style.getPropertyValue('--blink-dur'), 10)).toBeGreaterThanOrEqual(cfg.fx.catBlinkMinMs);
    expect(parseInt(blink.style.getPropertyValue('--blink-dur'), 10)).toBeLessThanOrEqual(cfg.fx.catBlinkMaxMs);
  });

  it('PERF-1: setSlot changes one board-level inset value, never a per-cell one', () => {
    const spy = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty');
    board.setSlot(36, { pad: 5, radius: 11.6 }); // a new gap (3 px): 1.5 px insets, the frame too
    const targets = spy.mock.contexts.filter((st) => st !== board.el.style);
    spy.mockRestore();
    expect(targets).toHaveLength(0);
  });

  it('diffs updates: only changed cells are touched, elements are reused', () => {
    const before = Array.from({ length: 16 }, (_, i) => cell(i));
    const spy = vi.spyOn(Element.prototype, 'setAttribute');
    board.update(model({ cells: withCells({ 1: CellState.Cat, 5: CellState.Mark }) }));
    const labelWrites = spy.mock.calls.filter(([name]) => name === 'aria-label');
    spy.mockRestore();
    expect(labelWrites).toHaveLength(2);
    expect(Array.from({ length: 16 }, (_, i) => cell(i))).toEqual(before);
    expect(cell(1).dataset.s).toBe('c');
    expect(cell(5).dataset.s).toBe('m');
    expect(cell(1).getAttribute('aria-label')).toBe('Row 1, column 2, Violet, cat');
    expect(cell(1).querySelector('use.cell__cat')?.getAttribute('href')).toBe('#cat-idle');
    // the same model again touches nothing
    const spy2 = vi.spyOn(Element.prototype, 'setAttribute');
    board.update(model({ cells: withCells({ 1: CellState.Cat, 5: CellState.Mark }) }));
    expect(spy2.mock.calls.filter(([name]) => name === 'aria-label')).toHaveLength(0);
    spy2.mockRestore();
  });

  it('renders every state code (e|m|c|w|g)', () => {
    board.update(model({ cells: withCells({ 0: CellState.Mark, 1: CellState.Cat, 2: CellState.Wrong, 3: CellState.Given }) }));
    expect([0, 1, 2, 3, 4].map((i) => cell(i).dataset.s)).toEqual(['m', 'c', 'w', 'g', 'e']);
    expect(cell(2).getAttribute('aria-label')).toBe('Row 1, column 3, Mustard, wrong');
  });

  it('fades done regions with data-done and clears them on a fresh attempt', () => {
    board.update(model({ cells: withCells({ 1: CellState.Cat }), regionsDone: 0b10 }));
    expect(cell(1).hasAttribute('data-done')).toBe(true);
    expect(cell(0).hasAttribute('data-done')).toBe(false);
    board.update(model({ cells: withCells({ 1: CellState.Cat, 13: CellState.Cat }), regionsDone: 0b1010 }));
    for (const i of [9, 10, 12, 13, 14, 15]) expect(cell(i).hasAttribute('data-done')).toBe(true);
    board.update(model());
    expect(board.el.querySelectorAll('[data-done]')).toHaveLength(0);
  });

  it('rebuilds on a new puzzle id or new region layout, and not otherwise', () => {
    const first = cell(0);
    board.update(model({ colors: Uint8Array.from(COLORS) })); // equal content, new reference
    expect(cell(0)).toBe(first);
    board.update(model({ puzzleId: 'L2' }));
    expect(cell(0)).not.toBe(first);
    const second = cell(0);
    const regions = Uint8Array.from(REGIONS);
    regions[15] = 2;
    board.update(model({ puzzleId: 'L2', regions }));
    expect(cell(0)).not.toBe(second);
    board.update(model({ puzzleId: 'L3', n: 5, regions: new Uint8Array(25), colors: Uint8Array.from([0, 1, 2, 3, 4]), cells: new Uint8Array(25) }));
    expect(board.el.querySelectorAll('button.cell')).toHaveLength(25);
  });

  it('patterns add glyphs and name them in labels', () => {
    board.update(model({ patterns: true }));
    expect(board.el.hasAttribute('data-patterns')).toBe(true);
    expect(cell(1).querySelector('use.cell__pat')?.getAttribute('href')).toBe('#glyph-7');
    expect(cell(1).getAttribute('aria-label')).toBe('Row 1, column 2, Violet (bar), empty');
    board.update(model({ patterns: false }));
    expect(board.el.hasAttribute('data-patterns')).toBe(false);
    expect(cell(1).getAttribute('aria-label')).toBe('Row 1, column 2, Violet, empty');
  });

  it('hint highlight marks focus, ghost X and ghost cat; null clears it', () => {
    const step: HintStep = { kind: 'single', level: 1, focusUnits: [], focusCells: [0, 4, 8], effectCells: [12, 13], placeCell: 8 };
    board.setHighlight({ kind: 'hint', step });
    expect(board.el.dataset.hl).toBe('hint');
    expect(board.el.querySelectorAll('[data-f]')).toHaveLength(3);
    expect(cell(12).dataset.ghost).toBe('x');
    expect(cell(8).dataset.ghost).toBe('cat');
    expect(cell(8).querySelector('use.cell__cat')).not.toBeNull();
    board.setHighlight({ kind: 'hint', step: { ...step, kind: 'mistaken_mark', effectCells: [5], placeCell: undefined } });
    expect(cell(5).dataset.ghost).toBe('clear');
    expect(cell(12).hasAttribute('data-ghost')).toBe(false);
    board.setHighlight({ kind: 'coach', cells: [1] });
    expect(board.el.dataset.hl).toBe('coach');
    expect(board.el.querySelectorAll('[data-f]')).toHaveLength(1);
    board.setHighlight(null);
    expect(board.el.hasAttribute('data-hl')).toBe(false);
    expect(board.el.querySelectorAll('[data-f],[data-ghost]')).toHaveLength(0);
  });

  it('setLocked sets aria-disabled and blocks keyboard input', () => {
    board.setLocked(true);
    expect(board.el.getAttribute('aria-disabled')).toBe('true');
    cell(0).dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(input.tap).not.toHaveBeenCalled();
    board.setLocked(false);
    expect(board.el.hasAttribute('aria-disabled')).toBe(false);
    cell(0).dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(input.tap).toHaveBeenCalledWith(0);
  });

  it('MISTAKE makes cats sad for fx.sadCatsMs; WON makes them happy after fx.winHappyDelayMs', () => {
    vi.useFakeTimers();
    board.update(model({ cells: withCells({ 1: CellState.Cat }) }));
    const catUse = (): string | null => cell(1).querySelector('use.cell__cat')?.getAttribute('href') ?? null;
    board.update(model({ cells: withCells({ 1: CellState.Cat, 0: CellState.Wrong }) }));
    board.playEvent({ type: 'MISTAKE', cell: 0, heartsLeft: 2 });
    expect(board.el.dataset.mood).toBe('sad');
    expect(catUse()).toBe('#cat-sad');
    expect(cell(0).classList.contains('fx-flash')).toBe(true);
    vi.advanceTimersByTime(cfg.fx.sadCatsMs);
    expect(board.el.dataset.mood).toBe('idle');
    expect(catUse()).toBe('#cat-idle');
    board.playEvent({ type: 'WON' });
    expect(board.el.dataset.mood).toBe('idle');
    vi.advanceTimersByTime(cfg.fx.winHappyDelayMs);
    expect(board.el.dataset.mood).toBe('happy');
    expect(catUse()).toBe('#cat-happy');
  });

  it('LOST keeps cats sad until a fresh attempt clears the wrong cells', () => {
    board.update(model({ cells: withCells({ 1: CellState.Cat, 0: CellState.Wrong }) }));
    board.playEvent({ type: 'LOST' });
    expect(board.el.dataset.mood).toBe('sad');
    board.update(model());
    expect(board.el.dataset.mood).toBe('idle');
  });

  it('a kitty cat looks surprised for kitty.revealMs, then follows the board mood', () => {
    vi.useFakeTimers();
    board.update(model({ cells: withCells({ 1: CellState.Cat }) }));
    board.playEvent({ type: 'CAT_PLACED', cell: 1, source: 'kitty' });
    expect(cell(1).querySelector('use.cell__cat')?.getAttribute('href')).toBe('#cat-surprised');
    expect(cell(1).dataset.mood).toBe('surprised');
    expect(cell(1).querySelector('.cell__spark')).not.toBeNull();
    vi.advanceTimersByTime(cfg.kitty.revealMs + 250);
    expect(cell(1).querySelector('use.cell__cat')?.getAttribute('href')).toBe('#cat-idle');
    expect(cell(1).querySelector('.cell__spark')).toBeNull();
  });

  it('transient classes are removed again', () => {
    vi.useFakeTimers();
    board.playEvent({ type: 'PULSE', cell: 3 });
    board.playEvent({ type: 'MARKED', cells: [4, 5] });
    expect(cell(3).classList.contains('fx-pulse')).toBe(true);
    // look-spec §1.10: every new X pops, all at once when several are painted
    expect(cell(4).classList.contains('fx-pop')).toBe(true);
    expect(cell(5).classList.contains('fx-pop')).toBe(true);
    board.playEntry();
    expect(board.el.classList.contains('fx-entry')).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(board.el.querySelectorAll('.fx-pulse,.fx-pop')).toHaveLength(0);
    expect(board.el.classList.contains('fx-entry')).toBe(false);
  });

  it('the mouse\'s X\'s pop one after another, fx.mouseStaggerMs apart, each hidden until its turn (look-spec §1.12)', () => {
    vi.useFakeTimers();
    const step = cfg.fx.mouseStaggerMs;
    board.playEvent({ type: 'MARKED', cells: [6, 9, 14], source: 'mouse' });
    // the first pops now (a 0 ms timer); the others wait under .fx-pend
    expect(cell(9).classList.contains('fx-pend')).toBe(true);
    expect(cell(14).classList.contains('fx-pend')).toBe(true);
    vi.advanceTimersByTime(0);
    expect(cell(6).classList.contains('fx-pop')).toBe(true);
    expect(cell(9).classList.contains('fx-pop')).toBe(false);
    vi.advanceTimersByTime(step);
    expect(cell(9).classList.contains('fx-pop')).toBe(true);
    expect(cell(9).classList.contains('fx-pend')).toBe(false);
    expect(cell(14).classList.contains('fx-pop')).toBe(false);
    vi.advanceTimersByTime(step);
    expect(cell(14).classList.contains('fx-pop')).toBe(true);
    vi.advanceTimersByTime(cfg.fx.markPopMs + 100);
    expect(board.el.querySelectorAll('.fx-pop,.fx-pend')).toHaveLength(0);
  });

  it('reduced motion skips the pop, the mouse stagger, the drop and the sparkle', () => {
    board.destroy();
    board = createBoardView(model(), input as unknown as BoardInput, { reducedMotion: () => true });
    board.playEvent({ type: 'MARKED', cells: [4] });
    board.playEvent({ type: 'MARKED', cells: [5, 6], source: 'mouse' });
    board.playEvent({ type: 'CAT_PLACED', cell: 1, source: 'kitty' });
    expect(board.el.querySelectorAll('.fx-pop,.fx-pend,.fx-drop,.cell__spark')).toHaveLength(0);
    board.playEntry();
    expect(board.el.style.getPropertyValue('--entry-stagger')).toBe('0ms');
  });

  it('setSlot and geometry report the slot size', () => {
    board.setSlot(40);
    expect(board.el.style.getPropertyValue('--slot')).toBe('40px');
    const g = board.geometry(); // jsdom has no layout: falls back to the slot size
    expect(g).toMatchObject({ pad: cfg.layout.boardPad, slot: 40, n: 4 });
    expect(board.cellRect(0)).not.toBeNull();
    expect(board.cellRect(99)).toBeNull();
  });

  it('setSlot(slot, frame) sets the card padding and radius from computeLayout; the tile radius is 11 % of the tile (look-spec §1.8)', () => {
    board.setSlot(38, { pad: 5, radius: 11.6 });
    expect(board.el.style.getPropertyValue('--pad')).toBe('5px');
    expect(board.el.style.getPropertyValue('--board-radius')).toBe('11.6px');
    expect(board.geometry().pad).toBe(5);
    // tile 35, radius 0.11 × 35 = 3.85 px = 0.1013 of the 38 px slot
    expect(Number(board.el.style.getPropertyValue('--cell-r')) * 38).toBeCloseTo(cfg.layout.game.tileRadiusFraction * 35, 2);
    // a new frame with the same slot still applies
    board.setSlot(38, { pad: 4, radius: 9 });
    expect(board.geometry().pad).toBe(4);
    expect(board.el.style.getPropertyValue('--board-radius')).toBe('9px');
    // the X pop's length comes from fx.markPopMs
    expect(board.el.style.getPropertyValue('--x-pop-ms')).toBe(`${cfg.fx.markPopMs}ms`);
  });

  it('destroy detaches the element', () => {
    board.destroy();
    expect(board.el.isConnected).toBe(false);
    board = createBoardView(model(), input as unknown as BoardInput, { reducedMotion: () => false });
  });
});

describe('board keyboard (02 §6.3)', () => {
  let board: BoardView;
  let input: { [K in keyof BoardInput]: ReturnType<typeof vi.fn> };
  const key = (k: string, init: KeyboardEventInit = {}): void => {
    (document.activeElement ?? board.el).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
  };

  beforeEach(() => {
    input = { tap: vi.fn(), doubleTap: vi.fn(), paint: vi.fn(), bulb: vi.fn(), paw: vi.fn(), mouse: vi.fn() };
    board = createBoardView(model(), input as unknown as BoardInput, { reducedMotion: () => false });
    document.body.appendChild(board.el);
    board.focusCell(0);
  });

  afterEach(() => board.destroy());

  it('arrows move a roving tabindex and DOM focus, clamped at the edges', () => {
    key('ArrowRight');
    key('ArrowDown');
    expect(document.activeElement).toBe(board.cellElement(5));
    expect(board.cellElement(5)?.getAttribute('tabindex')).toBe('0');
    expect(board.cellElement(0)?.getAttribute('tabindex')).toBe('-1');
    key('ArrowLeft');
    key('ArrowLeft');
    key('ArrowUp');
    key('ArrowUp');
    expect(document.activeElement).toBe(board.cellElement(0));
    key('End');
    expect(document.activeElement).toBe(board.cellElement(3));
  });

  it('Space taps, Enter double-taps, H and K open the helpers; repeats are ignored', () => {
    key('ArrowRight');
    key(' ');
    key('Enter');
    key('Enter', { repeat: true });
    key('h');
    key('K');
    expect(input.tap).toHaveBeenCalledWith(1);
    expect(input.doubleTap).toHaveBeenCalledTimes(1);
    expect(input.doubleTap).toHaveBeenCalledWith(1);
    expect(input.bulb).toHaveBeenCalledTimes(1);
    expect(input.paw).toHaveBeenCalledTimes(1);
  });

  it('M calls the mouse (look-spec §1.11); without a mouse callback the key does nothing', () => {
    key('m');
    key('M');
    key('m', { repeat: true });
    expect(input.mouse).toHaveBeenCalledTimes(2);
    board.destroy();
    const { mouse: _gone, ...rest } = input;
    board = createBoardView(model(), rest as unknown as BoardInput, { reducedMotion: () => false });
    document.body.appendChild(board.el);
    board.focusCell(0);
    const ev = new KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true });
    board.cellElement(0)?.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('prevents default for handled keys and ignores modified keys', () => {
    const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    board.cellElement(0)?.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    key('h', { ctrlKey: true });
    expect(input.bulb).not.toHaveBeenCalled();
  });

  it('focusing a cell by pointer moves the roving index there', () => {
    board.cellElement(10)?.focus();
    expect(board.cellElement(10)?.getAttribute('tabindex')).toBe('0');
    key(' ');
    expect(input.tap).toHaveBeenCalledWith(10);
  });
});
