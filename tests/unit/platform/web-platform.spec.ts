// @vitest-environment jsdom
// Owner: platform
// Web adapter (04 §6.2): capabilities per mock mode, storage via the local store (cloud ignored),
// memory fallback hook, no-op lifecycle and analytics, haptics capability.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg } from '../../../src/app/config';
import type { SaveDataV1 } from '../../../src/game/types';
import { createWebPlatform } from '../../../src/platform/web';
import { MemoryStorage } from './helpers';

const save = (n: number) => ({ v: 1, sessions: n }) as unknown as SaveDataV1;

function make(opts: { mockAds?: boolean; search?: string; storage?: Storage | null; nav?: Navigator } = {}) {
  const clock = createFakeClock();
  return createWebPlatform({ doc: document, timers: clock, storage: new MemoryStorage(), ...opts });
}

describe('createWebPlatform', () => {
  it('production web: no ads (free fallback), no cloud, nothing else', async () => {
    const p = make({ mockAds: false, nav: {} as Navigator });
    expect(p.id).toBe('web');
    expect(p.capabilities()).toEqual({
      interstitial: false,
      rewarded: false,
      banner: false,
      cloudSave: false,
      leaderboards: false,
      share: false,
      payments: false,
      haptics: false,
    });
    expect(p.ads.isReady('rewarded')).toBe(false);
    await expect(p.ads.showRewarded('hint')).resolves.toEqual({ ok: false, reason: 'unsupported' });
    await expect(p.ads.showInterstitial('next_level')).resolves.toEqual({ ok: false, reason: 'unsupported' });
  });

  it.each([
    ['', true],
    ['?ads=ok', true],
    ['?ads=nofill', true],
    ['?ads=close', true],
    ['?ads=unsupported', false],
  ])('mock ads %j → ad capabilities %s', (search, on) => {
    const p = make({ mockAds: true, search });
    expect(p.capabilities().interstitial).toBe(on);
    expect(p.capabilities().rewarded).toBe(on);
  });

  it('mock nofill reaches the adapter result', async () => {
    const p = make({ mockAds: true, search: '?ads=nofill' });
    await expect(p.ads.showInterstitial('retry')).resolves.toEqual({ ok: false, reason: 'no_fill' });
  });

  it('reports haptics when navigator.vibrate exists', () => {
    const nav = { vibrate: () => true, language: 'de-DE' } as unknown as Navigator;
    const p = make({ nav });
    expect(p.capabilities().haptics).toBe(true);
    expect(p.getLocale()).toBe('de_DE');
  });

  it('lifecycle calls resolve and do nothing platform-specific', async () => {
    const p = make();
    await expect(p.init()).resolves.toBeUndefined();
    p.setLoadingProgress(50);
    await expect(p.start()).resolves.toBeUndefined();
    expect(p.getPlayerId()).toBeNull();
    expect(() => p.onPause(() => undefined)).not.toThrow();
    expect(() => p.analytics.log('level_win', { level: 2 })).not.toThrow();
    expect(() => p.haptics.pulse(5)).not.toThrow();
  });

  it('saves to localStorage synchronously whatever the cloud mode, and loads it back', async () => {
    const storage = new MemoryStorage();
    const p = make({ storage });
    expect(await p.storage.load()).toEqual({ local: null, cloud: null, corrupt: false });
    await p.storage.save(save(1), { cloud: 'debounced' });
    expect(storage.getItem(cfg.save.storageKey)).toBe(JSON.stringify(save(1)));
    await p.storage.save(save(2), { cloud: 'flush' });
    expect(await p.storage.load()).toEqual({ local: save(2), cloud: null, corrupt: false });
  });

  it('flags a corrupt local copy', async () => {
    const storage = new MemoryStorage();
    storage.setItem(cfg.save.storageKey, '{nope');
    const p = make({ storage });
    expect(await p.storage.load()).toEqual({ local: null, cloud: null, corrupt: true });
  });

  it('memory fallback: status and the one-time warning hook', async () => {
    const p = make({ storage: null });
    expect(p.storage.status()).toBe('memory');
    let warned = 0;
    p.storage.onMemoryFallback?.(() => warned++);
    expect(warned).toBe(1);
    await p.storage.save(save(7), { cloud: 'now' });
    expect((await p.storage.load()).local).toEqual(save(7));
  });

  it('uses the real localStorage by default when it works (jsdom)', async () => {
    window.localStorage.clear();
    const p = createWebPlatform({ doc: document, mockAds: false });
    await p.storage.save(save(3), { cloud: 'now' });
    expect(window.localStorage.getItem(cfg.save.storageKey)).toBe(JSON.stringify(save(3)));
    expect(window.localStorage.getItem('mewdoku.probe')).toBeNull();
  });
});
