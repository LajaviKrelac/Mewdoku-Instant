// Owner: G1 (Phase 2e). The ranking flow (docs/phase2e/spec.md §2.2–§2.9, §0.4; CONTRACTS §7) over the real
// client and the in-memory fake server (tests/fixtures/ladder-fake.ts): sign-in and the server as the source
// of truth for my name and "Show me in rankings"; the queue flush (oldest first, verdicts, aged and bad
// wins dropped, backoff, never a loop); the panel's list states (loading · bracket · bracket + stale ·
// records) with exactly the server's rows; the total; hearts (optimistic, exists, limit); result cards with
// Collect / ×2 by video and the ledger (never twice, the repair); the name sheet; Show me in rankings;
// Delete; the remote switch; the device-clock check for the streak.
import { describe, expect, it } from 'vitest';
import { createFakeClock, type FakeClock } from '../../../src/app/clock';
import { cfg } from '../../../src/app/config';
import { createEventBus, type AnalyticsEvent, type AppEventMap } from '../../../src/app/events';
import { createLadderClient, type LadderClient } from '../../../src/app/ladder-client';
import { createLadderFlow, ROWS_KEY, type LadderChunk, type LadderFlow } from '../../../src/app/ladder-flow';
import { queueWin } from '../../../src/app/ladder-origin';
import { createStore, initialAppState, type AppState, type OverlayId, type Store } from '../../../src/app/store';
import { defaults } from '../../../src/game/save';
import type { SaveData } from '../../../src/game/types';
import { createLadderFake, type LadderFake } from '../../fixtures/ladder-fake';
import { NOW } from './harness';

const SOLUTION = [0, 2, 4, 1, 3];
const drain = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await new Promise<void>((r) => setImmediate(r));
};
const winId = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

class MemStorage {
  readonly map = new Map<string, string>();
  getItem = (k: string): string | null => this.map.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.map.set(k, v);
  removeItem = (k: string): void => void this.map.delete(k);
}

interface FakeRouter {
  props: Partial<Record<OverlayId, unknown>>;
  open: string[];
  toasts: string[];
}

const CHUNK: LadderChunk = {
  createBracketList: (() => ({})) as unknown as LadderChunk['createBracketList'],
  NICK_WORDS_V1: { adj: ['Velvet', 'Misty', 'Sleepy', 'Cozy'], noun: ['Pounce', 'Pebble', 'Whisker', 'Biscuit'] },
  RETIRED_V1: { adj: [], noun: [] },
};

interface Setup {
  clock: FakeClock;
  fake: LadderFake;
  client: LadderClient;
  store: Store<AppState>;
  flow: LadderFlow;
  storage: MemStorage;
  router: FakeRouter;
  analytics: AnalyticsEvent[];
  saves: string[];
  updates: string[];
  watch: { ok: boolean; calls: number };
  remote: { on: boolean };
  save(): SaveData;
  queue(n: number, kept?: number): string;
  settle(ms?: number): Promise<void>;
  named(name: string): unknown[];
}

