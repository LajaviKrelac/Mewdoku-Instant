// Owner: B (Phase 2b); G2 (Phase 2c, 2c.1); G3 (Phase 2d). The pills row: the HEADS pill (Phase 2d,
// look-spec §1.5–§1.6: one head per colour in HEAD_ORDER, a tint until found, the pop on REGION_DONE,
// the un-fill when a cat is taken back) and the LIVES pill (Phase 2c: the lives are fish,
// fish-lives-spec §1), the fish loss on MISTAKE (§1.3) and the revive pop (§1.4), the win flow's
// lift-off (lifeSlots, departLife, §2.2–§2.3), the in-game period counter over the heads pill (§2.1,
// look-spec §1.13) and the Home period pill (createPeriodPill, §2.8). The 2c.1 level-points counter
// moved to the game bar's Score column (hud.spec.ts); the cat counter and the tight fallback are gone.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import * as pillsModule from '../../../src/ui/hud/pills';
import { HEAD_ORDER } from '../../../src/ui/art/palette';
import { createPeriodPill, createPills, headColors, headScale, LOSS_DROP_FLY, LOSS_DROPS, POP_DROPS, type PillsProps } from '../../../src/ui/hud/pills';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.textContent = '';
});

const base: PillsProps = { catsPlaced: 0, n: 8, hearts: 3, maxHearts: 3, compact: false };

const uses = (el: Element | null | undefined): string[] => Array.from(el?.querySelectorAll('use') ?? []).map((u) => u.getAttribute('href') ?? '');

