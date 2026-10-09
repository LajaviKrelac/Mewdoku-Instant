// Owner: D (Phase 2b; was platform)
// fb-storage (05 §7, 04 §7.1): cloud + mirror on load, mirror written at once, debounced
// setDataAsync, flush only for 'flush', retry/backoff, coalescing, no cloud writes after a failed read
// until the late cloud copy was merged, the unmerged-mirror marker, per-player mirrors.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg } from '../../../src/app/config';
import type { SaveData } from '../../../src/game/types';
import { createFbStorage } from '../../../src/platform/fb/fb-storage';
import type { ExternalSave } from '../../../src/platform/types';
import { createLocalFlag, createLocalStore } from '../../../src/platform/web/local-storage';
import { createStub, drain, MemoryStorage, track, type StubConfig } from './helpers';

const KEY = cfg.save.storageKey;

/** Only the fields the adapter cares about (it never inspects the document). */
function doc(n: number): SaveData {
  return { v: 1, updatedAt: n, sessions: n } as unknown as SaveData;
}

function setup(config: StubConfig = {}, opts: { cloudEnabled?: () => boolean; storage?: MemoryStorage } = {}) {
  const clock = createFakeClock();
  const { sdk, control } = createStub(config, clock);
  const storage = opts.storage ?? new MemoryStorage();
  const local = createLocalStore(KEY, { storage, now: () => clock.now() });
  const logs: string[] = [];
  const store = createFbStorage(sdk, {
    local,
    timers: clock,
    log: (m) => logs.push(m),
    ...(opts.cloudEnabled ? { cloudEnabled: opts.cloudEnabled } : {}),
  });
  const sent = (): number[] =>
    control.find('player.setDataAsync').map((c) => ((c.args[0] as { save: SaveData }).save as unknown as { sessions: number }).sessions);
  return { clock, control, storage, store, logs, sent };
}

describe('createFbStorage: load', () => {
  it('returns the local mirror and the cloud copy side by side (the app merges)', async () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, JSON.stringify(doc(1)));
    const { store, control } = setup({ data: { save: doc(2) } }, { storage });
    const raw = await store.load();
    expect(raw).toEqual({ local: doc(1), cloud: doc(2), corrupt: false });
    expect(control.find('player.getDataAsync')[0]?.args).toEqual([[cfg.save.cloudKey]]);
  });

  it('accepts a JSON string in the cloud and flags an unparseable one as corrupt', async () => {
    const a = setup({ data: { save: JSON.stringify(doc(3)) } });
    expect((await a.store.load()).cloud).toEqual(doc(3));
    const b = setup({ data: { save: '{oops' } });
    expect(await b.store.load()).toEqual({ local: null, cloud: null, corrupt: true });
  });

  it('a first-time player has no copies', async () => {
    const { store } = setup();
    expect(await store.load()).toEqual({ local: null, cloud: null, corrupt: false });
  });

  it('skips the cloud entirely when cloud save is unsupported', async () => {
    const { store, control, clock } = setup({ data: { save: doc(9) } }, { cloudEnabled: () => false });
    expect((await store.load()).cloud).toBeNull();
    await store.save(doc(1), { cloud: 'now' });
    await clock.advanceAsync(10_000);
    expect(control.count('player.getDataAsync')).toBe(0);
    expect(control.count('player.setDataAsync')).toBe(0);
  });

  it('retries a NETWORK_FAILURE read, then succeeds', async () => {
    const { store, clock } = setup({ data: { save: doc(4) }, errors: { getDataAsync: ['NETWORK_FAILURE'] } });
    const res = track(store.load());
    await drain();
    expect(res.done).toBe(false);
    await clock.advanceAsync(cfg.save.cloudRetryDelaysMs[0] ?? 0);
    await drain();
    expect(res.value?.cloud).toEqual(doc(4));
  });

  it('after a failed or timed-out read it keeps the mirror and never writes to the cloud', async () => {
    const slow = setup({ data: { save: doc(5) }, getDataDelayMs: 60_000 });
    const res = track(slow.store.load());
    await slow.clock.advanceAsync(cfg.save.cloudLoadTimeoutMs);
    await drain();
    expect(res.value).toEqual({ local: null, cloud: null, corrupt: false });
    await slow.store.save(doc(6), { cloud: 'flush' });
    await slow.clock.advanceAsync(70_000);
    expect(slow.control.count('player.setDataAsync')).toBe(0);
    expect(slow.storage.getItem(KEY)).toBe(JSON.stringify(doc(6)));

    const bad = setup({ errors: { getDataAsync: ['INVALID_PARAM'] } });
    expect((await bad.store.load()).cloud).toBeNull();
    await bad.store.save(doc(7), { cloud: 'now' });
    expect(bad.control.count('player.setDataAsync')).toBe(0);
  });
});

