// Owner: C (Phase 2b; was game). Hint/kitty ledger and free-fallback cooldown (02 §9, §13.3); interstitial gate (02 §13.2)
// as a truth table driven by the fake clock.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg, mergeConfig } from '../../../src/app/config';
import {
  bannerEnded,
  bannerGate,
  canShowInterstitial,
  retryCadenceOk,
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
import type { SaveData } from '../../../src/game/types';

const T0 = Date.UTC(2026, 9, 6, 9, 0, 0);
const SEC = 1000;
const DAY = 86_400_000;
/**
 * The 2b tenure table (02 §13.2, phase2b §3.7) that Phase 2e's L1 flip replaced with a 30 s floor (D-2e-7, P-I2).
 * The mechanism stays and the table is one key away (spec §0.6 "Alternative kept by a key"), so the tenure tests run
 * against it explicitly; the shipped default is pinned separately below.
 */
const TENURE_TABLE = { ads: { interstitial: { cooldownSec: [{ fromDay: 0, sec: 120 }, { fromDay: 2, sec: 100 }, { fromDay: 7, sec: 90 }] } } } as const;
const TENURE = mergeConfig(TENURE_TABLE);

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
    const empty: SaveData = { ...defaults(T0), stock: { hints: 0, kitties: 1 } };
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
  ])('the 2b tenure table: cooldownSecFor(%i days) = %i s', (d, sec) => {
    expect(cooldownSecFor(d, TENURE)).toBe(sec);
  });

  it.each([0, 1, 2, 6, 7, 400])('Phase 2e default (L1, P-I2): cooldownSecFor(%i days) = the 30 s floor', (d) => {
    expect(cooldownSecFor(d)).toBe(30);
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
  // The 2b tenure table (one key away since Phase 2e).
  { name: 'tenure table, day 0: 119 s since the last ad', tenure: 0, sessionSec: 600, sinceAdSec: 119, completed: 50, config: TENURE_TABLE, expect: 'cooldown' },
  { name: 'tenure table, day 0: 120 s since the last ad', tenure: 0, sessionSec: 600, sinceAdSec: 120, completed: 50, config: TENURE_TABLE, expect: 'ok' },
  { name: 'tenure table, day 1: 119.999 s', tenure: 1, sessionSec: 600, sinceAdSec: 119.999, completed: 50, config: TENURE_TABLE, expect: 'cooldown' },
  { name: 'tenure table, day 2: 100 s', tenure: 2, sessionSec: 600, sinceAdSec: 100, completed: 50, config: TENURE_TABLE, expect: 'ok' },
  { name: 'tenure table, day 2: 99 s', tenure: 2, sessionSec: 600, sinceAdSec: 99, completed: 50, config: TENURE_TABLE, expect: 'cooldown' },
  { name: 'tenure table, day 6: 100 s', tenure: 6, sessionSec: 600, sinceAdSec: 100, completed: 50, config: TENURE_TABLE, expect: 'ok' },
  { name: 'tenure table, day 7: 90 s', tenure: 7, sessionSec: 600, sinceAdSec: 90, completed: 50, config: TENURE_TABLE, expect: 'ok' },
  { name: 'tenure table, day 7: 89 s', tenure: 7, sessionSec: 600, sinceAdSec: 89, completed: 50, config: TENURE_TABLE, expect: 'cooldown' },
  // Phase 2e default (L1, D-2e-7): every level, a 30 s floor between full-screen ads whatever the tenure.
  { name: 'day 0: 29.999 s since the last ad', tenure: 0, sessionSec: 600, sinceAdSec: 29.999, completed: 50, expect: 'cooldown' },
  { name: 'day 0: 30 s since the last ad', tenure: 0, sessionSec: 600, sinceAdSec: 30, completed: 50, expect: 'ok' },
  { name: 'day 7: 29 s', tenure: 7, sessionSec: 600, sinceAdSec: 29, completed: 50, expect: 'cooldown' },
  { name: 'day 7: 31 s', tenure: 7, sessionSec: 600, sinceAdSec: 31, completed: 50, expect: 'ok' },
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
    const save: SaveData = {
      ...base,
      progress: { ...base.progress, completed: row.completed, level: row.completed + 1 },
      ads: { ...base.ads, lastAdAt: row.sinceAdSec === null ? 0 : now - Math.round(row.sinceAdSec * 1000) },
    };
    const c = row.config ? mergeConfig(row.config) : undefined;
    const input = { trigger: row.trigger ?? 'next_level', now, sessionStartedAt, save, interstitialSupported: row.supported ?? true, retryIndex: null };
    expect(interstitialGate(input, c)).toBe(row.expect);
    expect(canShowInterstitial(input, c)).toBe(row.expect === 'ok');
  });

  it('a completed rewarded ad resets the interstitial clock (resetsInterstitialClock)', () => {
    const clock = createFakeClock(T0);
    const sessionStartedAt = clock.now();
    let save: SaveData = { ...defaults(T0), progress: { level: 31, completed: 30, best: {} } };
    clock.advance(10 * 60 * SEC);
    const gate = (): GateDecision => interstitialGate({ trigger: 'next_level', now: clock.now(), sessionStartedAt, save, interstitialSupported: true, retryIndex: null });
    expect(gate()).toBe('ok');
    save = recordAdShown(save, clock.now()); // rewarded hint ad completed
    clock.advance(29 * SEC);
    expect(gate()).toBe('cooldown'); // Phase 2e: the 30 s floor (P-I2)
    clock.advance(1 * SEC);
    expect(gate()).toBe('ok');
    save = recordAdShown(save, clock.now()); // interstitial shown
    clock.advance(29 * SEC);
    expect(gate()).toBe('cooldown');
    // The same reset under the 2b tenure table (day 0: 120 s).
    const gateT = (): GateDecision => interstitialGate({ trigger: 'next_level', now: clock.now(), sessionStartedAt, save, interstitialSupported: true, retryIndex: null }, TENURE);
    save = recordAdShown(save, clock.now());
    clock.advance(119 * SEC);
    expect(gateT()).toBe('cooldown');
    clock.advance(1 * SEC);
    expect(gateT()).toBe('ok');
  });

  it('dailies do not count: only progress.completed is read', () => {
    const base = defaults(T0);
    const save: SaveData = { ...base, progress: { ...base.progress, completed: 5 }, daily: { '2026-10-01': [1, 0, 0, 0], '2026-10-02': [1, 0, 0, 0], '2026-10-03': [1, 0, 0, 0], '2026-10-04': [1, 0, 0, 0], '2026-10-05': [1, 0, 0, 0] } };
    expect(interstitialGate({ trigger: 'daily_done', now: T0 + DAY, sessionStartedAt: T0, save, interstitialSupported: true, retryIndex: null })).toBe('min_levels');
  });
});

