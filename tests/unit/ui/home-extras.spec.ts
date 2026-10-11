// Owner: lead (Phase 2e I-4, spec §7.9's rule "the strip and the chip move to the core lazy chunk (Home renders the
// period pill until it lands)"). Home before and after the lazy overlay chunk brings the chip and the strip: the period
// pill and an invisible row of the strip's size first (no flash, no layout jump), then both in place, once.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLadderChip, type LadderChipView } from '../../../src/ui/hud/ladder-chip';
import { createStreakStrip } from '../../../src/ui/hud/streak-strip';
import { homeExtras, provideHomeExtras } from '../../../src/ui/screens/home-extras';
import { createHomeScreen, type HomeView } from '../../../src/ui/screens/home-screen';

afterEach(() => {
  document.body.textContent = '';
});

const q = <E extends Element = HTMLElement>(root: ParentNode, sel: string): E => {
  const el = root.querySelector<E>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};

const BRACKET: LadderChipView = { state: 'bracket', rank: 5, members: 37, points: 14, endsAt: 1_000_000, now: () => 0 };
const view = (over: Partial<HomeView> = {}): HomeView => ({
  level: 37,
  hard: false,
  continueLevel: false,
  daily: { state: 'not_played', dateKey: '2026-10-06', n: 8, solvedMs: null, unlockLevel: 21 },
  hints: 5,
  kitties: 3,
  fbSafeZone: false,
  extraCards: [],
  period: { kind: 'week', total: 42 },
  event: null,
  bannerReserved: false,
  settingsDot: false,
  ladder: BRACKET,
  streak: { state: 'alive', day: 3, total: 7, rewardDay: false },
  ...over,
});
const cb = () => ({ onPlay: vi.fn(), onDaily: vi.fn(), onSettings: vi.fn(), onCard: vi.fn(), onEvent: vi.fn(), onLadder: vi.fn() });

describe('Home before and after the overlay chunk (Phase 2e I-4)', () => {
  it('a Home destroyed while waiting is never touched again', () => {
    // Runs first (the chunk has not "landed" yet in this file): the destroyed Home drops its waiter.
    const home = createHomeScreen(view(), cb());
    document.body.appendChild(home.el);
    expect(home.el.querySelector('.streak-strip--pending')).not.toBeNull();
    home.destroy();
    expect(homeExtras()).toBeNull();
  });

  it('before: the period pill and the strip\'s invisible row; after: the chip and the strip in that row, with no reload of Home', () => {
    expect(homeExtras()).toBeNull(); // this file's module graph starts without the chunk
    const callbacks = cb();
    const home = createHomeScreen(view(), callbacks);
    document.body.appendChild(home.el);
    expect(q(home.el, '.period-pill').hidden).toBe(false);
    expect(home.el.querySelector('.ladder-chip')).toBeNull();
    const pending = q(home.el, '.streak-strip--pending');
    expect(pending.getAttribute('aria-hidden')).toBe('true');
    expect(pending.previousElementSibling?.classList.contains('home__play')).toBe(true);
    expect(home.el.hasAttribute('data-streak')).toBe(true);
    // A second render while waiting changes nothing (one row, one waiter).
    home.update(view({ hints: 4 }));
    expect(home.el.querySelectorAll('.streak-strip')).toHaveLength(1);

    provideHomeExtras({ createLadderChip, createStreakStrip });
    expect(home.el.querySelector('.streak-strip--pending')).toBeNull();
    const strip = q(home.el, '.home__play').nextElementSibling as HTMLElement;
    expect(strip.classList.contains('streak-strip')).toBe(true);
    expect(strip.classList.contains('streak-strip--pending')).toBe(false);
    expect(strip.nextElementSibling?.classList.contains('daily-card')).toBe(true);
    const chip = q<HTMLButtonElement>(home.el, '.top-bar__slot button.ladder-chip[data-state="bracket"]');
    expect(q(home.el, '.period-pill').hidden).toBe(true);
    chip.click();
    expect(callbacks.onLadder).toHaveBeenCalledTimes(1);
    // Later renders update the same chip and strip.
    home.update(view({ streak: { state: 'done', day: 4, total: 7, rewardDay: false } }));
    expect(home.el.querySelectorAll('.streak-strip')).toHaveLength(1);
    home.destroy();
  });

});
