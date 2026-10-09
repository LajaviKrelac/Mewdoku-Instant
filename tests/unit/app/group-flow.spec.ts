// Owner: C. Group challenges (phase2b §5.6, §5.10): participation mode — below 3 wins nothing, at 3 a
// 2-kitty result, the group_double video gives 4 in total (not 2 + 4), one claim per challenge; rank
// mode — ties share 1st, null standings fall back to participation; participation never says "won";
// points are added only inside the challenge's context and window; behind the groupChallenges flag.
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { mergeConfig, type GameConfig } from '../../../src/app/config';
import type { AnalyticsEvent } from '../../../src/app/events';
import { setFlagOverrides } from '../../../src/app/flags';
import { createGroupFlow } from '../../../src/app/group-flow';
import { defaults } from '../../../src/game/save';
import type { SaveData } from '../../../src/game/types';
import type { GroupProvider } from '../../../src/platform/types';
import { NOW } from './harness';

const H = 3_600_000;

function setup(opts: { config?: GameConfig; provider?: Partial<GroupProvider>; video?: boolean; save?: Partial<SaveData> } = {}) {
  setFlagOverrides({ groupChallenges: true });
  const clock = createFakeClock(NOW);
  let state: SaveData = { ...defaults(NOW), ...opts.save };
  const calls: string[] = [];
  const analytics: AnalyticsEvent[] = [];
  let current: { id: string; endTimeMs: number } | null = null;
  const provider: GroupProvider = {
    create: async (end, title) => (calls.push(`create:${end - NOW}:${title}`), { id: 't1' }),
    current: async () => current,
    post: async (score) => (calls.push(`post:${score}`), true),
    ...opts.provider,
  };
  const flow = createGroupFlow({
    groups: () => provider,
    supported: () => true,
    rewardedAvailable: () => true,
    watchDouble: async () => (calls.push('video'), opts.video ?? true),
    save: () => state,
    updateSave: (fn) => {
      state = fn(state);
    },
    persist: () => void calls.push('save'),
    log: (e) => void analytics.push(e),
    clock,
    ...(opts.config ? { config: opts.config } : {}),
  });
  return {
    clock,
    flow,
    calls,
    analytics,
    save: () => state,
    setCurrent: (c: typeof current) => {
      current = c;
    },
  };
}

afterEach(() => setFlagOverrides({}));

const ended = (wins: number, extra: Partial<SaveData['groups'][string]> = {}): Partial<SaveData> => ({
  groups: { g1: { endsAt: NOW - H, total: wins * 40, wins, claimed: 0, ...extra } },
});