function setup(o: { save?: (s: SaveData) => SaveData; skewMs?: number; storage?: MemStorage; online?: () => boolean } = {}): Setup {
  const clock = createFakeClock(NOW);
  const fake = createLadderFake({ now: () => clock.now(), ...(o.skewMs !== undefined ? { skewMs: o.skewMs } : {}) });
  const storage = o.storage ?? new MemStorage();
  const base: SaveData = { ...defaults(NOW - 30 * 86_400_000), tutorialDone: true, progress: { level: 58, completed: 57, best: {} }, stock: { hints: 0, kitties: 0 } };
  const store = createStore<AppState>({ ...initialAppState(o.save ? o.save(base) : base), screen: 'home' });
  const bus = createEventBus<AppEventMap>();
  const analytics: AnalyticsEvent[] = [];
  const updates: string[] = [];
  bus.on('analytics', (e) => void analytics.push(e));
  bus.on('ladder:update', ({ reason }) => void updates.push(reason));
  const saves: string[] = [];
  const order: OverlayId[] = [];
  const recorded: FakeRouter = { props: {}, open: [], toasts: [] };
  const router: Parameters<typeof createLadderFlow>[0]['router'] = {
    open: ((id: OverlayId, props: unknown) => {
      order.push(id);
      recorded.props[id] = props;
      recorded.open.push(id);
    }) as never,
    update: ((id: OverlayId, props: unknown) => {
      if (order.includes(id)) recorded.props[id] = props;
    }) as never,
    close: (id: OverlayId) => {
      const i = order.indexOf(id);
      if (i >= 0) order.splice(i, 1);
    },
    isOpen: (id: OverlayId) => order.includes(id),
    stack: () => order.slice(),
    toast: (m: string) => void recorded.toasts.push(m),
    screen: () => 'home',
  };
  const client = createLadderClient({ baseUrl: 'https://rank.test', platformId: 'web', device: () => ({ id: 'q2Vx8LmN4pRt6WyZ0aBc1D', secret: 'k9Jf3Hs7Ld2Qw5Er8Ty1Ui4Op6As0Df3Gh5Jk7Lz9Xa' }), clock, clientVersion: '0.2.0', contentVersion: 'content-test', fetch: fake.fetch });
  const watch = { ok: true, calls: 0 };
  const remote = { on: true };
  const flow = createLadderFlow({
    client,
    store,
    saves: { critical: () => void saves.push('critical'), touch: () => void saves.push('touch'), now: () => void saves.push('now') },
    router,
    bus,
    clock,
    platformId: 'web',
    remoteOn: () => remote.on,
    rewardedAvailable: () => true,
    watchDouble: async () => {
      watch.calls++;
      return watch.ok;
    },
    loadChunk: async () => CHUNK,
    storage,
    online: o.online ?? (() => true),
    records: () => ({ rows: [] }) as never,
    canOpenCard: () => order.length === 0,
    random: () => 0.5,
  });
  const s: Setup = {
    clock,
    fake,
    client,
    store,
    flow,
    storage,
    router: recorded,
    analytics,
    saves,
    updates,
    watch,
    remote,
    save: () => store.get().save,
    queue(n, kept = 2) {
      const id = winId(n);
      store.update((st) => ({
        ...st,
        save: queueWin(
          st.save,
          {
            puzzleId: `L${56 + n}`,
            source: 'pack',
            contentVersion: 'content-test',
            solution: SOLUTION,
            kept,
            mistakes: 1,
            revives: 0,
            hints: 0,
            kitties: 0,
            mice: 0,
            solveMs: 60_000,
            deviceNow: clock.now(),
            clientVersion: '0.2.0',
          },
          id,
        ).save,
      }));
      return id;
    },
    async settle(ms = 0) {
      // The client's chains are longer than the fake clock's 10 microtask turns: drain whole macrotasks.
      await drain();
      await clock.advanceAsync(ms);
      await drain();
    },
    named: (name) => analytics.filter((e) => e.name === name).map((e) => e.params),
  };
  return s;
}

describe('sign-in (spec §2.2)', () => {
  it('signs in, takes my name, picture, code and "Show me in rankings" from the server; ladder_auth ok', async () => {
    const s = setup();
    await s.flow.start();
    expect(s.save().ladder.me).toEqual({ name: 'Velvet Pounce 27', avatarId: 4, code: '7KQ2M9XD' });
    expect(s.save().ladder.listed).toBe(true);
    expect(s.named('ladder_auth')).toEqual([{ platform: 'web', result: 'ok' }]);
    expect(s.flow.active()).toBe(true);
    expect(s.updates).toContain('session');
  });

  it('a refused sign-in turns the ladder off for the page (records), never retried in a loop', async () => {
    const s = setup();
    s.fake.failNext('/v1/session', 'web_disabled');
    await s.flow.start();
    expect(s.flow.active()).toBe(false);
    expect(s.named('ladder_auth')).toEqual([{ platform: 'web', result: 'rejected' }]);
    await s.flow.start();
    expect(s.fake.paths().filter((p) => p === 'POST /v1/session')).toHaveLength(1);
    expect(s.flow.chip().state).toBe('records');
  });

  it('the remote switch `ladder` off: no request at all, inactive', async () => {
    const s = setup();
    s.remote.on = false;
    await s.flow.start();
    s.flow.homeMounted();
    await s.settle(0);
    expect(s.fake.calls).toEqual([]);
    expect(s.flow.active()).toBe(false);
  });
});

