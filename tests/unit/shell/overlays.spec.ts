// Owner: B (Phase 2b; was ui-shell). O1/O3/O4/O6/O7: open/close, Esc (dismiss), delayed and busy buttons, and the
// router-style focus trap + inert background working with the overlays' markup (02 §18).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/ui/art/illustrations', () => ({
  illustration: (kind: string, opts?: { label?: string }) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('data-illustration', kind);
    if (opts?.label) svg.setAttribute('aria-label', opts.label);
    return svg;
  },
}));

import type { HintStep } from '../../../src/engine/types';
import { focusableElements, setInert, trapFocus } from '../../../src/ui/a11y/focus-trap';
import { createDailyResult } from '../../../src/ui/overlays/daily-result';
import { createFailOverlay, type FailOverlayProps } from '../../../src/ui/overlays/fail-overlay';
import { createHintCard, sheetPlacement } from '../../../src/ui/overlays/hint-card';
import { createHowToPlay } from '../../../src/ui/overlays/how-to-play';
import { createWinOverlay, type WinOverlayProps } from '../../../src/ui/overlays/win-overlay';

const q = <E extends Element = HTMLElement>(root: ParentNode, sel: string): E => {
  const el = root.querySelector<E>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};
const press = (el: Element): void => void (el as HTMLElement).click();
const tab = (shift = false): void => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true }));
};

beforeEach(() => {
  vi.useFakeTimers();
  document.body.textContent = '';
});
afterEach(() => {
  vi.useRealTimers();
});

const step: HintStep = { kind: 'single', level: 1, focusUnits: [{ kind: 'row', index: 2 }], focusCells: [9], effectCells: [], placeCell: 9 };

describe('O1 hint card', () => {
  it('renders the explanation, applies and closes via ×, Esc and a scrim tap', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    const card = createHintCard();
    document.body.append(card.el);
    expect(card.modal).toBe(true);
    expect(card.el.hidden).toBe(true);
    card.open({ step, n: 4, colors: Uint8Array.from([7, 4, 2, 0]), patterns: false, onApply, onClose });
    expect(card.el.hidden).toBe(false);
    expect(q(card.el, '.hint-card__text').textContent).toBe('Row 3 has just one open tile left, so its cat goes here.');
    const dialog = q(card.el, '[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-describedby') ?? '')?.textContent).toContain('Row 3');

    press(q(card.el, '.hint-card__apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
    press(q(card.el, '.overlay__close'));
    press(q(card.el, '.overlay__scrim'));
    expect(card.dismiss()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(card.el.hidden).toBe(false); // overlays never close themselves

    card.update({ step: { ...step, kind: 'mistaken_mark', focusUnits: [] }, n: 4, colors: Uint8Array.from([7, 4, 2, 0]), patterns: false, onApply, onClose });
    expect(q(card.el, '.hint-card__text').textContent).toBe("This X rules out a tile that can't be ruled out yet.");
    card.close();
    expect(card.el.hidden).toBe(true);
    expect(card.dismiss()).toBe(false);
  });
});

describe('O1 sheet placement', () => {
  it('stays at the bottom unless it would cover the board and the top slot covers it less', () => {
    // 390×844: the sheet (top 660) clears the board (bottom 645).
    expect(sheetPlacement({ top: 660, height: 172 }, { top: 290, bottom: 645 })).toBe('bottom');
    expect(sheetPlacement({ top: 660, height: 172 }, null)).toBe('bottom');
    // 320×568: the bottom sheet would cover the board's lower rows; the top slot clears it.
    expect(sheetPlacement({ top: 402, height: 150 }, { top: 176, bottom: 470 })).toBe('top');
    // The top slot respects the safe area, and is only used when it covers less.
    expect(sheetPlacement({ top: 402, height: 150 }, { top: 150, bottom: 410 }, 40)).toBe('bottom');
  });

  it('marks the overlay with its placement and re-checks via avoidRect', () => {
    const card = createHintCard();
    document.body.append(card.el);
    const avoid = vi.fn(() => null);
    card.open({ step, n: 4, colors: Uint8Array.from([7, 4, 2, 0]), patterns: false, onApply: vi.fn(), onClose: vi.fn(), avoidRect: avoid });
    expect(card.el.dataset.placement).toBe('bottom');
    // Measured on the next frame, after every DOM write of the open (one style recalc, RP-3).
    expect(avoid).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(avoid).toHaveBeenCalledTimes(1);
    expect(card.el.dataset.placement).toBe('bottom');
    card.close();
    vi.advanceTimersByTime(20);
    expect(avoid).toHaveBeenCalledTimes(1);
  });
});

