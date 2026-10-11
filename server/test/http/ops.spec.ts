// Owner: G4 (Phase 2e). Me and deletion (§1.11), admin (§1.9.7, §11.7), the cron: finalisation, nonce purge,
// stats and the daily retention sweep with a fake clock (§1.10, §1.14, §10.5 #9).
import { describe, expect, it } from 'vitest';
import { parseMeResponse } from '../../src/contract';
import { admin, DAY, HOUR, json, makeTestApp, playersWithWins, TestPlayer } from '../helpers/harness';

describe('me and deletion (§1.11)', () => {
  it('GET /v1/me: profile, code and a data summary', async () => {
    const t = makeTestApp();
    const [a] = await playersWithWins(t, 1, 'me');
    await a!.win('L30');
    const me = await a!.me();
    expect(parseMeResponse(me)).toEqual(me);
    expect(me.data).toEqual({ brackets: 1, wins30d: 2, rewards: 0, createdAt: expect.any(Number) });
    expect(me.player.code).toBe(a!.code());
  });

  it('delete: my rows vanish, hearts I gave are taken back, the count drops, the slot is never reused', async () => {
    const t = makeTestApp();
    const [a, b, c] = await playersWithWins(t, 3, 'del');
    const v = await a!.bracket();
    const id = v.bracketId!;
    const bSlot = (await b!.bracket()).me!.slot;
    await a!.heart(id, bSlot);
    await c!.heart(id, (await a!.bracket()).me!.slot);
    expect((await b!.bracket()).heartsNew).toBe(1);
    expect((await a!.rawMe('DELETE')).status).toBe(204);
    const key = a!.key();
    expect(key).toBe(''); // the player row is gone
    for (const table of ['players', 'wins', 'rewards', 'flags']) {
      expect(t.count(`SELECT COUNT(*) FROM ${table} WHERE ${table === 'players' ? 'code' : 'player_key'} = ?`, table === 'players' ? a!.code() : 'x'), table).toBe(0);
    }
    expect(t.count('SELECT COUNT(*) FROM members')).toBe(2);
    expect(t.count('SELECT COUNT(*) FROM hearts')).toBe(0); // given by a, and given to a
    const vb = await b!.bracket();
    expect(vb.members).toBe(2);
    expect(vb.me?.hearts).toBe(0);
    expect(t.rows<{ members: number; next_slot: number }>('SELECT members, next_slot FROM brackets')[0]).toEqual({ members: 2, next_slot: 3 });
    // signing in again later creates a fresh player with a new code
    const again = new TestPlayer(t, 'del0');
    await again.signIn();
    expect(again.code()).not.toBe(a!.code());
    expect((await again.bracket()).state).toBe('none');
  });

  it('a suspended player who deletes keeps a 90-day tombstone (delete-and-return does not lift it)', async () => {
    const t = makeTestApp();
    const [a] = await playersWithWins(t, 1, 'tomb');
    await admin(t, 'POST', `players/${a!.code()}/suspend`);
    expect((await admin(t, 'DELETE', `players/${a!.code()}`)).status).toBe(204);
    expect(t.count('SELECT COUNT(*) FROM tombstones')).toBe(1);
    const back = new TestPlayer(t, 'tomb0');
    expect((await back.rawSession()).status).toBe(403);
    expect(t.count('SELECT COUNT(*) FROM players')).toBe(0); // nothing created under a tombstone
    // the sweep removes it after 90 days; then the same account starts fresh
    t.clock.advance(91 * DAY);
    const report = await t.app.scheduled(Date.parse('2027-02-14T03:17:00Z'));
    expect(report.swept?.tombstones).toBe(1);
    expect((await new TestPlayer(t, 'tomb0').rawSession()).status).toBe(200);
  });
});