describe('the queue (spec §2.3, §2.9)', () => {
  it('queued wins are sent oldest first after sign-in; verdicts empty the queue; my numbers saved without rows', async () => {
    const s = setup();
    const a = s.queue(1, 2);
    const b = s.queue(2, 3);
    await s.flow.start();
    const wins = s.fake.calls.find((c) => c.path === '/v1/wins')?.body as { wins: { winId: string }[] };
    expect(wins.wins.map((w) => w.winId)).toEqual([a, b]);
    expect(s.save().ladder.pending).toEqual([]);
    expect(s.save().ladder.current).toMatchObject({ points: 5, rank: 1, members: 1 });
    expect(JSON.stringify(s.save())).not.toContain('Sleepy'); // never another player's name in the save
    expect(s.named('ladder_submit')).toEqual([
      { mode: 'level', result: 'accepted', reason: '', ms: 0 },
      { mode: 'level', result: 'accepted', reason: '', ms: 0 },
    ]);
  });

  it('a rejected win is dropped quietly; a duplicate counts as answered', async () => {
    const s = setup();
    const a = s.queue(1);
    s.fake.verdict(a, 'rejected', 'bad_solution');
    await s.flow.start();
    expect(s.save().ladder.pending).toEqual([]);
    expect(s.named('ladder_submit')).toEqual([{ mode: 'level', result: 'rejected', reason: 'bad_solution', ms: 0 }]);
  });

  it('offline: the queue stays; retried on the backoff (ladder.backoffMs), then waits for the next win or Home', async () => {
    const s = setup();
    await s.flow.start();
    s.queue(1);
    s.fake.offline = true;
    s.flow.onWin({ winId: winId(1), mode: 'level', kept: 2 });
    await s.settle(0);
    expect(s.save().ladder.pending).toHaveLength(1);
    const sent = (): number => s.fake.paths().filter((p) => p === 'POST /v1/wins').length;
    expect(sent()).toBe(1);
    for (const step of cfg.ladder.backoffMs) await s.settle(step);
    expect(sent()).toBe(1 + cfg.ladder.backoffMs.length);
    await s.settle(10 * 60_000);
    expect(sent()).toBe(1 + cfg.ladder.backoffMs.length); // never a loop
    s.fake.offline = false;
    s.flow.homeMounted();
    await s.settle(0);
    expect(s.save().ladder.pending).toEqual([]);
  });

  it('bad_request drops the batch (a client bug never loops); aged wins are dropped with reason age', async () => {
    const s = setup();
    s.queue(1);
    s.fake.failNext('/v1/wins', 'bad_request');
    await s.flow.start();
    expect(s.save().ladder.pending).toEqual([]);
    expect(s.named('ladder_submit')).toEqual([{ mode: 'level', result: 'error', reason: 'bad_request', ms: 0 }]);
    const old = setup();
    old.queue(1);
    await old.settle(cfg.ladder.pendingMaxAgeMs + 1);
    await old.flow.start();
    expect(old.save().ladder.pending).toEqual([]);
    expect(old.fake.paths()).not.toContain('POST /v1/wins');
    expect(old.named('ladder_submit')).toEqual([{ mode: 'level', result: 'dropped', reason: 'age', ms: 0 }]);
  });

  it('"Show me in rankings" off: nothing is sent', async () => {
    const s = setup();
    await s.flow.start();
    s.store.update((st) => ({ ...st, save: { ...st.save, ladder: { ...st.save.ladder, listed: false } } }));
    s.queue(1);
    s.flow.onWin({ winId: winId(1), mode: 'level', kept: 2 });
    await s.settle(0);
    expect(s.fake.paths()).not.toContain('POST /v1/wins');
    expect(s.flow.listState()).toMatchObject({ kind: 'records', reason: 'opted_out' }); // at once, with its note
  });
});

