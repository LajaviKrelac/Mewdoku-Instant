// Owner: platform
// fb-storage (05 §7, 04 §7.1): cloud + mirror on load, mirror written at once, debounced
// setDataAsync, flush only for 'flush', retry/backoff, coalescing, no cloud writes after a failed read.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg } from '../../../src/app/config';
import type { SaveDataV1 } from '../../../src/game/types';
import { createFbStorage } from '../../../src/platform/fb/fb-storage';
import { createLocalStore } from '../../../src/platform/web/local-storage';
import { createStub, drain, MemoryStorage, track, type StubConfig } from './helpers';

const KEY = cfg.save.storageKey;

/** Only the fields the adapter cares about (it never inspects the document). */
function doc(n: number): SaveDataV1 {
  return { v: 1, updatedAt: n, sessions: n } as unknown as SaveDataV1;
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
    control.find('player.setDataAsync').map((c) => ((c.args[0] as { save: SaveDataV1 }).save as unknown as { sessions: number }).sessions);
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
