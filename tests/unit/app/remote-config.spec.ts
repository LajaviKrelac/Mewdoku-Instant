// Owner: G1 (Phase 2e). The remote switches (docs/phase2e/spec.md §7.4, §1.15, D-2e-19): a fresh cache is used
// without a request, else GET /v1/config, on failure the cache (even stale), else the build values; only
// the booleans of REMOTE_SWITCHES; iapIos both ways, every other switch off only (a remote true never turns
// on what the build ships off); remote.enabled false = the build values; onChange when the switches in
// force change; analytics remote_config {result}.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg, mergeConfig, type GameConfig } from '../../../src/app/config';
import type { AnalyticsEvent } from '../../../src/app/events';
import type { LadderResult } from '../../../src/app/ladder-client';
import { applySwitches, cleanSwitches, createRemoteConfig, RC_KEY } from '../../../src/app/remote-config';
import type { ConfigResponse } from '../../../src/shared/rank-api';
import { NOW } from './harness';

function store(initial?: string) {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set(RC_KEY, initial);
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

function setup(o: { answer?: LadderResult<ConfigResponse>; cache?: string; config?: GameConfig; throws?: boolean } = {}) {
  const clock = createFakeClock(NOW);
  const s = store(o.cache);
  const logs: AnalyticsEvent[] = [];
  let fetches = 0;
  let changes = 0;
  const rc = createRemoteConfig({
    fetchConfig: async () => {
      fetches++;
      if (o.throws) throw new Error('boom');
      return o.answer ?? { ok: true, value: { switches: { iapIos: true, banner: false }, ttlSec: 600, serverTime: NOW } };
    },
    storage: s,
    clock,
    ...(o.config ? { config: o.config } : {}),
    log: (e) => void logs.push(e),
    onChange: () => void changes++,
  });
  return { clock, s, rc, logs, fetches: () => fetches, changes: () => changes };
}

const results = (logs: AnalyticsEvent[]) => logs.map((e) => (e.params as { result: string }).result);

describe('fetch and cache (spec §7.4)', () => {
  it('fetches once, caches with its ttl, applies the switches and tells onChange', async () => {
    const s = setup();
    await s.rc.start();
    await s.rc.start(); // one start per page load
    expect(s.fetches()).toBe(1);
    expect(s.rc.switches()).toEqual({ iapIos: true, banner: false });
    expect(s.rc.iapIosOn()).toBe(true);
    expect(s.rc.bannerOn()).toBe(false);
    expect(s.changes()).toBe(1);
    expect(JSON.parse(s.s.map.get(RC_KEY) ?? '{}')).toMatchObject({ switches: { iapIos: true, banner: false }, at: NOW, ttlSec: 600 });
    expect(results(s.logs)).toEqual(['ok']);
  });

  it('a fresh cache is used without a request; a stale one is refreshed', async () => {
    const fresh = setup({ cache: JSON.stringify({ switches: { ladder: false }, at: NOW - 1000, ttlSec: 600 }) });
    await fresh.rc.start();
    expect(fresh.fetches()).toBe(0);
    expect(fresh.rc.ladderOn()).toBe(false);
    expect(results(fresh.logs)).toEqual(['cached']);
    const stale = setup({ cache: JSON.stringify({ switches: { ladder: false }, at: NOW - 601_000, ttlSec: 600 }) });
    await stale.rc.start();
    expect(stale.fetches()).toBe(1);
    expect(stale.rc.ladderOn()).toBe(true);
  });

  it('a failure falls back to the cache (even stale), else the build values', async () => {
    const cached = setup({ answer: { ok: false, code: 'network' }, cache: JSON.stringify({ switches: { iapInPlay: false }, at: NOW - 9_999_999, ttlSec: 60 }) });
    await cached.rc.start();
    expect(cached.rc.iapInPlayOn()).toBe(false);
    expect(results(cached.logs)).toEqual(['cached']);
    const none = setup({ throws: true });
    await none.rc.start();
    expect(none.rc.switches()).toEqual({});
    expect(none.rc.iapIosOn()).toBe(cfg.iap.iosEnabled);
    expect(results(none.logs)).toEqual(['default']);
    expect(none.changes()).toBe(0);
  });

  it('a broken cache entry, or storage that throws, is ignored', async () => {
    const s = setup({ cache: '{not json' });
    await s.rc.start();
    expect(s.fetches()).toBe(1);
    const clock = createFakeClock(NOW);
    const rc = createRemoteConfig({
      fetchConfig: async () => ({ ok: true, value: { switches: { banner: false }, ttlSec: 60, serverTime: NOW } }),
      storage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
      clock,
    });
    await rc.start();
    expect(rc.bannerOn()).toBe(false);
  });

  it('remote.enabled false: no request, the build values', async () => {
    const s = setup({ config: mergeConfig({ remote: { enabled: false } }) });
    await s.rc.start();
    expect(s.fetches()).toBe(0);
    expect(results(s.logs)).toEqual(['default']);
  });
});

describe('directions (spec §7.4)', () => {
  it('iapIos both ways; the rest off only (a remote true never turns on what the build ships off)', () => {
    const off = mergeConfig({ iap: { iosEnabled: false, inPlay: false }, ads: { banner: { enabled: false, duringPlay: false } }, ladder: { enabled: false } });
    const allOn = { iapIos: true, iapInPlay: true, banner: true, bannerInPlay: true, ladder: true };
    expect(applySwitches(allOn, off)).toEqual({ iapIos: true, iapInPlay: false, banner: false, bannerInPlay: false, ladder: false });
    const on = mergeConfig({ iap: { iosEnabled: true, inPlay: true }, ads: { banner: { enabled: true, duringPlay: true } }, ladder: { enabled: true } });
    const allOff = { iapIos: false, iapInPlay: false, banner: false, bannerInPlay: false, ladder: false };
    expect(applySwitches(allOff, on)).toEqual(allOff);
    expect(applySwitches({}, on)).toEqual({ iapIos: true, iapInPlay: true, banner: true, bannerInPlay: true, ladder: true });
  });

  it('only the booleans of REMOTE_SWITCHES survive (no remote tuning)', () => {
    expect(cleanSwitches({ iapIos: 'yes', banner: false, minReloadSec: 1, ladder: true, extra: true })).toEqual({ banner: false, ladder: true });
    expect(cleanSwitches(null)).toEqual({});
  });
});