describe('phase2b §3: cadence parity and the banner gate', () => {
  it('Phase 2e (D-2e-7, P-I2): every level with a 30 s floor; the 2b tenure table (§3.7: 120 / 100 / 90 s) is one key away', () => {
    expect(cfg.ads.interstitial.cooldownSec).toEqual([{ fromDay: 0, sec: 30 }]);
    for (const d of [0, 1, 2, 6, 7, 400]) expect(cooldownSecFor(d)).toBe(30);
    expect(cooldownSecFor(0, TENURE)).toBe(120);
    expect(cooldownSecFor(1, TENURE)).toBe(120);
    expect(cooldownSecFor(2, TENURE)).toBe(100);
    expect(cooldownSecFor(6, TENURE)).toBe(100);
    expect(cooldownSecFor(7, TENURE)).toBe(90);
    expect(cooldownSecFor(400, TENURE)).toBe(90);
  });

  it('event_next is an interstitial trigger like next_level', () => {
    const save = { ...defaults(T0 - 10 * DAY), progress: { level: 30, completed: 29, best: {} } };
    const input = { now: T0, sessionStartedAt: T0 - 600 * SEC, save, interstitialSupported: true, retryIndex: null };
    expect(interstitialGate({ ...input, trigger: 'event_next' })).toBe('ok');
    expect(interstitialGate({ ...input, trigger: 'event_next' }, mergeConfig({ ads: { interstitial: { triggers: ['next_level'] } } }))).toBe('trigger');
  });

  it('owning No Ads turns interstitials off (§8.3)', () => {
    const save = { ...defaults(T0 - 10 * DAY), progress: { level: 30, completed: 29, best: {} }, purchases: { noAds: true, tokens: [] } };
    const input = { trigger: 'next_level' as const, now: T0, sessionStartedAt: T0 - 600 * SEC, save, interstitialSupported: true, retryIndex: null };
    expect(interstitialGate(input)).toBe('no_ads');
    expect(canShowInterstitial({ ...input, save: { ...save, purchases: { ...save.purchases, noAds: false } } })).toBe(true);
  });

  type BannerRow = {
    screen: Parameters<typeof bannerGate>[0]['screen'];
    completed: number;
    noAds: boolean;
    supported: boolean;
    tutorial: boolean;
    want: ReturnType<typeof bannerGate>;
  };
  const ok = { completed: 10, noAds: false, supported: true, tutorial: false } as const;
  const BANNER_ROWS: BannerRow[] = [
    { screen: 'home', ...ok, want: 'ok' },
    { screen: 'victory', ...ok, want: 'ok' },
    { screen: 'event', ...ok, want: 'ok' },
    // Phase 2d §1.16: the game screen qualifies while ads.banner.duringPlay (on by default), then the same checks.
    { screen: 'game', ...ok, want: 'ok' },
    // Phase 2e L1 (P-B1): fromCompletedLevels 9, so the first banner is on level 10's board.
    { screen: 'game', ...ok, completed: 9, want: 'ok' },
    { screen: 'game', ...ok, completed: 8, want: 'min_levels' },
    { screen: 'game', ...ok, noAds: true, want: 'no_ads' },
    { screen: 'game', ...ok, tutorial: true, want: 'tutorial' },
    { screen: 'ranking', ...ok, want: 'screen' },
    { screen: 'boot', ...ok, want: 'screen' },
    { screen: 'overlay', ...ok, want: 'screen' },
    { screen: 'home', ...ok, completed: 8, want: 'min_levels' },
    { screen: 'home', ...ok, noAds: true, want: 'no_ads' },
    { screen: 'home', ...ok, supported: false, want: 'unsupported' },
    { screen: 'victory', ...ok, tutorial: true, want: 'tutorial' },
    { screen: 'game', ...ok, supported: false, completed: 0, want: 'unsupported' },
  ];
  it.each(BANNER_ROWS)('bannerGate $screen completed=$completed noAds=$noAds supported=$supported tutorial=$tutorial → $want', (row) => {
    const save = {
      progress: { level: row.completed + 1, completed: row.completed, best: {} },
      purchases: { noAds: row.noAds, tokens: [] },
    };
    expect(bannerGate({ screen: row.screen, save, bannerSupported: row.supported, firstRunTutorial: row.tutorial, today: null })).toBe(row.want);
  });

  it('bannerGate: disabled in config, and a config variant for the screens and the start level', () => {
    const save = { progress: { level: 31, completed: 30, best: {} }, purchases: { noAds: false, tokens: [] } };
    const base = { screen: 'home' as const, save, bannerSupported: true, firstRunTutorial: false, today: null };
    expect(bannerGate(base, mergeConfig({ ads: { banner: { enabled: false } } }))).toBe('disabled');
    expect(bannerGate(base, mergeConfig({ ads: { enabled: false } }))).toBe('disabled');
    expect(bannerGate(base, mergeConfig({ ads: { banner: { screens: ['victory'] } } }))).toBe('screen');
    expect(bannerGate(base, mergeConfig({ ads: { banner: { fromCompletedLevels: 31 } } }))).toBe('min_levels');
  });

  it("phase 2d §1.16: 'game' qualifies exactly when ads.banner.duringPlay is on (off restores the 2b rule)", () => {
    const save = { progress: { level: 31, completed: 30, best: {} }, purchases: { noAds: false, tokens: [] } };
    const game = { screen: 'game' as const, save, bannerSupported: true, firstRunTutorial: false, today: null };
    expect(cfg.ads.banner.duringPlay).toBe(true);
    expect(cfg.ads.banner.screens).not.toContain('game'); // not through the screens list
    expect(bannerGate(game)).toBe('ok');
    const off = mergeConfig({ ads: { banner: { duringPlay: false } } });
    expect(bannerGate(game, off)).toBe('screen');
    // The other screens are unchanged by duringPlay.
    for (const screen of ['home', 'victory', 'event'] as const) expect(bannerGate({ ...game, screen }, off)).toBe('ok');
    // Listing 'game' in screens does not let it in without duringPlay.
    expect(bannerGate(game, mergeConfig({ ads: { banner: { duringPlay: false, screens: ['home', 'game'] } } }))).toBe('screen');
    // The same checks after the screen: capability, levels, No Ads, the tutorial, disabled.
    expect(bannerGate({ ...game, bannerSupported: false })).toBe('unsupported');
    expect(bannerGate(game, mergeConfig({ ads: { banner: { enabled: false } } }))).toBe('disabled');
  });
});

