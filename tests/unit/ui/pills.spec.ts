// Owner: B. The pills row (cat counter, hearts and the heart break; phase2b adds the fish pill).
// phase2b F0 split: moved from hud.spec.ts (A). B adds the §2.13 cases (heart-break phases, the
// in-game fish pill hidden during play and counting up per arrival) and the shared fish pill (§2.5).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { createFishPill, createPills, type PillsProps } from '../../../src/ui/hud/pills';

afterEach(() => {
  vi.useRealTimers();
  document.body.textContent = '';
});

const base: PillsProps = { catsPlaced: 0, n: 8, hearts: 3, maxHearts: 3, compact: false };

describe('pills', () => {
  it('shows the cat counter and hearts with accessible labels', () => {
    const p = createPills({ catsPlaced: 3, n: 8, hearts: 2, maxHearts: 3, compact: false });
    expect(p.el.querySelector('.pill__count')?.textContent).toBe('3 / 8');
    expect(p.el.querySelector('.pill--cats')?.getAttribute('aria-label')).toBe('3 of 8 cats placed');
    expect(p.el.querySelector('.pill--hearts')?.getAttribute('aria-label')).toBe('2 of 3 hearts left');
    expect(p.el.querySelectorAll('.heart')).toHaveLength(3);
    expect(p.el.querySelectorAll('.heart[data-full]')).toHaveLength(2);
    p.update({ catsPlaced: 4, n: 8, hearts: 2, maxHearts: 3, compact: true });
    expect(p.el.hasAttribute('data-compact')).toBe(true);
    expect(p.el.querySelector('.pill--cats')?.classList.contains('pill--bump')).toBe(true);
  });

  it('breaks the lost heart on MISTAKE (§2.9) and pops the restored one on REVIVED', () => {
    vi.useFakeTimers();
    const p = createPills(base);
    expect(p.el.style.getPropertyValue('--t-break')).toBe(`${cfg.fx.heartBreakMs}ms`);
    p.update({ ...base, hearts: 2 });
    p.playEvent({ type: 'MISTAKE', cell: 4, heartsLeft: 2 });
    const hearts = p.el.querySelectorAll('.heart');
    const slot = hearts[2] as HTMLElement;
    // Every phase is in place: the shaking group with the whole heart, both halves and the zigzag crack,
    // the three shards, and the slot's break class (the empty outline fades in from 400 ms, fx.css).
    const crack = slot.querySelector('.heart__crack');
    expect(crack).not.toBeNull();
    expect(crack?.querySelector('.heart__shake .heart__whole')).not.toBeNull();
    expect(crack?.querySelectorAll('.heart__shake .heart__half')).toHaveLength(2);
    expect(crack?.querySelector('.heart__shake .heart__zig')?.getAttribute('pathLength')).toBe('1');
    expect(crack?.querySelectorAll('.heart__shard')).toHaveLength(3);
    for (const shard of Array.from(crack?.querySelectorAll<SVGElement>('.heart__shard') ?? [])) {
      const dx = parseFloat(shard.style.getPropertyValue('--dx'));
      const dy = parseFloat(shard.style.getPropertyValue('--dy'));
      expect(Math.hypot(dx, dy)).toBeCloseTo(18, 0);
      expect(dy).toBeLessThan(0); // they fly up and out
      const deg = Math.abs((Math.atan2(dx, -dy) * 180) / Math.PI);
      expect(deg).toBeGreaterThanOrEqual(29.5); // ±(30–60)°, after rounding to 0.1 px
      expect(deg).toBeLessThanOrEqual(60.5);
    }
    expect(slot.classList.contains('heart--break')).toBe(true);
    expect(p.el.querySelector('.pill--hearts')?.classList.contains('pill--hurt')).toBe(true);
    // Still breaking at the old 400 ms crack length; gone after the 700 ms break.
    vi.advanceTimersByTime(cfg.fx.heartCrackMs + 100);
    expect(slot.querySelector('.heart__crack')).not.toBeNull();
    vi.advanceTimersByTime(cfg.fx.heartBreakMs + 80 - (cfg.fx.heartCrackMs + 100));
    expect(slot.querySelector('.heart__crack')).toBeNull();
    expect(slot.classList.contains('heart--break')).toBe(false);
    p.update({ ...base, hearts: 1 });
    p.playEvent({ type: 'REVIVED' });
    expect(hearts[0]?.classList.contains('heart--pop')).toBe(true);
    p.destroy();
  });

  it('reduced motion: the heart break is a plain swap to the empty heart (§2.9)', () => {
    vi.useFakeTimers();
    const p = createPills({ ...base, reducedMotion: true });
    p.update({ ...base, hearts: 2, reducedMotion: true });
    p.playEvent({ type: 'MISTAKE', cell: 4, heartsLeft: 2 });
    const slot = p.el.querySelectorAll('.heart')[2] as HTMLElement;
    expect(slot.querySelector('.heart__crack')).toBeNull();
    expect(slot.hasAttribute('data-full')).toBe(false);
    expect(p.el.querySelector('.pill--hearts')?.classList.contains('pill--hurt')).toBe(false);
  });
});

