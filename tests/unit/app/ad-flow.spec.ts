// Owner: app. Ad flow (02 §13.2–13.3, 05 §6.2): lock + mute + pause from request to settle, the
// watchdog safety net (never a timeout on a shown ad), ad_* analytics, preload afterwards.
import { describe, expect, it } from 'vitest';
import { createAdFlow } from '../../../src/app/ad-flow';
import { createFakeClock } from '../../../src/app/clock';
import { cfg, mergeConfig } from '../../../src/app/config';
import { createEventBus, type AppEventMap } from '../../../src/app/events';
import type { AdResult } from '../../../src/platform/types';
import { createFakePlatform, last } from './harness';

function setup(caps: { interstitial?: boolean; rewarded?: boolean } = {}, config = cfg) {
  const log: string[] = [];
  const clock = createFakeClock();
  const bus = createEventBus<AppEventMap>();
  const platform = createFakePlatform(log, caps);
  bus.on('pause', ({ reason }) => void log.push(`pause:${reason}`));
  bus.on('resume', ({ reason }) => void log.push(`resume:${reason}`));
  bus.on('analytics', (e) => void log.push(`analytics:${e.name}:${JSON.stringify(e.params)}`));
  const flow = createAdFlow({
    platform,
    clock,
    bus,
    config,
    setInputLocked: (on) => void log.push(`lock:${on}`),
    setMuted: (on) => void log.push(`mute:${on}`),
  });
  return { log, clock, platform, flow };
}

describe('ad flow', () => {
  it('interstitial: lock, mute and pause until the ad settles; analytics; preload after', async () => {
    const s = setup();
    const r = await s.flow.interstitial('next_level');
    expect(r).toEqual({ ok: true });
    expect(s.log).toEqual([
      'lock:true',
      'mute:true',
      'pause:ad',
      'ad:interstitial:next_level',
      'lock:false',
      'mute:false',
      'resume:ad',
      'analytics:ad_interstitial:{"trigger":"next_level","result":"ok"}',
      'preload:interstitial',
    ]);
    expect(s.flow.showing()).toBe(false);
  });

  it('rewarded: reports the failure reason and preloads a fresh instance', async () => {
    const s = setup();
    s.platform.rewardedResults.push({ ok: false, reason: 'no_fill' });
    const r = await s.flow.rewarded('hint');
    expect(r).toEqual({ ok: false, reason: 'no_fill' });
    expect(s.log).toContain('analytics:ad_rewarded:{"placement":"hint","result":"no_fill"}');
    expect(last(s.log)).toBe('preload:rewarded');
  });

  it('a long rewarded ad is never cut short (only the watchdog would end the wait)', async () => {
    const s = setup();
    s.platform.rewardedResults.push(
      () => new Promise<AdResult>((resolve) => s.clock.setTimeout(() => resolve({ ok: true }), 30_000)),
    );
    const p = s.flow.rewarded('revive');
    await s.clock.advanceAsync(29_999);
    expect(s.flow.showing()).toBe(true);
    await s.clock.advanceAsync(1);
    expect(await p).toEqual({ ok: true });
  });

  it('watchdog: a promise that never settles unlocks input after ads.showWatchdogMs', async () => {
    const s = setup();
    s.platform.interstitialResults.push(() => new Promise<AdResult>(() => undefined));
    const p = s.flow.interstitial('retry');
    await s.clock.advanceAsync(cfg.ads.showWatchdogMs - 1);
    expect(s.flow.showing()).toBe(true);
    await s.clock.advanceAsync(1);
    expect(await p).toEqual({ ok: false, reason: 'watchdog' });
    expect(s.flow.showing()).toBe(false);
    expect(s.log).toContain('lock:false');
    expect(s.log).toContain('analytics:ad_interstitial:{"trigger":"retry","result":"watchdog"}');
  });

  it('an adapter that throws counts as "error", never a rejection', async () => {
    const s = setup();
    s.platform.rewardedResults.push(() => Promise.reject(new Error('boom')));
    expect(await s.flow.rewarded('kitty')).toEqual({ ok: false, reason: 'error' });
    expect(s.log).toContain('lock:false');
  });

  it('unsupported (capability off or ads disabled): no lock, no show', async () => {
    const s = setup({ rewarded: false });
    expect(await s.flow.rewarded('hint')).toEqual({ ok: false, reason: 'unsupported' });
    expect(s.log.filter((x) => x.startsWith('lock') || x.startsWith('ad:'))).toEqual([]);
    const off = setup({}, mergeConfig({ ads: { enabled: false } }));
    expect(await off.flow.interstitial('next_level')).toEqual({ ok: false, reason: 'unsupported' });
    expect(off.log.some((x) => x.startsWith('ad:'))).toBe(false);
  });
});