// ─────────────────────────────── Phase 2e (G1, spec §3.1, §3.2) ───────────────────────────────

describe('Phase 2e: the interstitial cadence (spec §3.2)', () => {
  /** The L1 target (spec §7.2.2): a 30 s floor at every tenure. */
  const target = mergeConfig({ ads: { interstitial: { cooldownSec: [{ fromDay: 0, sec: 30 }] } } });
  const veteranAt = (now: number, lastAdAt: number): SaveData => ({
    ...defaults(T0),
    progress: { level: 15, completed: 14, best: {} },
    ads: { lastAdAt, lastFallbackGrantAt: 0 },
  });
  const input = (trigger: InterstitialTrigger, now: number, lastAdAt: number, extra: { retryIndex?: number } = {}) => ({
    trigger,
    now,
    sessionStartedAt: T0,
    save: veteranAt(now, lastAdAt),
    interstitialSupported: true,
    retryIndex: extra.retryIndex ?? null,
  });

  it('the 30 s floor at every tenure (day 0, 2, 7, 40): 29 s gated, 30 s shown', () => {
    for (const day of [0, 2, 7, 40]) {
      const now = T0 + day * DAY + 3600 * SEC;
      expect(cooldownSecFor(day, target)).toBe(30);
      expect(interstitialGate(input('next_level', now, now - 29 * SEC), target)).toBe('cooldown');
      expect(interstitialGate(input('next_level', now, now - 30 * SEC), target)).toBe('ok');
    }
  });

  it("retryEveryN 2: Retry 1 'retry_cadence', 2 ok, 3 gated, 4 ok; absent retryIndex = no cadence (2b)", () => {
    const now = T0 + 3600 * SEC;
    const at = (i?: number): GateDecision => interstitialGate(input('retry', now, 0, i === undefined ? {} : { retryIndex: i }), target);
    expect([at(1), at(2), at(3), at(4)]).toEqual(['retry_cadence', 'ok', 'retry_cadence', 'ok']);
    expect(at()).toBe('ok');
    expect(retryCadenceOk(1)).toBe(false);
    expect(retryCadenceOk(2)).toBe(true);
    expect(retryCadenceOk(1, mergeConfig({ ads: { interstitial: { retryEveryN: 1 } } }))).toBe(true);
    expect(retryCadenceOk(2, mergeConfig({ ads: { interstitial: { retryEveryN: 3 } } }))).toBe(false);
    expect(retryCadenceOk(3, mergeConfig({ ads: { interstitial: { retryEveryN: 3 } } }))).toBe(true);
    // The cadence only applies to Retry; min_levels and No Ads come first.
    expect(interstitialGate(input('next_level', now, 0, { retryIndex: 1 }), target)).toBe('ok');
    const early = { ...input('retry', now, 0, { retryIndex: 1 }), save: { ...veteranAt(now, 0), progress: { level: 5, completed: 4, best: {} } } };
    expect(interstitialGate(early, target)).toBe('min_levels');
  });

  it("'fail_home' is a listed trigger with the same gate (No Ads, min levels, grace, floor)", () => {
    const now = T0 + 3600 * SEC;
    expect(cfg.ads.interstitial.triggers).toContain('fail_home');
    expect(interstitialGate(input('fail_home', now, 0), target)).toBe('ok');
    expect(interstitialGate({ ...input('fail_home', now, 0), save: { ...veteranAt(now, 0), purchases: { noAds: true } } }, target)).toBe('no_ads');
    expect(interstitialGate({ ...input('fail_home', T0 + 30 * SEC, 0) }, target)).toBe('grace');
    expect(interstitialGate(input('fail_home', now, 0), mergeConfig({ ads: { interstitial: { triggers: ['next_level'] } } }))).toBe('trigger');
  });
});

