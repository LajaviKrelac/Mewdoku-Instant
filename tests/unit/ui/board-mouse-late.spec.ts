// Owner: lead (Phase 2d.1 audit fix A-2)
// The board's safety reveal for the mouse (board-view.ts, MARKED { source: 'mouse' } before the lazy chunk
// board-mouse.ts has loaded): the X's hide at once and the board is busy; if the chunk does not land
// within the whole run (mouseRunMs), the X's show and the board is free anyway, and a chunk that lands
// after that shows nothing more (no sprite, no hidden X). Its own file: the chunk is mocked behind a gate
// this file opens, and the module cache must not hold the real chunk from another test.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mouseRunMs } from '../../../src/game/mouse';
import { mountSprite } from '../../../src/ui/art/sprite';
import { createBoardView, loadMouseRun, type BoardInput, type BoardModel, type BoardView } from '../../../src/ui/board/board-view';

let openGate: () => void = () => undefined;
const gate = new Promise<void>((resolve) => {
  openGate = resolve;
});
vi.mock('../../../src/ui/board/board-mouse', async () => {
  const real = await vi.importActual<typeof import('../../../src/ui/board/board-mouse')>('../../../src/ui/board/board-mouse');
  await gate; // the chunk "downloads" until the test opens the gate (never, in the first case)
  return real;
});

const REGIONS = Uint8Array.from([0, 1, 2, 2, 0, 0, 2, 2, 0, 3, 3, 2, 3, 3, 3, 3]);
const COLORS = Uint8Array.from([4, 7, 2, 0]);
const model = (cells = new Uint8Array(16)): BoardModel => ({ puzzleId: 'T1', n: 4, regions: REGIONS, colors: COLORS, cells, regionsDone: 0, patterns: false });

describe('the mouse run before its chunk (audit A-2)', () => {
  let board: BoardView;
  let now = 0;

  beforeEach(() => {
    mountSprite();
    vi.useFakeTimers();
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const input = { tap: vi.fn(), doubleTap: vi.fn(), paint: vi.fn(), bulb: vi.fn(), paw: vi.fn(), mouse: vi.fn() };
    board = createBoardView(model(), input as unknown as BoardInput, { reducedMotion: () => false });
    document.body.appendChild(board.el);
  });

  afterEach(() => {
    board.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const pending = (): number => board.el.querySelectorAll('.fx-pend').length;

  it('a chunk that never lands: the X\'s hide at once, and at mouseRunMs they show and the board is free', async () => {
    board.update(model(Uint8Array.from([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0])));
    board.playEvent({ type: 'MARKED', cells: [0, 6, 13], source: 'mouse' });
    expect(pending()).toBe(3);
    expect(board.el.getAttribute('aria-busy')).toBe('true');
    now = mouseRunMs(3, false) - 1;
    vi.advanceTimersByTime(mouseRunMs(3, false) - 1);
    await Promise.resolve();
    expect(pending()).toBe(3); // still within the run: the chunk may yet land and play it
    now = mouseRunMs(3, false);
    vi.advanceTimersByTime(1);
    expect(pending()).toBe(0);
    expect(board.el.hasAttribute('aria-busy')).toBe(false);
    expect(board.el.querySelector('.board__mouse')).toBeNull();
  });

  it('a chunk that lands after the run (same file, the gate opens now): the X\'s stay shown at once, no sprite, no busy board', async () => {
    board.update(model(Uint8Array.from([0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0])));
    board.playEvent({ type: 'MARKED', cells: [1, 9], source: 'mouse' });
    expect(pending()).toBe(2);
    now = mouseRunMs(2, false) + 400;
    vi.advanceTimersByTime(mouseRunMs(2, false) + 400);
    expect(pending()).toBe(0);
    // the chunk lands late (this releases the first case's load too; its board is gone)
    openGate();
    await loadMouseRun(); // the board's own handler was queued before this one: it has run
    await Promise.resolve();
    expect(board.el.querySelector('.board__mouse')).toBeNull();
    expect(board.el.querySelectorAll('.fx-pop')).toHaveLength(0); // the shown X's do not pop again
    expect(pending()).toBe(0);
    expect(board.el.hasAttribute('aria-busy')).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(board.el.querySelectorAll('.fx-pend, .board__mouse')).toHaveLength(0);
    expect(board.el.hasAttribute('aria-busy')).toBe(false);
  });
});