describe("the panel's list (spec §2.4, §0.4)", () => {
  it('loading while the answer is out; then exactly the server rows, in its order, with its count', async () => {
    const s = setup();
    await s.flow.start();
    s.fake.addOther({ nickname: 'Sleepy Whisker 27', avatarId: 1, points: 31 });
    s.fake.addOther({ nickname: 'Cozy Biscuit 41', avatarId: 7, points: 1 });
    s.queue(1, 3);
    s.fake.hold = true;
    s.flow.onWin({ winId: winId(1), mode: 'level', kept: 3 });
    await s.settle(0);
    expect(s.flow.listState()).toEqual({ kind: 'loading' });
    expect(s.flow.panelTotal()).toBe(3); // my estimate while unanswered (0 before + 3 kept)
    s.fake.hold = false;
    s.fake.release();
    await s.settle(0);
    const st = s.flow.listState();
    expect(st?.kind).toBe('bracket');
    const view = st && st.kind === 'bracket' ? st.view : null;
    expect(view?.rows.map((r) => [r.rank, r.name, r.points, r.me])).toEqual([
      [1, 'Sleepy Whisker 27', 31, false],
      [2, 'Velvet Pounce 27', 3, true],
      [3, 'Cozy Biscuit 41', 1, false],
    ]);
    expect(view?.members).toBe(3);
    expect(view?.stale).toBeNull();
    expect(s.flow.panelTotal()).toBe(3);
    expect(s.named('ladder_panel')).toEqual([{ state: 'bracket', rows: 3, rank: 2, ms: 0 }]);
  });

  it('no answer within ladder.panelWaitMs: the cached bracket of a real answer, marked stale; without one, my records', async () => {
    const s = setup();
    await s.flow.start();
    s.fake.addOther({ nickname: 'Sleepy Whisker 27', avatarId: 1, points: 31 });
    s.queue(1, 2);
    s.flow.onWin({ winId: winId(1), mode: 'level', kept: 2 });
    await s.settle(0);
    expect(s.storage.getItem(ROWS_KEY)).toContain('Sleepy Whisker 27'); // rows only in the rows cache
    s.queue(2, 1);
    s.fake.offline = true;
    s.flow.onWin({ winId: winId(2), mode: 'level', kept: 1 });
    await s.settle(cfg.ladder.panelWaitMs);
    const st = s.flow.listState();
    expect(st?.kind).toBe('bracket');
    const view = st && st.kind === 'bracket' ? st.view : null;
    expect(view?.stale).not.toBeNull();
    expect(view?.rows.find((r) => r.me)?.points).toBe(2); // the server's number, never a guess
    expect(view?.waiting).toBe(1); // the queued fish shown as waiting
    // A fresh device (no cache) offline: my records.
    const fresh = setup();
    fresh.fake.offline = true;
    fresh.queue(1);
    fresh.flow.onWin({ winId: winId(1), mode: 'level', kept: 2 });
    await fresh.settle(cfg.ladder.panelWaitMs);
    expect(fresh.flow.listState()).toMatchObject({ kind: 'records' });
  });

  it('the rows cache is dropped once the bracket ended (server clock)', async () => {
    const storage = new MemStorage();
    const s = setup({ storage });
    await s.flow.start();
    s.queue(1);
    s.flow.onWin({ winId: winId(1), mode: 'level', kept: 2 });
    await s.settle(0);
    expect(storage.getItem(ROWS_KEY)).not.toBeNull();
    await s.settle(cfg.ladder.homeRefreshMs);
    s.fake.offline = true;
    await s.settle(s.fake.state.endsAt - s.clock.now() + 1);
    s.queue(2);
    s.flow.onWin({ winId: winId(2), mode: 'level', kept: 1 });
    await s.settle(cfg.ladder.panelWaitMs);
    expect(s.flow.listState()).toMatchObject({ kind: 'records' });
    expect(storage.getItem(ROWS_KEY)).toBeNull();
  });
});

