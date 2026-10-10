// Owner: B (Phase 2b; was ui-shell); G3 (Phase 2d: the game bar, the stack variables, M, the start toast, the band).
// S0 boot, S1 home (daily card states, level button) and S2 game composition.
// ui-board's HUD and board are replaced by recording fakes: this checks the wiring, not their DOM.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rec = vi.hoisted(() => ({ calls: [] as [string, string, unknown][], cb: new Map<string, Record<string, (...a: unknown[]) => void>>() }));

vi.mock('../../../src/ui/art/illustrations', () => ({
  illustration: (kind: string) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('data-illustration', kind);
    return svg;
  },
}));

vi.mock('../../../src/ui/hud/top-bar', () => ({
  createTopBar: (props: unknown, cb: Record<string, (...a: unknown[]) => void>) => {
    rec.cb.set('topbar', cb);
    rec.calls.push(['topbar', 'create', props]);
    const el = document.createElement('header');
    return { el, update: (p: unknown) => rec.calls.push(['topbar', 'update', p]), destroy: () => el.remove() };
  },
}));

function fakeView(name: string, extra: Record<string, unknown> = {}) {
  return (props: unknown, cb?: Record<string, (...a: unknown[]) => void>) => {
    if (cb) rec.cb.set(name, cb);
    rec.calls.push([name, 'create', props]);
    const el = document.createElement('div');
    el.className = `fake-${name}`;
    return {
      el,
      update: (p: unknown) => rec.calls.push([name, 'update', p]),
      playEvent: (e: unknown) => rec.calls.push([name, 'playEvent', e]),
      destroy: () => el.remove(),
      ...extra,
    };
  };
}
vi.mock('../../../src/ui/hud/game-bar', () => ({
  createGameBar: fakeView('topbar', { fit: () => rec.calls.push(['topbar', 'fit', null]) }),
}));
vi.mock('../../../src/ui/hud/pills', () => ({
  createPills: fakeView('pills'),
  createPeriodPill: fakeView('periodPill'),
}));
vi.mock('../../../src/ui/hud/rule-chips', () => ({ createRuleChips: fakeView('chips') }));
vi.mock('../../../src/ui/hud/tool-bar', () => ({ createToolBar: fakeView('tools', { toolRect: () => null }) }));
vi.mock('../../../src/ui/board/board-view', () => ({
  createBoardView: (model: unknown, input: Record<string, (...a: unknown[]) => void>) => {
    rec.cb.set('board', input);
    rec.calls.push(['board', 'create', model]);
    const el = document.createElement('div');
    const cell = document.createElement('button');
    cell.tabIndex = 0;
    el.append(cell);
    const log = (m: string) => (a?: unknown) => void rec.calls.push(['board', m, a]);
    return {
      el,
      update: log('update'),
      setSlot: log('setSlot'),
      setHighlight: log('setHighlight'),
      setLocked: log('setLocked'),
      setMood: log('setMood'),
      setAccessory: log('setAccessory'),
      playEvent: log('playEvent'),
      playEntry: log('playEntry'),
      focusCell: log('focusCell'),
      cellRect: () => null,
      cellElement: () => null,
      geometry: () => ({ left: 0, top: 0, pad: 12, slot: 40, n: 5 }),
      destroy: () => el.remove(),
    };
  },
}));

import { createBootScreen } from '../../../src/ui/screens/boot-screen';
import { createGameScreen, gameTitle, sameHighlight, type GameScreenCallbacks, type GameView } from '../../../src/ui/screens/game-screen';
import { createHomeScreen, type HomeCallbacks, type HomeView } from '../../../src/ui/screens/home-screen';
import type { HintStep } from '../../../src/engine/types';

const q = <E extends Element = HTMLElement>(root: ParentNode, sel: string): E => {
  const el = root.querySelector<E>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};
const callsOf = (name: string, method: string): unknown[] => rec.calls.filter(([n, m]) => n === name && m === method).map(([, , a]) => a);
const lastOf = (name: string, method: string): unknown => {
  const all = callsOf(name, method);
  return all[all.length - 1];
};