describe('createFbStorage: save', () => {
  it('mirrors every write locally at once and debounces the cloud write', async () => {
    const { store, clock, storage, sent, control } = setup();
    await store.load();
    await store.save(doc(1), { cloud: 'debounced' });
    expect(storage.getItem(KEY)).toBe(JSON.stringify(doc(1)));
    await clock.advanceAsync(1_000);
    await store.save(doc(2), { cloud: 'debounced' });
    await clock.advanceAsync(1_000);
    await store.save(doc(3), { cloud: 'debounced' });
    expect(storage.getItem(KEY)).toBe(JSON.stringify(doc(3)));
    await clock.advanceAsync(cfg.save.cloudDebounceMs - 2_000 - 1);
    expect(sent()).toEqual([]);
    await clock.advanceAsync(1);
    await drain();
    expect(sent()).toEqual([3]); // one write, newest document, window opened by the first change
    expect(control.count('player.flushDataAsync')).toBe(0);
    expect(control.playerData()).toEqual({ save: doc(3) });
  });

  it("'now' cancels the debounce and writes at once, without a flush", async () => {
    const { store, clock, sent, control } = setup();
    await store.load();
    await store.save(doc(1), { cloud: 'debounced' });
    await store.save(doc(2), { cloud: 'now' });
    expect(sent()).toEqual([2]);
    await clock.advanceAsync(cfg.save.cloudDebounceMs * 2);
    await drain();
    expect(sent()).toEqual([2]);
    expect(control.count('player.flushDataAsync')).toBe(0);
  });

  it("'flush' writes the newest document, then flushes", async () => {
    const { store, control } = setup();
    await store.load();
    await store.save(doc(1), { cloud: 'debounced' });
    await store.save(doc(2), { cloud: 'flush' });
    const names = control.names().filter((n) => n.startsWith('player.') && n !== 'player.getDataAsync');
    expect(names).toEqual(['player.setDataAsync', 'player.flushDataAsync']);
  });

  it('coalesces writes requested while one is in flight', async () => {
    const { store, clock, sent } = setup({ setDataDelayMs: 100 });
    await store.load();
    const first = track(store.save(doc(1), { cloud: 'now' }));
    await drain();
    void store.save(doc(2), { cloud: 'now' });
    void store.save(doc(3), { cloud: 'now' });
    await clock.advanceAsync(100);
    await drain();
    await clock.advanceAsync(100);
    await drain();
    expect(sent()).toEqual([1, 3]);
    expect(first.done).toBe(true);
  });

  it('retries NETWORK_FAILURE with backoff and sends the newest document on retry', async () => {
    const { store, clock, sent } = setup({ errors: { setDataAsync: ['NETWORK_FAILURE', 'NETWORK_FAILURE'] } });
    await store.load();
    void store.save(doc(1), { cloud: 'now' });
    await drain();
    expect(sent()).toEqual([1]);
    void store.save(doc(2), { cloud: 'now' }); // arrives during the backoff: coalesced
    const [d0 = 0, d1 = 0] = cfg.save.cloudRetryDelaysMs;
    await clock.advanceAsync(d0);
    await drain();
    expect(sent()).toEqual([1, 2]);
    await clock.advanceAsync(d1);
    await drain();
    expect(sent()).toEqual([1, 2, 2]);
    await clock.advanceAsync(60_000);
    await drain();
    expect(sent()).toEqual([1, 2, 2]);
  });

  it('coalesces on PENDING_REQUEST (a flush still pending) and retries', async () => {
    const { store, clock, sent, control } = setup({ errors: { setDataAsync: ['PENDING_REQUEST'] } });
    await store.load();
    void store.save(doc(1), { cloud: 'flush' });
    await drain();
    expect(control.count('player.flushDataAsync')).toBe(0);
    await clock.advanceAsync(cfg.save.cloudRetryDelaysMs[0] ?? 0);
    await drain();
    expect(sent()).toEqual([1, 1]);
    expect(control.count('player.flushDataAsync')).toBe(1);
  });

  it('drops INVALID_PARAM writes (logged, local copy kept) and carries on', async () => {
    const { store, clock, sent, logs, storage } = setup({ errors: { setDataAsync: ['INVALID_PARAM'] } });
    await store.load();
    await store.save(doc(1), { cloud: 'now' });
    await clock.advanceAsync(30_000);
    expect(sent()).toEqual([1]);
    expect(logs.some((l) => l.includes('INVALID_PARAM'))).toBe(true);
    expect(storage.getItem(KEY)).toBe(JSON.stringify(doc(1)));
    await store.save(doc(2), { cloud: 'now' });
    expect(sent()).toEqual([1, 2]);
  });

  it('after the retries run out it keeps the document dirty for the next save', async () => {
    const fails = cfg.save.cloudRetryDelaysMs.map(() => 'NETWORK_FAILURE');
    const { store, clock, sent, control } = setup({ errors: { setDataAsync: ['NETWORK_FAILURE', ...fails] } });
    await store.load();
    void store.save(doc(1), { cloud: 'flush' });
    for (const d of cfg.save.cloudRetryDelaysMs) {
      await drain();
      await clock.advanceAsync(d);
    }
    await drain();
    expect(sent().length).toBe(cfg.save.cloudRetryDelaysMs.length + 1);
    expect(control.count('player.flushDataAsync')).toBe(0);
    // The error queue is empty now: the next save goes through and the pending flush follows.
    await clock.advanceAsync(60_000);
    void store.save(doc(2), { cloud: 'now' });
    await drain();
    await clock.advanceAsync(cfg.save.cloudRetryDelaysMs[0] ?? 0);
    await drain();
    expect(sent().slice(-1)).toEqual([2]);
    expect(control.count('player.flushDataAsync')).toBe(1); // the earlier flush request is honoured
    expect(control.playerData()).toEqual({ save: doc(2) });
  });

  it('passes the memory-fallback warning through from the local store', async () => {
    const storage = new MemoryStorage();
    const { store } = setup({}, { storage });
    const seen: number[] = [];
    store.onMemoryFallback?.(() => seen.push(1));
    expect(store.status()).toBe('ok');
    storage.failWrites = true;
    await store.save(doc(1), { cloud: 'debounced' });
    expect(store.status()).toBe('memory');
    expect(seen).toEqual([1]);
  });
});

