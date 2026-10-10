// Owner: G3 (Phase 2d.1)
// The rebuilt O1 (helpers-spec §3.2–§3.5, §3.7, D-2d1-7): the cut-outs, the card and Apply anchored to the
// board card, the dim's holes (one per cut-out tile, rebuilt at dimMs), the hidden close button, closing
// by a dim tap (never in the tutorial), the instant close. jsdom has no layout: rects are given.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { CellState, type HintStep } from '../../../src/engine/types';
import { en } from '../../../src/i18n/en';
import { createHintCard, dimPath, hintCutouts, hintLayout, type HintCardProps } from '../../../src/ui/overlays/hint-card';

const rect = (left: number, top: number, w: number, h: number): DOMRect =>
  ({ left, top, width: w, height: h, right: left + w, bottom: top + h, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});
afterEach(() => {
  vi.useRealTimers();
  document.body.textContent = '';
});

// A 4 × 4 board of ours: a cat on 3 (row 0's last tile), the shadow crosses row 0, column 3 and tile 6.
const shadow: HintStep = {
  kind: 'shadow',
  level: 0,
  focusUnits: [],
  focusCells: [3],
  effectCells: [0, 1, 2, 7, 11, 15, 6],
};
const cells = (): Uint8Array => {
  const c = new Uint8Array(16);
  c[3] = CellState.Cat;
  c[1] = CellState.Mark; // an X already there stays dim
  return c;
};

describe('hintCutouts (helpers-spec §3.2)', () => {
  it('the focus, the Empty effect cells and the placeCell; an existing X is not cut out; ascending, each once', () => {
    expect(hintCutouts(shadow, cells())).toEqual([0, 2, 3, 6, 7, 11, 15]);
    const place: HintStep = { kind: 'single', level: 1, focusUnits: [{ kind: 'row', index: 2 }], focusCells: [9, 10], effectCells: [8, 11], placeCell: 9 };
    expect(hintCutouts(place, new Uint8Array(16))).toEqual([8, 9, 10, 11]);
  });

  it('a mistaken mark: the mark to clear is cut out', () => {
    const c = new Uint8Array(16);
    c[5] = CellState.Mark;
    const step: HintStep = { kind: 'mistaken_mark', level: 0, focusUnits: [], focusCells: [], effectCells: [5] };
    expect(hintCutouts(step, c)).toEqual([5]);
  });
});

describe('the layout (§3.2): the card 5.9 s above the board card, Apply 31 s below it, both centred on it', () => {
  it('at 402 × 874 (s = 1) the card spans to y 244.3 above a board at 250.2; Apply 278.7 × 59.3 at 31 below', () => {
    const L = cfg.layout.hint;
    const board = rect(14, 250.2, 374, 390.8);
    const lay = hintLayout(board, 1, 106);
    expect(lay.card.width).toBeCloseTo(L.cardW, 6);
    expect(lay.card.left + lay.card.width / 2).toBeCloseTo(201, 6);
    expect(lay.card.bottom).toBeCloseTo(250.2 - 5.9, 6);
    expect(lay.card.minH).toBeCloseTo(70.3, 6);
    expect(lay.card.maxH).toBeCloseTo(244.3 - 106, 6);
    expect(lay.apply.top).toBeCloseTo(250.2 + 390.8 + 31, 6);
    expect(lay.apply.left + lay.apply.width / 2).toBeCloseTo(201, 6);
    expect([lay.apply.width, lay.apply.height]).toEqual([L.applyW, L.applyH]);
    // × s: 320 × 568 on FBIG with the band (s 0.712).
    const small = hintLayout(rect(20, 150, 280, 280), 0.712, 70);
    expect(small.card.width).toBeCloseTo(334.4 * 0.712, 6);
    expect(small.apply.top).toBeCloseTo(430 + 31 * 0.712, 6);
    // A card that has no room keeps its min height (its text scrolls inside it).
    expect(hintLayout(rect(0, 100, 300, 300), 1, 95).card.maxH).toBeCloseTo(70.3, 6);
  });

  it('the dim: the viewport with one rounded hole per cut-out tile (even-odd), the tile radius 11 % of its edge', () => {
    const d = dimPath(402, 874, [rect(10, 10, 39, 39), rect(52, 10, 39, 39)]);
    expect(d.startsWith('M0 0H402V874H0Z')).toBe(true);
    expect(d.match(/M/g)).toHaveLength(3);
    expect(d).toContain(`A${Math.round(39 * cfg.layout.game.tileRadiusFraction * 100) / 100} `);
  });
});

