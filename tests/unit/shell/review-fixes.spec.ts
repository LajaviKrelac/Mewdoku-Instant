// Owner: B (Phase 2b; was ui-shell). Phase 2 review fixes in the overlays: tutorial hint card (SPEC-04), hint location
// for screen readers (A11Y-7), coach placement and ring (UX-06, UX-11), live regions created before
// their text (A11Y-11), toast placement (UX-03), loading veil over an overlay (UX-10), line breaks
// (UX-15), keyboard copy (A11Y-8), the rotate notice on desktops and under pinch-zoom (UX-02, A11Y-1,
// A11Y-2), the third-party licence credit (LEGAL-3).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/ui/art/illustrations', () => ({
  illustration: (kind: string) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('data-illustration', kind);
    return svg;
  },
}));

import type { HintStep } from '../../../src/engine/types';
import { createCoach, placeCard, roundSpot, type CoachProps } from '../../../src/ui/overlays/coach';
import { createDailyResult } from '../../../src/ui/overlays/daily-result';
import { createHintCard, hintLocation, type HintCardProps } from '../../../src/ui/overlays/hint-card';
import { createHowToPlay } from '../../../src/ui/overlays/how-to-play';
import { createLoadingIndicator } from '../../../src/ui/overlays/loading-indicator';
import { createOverlayShell, setTextKeepTogether } from '../../../src/ui/overlays/overlay-base';
import { isPhone, mountRotateNotice, shouldShowRotateNotice } from '../../../src/ui/overlays/rotate-notice';
import { createSettingsModal } from '../../../src/ui/overlays/settings-modal';
import { createToastLayer, TOAST_SETTLE_MS } from '../../../src/ui/overlays/toast';

const q = <E extends Element = HTMLElement>(root: ParentNode, sel: string): E => {
  const el = root.querySelector<E>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};
const rect = (left: number, top: number, w: number, h: number): DOMRect => DOMRect.fromRect({ x: left, y: top, width: w, height: h });

beforeEach(() => {
  vi.useFakeTimers();
  document.body.textContent = '';
});
afterEach(() => vi.useRealTimers());

/** An open modal overlay in the document, as the router would have it. */
function openModal(): HTMLElement {
  const shell = createOverlayShell({ id: 'fail', scrim: 'dark', panel: 'stage' });
  document.body.append(shell.el);
  shell.show();
  return shell.el;
}

describe('O1 hint card in the tutorial (SPEC-04)', () => {
  const step: HintStep = { kind: 'single', level: 1, focusUnits: [{ kind: 'row', index: 2 }], focusCells: [9], effectCells: [], placeCell: 9 };
  const props = (over: Partial<HintCardProps> = {}): HintCardProps => ({
    step,
    n: 4,
    colors: Uint8Array.from([7, 4, 2, 0]),
    patterns: false,
    onApply: vi.fn(),
    onClose: vi.fn(),
    ...over,
  });

  it('closable: false hides the close button and lets Esc / dim taps through', () => {
    const card = createHintCard();
    document.body.append(card.el);
    const p = props({ closable: false });
    card.open(p);
    expect(q(card.el, '.overlay__close').hidden).toBe(true);
    expect(card.dismiss()).toBe(false); // Esc is not swallowed
    q(card.el, '.overlay__scrim').click();
    expect(p.onClose).not.toHaveBeenCalled();
    q(card.el, '.hint-apply').click();
    expect(p.onApply).toHaveBeenCalledTimes(1);
    card.update(props({ closable: true }));
    expect(q(card.el, '.overlay__close').hidden).toBe(false);
  });

  it('is not closable by default while the tutorial coach is up (step 5 accepts Apply only)', () => {
    const coach = createCoach();
    document.body.append(coach.el);
    coach.open({ step: 5, hand: 'tap', showGotIt: false, colorParam: null, targetRects: () => [], onGotIt: vi.fn() });
    const card = createHintCard();
    document.body.append(card.el);
    const p = props();
    card.open(p);
    expect(q(card.el, '.overlay__close').hidden).toBe(true);
    expect(card.dismiss()).toBe(false);
    coach.close();
    card.update(p);
    expect(q(card.el, '.overlay__close').hidden).toBe(false);
    expect(card.dismiss()).toBe(true);
  });
});