describe('hearts (spec §2.8)', () => {
  async function bracket() {
    const s = setup();
    await s.flow.start();
    s.fake.addOther({ nickname: 'Sleepy Whisker 27', avatarId: 1, points: 31, hearts: 4 });
    s.queue(1);
    s.flow.onWin({ winId: winId(1), mode: 'level', kept: 2 });
    await s.settle(0);
    return s;
  }
  const rowOf = (s: Setup, slot: number) => {
    const st = s.flow.listState();
    return st && st.kind === 'bracket' ? st.view.rows.find((r) => r.slot === slot) : undefined;
  };

  it('optimistic +1, then the server count; pressed once', async () => {
    const s = await bracket();
    s.flow.panelExtras().onHeart(0);
    expect(rowOf(s, 0)).toMatchObject({ hearts: 5, likedByMe: true });
    await s.settle(0);
    expect(rowOf(s, 0)).toMatchObject({ hearts: 5, likedByMe: true, heartEnabled: false });
    expect(s.named('heart_give')).toEqual([{ result: 'ok', self: 0 }]);
  });

  it('heart_limit undoes the press and turns every heart off; another error toasts', async () => {
    const s = await bracket();
    s.fake.failNext('/v1/hearts', 'heart_limit');
    s.flow.panelExtras().onHeart(0);
    await s.settle(0);
    expect(rowOf(s, 0)).toMatchObject({ hearts: 4, likedByMe: false, heartEnabled: false });
    const t = await bracket();
    t.fake.failNext('/v1/hearts', 'unavailable');
    t.flow.panelExtras().onHeart(0);
    await t.settle(0);
    expect(rowOf(t, 0)).toMatchObject({ hearts: 4, likedByMe: false });
    expect(t.router.toasts).toHaveLength(1);
  });
});

describe('result cards, claim and ×2 (spec §2.6, §1.6)', () => {
  async function ended(place: 'first' | 'fourth' = 'first') {
    const s = setup();
    await s.flow.start();
    const others = place === 'first' ? [1, 1, 1, 1] : [40, 30, 20, 1];
    others.forEach((p, i) => s.fake.addOther({ nickname: `Other Cat ${i + 1}`, avatarId: i, points: p }));
    s.queue(1, 3);
    s.flow.onWin({ winId: winId(1), mode: 'level', kept: 3 });
    await s.settle(0);
    s.fake.endBracket();
    // The next page load: a new sign-in carries the result.
    s.client.signOut();
    const t = setup({ save: () => s.save() });
    t.fake.state.results = s.fake.state.results;
    t.fake.state.player = s.fake.state.player;
    return t;
  }

  it('Home shows the card once; Collect ×2 plays the video, claims doubled, grants once and records the ledger', async () => {
    const s = await ended();
    s.flow.homeMounted();
    await s.settle(0);
    expect(s.router.open).toEqual(['ladder_result']);
    const card = s.router.props.ladder_result as { case: string; place: number; members: number; reward: unknown; canDouble: boolean; onDouble(): void };
    expect(card).toMatchObject({ case: 'paid', place: 1, members: 5, reward: { hints: 2, kitties: 2 }, canDouble: true });
    card.onDouble();
    await s.settle(0);
    expect(s.watch.calls).toBe(1);
    expect(s.save().stock).toEqual({ hints: 4, kitties: 4 });
    expect(s.save().ladder.claimed).toHaveLength(1);
    expect(s.named('ladder_claim')).toEqual([{ result: 'ok', doubled: 1 }]);
    expect(s.saves).toContain('critical');
    // Again (a new page load): no card, no second grant; the repair finds nothing missing.
    const again = setup({ save: () => s.save() });
    again.fake.state.results = s.fake.state.results;
    again.fake.state.claims = s.fake.state.claims;
    again.flow.homeMounted();
    await again.settle(0);
    expect(again.router.open).toEqual([]);
    expect(again.save().stock).toEqual({ hints: 4, kitties: 4 });
  });

  it('the video fails: the no-video toast, the card stays, nothing claimed', async () => {
    const s = await ended();
    s.watch.ok = false;
    s.flow.homeMounted();
    await s.settle(0);
    (s.router.props.ladder_result as { onDouble(): void }).onDouble();
    await s.settle(0);
    expect(s.save().stock).toEqual({ hints: 0, kitties: 0 });
    expect(s.named('ladder_claim')).toEqual([{ result: 'video_failed', doubled: 1 }]);
    expect(s.fake.paths()).not.toContain('POST /v1/rewards/claim');
  });

  it('a claim the server has but this device lacks is repaired once at sign-in (never twice)', async () => {
    const s = await ended();
    s.flow.homeMounted();
    await s.settle(0);
    (s.router.props.ladder_result as { onCollect(): void }).onCollect();
    await s.settle(0);
    expect(s.save().stock).toEqual({ hints: 2, kitties: 2 });
    // Another device (no ledger entry) signs in: the server's claim is applied once.
    const other = setup();
    other.fake.state.results = s.fake.state.results;
    other.fake.state.claims = s.fake.state.claims;
    await other.flow.start();
    expect(other.save().stock).toEqual({ hints: 2, kitties: 2 });
    await other.flow.start();
    other.client.signOut();
    await other.flow.start();
    expect(other.save().stock).toEqual({ hints: 2, kitties: 2 });
  });

  it('an unpaid place shows its card once (no reward, no claim)', async () => {
    const s = await ended('fourth');
    s.flow.homeMounted();
    await s.settle(0);
    expect(s.router.props.ladder_result).toMatchObject({ case: 'none', place: 4, reward: null });
  });
});

