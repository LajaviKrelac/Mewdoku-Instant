// Owner: C. The post-win flow (phase2b §2.2, §2.6, §2.7, §2.13) on a fake clock: the exact step
// times, the rewards saved at t = 0 (critical save) before any animation, Home and Gear inactive until
// the panel, the reduced-motion timeline, the tutorial / replay / daily / event variants, teardown
// mid-flow (no timers, no fish nodes), a 10 s clock jump running each missed step once, and a restored
// full board going to the victory at once with no second award.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg } from '../../../src/app/config';
import { arrivalAt, createWinFlow, winTimeline, type WinFlowInput } from '../../../src/app/win-flow';
import type { FxHandle } from '../../../src/ui/fx/fish-flight';
import type { GameScreen } from '../../../src/ui/screens/game-screen';
import { createHarness, last, SOL5, startLevel, winGame, type Harness } from './harness';

const W = cfg.fx.win;

function rect(x: number, y: number): DOMRect {
  return { x, y, left: x, top: y, width: 30, height: 30, right: x + 30, bottom: y + 30, toJSON: () => ({}) } as DOMRect;
}

/** A game screen double that writes every win-flow call into the log with the clock time. */
function fakeScreen(log: string[], now: () => number, opts: { rects?: boolean } = {}): GameScreen {
  const at = (s: string): void => void log.push(`${now()}:${s}`);
  return {
    el: {} as HTMLElement,
    update: () => undefined,
    destroy: () => undefined,
    playEvent: () => undefined,
    playEntry: () => 0,
    cellRect: (c) => (opts.rects ? rect(c * 10, 300) : null),
    toolRect: () => null,
    boardRect: () => null,
    focusBoard: () => undefined,
    fishRect: () => (opts.rects ? rect(150, 40) : null),
    showFishPill: (n) => at(`pill:${n}`),
    fishLabel: (text) => at(`label:${text}`),
    glow: (cells) => {
      at(`glow:${cells.length}`);
      return { done: Promise.resolve(), cancel: () => at('glow:cancel'), finish: () => at('glow:finish') };
    },
  };
}

function setup(opts: { rects?: boolean } = {}) {
  const clock = createFakeClock();
  const t0 = clock.perf();
  const log: string[] = [];
  const now = (): number => clock.perf() - t0;
  const nodes: string[] = [];
  const flights: { cancel: number; finish: number; onArrive?: (i: number) => void } = { cancel: 0, finish: 0 };
  const flow = createWinFlow({
    clock,
    sfx: { play: (id, o) => void log.push(`${now()}:sfx:${id}${o?.index !== undefined ? `:${o.index}` : ''}`) },
    haptics: () => void log.push(`${now()}:haptic`),
    announce: (m) => void log.push(`${now()}:say:${m}`),
    root: () => ({}) as HTMLElement,
    fx: {
      ensureFxLayer: (r) => r,
      fishSizePx: () => 24,
      flyFish: (_layer, from, _to, o): FxHandle => {
        log.push(`${now()}:fly:${from.length}`);
        nodes.push('a', 'b', 'c');
        flights.onArrive = o.onArrive;
        return {
          done: Promise.resolve(),
          cancel: () => {
            flights.cancel++;
            nodes.length = 0;
          },
          finish: () => {
            flights.finish++;
            for (let i = 0; i < 3; i++) o.onArrive?.(i);
            nodes.length = 0;
          },
        };
      },
    },
    openRanking: (o) => void log.push(`${now()}:ranking:${o.tapMinMs}`),
    openVictory: () => void log.push(`${now()}:victory`),
  });
  const screen = fakeScreen(log, now, opts);
  const input = (patch: Partial<WinFlowInput> = {}): WinFlowInput => ({
    variant: 'level',
    screen,
    catCells: [0, 7, 14, 16, 23],
    fishSources: [0, 7, 16],
    fishBefore: 125,
    fishBase: 3,
    fishBonus: 0,
    reducedMotion: false,
    ...patch,
  });
  return { clock, log, flow, input, nodes, flights, now };
}