describe('hint location for screen readers (A11Y-7)', () => {
  const ctx = { n: 4, colors: Uint8Array.from([7, 4, 2, 0]), patterns: false };
  const regions = Uint8Array.from([0, 0, 1, 1, 0, 2, 1, 1, 2, 2, 3, 1, 2, 3, 3, 3]);

  it('names the row, column and (when known) colour of the tile the hint points at', () => {
    const single: HintStep = { kind: 'single', level: 1, focusUnits: [{ kind: 'row', index: 2 }], focusCells: [9], effectCells: [], placeCell: 9 };
    expect(hintLocation(single, ctx)).toBe('Highlighted tile: row 3, column 2.');
    expect(hintLocation(single, { ...ctx, regions })).toBe('Highlighted tile: row 3, column 2, Mustard.');
    const byColour: HintStep = { kind: 'single', level: 1, focusUnits: [{ kind: 'region', index: 1 }], focusCells: [6], effectCells: [], placeCell: 6 };
    expect(hintLocation(byColour, ctx)).toBe('Highlighted tile: row 2, column 3, Denim.');
    const trial: HintStep = { kind: 'trial', level: 4, focusUnits: [{ kind: 'region', index: 3 }], focusCells: [0], effectCells: [0] };
    expect(hintLocation(trial, { ...ctx, regions, patterns: true })).toBe('Highlighted tile: row 1, column 1, Violet (bar).');
    const mistaken: HintStep = { kind: 'mistaken_mark', level: 0, focusUnits: [], focusCells: [15], effectCells: [15] };
    expect(hintLocation(mistaken, ctx)).toBe('Highlighted tile: row 4, column 4.');
    // Steps about whole units name no single tile.
    const pigeon: HintStep = { kind: 'pigeonhole', level: 3, focusUnits: [{ kind: 'row', index: 0 }, { kind: 'region', index: 1 }], focusCells: [1], effectCells: [2], k: 1 };
    expect(hintLocation(pigeon, ctx)).toBeNull();
  });

  it('adds it to the hint dialog description without changing the visible sentence', () => {
    const card = createHintCard();
    document.body.append(card.el);
    const step: HintStep = { kind: 'single', level: 1, focusUnits: [{ kind: 'row', index: 2 }], focusCells: [9], effectCells: [], placeCell: 9 };
    card.open({ step, ...ctx, onApply: vi.fn(), onClose: vi.fn() });
    expect(q(card.el, '.hint-card__text').textContent).toBe('Row 3 has just one open tile left, so its cat goes here.');
    const dialog = q(card.el, '[role="dialog"]');
    // Phase 2d.1: the description is the sentence and the tile line (two ids, in this order).
    const ids = (dialog.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toHaveLength(2);
    const desc = ids.map((id) => document.getElementById(id)?.textContent ?? '').join('');
    expect(desc).toContain('Row 3 has just one open tile left');
    expect(desc).toContain('Highlighted tile: row 3, column 2.');
    expect(q(card.el, '.hint-card__where').classList.contains('visually-hidden')).toBe(true);
  });
});

describe('O8 coach placement (UX-06, UX-11)', () => {
  it('without soft obstacles it keeps the old slots', () => {
    expect(placeCard([rect(0, 200, 50, 50)], 120, 844)).toBe(712);
    expect(placeCard([rect(0, 650, 50, 60)], 120, 844)).toBe(514);
  });

  it('prefers a slot that covers neither the board nor the top bar (320 × 568 step 1, 1280 × 800 step 5)', () => {
    const topBar = { left: 0, right: 320, top: 0, bottom: 56, weight: 3 };
    const board = { left: 16, right: 304, top: 176, bottom: 464, weight: 3 };
    // Step 1 at 320 × 568: a cell target in the board; an 85 px card fits below the board.
    const y1 = placeCard([rect(110, 240, 60, 60)], 85, 568, [topBar, board]);
    expect(y1).toBeGreaterThanOrEqual(464);
    expect(y1 + 85).toBeLessThanOrEqual(568);
    // Step 5 at 1280 × 800: the bulb's spotlight at the bottom; the card goes between the top bar and
    // the board instead of over the board's last row.
    const bar = { left: 0, right: 1280, top: 0, bottom: 56, weight: 3 };
    const big = { left: 400, right: 880, top: 202, bottom: 682, weight: 3 };
    const y5 = placeCard([{ left: 554, right: 618, top: 684, bottom: 792 }], 57, 800, [bar, big]);
    expect(y5).toBeGreaterThanOrEqual(56);
    expect(y5 + 57).toBeLessThanOrEqual(202);
  });

  it('keeps the bulb ring on screen and the bulb inside it', () => {
    // 390 × 844: the bulb at the bottom (its ring used to end at 850).
    const bulb = rect(91, 764, 64, 64);
    const s = roundSpot(bulb, 844);
    expect(s.cy + s.rad).toBeLessThanOrEqual(844 - 8);
    expect(s.cy - s.rad).toBeLessThanOrEqual(bulb.top - 4);
    expect(s.cy + s.rad).toBeGreaterThanOrEqual(bulb.bottom + 4);
    // Far from the edge: the full spotlight, centred.
    expect(roundSpot(rect(100, 300, 64, 64), 844)).toEqual({ cx: 132, cy: 332, rad: 32 + 4 + 18 });
  });

  it('points the hand at the bulb\'s lower right, so the bulb glyph stays visible', () => {
    const coach = createCoach();
    document.body.append(coach.el);
    coach.open({ step: 5, hand: 'tap', showGotIt: false, colorParam: null, targetRects: () => [rect(100, 300, 64, 64)], softRects: () => [], onGotIt: vi.fn() });
    const hand = q(coach.el, '.coach__hand');
    // fingertip x = 132 + 0.28 × 64 = 149.92; the drawing's fingertip is 13 px in.
    expect(parseFloat(hand.style.left)).toBeCloseTo(149.92 - 13, 1);
  });

  it('only a coach that was hidden delays its text; later steps update at once', () => {
    const coach = createCoach();
    document.body.append(coach.el);
    const base: CoachProps = { step: 1, hand: 'double_tap', showGotIt: false, colorParam: 7, targetRects: () => [], softRects: () => [], onGotIt: vi.fn() };
    coach.open(base);
    expect(q(coach.el, '.coach__text').textContent).toBe('');
    vi.advanceTimersByTime(150);
    expect(q(coach.el, '.coach__text').textContent).toContain('Violet');
    // The router calls open() again for each step while the coach is up.
    coach.open({ ...base, step: 6, hand: 'tap', colorParam: null });
    expect(q(coach.el, '.coach__text').textContent).toBe('Place the last cat.');
  });
});

describe('O9 toast (A11Y-11, UX-03, UX-15)', () => {
  it('the first toast fills the new live region a moment after it appears; later ones at once', () => {
    const layer = createToastLayer();
    document.body.append(layer.el);
    layer.show('Solve level 20 to open the daily puzzle.');
    const first = q(layer.el, '.toast');
    expect(first.textContent).toBe('');
    vi.advanceTimersByTime(TOAST_SETTLE_MS);
    expect(first.textContent).toBe('Solve level 20 to open the daily puzzle.');
    layer.show('Hint unavailable');
    expect(layer.el.textContent).toBe('Hint unavailable');
  });

  it('moves below the centred card while a modal overlay is open', () => {
    const layer = createToastLayer();
    document.body.append(layer.el);
    layer.show('a');
    expect(layer.el.dataset.pos).toBe('bottom');
    const modal = openModal();
    layer.show('No videos right now — try again soon.');
    expect(layer.el.dataset.pos).toBe('modal');
    // The dash stays with the word before it; the text itself is unchanged.
    expect(layer.el.textContent).toBe('No videos right now — try again soon.');
    expect(q(layer.el, '.nowrap').textContent).toBe('now —');
    modal.hidden = true;
    layer.show('b');
    expect(layer.el.dataset.pos).toBe('bottom');
  });
});

describe('loading indicator over an overlay (UX-10)', () => {
  it('continues the open overlay\'s dark stage instead of a cream veil', () => {
    const loading = createLoadingIndicator();
    document.body.append(loading.el);
    loading.show();
    expect(loading.el.dataset.over).toBe('false');
    loading.hide();
    openModal();
    loading.show();
    expect(loading.el.dataset.over).toBe('true');
  });
});

describe('line breaks (UX-15)', () => {
  it('keeps dates, hyphenated words and "word ·" together without changing the text', () => {
    const p = document.createElement('p');
    setTextKeepTogether(p, 'Daily puzzle · Wed 7 Oct', ['Wed 7 Oct']);
    expect(p.textContent).toBe('Daily puzzle · Wed 7 Oct');
    expect(Array.from(p.querySelectorAll('.nowrap')).map((e) => e.textContent)).toEqual(['puzzle ·', 'Wed 7 Oct']);
    setTextKeepTogether(p, 'Row 2 has one open tile left. Double-tap it.');
    expect(Array.from(p.querySelectorAll('.nowrap')).map((e) => e.textContent)).toEqual(['Double-tap']);
    setTextKeepTogether(p, 'plain');
    expect(p.innerHTML).toBe('plain');
  });

  it('the daily result title keeps its date on one line', () => {
    const dr = createDailyResult();
    document.body.append(dr.el);
    dr.open({ dateKey: '2026-10-07', ms: 252_000, mistakes: 1, hints: 0, kitties: 0, nextPuzzleAt: Date.now() + 3_600_000, now: () => Date.now(), onDone: vi.fn() });
    const title = q(dr.el, '.overlay__title');
    expect(title.textContent).toBe('Daily puzzle · Wed 7 Oct');
    expect(Array.from(title.querySelectorAll('.nowrap')).map((e) => e.textContent)).toContain('Wed 7 Oct');
    dr.destroy();
  });

  it('says the next puzzle is ready once its time has come, instead of a 23 h countdown (logic-5, SPEC-03)', () => {
    let now = 1_000_000;
    const dr = createDailyResult();
    document.body.append(dr.el);
    const props = { dateKey: '2026-10-07', ms: 252_000, mistakes: 0, hints: 0, kitties: 0, now: () => now, onDone: vi.fn() };
    // Solved after midnight: nextPuzzleAt already passed.
    dr.open({ ...props, nextPuzzleAt: now - 120_000 });
    expect(q(dr.el, '.daily-result__next').textContent).toBe('A new puzzle is ready');
    // Exactly at the due time it is ready too.
    dr.update({ ...props, nextPuzzleAt: now });
    expect(q(dr.el, '.daily-result__next').textContent).toBe('A new puzzle is ready');
    // Before midnight: the countdown, which flips to "ready" while the overlay stays open.
    dr.update({ ...props, nextPuzzleAt: now + 90_000 });
    expect(q(dr.el, '.daily-result__next').textContent).toMatch(/^Next puzzle in /);
    now += 90_000;
    vi.advanceTimersByTime(1000);
    expect(q(dr.el, '.daily-result__next').textContent).toBe('A new puzzle is ready');
    dr.destroy();
  });
});

describe('How to play: keyboard controls (A11Y-8)', () => {
  it('lists the keys, H and K included', () => {
    const howto = createHowToPlay();
    document.body.append(howto.el);
    howto.open({ showSkip: false, showReplay: false, onSkip: vi.fn(), onReplay: vi.fn(), onClose: vi.fn() });
    const keys = q(howto.el, '.howto__keys').textContent ?? '';
    for (const word of ['arrow keys', 'Space', 'Enter', 'H ', 'K ']) expect(keys).toContain(word);
  });
});

describe('About: third-party code credit (LEGAL-3)', () => {
  it('credits Vite under the MIT License with a link to the bundled notice', () => {
    const settings = createSettingsModal();
    document.body.append(settings.el);
    settings.open({
      settings: { sound: true, haptics: true, patterns: false, reduceMotion: 'system' },
      showVibration: true,
      version: '1.0.0',
      onChange: vi.fn(),
      onHowToPlay: vi.fn(),
      onClose: vi.fn(),
    });
    const code = q(settings.el, '.about__code');
    expect(code.textContent).toContain('Vite');
    expect(code.textContent).toContain('MIT License');
    expect(q<HTMLAnchorElement>(code, 'a').getAttribute('href')).toMatch(/vite-MIT.*\.txt/);
  });
});

describe('O10 rotate notice: landscape phones only (UX-02, A11Y-1, A11Y-2)', () => {
  type FakeWin = Window & { listeners: Map<string, () => void> };
  const fakeWin = (o: { w: number; h: number; coarse?: boolean; screen?: [number, number]; vv?: { width: number; height: number; scale: number } }): FakeWin => {
    const listeners = new Map<string, () => void>();
    return {
      listeners,
      innerWidth: o.w,
      innerHeight: o.h,
      visualViewport: o.vv ? { ...o.vv, addEventListener: () => undefined, removeEventListener: () => undefined } : null,
      matchMedia: o.coarse === undefined ? undefined : (qy: string) => ({ matches: qy === '(pointer: coarse)' ? o.coarse : false }),
      screen: o.screen ? { width: o.screen[0], height: o.screen[1] } : undefined,
      addEventListener: (type: string, fn: () => void) => void listeners.set(type, fn),
      removeEventListener: (type: string) => void listeners.delete(type),
    } as unknown as FakeWin;
  };

  it('is never shown on a desktop window, however short (150-200 % zoom)', () => {
    expect(shouldShowRotateNotice(640, 400, false)).toBe(false);
    expect(isPhone(fakeWin({ w: 640, h: 400, coarse: false, screen: [1280, 800] }))).toBe(false);
    const notice = mountRotateNotice(document.body, fakeWin({ w: 640, h: 360, coarse: false, screen: [1280, 720] }));
    expect(notice.el.hidden).toBe(true);
    notice.destroy();
  });

  it('is shown on a landscape phone, not on a landscape tablet', () => {
    expect(isPhone(fakeWin({ w: 844, h: 390, coarse: true, screen: [844, 390] }))).toBe(true);
    const phone = mountRotateNotice(document.body, fakeWin({ w: 844, h: 390, coarse: true, screen: [844, 390] }));
    expect(phone.el.hidden).toBe(false);
    phone.destroy();
    expect(isPhone(fakeWin({ w: 1024, h: 460, coarse: true, screen: [1024, 768] }))).toBe(false);
  });

  it('ignores pinch-zoom: the visual viewport is measured at page scale 1', () => {
    // A tablet in landscape pinched to 2×: the visual viewport is 512 × 384, the page is 1024 × 768.
    const notice = mountRotateNotice(document.body, fakeWin({ w: 1024, h: 768, coarse: true, screen: [375, 667], vv: { width: 512, height: 384, scale: 2 } }));
    expect(notice.el.hidden).toBe(true);
    notice.destroy();
  });
});
