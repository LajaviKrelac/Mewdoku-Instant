// Owner: ui-board. Gesture recogniser with synthetic pointer streams (02 §6.1, 04 §11).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../../../src/app/config';
import { CellState, type PaintMode } from '../../../src/game/types';
import { attachGestures } from '../../../src/ui/board/gestures';
import type { BoardGeometry } from '../../../src/ui/board/layout';

const N = 5;
const SLOT = 40;
const PAD = 12;
const GEO: BoardGeometry = { left: 0, top: 0, pad: PAD, slot: SLOT, n: N };

/** Client point at the centre of cell (r, c). */
const at = (r: number, c: number): [number, number] => [PAD + c * SLOT + SLOT / 2, PAD + r * SLOT + SLOT / 2];

interface PtrOpts {
  id?: number;
  primary?: boolean;
  type?: string;
  button?: number;
}

function ptr(type: string, [x, y]: [number, number], o: PtrOpts = {}): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    pointerId: o.id ?? 1,
    isPrimary: o.primary ?? true,
    pointerType: o.type ?? 'touch',
    button: o.button ?? 0,
  });
}

describe('attachGestures', () => {
  let el: HTMLElement;
  let now: number;
  let locked: boolean;
  let cells: Uint8Array;
  let log: string[];
  let detach: () => void;

  const down = (p: [number, number], o?: PtrOpts): boolean => el.dispatchEvent(ptr('pointerdown', p, o));
  const move = (p: [number, number], o?: PtrOpts): boolean => el.dispatchEvent(ptr('pointermove', p, o));
  const up = (p: [number, number], o?: PtrOpts): boolean => el.dispatchEvent(ptr('pointerup', p, o));
  const tapAt = (p: [number, number], o?: PtrOpts): void => {
    down(p, o);
    up(p, o);
  };

  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
    now = 1000;
    locked = false;
    cells = new Uint8Array(N * N);
    log = [];
    detach = attachGestures(
      el,
      {
        tap: (c) => log.push(`tap:${c}`),
        doubleTap: (c) => log.push(`double:${c}`),
        paint: (cs, mode: PaintMode) => log.push(`paint:${mode}:${cs.join(',')}`),
      },
      { geometry: () => GEO, cellState: (c) => cells[c] as CellState, isLocked: () => locked, now: () => now },
    );
  });

  afterEach(() => {
    detach();
    el.remove();
  });

  it('sets touch-action none while attached and restores it on detach', () => {
    expect(el.style.touchAction).toBe('none');
    detach();
    expect(el.style.touchAction).toBe('');
    detach = () => undefined;
  });

  it('emits a tap instantly on pointerup', () => {
    down(at(1, 2));
    expect(log).toEqual([]);
    up(at(1, 2));
    expect(log).toEqual(['tap:7']);
  });

  it('treats small movement (< dragStartPx) as a tap', () => {
    const [x, y] = at(0, 0);
    down([x, y]);
    move([x + 5, y + 3]);
    up([x + 5, y + 3]);
    expect(log).toEqual(['tap:0']);
  });

  it('recognises a double-tap on the same cell inside the window (tap first, then doubleTap)', () => {
    tapAt(at(2, 2));
    now += cfg.input.doubleTapMs;
    tapAt(at(2, 2));
    expect(log).toEqual(['tap:12', 'double:12']);
  });

  it('a second tap after the window is a plain tap', () => {
    tapAt(at(2, 2));
    now += cfg.input.doubleTapMs + 1;
    tapAt(at(2, 2));
    expect(log).toEqual(['tap:12', 'tap:12']);
  });

  it('a tap on a different cell starts a new pending tap', () => {
    tapAt(at(2, 2));
    now += 100;
    tapAt(at(2, 3));
    now += 100;
    tapAt(at(2, 3));
    expect(log).toEqual(['tap:12', 'tap:13', 'double:13']);
  });

  it('locks the cell after a double-tap for cellLockAfterCatMs (no triple-tap undo)', () => {
    tapAt(at(0, 0));
    now += 100;
    tapAt(at(0, 0));
    now += cfg.input.cellLockAfterCatMs - 1;
    tapAt(at(0, 0));
    expect(log).toEqual(['tap:0', 'double:0']);
    now += 1;
    tapAt(at(0, 0));
    expect(log).toEqual(['tap:0', 'double:0', 'tap:0']);
  });

  it('the lock is per cell: other cells still respond', () => {
    tapAt(at(0, 0));
    tapAt(at(0, 0));
    tapAt(at(4, 4));
    expect(log).toEqual(['tap:0', 'double:0', 'tap:24']);
  });

  it('drag paints in mark mode from a non-Mark start cell, start cell first', () => {
    down(at(0, 0));
    move(at(0, 2));
    move(at(0, 3));
    up(at(0, 3));
    expect(log).toEqual(['paint:mark:0,1,2', 'paint:mark:3']);
  });

  it('drag from a Mark erases', () => {
    cells[0] = CellState.Mark;
    down(at(0, 0));
    move(at(1, 0));
    up(at(1, 0));
    expect(log).toEqual(['paint:erase:0,5']);
  });

  it('interpolates fast swipes cell by cell (no skipped cells)', () => {
    down(at(0, 0));
    move(at(4, 4));
    up(at(4, 4));
    expect(log).toEqual(['paint:mark:0,6,12,18,24']);
  });

  it('does not repaint cells already visited in the same drag', () => {
    down(at(0, 0));
    move(at(0, 2));
    move(at(0, 0));
    move(at(0, 3));
    expect(log).toEqual(['paint:mark:0,1,2', 'paint:mark:3']);
  });

  it('a drag cancels the pending double-tap', () => {
    tapAt(at(0, 0));
    down(at(0, 0));
    move(at(0, 2));
    up(at(0, 2));
    now += 50;
    tapAt(at(0, 0));
    expect(log).toEqual(['tap:0', 'paint:mark:0,1,2', 'tap:0']);
  });

  it('ignores non-primary pointers and a second pointer during a stream', () => {
    down(at(0, 0), { id: 1 });
    down(at(3, 3), { id: 2, primary: false });
    move(at(3, 4), { id: 2, primary: false });
    up(at(3, 4), { id: 2, primary: false });
    down(at(2, 2), { id: 3 }); // another primary-looking pointer while one is tracked
    up(at(2, 2), { id: 3 });
    up(at(0, 0), { id: 1 });
    expect(log).toEqual(['tap:0']);
  });

  it('ignores right and middle mouse buttons and suppresses the context menu', () => {
    tapAt(at(1, 1), { type: 'mouse', button: 2 });
    tapAt(at(1, 1), { type: 'mouse', button: 1 });
    expect(log).toEqual([]);
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    tapAt(at(1, 1), { type: 'mouse', button: 0 });
    expect(log).toEqual(['tap:6']);
  });

  it('ignores pointerdown while locked', () => {
    locked = true;
    tapAt(at(1, 1));
    down(at(1, 1));
    move(at(1, 4));
    expect(log).toEqual([]);
  });

  it('drops a stream when the lock turns on mid-gesture', () => {
    down(at(0, 0));
    move(at(0, 1));
    locked = true;
    move(at(0, 3));
    locked = false;
    up(at(0, 3));
    expect(log).toEqual(['paint:mark:0,1']);
    // a lock between down and up swallows the tap too
    down(at(2, 2));
    locked = true;
    up(at(2, 2));
    expect(log).toEqual(['paint:mark:0,1']);
  });

  it('pointercancel ends a gesture without a tap', () => {
    down(at(1, 1));
    el.dispatchEvent(ptr('pointercancel', at(1, 1)));
    up(at(1, 1));
    expect(log).toEqual([]);
  });

  it('hit-tests the gap to the nearest cell and clamps outside points', () => {
    tapAt([PAD + SLOT - 1, PAD + 1]); // right edge of cell 0
    now += 1000;
    tapAt([PAD + SLOT + 1, PAD + 1]); // left edge of cell 1
    now += 1000;
    tapAt([-50, -50]); // outside: clamped to cell 0
    now += 1000;
    tapAt([999, 999]); // clamped to the last cell
    expect(log).toEqual(['tap:0', 'tap:1', 'tap:0', 'tap:24']);
  });

  it('detach removes every listener', () => {
    detach();
    detach = () => undefined;
    tapAt(at(0, 0));
    expect(log).toEqual([]);
  });
});