describe('Phase 2e: the banner end date (spec §3.1, ads.banner.untilDate)', () => {
  const save = { progress: { level: 31, completed: 30, best: {} }, purchases: { noAds: false, tokens: [] } };
  const game = { screen: 'game' as const, save, bannerSupported: true, firstRunTutorial: false, today: null };

  it("'ended' from 2027-03-31 (a local date key), on every screen; before it the gate is unchanged", () => {
    expect(cfg.ads.banner.untilDate).toBe('2027-03-31');
    expect(bannerGate({ ...game, today: '2027-03-30' })).toBe('ok');
    for (const screen of ['game', 'home', 'victory', 'event'] as const) {
      expect(bannerGate({ ...game, screen, today: '2027-03-31' })).toBe('ended');
      expect(bannerGate({ ...game, screen, today: '2028-01-01' })).toBe('ended');
    }
    // No date given: no end-date check (S0 callers); '' in config: never ends.
    expect(bannerGate(game)).toBe('ok');
    expect(bannerGate({ ...game, today: '2030-01-01' }, mergeConfig({ ads: { banner: { untilDate: '' } } }))).toBe('ok');
    expect(bannerEnded('2027-03-31')).toBe(true);
    expect(bannerEnded(undefined)).toBe(false);
    // 'disabled' still comes first; 'ended' before the capability.
    expect(bannerGate({ ...game, today: '2027-04-01' }, mergeConfig({ ads: { banner: { enabled: false } } }))).toBe('disabled');
    expect(bannerGate({ ...game, today: '2027-04-01', bannerSupported: false })).toBe('ended');
  });

  it('the L1 start level: fromCompletedLevels 9 shows the first banner on level 10 (the tutorial counts as 1)', () => {
    const l1 = mergeConfig({ ads: { banner: { fromCompletedLevels: 9 } } });
    const at = (completed: number) => bannerGate({ ...game, save: { ...save, progress: { level: completed + 1, completed, best: {} } } }, l1);
    expect(at(8)).toBe('min_levels'); // on level 9's board
    expect(at(9)).toBe('ok'); // level 10's board
  });
});