// ── Review fixes: PLAT-1 (late cloud read, unmerged marker), PLAT-2 (per-player mirror), PLAT-3 ──

const FLAG = `${KEY}#unmerged`;

/** A store wired like the adapter: persisted marker, optional per-player scoping. */
function wired(
  config: StubConfig,
  opts: { storage?: MemoryStorage | null; scopedTo?: () => string | null } = {},
) {
  const clock = createFakeClock();
  const { sdk, control } = createStub(config, clock);
  const storage = opts.storage === undefined ? new MemoryStorage() : opts.storage;
  const at = (key: string) => ({
    local: createLocalStore(key, { storage, now: () => clock.now() }),
    unmerged: createLocalFlag(`${key}#unmerged`, { storage }),
  });
  const unscoped = at(KEY);
  const store = createFbStorage(sdk, {
    local: unscoped.local,
    unmerged: unscoped.unmerged,
    timers: clock,
    log: () => undefined,
    ...(opts.scopedTo ? { scoped: { playerId: opts.scopedTo, mirrorFor: (id: string) => at(`${KEY}:${id}`) } } : {}),
  });
  const seen: ExternalSave[] = [];
  const sent = (): number[] =>
    control.find('player.setDataAsync').map((c) => ((c.args[0] as { save: SaveData }).save as unknown as { sessions: number }).sessions);
  return { clock, control, store, storage, seen, sent, listen: () => store.onExternalSave?.((c) => seen.push(c)) };
}