describe('in-game fish pill (phase2b §2.2)', () => {
  it('is hidden during play, so the HUD shows two pills', () => {
    const p = createPills(base);
    const fish = p.el.querySelector<HTMLElement>('.fish-pill');
    expect(fish).not.toBeNull();
    expect(fish?.hidden).toBe(true);
    expect(fish?.hasAttribute('data-in-game')).toBe(true);
    expect(p.fishRect()).toBeNull();
    // Labels before the pill shows do nothing.
    p.fishLabel('+3');
    expect(p.el.querySelector('.fish-pill__label')).toBeNull();
    // Centred between the cat counter and the hearts, with no "+".
    const kids = Array.from(p.el.children).map((c) => c.className.split(' ')[0]);
    expect(kids).toEqual(['pill', 'fish-pill', 'pill']);
    expect(fish?.querySelector<HTMLElement>('.fish-pill__plus')?.hidden).toBe(true);
  });

  it('fades in with the pre-win count, then counts up once per arrival with a roll and a bump', () => {
    vi.useFakeTimers();
    const p = createPills(base);
    document.body.appendChild(p.el);
    p.showFish(125);
    const fish = p.el.querySelector<HTMLElement>('.fish-pill') as HTMLElement;
    expect(fish.hidden).toBe(false);
    expect(fish.classList.contains('fish-pill--in')).toBe(true);
    expect(fish.style.getPropertyValue('--fade-ms')).toBe(`${cfg.fx.win.fishPillFadeMs}ms`);
    expect(fish.querySelector('.fish-pill__n')?.textContent).toBe('125');
    expect(fish.querySelector('.fish-pill__main')?.getAttribute('aria-label')).toBe('125 fish');
    expect(p.fishRect()).not.toBeNull();
    for (const n of [126, 127, 128]) {
      p.showFish(n);
      expect(fish.classList.contains('fish-pill--bump')).toBe(true);
      expect(fish.querySelector('.fish-pill__n.is-in')?.textContent).toBe(String(n));
      vi.advanceTimersByTime(cfg.fx.win.counterBumpMs);
      expect(fish.querySelectorAll('.fish-pill__n')).toHaveLength(1);
      expect(fish.querySelector('.fish-pill__n')?.textContent).toBe(String(n));
      expect(fish.classList.contains('fish-pill--bump')).toBe(false);
    }
    expect(fish.querySelector('.fish-pill__main')?.getAttribute('aria-label')).toBe('128 fish');
  });

  it('the "+3" label rises and is removed after fx.win.plusLabelMs; reduced motion uses the 150 / 600 fade', () => {
    vi.useFakeTimers();
    const p = createPills(base);
    p.showFish(125);
    p.fishLabel('+3');
    const label = p.el.querySelector<HTMLElement>('.fish-pill__label');
    expect(label?.textContent).toBe('+3');
    expect(label?.style.getPropertyValue('--label-ms')).toBe(`${cfg.fx.win.plusLabelMs}ms`);
    expect(label?.style.getPropertyValue('--label-rise')).toBe(`${-cfg.fx.win.plusLabelRisePx}px`);
    expect(label?.getAttribute('aria-hidden')).toBe('true');
    vi.advanceTimersByTime(cfg.fx.win.plusLabelMs);
    expect(p.el.querySelector('.fish-pill__label')).toBeNull();

    const r = createPills({ ...base, reducedMotion: true });
    r.showFish(128);
    r.fishLabel('+3');
    const rl = r.el.querySelector<HTMLElement>('.fish-pill__label');
    const R = cfg.fx.win.reduced;
    expect(rl?.hasAttribute('data-reduced')).toBe(true);
    expect(rl?.style.getPropertyValue('--label-ms')).toBe(`${R.plusLabelInMs + R.plusLabelOutMs}ms`);
    // Reduced motion: the count jumps without a roll.
    r.showFish(130);
    expect(r.el.querySelector('.fish-pill__n.is-in')).toBeNull();
    expect(r.el.querySelector('.fish-pill__n')?.textContent).toBe('130');
  });

  it('destroy clears its timers and removes the row', () => {
    vi.useFakeTimers();
    const p = createPills(base);
    document.body.appendChild(p.el);
    p.showFish(1);
    p.showFish(2);
    p.fishLabel('+1');
    p.destroy();
    expect(p.el.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('createFishPill (phase2b §2.5)', () => {
  it('shows the count, an accessible label and a "+" that opens the shop', () => {
    const onPlus = vi.fn();
    const pill = createFishPill({ count: 1240, onPlus });
    document.body.appendChild(pill.el);
    expect(pill.el.querySelector('.fish-pill__n')?.textContent).toBe('1,240');
    expect(pill.el.querySelector('.fish-pill__main')?.getAttribute('role')).toBe('img');
    expect(pill.el.querySelector('.fish-pill__main')?.getAttribute('aria-label')).toBe('1,240 fish');
    const plus = pill.el.querySelector<HTMLButtonElement>('.fish-pill__plus') as HTMLButtonElement;
    expect(plus.hidden).toBe(false);
    expect(plus.getAttribute('aria-label')).toBe('Shop');
    plus.click();
    expect(onPlus).toHaveBeenCalledTimes(1);
    expect(pill.el.hasAttribute('data-plus')).toBe(true);
    expect(pill.iconRect()).not.toBeNull();
    pill.update({ count: 1, onPlus: null });
    expect(plus.hidden).toBe(true);
    expect(pill.el.querySelector('.fish-pill__main')?.getAttribute('aria-label')).toBe('1 fish');
    pill.destroy();
    expect(pill.iconRect()).toBeNull();
  });
});