describe('O3 win overlay', () => {
  const props = (over: Partial<WinOverlayProps> = {}): WinOverlayProps => ({
    variant: 'level',
    level: 37,
    nextLevel: 38,
    praise: 0,
    buttonDelayMs: 1000,
    reducedMotion: true,
    onNext: vi.fn(),
    onHome: vi.fn(),
    ...over,
  });

  it('shows praise and the level, enables Next after the delay, Home at once', () => {
    const win = createWinOverlay();
    document.body.append(win.el);
    const p = props();
    win.open(p);
    expect(q(win.el, '.win__praise').textContent).toBe('Clever cat!');
    expect(q(win.el, '.win__sub').textContent).toBe('Level 37 complete');
    const next = q(win.el, '.win__next');
    expect(next.textContent).toContain('Next: Level 38');
    expect(next.getAttribute('aria-disabled')).toBe('true');
    press(next);
    expect(p.onNext).not.toHaveBeenCalled();
    press(q(win.el, '.win__home'));
    expect(p.onHome).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(999);
    expect(next.getAttribute('aria-disabled')).toBe('true');
    vi.advanceTimersByTime(1);
    expect(next.hasAttribute('aria-disabled')).toBe(false);
    press(next);
    expect(p.onNext).toHaveBeenCalledTimes(1);
    expect(win.dismiss()).toBe(false);
    expect(q(win.el, '.win__reward').hidden).toBe(true); // Phase 3 reward slot, empty
  });

  it('runs confetti unless reduced motion, and re-gates Next on every open', () => {
    const win = createWinOverlay();
    document.body.append(win.el);
    win.open(props({ reducedMotion: false }));
    expect(win.el.querySelectorAll('.confetti i').length).toBeGreaterThan(0);
    win.close();
    expect(win.el.querySelector('.confetti')).toBeNull();
    win.open(props({ reducedMotion: true, praise: 3 }));
    expect(win.el.querySelector('.confetti')).toBeNull();
    expect(q(win.el, '.win__praise').textContent).toBe('Nailed it!');
    expect(q(win.el, '.win__next').getAttribute('aria-disabled')).toBe('true');
  });

  it('tutorial variants: Play Level 2 only, or Home only on a replay', () => {
    const win = createWinOverlay();
    document.body.append(win.el);
    win.open(props({ variant: 'tutorial', level: 1, nextLevel: 2 }));
    expect(q(win.el, '.win__praise').textContent).toBe("You're ready!");
    expect(q(win.el, '.win__next').textContent).toContain('Play Level 2');
    expect(q(win.el, '.win__home').hidden).toBe(true);
    win.update(props({ variant: 'tutorial_replay', level: 1, nextLevel: 2 }));
    expect(q(win.el, '.win__next').hidden).toBe(true);
    expect(q(win.el, '.win__home').hidden).toBe(false);
    expect(q(win.el, '.win__home').classList.contains('btn--primary')).toBe(true);
  });
});

describe('O4 fail overlay', () => {
  const props = (over: Partial<FailOverlayProps> = {}): FailOverlayProps => ({
    continueOffer: 'video',
    buttonDelayMs: 600,
    busy: false,
    onContinue: vi.fn(),
    onRetry: vi.fn(),
    onHome: vi.fn(),
    ...over,
  });

  it('gates every button for the delay, then while busy', () => {
    const fail = createFailOverlay();
    document.body.append(fail.el);
    const p = props();
    fail.open(p);
    const buttons = ['.fail__continue', '.fail__retry', '.fail__home'].map((s) => q(fail.el, s));
    for (const b of buttons) press(b);
    expect(p.onContinue).not.toHaveBeenCalled();
    expect(p.onRetry).not.toHaveBeenCalled();
    expect(p.onHome).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    for (const b of buttons) press(b);
    expect(p.onContinue).toHaveBeenCalledTimes(1);
    expect(p.onRetry).toHaveBeenCalledTimes(1);
    expect(p.onHome).toHaveBeenCalledTimes(1);

    fail.update({ ...p, busy: true });
    for (const b of buttons) expect(b.getAttribute('aria-disabled')).toBe('true');
    press(buttons[0] as HTMLElement);
    expect(p.onContinue).toHaveBeenCalledTimes(1);
    fail.update({ ...p, busy: false });
    expect(buttons[0]?.hasAttribute('aria-disabled')).toBe(false);
    expect(fail.dismiss()).toBe(false);
  });

  it('shows the video icon only for a rewarded continue, and hides Continue when not offered', () => {
    const fail = createFailOverlay();
    document.body.append(fail.el);
    fail.open(props({ buttonDelayMs: 0 }));
    const cont = q(fail.el, '.fail__continue');
    expect(cont.querySelector('.icon-play-video')).not.toBeNull();
    // WCAG 2.5.3: the accessible name contains the visible label ("Continue" "+1"), and says it is a video.
    expect(cont.getAttribute('aria-label')).toBe('Continue +1 heart, after a short video');
    const visible = `${cont.querySelector('.btn__label')?.textContent ?? '?'} ${cont.querySelector('.btn__badge')?.textContent ?? '?'}`;
    expect(cont.getAttribute('aria-label')?.startsWith(visible)).toBe(true);
    fail.update(props({ continueOffer: 'free', buttonDelayMs: 0 }));
    expect(cont.querySelector('.icon-play-video')).toBeNull();
    expect(cont.getAttribute('aria-label')).toBe('Continue +1 heart');
    fail.update(props({ continueOffer: null, buttonDelayMs: 0 }));
    expect(cont.hidden).toBe(true);
    expect(q(fail.el, '.fail__retry').hasAttribute('data-autofocus')).toBe(true);
  });
});