describe('win timeline (§2.2)', () => {
  it('the level steps at their exact times (no flight available: the arrivals are counted by the flow)', () => {
    const s = setup();
    s.flow.start(s.input());
    s.clock.advance(W.fishAtMs - 1);
    expect(s.log).toEqual([`300:glow:5`, `1000:pill:125`]);
    s.clock.advance(5000);
    expect(s.log).toEqual([
      '300:glow:5',
      '1000:pill:125',
      '1200:sfx:fish_pop:0',
      '1350:sfx:fish_pop:1',
      '1500:sfx:fish_pop:2',
      '2250:pill:126',
      '2250:sfx:fish_plink:0',
      '2250:haptic',
      '2400:pill:127',
      '2400:sfx:fish_plink:1',
      '2400:haptic',
      '2550:pill:128',
      '2550:sfx:fish_plink:2',
      '2550:haptic',
      '2550:label:+3',
      '2550:say:You caught 3 fish. You have 128.',
      `${Math.max(2550, W.bonusLabelAtMs) + W.counterBumpMs}:pill:128`,
      `4500:ranking:${cfg.rank.panelTapMinMs}`,
    ]);
    expect(arrivalAt(0)).toBe(2250);
    expect(arrivalAt(2)).toBe(2550);
  });

  it('with the flight: B reports the arrivals (onArrive), each fish counted once', () => {
    const s = setup({ rects: true });
    s.flow.start(s.input());
    s.clock.advance(W.fishAtMs);
    expect(s.log).toContain('1200:fly:3');
    s.clock.advance(1000); // t = 2 200: the flight's own clock delivers fish 0
    s.flights.onArrive?.(0);
    s.flights.onArrive?.(0); // never twice
    expect(s.log.filter((l) => l.endsWith('pill:126'))).toHaveLength(1);
    s.clock.advance(300); // 2 500: the flow's arrive steps do not double-count while the flight runs
    expect(s.log.filter((l) => /pill:12[78]/.test(l))).toHaveLength(0);
    s.clock.advance(50); // 2 550: the +3 label settles any fish still in the air
    expect(s.log).toContain('2550:label:+3');
    expect(s.log.filter((l) => /sfx:fish_plink/.test(l))).toHaveLength(3);
  });

  it('a Hard bonus shows "+2" at 2 900 and jumps the count', () => {
    const s = setup();
    s.flow.start(s.input({ fishBonus: 2 }));
    s.clock.advance(4000);
    expect(s.log).toContain('2900:label:+2');
    expect(s.log).toContain('2900:pill:130');
    expect(s.log).toContain('2550:say:You caught 5 fish. You have 130.');
  });

  it('Home and Gear stay inactive (blocking) until the panel opens; the panel tap opens the victory', () => {
    const s = setup();
    s.flow.start(s.input());
    expect(s.flow.blocking()).toBe(true);
    s.clock.advance(4499);
    expect(s.flow.blocking()).toBe(true);
    s.clock.advance(1);
    expect(s.flow.blocking()).toBe(false);
    expect(s.flow.running()).toBe(true);
    s.flow.continueFromRanking();
    expect(last(s.log)).toBe('4500:victory');
    expect(s.flow.running()).toBe(false);
    s.flow.continueFromRanking(); // only once
    expect(s.log.filter((l) => l.endsWith('victory'))).toHaveLength(1);
  });

  it('reduced motion (§2.7): static glow, the total at once, the label, plinks at the usual times, panel at 1 200 with a 600 ms gate', () => {
    const s = setup({ rects: true });
    s.flow.start(s.input({ reducedMotion: true, fishBonus: 2 }));
    s.clock.advance(5000);
    expect(s.log.slice(0, 4)).toEqual(['300:glow:5', '300:pill:130', '300:label:+5', '300:say:You caught 5 fish. You have 130.']);
    expect(s.log).toContain(`1200:ranking:${W.reduced.tapMinMs}`);
    expect(s.log.some((l) => l.includes('fly'))).toBe(false);
    expect(s.log.filter((l) => l.includes('fish_plink')).map((l) => l.split(':')[0])).toEqual(['2250', '2400', '2550']);
  });

  it('variants: first-run tutorial → victory at 3 300 (no panel); replay → no fish, victory at 1 200; restored → victory at once', () => {
    const tut = setup();
    tut.flow.start(tut.input({ variant: 'tutorial', fishBefore: 0 }));
    tut.clock.advance(6000);
    expect(tut.log.some((l) => l.includes('ranking'))).toBe(false);
    expect(last(tut.log)).toBe(`${W.tutorialVictoryAtMs}:victory`);
    const rep = setup();
    rep.flow.start(rep.input({ variant: 'tutorial_replay', fishBase: 0 }));
    rep.clock.advance(6000);
    expect(rep.log).toEqual(['300:glow:5', `${W.replayVictoryAtMs}:victory`]);
    const res = setup();
    res.flow.start(res.input({ variant: 'restored' }));
    expect(res.log).toEqual(['0:victory']);
  });

  it('daily and event wins use the level timeline (fish, panel at 4.5 s)', () => {
    for (const variant of ['daily', 'event'] as const) {
      expect(winTimeline({ variant, reducedMotion: false, fishBase: 3, fishBonus: variant === 'daily' ? 2 : 0 }).map((x) => x.name)).toContain('ranking');
    }
    expect(winTimeline({ variant: 'daily', reducedMotion: false, fishBase: 3, fishBonus: 2 }).find((x) => x.name === 'bonus')?.at).toBe(W.bonusLabelAtMs);
  });

  it('teardown mid-flow cancels every timer and animation and leaves no fish nodes', () => {
    const s = setup({ rects: true });
    const pending = s.clock.pending();
    s.flow.start(s.input());
    s.clock.advance(1800); // fish in the air
    expect(s.nodes.length).toBe(3);
    s.flow.cancel();
    expect(s.nodes.length).toBe(0);
    expect(s.flights.cancel).toBe(1);
    expect(s.log).toContain('1800:glow:cancel');
    expect(s.clock.pending()).toBe(pending);
    const before = s.log.length;
    s.clock.advance(10_000);
    expect(s.log.length).toBe(before);
    expect(s.flow.running()).toBe(false);
  });

  it('a 10 s clock jump mid-flow (hidden page) runs each missed step once, in order, at its end state', () => {
    const s = setup({ rects: true });
    s.flow.start(s.input({ fishBonus: 2 }));
    s.clock.advance(1300); // the flight started at 1 200
    // A background tab: 10 s pass while no timer fires (throttled), then the next timer fires late.
    const perf = s.clock.perf;
    (s.clock as { perf: () => number }).perf = () => perf() + 10_000;
    s.clock.advance(60); // the pending timer (pop 1 at 1 350) finally fires, 10 s late
    const names = s.log.map((l) => l.split(':').slice(1).join(':'));
    expect(names.filter((n) => n === 'label:+3')).toHaveLength(1);
    expect(names.filter((n) => n.startsWith('ranking'))).toHaveLength(1);
    expect(names.filter((n) => n.startsWith('sfx:fish_plink'))).toHaveLength(3);
    expect(names.filter((n) => n.startsWith('sfx:fish_pop'))).toHaveLength(1); // the missed pops are silent
    expect(s.flights.finish).toBeGreaterThanOrEqual(1); // the flight jumped to its end
    // In order: glow, pill, label, bonus, panel.
    const order = ['glow:5', 'pill:125', 'label:+3', 'label:+2', 'ranking:1200'].map((n) => names.indexOf(n));
    expect(order.every((i, k) => i >= 0 && (k === 0 || i > (order[k - 1] as number)))).toBe(true);
    // Nothing runs twice afterwards.
    const count = s.log.length;
    s.clock.advance(20_000);
    expect(s.log.length).toBe(count);
  });

  it('catchUp() after a throttled timer runs what is due at once', () => {
    const s = setup();
    s.flow.start(s.input());
    // Simulate a background tab: time passes but no timer fired yet.
    const perf = s.clock.perf;
    let skew = 0;
    (s.clock as { perf: () => number }).perf = () => perf() + skew;
    skew = 5000;
    s.flow.catchUp();
    expect(s.log.some((l) => l.includes('ranking'))).toBe(true);
    expect(s.log.filter((l) => l.includes('label:+3'))).toHaveLength(1);
  });
});