describe('createFbStorage: a session that could not read the cloud (PLAT-1)', () => {
  it('flags its mirror; the next load that reads the cloud reports it unmerged until a merged save clears it', async () => {
    const storage = new MemoryStorage();
    const s1 = wired({ data: { save: doc(5) }, getDataDelayMs: 60_000 }, { storage });
    const r1 = track(s1.store.load());
    await s1.clock.advanceAsync(cfg.save.cloudLoadTimeoutMs);
    await drain();
    expect(r1.value).toEqual({ local: null, cloud: null, corrupt: false });
    await s1.store.save(doc(6), { cloud: 'debounced' }); // fresher updatedAt than the cloud's, but never merged with it
    expect(storage.getItem(FLAG)).toBe('1');

    const s2 = wired({ data: { save: doc(5) } }, { storage });
    expect(await s2.store.load()).toEqual({ local: doc(6), cloud: doc(5), corrupt: false, localUnmerged: true });
    expect(storage.getItem(FLAG)).toBe('1'); // still set: nothing merged has been written yet
    await s2.store.save(doc(7), { cloud: 'debounced' });
    expect(storage.getItem(FLAG)).toBeNull();

    const s3 = wired({ data: { save: doc(7) } }, { storage });
    expect(await s3.store.load()).toEqual({ local: doc(7), cloud: doc(7), corrupt: false });
  });

  it('hands the late cloud copy to the app and starts cloud writes only after it was merged (05 §7)', async () => {
    const s = wired({ data: { save: doc(5) }, getDataDelayMs: 6_000 });
    const writesWhenDelivered: number[] = [];
    s.store.onExternalSave?.((copy) => {
      s.seen.push(copy);
      writesWhenDelivered.push(s.control.count('player.setDataAsync'));
    });
    const r = track(s.store.load());
    await s.clock.advanceAsync(cfg.save.cloudLoadTimeoutMs);
    await drain();
    expect(r.value?.cloud).toBeNull();
    await s.store.save(doc(6), { cloud: 'now' });
    expect(s.sent()).toEqual([]);
    await s.clock.advanceAsync(6_000 - cfg.save.cloudLoadTimeoutMs);
    await drain();
    expect(s.seen).toEqual([{ source: 'cloud', value: doc(5) }]);
    expect(writesWhenDelivered).toEqual([0]);
    await s.store.save(doc(7), { cloud: 'now' });
    expect(s.sent()).toEqual([7]);
    expect(s.store.status()).toBe('ok');
  });

  it('keeps reading in the background after a failed boot read, on cloudLateRetryDelaysMs, until the copy arrives', async () => {
    const bootTries = cfg.save.cloudRetryDelaysMs.length + 1;
    const lateFails = 2;
    const s = wired({ data: { save: doc(9) }, errors: { getDataAsync: Array<string>(bootTries + lateFails).fill('NETWORK_FAILURE') } });
    s.listen();
    void s.store.load();
    const bootSpan = cfg.save.cloudRetryDelaysMs.reduce((a, b) => a + b, 0);
    const [l0 = 0, l1 = 0, l2 = 0] = cfg.save.cloudLateRetryDelaysMs;
    await s.clock.advanceAsync(bootSpan + l0 + l1 + l2 - 1);
    await drain();
    expect(s.seen).toEqual([]);
    expect(s.control.count('player.getDataAsync')).toBe(bootTries + lateFails);
    await s.clock.advanceAsync(1);
    await drain();
    expect(s.seen).toEqual([{ source: 'cloud', value: doc(9) }]);
    await s.clock.advanceAsync(30 * 60_000);
    await drain();
    expect(s.control.count('player.getDataAsync')).toBe(bootTries + lateFails + 1); // stops once merged
    await s.store.save(doc(10), { cloud: 'now' });
    expect(s.sent()).toEqual([10]);
  });

  it('a copy that arrives before anyone subscribed waits for the first subscriber; cloud writes stay off until then', async () => {
    const s = wired({ data: { save: doc(3) }, getDataDelayMs: 5_000 });
    void s.store.load();
    await s.clock.advanceAsync(10_000);
    await drain();
    await s.store.save(doc(4), { cloud: 'now' });
    expect(s.sent()).toEqual([]);
    s.listen();
    expect(s.seen).toEqual([{ source: 'cloud', value: doc(3) }]);
    await s.store.save(doc(5), { cloud: 'now' });
    expect(s.sent()).toEqual([5]);
  });

  it('keeps cloud writes off when the app failed to merge the late copy', async () => {
    const s = wired({ data: { save: doc(3) }, getDataDelayMs: 5_000 });
    s.store.onExternalSave?.(() => {
      throw new Error('merge failed');
    });
    void s.store.load();
    await s.clock.advanceAsync(10_000);
    await drain();
    await s.store.save(doc(4), { cloud: 'now' });
    expect(s.sent()).toEqual([]);
  });

  it('does not retry a read the SDK refused for good (INVALID_PARAM)', async () => {
    const s = wired({ errors: { getDataAsync: ['INVALID_PARAM'] } });
    s.listen();
    await s.store.load();
    await s.clock.advanceAsync(30 * 60_000);
    await drain();
    expect(s.control.count('player.getDataAsync')).toBe(1);
    expect(s.seen).toEqual([]);
  });
});

