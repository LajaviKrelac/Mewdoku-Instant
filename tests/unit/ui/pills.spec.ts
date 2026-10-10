// Owner: B (Phase 2b); G2 (Phase 2c, 2c.1). The pills row: the cat counter and the LIVES pill (Phase 2c:
// the lives are fish, fish-lives-spec §1), the fish loss on MISTAKE (§1.3) and the revive pop (§1.4),
// the win flow's lift-off (lifeSlots, departLife, §2.2–§2.3), the in-game period counter (§2.1) and
// the Home period pill (createPeriodPill, §2.8). Phase 2c.1 (§10.2–§10.3): the LEVEL-POINTS counter
// (hidden when unscored, the roll, bump and "+576" chip of a POINTS event, data-final at the win, the
// tight fallback) and the period counter taking the cat counter's cell at the win.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import * as pillsModule from '../../../src/ui/hud/pills';
import type { GameEvent } from '../../../src/game/types';
import { createPeriodPill, createPills, LOSS_DROP_FLY, LOSS_DROPS, POP_DROPS, TIGHT_STEPS, type PillsProps } from '../../../src/ui/hud/pills';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.textContent = '';
});

const base: PillsProps = { catsPlaced: 0, n: 8, hearts: 3, maxHearts: 3, compact: false, points: null };

const uses = (el: Element | null | undefined): string[] => Array.from(el?.querySelectorAll('use') ?? []).map((u) => u.getAttribute('href') ?? '');

describe('the lives pill (§1.1)', () => {
  it('shows the cat counter and maxHearts fish slots with accessible labels; no heart anywhere', () => {
    const p = createPills({ catsPlaced: 3, n: 8, hearts: 2, maxHearts: 3, compact: false, points: null });
    expect(p.el.querySelector('.pill__count')?.textContent).toBe('3 / 8');
    expect(p.el.querySelector('.pill--cats')?.getAttribute('aria-label')).toBe('3 of 8 cats placed');
    const lives = p.el.querySelector('.pill--lives') as HTMLElement;
    expect(lives.getAttribute('role')).toBe('img');
    expect(lives.getAttribute('aria-label')).toBe('2 of 3 fish left');
    expect(p.el.querySelectorAll('.life')).toHaveLength(3);
    expect(p.el.querySelectorAll('.life[data-full]')).toHaveLength(2);
    // Each slot: the empty outline under the full fish (§1.2).
    for (const slot of Array.from(p.el.querySelectorAll('.life'))) {
      expect(uses(slot.querySelector('.life__empty'))).toEqual(['#icon-fish-empty']);
      expect(uses(slot.querySelector('.life__full'))).toEqual(['#icon-fish']);
    }
    expect(p.el.querySelector('.pill--hearts, .heart')).toBeNull();
    expect(p.el.innerHTML).not.toContain('icon-heart');
    p.update({ catsPlaced: 4, n: 8, hearts: 2, maxHearts: 3, compact: true, points: null });
    expect(p.el.hasAttribute('data-compact')).toBe(true);
    expect(p.el.querySelector('.pill--cats')?.classList.contains('pill--bump')).toBe(true);
  });

  it('drains from the last slot: slot k is full while k < hearts; data-last at one fish', () => {
    const p = createPills(base);
    const full = (): number[] => Array.from(p.el.querySelectorAll('.life')).flatMap((s, k) => (s.hasAttribute('data-full') ? [k] : []));
    expect(full()).toEqual([0, 1, 2]);
    p.update({ ...base, hearts: 2 });
    expect(full()).toEqual([0, 1]);
    expect(p.el.querySelector('.pill--lives')?.hasAttribute('data-last')).toBe(false);
    p.update({ ...base, hearts: 1 });
    expect(full()).toEqual([0]);
    expect(p.el.querySelector('.pill--lives')?.hasAttribute('data-last')).toBe(true);
    p.update({ ...base, hearts: 0 });
    expect(full()).toEqual([]);
    // An event with five lives draws five slots.
    p.update({ ...base, hearts: 5, maxHearts: 5 });
    expect(p.el.querySelectorAll('.life')).toHaveLength(5);
    expect(p.el.querySelector('.pill--lives')?.getAttribute('aria-label')).toBe('5 of 5 fish left');
  });

  it('publishes the loss timings from config (--t-life-loss, --t-life-hurt)', () => {
    const p = createPills(base);
    expect(p.el.style.getPropertyValue('--t-life-loss')).toBe(`${cfg.fx.lifeLossMs}ms`);
    expect(p.el.style.getPropertyValue('--t-life-hurt')).toBe(`${cfg.fx.lifeLossPillMs}ms`);
  });
});

