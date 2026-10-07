// Owner: game. Hint/kitty ledger and free-fallback cooldown (02 §9, §13.3); interstitial gate (02 §13.2)
// as a truth table driven by the fake clock.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { mergeConfig } from '../../../src/app/config';
import {
  canShowInterstitial,
  cooldownSecFor,
  interstitialGate,
  tenureDays,
  type GateDecision,
  type InterstitialTrigger,
} from '../../../src/game/ad-pacing';
import {
  balance,
  fallbackAvailable,
  fallbackReadyAt,
  grant,
  recordAdShown,
  recordFallbackGrant,
  rewardAmount,
  spend,
} from '../../../src/game/economy';
import { defaults } from '../../../src/game/save';
import type { SaveDataV1 } from '../../../src/game/types';

const T0 = Date.UTC(2026, 9, 6, 9, 0, 0);
const SEC = 1000;
const DAY = 86_400_000;

describe('economy ledger', () => {
  it('starts with 5 hints and 3 kitties; spend and grant return new saves', () => {
    const s = defaults(T0);
    expect(balance(s, 'hints')).toBe(5);
    expect(balance(s, 'kitties')).toBe(3);
    const a = spend(s, 'hints');
    expect(balance(a, 'hints')).toBe(4);
    expect(balance(s, 'hints')).toBe(5); // never mutated
    expect(a.stock.kitties).toBe(3);
    const b = grant(a, 'kitties');
    expect(b.stock).toEqual({ hints: 4, kitties: 4 });
    expect(grant(b, 'hints', 3).stock.hints).toBe(7);
  });

  it('spending below zero or a bad amount throws', () => {
    const empty: SaveDataV1 = { ...defaults(T0), stock: { hints: 0, kitties: 1 } };
    expect(() => spend(empty, 'hints')).toThrow(RangeError);
    expect(() => spend(empty, 'kitties', 2)).toThrow(RangeError);
    expect(() => spend(empty, 'kitties', -1)).toThrow(RangeError);
    expect(() => grant(empty, 'hints', 1.5)).toThrow(RangeError);
    expect(spend(empty, 'kitties').stock.kitties).toBe(0);
  });

  it('reward amounts come from cfg (1 each) and follow a config variant', () => {
    expect(rewardAmount('hints')).toBe(1);
    expect(rewardAmount('kitties')).toBe(1);
    const c = mergeConfig({ hints: { perRewardedAd: 2 } });
    expect(rewardAmount('hints', c)).toBe(2);
    expect(grant(defaults(T0), 'hints', undefined, c).stock.hints).toBe(7);
  });
});

describe('free fallback cooldown (02 §13.3, shared by hint, kitty and revive)', () => {
  it('available on a fresh save; after a grant only once 600 s have passed', () => {
    const clock = createFakeClock(T0);
    let s = defaults(clock.now());
    expect(fallbackAvailable(s, clock.now())).toBe(true);
    s = recordFallbackGrant(s, clock.now());
    expect(s.ads.lastFallbackGrantAt).toBe(T0);
    expect(fallbackReadyAt(s)).toBe(T0 + 600 * SEC);
    clock.advance(599_999);
    expect(fallbackAvailable(s, clock.now())).toBe(false);
    clock.advance(1);
    expect(fallbackAvailable(s, clock.now())).toBe(true);
  });

  it('a grant time in the future (clock moved back) never blocks the player', () => {
    const s = recordFallbackGrant(defaults(T0), T0 + 3_600_000);
    expect(fallbackAvailable(s, T0)).toBe(true);
  });

  it('recordAdShown stamps lastAdAt only', () => {
    const s = recordAdShown(defaults(0), T0);
    expect(s.ads).toEqual({ lastAdAt: T0, lastFallbackGrantAt: 0 });
  });
});

describe('tenure and cooldown (02 §13.2)', () => {
  it.each([
    [0, 120], [1, 120], [2, 100], [6, 100], [7, 90], [400, 90],
  ])('cooldownSecFor(%i days) = %i s', (d, sec) => {
    expect(cooldownSecFor(d)).toBe(sec);
  });

  it('tenureDays = floor((now − firstSeenAt) / 1 day), never negative', () => {
    expect(tenureDays(T0, T0)).toBe(0);
    expect(tenureDays(T0 + 2 * DAY - 1, T0)).toBe(1);
    expect(tenureDays(T0 + 2 * DAY, T0)).toBe(2);
    expect(tenureDays(T0 - DAY, T0)).toBe(0);
  });
});

interface Scenario {
  name: string;
  /** Days since first seen at the moment of the check. */
  tenure: number;
  /** Seconds since platform.start() resolved. */
  sessionSec: number;
  /** Seconds since the last ad (null = never). */
  sinceAdSec: number | null;
  completed: number;
  trigger?: InterstitialTrigger;
  supported?: boolean;
  config?: Parameters<typeof mergeConfig>[0];
  expect: GateDecision;
}

