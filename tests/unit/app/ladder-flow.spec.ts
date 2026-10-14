// Owner: G1 (Phase 2e). The ranking flow (docs/phase2e/spec.md §2.2–§2.9, §0.4; CONTRACTS §7) over the real
// client and the in-memory fake server (tests/fixtures/ladder-fake.ts): sign-in and the server as the source
// of truth for my name and "Show me in rankings"; the queue flush (oldest first, verdicts, aged and bad
// wins dropped, backoff, never a loop); the panel's list states (loading · bracket · bracket + stale ·
// records) with exactly the server's rows; the total; hearts (optimistic, exists, limit); result cards with
// Collect / ×2 by video and the ledger (never twice, the repair); the name sheet; Show me in rankings;
// Delete; the remote switch; the device-clock check for the streak.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeClock, type FakeClock } from '../../../src/app/clock';
import { cfg, mergeConfig, type GameConfig } from '../../../src/app/config';
import { createEventBus, type AnalyticsEvent, type AppEventMap } from '../../../src/app/events';
import { createLadderClient, type LadderClient } from '../../../src/app/ladder-client';
import { createLadderFlow, ROWS_KEY, type LadderChunk, type LadderFlow } from '../../../src/app/ladder-flow';
import { queueWin } from '../../../src/app/ladder-origin';
import { createStore, initialAppState, type AppState, type OverlayId, type Store } from '../../../src/app/store';
import { defaults } from '../../../src/game/save';
import type { SaveData } from '../../../src/game/types';
import type { PlayerView } from '../../../src/shared/rank-api';
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
  /** The router the flow uses (to open another overlay in a test). */
  routerApi: Parameters<typeof createLadderFlow>[0]['router'];
  analytics: AnalyticsEvent[];
  saves: string[];
  updates: string[];
  watch: { ok: boolean; calls: number };
  remote: { on: boolean };
  /** The app bus the flow listens to (game:start / game:end, pause / resume). */
  bus: ReturnType<typeof createEventBus<AppEventMap>>;
  save(): SaveData;
  queue(n: number, kept?: number): string;
  settle(ms?: number): Promise<void>;
  named(name: string): unknown[];
}