describe('the fish loss (§1.3)', () => {
  it('a MISTAKE plays the loss on slot heartsLeft: the falling fish, three droplets, the pill shake; all gone after fx.lifeLossMs', () => {
    vi.useFakeTimers();
    const p = createPills(base);
    p.update({ ...base, hearts: 2 });
    p.playEvent({ type: 'MISTAKE', cell: 4, heartsLeft: 2 });
    const slots = p.el.querySelectorAll('.life');
    const slot = slots[2] as HTMLElement;
    // Only the lost slot animates.
    expect(slots[0]?.classList.contains('life--lose')).toBe(false);
    expect(slots[1]?.classList.contains('life--lose')).toBe(false);
    expect(slot.classList.contains('life--lose')).toBe(true);
    // The stand-in that wriggles and flips out is our fish (never a heart).
    expect(uses(slot.querySelector('.life__lost'))).toEqual(['#icon-fish']);
    // Three droplets at −50°, −10°, +35° from straight up, LOSS_DROP_FLY units out.
    const drops = Array.from(slot.querySelectorAll<SVGCircleElement>('.life__splash .life__drop'));
    expect(drops).toHaveLength(3);
    expect(LOSS_DROPS).toEqual([-50, -10, 35]);
    drops.forEach((d, k) => {
      expect(d.getAttribute('r')).toBe('1.2');
      expect(d.getAttribute('stroke-width')).toBe('0.6');
      const dx = parseFloat(d.style.getPropertyValue('--dx'));
      const dy = parseFloat(d.style.getPropertyValue('--dy'));
      expect(Math.hypot(dx, dy)).toBeCloseTo(LOSS_DROP_FLY, 1);
      expect(dy).toBeLessThan(0); // upward
      expect((Math.atan2(dx, -dy) * 180) / Math.PI).toBeCloseTo(LOSS_DROPS[k] as number, 0);
    });
    expect(p.el.querySelector('.pill--lives')?.classList.contains('pill--hurt')).toBe(true);
    // The pill shake ends at fx.lifeLossPillMs; the loss is still running.
    vi.advanceTimersByTime(cfg.fx.lifeLossPillMs);
    expect(p.el.querySelector('.pill--lives')?.classList.contains('pill--hurt')).toBe(false);
    expect(slot.classList.contains('life--lose')).toBe(true);
    // At fx.lifeLossMs the class goes; the nodes a moment later.
    vi.advanceTimersByTime(cfg.fx.lifeLossMs - cfg.fx.lifeLossPillMs);
    expect(slot.classList.contains('life--lose')).toBe(false);
    vi.advanceTimersByTime(100);
    expect(slot.querySelector('.life__lost, .life__splash')).toBeNull();
    expect(slot.hasAttribute('data-full')).toBe(false);
    p.destroy();
  });

  it('reduced motion: the loss is a plain swap to the empty outline (no stand-in, no droplets, no shake)', () => {
    vi.useFakeTimers();
    const p = createPills({ ...base, reducedMotion: true });
    p.update({ ...base, hearts: 2, reducedMotion: true });
    p.playEvent({ type: 'MISTAKE', cell: 4, heartsLeft: 2 });
    const slot = p.el.querySelectorAll('.life')[2] as HTMLElement;
    expect(slot.querySelector('.life__lost, .life__splash')).toBeNull();
    expect(slot.classList.contains('life--lose')).toBe(false);
    expect(slot.hasAttribute('data-full')).toBe(false);
    expect(p.el.querySelector('.pill--lives')?.classList.contains('pill--hurt')).toBe(false);
  });

  it('a REVIVED pops the restored fish back with two droplets (§1.4); reduced motion: instant', () => {
    vi.useFakeTimers();
    const p = createPills({ ...base, hearts: 0 });
    p.update({ ...base, hearts: 1 });
    p.playEvent({ type: 'REVIVED' });
    const slot = p.el.querySelectorAll('.life')[0] as HTMLElement;
    expect(slot.hasAttribute('data-full')).toBe(true);
    expect(slot.classList.contains('life--pop')).toBe(true);
    expect(slot.querySelectorAll('.life__splash .life__drop')).toHaveLength(POP_DROPS.length);
    expect(POP_DROPS).toHaveLength(2);
    vi.advanceTimersByTime(pillsModule.LIFE_POP_MS);
    expect(slot.classList.contains('life--pop')).toBe(false);
    vi.advanceTimersByTime(200);
    expect(slot.querySelector('.life__splash')).toBeNull();

    const r = createPills({ ...base, hearts: 0, reducedMotion: true });
    r.update({ ...base, hearts: 1, reducedMotion: true });
    r.playEvent({ type: 'REVIVED' });
    const rs = r.el.querySelectorAll('.life')[0] as HTMLElement;
    expect(rs.hasAttribute('data-full')).toBe(true);
    expect(rs.classList.contains('life--pop')).toBe(false);
    expect(rs.querySelector('.life__splash')).toBeNull();
  });
});