describe('group challenges (§5.6)', () => {
  it('off behind the flag (default) and without a provider', async () => {
    setFlagOverrides({});
    const s = setup();
    setFlagOverrides({ groupChallenges: false });
    expect(s.flow.enabled()).toBe(false);
    expect(await s.flow.start('x')).toBe(false);
  });

  it('start: a 72 h tournament, saved, logged', async () => {
    const s = setup();
    expect(await s.flow.start('Group challenge')).toBe(true);
    expect(s.calls).toEqual([`create:${72 * H}:Group challenge`, 'save']);
    expect(s.save().groups.t1).toEqual({ endsAt: NOW + 72 * H, total: 0, wins: 0, claimed: 0 });
    expect(s.analytics).toEqual([{ name: 'group_create', params: {} }]);
  });

  it('wins in the challenge context add points and post the total; outside it or after the end nothing', async () => {
    const s = setup();
    await s.flow.onWin(45);
    expect(s.calls).toEqual([]);
    s.setCurrent({ id: 't1', endTimeMs: NOW + 10 * H });
    await s.flow.onWin(45);
    await s.flow.onWin(55);
    expect(s.save().groups.t1).toEqual({ endsAt: NOW + 10 * H, total: 100, wins: 2, claimed: 0 });
    expect(s.calls).toEqual(['save', 'post:45', 'save', 'post:100']);
    s.clock.advance(10 * H);
    await s.flow.onWin(30);
    expect(s.save().groups.t1?.wins).toBe(2);
  });

  it('participation: below 3 wins nothing (closed quietly); at 3 a 2-kitty result that never says "won"', async () => {
    const few = setup({ save: ended(2) });
    expect(await few.flow.pendingResult()).toBeNull();
    expect(few.save().groups.g1?.claimed).toBe(1);
    const s = setup({ save: ended(3) });
    const r = await s.flow.pendingResult();
    expect(r).toEqual({ id: 'g1', outcome: { kind: 'participation', kitties: 2, kittiesWithAd: 4 }, place: null });
    expect(JSON.stringify(r)).not.toMatch(/won/);
  });

  it('take gives 2 kitties once; the video gives 4 in total (not 2 + 4); a failed video claims nothing', async () => {
    const s = setup({ save: ended(3) });
    const k0 = s.save().stock.kitties;
    const r = await s.flow.pendingResult();
    if (!r) throw new Error('no result');
    expect(await s.flow.claim(r, false)).toBe(true);
    expect(s.save().stock.kitties).toBe(k0 + 2);
    expect(await s.flow.claim(r, false)).toBe(false); // one claim per challenge
    expect(s.save().stock.kitties).toBe(k0 + 2);
    expect(s.analytics).toContainEqual({ name: 'group_result', params: { mode: 'participation', wins: 3, doubled: 0 } });

    const d = setup({ save: ended(4) });
    const rd = await d.flow.pendingResult();
    if (!rd) throw new Error('no result');
    expect(await d.flow.claim(rd, true)).toBe(true);
    expect(d.save().stock.kitties).toBe(k0 + 4);
    expect(d.analytics).toContainEqual({ name: 'group_result', params: { mode: 'participation', wins: 4, doubled: 1 } });

    const f = setup({ save: ended(3), video: false });
    const rf = await f.flow.pendingResult();
    if (!rf) throw new Error('no result');
    expect(await f.flow.claim(rf, true)).toBe(false);
    expect(f.save().groups.g1?.claimed).toBe(0);
    expect(f.save().stock.kitties).toBe(k0);
  });

  it('rank mode: rank 1 and everyone tied for 1st win kitties; others with a win get 10 fish', async () => {
    const config = mergeConfig({ groups: { rewardMode: 'rank' } });
    const first = setup({ config, save: ended(1), provider: { standings: async () => ({ myRank: 1, count: 6, tiedFirst: false }) } });
    expect((await first.flow.pendingResult())?.outcome).toEqual({ kind: 'won', kitties: 2, kittiesWithAd: 4 });
    const tied = setup({ config, save: ended(1), provider: { standings: async () => ({ myRank: 2, count: 6, tiedFirst: true }) } });
    expect((await tied.flow.pendingResult())?.outcome.kind).toBe('won');
    const third = setup({ config, save: ended(2), provider: { standings: async () => ({ myRank: 3, count: 6, tiedFirst: false }) } });
    const r = await third.flow.pendingResult();
    expect(r?.outcome).toEqual({ kind: 'place', place: 3, count: 6, fish: 10 });
    if (!r) throw new Error('no result');
    await third.flow.claim(r, false);
    expect(third.save().wallet.fish).toBe(10);
    expect(third.analytics).toContainEqual({ name: 'group_result', params: { mode: 'rank', place: 3, wins: 2, doubled: 0 } });
  });

  it('rank mode with null standings falls back to participation (never a guessed rank)', async () => {
    const config = mergeConfig({ groups: { rewardMode: 'rank' } });
    const s = setup({ config, save: ended(3), provider: { standings: async () => null } });
    expect((await s.flow.pendingResult())?.outcome.kind).toBe('participation');
    const few = setup({ config, save: ended(1), provider: { standings: async () => null } });
    expect(await few.flow.pendingResult()).toBeNull();
  });

  it('a running challenge is not a result yet; the hub sees it as active', async () => {
    const s = setup({ save: { groups: { t1: { endsAt: NOW + H, total: 0, wins: 1, claimed: 0 } } } });
    expect(await s.flow.pendingResult()).toBeNull();
    s.setCurrent({ id: 't1', endTimeMs: NOW + H });
    expect(await s.flow.active()).toEqual({ id: 't1', endsAt: NOW + H, wins: 1 });
  });
});