beforeEach(() => {
  rec.calls.length = 0;
  rec.cb.clear();
  document.body.textContent = '';
});

describe('S0 boot', () => {
  it('reports progress on a progressbar', () => {
    const boot = createBootScreen();
    document.body.append(boot.el);
    const bar = q(boot.el, '[role="progressbar"]');
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    boot.setProgress(62.4);
    expect(bar.getAttribute('aria-valuenow')).toBe('62');
    expect(q(boot.el, '.boot__pct').textContent).toBe('62%');
    boot.setProgress(140);
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
    expect(boot.el.getAttribute('aria-busy')).toBe('false');
    boot.destroy();
    expect(boot.el.isConnected).toBe(false);
  });
});

describe('S1 home', () => {
  const view = (over: Partial<HomeView> = {}): HomeView => ({
    level: 37,
    hard: false,
    continueLevel: false,
    daily: { state: 'not_played', dateKey: '2026-10-06', n: 8, solvedMs: null, unlockLevel: 20 },
    hints: 5,
    kitties: 3,
    showTrophy: false,
    fbSafeZone: false,
    extraCards: [],
    period: { kind: 'week', total: 42 },
    event: null,
    bannerReserved: false,
    settingsDot: false,
    ...over,
  });
  const callbacks = (): HomeCallbacks => ({
    onPlay: vi.fn(),
    onDaily: vi.fn(),
    onSettings: vi.fn(),
    onTrophy: vi.fn(),
    onCard: vi.fn(),
    onEvent: vi.fn(),
  });

  it('level button: plain, hard badge, continue', () => {
    const home = createHomeScreen(view(), callbacks());
    const play = q(home.el, '.home__play');
    expect(q(play, '.btn__label').textContent).toBe('Level 37');
    expect(q(play, '.badge--hard').hidden).toBe(true);
    home.update(view({ level: 40, hard: true }));
    expect(q(play, '.btn__label').textContent).toBe('Level 40');
    expect(q(play, '.badge--hard').hidden).toBe(false);
    home.update(view({ level: 41, continueLevel: true }));
    expect(q(play, '.btn__label').textContent).toBe('Continue · Level 41');
  });

  it('keeps the daily date on one line (UX-15)', () => {
    const home = createHomeScreen(view(), callbacks());
    const title = q(home.el, '.daily-card__title');
    expect(title.textContent).toBe('Daily puzzle · Tue 6 Oct');
    expect(Array.from(title.querySelectorAll('.nowrap')).map((e) => e.textContent)).toContain('Tue 6 Oct');
    home.destroy();
  });

  it('daily card states: locked, not played, in progress, solved', () => {
    const home = createHomeScreen(view({ daily: { state: 'locked', dateKey: '2026-10-06', n: 8, solvedMs: null, unlockLevel: 20 } }), callbacks());
    const card = q(home.el, '.daily-card');
    const sub = (): string | null => q(card, '.daily-card__sub').textContent;
    expect(card.dataset.state).toBe('locked');
    expect(q(card, '.daily-card__title').textContent).toBe('Daily puzzle · Tue 6 Oct');
    expect(sub()).toBe('Unlocks after level 20');
    expect(card.querySelector('.icon-lock')).not.toBeNull();
    home.update(view());
    expect(sub()).toBe('8×8 · Not played yet');
    expect(card.querySelector('.icon-calendar')).not.toBeNull();
    expect(card.getAttribute('aria-label')).toBe('Daily puzzle, Tue 6 Oct, 8×8, Not played yet');
    home.update(view({ daily: { state: 'in_progress', dateKey: '2026-10-07', n: 9, solvedMs: null, unlockLevel: 20 } }));
    expect(sub()).toBe('9×9 · In progress');
    home.update(view({ daily: { state: 'solved', dateKey: '2026-10-07', n: 9, solvedMs: 252_000, unlockLevel: 20 } }));
    expect(sub()).toBe('9×9 · Solved 4:12');
  });

  it('routes taps to the callbacks and shows the stock readout', () => {
    const cb = callbacks();
    const home = createHomeScreen(view({ extraCards: [{ id: 'events', title: 'Events', subtitle: 'Soon' }] }), cb);
    q(home.el, '.home__play').click();
    q(home.el, '.daily-card').click();
    q(home.el, '.home-card').click();
    rec.cb.get('topbar')?.onSettings?.();
    rec.cb.get('topbar')?.onTrophy?.();
    expect(cb.onPlay).toHaveBeenCalledTimes(1);
    expect(cb.onDaily).toHaveBeenCalledTimes(1);
    expect(cb.onCard).toHaveBeenCalledWith('events');
    expect(cb.onSettings).toHaveBeenCalledTimes(1);
    expect(cb.onTrophy).toHaveBeenCalledTimes(1);
    expect(q(home.el, '.stock__item--hints').getAttribute('aria-label')).toBe('Hints: 5');
    expect(q(home.el, '.stock__item--kitties').textContent).toBe('3');
    expect(callsOf('topbar', 'create')[0]).toMatchObject({ title: null, showHome: false, showSettings: true, showTrophy: false });
    // Phase 2c §2.8: the period pill (this week's fish), not the fish pill with a shop "+".
    expect(callsOf('periodPill', 'create')[0]).toEqual({ kind: 'week', total: 42 });
    home.update(view({ period: { kind: 'week', total: 45 } }));
    expect(lastOf('periodPill', 'update')).toEqual({ kind: 'week', total: 45 });
    home.update(view());
    expect(home.el.querySelectorAll('.home-card')).toHaveLength(0);
  });
});

