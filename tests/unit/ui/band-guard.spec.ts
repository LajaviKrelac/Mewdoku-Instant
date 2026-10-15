// D-2e-25 review (2026-10-14, N4, N5; review #5, #3): a banner band is decided when a screen shows; when it changes on a
// screen already on show (an empty banner answer gives it back), the column moves by the band, so the screen's controls
// ignore taps for ads.banner.bandChangeGuardMs (400; 0 = none; only with ads.banner.collapseWhenEmpty):
// ui/overlays/overlay-base.ts createBandGuard on Home, the event screen, the victory and the streak screen. Never on the
// first render (nor a change in that render's own task, as the shell renders Home again with the band it just decided);
// released after the time; a second change re-arms it; stop() (close, destroy) clears it; it leaves aria-disabled alone,
// so the victory's buttonDelayMs gate and the streak's Continue gate are never released early. The streak screen
// follows the band given by update() (app/streak-screen-flow.ts followStreakBand).
// D-2e-25 review round 3 (2026-10-15, R3-1): a view that rebuilds Home or the event screen in place (inPlace) is on show
// from its first render, so a band change from then on, even in that render's task, arms the guard.
import { afterEach, describe, expect, it, vi } from 'vitest';
import eventsJson from '../../../src/data/events/events.json';
import { cfg, mergeConfig } from '../../../src/app/config';
import type { EventDef } from '../../../src/game/events';
import { bandGuardMs, createBandGuard } from '../../../src/ui/overlays/overlay-base';
import { createStreakScreen, type StreakScreenProps } from '../../../src/ui/overlays/streak-screen';
import { createVictoryScreen, type VictoryProps } from '../../../src/ui/overlays/victory-screen';
import { createEventScreen, type EventScreenView } from '../../../src/ui/screens/event-screen';
import { createHomeScreen, type HomeView } from '../../../src/ui/screens/home-screen';

afterEach(() => {
  vi.useRealTimers();
  document.body.textContent = '';
});

const GUARD = cfg.ads.banner.bandChangeGuardMs;
const q = <E extends Element = HTMLElement>(root: ParentNode, sel: string): E => {
  const el = root.querySelector<E>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};
const guarded = (el: Element): boolean => el.hasAttribute('data-band-guard');

describe('createBandGuard (overlay-base)', () => {
  function fixture(ms: () => number = () => GUARD) {
    const root = document.createElement('div');
    const btn = document.createElement('button');
    const pressed = vi.fn();
    btn.addEventListener('click', pressed);
    root.append(btn);
    document.body.append(root);
    return { root, btn, pressed, guard: createBandGuard(root, ms) };
  }

  it('the config: 400 ms with collapseWhenEmpty; 0 (no guard) with it off', () => {
    expect(GUARD).toBe(400);
    expect(bandGuardMs()).toBe(400);
    expect(bandGuardMs(mergeConfig({ ads: { banner: { collapseWhenEmpty: false } } }))).toBe(0);
    expect(bandGuardMs(mergeConfig({ ads: { banner: { bandChangeGuardMs: 0 } } }))).toBe(0);
  });

  it('never on the first render, nor on a change in that render\'s own task; a change on show swallows taps for the time', () => {
    vi.useFakeTimers();
    const f = fixture();
    f.guard.band(true); // the first render
    f.guard.band(false); // the same task (nothing painted yet)
    f.btn.click();
    expect(f.pressed).toHaveBeenCalledTimes(1);
    expect(f.guard.active()).toBe(false);
    vi.advanceTimersByTime(0); // on show now
    f.guard.band(false); // no change
    expect(f.guard.active()).toBe(false);
    f.guard.band(true); // the band changed on show
    expect([f.guard.active(), guarded(f.root)]).toEqual([true, true]);
    f.btn.click();
    expect(f.pressed).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(GUARD - 1);
    f.btn.click();
    expect(f.pressed).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect([f.guard.active(), guarded(f.root)]).toEqual([false, false]);
    f.btn.click();
    expect(f.pressed).toHaveBeenCalledTimes(2);
  });

  it('a second change re-arms it for the full time; stop() releases it and forgets the band; 0 ms: never', () => {
    vi.useFakeTimers();
    const f = fixture();
    f.guard.first(true);
    vi.advanceTimersByTime(0);
    f.guard.band(false);
    vi.advanceTimersByTime(300);
    f.guard.band(true);
    vi.advanceTimersByTime(300);
    expect(f.guard.active()).toBe(true); // 600 ms after the first change, 300 after the second
    vi.advanceTimersByTime(100);
    expect(f.guard.active()).toBe(false);
    f.guard.band(false);
    expect(f.guard.active()).toBe(true);
    f.guard.stop();
    expect([f.guard.active(), guarded(f.root)]).toEqual([false, false]);
    expect(vi.getTimerCount()).toBe(0); // nothing left to fire
    f.guard.band(true); // the next render is a first one again
    expect(f.guard.active()).toBe(false);
    const none = fixture(() => 0);
    none.guard.first(true);
    vi.advanceTimersByTime(0);
    none.guard.band(false);
    none.btn.click();
    expect([none.guard.active(), none.pressed.mock.calls.length]).toEqual([false, 1]);
  });

  it('leaves aria-disabled alone (another rule\'s gate)', () => {
    vi.useFakeTimers();
    const f = fixture();
    f.btn.setAttribute('aria-disabled', 'true');
    f.guard.first(true);
    vi.advanceTimersByTime(0);
    f.guard.band(false);
    vi.advanceTimersByTime(GUARD);
    expect(f.btn.getAttribute('aria-disabled')).toBe('true');
  });
});