describe('the win flow lift-off (§2.2, §2.3)', () => {
  const rect = (x: number): DOMRect => ({ left: x, top: 80, width: 32, height: 32, right: x + 32, bottom: 112, x, y: 80, toJSON: () => ({}) }) as DOMRect;

  it('lifeSlots: full slots in departure order (highest first) with their icon rects; [] while detached', () => {
    const p = createPills({ ...base, hearts: 2 });
    expect(p.lifeSlots()).toEqual([]); // not in the document
    document.body.appendChild(p.el);
    p.el.querySelectorAll<SVGElement>('.life__full').forEach((f, k) => (f.getBoundingClientRect = () => rect(300 + 30 * k)));
    const slots = p.lifeSlots();
    expect(slots.map((s) => s.slot)).toEqual([1, 0]);
    expect(slots.map((s) => s.rect.left)).toEqual([330, 300]);
    p.update({ ...base, hearts: 3 });
    expect(p.lifeSlots().map((s) => s.slot)).toEqual([2, 1, 0]);
  });

  it('departLife empties the slot at once, without the loss animation, and is idempotent; a later render keeps it empty', () => {
    const p = createPills({ ...base, catsPlaced: 8, hearts: 3 });
    document.body.appendChild(p.el);
    const slots = p.el.querySelectorAll('.life');
    p.departLife(2);
    expect(slots[2]?.hasAttribute('data-full')).toBe(false);
    expect(slots[2]?.hasAttribute('data-departed')).toBe(true);
    expect(slots[2]?.classList.contains('life--lose')).toBe(false);
    expect(slots[2]?.querySelector('.life__lost, .life__splash')).toBeNull();
    p.departLife(2);
    p.departLife(1);
    expect(p.lifeSlots().map((s) => s.slot)).toEqual([0]);
    // The won board re-renders (a language switch, the chrome lock): the departed stay empty.
    p.update({ ...base, catsPlaced: 8, hearts: 3 });
    expect(Array.from(slots).map((s) => s.hasAttribute('data-full'))).toEqual([true, false, false]);
    // A new board (not complete) refills them.
    p.update({ ...base, catsPlaced: 0, hearts: 3 });
    expect(Array.from(slots).map((s) => s.hasAttribute('data-full'))).toEqual([true, true, true]);
    expect(slots[2]?.hasAttribute('data-departed')).toBe(false);
    // Out of range: nothing happens.
    p.departLife(7);
    p.departLife(-1);
  });
});