describe('createFbStorage: per-player mirror (PLAT-2)', () => {
  it("reads and writes only the player's own mirror", async () => {
    const storage = new MemoryStorage();
    storage.setItem(`${KEY}:A`, JSON.stringify(doc(40)));
    const b = wired({ data: null }, { storage, scopedTo: () => 'B' });
    expect(await b.store.load()).toEqual({ local: null, cloud: null, corrupt: false });
    await b.store.save(doc(1), { cloud: 'now' });
    expect(storage.getItem(`${KEY}:B`)).toBe(JSON.stringify(doc(1)));
    expect(storage.getItem(`${KEY}:A`)).toBe(JSON.stringify(doc(40)));
    expect(b.sent()).toEqual([1]);
  });

  it('without a player ID the unscoped mirror is a cache only: never merged with a cloud copy', async () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, JSON.stringify(doc(40)));
    const ok = wired({ data: { save: doc(2) } }, { storage, scopedTo: () => null });
    expect(await ok.store.load()).toEqual({ local: null, cloud: doc(2), corrupt: false });

    // Cloud unreadable: the cache is used for the session, but a late cloud copy is never merged
    // into it (it may be another account's progress), so the session never writes to the cloud.
    const off = wired({ data: { save: doc(2) }, getDataDelayMs: 6_000 }, { storage, scopedTo: () => null });
    off.listen();
    const r = track(off.store.load());
    await off.clock.advanceAsync(60_000);
    await drain();
    expect(r.value?.local).toEqual(doc(40));
    expect(off.seen).toEqual([]);
    await off.store.save(doc(41), { cloud: 'now' });
    expect(off.sent()).toEqual([]);
  });

  it('without a player ID and without a cache, the late cloud copy is merged as usual', async () => {
    const s = wired({ data: { save: doc(2) }, getDataDelayMs: 6_000 }, { storage: new MemoryStorage(), scopedTo: () => null });
    s.listen();
    void s.store.load();
    await s.clock.advanceAsync(6_000);
    await drain();
    expect(s.seen).toEqual([{ source: 'cloud', value: doc(2) }]);
  });
});

describe('createFbStorage: storage status with cloud save (PLAT-3)', () => {
  it("a blocked localStorage is not reported while the cloud keeps every write", async () => {
    const s = wired({ data: { save: doc(9) } }, { storage: null });
    const warned: number[] = [];
    expect((await s.store.load()).cloud).toEqual(doc(9));
    s.store.onMemoryFallback?.(() => warned.push(1)); // boot registers after load()
    expect(s.store.status()).toBe('ok');
    await s.store.save(doc(10), { cloud: 'now' });
    expect(s.sent()).toEqual([10]);
    expect(warned).toEqual([]);
  });

  it('is reported when neither the mirror nor the cloud keeps the save', async () => {
    const s = wired({ errors: { getDataAsync: ['INVALID_PARAM'] } }, { storage: null });
    const warned: number[] = [];
    const early: number[] = [];
    const loading = s.store.load();
    s.store.onMemoryFallback?.(() => early.push(1)); // registered while load() runs: waits for its answer
    expect(early).toEqual([]);
    await loading;
    expect(early).toEqual([1]);
    s.store.onMemoryFallback?.(() => warned.push(1));
    expect(s.store.status()).toBe('memory');
    expect(warned).toEqual([1]);
  });

  it('a mirror that fails mid-session is reported only when the cloud is off', async () => {
    const storage = new MemoryStorage();
    const s = wired({ data: { save: doc(1) } }, { storage });
    const warned: number[] = [];
    await s.store.load();
    s.store.onMemoryFallback?.(() => warned.push(1));
    storage.failWrites = true;
    await s.store.save(doc(2), { cloud: 'now' });
    expect(s.store.status()).toBe('ok');
    expect(warned).toEqual([]);
  });
});