// ─────────────────────────────── Home ───────────────────────────────

const homeView = (over: Partial<HomeView> = {}): HomeView => ({
  level: 37,
  hard: false,
  continueLevel: false,
  daily: { state: 'not_played', dateKey: '2026-10-06', n: 8, solvedMs: null, unlockLevel: 20 },
  hints: 5,
  kitties: 3,
  fbSafeZone: false,
  extraCards: [],
  period: { kind: 'week', total: 42 },
  event: null,
  bannerReserved: true,
  settingsDot: false,
  ladder: null,
  streak: null,
  ...over,
});
const homeCb = () => ({ onPlay: vi.fn(), onDaily: vi.fn(), onSettings: vi.fn(), onCard: vi.fn(), onEvent: vi.fn(), onLadder: vi.fn() });

describe('Home (review #5: a tap aimed at Daily must not land on Play)', () => {
  it('not on the first render (nor the shell\'s render in the same task); the band given back on show: no tap for 400 ms', () => {
    vi.useFakeTimers();
    const cb = homeCb();
    const home = createHomeScreen(homeView({ bannerReserved: true }), cb);
    document.body.appendChild(home.el);
    home.update(homeView({ bannerReserved: false })); // the shell's render after screenShown('home'), same task
    q<HTMLButtonElement>(home.el, '.daily-card').click();
    expect(cb.onDaily).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    home.update(homeView({ bannerReserved: true })); // (a band coming back never happens: banner-flow N2; still guarded)
    vi.advanceTimersByTime(GUARD);
    home.update(homeView({ bannerReserved: false })); // a miss lands while Home is on show
    expect(home.el.hasAttribute('data-banner')).toBe(false);
    expect(guarded(home.el)).toBe(true);
    q<HTMLButtonElement>(home.el, '.home__play').click();
    q<HTMLButtonElement>(home.el, '.daily-card').click();
    q<HTMLButtonElement>(home.el, '.home__profile').click();
    q<HTMLButtonElement>(home.el, '.top-bar__btn--settings').click(); // the gear (hud/top-bar.ts: a click it never checks)
    expect([cb.onPlay, cb.onDaily, cb.onSettings].map((f) => f.mock.calls.length)).toEqual([0, 1, 0]);
    home.update(homeView({ bannerReserved: false, hints: 4 })); // another render, same band: no new guard
    vi.advanceTimersByTime(GUARD - 1);
    q<HTMLButtonElement>(home.el, '.home__play').click();
    expect(cb.onPlay).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    q<HTMLButtonElement>(home.el, '.home__play').click();
    expect(cb.onPlay).toHaveBeenCalledTimes(1);
  });

  it('D-2e-25 review round 3 (R3-1): a view rebuilding Home in place (inPlace) is on show from its first render: a change even in that task arms it; the same band does not', () => {
    vi.useFakeTimers();
    const cb = homeCb();
    const home = createHomeScreen(homeView({ bannerReserved: true, inPlace: true }), cb);
    document.body.appendChild(home.el);
    home.update(homeView({ bannerReserved: true })); // the shell's render in the same task, the same band: nothing
    expect(guarded(home.el)).toBe(false);
    home.update(homeView({ bannerReserved: false })); // the band in view changed: the column moves
    expect(guarded(home.el)).toBe(true);
    q<HTMLButtonElement>(home.el, '.home__play').click();
    expect(cb.onPlay).not.toHaveBeenCalled();
    vi.advanceTimersByTime(GUARD);
    q<HTMLButtonElement>(home.el, '.home__play').click();
    expect(cb.onPlay).toHaveBeenCalledTimes(1);
    home.destroy();
  });

  it('destroyed while guarded: nothing left behind', () => {
    vi.useFakeTimers();
    const home = createHomeScreen(homeView(), homeCb());
    document.body.appendChild(home.el);
    vi.advanceTimersByTime(0);
    home.update(homeView({ bannerReserved: false }));
    expect(guarded(home.el)).toBe(true);
    home.destroy();
    expect(guarded(home.el)).toBe(false);
  });
});