describe('name, Show me in rankings, Delete (spec §2.7)', () => {
  it('the name sheet saves a pick; the server name is shown everywhere', async () => {
    const s = setup();
    await s.flow.start();
    s.flow.settingsRows()?.onName();
    await s.settle(0);
    const sheet = s.router.props.nickname as { onSave(p: { adj: number; noun: number; num: number; avatarId: number }): void };
    sheet.onSave({ adj: 1, noun: 2, num: 9, avatarId: 3 });
    await s.settle(0);
    expect(s.save().ladder.me).toMatchObject({ name: 'Misty Whisker 9', avatarId: 3 });
    expect(s.named('nick_set')).toEqual([{ result: 'ok', avatar: 1 }]);
  });

  it('a second change inside the cooldown: the sheet says when (cooldown state)', async () => {
    const s = setup();
    await s.flow.start();
    s.fake.failNext('/v1/me/profile', 'nickname_cooldown');
    s.flow.settingsRows()?.onName();
    await s.settle(0);
    (s.router.props.nickname as { onSave(p: object): void }).onSave({ adj: 1, noun: 1, num: 1, avatarId: 4 });
    await s.settle(0);
    expect(s.router.props.nickname).toMatchObject({ state: 'cooldown' });
  });

  it('Show me in rankings off: the server stores it; the panel shows my records (opted_out)', async () => {
    const s = setup();
    await s.flow.start();
    s.flow.settingsRows()?.onListed(false);
    await s.settle(0);
    expect(s.save().ladder.listed).toBe(false);
    expect(s.fake.state.player.listed).toBe(false);
    expect(s.named('ladder_listed')).toEqual([{ on: 0 }]);
    expect(s.flow.chip()).toEqual({ state: 'off' });
  });

  it('Delete: DELETE /me, signed out, the ranking record reset, the rows cache gone', async () => {
    const s = setup();
    await s.flow.start();
    s.queue(1);
    s.flow.onWin({ winId: winId(1), mode: 'level', kept: 2 });
    await s.settle(0);
    s.flow.settingsRows()?.onDelete();
    await s.settle(0);
    expect(s.fake.paths()).toContain('DELETE /v1/me');
    expect(s.client.signedIn()).toBe(false);
    expect(s.save().ladder.me).toBeNull();
    expect(s.save().ladder.current).toBeNull();
    expect(s.storage.getItem(ROWS_KEY)).toBeNull();
    expect(s.named('ladder_delete')).toEqual([{ result: 'ok' }]);
  });
});

describe('the streak clock check (spec §5.1, dayStreak.serverSkewCheck)', () => {
  it('a device clock off by more than dayStreak.maxSkewMs: streakClockOk false; within it, true', async () => {
    const off = setup({ skewMs: cfg.dayStreak.maxSkewMs + 60_000 });
    await off.flow.start();
    expect(off.flow.streakClockOk()).toBe(cfg.dayStreak.serverSkewCheck ? false : true);
    const ok = setup({ skewMs: 5_000 });
    await ok.flow.start();
    expect(ok.flow.streakClockOk()).toBe(true);
  });
});