const TABLE: Scenario[] = [
  { name: 'all conditions met', tenure: 0, sessionSec: 60, sinceAdSec: null, completed: 10, expect: 'ok' },
  { name: 'ads disabled', tenure: 0, sessionSec: 600, sinceAdSec: null, completed: 50, config: { ads: { enabled: false } }, expect: 'disabled' },
  { name: 'interstitial unsupported', tenure: 0, sessionSec: 600, sinceAdSec: null, completed: 50, supported: false, expect: 'unsupported' },
  { name: 'trigger not listed', tenure: 0, sessionSec: 600, sinceAdSec: null, completed: 50, trigger: 'retry', config: { ads: { interstitial: { triggers: ['next_level'] } } }, expect: 'trigger' },
  { name: '9 completed levels', tenure: 0, sessionSec: 600, sinceAdSec: null, completed: 9, expect: 'min_levels' },
  { name: '10 completed (tutorial counts)', tenure: 0, sessionSec: 600, sinceAdSec: null, completed: 10, trigger: 'retry', expect: 'ok' },
  { name: 'session grace 59.999 s', tenure: 3, sessionSec: 59.999, sinceAdSec: null, completed: 50, expect: 'grace' },
  { name: 'session grace 60 s', tenure: 3, sessionSec: 60, sinceAdSec: null, completed: 50, trigger: 'daily_done', expect: 'ok' },
  { name: 'day 0: 119 s since the last ad', tenure: 0, sessionSec: 600, sinceAdSec: 119, completed: 50, expect: 'cooldown' },
  { name: 'day 0: 120 s since the last ad', tenure: 0, sessionSec: 600, sinceAdSec: 120, completed: 50, expect: 'ok' },
  { name: 'day 1: 119.999 s', tenure: 1, sessionSec: 600, sinceAdSec: 119.999, completed: 50, expect: 'cooldown' },
  { name: 'day 2: 100 s', tenure: 2, sessionSec: 600, sinceAdSec: 100, completed: 50, expect: 'ok' },
  { name: 'day 2: 99 s', tenure: 2, sessionSec: 600, sinceAdSec: 99, completed: 50, expect: 'cooldown' },
  { name: 'day 6: 100 s', tenure: 6, sessionSec: 600, sinceAdSec: 100, completed: 50, expect: 'ok' },
  { name: 'day 7: 90 s', tenure: 7, sessionSec: 600, sinceAdSec: 90, completed: 50, expect: 'ok' },
  { name: 'day 7: 89 s', tenure: 7, sessionSec: 600, sinceAdSec: 89, completed: 50, expect: 'cooldown' },
  { name: 'order: min levels before grace', tenure: 0, sessionSec: 1, sinceAdSec: 1, completed: 0, expect: 'min_levels' },
  { name: 'order: grace before cooldown', tenure: 0, sessionSec: 1, sinceAdSec: 1, completed: 50, expect: 'grace' },
];

describe('interstitial gate truth table (fake clock)', () => {
  it.each(TABLE)('$name → $expect', (row) => {
    const firstSeen = T0;
    const clock = createFakeClock(firstSeen);
    clock.advance(row.tenure * DAY);
    // The session starts, then time passes until the check; the last ad was shown sinceAdSec before the check.
    const sessionStartedAt = clock.now();
    clock.advance(Math.round(row.sessionSec * 1000));
    const now = clock.now();
    const base = defaults(firstSeen);
    const save: SaveDataV1 = {
      ...base,
      progress: { ...base.progress, completed: row.completed, level: row.completed + 1 },
      ads: { ...base.ads, lastAdAt: row.sinceAdSec === null ? 0 : now - Math.round(row.sinceAdSec * 1000) },
    };
    const c = row.config ? mergeConfig(row.config) : undefined;
    const input = { trigger: row.trigger ?? 'next_level', now, sessionStartedAt, save, interstitialSupported: row.supported ?? true };
    expect(interstitialGate(input, c)).toBe(row.expect);
    expect(canShowInterstitial(input, c)).toBe(row.expect === 'ok');
  });

  it('a completed rewarded ad resets the interstitial clock (resetsInterstitialClock)', () => {
    const clock = createFakeClock(T0);
    const sessionStartedAt = clock.now();
    let save: SaveDataV1 = { ...defaults(T0), progress: { level: 31, completed: 30, best: {} } };
    clock.advance(10 * 60 * SEC);
    const gate = (): GateDecision => interstitialGate({ trigger: 'next_level', now: clock.now(), sessionStartedAt, save, interstitialSupported: true });
    expect(gate()).toBe('ok');
    save = recordAdShown(save, clock.now()); // rewarded hint ad completed
    clock.advance(30 * SEC);
    expect(gate()).toBe('cooldown');
    clock.advance(90 * SEC);
    expect(gate()).toBe('ok');
    save = recordAdShown(save, clock.now()); // interstitial shown
    clock.advance(119 * SEC);
    expect(gate()).toBe('cooldown');
  });

  it('dailies do not count: only progress.completed is read', () => {
    const base = defaults(T0);
    const save: SaveDataV1 = { ...base, progress: { ...base.progress, completed: 5 }, daily: { '2026-10-01': [1, 0, 0, 0], '2026-10-02': [1, 0, 0, 0], '2026-10-03': [1, 0, 0, 0], '2026-10-04': [1, 0, 0, 0], '2026-10-05': [1, 0, 0, 0] } };
    expect(interstitialGate({ trigger: 'daily_done', now: T0 + DAY, sessionStartedAt: T0, save, interstitialSupported: true })).toBe('min_levels');
  });
});
