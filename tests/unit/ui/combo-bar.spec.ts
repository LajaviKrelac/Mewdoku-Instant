// The combo bar (user, 2026-10-12; src/ui/hud/combo-bar.ts): hidden with no combo; "Combo x3" on a
// green bar whose fill shows what is left of the countdown and empties over it; it holds still while
// the game clock is stopped and steps with the TICKs under reduced motion.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { comboFraction, createComboBar, type ComboBarProps } from '../../../src/ui/hud/combo-bar';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.textContent = '';
});

const props = (p: Partial<ComboBarProps> = {}): ComboBarProps => ({ count: 2, windowMs: 8_000, leftMs: 6_000, running: true, reducedMotion: false, ...p });
const fillOf = (el: HTMLElement): HTMLElement => el.querySelector('.combo-bar__fill') as HTMLElement;

describe('combo bar', () => {
  it('comboFraction: left / window, clamped to 0 … 1', () => {
    expect(comboFraction(6_000, 8_000)).toBe(0.75);
    expect(comboFraction(9_000, 8_000)).toBe(1);
    expect(comboFraction(-5, 8_000)).toBe(0);
    expect(comboFraction(5, 0)).toBe(0);
  });

  it('hidden with no combo; "Combo x2" with one, decorative', () => {
    const bar = createComboBar(props({ count: 0, windowMs: 0, leftMs: 0 }));
    expect(bar.el.hidden).toBe(true);
    bar.update(props());
    expect(bar.el.hidden).toBe(false);
    expect(bar.el.textContent).toBe('Combo x2');
    expect(bar.el.dataset.count).toBe('2');
    expect(bar.el.getAttribute('aria-hidden')).toBe('true');
    bar.update(props({ count: 0, windowMs: 0, leftMs: 0 }));
    expect(bar.el.hidden).toBe(true);
  });

  it('the fill starts at what is left and empties linearly over it; a stopped clock holds it still', () => {
    const animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation);
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate;
    const bar = createComboBar(props());
    expect(fillOf(bar.el).style.transform).toBe('scaleX(0.75)');
    expect(animate).toHaveBeenCalledWith([{ transform: 'scaleX(0.75)' }, { transform: 'scaleX(0)' }], { duration: 6_000, easing: 'linear', fill: 'forwards' });
    // The same clock again (a mark between two TICKs): no restart.
    bar.update(props());
    expect(animate).toHaveBeenCalledTimes(1);
    bar.update(props({ running: false, leftMs: 5_000 }));
    expect(animate).toHaveBeenCalledTimes(1);
    expect(fillOf(bar.el).style.transform).toBe('scaleX(0.625)');
    bar.update(props({ reducedMotion: true, leftMs: 4_000 }));
    expect(animate).toHaveBeenCalledTimes(1);
    expect(fillOf(bar.el).style.transform).toBe('scaleX(0.5)');
    bar.destroy();
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  });
});
