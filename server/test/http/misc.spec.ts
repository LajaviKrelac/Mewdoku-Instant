// Owner: G4 (Phase 2e). The rest of spec §10.2: the isolate rate limits, the dev routes (per-pool clock,
// switches, cron, reset; no seeding), and a deterministic join race (the bracket fills between the find and
// the join: the win counts once, in a new bracket, and no win row exists without its member row).
import { describe, expect, it } from 'vitest';
import { parseApiError, parseConfigResponse } from '../../src/contract';
import { DAY, json, makeTestApp, makeWin, playersWithWins, TestPlayer } from '../helpers/harness';

describe('rate limits (per isolate, §1.9.5)', () => {
  it('wins: 30 per minute per player, then 429 with retryAfterMs; tokens refill with time', async () => {
    const t = makeTestApp({ realLimits: true });
    const p = new TestPlayer(t, 'rl');
    await p.signIn();
    for (let i = 0; i < 30; i++) expect((await p.rawBracket()).status).toBe(200);
    const r = await p.rawBracket();
    expect(r.status).toBe(429);
    const e = parseApiError(await json(r));
    expect(e?.error.code).toBe('rate_limited');
    expect(e?.error.retryAfterMs).toBeGreaterThan(0);
    expect(r.headers.get('retry-after')).toBe('2');
    t.clock.advance(2000);
    expect((await p.rawBracket()).status).toBe(200);
    // another player has their own bucket
    const q = new TestPlayer(t, 'rl2');
    await q.signIn();
    expect((await q.rawBracket()).status).toBe(200);
  });
});

describe('dev routes (DEV_ROUTES=true on a loopback host only)', () => {
  it('a pool clock moves only that pool; switches per pool; reset wipes only that pool', async () => {
    const t = makeTestApp();
    const a = new TestPlayer(t, 'a', { devPool: 'pool-a' });
    const b = new TestPlayer(t, 'b', { devPool: 'pool-b' });
    await a.signIn();
    await b.signIn();
    await a.win('L2');
    await b.win('L2');
    const moved = await json<{ serverTime: number }>(await t.fetch('/dev/clock', { method: 'POST', body: JSON.stringify({ devPool: 'pool-a', advanceMs: DAY + 3_600_000 }) }));
    expect(moved.serverTime).toBe(t.clock.now() + DAY + 3_600_000);
    await a.signIn(); // the old token expired on pool-a's clock
    expect((await a.bracket()).state).toBe('ended');
    expect((await b.bracket()).state).toBe('open');
    await t.fetch('/dev/config', { method: 'POST', body: JSON.stringify({ devPool: 'pool-a', switches: { iapIos: true, ladder: false, nope: true } }) });
    expect(parseConfigResponse(await json(await t.fetch('/v1/config?devPool=pool-a')))?.switches).toEqual({ iapIos: true, ladder: false });
    expect(parseConfigResponse(await json(await t.fetch('/v1/config?devPool=pool-b')))?.switches).toEqual({ iapIos: false });
    const cron = await json<{ report: { finalized: number } }>(await t.fetch('/dev/cron', { method: 'POST', body: '{"devPool":"pool-a"}' }));
    expect(cron.report.finalized).toBe(0); // pool-a's bracket was finalised lazily by the read
    await t.fetch('/dev/reset', { method: 'POST', body: '{"devPool":"pool-a"}' });
    expect(t.count("SELECT COUNT(*) FROM players WHERE pool LIKE '%:pool-a'")).toBe(0);
    expect(t.count("SELECT COUNT(*) FROM players WHERE pool LIKE '%:pool-b'")).toBe(1);
    expect(t.count("SELECT COUNT(*) FROM brackets WHERE pool = 'fb:pool-b'")).toBe(1);
    // there is no seeding route
    for (const path of ['/dev/seed', '/dev/players', '/dev/bracket']) expect((await t.fetch(path, { method: 'POST', body: '{}' })).status).toBe(404);
    expect((await t.fetch('/dev/clock', { method: 'POST', body: '{"devPool":"BAD POOL"}' })).status).toBe(400);
  });

  it('with DEV_ROUTES off they do not exist', async () => {
    const t = makeTestApp({ env: { DEV_ROUTES: 'false' } });
    expect((await t.fetch('/dev/clock', { method: 'POST', body: '{"devPool":"x","advanceMs":1}' })).status).toBe(404);
    expect((await new TestPlayer(t, 'x', { devPool: 'x' }).rawSession()).status).toBe(400);
  });
});

describe('join race, deterministic (§1.5 step 3, critic C-9)', () => {
  it('the bracket fills between the find and the join: the win counts once, in a new bracket', async () => {
    const t = makeTestApp({ overrides: { bracket: { maxMembers: 3 } } });
    const [p0, p1] = await playersWithWins(t, 2, 'f');
    const late = new TestPlayer(t, 'late');
    const thief = new TestPlayer(t, 'thief');
    await late.signIn();
    await thief.signIn();
    const store = t.app.services.store;
    const original = store.findOpenBracket.bind(store);
    let stolen = false;
    store.findOpenBracket = async (pool: string, now: number): Promise<string | null> => {
      const id = await original(pool, now);
      if (!stolen && id !== null) {
        stolen = true;
        await thief.wins([makeWin('L50')]); // takes the last place first
      }
      return id;
    };
    const r = await late.wins([makeWin('L60')]);
    expect(r.results[0]).toMatchObject({ verdict: 'accepted', points: 3 });
    const first = (await p0!.bracket()).bracketId;
    expect(r.bracket?.bracketId).not.toBe(first);
    expect(r.bracket?.members).toBe(1);
    expect((await p1!.bracket()).members).toBe(3);
    expect(t.count('SELECT COUNT(*) FROM wins w WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m.bracket_id = w.bracket_id AND m.player_key = w.player_key)')).toBe(0);
    expect(t.count('SELECT COUNT(*) FROM wins WHERE player_key = ?', late.key())).toBe(1);
  });
});
