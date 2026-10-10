// Owner: B (Phase 2b; was ui-board); G2 (Phase 2d: the card frame, gap / 2 insets, the X pop, the mouse's
// staggered X's, the M key; Phase 2d.1: the X draw-in, the mouse's visits, the cat sequence, the waves,
// the ghost X's, ghostOrder / waveOrder / xOutlinePath, helpers-spec §7.6).
// Board view: build once, diff-only updates, region fade, highlights, moods, keyboard (04 §5.3).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import type { HintStep } from '../../../src/engine/types';
import { CellState } from '../../../src/game/types';
import { mouseLandMs, mouseRunMs, mouseVisitMs } from '../../../src/game/mouse';
import { mountSprite } from '../../../src/ui/art/sprite';
import { WINK_FROM_MS, WINK_TO_MS } from '../../../src/ui/board/board-cat';
import { GHOST_OUTER_PX, GHOST_STROKE_PX, ghostOrder, waveOrder, xOutlinePath } from '../../../src/ui/board/board-fx';
import { createBoardView, loadMouseRun, MOUSE_PREFETCH_MS, type BoardInput, type BoardModel, type BoardView } from '../../../src/ui/board/board-view';

// 4×4: regions A B C C / A A C C / A D D C / D D D D (the tutorial board), colours Denim Violet Mustard Coral.
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
    input = { tap: vi.fn(), doubleTap: vi.fn(), paint: vi.fn(), bulb: vi.fn(), paw: vi.fn(), mouse: vi.fn() };
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
    board.setSlot(38, { pad: 5, radius: 11.6 });
    for (const k of ['--it', '--ir', '--ib', '--il']) expect(board.el.style.getPropertyValue(k)).toBe('1.5px');
    expect(board.el.style.getPropertyValue('--gap')).toBe('3px');
    board.setSlot(24, { pad: 3, radius: 7.3 });
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

  it('hint highlight marks focus, ghost X (Empty effect cells only, outline + delay) and ghost cat; null clears it (helpers-spec §3.3)', () => {
    board.update(model({ cells: withCells({ 13: CellState.Mark }) }));
    const step: HintStep = { kind: 'single', level: 1, focusUnits: [], focusCells: [0, 4, 8], effectCells: [12, 13, 14], placeCell: 8 };
    board.setHighlight({ kind: 'hint', step });
    expect(board.el.dataset.hl).toBe('hint');
    expect(board.el.querySelectorAll('[data-f]')).toHaveLength(3);
    expect(cell(12).dataset.ghost).toBe('x');
    expect(cell(13).hasAttribute('data-ghost')).toBe(false); // already marked: no ghost, no slot
    expect(cell(14).dataset.ghost).toBe('x');
    const H = cfg.fx.hint;
    expect(cell(12).style.getPropertyValue('--gd')).toBe(`${H.ghostFirstMs}ms`);
    expect(cell(14).style.getPropertyValue('--gd')).toBe(`${H.ghostFirstMs + H.ghostStaggerMs}ms`);
    expect(cell(12).querySelector('g.cell__xog > path.cell__xo')?.getAttribute('d')).toBe(xOutlinePath());
    expect(cell(8).dataset.ghost).toBe('cat');
    expect(cell(8).style.getPropertyValue('--gd')).toBe(`${H.ghostFirstMs}ms`);
    expect(cell(8).querySelector('use.cell__cat')).not.toBeNull();
    board.setHighlight({ kind: 'hint', step: { ...step, kind: 'mistaken_mark', effectCells: [13], placeCell: undefined } });
    expect(cell(13).dataset.ghost).toBe('clear');
    expect(cell(12).hasAttribute('data-ghost')).toBe(false);
    expect(cell(12).style.getPropertyValue('--gd')).toBe('');
    board.setHighlight({ kind: 'coach', cells: [1] });
    expect(board.el.dataset.hl).toBe('coach');
    expect(board.el.querySelectorAll('[data-f]')).toHaveLength(1);
    board.setHighlight(null);
    expect(board.el.hasAttribute('data-hl')).toBe(false);
    expect(board.el.querySelectorAll('[data-f],[data-ghost]')).toHaveLength(0);
  });

  it('a shadow hint lists its ghosts row left → right, then column top → bottom, then the rest, 60 ms apart (helpers-spec §3.3, measured)', () => {
    // the cat on (0,3); its row, column and neighbour (1,2); (0,1) already crossed takes no slot
    board.update(model({ cells: withCells({ 3: CellState.Cat, 1: CellState.Mark }) }));
    const step: HintStep = { kind: 'shadow', level: 0, focusUnits: [], focusCells: [3], effectCells: [0, 1, 2, 7, 11, 15, 6] };
    board.setHighlight({ kind: 'hint', step });
    const delay = (i: number): number => parseInt(cell(i).style.getPropertyValue('--gd'), 10);
    const H = cfg.fx.hint;
    expect([0, 2, 7, 11, 15, 6].map(delay)).toEqual([0, 1, 2, 3, 4, 5].map((k) => H.ghostFirstMs + k * H.ghostStaggerMs));
    expect(cell(1).hasAttribute('data-ghost')).toBe(false);
  });

  it('reduced motion: the ghosts wait together until ghostFirstMs (data-ghost-wait)', () => {
    vi.useFakeTimers();
    board.destroy();
    board = createBoardView(model(), input as unknown as BoardInput, { reducedMotion: () => true });
    board.setHighlight({ kind: 'hint', step: { kind: 'single', level: 1, focusUnits: [], focusCells: [0], effectCells: [5, 6] } });
    expect(board.el.hasAttribute('data-ghost-wait')).toBe(true);
    vi.advanceTimersByTime(cfg.fx.hint.ghostFirstMs);
    expect(board.el.hasAttribute('data-ghost-wait')).toBe(false);
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

  it('every correct cat (kitty, hint, player) plays the cat sequence: .fx-cat, the flash and the light; it winks from 350 to 780, then follows the board mood (helpers-spec §2.4)', () => {
    vi.useFakeTimers();
    for (const source of ['kitty', 'player', 'hint'] as const) {
      board.update(model({ cells: withCells({ 1: CellState.Cat }) }));
      board.playEvent({ type: 'CAT_PLACED', cell: 1, source });
      const c = cell(1);
      const href = (): string | null => c.querySelector('use.cell__cat')?.getAttribute('href') ?? null;
      expect(c.classList.contains('fx-cat'), source).toBe(true);
      expect(c.querySelector('.cell__flash')).not.toBeNull();
      expect(c.querySelectorAll('.cell__light > i')).toHaveLength(6);
      // the flash takes the tile's colour for its halo
      expect((c.querySelector('.cell__flash') as HTMLElement).style.getPropertyValue('--c')).toBe('var(--r7)');
      expect(c.dataset.mood).toBe('idle'); // no blink lid and no breathing while it pops
      expect(c.querySelector('.cell__spark')).toBeNull(); // the 2b kitty sparkle is gone
      vi.advanceTimersByTime(WINK_FROM_MS);
      expect(href()).toBe('#cat-wink');
      expect(c.dataset.mood).toBe('wink');
      vi.advanceTimersByTime(WINK_TO_MS - WINK_FROM_MS);
      expect(href()).toBe('#cat-idle');
      vi.advanceTimersByTime(cfg.fx.catPlaced.settleMs + 40 - WINK_TO_MS);
      expect(c.classList.contains('fx-cat')).toBe(false);
      expect(c.querySelector('.cell__flash, .cell__light')).toBeNull();
      expect(c.hasAttribute('data-mood')).toBe(false);
      board.update(model());
    }
    expect(WINK_FROM_MS).toBe(350);
    expect(WINK_TO_MS).toBe(780);
  });

  it('CAT_REMOVED during the sequence cancels it on that cell at once; so does a props render that empties the cell', () => {
    vi.useFakeTimers();
    board.update(model({ cells: withCells({ 1: CellState.Cat, 6: CellState.Cat }) }));
    board.playEvent({ type: 'CAT_PLACED', cell: 1, source: 'player' });
    board.playEvent({ type: 'CAT_PLACED', cell: 6, source: 'player' });
    vi.advanceTimersByTime(400);
    board.playEvent({ type: 'CAT_REMOVED', cell: 1 });
    expect(cell(1).classList.contains('fx-cat')).toBe(false);
    expect(cell(1).querySelector('.cell__flash')).toBeNull();
    expect(cell(1).hasAttribute('data-mood')).toBe(false);
    expect(cell(6).classList.contains('fx-cat')).toBe(true);
    board.update(model({ cells: withCells({ 1: CellState.Cat }) })); // cell 6 is no longer a cat
    expect(cell(6).classList.contains('fx-cat')).toBe(false);
    expect(board.el.querySelectorAll('.cell__flash, .cell__light')).toHaveLength(0);
  });

  it('transient classes are removed again; every new X of a tap, a paint or Apply draws in at once (.fx-mark, helpers-spec §4.4)', () => {
    vi.useFakeTimers();
    board.playEvent({ type: 'PULSE', cell: 3 });
    board.playEvent({ type: 'MARKED', cells: [4, 5] });
    expect(cell(3).classList.contains('fx-pulse')).toBe(true);
    expect(cell(4).classList.contains('fx-mark')).toBe(true);
    expect(cell(5).classList.contains('fx-mark')).toBe(true);
    expect(board.el.querySelectorAll('.fx-pop')).toHaveLength(0); // only the mouse's X pops
    board.playEntry();
    expect(board.el.classList.contains('fx-entry')).toBe(true);
    vi.advanceTimersByTime(cfg.fx.markDraw.settleMs + 60);
    expect(board.el.querySelectorAll('.fx-mark')).toHaveLength(0);
    vi.advanceTimersByTime(1000);
    expect(board.el.querySelectorAll('.fx-pulse,.fx-mark')).toHaveLength(0);
    expect(board.el.classList.contains('fx-entry')).toBe(false);
    // the timings come from fx.markDraw
    expect(board.el.style.getPropertyValue('--xd-s2')).toBe(`${cfg.fx.markDraw.stroke2Ms}ms`);
    expect(board.el.style.getPropertyValue('--xd-over')).toBe(String(cfg.fx.markDraw.overshoot));
  });

  it('a mouse MARKED before its chunk has loaded hides the X\'s at once (aria-busy); the run starts when the chunk lands (first in this file: nothing loaded it yet)', async () => {
    board.playEvent({ type: 'MARKED', cells: [3, 12], source: 'mouse' });
    expect(cell(3).classList.contains('fx-pend')).toBe(true);
    expect(cell(12).classList.contains('fx-pend')).toBe(true);
    expect(board.el.getAttribute('aria-busy')).toBe('true');
    await loadMouseRun();
    await Promise.resolve();
    expect(board.el.querySelector('.board__mouse')?.getAttribute('data-cell')).toBe('3');
  });

  it('the mouse\'s visits are a lazy chunk: a MARKED before it loads hides the X\'s, and the run starts timed from the MARKED once it lands; the entry prefetches it', async () => {
    const mod = await loadMouseRun();
    expect(typeof mod.playMouseRun).toBe('function');
    expect(await loadMouseRun()).toBe(mod); // loaded once
    expect(document.querySelector('symbol[id="board-mouse-lids"]')).not.toBeNull(); // with the lazy art
    expect(MOUSE_PREFETCH_MS).toBeGreaterThan(0);
  });

  it('the mouse visits its tiles in event order: each X hidden (.fx-pend) until k × 935 + 850, then it pops; the sprite moves on with its face (helpers-spec §1.5)', async () => {
    await loadMouseRun();
    vi.useFakeTimers();
    const cells = [14, 6, 9]; // event order, not reading order
    board.playEvent({ type: 'MARKED', cells, source: 'mouse' });
    expect(board.el.getAttribute('aria-busy')).toBe('true');
    const sprite = (): HTMLElement | null => board.el.querySelector('.board__mouse');
    for (const i of cells) expect(cell(i).classList.contains('fx-pend')).toBe(true);
    expect(sprite()?.dataset.cell).toBe('14');
    expect(sprite()?.dataset.face).toBe('blink');
    expect(sprite()?.getAttribute('aria-hidden')).toBe('true');
    expect(sprite()?.style.getPropertyValue('--mr')).toBe('3');
    expect(sprite()?.style.getPropertyValue('--mc')).toBe('2');
    expect(cell(14).classList.contains('fx-press')).toBe(true); // the tile's press bump
    expect(sprite()?.querySelectorAll('use')).toHaveLength(4);
    vi.advanceTimersByTime(mouseLandMs(0) - 1);
    expect(cell(14).classList.contains('fx-pend')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(cell(14).classList.contains('fx-pend')).toBe(false);
    expect(cell(14).classList.contains('fx-pop')).toBe(true);
    expect(cell(14).classList.contains('fx-mark')).toBe(false);
    expect(sprite()?.classList.contains('board__mouse--out')).toBe(true);
    vi.advanceTimersByTime(mouseVisitMs() - mouseLandMs(0));
    expect(board.el.querySelectorAll('.board__mouse')).toHaveLength(1);
    expect(sprite()?.dataset.cell).toBe('6');
    expect(sprite()?.dataset.face).toBe('glance');
    expect(cell(6).classList.contains('fx-pend')).toBe(true);
    vi.advanceTimersByTime(mouseLandMs(1) - mouseVisitMs());
    expect(cell(6).classList.contains('fx-pend')).toBe(false);
    vi.advanceTimersByTime(mouseVisitMs() * 2 - mouseLandMs(1));
    expect(sprite()?.dataset.face).toBe('grin');
    vi.advanceTimersByTime(mouseLandMs(2) - mouseVisitMs() * 2);
    expect(cell(9).classList.contains('fx-pend')).toBe(false);
    vi.advanceTimersByTime(mouseRunMs(3, false) - mouseLandMs(2));
    expect(sprite()).toBeNull();
    expect(board.el.hasAttribute('aria-busy')).toBe(false);
    expect(mouseRunMs(3, false)).toBe(3 * 935 + 170);
  });

  it('a late timer (a hidden page) catches up: every due X lands, and at mouseRunMs nothing stays hidden whatever the animations do', async () => {
    await loadMouseRun();
    vi.useFakeTimers();
    let now = 0;
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => now);
    board.playEvent({ type: 'MARKED', cells: [2, 7, 13], source: 'mouse' });
    // the page was hidden: the clock jumps 2 s while one timer fires late
    now = 2000;
    vi.advanceTimersByTime(mouseLandMs(0));
    expect(cell(2).classList.contains('fx-pend')).toBe(false);
    expect(cell(7).classList.contains('fx-pend')).toBe(false);
    expect(cell(13).classList.contains('fx-pend')).toBe(true);
    now = mouseRunMs(3, false);
    vi.advanceTimersByTime(5000);
    expect(board.el.querySelectorAll('.fx-pend, .board__mouse')).toHaveLength(0);
    spy.mockRestore();
  });

  it('a props render that takes a mark of the run away (Retry) ends the run at once; a new board too', async () => {
    await loadMouseRun();
    vi.useFakeTimers();
    board.update(model({ cells: withCells({ 5: CellState.Mark, 10: CellState.Mark }) }));
    board.playEvent({ type: 'MARKED', cells: [5, 10], source: 'mouse' });
    expect(board.el.querySelector('.board__mouse')).not.toBeNull();
    board.update(model()); // Retry: the marks are gone
    expect(board.el.querySelectorAll('.fx-pend, .board__mouse')).toHaveLength(0);
    board.update(model({ cells: withCells({ 5: CellState.Mark }) }));
    board.playEvent({ type: 'MARKED', cells: [5], source: 'mouse' });
    board.update(model({ puzzleId: 'L9', cells: withCells({ 5: CellState.Mark }) }));
    expect(board.el.querySelectorAll('.fx-pend, .board__mouse')).toHaveLength(0);
  });

  it('UNITS_DONE bumps each unit\'s tiles in a wave, waveStepMs apart from the end nearer the anchor; a tile in two units bumps twice (helpers-spec §4.2)', () => {
    vi.useFakeTimers();
    const step = cfg.fx.unitDone.waveStepMs;
    board.playEvent({ type: 'UNITS_DONE', units: [{ kind: 'row', index: 0, anchor: 2 }, { kind: 'col', index: 3, anchor: 15 }] });
    const wd = (i: number): string => cell(i).style.getPropertyValue('--wd');
    // row 0 from its right end (the anchor (0,2) is nearer it): 3, 2, 1, 0
    expect([3, 2, 1, 0].map(wd)).toEqual(['0ms', `${step}ms`, `${2 * step}ms`, `${3 * step}ms`]);
    // column 3 from its bottom end: 15, 11, 7, 3; tile 3 is in both: 0 and 3 steps
    expect([15, 11, 7].map(wd)).toEqual(['0ms', `${step}ms`, `${2 * step}ms`]);
    expect(cell(3).classList.contains('fx-wave2')).toBe(true);
    expect(cell(3).style.getPropertyValue('--wd2')).toBe(`${3 * step}ms`);
    for (const i of [0, 1, 2, 3, 7, 11, 15]) expect(cell(i).classList.contains('fx-wave')).toBe(true);
    expect(cell(5).classList.contains('fx-wave')).toBe(false);
    vi.advanceTimersByTime(3 * step + 270 + 100);
    expect(board.el.querySelectorAll('.fx-wave, .fx-wave2')).toHaveLength(0);
    expect(wd(0)).toBe('');
  });

  it('the found cat\'s tile is not veiled; the region pop skips it (helpers-spec §4.7)', () => {
    vi.useFakeTimers();
    board.update(model({ cells: withCells({ 1: CellState.Cat }), regionsDone: 0b10 }));
    board.playEvent({ type: 'REGION_DONE', region: 1 });
    expect(cell(1).classList.contains('fx-done')).toBe(false);
    board.update(model({ cells: withCells({ 1: CellState.Cat, 13: CellState.Cat }), regionsDone: 0b1010 }));
    board.playEvent({ type: 'REGION_DONE', region: 3 });
    expect(cell(9).classList.contains('fx-done')).toBe(true);
    expect(cell(13).classList.contains('fx-done')).toBe(false);
  });

  it('a dark tile (Denim) carries data-dark (helpers-spec §6.4)', () => {
    // regions A (Denim) are 0, 4, 5, 8
    expect([0, 4, 5, 8].every((i) => cell(i).hasAttribute('data-dark'))).toBe(true);
    expect(board.el.querySelectorAll('[data-dark]')).toHaveLength(4);
  });

  it('reduced motion: no sprite, no pend, no draw-in, no cat sequence, no wave', () => {
    board.destroy();
    board = createBoardView(model({ cells: withCells({ 1: CellState.Cat }) }), input as unknown as BoardInput, { reducedMotion: () => true });
    board.playEvent({ type: 'MARKED', cells: [4] });
    board.playEvent({ type: 'MARKED', cells: [5, 6], source: 'mouse' });
    board.playEvent({ type: 'CAT_PLACED', cell: 1, source: 'kitty' });
    board.playEvent({ type: 'UNITS_DONE', units: [{ kind: 'row', index: 1, anchor: 6 }] });
    expect(board.el.querySelectorAll('.fx-mark,.fx-pop,.fx-pend,.fx-cat,.fx-wave,.board__mouse,.cell__flash,.cell__spark')).toHaveLength(0);
    expect(board.el.hasAttribute('aria-busy')).toBe(false);
    board.playEntry();
    expect(board.el.style.getPropertyValue('--entry-stagger')).toBe('0ms');
  });

  it('setSlot and geometry report the slot size', () => {
    board.setSlot(40, { pad: 6, radius: 13.2 });
    expect(board.el.style.getPropertyValue('--slot')).toBe('40px');
    const g = board.geometry(); // jsdom has no layout: falls back to the slot size
    expect(g).toMatchObject({ pad: 6, slot: 40, n: 4 });
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
    // the mouse's X pop comes from fx.markPopMs
    expect(board.el.style.getPropertyValue('--x-pop-ms')).toBe(`${cfg.fx.markPopMs}ms`);
  });

  it('destroy detaches the element', () => {
    board.destroy();
    expect(board.el.isConnected).toBe(false);
    board = createBoardView(model(), input as unknown as BoardInput, { reducedMotion: () => false });
  });
});

