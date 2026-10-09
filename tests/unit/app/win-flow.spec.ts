// Owner: C (Phase 2b). Phase 2c (G1, docs/phase2c/fish-lives-spec.md §2.2–§2.5, §2.9): the fish
// that fly are the lives kept: N fish lift off the lives pill (the last full slot first) and fly to
// this period's points counter; the panel opens at panelAt(N) = 4 200 / 4 350 / 4 500 ms for
// N = 1 / 2 / 3 (capped at 4 500 for N ≥ 4), the scrim 300 ms before; no flight → panel at 1 200.
// The post-win flow on a fake clock: the exact step times, the rewards saved at t = 0 (critical
// save) before any animation, Home and Gear inactive (and rendered aria-disabled) until the panel,
// the pops from B's flight, the panel's fade-out before the victory, the reduced-motion timeline, the
// tutorial / replay / daily / event variants, teardown mid-flow (no timers, no fish nodes), a 10 s
// clock jump running each missed step once (slots still emptied), and a restored full board going
// to the victory at once with no second award.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg } from '../../../src/app/config';
import { arrivalAt, createWinFlow, liftAt, panelAt, victoryCrossfadeMs, winTimeline, type WinFlowInput, type WinScreen } from '../../../src/app/win-flow';
import type { FlyFishOptions, FxHandle } from '../../../src/ui/fx/fish-flight';
import { createHarness, last, SOL5, startLevel, winGame, WRONG5, type Harness, tapRanking } from './harness';

const W = cfg.fx.win;

function rect(x: number, y: number, size = 30): DOMRect {
  return { x, y, left: x, top: y, width: size, height: size, right: x + size, bottom: y + size, toJSON: () => ({}) } as DOMRect;
}

/** A game screen double that writes every win-flow call into the log with the clock time. */
function fakeScreen(log: string[], now: () => number, opts: { rects?: boolean; hearts?: number } = {}): WinScreen {
  const at = (s: string): void => void log.push(`${now()}:${s}`);
  const hearts = opts.hearts ?? 3;
  return {
    // Full slots in departure order: the highest slot first (§7.4).
    lifeSlots: () => (opts.rects ? Array.from({ length: hearts }, (_, i) => ({ slot: hearts - 1 - i, rect: rect(200 + (hearts - 1 - i) * 30, 40, 22) })) : []),
    departLife: (slot) => at(`depart:${slot}`),
    showPeriodCounter: (n) => at(`counter:${n}`),
    periodRect: () => (opts.rects ? rect(150, 40) : null),
    periodLabel: (text) => at(`label:${text}`),
    glow: (cells) => {
      at(`glow:${cells.length}`);
      return { done: Promise.resolve(), cancel: () => at('glow:cancel'), finish: () => at('glow:finish') };
    },
    showScrim: () => at('scrim'),
  };
}

function setup(opts: { rects?: boolean; hearts?: number } = {}) {
  const clock = createFakeClock();
  const t0 = clock.perf();
  const log: string[] = [];
  const now = (): number => clock.perf() - t0;
  const nodes: string[] = [];
  const flights: { cancel: number; finish: number; opts?: FlyFishOptions; from?: readonly DOMRect[]; to?: DOMRect } = { cancel: 0, finish: 0 };
  const blocking: boolean[] = [];
  const flow = createWinFlow({
    clock,
    sfx: { play: (id, o) => void log.push(`${now()}:sfx:${id}${o?.index !== undefined ? `:${o.index}` : ''}`) },
    haptics: () => void log.push(`${now()}:haptic`),
    announce: (m) => void log.push(`${now()}:say:${m}`),
    root: () => ({}) as HTMLElement,
    fx: {
      ensureFxLayer: (r) => r,
      flyFish: (_layer, from, to, o): FxHandle => {
        log.push(`${now()}:fly:${from.length}`);
        flights.opts = o;
        flights.from = from;
        flights.to = to;
        for (let i = 0; i < from.length; i++) nodes.push(`fish${i}`);
        o.onPop?.(0); // B pops fish 0 as the flight starts (the others follow on its own clock)
        return {
          done: Promise.resolve(),
          cancel: () => {
            flights.cancel++;
            nodes.length = 0;
          },
          finish: () => {
            flights.finish++;
            for (let i = 0; i < from.length; i++) o.onArrive?.(i);
            nodes.length = 0;
          },
        };
      },
    },
    openRanking: (o) => void log.push(`${now()}:ranking:${o.tapMinMs}`),
    openVictory: () => void log.push(`${now()}:victory`),
    onBlockingChange: (b) => void blocking.push(b),
  });
  const screen = fakeScreen(log, now, opts);
  const input = (patch: Partial<WinFlowInput> = {}): WinFlowInput => ({
    variant: 'level',
    screen,
    catCells: [0, 7, 14, 16, 23],
    kept: 3,
    perFish: 1,
    periodBefore: 39,
    periodKind: 'week',
    reducedMotion: false,
    ...patch,
  });
  return { clock, log, flow, input, nodes, flights, now, blocking };
}