describe('S2 game', () => {
  const step: HintStep = { kind: 'single', level: 1, focusUnits: [], focusCells: [3], effectCells: [], placeCell: 3 };
  const view = (over: Partial<GameView> = {}): GameView => ({
    mode: 'level',
    level: 37,
    dateKey: null,
    hard: false,
    showHome: true,
    hearts: 3,
    maxHearts: 3,
    catsPlaced: 2,
    status: 'playing',
    hints: 5,
    kitties: 3,
    hintsFree: false,
    bulbEnabled: true,
    pawEnabled: true,
    inputLocked: false,
    board: { puzzleId: 'L37', n: 5, regions: new Uint8Array(25), colors: new Uint8Array(5), cells: new Uint8Array(25), regionsDone: 0, patterns: false },
    highlight: null,
    chipHighlight: null,
    fbSafeZone: false,
    reducedMotion: false,
    event: null,
    points: null,
    pulse: null,
    mouse: { shown: false, enabled: false },
    videoRefill: false,
    bannerBand: false,
    settingsDot: false,
    ...over,
  });
  const callbacks = (): GameScreenCallbacks => ({
    onTap: vi.fn(),
    onDoubleTap: vi.fn(),
    onPaint: vi.fn(),
    onBulb: vi.fn(),
    onPaw: vi.fn(),
    onHome: vi.fn(),
    onSettings: vi.fn(),
    onMouse: vi.fn(),
  });

  it('titles levels, the tutorial and dailies', () => {
    expect(gameTitle({ mode: 'level', level: 37, dateKey: null })).toBe('Level 37');
    expect(gameTitle({ mode: 'tutorial', level: 1, dateKey: null })).toBe('Level 1');
    expect(gameTitle({ mode: 'daily', level: null, dateKey: '2026-10-06' })).toBe('Daily · Tue 6 Oct');
  });

  it('composes the HUD and board, runs the layout and forwards input', () => {
    const cb = callbacks();
    const game = createGameScreen(view(), cb);
    document.body.append(game.el);
    expect(callsOf('topbar', 'create')[0]).toMatchObject({ title: 'Level 37', showBack: true, settingsDot: false, points: null, final: false });
    expect(callsOf('board', 'setSlot').length).toBeGreaterThan(0);
    expect(game.el.style.getPropertyValue('--board')).toMatch(/px$/);
    rec.cb.get('board')?.tap?.(4);
    rec.cb.get('board')?.doubleTap?.(5);
    rec.cb.get('board')?.paint?.([1, 2], 'mark');
    rec.cb.get('board')?.bulb?.();
    rec.cb.get('tools')?.onPaw?.();
    rec.cb.get('topbar')?.onBack?.();
    rec.cb.get('topbar')?.onSettings?.();
    expect(cb.onTap).toHaveBeenCalledWith(4);
    expect(cb.onDoubleTap).toHaveBeenCalledWith(5);
    expect(cb.onPaint).toHaveBeenCalledWith([1, 2], 'mark');
    expect(cb.onBulb).toHaveBeenCalledTimes(1);
    expect(cb.onPaw).toHaveBeenCalledTimes(1);
    expect(cb.onHome).toHaveBeenCalledTimes(1);
    expect(cb.onSettings).toHaveBeenCalledTimes(1);
    game.playEvent({ type: 'MISTAKE', cell: 3, heartsLeft: 2 });
    expect(callsOf('board', 'playEvent')).toHaveLength(1);
    expect(callsOf('pills', 'playEvent')).toHaveLength(1);
    game.focusBoard();
    expect(document.activeElement?.tagName).toBe('BUTTON');
    expect(game.boardRect()).not.toBeNull();
    game.el.remove();
    expect(game.boardRect()).toBeNull();
  });

  it('updates the pieces and re-applies highlight and lock only when they change', () => {
    const game = createGameScreen(view(), callbacks());
    expect(callsOf('board', 'setHighlight')).toEqual([null]);
    expect(callsOf('board', 'setLocked')).toEqual([false]);
    game.update(view({ catsPlaced: 3 }));
    expect(callsOf('board', 'setHighlight')).toHaveLength(1);
    expect(lastOf('pills', 'update')).toMatchObject({ catsPlaced: 3, n: 5, hearts: 3 });
    game.update(view({ status: 'hint', inputLocked: true, highlight: { kind: 'hint', step } }));
    game.update(view({ status: 'hint', inputLocked: true, highlight: { kind: 'hint', step } }));
    expect(callsOf('board', 'setHighlight')).toHaveLength(2);
    expect(callsOf('board', 'setLocked')).toEqual([false, true]);
    expect(game.el.dataset.status).toBe('hint');
    game.update(view({ mode: 'daily', level: null, dateKey: '2026-10-06', hints: 0 }));
    expect(lastOf('topbar', 'update')).toMatchObject({ title: 'Daily · Tue 6 Oct' });
    expect(lastOf('tools', 'update')).toMatchObject({ hints: 0 });
    game.destroy();
  });

  it('Phase 2d §1.13: GameView.points goes to the game bar\'s Score column (null hides it), final at the win; a POINTS event reaches the bar', () => {
    const game = createGameScreen(view(), callbacks());
    expect(callsOf('topbar', 'create')[0]).toMatchObject({ points: null });
    game.update(view({ points: 1248 }));
    expect(lastOf('topbar', 'update')).toMatchObject({ points: 1248, final: false });
    game.update(view({ points: 0 }));
    expect(lastOf('topbar', 'update')).toMatchObject({ points: 0 });
    game.update(view({ points: 4000, catsPlaced: 5 }));
    expect(lastOf('topbar', 'update')).toMatchObject({ points: 4000, final: true });
    // The pills get the board's colours and found regions for the heads (§1.6).
    game.update(view({ board: { ...view().board, regionsDone: 0b101 } }));
    expect(lastOf('pills', 'update')).toMatchObject({ regionsDone: 0b101, boardId: 'L37', n: 5 });
    const ev = { type: 'POINTS', cell: 7, gained: 672, total: 1248, streak: 2 } as const;
    game.playEvent(ev);
    expect(callsOf('topbar', 'playEvent')).toEqual([ev]);
    expect(callsOf('pills', 'playEvent')).toEqual([ev]);
    expect(callsOf('board', 'playEvent')).toEqual([ev]);
    game.destroy();
  });

  it('Phase 2d §4.7: publishes the stack as CSS variables, the band on <html> while mounted (§1.16), the pulse and the dot', () => {
    const game = createGameScreen(view({ bannerBand: true, settingsDot: true, pulse: 'bulb', videoRefill: true, mouse: { shown: true, enabled: true } }), callbacks());
    document.body.append(game.el);
    for (const k of ['--s', '--col-w', '--y-top', '--bar', '--pills', '--rules', '--chips', '--tools', '--g-bp', '--g-pr', '--g-rb', '--g-bt', '--g-tb', '--g-bottom', '--band', '--board', '--pulse-ms', '--pulse-scale', '--fb-s', '--fb-e']) {
      expect(game.el.style.getPropertyValue(k), k).not.toBe('');
    }
    expect(game.el.style.getPropertyValue('--pulse-ms')).toBe('1500ms');
    expect(game.el.hasAttribute('data-banner')).toBe(true);
    const root = document.documentElement;
    expect(root.getAttribute('data-play-band')).toBe('1');
    expect(parseFloat(root.style.getPropertyValue('--play-band'))).toBeGreaterThan(50);
    expect(root.style.getPropertyValue('--play-band-bottom')).toMatch(/px$/);
    expect(callsOf('topbar', 'create')[0]).toMatchObject({ settingsDot: true });
    expect(callsOf('tools', 'create')[0]).toMatchObject({ pulse: 'bulb', videoRefill: true, mouse: { shown: true, enabled: true } });
    // Without the band: no reserve, and the attribute says so ('0').
    game.update(view({ bannerBand: false }));
    expect(game.el.hasAttribute('data-banner')).toBe(false);
    expect(root.getAttribute('data-play-band')).toBe('0');
    expect(root.style.getPropertyValue('--play-band')).toBe('0px');
    // A new game screen publishes before the old one goes; the old one's destroy leaves it alone.
    const next = createGameScreen(view({ bannerBand: true }), callbacks());
    game.destroy();
    expect(root.getAttribute('data-play-band')).toBe('1');
    next.destroy();
    expect(root.hasAttribute('data-play-band')).toBe(false);
    expect(root.style.getPropertyValue('--play-band')).toBe('');
  });

  it('Phase 2d §1.12: the mouse button and M call onMouse only while the mouse is shown and enabled', () => {
    const cb: GameScreenCallbacks = { ...callbacks(), onMouse: vi.fn() };
    const game = createGameScreen(view(), cb);
    document.body.append(game.el);
    const key = (k: string): boolean => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    rec.cb.get('tools')?.onMouse?.();
    expect(key('m')).toBe(false); // handled (preventDefault) even when it does nothing
    expect(cb.onMouse).not.toHaveBeenCalled();
    game.update(view({ mouse: { shown: true, enabled: false } }));
    key('m');
    expect(cb.onMouse).not.toHaveBeenCalled();
    game.update(view({ mouse: { shown: true, enabled: true } }));
    key('M');
    rec.cb.get('tools')?.onMouse?.();
    rec.cb.get('board')?.mouse?.();
    expect(cb.onMouse).toHaveBeenCalledTimes(3);
    game.destroy();
  });

  it('Phase 2d §1.14: playStartToast shows the toast in the column\'s fx layer, one at a time', () => {
    const game = createGameScreen(view(), callbacks());
    document.body.append(game.el);
    game.playStartToast?.('hard');
    const toast = q(game.el, '.game__col .game__fx .start-toast');
    expect(toast.dataset.kind).toBe('hard');
    expect(toast.getAttribute('aria-hidden')).toBe('true');
    expect(toast.textContent).toBe("A hard one. You've got this!");
    game.playStartToast?.('retry');
    expect(game.el.querySelectorAll('.start-toast')).toHaveLength(1);
    expect(q(game.el, '.start-toast').textContent).toBe('Fresh start. You can do it!');
    game.destroy();
    expect(game.el.querySelector('.start-toast')).toBeNull();
  });

  it('H / K work anywhere on the screen while no modal is open; never twice, never from an overlay (SPEC-01, A11Y-8)', () => {
    const cb = callbacks();
    const game = createGameScreen(view(), cb);
    document.body.append(game.el);
    const key = (target: EventTarget, k: string, init: KeyboardEventInit = {}): boolean =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
    // Focus on <body> (a level just started): H opens the hint, K calls the kitty.
    expect(key(document.body, 'h')).toBe(false); // handled → preventDefault
    expect(cb.onBulb).toHaveBeenCalledTimes(1);
    key(document.body, 'K');
    expect(cb.onPaw).toHaveBeenCalledTimes(1);
    // A focused control on the screen (top bar, tool row) works too.
    const btn = document.createElement('button');
    q(game.el, '.game__tools').append(btn);
    key(btn, 'h');
    expect(cb.onBulb).toHaveBeenCalledTimes(2);
    // The board's own handler covers a focused cell (it calls preventDefault): no second call.
    const cell = q(game.el, '.game__stage button');
    key(cell, 'h');
    const prevented = new KeyboardEvent('keydown', { key: 'h', bubbles: true, cancelable: true });
    prevented.preventDefault();
    document.body.dispatchEvent(prevented);
    expect(cb.onBulb).toHaveBeenCalledTimes(2);
    // Modifiers, auto-repeat, a disabled tool or a locked board: nothing.
    key(document.body, 'h', { ctrlKey: true });
    key(document.body, 'h', { repeat: true });
    game.update(view({ bulbEnabled: false, pawEnabled: false }));
    key(document.body, 'h');
    key(document.body, 'k');
    game.update(view({ inputLocked: true }));
    key(document.body, 'h');
    expect(cb.onBulb).toHaveBeenCalledTimes(2);
    expect(cb.onPaw).toHaveBeenCalledTimes(1);
    game.update(view());
    // Keys typed inside an overlay belong to it.
    const overlay = document.createElement('div');
    const inOverlay = document.createElement('button');
    overlay.append(inOverlay);
    document.body.append(overlay);
    key(inOverlay, 'h');
    expect(cb.onBulb).toHaveBeenCalledTimes(2);
    // A modal is open: the router makes the screen inert.
    const host = document.createElement('div');
    document.body.append(host);
    host.append(game.el);
    host.setAttribute('inert', '');
    key(document.body, 'h');
    expect(cb.onBulb).toHaveBeenCalledTimes(2);
    host.removeAttribute('inert');
    key(document.body, 'h');
    expect(cb.onBulb).toHaveBeenCalledTimes(3);
    game.destroy();
    key(document.body, 'h');
    expect(cb.onBulb).toHaveBeenCalledTimes(3);
  });

  it('moves focus that fell to <body> back to the board: at mount, on a restart and when a control goes away (A11Y-4)', () => {
    vi.useFakeTimers();
    try {
      const cb = callbacks();
      const game = createGameScreen(view(), cb);
      document.body.append(game.el);
      const cell = q(game.el, '.game__stage button');
      expect(document.activeElement).toBe(document.body);
      vi.advanceTimersByTime(40); // two frames: after the router's own focus restore
      expect(document.activeElement).toBe(cell);
      // A focused control disappears (the paw disabled during a reveal, the coach's Got it hidden).
      const btn = document.createElement('button');
      q(game.el, '.game__tools').append(btn);
      btn.focus();
      btn.blur();
      expect(document.activeElement).toBe(document.body);
      vi.advanceTimersByTime(40);
      expect(document.activeElement).toBe(cell);
      // Focus moved somewhere else on purpose: left alone.
      btn.focus();
      vi.advanceTimersByTime(40);
      expect(document.activeElement).toBe(btn);
      // A restart (Retry, revive) with focus lost.
      btn.blur();
      game.playEntry();
      vi.advanceTimersByTime(40);
      expect(document.activeElement).toBe(cell);
      expect(cb.onTap).not.toHaveBeenCalled();
      game.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('wraps the play area in the main landmark (A11Y-12)', () => {
    const game = createGameScreen(view(), callbacks());
    expect(q(game.el, 'main.game__col').querySelector('.game__stage')).not.toBeNull();
    game.destroy();
  });

  it('compares highlights structurally', () => {
    expect(sameHighlight({ kind: 'coach', cells: [1, 2] }, { kind: 'coach', cells: [1, 2] })).toBe(true);
    expect(sameHighlight({ kind: 'coach', cells: [1, 2] }, { kind: 'coach', cells: [1, 3] })).toBe(false);
    expect(sameHighlight({ kind: 'hint', step }, { kind: 'hint', step: { ...step } })).toBe(false);
    expect(sameHighlight(null, { kind: 'coach', cells: [] })).toBe(false);
  });
});