describe('admin (§1.4, §1.9.7)', () => {
  it('needs the admin key (constant-time compare); a short or missing ADMIN_KEY disables admin', async () => {
    const t = makeTestApp();
    expect((await t.fetch('/admin/v1/flags')).status).toBe(401);
    expect((await admin(t, 'GET', 'flags', 'wrong')).status).toBe(401);
    expect((await admin(t, 'GET', 'flags', `${t.env.ADMIN_KEY as string}x`)).status).toBe(401);
    expect((await admin(t, 'GET', 'flags')).status).toBe(200);
    const weak = makeTestApp({ env: { ADMIN_KEY: 'short' } });
    expect((await admin(weak, 'GET', 'flags', 'short')).status).toBe(401);
  });

  it('flags newest first with the player code; resolve; player detail; reset-nickname; stats', async () => {
    const t = makeTestApp();
    const [a] = await playersWithWins(t, 1, 'adm');
    await a!.win('L90'); // a jump of 88 → level_jump flag
    const flags = (await json<{ flags: { id: string; kind: string; code: string }[] }>(await admin(t, 'GET', 'flags'))).flags;
    expect(flags).toEqual([expect.objectContaining({ kind: 'level_jump', code: a!.code() })]);
    expect((await admin(t, 'POST', `flags/${flags[0]!.id}/resolve`)).status).toBe(200);
    expect((await json<{ flags: unknown[] }>(await admin(t, 'GET', 'flags'))).flags).toEqual([]);
    const detail = await json<{ player: { code: string; flagCount: number }; wins: unknown[]; brackets: unknown[] }>(await admin(t, 'GET', `players/${a!.code()}`));
    expect(detail.player.code).toBe(a!.code());
    expect(detail.player.flagCount).toBe(1);
    expect(detail.wins).toHaveLength(2);
    expect(detail.brackets).toHaveLength(1);
    expect(JSON.stringify(detail)).not.toContain(a!.key());
    const before = (await a!.me()).player.nickname;
    const reset = await json<{ player: { nickname: string } }>(await admin(t, 'POST', `players/${a!.code()}/reset-nickname`));
    expect(reset.player.nickname).not.toBe(before);
    expect((await a!.bracket()).me?.nickname).toBe(reset.player.nickname);
    expect(t.count("SELECT COUNT(*) FROM admin_log WHERE action IN ('resolve_flag', 'reset_nickname')")).toBe(2);
    t.clock.advance(60_000); // the rollup window is [last run, now)
    await t.app.scheduled();
    const stats = await json<{ days: { day: string; values: Record<string, number> }[] }>(await admin(t, 'GET', 'stats?days=7'));
    expect(stats.days[0]?.values).toMatchObject({ dau: 1, wins_accepted: 1, wins_accepted_flagged: 1, flags_level_jump: 1 });
  });

  it('SQL-shaped and unknown path ids are 400/404 before any SQL', async () => {
    const t = makeTestApp();
    for (const bad of ["'%3B%20DROP%20TABLE%20wins%3B--", '%27', 'x'.repeat(300), 'abcd1234']) {
      const r = await admin(t, 'GET', `players/${bad}`);
      expect([400, 404], bad).toContain(r.status);
    }
    expect((await admin(t, 'POST', "brackets/'1'/refinalize")).status).toBe(400);
    expect((await admin(t, 'POST', 'brackets/zzzzzzzzzzzz/refinalize')).status).toBe(404);
    expect((await admin(t, 'GET', 'nope')).status).toBe(404);
    expect(t.count('SELECT COUNT(*) FROM wins')).toBe(0);
    expect(t.count("SELECT COUNT(*) FROM sqlite_master WHERE name = 'wins'")).toBe(1);
  });
});

describe('cron (§1.1, §1.10, §1.14)', () => {
  it('finalises due brackets (bounded per run), purges used nonces, rolls up stats', async () => {
    const t = makeTestApp({ overrides: { cron: { finalizePerRun: 1 } } });
    await playersWithWins(t, 2, 'c1');
    t.clock.advance(3 * HOUR);
    await playersWithWins(t, 2, 'c2', 40);
    t.clock.advance(DAY + HOUR);
    const r1 = await t.app.scheduled();
    expect(r1.finalized).toBe(1);
    expect(r1.noncesPurged).toBeGreaterThan(0);
    const r2 = await t.app.scheduled();
    expect(r2.finalized).toBe(1);
    expect(t.count('SELECT COUNT(*) FROM brackets WHERE finalized_at IS NULL')).toBe(0);
    expect(t.count('SELECT COUNT(*) FROM seen_nonces')).toBe(0);
    expect(t.count("SELECT COUNT(*) FROM stats_daily WHERE name = 'brackets_ended'")).toBeGreaterThan(0);
  });

  it('the daily retention sweep deletes by age only (wins 30 d, brackets 30 d, flags 90 d, players 180 d)', async () => {
    const t = makeTestApp();
    const [old] = await playersWithWins(t, 1, 'old');
    await old!.win('L80'); // a level_jump flag
    t.clock.advance(31 * DAY);
    const [fresh] = await playersWithWins(t, 1, 'fresh');
    const report = await t.app.scheduled(Date.parse('2026-12-17T03:17:00Z'));
    expect(report.swept?.wins).toBe(2);
    expect(report.swept?.brackets).toBe(1);
    expect(t.count('SELECT COUNT(*) FROM wins')).toBe(1);
    expect(t.count('SELECT COUNT(*) FROM members')).toBe(1);
    expect(t.count('SELECT COUNT(*) FROM flags')).toBe(1); // 90 days
    expect(t.count('SELECT COUNT(*) FROM players')).toBe(2);
    t.clock.advance(200 * DAY);
    const later = await t.app.scheduled(Date.parse('2027-07-04T03:17:00Z'));
    expect(later.swept?.flags).toBe(1);
    expect(later.swept?.players).toBe(2);
    expect(t.count('SELECT COUNT(*) FROM players')).toBe(0);
    expect(fresh).toBeDefined();
  });

  it('runs the sweep only in the 03:xx UTC run', async () => {
    const t = makeTestApp();
    expect((await t.app.scheduled(Date.parse('2026-11-16T04:17:00Z'))).swept).toBeNull();
    expect((await t.app.scheduled(Date.parse('2026-11-16T03:17:00Z'))).swept).not.toBeNull();
  });
});