describe('Phase 2d.1 pure helpers: ghostOrder, waveOrder, xOutlinePath', () => {
  it('ghostOrder: Empty effect cells only; shadow = row L → R, column T → B, then reading order; other kinds reading order', () => {
    const n = 9;
    const cells = new Uint8Array(81);
    cells[5] = CellState.Mark; // already crossed: no slot
    cells[8] = CellState.Cat;
    const eff = [16, 80, 71, 62, 53, 44, 35, 26, 17, 0, 1, 2, 3, 4, 5, 6, 7];
    const shadow: HintStep = { kind: 'shadow', level: 0, focusUnits: [], focusCells: [8], effectCells: eff };
    expect(ghostOrder(shadow, cells, n)).toEqual([0, 1, 2, 3, 4, 6, 7, 17, 26, 35, 44, 53, 62, 71, 80, 16]);
    expect(ghostOrder({ ...shadow, kind: 'single' }, cells, n)).toEqual([0, 1, 2, 3, 4, 6, 7, 16, 17, 26, 35, 44, 53, 62, 71, 80]);
    expect(ghostOrder({ ...shadow, kind: 'mistaken_mark' }, cells, n)).toEqual([]);
  });

  it('waveOrder: lines from the end nearer the anchor, one tile per step; regions by king distance inside the region', () => {
    const regions = new Uint8Array(81);
    expect(waveOrder({ kind: 'row', index: 0, anchor: 7 }, 9, regions).map((s) => s[0])).toEqual([8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(waveOrder({ kind: 'col', index: 8, anchor: 80 }, 9, regions).map((s) => s[0])).toEqual([80, 71, 62, 53, 44, 35, 26, 17, 8]);
    expect(waveOrder({ kind: 'row', index: 2, anchor: 19 }, 9, regions).map((s) => s[0])).toEqual([18, 19, 20, 21, 22, 23, 24, 25, 26]);
    // a region: A A B / A B B / C C C on 3 × 3, anchor 0
    const r3 = Uint8Array.from([0, 0, 1, 0, 1, 1, 2, 2, 2]);
    expect(waveOrder({ kind: 'region', index: 0, anchor: 0 }, 3, r3)).toEqual([[0], [1, 3]]);
    expect(waveOrder({ kind: 'region', index: 1, anchor: 5 }, 3, r3)).toEqual([[5], [2, 4]]);
    // king steps: a diagonal neighbour is one step
    expect(waveOrder({ kind: 'region', index: 2, anchor: 6 }, 3, r3)).toEqual([[6], [7], [8]]);
  });

  it('xOutlinePath: the union outline of the two bars (no inner crossing), its 1.5 px stroke ending 0.8 px outside the real X at T = 39', () => {
    const d = xOutlinePath();
    const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    // the outline's points, rotated back into the bars' frame
    const pts: [number, number][] = [];
    for (const seg of d.split(/(?=[MLA])/)) {
      const v = (seg.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      const [x, y] = seg.startsWith('A') ? [v[5] as number, v[6] as number] : [v[0] as number, v[1] as number];
      const u = ((x - 50) + (y - 50)) / Math.SQRT2;
      const w = ((y - 50) - (x - 50)) / Math.SQRT2;
      pts.push([u, w]);
    }
    expect(nums.length).toBeGreaterThan(40);
    expect(d.match(/A/g)).toHaveLength(8); // the eight rounded bar ends
    expect(d.match(/L/g)).toHaveLength(11); // the straight sides and the four concave corners where the bars meet (Z closes the last)
    const half = Math.max(...pts.map(([u, w]) => Math.max(Math.abs(u), Math.abs(w))));
    const L = cfg.layout.mark;
    const grow = half - (L.armFraction * 100) / 2;
    // slot 42 (tile 39 + gap 3): the path is grown so the stroke's outer edge sits 0.8 px out
    expect((grow / 100) * 42 + GHOST_STROKE_PX / 2).toBeCloseTo(GHOST_OUTER_PX, 2);
    expect(GHOST_OUTER_PX).toBe(0.8);
    // the concave corners sit on the bars' sides (half width + grow): no crossing lines inside
    const inner = pts.filter(([u, w]) => Math.abs(Math.abs(u) - Math.abs(w)) < 0.05);
    for (const [u] of inner) expect(Math.abs(u)).toBeCloseTo((L.barFraction * 100) / 2 + grow, 1);
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

  it('M calls the mouse (look-spec §1.11; BoardInput.mouse is required since 2d I-3; the screen ignores it while the mouse is not ready)', () => {
    key('m');
    key('M');
    key('m', { repeat: true });
    expect(input.mouse).toHaveBeenCalledTimes(2);
    board.focusCell(0);
    const ev = new KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true });
    board.cellElement(0)?.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true); // a handled key: no page action
    expect(input.mouse).toHaveBeenCalledTimes(3);
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
