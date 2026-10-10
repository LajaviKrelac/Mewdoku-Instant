// Owner: B (Phase 2b; was ui-shell). O1/O4/O6/O7: open/close, Esc (dismiss), delayed and busy buttons, and the
// router-style focus trap + inert background working with the overlays' markup (02 §18). The O3 win
// overlay was replaced by the 2b victory screen and removed at integration (its cases went with it;
// the victory screen's are in tests/unit/shell/victory-ranking.spec.ts).
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
import { createHintCard } from '../../../src/ui/overlays/hint-card';
import { createHowToPlay } from '../../../src/ui/overlays/how-to-play';

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
/** Phase 2d.1 (required since I-3): the board when the hint opened and its rects (none in jsdom). */
const board4 = { cells: new Uint8Array(16), boardRect: () => null, cellRect: () => null };

describe('O1 hint card', () => {
  it('renders the explanation, applies and closes via the (hidden until focused) close button, Esc and a dim tap', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    const card = createHintCard();
    document.body.append(card.el);
    expect(card.modal).toBe(true);
    expect(card.el.hidden).toBe(true);
    card.open({ step, n: 4, colors: Uint8Array.from([7, 4, 2, 0]), patterns: false, onApply, onClose, ...board4 });
    expect(card.el.hidden).toBe(false);
    expect(q(card.el, '.hint-card__text').textContent).toBe('Row 3 has just one open tile left, so its cat goes here.');
    const dialog = q(card.el, '[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const desc = (dialog.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '');
    expect(desc.join('')).toContain('Row 3');

    press(q(card.el, '.hint-apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
    press(q(card.el, '.overlay__close'));
    press(q(card.el, '.overlay__scrim'));
    expect(card.dismiss()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(card.el.hidden).toBe(false); // overlays never close themselves

    card.update({ step: { ...step, kind: 'mistaken_mark', focusUnits: [] }, n: 4, colors: Uint8Array.from([7, 4, 2, 0]), patterns: false, onApply, onClose, ...board4 });
    expect(q(card.el, '.hint-card__text').textContent).toBe("This X rules out a tile that can't be ruled out yet.");
    card.close();
    expect(card.el.hidden).toBe(true);
    expect(card.dismiss()).toBe(false);
  });
});

describe('O1 placement (Phase 2d.1: anchored to the board; 2b\'s sheetPlacement / avoidRect retired at I-3)', () => {
  it('Phase 2d.1: no placement any more; the layout is measured on the next frame (RP-3), from boardRect', () => {
    const card = createHintCard();
    document.body.append(card.el);
    const avoid = vi.fn(() => null);
    card.open({ step, n: 4, colors: Uint8Array.from([7, 4, 2, 0]), patterns: false, onApply: vi.fn(), onClose: vi.fn(), ...board4, boardRect: avoid });
    expect(card.el.hasAttribute('data-placement')).toBe(false);
    expect(card.el.hasAttribute('data-placed')).toBe(false);
    expect(avoid).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(avoid).toHaveBeenCalledTimes(1);
    expect(card.el.hasAttribute('data-placed')).toBe(true);
    card.close();
    vi.advanceTimersByTime(20);
    expect(avoid).toHaveBeenCalledTimes(1);
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
    expect(cont.getAttribute('aria-label')).toBe('Continue +1 fish, after a short video');
    // Phase 2c §1.4: the "+1" badge ends with our 16 px fish, decorative (the name says "+1 fish").
    const badge = q(cont, '.btn__badge');
    expect(badge.getAttribute('aria-hidden')).toBe('true');
    expect(badge.querySelector('.btn__badge-icon use')?.getAttribute('href')).toBe('#icon-fish');
    expect(cont.innerHTML).not.toContain('icon-heart');
    const visible = `${cont.querySelector('.btn__label')?.textContent ?? '?'} ${cont.querySelector('.btn__badge')?.textContent ?? '?'}`;
    expect(cont.getAttribute('aria-label')?.startsWith(visible)).toBe(true);
    fail.update(props({ continueOffer: 'free', buttonDelayMs: 0 }));
    expect(cont.querySelector('.icon-play-video')).toBeNull();
    expect(cont.getAttribute('aria-label')).toBe('Continue +1 fish');
    fail.update(props({ continueOffer: null, buttonDelayMs: 0 }));
    expect(cont.hidden).toBe(true);
    expect(q(fail.el, '.fail__retry').hasAttribute('data-autofocus')).toBe(true);
  });
});

describe('O6 how to play, Phase 2c (fish-lives-spec §1.5; 2c.1 §10.7): the lives are fish, the ranking note, the level-points note', () => {
  it('the lives note shows our fish; a trophy note explains the weekly ranking; a sparkle note explains the level points', () => {
    const howto = createHowToPlay();
    document.body.append(howto.el);
    howto.open({ showSkip: false, showReplay: true, onSkip: vi.fn(), onReplay: vi.fn(), onClose: vi.fn() });
    const lives = q(howto.el, '.howto__lives');
    expect(lives.querySelector('use')?.getAttribute('href')).toBe('#icon-fish');
    expect(lives.textContent).toBe('Your fish are your lives. A cat on the wrong tile costs a fish. Lose all three and you can try the level again.');
    const points = q(howto.el, '.howto__points');
    expect(points.querySelector('use')?.getAttribute('href')).toBe('#icon-trophy');
    expect(points.textContent).toContain('weekly ranking, which starts again every Monday at 00:00 UTC');
    // 2c.1: the perfect streak is gone from the ranking note.
    expect(points.textContent).not.toMatch(/streak|perfect/i);
    const level = q(howto.el, '.howto__level-points');
    expect(level.querySelector('use')?.getAttribute('href')).toBe('#icon-points');
    expect(level.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(level.textContent).toBe(
      'Every cat you find earns points, and each cat you find in a row without a mistake earns more than the one before. A mistake never takes points away, but the next cat starts the count again. Cats placed by a hint or the kitty count too.',
    );
    // Lives, then the ranking note, then the level-points note; no heart icon anywhere; no streak anywhere.
    const notes = Array.from(q(howto.el, '.howto__notes').children);
    expect(notes.indexOf(points)).toBe(notes.indexOf(lives) + 1);
    expect(notes.indexOf(level)).toBe(notes.indexOf(points) + 1);
    expect(howto.el.innerHTML).not.toContain('icon-heart');
    expect(howto.el.textContent).not.toMatch(/streak/i);
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
      { ov: createFailOverlay(), props: { continueOffer: 'video', buttonDelayMs: 0, busy: false, onContinue: vi.fn(), onRetry: vi.fn(), onHome: vi.fn() } },
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
