// Owner: B (Phase 2b; was ui-shell). O8 coach (non-modal), O9 toast layer, O10 rotate notice.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { coachText, createCoach, LIVE_SETTLE_MS, placeCard, roundSpot, type CoachProps } from '../../../src/ui/overlays/coach';
import { mountRotateNotice, shouldShowRotateNotice } from '../../../src/ui/overlays/rotate-notice';
import { createToastLayer } from '../../../src/ui/overlays/toast';

const q = <E extends Element = HTMLElement>(root: ParentNode, sel: string): E => {
  const el = root.querySelector<E>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};

beforeEach(() => {
  vi.useFakeTimers();
  document.body.textContent = '';
});
afterEach(() => vi.useRealTimers());

const rect = (left: number, top: number, w: number, h: number): DOMRect => DOMRect.fromRect({ x: left, y: top, width: w, height: h });

describe('O8 tutorial coach', () => {
  const props = (over: Partial<CoachProps> = {}): CoachProps => ({
    step: 1,
    hand: 'double_tap',
    showGotIt: false,
    colorParam: 7,
    targetRects: () => [rect(150, 250, 70, 70)],
    onGotIt: vi.fn(),
    ...over,
  });

  it('is non-modal, names the colour and cuts one hole per target', () => {
    const coach = createCoach();
    document.body.append(coach.el);
    expect(coach.modal).toBe(false);
    coach.open(props());
    expect(coach.el.hidden).toBe(false);
    // A11Y-11: the live region appears empty first; the text follows once it is in the a11y tree.
    expect(q(coach.el, '.coach__text').textContent).toBe('');
    expect(q(coach.el, '.coach__card').hasAttribute('data-pending')).toBe(true);
    vi.advanceTimersByTime(LIVE_SETTLE_MS);
    expect(q(coach.el, '.coach__card').hasAttribute('data-pending')).toBe(false);
    expect(q(coach.el, '.coach__text').textContent).toBe(
      'Every colour hides exactly one cat. This Lavender colour is a single tile — double-tap it.',
    );
    // UX-15: "double-tap" never breaks at its hyphen (the text stays the same for screen readers).
    expect(Array.from(coach.el.querySelectorAll('.coach__text .nowrap')).map((e) => e.textContent)).toContain('double-tap');
    expect(coach.el.querySelectorAll('mask rect[fill="black"]')).toHaveLength(1);
    expect(coach.el.dataset.hand).toBe('double_tap');
    expect(q(coach.el, '.coach__hand').hidden).toBe(false);
    expect(q(coach.el, '.coach__hand').style.left).toBe(`${150 + 35 - 13}px`);
    expect(q(coach.el, '.coach__gotit').hidden).toBe(true);
    expect(coach.el.querySelectorAll('.coach__ring')).toHaveLength(0); // cell outlines come from the board
    expect(coach.dismiss()).toBe(false);
  });

  it('step 2 shows Got it (focused), no hand; step 3 swipes between the first and last target', () => {
    const coach = createCoach();
    document.body.append(coach.el);
    const p = props({ step: 2, hand: 'none', showGotIt: true, colorParam: null, targetRects: () => [rect(0, 0, 10, 10), rect(20, 0, 10, 10)] });
    coach.open(p);
    vi.advanceTimersByTime(LIVE_SETTLE_MS);
    expect(q(coach.el, '.coach__text').textContent).toBe('A cat claims its whole row and column.');
    const gotIt = q(coach.el, '.coach__gotit');
    expect(gotIt.hidden).toBe(false);
    expect(document.activeElement).toBe(gotIt);
    expect(q(coach.el, '.coach__hand').hidden).toBe(true);
    gotIt.click();
    expect(p.onGotIt).toHaveBeenCalledTimes(1);

    coach.update(props({ step: 3, hand: 'swipe', colorParam: null, targetRects: () => [rect(100, 300, 50, 50), rect(150, 300, 50, 50), rect(200, 300, 50, 50)] }));
    const hand = q(coach.el, '.coach__hand');
    expect(hand.style.getPropertyValue('--dx')).toBe('100px');
    expect(hand.style.getPropertyValue('--dy')).toBe('0px');
    expect(coach.el.querySelectorAll('mask rect[fill="black"]')).toHaveLength(3);
  });

  it('rings the bulb in step 5', () => {
    const coach = createCoach();
    document.body.append(coach.el);
    coach.open(props({ step: 5, hand: 'tap', colorParam: null, targetRects: () => [rect(120, 760, 64, 64)] }));
    vi.advanceTimersByTime(LIVE_SETTLE_MS);
    expect(q(coach.el, '.coach__text').textContent).toBe('Stuck? Tap the bulb for a hint.');
    expect(coach.el.querySelectorAll('.coach__ring')).toHaveLength(1);
    coach.close();
    expect(coach.el.hidden).toBe(true);
  });

  it('places the card at the bottom, or above / below targets that would be covered', () => {
    expect(placeCard([rect(0, 200, 50, 50)], 120, 844)).toBe(844 - 12 - 120);
    expect(placeCard([], 120, 844)).toBe(712);
    // A bottom-row target: the card goes above it.
    expect(placeCard([rect(0, 650, 50, 60)], 120, 844)).toBe(650 - 16 - 120);
    // A target near the top and the bottom both: no room above, so below (clamped to the bottom slot).
    expect(placeCard([rect(0, 40, 50, 760)], 120, 844)).toBe(712);
    expect(coachText(6, null)).toBe('Place the last cat.');
  });
});