// ─────────────────────────────── the event screen ───────────────────────────────

const lantern = (eventsJson as unknown as EventDef[])[0] as EventDef;
const eventView = (over: Partial<EventScreenView> = {}): EventScreenView => ({
  def: lantern,
  now: 0,
  endsAt: 3 * 86_400_000,
  solved: 7,
  total: 21,
  track: lantern.track.map((m) => ({ ...m, reached: 7 >= m.at })),
  nextIndex: 7,
  fbSafeZone: false,
  reducedMotion: false,
  bannerReserved: true,
  settingsDot: false,
  ...over,
});

describe('the event screen (review #5: Home must not land on Top list)', () => {
  it('the band given back on show: Play, Top list and Home ignore taps for 400 ms; not on the first render', () => {
    vi.useFakeTimers();
    const cb = { onPlay: vi.fn(), onTopList: vi.fn(), onHome: vi.fn(), onSettings: vi.fn() };
    const scr = createEventScreen(eventView(), cb);
    document.body.appendChild(scr.el);
    q<HTMLButtonElement>(scr.el, '.event__home').click();
    expect(cb.onHome).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    scr.update(eventView({ bannerReserved: false }));
    expect(guarded(scr.el)).toBe(true);
    for (const sel of ['.event__play', '.event__top', '.event__home']) q<HTMLButtonElement>(scr.el, sel).click();
    expect([cb.onPlay, cb.onTopList, cb.onHome].map((f) => f.mock.calls.length)).toEqual([0, 0, 1]);
    // The buttons' own state is untouched (no aria-disabled flash).
    expect(q(scr.el, '.event__top').hasAttribute('aria-disabled')).toBe(false);
    vi.advanceTimersByTime(GUARD);
    q<HTMLButtonElement>(scr.el, '.event__top').click();
    expect(cb.onTopList).toHaveBeenCalledTimes(1);
    scr.destroy();
  });

  it('D-2e-25 review round 3 (R3-1): rebuilt in place (inPlace, built before the chunk import): the shell\'s render with a band that changed meanwhile arms it at once; without inPlace that render never does', () => {
    vi.useFakeTimers();
    for (const inPlace of [true, false]) {
      const cb = { onPlay: vi.fn(), onTopList: vi.fn(), onHome: vi.fn(), onSettings: vi.fn() };
      const scr = createEventScreen(eventView({ bannerReserved: true, ...(inPlace ? { inPlace } : {}) }), cb);
      document.body.appendChild(scr.el);
      scr.update(eventView({ bannerReserved: false })); // shell.showEvent's render with the latest reserve, same task
      expect(guarded(scr.el), `inPlace ${inPlace}`).toBe(inPlace);
      q<HTMLButtonElement>(scr.el, '.event__home').click();
      expect(cb.onHome, `inPlace ${inPlace}`).toHaveBeenCalledTimes(inPlace ? 0 : 1);
      scr.destroy();
    }
  });
});

// ─────────────────────────────── the victory ───────────────────────────────

function victoryProps(over: Partial<VictoryProps> = {}): VictoryProps {
  return {
    variant: 'level',
    praise: 0,
    level: 37,
    nextLevel: 38,
    pointsEarned: 55,
    kept: { fish: 3, max: 3 },
    daily: null,
    event: null,
    buttonDelayMs: 600,
    reducedMotion: false,
    bannerReserved: true,
    streak: null,
    dailyReward: null,
    now: () => 0,
    onPrimary: vi.fn(),
    ...over,
  };
}