describe('win timeline by the fish kept (phase2c §2.2)', () => {
  it('L(k), A(k) and panelAt(N): panel at 4 200 / 4 350 / 4 500 ms for 1 / 2 / 3 fish, capped at 4 500, 1 200 without a flight', () => {
    expect([0, 1, 2].map((k) => liftAt(k))).toEqual([1200, 1350, 1500]);
    expect([0, 1, 2].map((k) => arrivalAt(k))).toEqual([2250, 2400, 2550]);
    expect(panelAt(1)).toBe(4200);
    expect(panelAt(2)).toBe(4350);
    expect(panelAt(3)).toBe(4500);
    expect(panelAt(5)).toBe(4500); // an event with rules.hearts > 3
    expect(panelAt(0)).toBe(1200);
    expect(cfg.fx.winHappyDelayMs + W.glowInMs + W.glowSettleMs).toBe(1200);
  });

  it.each([
    [1, 4200],
    [2, 4350],
    [3, 4500],
    [5, 4500],
  ])('N = %i: one lift-off and one arrival per fish, "+N" and the settle after the last, the scrim 300 ms before the panel at %i', (n, panel) => {
    const steps = winTimeline({ variant: 'level', reducedMotion: false, kept: n }).map((x) => `${x.at}:${x.name}`);
    const lifts = steps.filter((x) => x.includes(':lift_'));
    const arrivals = steps.filter((x) => x.includes(':arrive_'));
    expect(lifts).toEqual(Array.from({ length: n }, (_, k) => `${1200 + 150 * k}:lift_${k}`));
    expect(arrivals).toEqual(Array.from({ length: n }, (_, k) => `${2250 + 150 * k}:arrive_${k}`));
    expect(steps).toContain(`${2250 + 150 * (n - 1)}:plus_label`);
    expect(steps).toContain(`${2250 + 150 * (n - 1) + W.counterBumpMs}:settle`);
    expect(steps).toContain(`${panel - 300}:scrim`);
    expect(last(steps)).toBe(`${panel}:ranking`);
    expect(steps.slice(0, 3)).toEqual(['300:glow', '1000:counter_in', '1200:flight']);
  });

  it('no flight (G = 0: not counted, mode outside period.modes): no counter, no lift-off; scrim at 900, panel at 1 200', () => {
    expect(winTimeline({ variant: 'level', reducedMotion: false, kept: 0 }).map((x) => `${x.at}:${x.name}`)).toEqual(['300:glow', '900:scrim', '1200:ranking']);
  });

  it('the level steps at their exact times for 3 fish kept (no flight available: the flow empties the slots and counts the arrivals)', () => {
    const s = setup();
    s.flow.start(s.input());
    s.clock.advance(W.fishAtMs - 1);
    expect(s.log).toEqual(['300:glow:5', '1000:counter:39']);
    s.clock.advance(5000);
    expect(s.log).toEqual([
      '300:glow:5',
      '1000:counter:39',
      '1200:depart:2',
      '1200:sfx:fish_pop:0',
      '1350:depart:1',
      '1350:sfx:fish_pop:1',
      '1500:depart:0',
      '1500:sfx:fish_pop:2',
      '2250:counter:40',
      '2250:sfx:fish_plink:0',
      '2250:haptic',
      '2400:counter:41',
      '2400:sfx:fish_plink:1',
      '2400:haptic',
      '2550:counter:42',
      '2550:sfx:fish_plink:2',
      '2550:haptic',
      '2550:label:+3',
      '2550:say:You kept 3 fish. Your total this week: 42.',
      `${2550 + W.counterBumpMs}:counter:42`,
      '4200:scrim',
      `4500:ranking:${cfg.rank.panelTapMinMs}`,
    ]);
  });

  it('one fish kept (after a revive): slot 0 lifts off at 1 200, arrives at 2 250, panel at 4 200 and scrim at 3 900', () => {
    const s = setup();
    s.flow.start(s.input({ kept: 1, periodBefore: 0 }));
    s.clock.advance(6000);
    expect(s.log).toEqual([
      '300:glow:5',
      '1000:counter:0',
      '1200:depart:0',
      '1200:sfx:fish_pop:0',
      '2250:counter:1',
      '2250:sfx:fish_plink:0',
      '2250:haptic',
      '2250:label:+1',
      '2250:say:You kept 1 fish. Your total this week: 1.',
      `${2250 + W.counterBumpMs}:counter:1`,
      '3900:scrim',
      `4200:ranking:${cfg.rank.panelTapMinMs}`,
    ]);
  });

  it('pointsPerFish: each arrival adds it; "+G" is N × pointsPerFish', () => {
    const s = setup();
    s.flow.start(s.input({ kept: 2, perFish: 5, periodBefore: 10 }));
    s.clock.advance(3000);
    expect(s.log.filter((l) => l.includes('counter:'))).toEqual(['1000:counter:10', '2250:counter:15', '2400:counter:20', `${2400 + W.counterBumpMs}:counter:20`]);
    expect(s.log).toContain('2400:label:+10');
  });

  it('with the flight: the full life icons fly (the first N of lifeSlots) to the counter at their own size and scale 1; onPop empties each slot', () => {
    const s = setup({ rects: true, hearts: 2 });
    s.flow.start(s.input({ kept: 2 }));
    s.clock.advance(W.fishAtMs);
    expect(s.log).toContain('1200:fly:2');
    expect(s.flights.from?.map((r) => r.x)).toEqual([230, 200]); // slot 1 then slot 0
    expect(s.flights.to?.x).toBe(150);
    expect(s.flights.opts).toMatchObject({ startScale: 1, reduced: false, sizePx: 22 });
    // The pop of fish 0 came from B's flight and emptied slot 1 (the last full one) first.
    expect(s.log.filter((l) => /depart|fish_pop/.test(l))).toEqual(['1200:depart:1', '1200:sfx:fish_pop:0']);
    s.flights.opts?.onPop?.(1);
    expect(s.log.filter((l) => /depart|fish_pop/.test(l))).toEqual(['1200:depart:1', '1200:sfx:fish_pop:0', '1200:depart:0', '1200:sfx:fish_pop:1']);
    s.clock.advance(1000); // t = 2 200: the flow's own lift-off steps stayed silent and did not depart twice
    expect(s.log.filter((l) => /depart|fish_pop/.test(l))).toHaveLength(4);
    s.flights.opts?.onArrive?.(0);
    s.flights.opts?.onArrive?.(0); // never twice
    expect(s.log.filter((l) => l.endsWith('counter:40'))).toHaveLength(1);
    s.clock.advance(150); // 2 350: the flow's arrive steps do not double-count while the flight runs
    expect(s.log.filter((l) => l.endsWith('counter:41'))).toHaveLength(0);
    s.clock.advance(50); // 2 400: "+2" settles any fish still in the air
    expect(s.log).toContain('2400:label:+2');
    expect(s.log.filter((l) => /sfx:fish_plink/.test(l))).toHaveLength(2);
    expect(s.log.filter((l) => l.includes('depart'))).toHaveLength(2);
  });

  it('the flying fish starts at its life icon\'s size, clamped to fishMinPx…fishMaxPx (§2.3)', () => {
    for (const [size, want] of [
      [10, W.fishMinPx],
      [80, W.fishMaxPx],
    ] as const) {
      const s = setup({ rects: true, hearts: 1 });
      const screen = s.input().screen;
      s.flow.start(s.input({ kept: 1, screen: { ...screen, lifeSlots: () => [{ slot: 0, rect: rect(200, 40, size) }] } }));
      s.clock.advance(W.fishAtMs);
      expect(s.flights.opts?.sizePx).toBe(want);
    }
  });

  it('a hidden lives pill (no slots) or no counter rect: no flight; the lift-off steps empty slots N − 1 … 0', () => {
    const s = setup({ rects: false });
    s.flow.start(s.input({ kept: 2 }));
    s.clock.advance(1400);
    expect(s.log.some((l) => l.includes('fly'))).toBe(false);
    expect(s.log.filter((l) => l.includes('depart'))).toEqual(['1200:depart:1', '1350:depart:0']);
  });

  it('Home and Gear stay inactive (blocking, reported for aria-disabled) until the panel opens; the tap opens the victory at once (a crossfade, UX-4)', () => {
    const s = setup();
    s.flow.start(s.input());
    expect(s.flow.blocking()).toBe(true);
    expect(s.blocking).toEqual([true]);
    s.clock.advance(4499);
    expect(s.flow.blocking()).toBe(true);
    s.clock.advance(1);
    expect(s.flow.blocking()).toBe(false);
    expect(s.blocking).toEqual([true, false]);
    expect(s.flow.running()).toBe(true);
    s.clock.advance(2000);
    s.flow.continueFromRanking();
    expect(last(s.log)).toBe('6500:victory');
    expect(s.flow.running()).toBe(false);
    s.flow.continueFromRanking(); // only once
    s.flow.continueFromRanking();
    s.clock.advance(1000);
    expect(s.log.filter((l) => l.endsWith('victory'))).toHaveLength(1);
    expect(s.blocking).toEqual([true, false]);
  });

  it('teardown before the tap never opens the victory; after it nothing more runs', () => {
    const s = setup();
    s.flow.start(s.input());
    s.clock.advance(4500);
    s.flow.cancel();
    s.flow.continueFromRanking();
    s.clock.advance(1000);
    expect(s.log.some((l) => l.endsWith('victory'))).toBe(false);
    const t = setup();
    t.flow.start(t.input());
    t.clock.advance(4500);
    t.flow.continueFromRanking();
    t.flow.cancel();
    t.clock.advance(1000);
    expect(t.log.filter((l) => l.endsWith('victory'))).toEqual(['4500:victory']);
  });

  it('the scrim comes only before a ranking panel: not with reduced motion, not for the tutorial variants or a restored board', () => {
    const names = (v: WinFlowInput['variant'], reducedMotion = false): string[] => winTimeline({ variant: v, reducedMotion, kept: 3 }).map((x) => `${x.at}:${x.name}`);
    for (const v of ['level', 'daily', 'event'] as const) expect(names(v)).toContain('4200:scrim');
    for (const v of ['tutorial', 'tutorial_replay', 'restored'] as const) expect(names(v).some((n) => n.endsWith(':scrim'))).toBe(false);
    expect(names('level', true).some((n) => n.endsWith(':scrim'))).toBe(false);
  });

  it('reduced motion (§2.4): static glow, the counter at once with the new total, the slots empty at once, "+G", plinks at A(k), panel at 1 200 with a 600 ms gate', () => {
    const s = setup({ rects: true });
    s.flow.start(s.input({ reducedMotion: true }));
    s.clock.advance(5000);
    expect(s.log.slice(0, 7)).toEqual([
      '300:glow:5',
      '300:counter:42',
      '300:depart:2',
      '300:depart:1',
      '300:depart:0',
      '300:label:+3',
      '300:say:You kept 3 fish. Your total this week: 42.',
    ]);
    expect(s.log).toContain(`1200:ranking:${W.reduced.tapMinMs}`);
    expect(s.log.some((l) => l.includes('fly') || l.includes('scrim'))).toBe(false);
    expect(s.log.filter((l) => l.includes('fish_plink')).map((l) => l.split(':')[0])).toEqual(['2250', '2400', '2550']);
  });

  it('variants: both tutorials → no counter, no flight, no panel, victory at 1 200; restored → victory at once', () => {
    for (const variant of ['tutorial', 'tutorial_replay'] as const) {
      const tut = setup();
      tut.flow.start(tut.input({ variant, kept: 3 })); // even if a count reached it, the tutorial never flies
      tut.clock.advance(6000);
      expect(tut.log).toEqual(['300:glow:5', `${W.replayVictoryAtMs}:victory`]);
      expect(W.replayVictoryAtMs).toBe(1200);
    }
    const res = setup();
    res.flow.start(res.input({ variant: 'restored' }));
    expect(res.log).toEqual(['0:victory']);
  });

  it('daily and event wins use the level timeline (counter, flight, the period panel)', () => {
    for (const variant of ['daily', 'event'] as const) {
      const names = winTimeline({ variant, reducedMotion: false, kept: 2 }).map((x) => `${x.at}:${x.name}`);
      expect(names).toContain('1200:flight');
      expect(names).toContain('4350:ranking');
    }
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

  it('a 10 s clock jump mid-flow (hidden page) runs each missed step once, in order, at its end state — every departing slot comes back empty', () => {
    const s = setup({ rects: true });
    s.flow.start(s.input());
    s.clock.advance(1300); // the flight started at 1 200 and popped fish 0 only
    const perf = s.clock.perf;
    (s.clock as { perf: () => number }).perf = () => perf() + 10_000;
    s.clock.advance(60); // the pending timer (lift-off 1 at 1 350) finally fires, 10 s late
    const names = s.log.map((l) => l.split(':').slice(1).join(':'));
    expect(names.filter((n) => n === 'label:+3')).toHaveLength(1);
    expect(names.filter((n) => n.startsWith('ranking'))).toHaveLength(1);
    expect(names.filter((n) => n.startsWith('sfx:fish_plink'))).toHaveLength(3);
    expect(names.filter((n) => n.startsWith('sfx:fish_pop'))).toHaveLength(1); // the missed pops are silent
    expect(names.filter((n) => n.startsWith('depart:')).sort()).toEqual(['depart:0', 'depart:1', 'depart:2']); // idempotent, each once
    expect(s.flights.finish).toBeGreaterThanOrEqual(1);
    expect(names.filter((n) => n === 'scrim')).toHaveLength(1);
    const order = ['glow:5', 'counter:39', 'label:+3', 'scrim', `ranking:${cfg.rank.panelTapMinMs}`].map((n) => names.indexOf(n));
    expect(order.every((i, k) => i >= 0 && (k === 0 || i > (order[k - 1] as number)))).toBe(true);
    expect(names.lastIndexOf('counter:42')).toBeGreaterThan(names.indexOf('counter:39'));
    const count = s.log.length;
    s.clock.advance(20_000);
    expect(s.log.length).toBe(count);
  });

  it('catchUp() after a throttled timer runs what is due at once', () => {
    const s = setup();
    s.flow.start(s.input());
    const perf = s.clock.perf;
    let skew = 0;
    (s.clock as { perf: () => number }).perf = () => perf() + skew;
    skew = 5000;
    s.flow.catchUp();
    expect(s.log.some((l) => l.includes('ranking'))).toBe(true);
    expect(s.log.filter((l) => l.includes('label:+3'))).toHaveLength(1);
    expect(s.log.filter((l) => l.includes('depart'))).toHaveLength(3);
  });
});

describe('session win flow (phase2c §2.2 t = 0, §2.5–§2.7, §3.7)', () => {
  async function wonLevel(h: Harness, level = 5): Promise<void> {
    await startLevel(h, level);
    winGame(h);
  }

  it('the rewards (level points, streak, period points, progress) are in the critical save at t = 0, before any animation; no wallet', async () => {
    const h = createHarness();
    const writes = h.platform.writes.length;
    await wonLevel(h);
    const flush = h.platform.writes.slice(writes).find((w) => w.cloud === 'flush');
    expect(flush?.data).not.toHaveProperty('wallet');
    expect(flush?.data.points.total).toBe(5 * 10 + 10); // 5×5, 1st perfect win in a row
    expect(flush?.data.streak).toEqual({ current: 1, best: 1 });
    expect(flush?.data.period).toEqual({ key: '2026-10-05', total: 3, bestKey: '2026-10-05', bestTotal: 3 });
    expect(flush?.data.progress.level).toBe(6);
    expect(h.router.isOpen('ranking')).toBe(false); // nothing shown yet
    expect(h.analytics.find((e) => e.name === 'level_win')).toBeDefined();
    expect(h.analytics).toContainEqual({ name: 'win_points', params: { mode: 'level', fish: 3, total: 3, points: 60, streak: 1 } });
  });

  it('Home and Gear in the top bar do nothing (and render aria-disabled) until the ranking panel opens', async () => {
    const h = createHarness();
    await startLevel(h, 5);
    expect(h.router.game?.last.chromeLocked).toBe(false);
    winGame(h);
    const cb = h.router.game?.cb;
    expect(h.router.game?.last.chromeLocked).toBe(true); // GameView.chromeLocked from WON (§2.2)
    await h.settle(2000);
    cb?.onHome();
    cb?.onSettings();
    expect(h.homeCalls).toBe(0);
    expect(h.log).not.toContain('openSettings');
    expect(h.router.game?.last.chromeLocked).toBe(true);
    await h.settle(4200 - 2000);
    expect(h.router.game?.scrims).toBe(1); // the scrim 300 ms before the 3-fish panel
    expect(h.router.isOpen('ranking')).toBe(false);
    await h.settle(300);
    expect(h.router.isOpen('ranking')).toBe(true);
    expect(h.router.game?.last.chromeLocked).toBe(false);
    cb?.onSettings();
    expect(h.log).toContain('openSettings');
    cb?.onHome();
    expect(h.homeCalls).toBe(1);
  });

  it('the ranking panel opens at 4.5 s on the period board with "+3 · this week"; on the web its list is my own period records', async () => {
    const h = createHarness();
    await wonLevel(h);
    await h.settle(4500 - 1);
    expect(h.router.isOpen('ranking')).toBe(false);
    await h.settle(1);
    const p = h.router.props.ranking;
    expect(p?.board).toBe('period');
    expect(p?.periodKind).toBe('week');
    expect(p?.eventNameKey).toBeNull();
    expect(p?.result).toEqual({ kind: 'period', gained: 3, total: 3, periodKind: 'week' });
    expect(p?.list.kind).toBe('records');
    if (p?.list.kind === 'records') {
      expect(p.list.reason).toBe('local');
      expect(p.list.records).toMatchObject({ board: 'period', levelsSolved: 5, period: { kind: 'week', total: 3, best: 3 }, streak: { current: 1, best: 1 } });
    }
    expect(p?.tapMinMs).toBe(cfg.rank.panelTapMinMs);
    expect(h.analytics).toContainEqual({ name: 'rank_panel', params: { board: 'period_points', api: 'local', ms: 0, ok: 1 } });
    await tapRanking(h);
    const v = h.router.props.victory;
    expect(v).toMatchObject({
      variant: 'level',
      level: 5,
      nextLevel: 6,
      pointsEarned: 60,
      streak: 1,
      kept: { fish: 3, max: 3, gained: 3, total: 3, kind: 'week' },
      buttonDelayMs: 600,
    });
    // §2.7: no fish pill, no "+" (shop), no bonus chip.
    expect(v).not.toHaveProperty('onShop');
    expect(v).not.toHaveProperty('fish');
    expect(v).not.toHaveProperty('bonus');
    expect(h.router.isOpen('ranking')).toBe(false);
  });

  it('a mistake: 2 fish kept fly, the panel opens at 4 350 (scrim 4 050), no streak chip and no streak bonus', async () => {
    const h = createHarness({ save: (s) => ({ ...s, streak: { current: 4, best: 6 } }) });
    await startLevel(h, 5);
    h.session.onCellDoubleTap(WRONG5[0] as number);
    await h.settle(h.config.input.cellLockAfterCatMs);
    expect(h.save().streak).toEqual({ current: 0, best: 6 }); // broken at the mistake itself
    winGame(h);
    expect(h.save().period.total).toBe(2);
    expect(h.save().points.total).toBe(50); // base only
    await h.settle(4050 - 1);
    expect(h.router.game?.scrims).toBe(0);
    await h.settle(1);
    expect(h.router.game?.scrims).toBe(1);
    await h.settle(299);
    expect(h.router.isOpen('ranking')).toBe(false);
    await h.settle(1);
    expect(h.router.isOpen('ranking')).toBe(true);
    expect(h.router.game?.departed).toEqual([1, 0]); // the last full slot first
    expect(h.router.game?.counters.slice(0, 3)).toEqual([0, 1, 2]);
    await tapRanking(h);
    expect(h.router.props.victory).toMatchObject({ pointsEarned: 50, streak: null, kept: { fish: 2, max: 3, gained: 2, total: 2 } });
  });

  it('UX-4: the tap crossfades — the victory opens over the panel at once; the panel closes only once the victory is opaque', async () => {
    const h = createHarness();
    await wonLevel(h);
    await h.settle(cfg.fx.winOverlayDelayMs);
    await h.settle(cfg.rank.panelTapMinMs);
    h.router.props.ranking?.onContinue();
    expect(h.router.isOpen('victory')).toBe(true);
    expect(h.router.stack()).toEqual(['ranking', 'victory']);
    const closeAt = victoryCrossfadeMs(false);
    expect(closeAt).toBeGreaterThan(Math.max(cfg.rank.panelOutMs, cfg.fx.overlayFadeMs));
    await h.settle(closeAt - 1);
    expect(h.router.isOpen('ranking')).toBe(true);
    await h.settle(1);
    expect(h.router.isOpen('ranking')).toBe(false);
    expect(h.router.stack()).toEqual(['victory']);
  });

  it('UX-4: with reduced motion the panel closes after the 120 ms crossfade (and the panel fade)', () => {
    expect(victoryCrossfadeMs(true)).toBe(Math.max(cfg.rank.panelOutMs, cfg.fx.screenReducedMs) + 50);
  });

  it('a Hard level doubles the base (no fish bonus any more): 5×5 × 10 × 2 + the streak bonus', async () => {
    const h = createHarness({ save: (s) => ({ ...s, progress: { level: 30, completed: 29, best: {} }, streak: { current: 3, best: 3 } }) });
    await wonLevel(h, 30);
    expect(h.save().period.total).toBe(3); // still the fish kept
    await h.settle(cfg.fx.winOverlayDelayMs);
    await tapRanking(h);
    expect(h.router.props.victory?.pointsEarned).toBe(5 * 10 * 2 + 10 * 4);
    expect(h.router.props.victory?.streak).toBe(4);
  });

  it('a level already counted (replayed after a merge moved progress on) is never awarded twice: no points, no fish, panel at 1 200 with "This week" only', async () => {
    const before = { key: '2026-10-05', total: 9, bestKey: '2026-10-05', bestTotal: 9 };
    const h = createHarness({ save: (s) => ({ ...s, progress: { level: 9, completed: 8, best: {} }, streak: { current: 2, best: 2 }, period: before }) });
    await startLevel(h, 5); // replaying an old level: not counted
    winGame(h);
    expect(h.save().period).toEqual(before);
    expect(h.save().streak).toEqual({ current: 2, best: 2 });
    expect(h.save().points.total).toBe(0);
    expect(h.analytics.some((e) => e.name === 'win_points')).toBe(false);
    await h.settle(899);
    expect(h.router.game?.scrims).toBe(0);
    await h.settle(301);
    expect(h.router.isOpen('ranking')).toBe(true);
    expect(h.router.props.ranking?.result).toEqual({ kind: 'period', gained: 0, total: 9, periodKind: 'week' });
    expect(h.router.game?.counters).toEqual([]); // no counter, no flight
    await tapRanking(h);
    expect(h.router.props.victory).toMatchObject({ pointsEarned: null, streak: null, kept: null });
  });

  it('teardown mid-flow (Home from the victory, or dispose) leaves the saved rewards', async () => {
    const h = createHarness();
    await wonLevel(h);
    await h.settle(1500);
    h.session.dispose();
    await h.settle(10_000);
    expect(h.router.isOpen('ranking')).toBe(false);
    expect(h.save().period.total).toBe(3);
    expect(h.save().streak.current).toBe(1);
  });

  it('the win shows the period counter: the period total before the win at 1 s, then +1 per arriving fish; the lives empty from the last slot', async () => {
    const h = createHarness({ save: (s) => ({ ...s, period: { key: '2026-10-05', total: 39, bestKey: '2026-10-05', bestTotal: 39 } }) });
    await startLevel(h);
    for (const c of SOL5) h.session.onCellDoubleTap(c);
    await h.settle(3500);
    expect(h.router.game?.counters.slice(0, 4)).toEqual([39, 40, 41, 42]);
    expect(h.router.game?.departed).toEqual([2, 1, 0]);
  });

  it('a period rollover: last week\'s total does not count; the counter starts at 0 and best keeps last week', async () => {
    const h = createHarness({ save: (s) => ({ ...s, period: { key: '2026-09-28', total: 20, bestKey: '2026-09-28', bestTotal: 20 } }) });
    await startLevel(h);
    winGame(h);
    expect(h.save().period).toEqual({ key: '2026-10-05', total: 3, bestKey: '2026-09-28', bestTotal: 20 });
    await h.settle(1100);
    expect(h.router.game?.counters[0]).toBe(0);
  });
});