describe('O9 toast layer', () => {
  it('shows one toast at a time and hides it after fx.toastMs', () => {
    const layer = createToastLayer();
    document.body.append(layer.el);
    expect(layer.el.getAttribute('aria-live')).toBe('polite');
    layer.show('No videos right now — try again soon.');
    expect(layer.el.querySelectorAll('.toast')).toHaveLength(1);
    layer.show('Hint unavailable');
    expect(layer.el.querySelectorAll('.toast')).toHaveLength(1);
    expect(layer.el.textContent).toBe('Hint unavailable');
    vi.advanceTimersByTime(cfg.fx.toastMs - 1);
    expect(layer.el.querySelectorAll('.toast')).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(layer.el.querySelectorAll('.toast')).toHaveLength(0);
    layer.show('x', { durationMs: 100 });
    layer.clear();
    expect(layer.el.textContent).toBe('');
    layer.destroy();
    expect(layer.el.isConnected).toBe(false);
  });
});

describe('O10 rotate notice', () => {
  it('shows only on short landscape viewports', () => {
    expect(shouldShowRotateNotice(844, 390)).toBe(true);
    expect(shouldShowRotateNotice(390, 844)).toBe(false);
    expect(shouldShowRotateNotice(1280, 800)).toBe(false);
    expect(shouldShowRotateNotice(480, 480)).toBe(false);
  });

  it('toggles itself on resize', () => {
    const size = { w: 390, h: 844 };
    const listeners = new Map<string, () => void>();
    const fakeWin = {
      get innerWidth() {
        return size.w;
      },
      get innerHeight() {
        return size.h;
      },
      visualViewport: null,
      addEventListener: (type: string, fn: () => void) => void listeners.set(type, fn),
      removeEventListener: (type: string) => void listeners.delete(type),
    } as unknown as Window;
    const notice = mountRotateNotice(document.body, fakeWin);
    expect(notice.el.hidden).toBe(true);
    expect(notice.el.textContent).toContain('Please rotate your device');
    size.w = 844;
    size.h = 390;
    listeners.get('resize')?.();
    expect(notice.el.hidden).toBe(false);
    notice.destroy();
    expect(listeners.size).toBe(0);
    expect(notice.el.isConnected).toBe(false);
  });
});