describe('the in-game period counter (§2.1, §2.2)', () => {
  it('is hidden during play, so the HUD shows two pills', () => {
    const p = createPills(base);
    const counter = p.el.querySelector<HTMLElement>('.period-pill');
    expect(counter).not.toBeNull();
    expect(counter?.hidden).toBe(true);
    expect(counter?.hasAttribute('data-in-game')).toBe(true);
    expect(p.periodRect()).toBeNull();
    // Labels before the counter shows do nothing.
    p.periodLabel('+3');
    expect(p.el.querySelector('.period-pill__label')).toBeNull();
    // 2c.1 (§10.3): it shares the cat counter's cell, so it follows the cat counter in the DOM; the
    // level-points counter (hidden here: no `points`) is the middle column.
    const kids = Array.from(p.el.children).map((c) => c.className.split(' ')[0]);
    expect(kids).toEqual(['pill', 'period-pill', 'points-pill', 'pill']);
    expect(p.el.querySelector<HTMLElement>('.points-pill')?.hidden).toBe(true);
    expect(p.el.querySelector('.fish-pill')).toBeNull();
  });

  it('fades in with the period total before the win, then counts up once per arrival with a roll and a bump', () => {
    vi.useFakeTimers();
    const p = createPills(base);
    document.body.appendChild(p.el);
    p.showPeriodCounter(39);
    const counter = p.el.querySelector<HTMLElement>('.period-pill') as HTMLElement;
    expect(counter.hidden).toBe(false);
    expect(counter.classList.contains('period-pill--in')).toBe(true);
    // The fade time is the row's (the cat counter fades out over the same time, §10.3).
    expect(p.el.style.getPropertyValue('--fade-ms')).toBe(`${cfg.fx.win.fishPillFadeMs}ms`);
    expect(counter.querySelector('.period-pill__n')?.textContent).toBe('39');
    expect(counter.getAttribute('role')).toBe('img');
    expect(counter.getAttribute('aria-label')).toBe('39 fish this week');
    expect(uses(counter)).toEqual(['#icon-trophy']);
    expect(p.periodRect()).not.toBeNull();
    for (const n of [40, 41, 42]) {
      p.showPeriodCounter(n);
      expect(counter.classList.contains('period-pill--bump')).toBe(true);
      expect(counter.querySelector('.period-pill__n.is-in')?.textContent).toBe(String(n));
      vi.advanceTimersByTime(cfg.fx.win.counterBumpMs);
      expect(counter.querySelectorAll('.period-pill__n')).toHaveLength(1);
      expect(counter.querySelector('.period-pill__n')?.textContent).toBe(String(n));
      expect(counter.classList.contains('period-pill--bump')).toBe(false);
    }
    expect(counter.getAttribute('aria-label')).toBe('42 fish this week');
  });

  it('arrivals faster than a roll never stack more than two numbers in the box', () => {
    vi.useFakeTimers();
    const p = createPills(base);
    document.body.appendChild(p.el);
    p.showPeriodCounter(0);
    for (const n of [1, 2, 3]) {
      p.showPeriodCounter(n);
      expect(p.el.querySelectorAll('.period-pill__n').length).toBeLessThanOrEqual(2);
      expect(p.el.querySelectorAll('.period-pill__n.is-out')).toHaveLength(1);
      vi.advanceTimersByTime(cfg.fx.win.fishStaggerMs);
    }
    vi.advanceTimersByTime(cfg.fx.win.counterBumpMs);
    expect(Array.from(p.el.querySelectorAll('.period-pill__n')).map((e) => e.textContent)).toEqual(['3']);
  });

  it('the "+3" chip rises and is removed after fx.win.plusLabelMs; reduced motion uses the in / out fade', () => {
    vi.useFakeTimers();
    const p = createPills(base);
    p.showPeriodCounter(39);
    p.periodLabel('+3');
    const label = p.el.querySelector<HTMLElement>('.period-pill__label');
    expect(label?.textContent).toBe('+3');
    expect(label?.style.getPropertyValue('--label-ms')).toBe(`${cfg.fx.win.plusLabelMs}ms`);
    expect(label?.style.getPropertyValue('--label-rise')).toBe(`${-cfg.fx.win.plusLabelRisePx}px`);
    expect(label?.getAttribute('aria-hidden')).toBe('true');
    vi.advanceTimersByTime(cfg.fx.win.plusLabelMs);
    expect(p.el.querySelector('.period-pill__label')).toBeNull();

    const r = createPills({ ...base, reducedMotion: true });
    r.showPeriodCounter(39);
    r.periodLabel('+3');
    const rl = r.el.querySelector<HTMLElement>('.period-pill__label');
    const R = cfg.fx.win.reduced;
    expect(rl?.hasAttribute('data-reduced')).toBe(true);
    expect(rl?.style.getPropertyValue('--label-ms')).toBe(`${R.plusLabelInMs + R.plusLabelOutMs}ms`);
    // Reduced motion: the count jumps without a roll.
    r.showPeriodCounter(42);
    expect(r.el.querySelector('.period-pill__n.is-in')).toBeNull();
    expect(r.el.querySelector('.period-pill__n')?.textContent).toBe('42');
  });

  it('the 2b fish-pill hooks are gone (I-3): only the period counter remains', () => {
    const p = createPills(base) as unknown as Record<string, unknown>;
    for (const k of ['showFish', 'fishRect', 'fishLabel']) expect(p[k]).toBeUndefined();
    (p as unknown as { destroy(): void }).destroy();
  });

  it('destroy clears its timers and removes the row', () => {
    vi.useFakeTimers();
    const p = createPills(base);
    document.body.appendChild(p.el);
    p.showPeriodCounter(1);
    p.showPeriodCounter(2);
    p.periodLabel('+1');
    p.update({ ...base, hearts: 2 });
    p.playEvent({ type: 'MISTAKE', cell: 1, heartsLeft: 2 });
    p.destroy();
    expect(p.el.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('createPeriodPill (§2.8, Home)', () => {
  it('shows icon-trophy and the total, is an image labelled "42 fish this week", and is not a button', () => {
    const pill = createPeriodPill({ total: 1240, kind: 'week' });
    document.body.appendChild(pill.el);
    expect(pill.el.classList.contains('period-pill')).toBe(true);
    expect(pill.el.hasAttribute('data-in-game')).toBe(false);
    expect(pill.el.querySelector('.period-pill__n')?.textContent).toBe('1,240');
    expect(pill.el.getAttribute('role')).toBe('img');
    expect(pill.el.getAttribute('aria-label')).toBe('1,240 fish this week');
    expect(pill.el.querySelector('button')).toBeNull();
    expect(uses(pill.el)).toEqual(['#icon-trophy']);
    pill.update({ total: 1, kind: 'week' });
    expect(pill.el.getAttribute('aria-label')).toBe('1 fish this week');
    pill.update({ total: 0, kind: 'day' });
    expect(pill.el.querySelector('.period-pill__n')?.textContent).toBe('0');
    expect(pill.el.getAttribute('aria-label')).toBe('0 fish today');
    pill.update({ total: 5, kind: 'month' });
    expect(pill.el.getAttribute('aria-label')).toBe('5 fish this month');
    pill.destroy();
    expect(pill.el.isConnected).toBe(false);
  });

  it('there is no fish pill or shop "+" any more (§5.1)', () => {
    expect('createFishPill' in pillsModule).toBe(false);
  });
});

// ─────────────────────────── Phase 2c.1: the level-points counter (§10.2, §10.3) ───────────────────────────

const pts = (gained: number, total: number, streak = 1): GameEvent => ({ type: 'POINTS', cell: 0, gained, total, streak });
const counter = (p: { el: HTMLElement }): HTMLElement => p.el.querySelector<HTMLElement>('.points-pill') as HTMLElement;
const nums = (p: { el: HTMLElement }): string[] => Array.from(p.el.querySelectorAll('.points-pill__n')).map((e) => e.textContent ?? '');

describe('the level-points counter (2c.1 §10.2)', () => {
  it('is hidden when points is null or absent (the tutorial, an unscored mode), so the row looks like 2c', () => {
    // `points` is required (number | null) since 2c.1 I-3; an absent value (a cast) still hides it.
    for (const props of [base, { ...base, points: undefined } as unknown as PillsProps]) {
      const p = createPills(props);
      expect(counter(p).hidden).toBe(true);
      p.playEvent(pts(576, 576));
      expect(p.el.querySelector('.points-pill__chip')).toBeNull();
      expect(nums(p)).toEqual(['']);
      p.destroy();
    }
  });

  it('shows 0 at the start of a board: an image labelled "Level points: 0" with icon-points, between the cats and the lives, never focusable', () => {
    const p = createPills({ ...base, points: 0 });
    const c = counter(p);
    expect(c.hidden).toBe(false);
    expect(Array.from(p.el.children).indexOf(c)).toBe(2);
    expect(p.el.lastElementChild?.classList.contains('pill--lives')).toBe(true);
    expect(c.querySelector('.points-pill__n')?.textContent).toBe('0');
    expect(c.getAttribute('role')).toBe('img');
    // The same white pill as its neighbours (the .pill base rule).
    expect(c.classList.contains('pill')).toBe(true);
    expect(c.getAttribute('aria-label')).toBe('Level points: 0');
    expect(c.hasAttribute('aria-live')).toBe(false);
    expect(c.hasAttribute('tabindex')).toBe(false);
    expect(uses(c)).toEqual(['#icon-points']);
    expect(c.querySelector('.points-pill__icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(c.querySelector('.points-pill__count')?.getAttribute('aria-hidden')).toBe('true');
    p.update({ ...base, points: 2016 });
    expect(c.getAttribute('aria-label')).toBe('Level points: 2,016');
    expect(c.querySelector('.points-pill__n')?.textContent).toBe('2,016');
  });

  it('props set the number without animation: no roll, no bump, no chip (restore, Retry back to 0, a new board)', () => {
    vi.useFakeTimers();
    const p = createPills({ ...base, points: 0 });
    for (const v of [1248, 13248, 0]) {
      p.update({ ...base, points: v });
      expect(nums(p)).toEqual([v.toLocaleString('en-US')]);
      expect(p.el.querySelector('.points-pill__n.is-in, .points-pill__n.is-out, .points-pill__chip')).toBeNull();
      expect(counter(p).classList.contains('points-pill--bump')).toBe(false);
    }
  });

  it('a POINTS event rolls from total − gained to total, bumps the icon and raises one "+576" chip; all settle on config times', () => {
    vi.useFakeTimers();
    const P = cfg.fx.levelPoints;
    const p = createPills({ ...base, points: 0 });
    // The session updates the props before it plays the action's events (§10.2): the roll still starts at total − gained.
    p.update({ ...base, catsPlaced: 1, points: 576 });
    p.playEvent(pts(576, 576));
    const c = counter(p);
    expect(c.querySelector('.points-pill__n.is-out')?.textContent).toBe('0');
    expect(c.querySelector('.points-pill__n.is-in')?.textContent).toBe('576');
    expect(c.classList.contains('points-pill--bump')).toBe(true);
    expect(c.style.getPropertyValue('--bump-ms')).toBe(`${P.rollMs}ms`);
    const chips = c.querySelectorAll('.points-pill__chip');
    expect(chips).toHaveLength(1);
    expect(chips[0]?.textContent).toBe('+576');
    const label = c.querySelector<HTMLElement>('.points-pill__label') as HTMLElement;
    expect(label.getAttribute('aria-hidden')).toBe('true');
    expect(label.style.getPropertyValue('--label-ms')).toBe(`${P.plusMs}ms`);
    expect(label.style.getPropertyValue('--label-rise')).toBe(`${-P.plusRisePx}px`);
    // The accessible name already says the new total; the increment is never announced (§10.4).
    expect(c.getAttribute('aria-label')).toBe('Level points: 576');
    vi.advanceTimersByTime(P.rollMs);
    expect(nums(p)).toEqual(['576']);
    expect(c.querySelector('.is-in, .is-out')).toBeNull();
    expect(c.classList.contains('points-pill--bump')).toBe(false);
    vi.advanceTimersByTime(P.plusMs - P.rollMs);
    expect(c.querySelector('.points-pill__label')).toBeNull();
  });

  it('the user\'s run 576, 1,248, 2,016 … rolls in order when the events come before the props too', () => {
    vi.useFakeTimers();
    const p = createPills({ ...base, n: 10, points: 0 });
    const totals = [576, 1248, 2016, 2880, 3840, 4896, 6048, 7296, 8640, 10080];
    let prev = 0;
    totals.forEach((total, k) => {
      p.playEvent(pts(total - prev, total, k + 1));
      expect(counter(p).querySelector('.points-pill__n.is-out')?.textContent).toBe(prev.toLocaleString('en-US'));
      expect(counter(p).querySelector('.points-pill__chip')?.textContent).toBe(`+${(total - prev).toLocaleString('en-US')}`);
      p.update({ ...base, n: 10, catsPlaced: k + 1, points: total });
      vi.advanceTimersByTime(cfg.fx.levelPoints.rollMs);
      expect(nums(p)).toEqual([total.toLocaleString('en-US')]);
      prev = total;
    });
    expect(counter(p).getAttribute('aria-label')).toBe('Level points: 10,080');
  });

  it('a newer event within plusMs keeps one chip (the newer one) and never more than two numbers in the box', () => {
    vi.useFakeTimers();
    const p = createPills({ ...base, points: 0 });
    p.playEvent(pts(576, 576));
    vi.advanceTimersByTime(100);
    p.playEvent(pts(672, 1248, 2));
    expect(Array.from(p.el.querySelectorAll('.points-pill__chip')).map((e) => e.textContent)).toEqual(['+672']);
    expect(p.el.querySelectorAll('.points-pill__n').length).toBeLessThanOrEqual(2);
    vi.advanceTimersByTime(cfg.fx.levelPoints.plusMs);
    expect(p.el.querySelector('.points-pill__chip')).toBeNull();
    expect(nums(p)).toEqual(['1,248']);
  });

  it('reduced motion: the number changes in place (no roll, no bump); the chip fades in and out on WAAPI', () => {
    vi.useFakeTimers();
    const P = cfg.fx.levelPoints;
    const animate = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true, writable: true });
    try {
      const p = createPills({ ...base, points: 576, reducedMotion: true });
      p.playEvent(pts(672, 1248, 2));
      const c = counter(p);
      expect(nums(p)).toEqual(['1,248']);
      expect(c.querySelector('.is-in, .is-out')).toBeNull();
      expect(c.classList.contains('points-pill--bump')).toBe(false);
      const label = c.querySelector<HTMLElement>('.points-pill__label') as HTMLElement;
      expect(label.hasAttribute('data-reduced')).toBe(true);
      const ms = P.reducedPlusInMs + P.reducedPlusOutMs;
      expect(label.style.getPropertyValue('--label-ms')).toBe(`${ms}ms`);
      expect(animate).toHaveBeenCalledTimes(1);
      const [frames, opts] = animate.mock.calls[0] as [Keyframe[], KeyframeAnimationOptions];
      expect(frames.map((f) => f.opacity)).toEqual([0, 1, 0]);
      expect(frames[1]?.offset).toBeCloseTo(P.reducedPlusInMs / ms);
      expect(opts.duration).toBe(ms);
      vi.advanceTimersByTime(ms);
      expect(c.querySelector('.points-pill__label')).toBeNull();
    } finally {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });

  it('a mistake shows nothing on the counter (no points are lost, D23)', () => {
    vi.useFakeTimers();
    const p = createPills({ ...base, points: 2016 });
    p.update({ ...base, points: 2016, hearts: 2 });
    p.playEvent({ type: 'MISTAKE', cell: 3, heartsLeft: 2 });
    expect(nums(p)).toEqual(['2,016']);
    expect(p.el.querySelector('.points-pill__chip, .points-pill--bump')).toBeNull();
  });

  it('[data-final] marks the level\'s total at the win (catsPlaced ≥ n) until the board changes', () => {
    const p = createPills({ ...base, catsPlaced: 7, points: 6048 });
    expect(counter(p).hasAttribute('data-final')).toBe(false);
    p.update({ ...base, catsPlaced: 8, points: 7296 });
    expect(counter(p).hasAttribute('data-final')).toBe(true);
    // A new board (Retry, next level) starts again at 0 without the highlight.
    p.update({ ...base, catsPlaced: 0, points: 0 });
    expect(counter(p).hasAttribute('data-final')).toBe(false);
    expect(nums(p)).toEqual(['0']);
    // Hidden counters never carry it.
    p.update({ ...base, catsPlaced: 8, points: null });
    expect(counter(p).hasAttribute('data-final')).toBe(false);
  });

  it('the tight fallback: an overflowing row drops the icon (1), then steps the digits down (2); a row that fits has none', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    const p = createPills({ ...base, points: 13248 });
    document.body.appendChild(p.el);
    // Widths by step: 400 → 300 → 250 px of content in a 288 px row.
    const need: Record<string, number> = { none: 400, '1': 300, '2': 250 };
    let fits = 288;
    Object.defineProperty(p.el, 'clientWidth', { get: () => fits, configurable: true });
    Object.defineProperty(p.el, 'scrollWidth', { get: () => need[p.el.dataset.tight ?? 'none'] ?? 0, configurable: true });
    window.dispatchEvent(new Event('resize'));
    expect(p.el.dataset.tight).toBe('2');
    expect(TIGHT_STEPS).toBe(2);
    fits = 320;
    window.dispatchEvent(new Event('resize'));
    expect(p.el.dataset.tight).toBe('1');
    fits = 480;
    window.dispatchEvent(new Event('resize'));
    expect(p.el.hasAttribute('data-tight')).toBe(false);
    // A wider number re-measures after the render (no resize needed).
    fits = 290;
    p.update({ ...base, points: 11616 });
    expect(p.el.dataset.tight).toBe('2');
    p.destroy();
    // Destroyed rows stop listening.
    fits = 100;
    window.dispatchEvent(new Event('resize'));
    expect(p.el.dataset.tight).toBe('2');
  });
});

describe('the win flow in the 2c.1 row (§10.3)', () => {
  it('the first showPeriodCounter fades the cat counter out in its cell while the period counter fades in; points stay put', () => {
    vi.useFakeTimers();
    const p = createPills({ ...base, catsPlaced: 8, points: 7296 });
    document.body.appendChild(p.el);
    const cats = p.el.querySelector<HTMLElement>('.pill--cats') as HTMLElement;
    p.showPeriodCounter(39);
    const period = p.el.querySelector<HTMLElement>('.period-pill') as HTMLElement;
    expect(period.hidden).toBe(false);
    expect(period.classList.contains('period-pill--in')).toBe(true);
    expect(cats.hasAttribute('data-out')).toBe(true);
    expect(cats.hidden).toBe(false);
    vi.advanceTimersByTime(cfg.fx.win.fishPillFadeMs);
    expect(cats.hidden).toBe(true);
    // The points counter keeps the level's total, highlighted, through the whole flow.
    expect(counter(p).hidden).toBe(false);
    expect(counter(p).hasAttribute('data-final')).toBe(true);
    expect(nums(p)).toEqual(['7,296']);
    // Arrivals still roll the period counter (not the points).
    p.showPeriodCounter(40);
    expect(period.querySelector('.period-pill__n.is-in')?.textContent).toBe('40');
    expect(period.querySelector('.period-pill__n.is-out')?.textContent).toBe('39');
    expect(p.periodRect()).not.toBeNull();
  });

  it('reduced motion: the cat counter goes at once; a new board brings it back and hides the period counter', () => {
    const p = createPills({ ...base, catsPlaced: 8, points: 7296, reducedMotion: true });
    p.showPeriodCounter(41);
    const cats = p.el.querySelector<HTMLElement>('.pill--cats') as HTMLElement;
    const period = p.el.querySelector<HTMLElement>('.period-pill') as HTMLElement;
    expect(cats.hidden).toBe(true);
    expect(cats.hasAttribute('data-out')).toBe(false);
    expect(period.hidden).toBe(false);
    p.update({ ...base, catsPlaced: 0, points: 0, reducedMotion: true });
    expect(cats.hidden).toBe(false);
    expect(cats.hasAttribute('data-out')).toBe(false);
    expect(period.hidden).toBe(true);
    expect(p.periodRect()).toBeNull();
    // The next win shows it again with a fresh fade.
    p.update({ ...base, catsPlaced: 8, points: 7296, reducedMotion: false });
    p.showPeriodCounter(42);
    expect(period.hidden).toBe(false);
    expect(period.querySelector('.period-pill__n')?.textContent).toBe('42');
  });

  it('destroy clears the counter\'s timers too', () => {
    vi.useFakeTimers();
    const p = createPills({ ...base, catsPlaced: 7, points: 6048 });
    p.playEvent(pts(1248, 7296, 8));
    p.update({ ...base, catsPlaced: 8, points: 7296 });
    p.showPeriodCounter(1);
    p.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