describe('the lives pill (§1.1)', () => {
  it('shows the heads pill and maxHearts fish slots with accessible labels; no heart, no cat counter', () => {
    const p = createPills({ catsPlaced: 3, n: 8, hearts: 2, maxHearts: 3, compact: false });
    expect(p.el.querySelector('.pill--cats, .pill__count, .points-pill')).toBeNull();
    expect(p.el.querySelector('.pill--heads')?.getAttribute('aria-label')).toBe('3 of 8 cats placed');
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
    // Phase 2d: the compact sizes are retired (the prop is ignored until I-3).
    p.update({ catsPlaced: 4, n: 8, hearts: 2, maxHearts: 3, compact: true });
    expect(p.el.hasAttribute('data-compact')).toBe(false);
    expect(p.el.hasAttribute('data-tight')).toBe(false);
    expect(p.el.querySelector('.pill--heads')?.getAttribute('aria-label')).toBe('4 of 8 cats placed');
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
    // Phase 2d (§1.13): it shares the heads pill's cell, so it follows the heads pill in the DOM.
    const kids = Array.from(p.el.children).map((c) => c.className);
    expect(kids).toEqual(['pill pill--heads', 'period-pill', 'pill pill--lives']);
    expect(p.el.querySelector('.fish-pill, .points-pill')).toBeNull();
  });

  it('fades in with the period total before the win, then counts up once per arrival with a roll and a bump', () => {
    vi.useFakeTimers();
    const p = createPills(base);
    document.body.appendChild(p.el);
    p.showPeriodCounter(39);
    const counter = p.el.querySelector<HTMLElement>('.period-pill') as HTMLElement;
    expect(counter.hidden).toBe(false);
    expect(counter.classList.contains('period-pill--in')).toBe(true);
    // The fade time is the row's (the heads fade out over the same time, §1.13).
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

// ─────────────────────────── Phase 2d: the heads pill (look-spec §1.5, §1.6) ───────────────────────────

/** A 3 × 3-region board: region r has palette colour colors[r]. */
const board3 = { n: 3, colors: [7, 0, 3] } as const;
const heads = (p: { el: HTMLElement }): SVGElement[] => Array.from(p.el.querySelectorAll<SVGElement>('.pill--heads > svg.head'));
const done = (p: { el: HTMLElement }): string[] => heads(p).filter((h) => h.hasAttribute('data-done')).map((h) => h.dataset.color ?? '');

describe('the heads pill (look-spec §1.6)', () => {
  it('holds one flat head per colour on the board, in HEAD_ORDER, each in its region colour', () => {
    const p = createPills({ ...base, ...board3, colors: [...board3.colors] });
    const hs = heads(p);
    // Violet (7), Coral (0), Lime (3) in heads order: Lime, Violet, Coral.
    expect(hs.map((h) => h.dataset.color)).toEqual(['3', '7', '0']);
    expect(hs.map((h) => uses(h)[0])).toEqual(['#cat-head-flat', '#cat-head-flat', '#cat-head-flat']);
    expect(hs.map((h) => h.style.color)).toEqual(['var(--r3)', 'var(--r7)', 'var(--r0)']);
    for (const h of hs) expect(h.getAttribute('aria-hidden')).toBe('true');
    expect(done(p)).toEqual([]);
    const pill = p.el.querySelector('.pill--heads') as HTMLElement;
    expect(pill.getAttribute('role')).toBe('img');
    expect(pill.getAttribute('aria-label')).toBe('0 of 3 cats placed');
    // The measured order of the recording's 10 colours (§1.6), and a 12 × 12 board's.
    expect(headColors([0, 1, 2, 3, 5, 6, 7, 8, 10, 11], 10)).toEqual([3, 5, 6, 10, 7, 8, 11, 0, 1, 2]);
    expect(headColors(Array.from({ length: 12 }, (_, i) => i), 12)).toEqual([...HEAD_ORDER]);
    // Without colours (a dev harness): region r is colour r.
    expect(heads(createPills(base)).map((h) => h.dataset.color)).toEqual(HEAD_ORDER.filter((c) => c < 8).map(String));
  });

  it('sizes: 10 heads next to 3 fish fit at full size; 11 and 12 shrink together (12 heads: 17.7 s)', () => {
    expect(headScale(10, 3)).toBe(1);
    expect(headScale(11, 3)).toBeCloseTo(0.908, 2);
    expect(21.33 * headScale(12, 3)).toBeCloseTo(17.7, 1);
    // One more fish takes room from the heads.
    expect(headScale(10, 4)).toBeLessThan(1);
    const p = createPills({ ...base, n: 12, colors: Array.from({ length: 12 }, (_, i) => i) });
    expect((p.el.querySelector('.pill--heads') as HTMLElement).style.getPropertyValue('--hk')).toBe(String(Math.round(headScale(12, 3) * 1000) / 1000));
  });

  it('a found colour turns full from the props without motion; REGION_DONE pops its head (fx.headFoundMs)', () => {
    vi.useFakeTimers();
    const p = createPills({ ...base, ...board3, colors: [...board3.colors], boardId: 'L1' });
    expect(p.el.style.getPropertyValue('--head-ms')).toBe(`${cfg.fx.headFoundMs}ms`);
    // The session updates the props, then plays REGION_DONE for region 1 (Coral).
    p.update({ ...base, ...board3, colors: [...board3.colors], boardId: 'L1', catsPlaced: 1, regionsDone: 0b010 });
    expect(done(p)).toEqual(['0']);
    const coral = heads(p)[2] as SVGElement;
    expect(coral.classList.contains('head--pop')).toBe(false);
    p.playEvent({ type: 'REGION_DONE', region: 1 });
    expect(coral.classList.contains('head--pop')).toBe(true);
    vi.advanceTimersByTime(cfg.fx.headFoundMs);
    expect(coral.classList.contains('head--pop')).toBe(false);
    // The event before the props works the same.
    p.playEvent({ type: 'REGION_DONE', region: 0 });
    expect(done(p)).toEqual(['7', '0']);
    expect((heads(p)[1] as SVGElement).classList.contains('head--pop')).toBe(true);
    p.destroy();
  });

  it('a cat taken back fades its head to the tint (fx.reducedMotionFadeMs), no pop; restores and new boards set it without motion', () => {
    vi.useFakeTimers();
    const v = { ...base, ...board3, colors: [...board3.colors], boardId: 'L1' };
    // A restore with two colours found: no motion.
    const p = createPills({ ...v, catsPlaced: 2, regionsDone: 0b011 });
    expect(done(p)).toEqual(['7', '0']);
    expect(p.el.querySelector('.head--pop, .head--out')).toBeNull();
    // CAT_REMOVED in region 1: the view diffs regionsDone.
    p.update({ ...v, catsPlaced: 1, regionsDone: 0b001 });
    expect(done(p)).toEqual(['7']);
    const coral = heads(p)[2] as SVGElement;
    expect(coral.classList.contains('head--out')).toBe(true);
    vi.advanceTimersByTime(cfg.fx.reducedMotionFadeMs);
    expect(coral.classList.contains('head--out')).toBe(false);
    // A new board with the same colours (the next level): every head back to the tint, without motion.
    p.update({ ...v, boardId: 'L2', catsPlaced: 0, regionsDone: 0 });
    expect(done(p)).toEqual([]);
    expect(p.el.querySelector('.head--out')).toBeNull();
    // A board with other colours rebuilds the heads.
    p.update({ ...base, n: 2, colors: [1, 2], boardId: 'L3' });
    expect(heads(p).map((h) => h.dataset.color)).toEqual(['1', '2']);
  });

  it('reduced motion: the colour changes in place (no pop, no fade)', () => {
    const v = { ...base, ...board3, colors: [...board3.colors], reducedMotion: true };
    const p = createPills(v);
    p.update({ ...v, regionsDone: 0b100 });
    p.playEvent({ type: 'REGION_DONE', region: 2 });
    expect(done(p)).toEqual(['3']);
    p.update({ ...v, regionsDone: 0 });
    expect(done(p)).toEqual([]);
    expect(p.el.querySelector('.head--pop, .head--out')).toBeNull();
  });
});

describe('the win flow over the heads pill (look-spec §1.13)', () => {
  it('the first showPeriodCounter fades the heads out in their cell while the period counter fades in', () => {
    vi.useFakeTimers();
    const p = createPills({ ...base, catsPlaced: 8 });
    document.body.appendChild(p.el);
    const hp = p.el.querySelector<HTMLElement>('.pill--heads') as HTMLElement;
    p.showPeriodCounter(39);
    const period = p.el.querySelector<HTMLElement>('.period-pill') as HTMLElement;
    expect(period.hidden).toBe(false);
    expect(period.classList.contains('period-pill--in')).toBe(true);
    expect(hp.hasAttribute('data-out')).toBe(true);
    expect(hp.hidden).toBe(false);
    vi.advanceTimersByTime(cfg.fx.win.fishPillFadeMs);
    expect(hp.hidden).toBe(true);
    // Arrivals roll the period counter.
    p.showPeriodCounter(40);
    expect(period.querySelector('.period-pill__n.is-in')?.textContent).toBe('40');
    expect(period.querySelector('.period-pill__n.is-out')?.textContent).toBe('39');
    expect(p.periodRect()).not.toBeNull();
    // Critic C10: the "+3" sits inside the pill, in the box around the total (never above the pill).
    p.periodLabel('+3');
    const label = period.querySelector('.period-pill__label') as HTMLElement;
    expect(label.parentElement?.classList.contains('period-pill__val')).toBe(true);
    expect(label.parentElement?.querySelector('.period-pill__count')).not.toBeNull();
  });

  it('reduced motion: the heads go at once; a new board brings them back and hides the period counter', () => {
    const p = createPills({ ...base, catsPlaced: 8, reducedMotion: true });
    p.showPeriodCounter(41);
    const hp = p.el.querySelector<HTMLElement>('.pill--heads') as HTMLElement;
    const period = p.el.querySelector<HTMLElement>('.period-pill') as HTMLElement;
    expect(hp.hidden).toBe(true);
    expect(hp.hasAttribute('data-out')).toBe(false);
    expect(period.hidden).toBe(false);
    p.update({ ...base, catsPlaced: 0, reducedMotion: true });
    expect(hp.hidden).toBe(false);
    expect(hp.hasAttribute('data-out')).toBe(false);
    expect(period.hidden).toBe(true);
    expect(p.periodRect()).toBeNull();
    p.update({ ...base, catsPlaced: 8, reducedMotion: false });
    p.showPeriodCounter(42);
    expect(period.hidden).toBe(false);
    expect(period.querySelector('.period-pill__n')?.textContent).toBe('42');
  });

  it('Home\'s period pill keeps its chip on the pill itself (the 2c rule)', () => {
    const pill = createPeriodPill({ total: 3, kind: 'week' });
    expect(pill.el.querySelector('.period-pill__val')).toBeNull();
    pill.destroy();
  });

  it('destroy clears the heads\' timers too', () => {
    vi.useFakeTimers();
    const v = { ...base, ...board3, colors: [...board3.colors] };
    const p = createPills({ ...v, regionsDone: 0b001 });
    p.update({ ...v, regionsDone: 0 });
    p.playEvent({ type: 'REGION_DONE', region: 2 });
    p.update({ ...v, catsPlaced: 3 });
    p.showPeriodCounter(1);
    p.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
