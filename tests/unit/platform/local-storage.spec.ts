// Owner: D (Phase 2b; was platform)
// web/local-storage (04 §6.2, §7.2): JSON round trip, memory fallback with a one-time warning hook,
// corrupt-copy backup keeping the last cfg.save.corruptKeep.
import { describe, expect, it } from 'vitest';
import { cfg } from '../../../src/app/config';
import { createLocalFlag, createLocalStore, safeLocalStorage } from '../../../src/platform/web/local-storage';
import { MemoryStorage } from './helpers';

const KEY = cfg.save.storageKey;

describe('safeLocalStorage', () => {
  it('returns null where there is no window (Node) instead of throwing', () => {
    expect(safeLocalStorage()).toBeNull();
  });
});

describe('createLocalStore', () => {
  it('round-trips JSON and reports ok', () => {
    const storage = new MemoryStorage();
    const s = createLocalStore(KEY, { storage });
    expect(s.read()).toEqual({ value: null, corrupt: false });
    expect(s.write({ a: 1, b: [2] })).toBe(true);
    expect(storage.getItem(KEY)).toBe('{"a":1,"b":[2]}');
    expect(s.read()).toEqual({ value: { a: 1, b: [2] }, corrupt: false });
    expect(s.status()).toBe('ok');
  });

  it('works in memory when storage is unavailable, and warns once at once', () => {
    const s = createLocalStore(KEY, { storage: null });
    const warned: string[] = [];
    s.onMemory?.(() => warned.push('a'));
    expect(warned).toEqual(['a']);
    expect(s.status()).toBe('memory');
    expect(s.write({ level: 3 })).toBe(false);
    expect(s.read()).toEqual({ value: { level: 3 }, corrupt: false });
  });

  it('falls back to memory on a quota error, keeping the data, and fires the hook once', () => {
    const storage = new MemoryStorage();
    const s = createLocalStore(KEY, { storage });
    const warned: number[] = [];
    s.onMemory?.(() => warned.push(1));
    s.onMemory?.(() => warned.push(2));
    s.write({ v: 1 });
    expect(warned).toEqual([]);
    storage.failWrites = true;
    expect(s.write({ v: 2 })).toBe(false);
    expect(s.status()).toBe('memory');
    expect(s.read().value).toEqual({ v: 2 });
    s.write({ v: 3 });
    expect(s.read().value).toEqual({ v: 3 });
    expect(warned).toEqual([1, 2]);
    s.onMemory?.(() => warned.push(3)); // registered late: runs at once
    expect(warned).toEqual([1, 2, 3]);
  });

  it('falls back to memory when reading throws (revoked access)', () => {
    const storage = new MemoryStorage();
    storage.failReads = true;
    const s = createLocalStore(KEY, { storage });
    expect(s.read()).toEqual({ value: null, corrupt: false });
    expect(s.status()).toBe('memory');
  });

  it('backs up an unparseable copy, removes it, and keeps only the newest backups', () => {
    const storage = new MemoryStorage();
    let now = 1_000;
    const s = createLocalStore(KEY, { storage, now: () => now });
    for (const garbage of ['{broken', 'nope', '[1,']) {
      storage.setItem(KEY, garbage);
      expect(s.read()).toEqual({ value: null, corrupt: true });
      expect(storage.getItem(KEY)).toBeNull();
      now += 1_000;
    }
    const backups = Array.from(storage.map.keys()).filter((k) => k.startsWith(cfg.save.corruptKeyPrefix));
    expect(backups.sort()).toEqual([`${cfg.save.corruptKeyPrefix}2000`, `${cfg.save.corruptKeyPrefix}3000`]);
    expect(storage.getItem(`${cfg.save.corruptKeyPrefix}3000`)).toBe('[1,');
    expect(s.status()).toBe('ok');
  });

  it('keeps the original when the backup cannot be written', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, '{broken');
    storage.failWrites = true;
    const s = createLocalStore(KEY, { storage });
    expect(s.read()).toEqual({ value: null, corrupt: true });
    expect(storage.getItem(KEY)).toBe('{broken');
  });

  it('returns false for values JSON cannot encode without leaving storage', () => {
    const s = createLocalStore(KEY, { storage: new MemoryStorage() });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(s.write(cyclic)).toBe(false);
    expect(s.status()).toBe('ok');
  });
});

describe('createLocalFlag', () => {
  it('persists on as "1" and off as no key, and survives a new instance', () => {
    const storage = new MemoryStorage();
    const f = createLocalFlag('k#flag', { storage });
    expect(f.get()).toBe(false);
    f.set(true);
    expect(storage.getItem('k#flag')).toBe('1');
    expect(createLocalFlag('k#flag', { storage }).get()).toBe(true);
    f.set(false);
    expect(storage.getItem('k#flag')).toBeNull();
  });

  it('never throws and keeps the flag in memory when storage fails', () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    const f = createLocalFlag('k#flag', { storage });
    expect(() => f.set(true)).not.toThrow();
    expect(f.get()).toBe(true);
    const none = createLocalFlag('k#flag', { storage: null });
    none.set(true);
    expect(none.get()).toBe(true);
    // Never touches the corrupt-save backups.
    expect(Array.from(storage.map.keys()).some((k) => k.startsWith(cfg.save.corruptKeyPrefix))).toBe(false);
  });
});