describe('the overlay (§3.2–§3.5, §3.7)', () => {
  const props = (over: Partial<HintCardProps> = {}): HintCardProps => ({
    step: shadow,
    n: 4,
    colors: Uint8Array.from([7, 4, 2, 0]),
    patterns: false,
    onApply: vi.fn(),
    onClose: vi.fn(),
    cells: cells(),
    boardRect: () => rect(14, 250, 374, 374),
    cellRect: (c) => rect(20 + (c % 4) * 92, 256 + Math.floor(c / 4) * 92, 88, 88),
    ...over,
  });

  it('[data-instant]; the dim, the card with our sentence, Apply with the first focus; placed on the next frame', () => {
    const card = createHintCard();
    document.body.append(card.el);
    const p = props();
    card.open(p);
    expect(card.el.hasAttribute('data-instant')).toBe(true);
    const dim = card.el.querySelector(':scope > svg.hint-dim') as SVGSVGElement;
    expect(dim.getAttribute('aria-hidden')).toBe('true');
    // Our hint.shadow sentence (unchanged words), left-aligned in the card.
    expect(card.el.querySelector('.hint-card > .hint-card__text')?.textContent).toBe(en['hint.shadow']);
    const apply = card.el.querySelector('button.hint-apply') as HTMLButtonElement;
    expect(apply.textContent).toBe('Apply');
    expect(apply.hasAttribute('data-autofocus')).toBe(true);
    expect(apply.classList.contains('btn--primary')).toBe(false);
    // No icon, no visible title, no visible ×.
    expect(card.el.querySelector('.hint-card__icon')).toBeNull();
    expect(card.el.querySelector('.overlay__title')?.classList.contains('visually-hidden')).toBe(true);
    expect(card.el.querySelector('button.hint-close')?.classList.contains('visually-hidden-focusable')).toBe(true);
    expect(card.el.hasAttribute('data-placed')).toBe(false);
    vi.advanceTimersByTime(20);
    expect(card.el.hasAttribute('data-placed')).toBe(true);
    const panel = card.el.querySelector('.hint-sheet') as HTMLElement;
    expect(panel.style.getPropertyValue('--hc-w')).toBe(`${cfg.layout.hint.cardW}px`);
    expect(parseFloat(panel.style.getPropertyValue('--ha-t'))).toBeCloseTo(250 + 374 + 31, 6);
    // One hole per cut-out tile.
    const path = dim.querySelector('path')?.getAttribute('d') ?? '';
    expect(path.match(/M/g)).toHaveLength(1 + hintCutouts(shadow, cells()).length);
    // audit B12: the 0.90 press shows on touch too, while the finger is down
    apply.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', button: 0 }));
    expect(apply.hasAttribute('data-pressed')).toBe(true);
    apply.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', button: 0 }));
    expect(apply.hasAttribute('data-pressed')).toBe(false);
    apply.click();
    expect(p.onApply).toHaveBeenCalledTimes(1);
    card.close();
    expect(card.el.hidden).toBe(true);
    expect(card.el.hasAttribute('data-placed')).toBe(false);
  });

  it('the holes are measured again when the dim is complete (dimMs): a tile may still have been squishing', () => {
    const card = createHintCard();
    document.body.append(card.el);
    const cellRect = vi.fn((c: number) => rect(20 + (c % 4) * 92, 256 + Math.floor(c / 4) * 92, 88, 88));
    card.open(props({ cellRect }));
    vi.advanceTimersByTime(20);
    const first = cellRect.mock.calls.length;
    expect(first).toBe(hintCutouts(shadow, cells()).length);
    vi.advanceTimersByTime(cfg.fx.hint.dimMs);
    expect(cellRect.mock.calls.length).toBe(2 * first);
  });

  it('a dim tap, Esc or the close button close it; in the tutorial (closable: false) nothing does', () => {
    const card = createHintCard();
    document.body.append(card.el);
    const p = props();
    card.open(p);
    (card.el.querySelector('.overlay__scrim') as HTMLElement).click();
    expect(card.dismiss()).toBe(true);
    (card.el.querySelector('button.hint-close') as HTMLElement).click();
    expect(p.onClose).toHaveBeenCalledTimes(3);
    const t = props({ closable: false });
    card.update(t);
    (card.el.querySelector('.overlay__scrim') as HTMLElement).click();
    expect(card.dismiss()).toBe(false);
    expect(t.onClose).not.toHaveBeenCalled();
    expect((card.el.querySelector('button.hint-close') as HTMLElement).hidden).toBe(true);
  });

  it('the card may grow up to the top bar (its text scrolls past that): --hc-max from the bar\'s bottom', () => {
    const screen = document.createElement('div');
    screen.className = 'screen--game';
    screen.style.setProperty('--s', '0.8');
    const bar = document.createElement('header');
    bar.className = 'top-bar';
    bar.getBoundingClientRect = () => rect(0, 0, 320, 60);
    screen.append(bar);
    document.body.append(screen);
    const card = createHintCard();
    document.body.append(card.el);
    card.open(props({ boardRect: () => rect(20, 200, 280, 280) }));
    vi.advanceTimersByTime(20);
    const panel = card.el.querySelector('.hint-sheet') as HTMLElement;
    expect(panel.style.getPropertyValue('--hs')).toBe('0.8');
    expect(parseFloat(panel.style.getPropertyValue('--hc-max'))).toBeCloseTo(200 - 5.9 * 0.8 - 60, 6);
  });
});