function setup(
  o: {
    save?: (s: SaveData) => SaveData;
    skewMs?: number;
    storage?: MemStorage;
    online?: () => boolean;
    config?: GameConfig;
    device?: boolean;
    player?: Partial<PlayerView>;
    rewarded?: boolean;
    /** Leaderboard update: the fake server joins on a `join: true` session (as the real one does). */
    join?: boolean;
  } = {},
): Setup {
  const clock = createFakeClock(NOW);
  const fake = createLadderFake({
    now: () => clock.now(),
    ...(o.skewMs !== undefined ? { skewMs: o.skewMs } : {}),
    ...(o.player ? { player: o.player } : {}),
    ...(o.join ? { joinOnSession: true } : {}),
  });
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
  const client = createLadderClient({
    baseUrl: 'https://rank.test',
    platformId: 'web',
    device: () => (o.device === false ? null : { id: 'q2Vx8LmN4pRt6WyZ0aBc1D', secret: 'k9Jf3Hs7Ld2Qw5Er8Ty1Ui4Op6As0Df3Gh5Jk7Lz9Xa' }),
    clock,
    clientVersion: '0.2.0',
    contentVersion: 'content-test',
    fetch: fake.fetch,
    ...(o.config ? { config: o.config } : {}),
  });
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
    rewardedAvailable: () => o.rewarded ?? true,
    ...(o.config ? { config: o.config } : {}),
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
    routerApi: router,
    analytics,
    saves,
    updates,
    watch,
    remote,
    bus,
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
    // audit B9 / A-H1 (H-4): while unanswered, the server's last total (none yet: 0) and the queued fish apart
    expect(s.flow.panelTotal()).toBe(0);
    expect(s.flow.panelWaiting()).toBe(3);
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
    expect(s.flow.panelWaiting()).toBe(0); // counted: nothing waits any more
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
    // audit B9 / A-H1: the header and the victory agree with my row: the server's 2, the 1 queued fish apart
    expect(s.flow.panelTotal()).toBe(2);
    expect(s.flow.panelWaiting()).toBe(1);
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

// ─────────── G1 resume: the remaining spec §10.1 rows of ladder-flow ───────────

describe('sign-in outcomes (spec §2.2, §10.1)', () => {
  it('no way to say who I am (no device credential / no identity API): no_api, records, no session call', async () => {
    const s = setup({ device: false });
    await s.flow.start();
    expect(s.named('ladder_auth')).toEqual([{ platform: 'web', result: 'no_api' }]);
    expect(s.flow.active()).toBe(false);
    expect(s.fake.paths()).not.toContain('POST /v1/session');
    expect(s.flow.settingsRows()).toBeUndefined();
  });

  it('the kill switch (503 disabled): records for the page load, no retry until the next boot', async () => {
    const s = setup();
    s.fake.failNext('/v1/session', 'disabled', 60_000);
    await s.flow.start();
    expect(s.named('ladder_auth')).toEqual([{ platform: 'web', result: 'disabled' }]);
    expect(s.flow.active()).toBe(false);
    s.queue(1);
    s.flow.onWin({ winId: winId(1), mode: 'level', kept: 2 });
    s.flow.homeMounted();
    await s.settle(10 * 60_000);
    expect(s.fake.paths().filter((p) => p === 'POST /v1/session')).toHaveLength(1);
    expect(s.save().ladder.pending).toHaveLength(1); // the queue is kept
    expect(s.flow.listState()).toMatchObject({ kind: 'records', reason: 'unavailable' });
  });

  it('a timeout: ladder_auth timeout; Home tries again later (the queue waits)', async () => {
    const s = setup();
    s.fake.hold = true;
    const p = s.flow.start();
    await s.settle(cfg.ladder.timeoutMs + 100);
    await p;
    expect(s.named('ladder_auth')).toEqual([{ platform: 'web', result: 'timeout' }]);
    expect(s.fake.paths().filter((x) => x === 'POST /v1/session')).toHaveLength(1); // not twice in a row
    s.fake.hold = false;
    s.fake.release();
    s.flow.homeMounted();
    await s.settle(0);
    expect(s.flow.debug().signedIn).toBe(true);
  });

  it('a suspended player (H-5): told, never shown a view; records with the paused note, the chip off', async () => {
    const s = setup({ player: { status: 'suspended' } });
    await s.flow.start();
    expect(s.flow.active()).toBe(false);
    s.queue(1);
    s.flow.onWin({ winId: winId(1), mode: 'level', kept: 2 });
    expect(s.flow.listState()).toMatchObject({ kind: 'records', reason: 'paused' });
    expect(s.flow.chip()).toEqual({ state: 'off' });
    await s.settle(0);
    expect(s.fake.paths()).not.toContain('POST /v1/wins');
    // A suspension answered on a later call (403 suspended) also ends the ladder for the page.
    const t = setup();
    await t.flow.start();
    t.queue(1);
    t.fake.failNext('/v1/wins', 'suspended');
    t.flow.onWin({ winId: winId(1), mode: 'level', kept: 2 });
    await t.settle(0);
    expect(t.flow.listState()).toMatchObject({ kind: 'records', reason: 'paused' });
  });
});

describe('rows rendered = rows returned (spec §10.6 #1, H-2, H-3)', () => {
  it.each([1, 37, 50])('%i rows: exactly the server rows in its order with its ranks and count; never more', async (n) => {
    const s = setup();
    await s.flow.start();
    for (let i = 0; i < n - 1; i++) s.fake.addOther({ nickname: `Other Cat ${i + 1}`, avatarId: i % 12, points: 100 - i });
    s.queue(1, 3);
    s.flow.onWin({ winId: winId(1), mode: 'level', kept: 3 });
    await s.settle(0);
    const st = s.flow.listState();
    expect(st?.kind).toBe('bracket');
    const view = st && st.kind === 'bracket' ? st.view : null;
    const server = (await s.client.bracket()) as unknown as { ok: true; value: { rows: { rank: number; slot: number; nickname: string; points: number }[]; members: number } };
    expect(view?.rows.map((r) => [r.rank, r.slot, r.name, r.points])).toEqual(server.value.rows.map((r) => [r.rank, r.slot, r.nickname, r.points]));
    expect(view?.rows).toHaveLength(n);
    expect(view?.members).toBe(n);
    expect(view?.rows.filter((r) => r.me)).toHaveLength(1);
    expect(view?.rewardsLine).toBe(n < s.fake.state.rules.minMembers ? 'min' : 'places');
    // UI batch (leaderboard): the chests' amounts are the server's rules.places, never ours (C-5).
    expect(view?.rewards).toEqual(s.fake.state.rules.places.map((p) => ({ place: p.place, hints: p.hints, kitties: p.kitties })));
  });

  it('0 rows (no bracket yet): no list is invented; the chip says Join', async () => {
    const s = setup();
    await s.flow.start();
    expect(s.flow.chip()).toEqual({ state: 'join' });
    s.flow.homeMounted();
    await s.settle(0);
    s.flow.openSheet('home');
    await s.settle(0);
    const sheet = s.router.props.ladder as { view: string; list: unknown };
    expect(sheet.view).toBe('list');
    expect(sheet.list).toBeNull(); // "Solve a puzzle to join the daily ranking." — never a placeholder row
  });
});

describe('the sheet: a fresh answer is current, never "Last updated" (requests-G3 R16, spec §2.4, §2.9)', () => {
  it('after an answer of this page load the sheet list is not stale; a failed refresh, the offline event or a boot from the stored cache make it stale', async () => {
    const storage = new MemStorage();
    const s = setup({ storage });
    await s.flow.start();
    s.fake.addOther({ nickname: 'Sleepy Whisker 27', avatarId: 1, points: 31 });
    s.queue(1, 3);
    s.flow.onWin({ winId: winId(1), mode: 'level', kept: 3 });
    await s.settle(0);
    s.flow.homeMounted();
    await s.settle(0);
    s.flow.openSheet('home');
    await s.settle(0);
    const sheet = (): { list: { stale: unknown; rows: { heartEnabled: boolean; me: boolean }[] } | null } => s.router.props.ladder as never;
    expect(sheet().list?.stale).toBeNull();
    expect(sheet().list?.rows.find((r) => !r.me)?.heartEnabled).toBe(true);
    // A failed refresh: the same cached rows, now marked stale (hearts off).
    s.fake.offline = true;
    await s.settle(cfg.ladder.homeRefreshMs);
    s.flow.homeMounted();
    await s.settle(0);
    s.flow.openSheet('home');
    await s.settle(0);
    expect(sheet().list?.stale).not.toBeNull();
    expect(sheet().list?.rows.some((r) => r.heartEnabled)).toBe(false);
    // A later answer makes it current again.
    s.fake.offline = false;
    await s.settle(cfg.ladder.homeRefreshMs);
    s.flow.homeMounted();
    await s.settle(0);
    s.flow.openSheet('home');
    await s.settle(0);
    expect(sheet().list?.stale).toBeNull();
    // The browser's offline event (where the environment has one).
    if (typeof globalThis.addEventListener === 'function' && typeof globalThis.dispatchEvent === 'function') {
      globalThis.dispatchEvent(new Event('offline'));
      s.flow.openSheet('home');
      await s.settle(0);
      expect(sheet().list?.stale).not.toBeNull();
    }
    s.flow.dispose();
    // A new page load with only the stored cache (offline): stale until the server answers.
    const again = setup({ storage, online: () => true });
    again.fake.offline = true;
    again.flow.openSheet('home');
    await again.settle(0);
    const st = again.router.props.ladder as { list: { stale: unknown } | null } | undefined;
    if (st?.list) expect(st.list.stale).not.toBeNull();
    again.flow.dispose();
  });
});

describe('an open sheet follows the answer that arrives after it opened (preview-link finding)', () => {
  it('a sheet opened while a bracket request is in flight is redrawn when that answer lands', async () => {
    const s = setup();
    await s.flow.start();
    s.queue(1, 3);
    s.flow.onWin({ winId: winId(1), mode: 'level', kept: 3 });
    await s.settle(0);
    // Someone joins after my win: only the next bracket answer knows them, the cached view does not.
    s.fake.addOther({ nickname: 'Sleepy Whisker 27', avatarId: 1, points: 31 });
    await s.settle(cfg.ladder.homeRefreshMs);
    s.flow.homeMounted(); // starts a bracket request
    s.flow.openSheet('home'); // same tick: its own refresh is throttled, so it draws the cached view at once
    await s.settle(0);
    const sheet = s.router.props.ladder as { list: { rows: { name: string }[] } | null };
    expect(sheet.list?.rows.map((r) => r.name)).toContain('Sleepy Whisker 27');
  });
});

describe('the Home chip and its refresh (spec §2.5, §2.2)', () => {
  it('bracket state from the saved numbers (rank, count, fish, ends on the device clock); refreshed at most every ladder.homeRefreshMs', async () => {
    const s = setup();
    await s.flow.start();
    s.fake.addOther({ nickname: 'Sleepy Whisker 27', avatarId: 1, points: 31 });
    s.queue(1, 3);
    s.flow.onWin({ winId: winId(1), mode: 'level', kept: 3 });
    await s.settle(0);
    const chip = s.flow.chip();
    expect(chip).toMatchObject({ state: 'bracket', rank: 2, members: 2, points: 3 });
    expect(chip.state === 'bracket' ? chip.endsAt : 0).toBe(s.fake.state.endsAt); // no skew in this setup
    const reads = (): number => s.fake.paths().filter((p) => p === 'GET /v1/bracket').length;
    s.flow.homeMounted();
    await s.settle(0);
    s.flow.homeMounted();
    await s.settle(0);
    expect(reads()).toBe(1);
    await s.settle(cfg.ladder.homeRefreshMs);
    s.flow.homeMounted();
    await s.settle(0);
    expect(reads()).toBe(2);
    // A failed refresh keeps the cached values (never an error text on Home).
    await s.settle(cfg.ladder.homeRefreshMs);
    s.fake.offline = true;
    s.flow.homeMounted();
    await s.settle(0);
    expect(s.flow.chip()).toMatchObject({ state: 'bracket', rank: 2, points: 3 });
  });

  it('flush triggers: after sign-in, at the next win, at Home mount and on the `online` event', async () => {
    const listeners = new Map<string, () => void>();
    vi.stubGlobal('addEventListener', (type: string, fn: () => void) => void listeners.set(type, fn));
    vi.stubGlobal('removeEventListener', (type: string) => void listeners.delete(type));
    try {
      const s = setup();
      s.fake.offline = true;
      s.queue(1);
      await s.flow.start(); // offline sign-in fails; the win waits
      expect(s.save().ladder.pending).toHaveLength(1);
      s.fake.offline = false;
      listeners.get('online')?.();
      await s.settle(0);
      expect(s.save().ladder.pending).toEqual([]);
      s.flow.dispose();
      expect(listeners.has('online')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('hearts: exists and my own row (spec §2.8, P-L10)', () => {
  it('heart_exists keeps the heart pressed silently; my own row takes one heart (self 1)', async () => {
    const s = setup();
    await s.flow.start();
    s.fake.addOther({ nickname: 'Sleepy Whisker 27', avatarId: 1, points: 31, hearts: 2 });
    s.queue(1);
    s.flow.onWin({ winId: winId(1), mode: 'level', kept: 2 });
    await s.settle(0);
    const row = (slot: number) => {
      const st = s.flow.listState();
      return st && st.kind === 'bracket' ? st.view.rows.find((r) => r.slot === slot) : undefined;
    };
    s.fake.failNext('/v1/hearts', 'heart_exists');
    s.flow.panelExtras().onHeart(0);
    await s.settle(0);
    expect(row(0)).toMatchObject({ hearts: 3, likedByMe: true, heartEnabled: false });
    expect(s.router.toasts).toEqual([]);
    expect(s.named('heart_give')).toEqual([{ result: 'exists', self: 0 }]);
    const mine = row(1);
    expect(mine?.me).toBe(true);
    expect(mine?.heartEnabled).toBe(true); // hearts.allowSelf
    s.flow.panelExtras().onHeart(1);
    await s.settle(0);
    expect(row(1)).toMatchObject({ hearts: 1, likedByMe: true, heartEnabled: false });
    expect(s.named('heart_give')[1]).toEqual({ result: 'ok', self: 1 });
  });
});

describe('result cards: the cap, order, rewardOnly, and ×2 after a failed claim (spec §2.6)', () => {
  /** A device that signs in with `results` waiting on the server (paid places 1 and the rest unpaid). */
  function withResults(results: { place: number; members: number; endedAt: number; paid: boolean }[], config?: GameConfig) {
    const s = setup(config ? { config } : {});
    s.fake.state.results = results.map((r, i) => {
      const bracketId = `aaaaaaaaaa${String(i + 1).padStart(2, '0')}`;
      return {
        bracketId,
        endedAt: r.endedAt,
        place: r.place,
        members: r.members,
        points: 9,
        reward: r.paid ? { rewardId: `${bracketId}:3`, place: 1 as const, grant: { hints: 2, kitties: 2 }, canDouble: true, expiresAt: NOW + 6 * 86_400_000, claim: null } : null,
      };
    });
    return s;
  }

  it('more than ladder.maxResultCards waiting: the older rewards are collected without ×2 (toast), one card, the newest', async () => {
    const results = [0, 1, 2, 3, 4].map((i) => ({ place: 1, members: 9, endedAt: NOW - (i + 1) * 3_600_000, paid: true }));
    const s = withResults(results);
    s.flow.homeMounted();
    await s.settle(0);
    const claims = s.fake.calls.filter((c) => c.path === '/v1/rewards/claim').map((c) => c.body as { rewardId: string; double: boolean });
    expect(claims).toHaveLength(results.length - cfg.ladder.maxResultCards);
    expect(claims.every((c) => c.double === false)).toBe(true);
    expect(claims.map((c) => c.rewardId)).toEqual(['aaaaaaaaaa04:3', 'aaaaaaaaaa05:3']); // the oldest
    expect(s.router.toasts).toContain('Collected!');
    expect(s.router.open).toEqual(['ladder_result']);
    expect(s.router.props.ladder_result).toMatchObject({ case: 'paid', place: 1 }); // the newest first
    expect(s.save().stock).toEqual({ hints: 4, kitties: 4 });
  });

  it("'rewardOnly': unpaid results get no card; 'always' (default) shows them once, newest first", async () => {
    const results = [
      { place: 7, members: 30, endedAt: NOW - 3_600_000, paid: false },
      { place: 9, members: 30, endedAt: NOW - 7_200_000, paid: false },
    ];
    const only = withResults(results, mergeConfig({ ladder: { resultCard: 'rewardOnly' } }));
    only.flow.homeMounted();
    await only.settle(0);
    expect(only.router.open).toEqual([]);
    const always = withResults(results);
    always.flow.homeMounted();
    await always.settle(0);
    expect(always.router.props.ladder_result).toMatchObject({ case: 'none', place: 7 });
    expect(always.save().ladder.resultsSeen).toEqual(['aaaaaaaaaa01']);
  });

  it('too few players: the top places get the "Not enough players" card (too_few), no reward, no claim', async () => {
    const s = withResults([{ place: 1, members: 3, endedAt: NOW - 3_600_000, paid: false }]);
    s.flow.homeMounted();
    await s.settle(0);
    expect(s.router.props.ladder_result).toMatchObject({ case: 'too_few', place: 1, members: 3, reward: null });
  });

  it('×2: the video completes but the claim fails → the reward id is kept; the next ×2 claims doubled WITHOUT a second video', async () => {
    const s = withResults([{ place: 1, members: 9, endedAt: NOW - 3_600_000, paid: true }]);
    s.flow.homeMounted();
    await s.settle(0);
    s.fake.failNext('/v1/rewards/claim', 'unavailable');
    (s.router.props.ladder_result as { onDouble(): void }).onDouble();
    await s.settle(0);
    expect(s.watch.calls).toBe(1);
    expect(s.save().ladder.doubleWatched).toEqual(['aaaaaaaaaa01:3']);
    expect(s.router.toasts).toContain("Couldn't collect right now. We'll keep your reward for a few days.");
    expect(s.save().stock).toEqual({ hints: 0, kitties: 0 });
    // The card comes back on the next Home visit; ×2 now claims without a video.
    s.flow.homeMounted();
    await s.settle(0);
    (s.router.props.ladder_result as { onDouble(): void }).onDouble();
    await s.settle(0);
    expect(s.watch.calls).toBe(1);
    expect(s.save().stock).toEqual({ hints: 4, kitties: 4 });
    expect(s.save().ladder.doubleWatched).toEqual([]);
  });

  it('no rewarded video available: no ×2 button (canDouble false), never a free ×2', async () => {
    const s = setup({ rewarded: false });
    s.fake.state.results = [
      { bracketId: 'aaaaaaaaaa01', endedAt: NOW - 1000, place: 1, members: 9, points: 9, reward: { rewardId: 'aaaaaaaaaa01:3', place: 1, grant: { hints: 2, kitties: 2 }, canDouble: true, expiresAt: NOW + 86_400_000, claim: null } },
    ];
    s.flow.homeMounted();
    await s.settle(0);
    expect(s.router.props.ladder_result).toMatchObject({ case: 'paid', canDouble: false });
  });
});

describe('the notice before the first submit (ladder.noticeFirst; spec §2.5, §7.8)', () => {
  const NOTICE = mergeConfig({ ladder: { noticeFirst: true } });

  it('on and not yet acknowledged: no request at all; Home opens the info view as a one-time dialog; OK → sign-in and the queued win sent', async () => {
    const s = setup({ config: NOTICE });
    s.queue(1);
    await s.flow.start();
    expect(s.fake.calls).toEqual([]);
    expect(s.flow.active()).toBe(false);
    expect(s.router.open).toEqual(['ladder']);
    const sheet = s.router.props.ladder as { view: string; infoOnly: boolean; onClose(): void };
    expect(sheet).toMatchObject({ view: 'info', infoOnly: true });
    // A win before OK is queued and not sent; the panel shows my records.
    s.flow.onWin({ winId: winId(1), mode: 'level', kept: 2 });
    expect(s.flow.listState()).toMatchObject({ kind: 'records' });
    sheet.onClose();
    await s.settle(0);
    expect(s.save().ladder.noticeSeen).toBe(true);
    expect(s.fake.paths()).toContain('POST /v1/session');
    expect(s.save().ladder.pending).toEqual([]);
    expect(s.flow.active()).toBe(true);
  });

  it('acknowledged once: never again (the next page load signs in at once); off (the default): never shown', async () => {
    const s = setup({ config: NOTICE, save: (b) => ({ ...b, ladder: { ...b.ladder, noticeSeen: true } }) });
    await s.flow.start();
    expect(s.router.open).toEqual([]);
    expect(s.flow.active()).toBe(true);
    const off = setup();
    await off.flow.start();
    off.flow.homeMounted();
    await off.settle(0);
    expect(off.router.open).not.toContain('ladder');
    expect(off.save().ladder.noticeSeen).toBe(false);
  });

  it('not on Home (a modal open): the notice waits for the next Home mount; the chip entry opens it too', async () => {
    const s = setup({ config: NOTICE });
    s.routerApi.open('settings', {} as never);
    await s.flow.start();
    expect(s.router.open).toEqual(['settings']); // no notice over another modal
    expect(s.fake.calls).toEqual([]);
    s.routerApi.close('settings');
    s.flow.homeMounted();
    expect(s.router.open).toEqual(['settings', 'ladder']);
    expect((s.router.props.ladder as { infoOnly: boolean }).infoOnly).toBe(true);
    const chip = setup({ config: NOTICE });
    chip.flow.openSheet('home');
    expect(chip.router.open).toEqual(['ladder']);
    expect((chip.router.props.ladder as { infoOnly: boolean }).infoOnly).toBe(true);
    expect(chip.named('ladder_open')).toEqual([]);
  });
});

describe('the streak clock check with dayStreak.serverSkewCheck on (spec §5.1, P-S7)', () => {
  it('a device clock off by more than maxSkewMs (with a server time seen in the last 24 h): false; within: true; no server time: true', async () => {
    const on = mergeConfig({ dayStreak: { serverSkewCheck: true } });
    const off = setup({ skewMs: on.dayStreak.maxSkewMs + 60_000, config: on });
    expect(off.flow.streakClockOk()).toBe(true); // no server time yet
    await off.flow.start();
    expect(off.flow.streakClockOk()).toBe(false);
    await off.settle(86_400_000 + 1);
    expect(off.flow.streakClockOk()).toBe(true); // the last server time is older than 24 h
    const ok = setup({ skewMs: 60_000, config: on });
    await ok.flow.start();
    expect(ok.flow.streakClockOk()).toBe(true);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a deletion on the server (an email request, spec §1.11; e2e #12)', () => {
  it('the old token answers 401 → one sign-in again as a fresh player: the new name everywhere, the old rows never again', async () => {
    const s = setup();
    await s.flow.start();
    s.fake.addOther({ nickname: 'Sleepy Whisker 27', avatarId: 1, points: 31 });
    s.queue(1);
    s.flow.onWin({ winId: winId(1), mode: 'level', kept: 2 });
    await s.settle(0);
    expect(s.storage.getItem(ROWS_KEY)).not.toBeNull();
    // The server deleted the player: every token is gone and the next session is a new player.
    s.fake.expireTokens();
    s.fake.state.points = null;
    s.fake.state.player = { ...s.fake.state.player, code: 'Z9Z9Z9Z9', nickname: 'Brave Comet 5', nick: { adj: 4, noun: 5, num: 5 } };
    s.flow.panelExtras().onHeart(0);
    await s.settle(0);
    expect(s.fake.paths().filter((p) => p === 'POST /v1/session')).toHaveLength(2);
    expect(s.save().ladder.me).toEqual({ name: 'Brave Comet 5', avatarId: 4, code: 'Z9Z9Z9Z9' });
    expect(s.storage.getItem(ROWS_KEY)).toBeNull();
    expect(s.flow.listState()).toBeNull(); // the old win's panel is gone with the old player
    expect(s.flow.settingsRows()?.code).toBe('Z9Z9-Z9Z9');
  });
});

describe('not listed: nothing leaves the device (spec §2.7, §2.9, §1.11)', () => {
  it('after Delete the next page load sends nothing (no sign-in that would re-create the player); Settings can switch it on again', async () => {
    const s = setup();
    await s.flow.start();
    s.flow.settingsRows()?.onDelete();
    await s.settle(0);
    // The next page load with the saved record.
    const next = setup({ save: () => s.save() });
    await next.flow.start();
    next.flow.homeMounted();
    await next.settle(10 * 60_000);
    expect(next.fake.calls).toEqual([]);
    expect(next.flow.chip()).toEqual({ state: 'off' });
    const rows = next.flow.settingsRows();
    expect(rows).toMatchObject({ name: '', code: null, listed: false });
    rows?.onListed(true);
    await next.settle(0);
    expect(next.fake.paths()).toEqual(['POST /v1/session', 'PUT /v1/me/profile']);
    expect(next.save().ladder).toMatchObject({ listed: true, me: { code: '7KQ2M9XD' } });
    expect(next.flow.active()).toBe(true);
  });

  it('switched off (a player on the server): the boot does not sign in; the rows keep my name and code', async () => {
    const me = { name: 'Velvet Pounce 27', avatarId: 4, code: '7KQ2M9XD' };
    const s = setup({ save: (b) => ({ ...b, ladder: { ...b.ladder, listed: false, me } }) });
    await s.flow.start();
    s.flow.homeMounted();
    await s.settle(0);
    expect(s.fake.calls).toEqual([]);
    expect(s.flow.settingsRows()).toMatchObject({ name: me.name, code: '7KQ2-M9XD', listed: false });
  });
});

describe('"+N hearts from other players" (spec §2.8, ladder.heartsNotify)', () => {
  it('shown with every answer that carries new hearts (the server resets its count on each read); never on a stale view', async () => {
    const s = setup();
    await s.flow.start();
    s.fake.addOther({ nickname: 'Sleepy Whisker 27', avatarId: 1, points: 31 });
    const panelHearts = (): number | undefined => {
      const st = s.flow.listState();
      return st && st.kind === 'bracket' ? st.view.heartsNew : undefined;
    };
    s.fake.state.heartsNew = 2;
    s.queue(1);
    s.flow.onWin({ winId: winId(1), mode: 'level', kept: 2 });
    await s.settle(0);
    expect(panelHearts()).toBe(2);
    s.fake.state.heartsNew = 3;
    s.queue(2, 1);
    s.flow.onWin({ winId: winId(2), mode: 'level', kept: 1 });
    await s.settle(0);
    expect(panelHearts()).toBe(3); // a later answer's new hearts show too
    s.fake.offline = true;
    s.queue(3, 1);
    s.flow.onWin({ winId: winId(3), mode: 'level', kept: 1 });
    await s.settle(cfg.ladder.panelWaitMs);
    expect(s.flow.listState()).toMatchObject({ kind: 'bracket', view: { heartsNew: 0 } });
    // ladder.heartsNotify off: never shown.
    const off = setup({ config: mergeConfig({ ladder: { heartsNotify: false } }) });
    await off.flow.start();
    off.fake.state.heartsNew = 2;
    off.queue(1);
    off.flow.onWin({ winId: winId(1), mode: 'level', kept: 2 });
    await off.settle(0);
    expect(off.flow.listState()).toMatchObject({ kind: 'bracket', view: { heartsNew: 0 } });
  });
});

// ─────────────────────────────── leaderboard update ───────────────────────────────

describe('leaderboard update: the sign-in join, presence, the "New ranking" card, the rank-up start', () => {
  const playingState = { mode: 'level', status: 'playing' } as never;

  it('the sign-in asks to join; a joining server puts me in a bracket with 0 fish (the chip shows my place)', async () => {
    const s = setup({ join: true });
    await s.flow.start();
    expect((s.fake.calls.find((c) => c.path === '/v1/session')?.body as { join?: boolean }).join).toBe(true);
    expect(s.save().ladder.current).toMatchObject({ points: 0, rank: 1, members: 1 });
    expect(s.flow.chip()).toMatchObject({ state: 'bracket', rank: 1, points: 0 });
  });

  it('with ladder.autoJoin off the sign-in does not ask', async () => {
    const s = setup({ join: true, config: mergeConfig({ ladder: { autoJoin: false } }) });
    await s.flow.start();
    expect((s.fake.calls.find((c) => c.path === '/v1/session')?.body as { join?: boolean }).join).toBeUndefined();
    expect(s.save().ladder.current).toBeNull();
  });

  it('presence: "playing" at a scored board, "online" when it ends; at most one ping per interval while it stays', async () => {
    const s = setup({ join: true });
    await s.flow.start();
    const pings = (): string[] => s.fake.calls.filter((c) => c.path === '/v1/presence').map((c) => (c.body as { state: string }).state);
    s.bus.emit('game:start', { state: playingState });
    await s.settle(0);
    expect(pings()).toEqual(['playing']);
    // The tutorial board is not "playing" in the ranking.
    s.bus.emit('game:start', { state: { mode: 'tutorial', status: 'playing' } as never });
    await s.settle(0);
    expect(pings()).toEqual(['playing']);
    await s.settle(cfg.ladder.presence.pingMs - 1000);
    expect(pings()).toEqual(['playing']);
    await s.settle(2000);
    expect(pings()).toEqual(['playing', 'playing']);
    s.bus.emit('game:end', { state: playingState, reason: 'home' });
    await s.settle(0);
    expect(pings()).toEqual(['playing', 'playing', 'online']);
    expect(s.fake.state.myPlaying).toBe(false);
  });

  it('presence: no ping while hidden or paused by FB, one on return; none without a running bracket', async () => {
    const s = setup({ join: true });
    await s.flow.start();
    const n = (): number => s.fake.calls.filter((c) => c.path === '/v1/presence').length;
    s.bus.emit('pause', { reason: 'hidden' });
    s.bus.emit('game:start', { state: playingState });
    await s.settle(3 * cfg.ladder.presence.pingMs);
    expect(n()).toBe(0);
    s.bus.emit('resume', { reason: 'hidden' });
    await s.settle(0);
    expect(n()).toBe(1);

    const none = setup(); // an older server: no join, so no bracket to mark
    await none.flow.start();
    none.bus.emit('game:start', { state: playingState });
    await none.settle(2 * cfg.ladder.presence.pingMs);
    expect(none.fake.calls.filter((c) => c.path === '/v1/presence')).toHaveLength(0);
  });

  it('the rows carry the server activity on the device clock (presence off: no status)', async () => {
    const s = setup({ join: true, skewMs: 90_000 });
    s.fake.addOther({ nickname: 'Misty Pebble 9', avatarId: 2, points: 6, seenAt: NOW + 90_000 - 4 * 60_000, playing: true });
    await s.flow.start();
    s.flow.openSheet('home');
    await s.settle(0);
    const list = (s.router.props.ladder as { list: { rows: { name: string; seenAt: number | null; playing: boolean }[] } }).list;
    expect(list.rows.find((r) => r.name === 'Misty Pebble 9')).toMatchObject({ seenAt: NOW - 4 * 60_000, playing: true });

    const off = setup({ join: true, config: mergeConfig({ ladder: { presence: { enabled: false } } }) });
    await off.flow.start();
    off.flow.openSheet('home');
    await off.settle(0);
    const rows = (off.router.props.ladder as { list: { rows: { seenAt: number | null; playing: boolean }[] } }).list.rows;
    expect(rows.every((r) => r.seenAt === null && !r.playing)).toBe(true);
  });

  it('the "New ranking" card: once per bracket the sign-in joined, on Home, never after a win in it', async () => {
    const storage = new MemStorage();
    const s = setup({ join: true, storage });
    await s.flow.start();
    s.flow.homeMounted();
    await s.settle(0);
    expect(s.router.open).toEqual(['ladder_session']);
    const props = s.router.props.ladder_session as { endsAt: number; avatarId: number | null; onClose(): void };
    expect(props.endsAt).toBe(s.fake.state.endsAt);
    expect(props.avatarId).toBe(4);
    props.onClose();
    s.flow.homeMounted();
    await s.settle(cfg.ladder.homeRefreshMs);
    expect(s.router.open).toEqual(['ladder_session']);
    // Another page load on this device: still once per bracket.
    const again = setup({ join: true, storage });
    again.fake.state.bracketId = s.fake.state.bracketId;
    await again.flow.start();
    again.flow.homeMounted();
    await again.settle(0);
    expect(again.router.open).toEqual([]);
    // A bracket joined with a win (fish in it) never gets the card.
    const won = setup();
    won.queue(1, 3);
    await won.flow.start();
    won.flow.homeMounted();
    await won.settle(0);
    expect(won.router.open).not.toContain('ladder_session');
  });

  it('the rank-up starts from my place and fish before the win (null: no running bracket)', async () => {
    const s = setup({ join: true });
    s.fake.addOther({ nickname: 'Misty Pebble 9', avatarId: 2, points: 6 });
    await s.flow.start();
    expect(s.save().ladder.current).toMatchObject({ rank: 2, points: 0 });
    const id = s.queue(1, 3);
    s.flow.onWin({ winId: id, mode: 'level', kept: 3 });
    expect(s.flow.panelExtras().climbFrom).toEqual({ bracketId: s.fake.state.bracketId, rank: 2, points: 0 });
    await s.settle(0);
    expect(s.save().ladder.current).toMatchObject({ rank: 2, points: 3 });

    const fresh = setup();
    await fresh.flow.start();
    fresh.flow.onWin({ winId: fresh.queue(1, 2), mode: 'level', kept: 2 });
    expect(fresh.flow.panelExtras().climbFrom).toEqual({ bracketId: null, rank: null, points: 0 });
  });
});
