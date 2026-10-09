// Owner: D
// FB tournaments as GroupProvider (phase2b §5.6): capability, createAsync payload (HIGHER_IS_BETTER,
// NUMERIC, endTime in seconds, initialScore 0), current() of the context, post(), no standings API.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg } from '../../../src/app/config';
import { createFbGroups, groupsSupported } from '../../../src/platform/fb/fb-groups';
import { createStub, drain, track, type StubConfig } from './helpers';

function setup(config: StubConfig = {}) {
  const clock = createFakeClock();
  const { sdk, control } = createStub(config, clock);
  const groups = createFbGroups(sdk, { timers: clock });
  return { clock, sdk, control, groups };
}

describe('groupsSupported', () => {
  it('needs createAsync, postScoreAsync and getTournamentAsync', () => {
    const clock = createFakeClock();
    expect(groupsSupported(createStub({}, clock).sdk)).toBe(true);
    expect(groupsSupported(createStub({ presets: ['no-tournament'] }, clock).sdk)).toBe(false);
    const partial = createStub({ supportedAPIs: ['tournament.createAsync', 'tournament.postScoreAsync'] }, clock).sdk;
    expect(groupsSupported(partial)).toBe(false);
  });
});

describe('createFbGroups', () => {
  it('create() opens FB’s dialog with our config and returns the tournament id', async () => {
    const { groups, control, clock } = setup();
    const end = clock.now() + cfg.groups.durationH * 3_600_000;
    await expect(groups.create(end, 'Group challenge')).resolves.toEqual({ id: 'tournament-1' });
    expect(control.find('tournament.createAsync')[0]?.args).toEqual([
      {
        initialScore: 0,
        config: { title: 'Group challenge', sortOrder: 'HIGHER_IS_BETTER', scoreFormat: 'NUMERIC', endTime: Math.floor(end / 1000) },
      },
    ]);
  });

  it('create() is null when cancelled or already in a tournament', async () => {
    const cancelled = setup({ tournament: { create: 'USER_INPUT' } });
    await expect(cancelled.groups.create(cancelled.clock.now() + 1e6, 't')).resolves.toBeNull();
    const busy = setup({ tournament: { current: { id: 'x', endTime: 2_000_000_000 } } });
    await expect(busy.groups.create(busy.clock.now() + 1e6, 't')).resolves.toBeNull();
    await expect(busy.groups.create(Number.NaN, 't')).resolves.toBeNull();
  });

  it('current() is the context’s tournament with its end in ms; null outside one', async () => {
    const { groups, control } = setup();
    await expect(groups.current()).resolves.toBeNull();
    control.setTournament({ id: 'tour-9', endTime: 1_790_000_000 });
    await expect(groups.current()).resolves.toEqual({ id: 'tour-9', endTimeMs: 1_790_000_000_000 });
  });

  it('post() posts the floored total; false on any error, never retried', async () => {
    const { groups, control } = setup();
    await expect(groups.post(120)).resolves.toBe(false); // TOURNAMENT_NOT_FOUND
    control.setTournament({ id: 'tour-1', endTime: 1_790_000_000 });
    await expect(groups.post(155.7)).resolves.toBe(true);
    expect(control.find('tournament.postScoreAsync').map((c) => c.args[0])).toEqual([120, 155]);
    await expect(groups.post(-1)).resolves.toBe(false);
    expect(control.count('tournament.postScoreAsync')).toBe(2);
  });

  it('current() and post() have the rank.fetchTimeoutMs deadline', async () => {
    const { groups, sdk, clock } = setup();
    sdk.getTournamentAsync = () => new Promise(() => undefined);
    sdk.tournament!.postScoreAsync = () => new Promise(() => undefined);
    const cur = track(groups.current());
    const post = track(groups.post(10));
    await clock.advanceAsync(cfg.rank.fetchTimeoutMs);
    await drain();
    expect(cur.value).toBeNull();
    expect(post.value).toBe(false);
  });

  it('offers no standings API (§5.2: none found)', () => {
    expect(setup().groups.standings).toBeUndefined();
  });
});