describe('the victory (with its buttonDelayMs gate)', () => {
  function open(p: VictoryProps) {
    const v = createVictoryScreen();
    document.body.appendChild(v.el);
    v.open(p);
    return { v, root: q(v.el, '.victory'), primary: q<HTMLButtonElement>(v.el, '.victory__primary') };
  }

  it('not on open: the primary is live once buttonDelayMs has passed', () => {
    vi.useFakeTimers();
    const p = victoryProps();
    const { primary, root } = open(p);
    vi.advanceTimersByTime(600);
    expect(guarded(root)).toBe(false);
    primary.click();
    expect(p.onPrimary).toHaveBeenCalledTimes(1);
  });

  it('a change inside the delay: the guard ends first, the delay gate still holds (never released early)', () => {
    vi.useFakeTimers();
    const p = victoryProps();
    const { v, root, primary } = open(p);
    vi.advanceTimersByTime(100);
    v.update({ ...p, bannerReserved: false }); // a miss lands on the open victory: guard until 500
    expect(root.hasAttribute('data-banner')).toBe(false);
    expect(guarded(root)).toBe(true);
    vi.advanceTimersByTime(400); // 500: the guard is over
    expect(guarded(root)).toBe(false);
    expect(primary.getAttribute('aria-disabled')).toBe('true'); // buttonDelayMs (600) still gates it
    primary.click();
    expect(p.onPrimary).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(primary.hasAttribute('aria-disabled')).toBe(false);
    primary.click();
    expect(p.onPrimary).toHaveBeenCalledTimes(1);
  });

  it('a change near the delay\'s end: the delay releases first, the guard still holds', () => {
    vi.useFakeTimers();
    const p = victoryProps();
    const { v, root, primary } = open(p);
    vi.advanceTimersByTime(500);
    v.update({ ...p, bannerReserved: false }); // guard until 900
    vi.advanceTimersByTime(200); // 700: the delay released the primary, the guard holds it
    expect(primary.hasAttribute('aria-disabled')).toBe(false);
    expect(guarded(root)).toBe(true);
    primary.click();
    expect(p.onPrimary).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    primary.click();
    expect(p.onPrimary).toHaveBeenCalledTimes(1);
  });

  it('closed while guarded: released; reopened with another band: no guard (a first render)', () => {
    vi.useFakeTimers();
    const p = victoryProps();
    const { v, root, primary } = open(p);
    vi.advanceTimersByTime(700);
    v.update({ ...p, bannerReserved: false });
    expect(guarded(root)).toBe(true);
    v.close();
    expect(guarded(root)).toBe(false);
    v.open({ ...p, bannerReserved: true, buttonDelayMs: 0 });
    expect(guarded(root)).toBe(false);
    primary.click();
    expect(p.onPrimary).toHaveBeenCalledTimes(1);
    v.destroy();
  });
});

// ─────────────────────────────── the streak screen ───────────────────────────────

function streakProps(over: Partial<StreakScreenProps> = {}): StreakScreenProps {
  return {
    mode: 'win',
    streak: { state: 'done', day: 3, total: 7, rewardDay: false, run: 3 },
    best: 4,
    week: [],
    reward: null,
    buttonDelayMs: 600,
    bannerReserved: true,
    reducedMotion: false,
    onDone: vi.fn(),
    ...over,
  };
}

describe('the streak screen (N5: it follows the band; with its Continue gate)', () => {
  function open(p: StreakScreenProps) {
    const v = createStreakScreen();
    document.body.appendChild(v.el);
    v.open(p);
    return { v, root: q(v.el, '.streak-screen') };
  }

  it('an update with the band given back drops data-banner and guards Continue; the Continue gate is never released early', () => {
    vi.useFakeTimers();
    const p = streakProps();
    const { v, root } = open(p);
    const cont = q<HTMLButtonElement>(root, '.streak-screen__continue');
    expect(root.hasAttribute('data-banner')).toBe(true);
    vi.advanceTimersByTime(100);
    v.update({ ...p, bannerReserved: false }); // guard until 500
    expect(root.hasAttribute('data-banner')).toBe(false);
    vi.advanceTimersByTime(400);
    expect(guarded(root)).toBe(false);
    expect(cont.getAttribute('aria-disabled')).toBe('true'); // its own gate (600)
    cont.click();
    expect(p.onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    cont.click();
    expect(p.onDone).toHaveBeenCalledTimes(1);
  });

  it('after the Continue gate (and from Home\'s pill: the back arrow): taps wait for the guard after a change', () => {
    vi.useFakeTimers();
    const p = streakProps();
    const { v, root } = open(p);
    const cont = q<HTMLButtonElement>(root, '.streak-screen__continue');
    vi.advanceTimersByTime(700);
    v.update({ ...p, bannerReserved: false });
    cont.click();
    expect(p.onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(GUARD);
    cont.click();
    expect(p.onDone).toHaveBeenCalledTimes(1);
    v.close();
    const h = streakProps({ mode: 'home' });
    v.open(h);
    const back = q<HTMLButtonElement>(root, '.streak-screen__back');
    back.click(); // not on open
    expect(h.onDone).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(0);
    v.update({ ...h, bannerReserved: false });
    back.click();
    expect(h.onDone).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(GUARD);
    back.click();
    expect(h.onDone).toHaveBeenCalledTimes(2);
    v.destroy();
  });
});