describe('O6 how to play and O7 daily result', () => {
  it('offers skip only during the first-run tutorial and replay only after it', () => {
    const p = { showSkip: true, showReplay: false, onSkip: vi.fn(), onReplay: vi.fn(), onClose: vi.fn() };
    const howto = createHowToPlay();
    document.body.append(howto.el);
    howto.open(p);
    expect(howto.el.querySelectorAll('.howto-rule')).toHaveLength(3);
    expect(q(howto.el, '.howto__skip').hidden).toBe(false);
    expect(q(howto.el, '.howto__replay').hidden).toBe(true);
    press(q(howto.el, '.howto__skip'));
    expect(p.onSkip).toHaveBeenCalledTimes(1);
    howto.update({ ...p, showSkip: false, showReplay: true });
    expect(q(howto.el, '.howto__skip').hidden).toBe(true);
    press(q(howto.el, '.howto__replay'));
    expect(p.onReplay).toHaveBeenCalledTimes(1);
    howto.update({ ...p, showSkip: false, showReplay: false });
    expect(q(howto.el, '.howto__extra').hidden).toBe(true);
    expect(howto.dismiss()).toBe(true);
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the date, time, stats and a live next-puzzle countdown; Esc = Done', () => {
    let now = Date.UTC(2026, 9, 6, 16, 12, 0);
    const midnight = now + (7 * 60 + 48) * 60_000 + 30_000;
    const onDone = vi.fn();
    const daily = createDailyResult();
    document.body.append(daily.el);
    daily.open({ dateKey: '2026-10-06', ms: 252_000, mistakes: 1, hints: 0, kitties: 0, nextPuzzleAt: midnight, now: () => now, onDone });
    expect(q(daily.el, '.overlay__title').textContent).toBe('Daily puzzle · Tue 6 Oct');
    expect(q(daily.el, '.daily-result__time').textContent).toBe('Solved in 4:12');
    expect(q(daily.el, '.daily-result__stats').textContent).toBe('Mistakes 1 · Hints 0');
    expect(q(daily.el, '.daily-result__next').textContent).toBe('Next puzzle in 7 h 48 min');
    now += 60_000;
    vi.advanceTimersByTime(1000);
    expect(q(daily.el, '.daily-result__next').textContent).toBe('Next puzzle in 7 h 47 min');
    press(q(daily.el, '.daily-result__done'));
    expect(daily.dismiss()).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(2);
    daily.close();
    expect(daily.dismiss()).toBe(false);
  });
});

describe('focus trap and inert background (router contract, 02 §18)', () => {
  it('starts on the preferred button, keeps Tab inside and restores focus on release', () => {
    const before = document.createElement('button');
    before.textContent = 'board';
    const app = document.createElement('div');
    app.append(before);
    document.body.append(app);
    before.focus();

    const fail = createFailOverlay();
    document.body.append(fail.el);
    fail.open({ continueOffer: 'video', buttonDelayMs: 600, busy: false, onContinue: vi.fn(), onRetry: vi.fn(), onHome: vi.fn() });
    setInert([app], true);
    const release = trapFocus(fail.el, { initialFocus: fail.el.querySelector<HTMLElement>('[data-autofocus]') });

    const list = focusableElements(fail.el);
    expect(list.map((b) => b.className.split(' ').pop())).toEqual(['fail__continue', 'fail__retry', 'fail__home']);
    // Gated buttons stay focusable (aria-disabled), so keyboard users land on Continue at once.
    expect(document.activeElement).toBe(q(fail.el, '.fail__continue'));
    list[2]?.focus();
    tab();
    expect(document.activeElement).toBe(list[0]);
    tab(true);
    expect(document.activeElement).toBe(list[2]);
    expect(app.getAttribute('aria-hidden')).toBe('true');

    release();
    setInert([app], false);
    expect(document.activeElement).toBe(before);
    expect(app.hasAttribute('aria-hidden')).toBe(false);
  });

  it('every modal overlay exposes a labelled dialog with at least one focusable control', () => {
    const overlays = [
      { ov: createHintCard(), props: { step, n: 4, colors: Uint8Array.from([7, 4, 2, 0]), patterns: false, onApply: vi.fn(), onClose: vi.fn() } },
      { ov: createHowToPlay(), props: { showSkip: false, showReplay: true, onSkip: vi.fn(), onReplay: vi.fn(), onClose: vi.fn() } },
      { ov: createWinOverlay(), props: { variant: 'level', level: 2, nextLevel: 3, praise: 1, buttonDelayMs: 0, reducedMotion: true, onNext: vi.fn(), onHome: vi.fn() } },
    ] as const;
    for (const { ov, props } of overlays) {
      document.body.append(ov.el);
      (ov.open as (p: typeof props) => void)(props);
      const dialog = q(ov.el, '[role="dialog"]');
      const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '');
      expect(title?.textContent?.length).toBeGreaterThan(0);
      expect(focusableElements(ov.el).length).toBeGreaterThan(0);
    }
  });
});