describe('session win flow (§2.2 t = 0 and §2.6)', () => {
  async function wonLevel(h: Harness, level = 5): Promise<void> {
    await startLevel(h, level);
    winGame(h);
  }

  it('the rewards (fish, points, progress) are in the critical save at t = 0, before any animation', async () => {
    const h = createHarness();
    const writes = h.platform.writes.length;
    await wonLevel(h);
    const flush = h.platform.writes.slice(writes).find((w) => w.cloud === 'flush');
    expect(flush?.data.wallet).toEqual({ fish: 3, earned: 3 });
    expect(flush?.data.points.total).toBe(5 * 5 + 10 + 10); // 5×5, flawless, unaided
    expect(flush?.data.progress.level).toBe(6);
    expect(h.router.isOpen('ranking')).toBe(false); // nothing shown yet
    expect(h.analytics.find((e) => e.name === 'level_win')).toBeDefined();
  });

  it('Home and Gear in the top bar do nothing until the ranking panel opens', async () => {
    const h = createHarness();
    await wonLevel(h);
    const cb = h.router.game?.cb;
    await h.settle(2000);
    cb?.onHome();
    cb?.onSettings();
    expect(h.homeCalls).toBe(0);
    expect(h.log).not.toContain('openSettings');
    await h.settle(cfg.fx.winOverlayDelayMs - 2000);
    expect(h.router.isOpen('ranking')).toBe(true);
    cb?.onSettings();
    expect(h.log).toContain('openSettings');
    cb?.onHome();
    expect(h.homeCalls).toBe(1);
  });

  it('the ranking panel opens at 4.5 s with my result; on the web its list is my own records (no other rows)', async () => {
    const h = createHarness();
    await wonLevel(h);
    await h.settle(cfg.fx.winOverlayDelayMs - 1);
    expect(h.router.isOpen('ranking')).toBe(false);
    await h.settle(1);
    const p = h.router.props.ranking;
    expect(p?.board).toBe('points');
    expect(p?.result).toEqual({ kind: 'level', pointsEarned: 45, ms: expect.any(Number) });
    expect(p?.list.kind).toBe('records');
    if (p?.list.kind === 'records') {
      expect(p.list.reason).toBe('local');
      expect(p.list.records).toMatchObject({ board: 'points', n: 5, totalPoints: 45, levelsSolved: 5 });
    }
    expect(p?.tapMinMs).toBe(cfg.rank.panelTapMinMs);
    expect(h.analytics).toContainEqual({ name: 'rank_panel', params: { board: 'paw_points', api: 'local', ms: 0, ok: 1 } });
    p?.onContinue();
    const v = h.router.props.victory;
    expect(v).toMatchObject({ variant: 'level', level: 5, nextLevel: 6, fish: { earned: 3, total: 3 }, bonus: null, pointsEarned: 45, buttonDelayMs: 600 });
    expect(h.router.isOpen('ranking')).toBe(false);
  });

  it('a Hard level adds the +2 bonus chip; a daily the daily bonus (points +15)', async () => {
    const h = createHarness({ save: (s) => ({ ...s, progress: { level: 30, completed: 29, best: {} } }) });
    await wonLevel(h, 30);
    expect(h.save().wallet.fish).toBe(5);
    await h.settle(cfg.fx.winOverlayDelayMs);
    h.router.props.ranking?.onContinue();
    expect(h.router.props.victory?.bonus).toEqual({ kind: 'hard', count: 2 });
    expect(h.router.props.victory?.pointsEarned).toBe(5 * 5 * 2 + 20);
  });

  it('a level already counted (restored elsewhere) is never awarded twice', async () => {
    const h = createHarness({ save: (s) => ({ ...s, progress: { level: 9, completed: 8, best: {} }, wallet: { fish: 40, earned: 40 } }) });
    await startLevel(h, 5); // replaying an old level: not counted
    winGame(h);
    expect(h.save().wallet.fish).toBe(40);
    expect(h.save().points.total).toBe(0);
    await h.settle(cfg.fx.winOverlayDelayMs);
    h.router.props.ranking?.onContinue();
    expect(h.router.props.victory?.fish).toBeNull();
  });

  it('teardown mid-flow (Home from the victory, or dispose) leaves the saved rewards', async () => {
    const h = createHarness();
    await wonLevel(h);
    await h.settle(1500);
    h.session.dispose();
    await h.settle(10_000);
    expect(h.router.isOpen('ranking')).toBe(false);
    expect(h.save().wallet.fish).toBe(3);
  });

  it('the win bumps the in-game fish pill: before-count at 1 s, then +1 per arrival', async () => {
    const h = createHarness();
    const pills: number[] = [];
    await startLevel(h);
    const g = h.router.game;
    if (g) g.showFishPill = (n) => void pills.push(n);
    for (const c of SOL5) h.session.onCellDoubleTap(c);
    await h.settle(3500);
    expect(pills.slice(0, 4)).toEqual([0, 1, 2, 3]);
  });
});
