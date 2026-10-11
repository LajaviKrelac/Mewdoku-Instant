// Owner: independent auditor A (Phase 2e audit). Targeted abuse tests for gaps in the existing suites: a
// player racing itself past the bracket cap and the play-time budget, a delete racing an in-flight first win,
// deletion completeness checked by the real player key, concurrent nonce use, concurrent nickname changes, a
// large burst of first wins into an empty pool, and log hygiene (no raw id, token, signature, nickname or IP).
// `it.fails` pins a defect the audit reported and did not fix (finding id in the title): it turns red once the
// defect is fixed, then becomes a plain `it`.
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CONTENT, DAY, HOUR, json, makeTestApp, makeWin, playersWithWins, TestPlayer } from '../helpers/harness';

const BIG_BUDGET = { antiCheat: { budget: { initialMs: 1e12, capacityMs: 1e12, perWinCapMs: 1 } } };

async function one(t: ReturnType<typeof makeTestApp>, id: string): Promise<TestPlayer> {
  const p = new TestPlayer(t, id);
  await p.signIn();
  return p;
}

describe('audit A: a player racing itself', () => {
  it.fails('[A-S3, open] concurrent requests never push one member past antiCheat.maxWinsPerWindow (150)', async () => {
    const t = makeTestApp({ overrides: BIG_BUDGET });
    const p = await one(t, 'cap-racer');
    // 140 accepted wins, sequentially (L2 … L141)
    for (let L = 2; L < 142; L += 10) await p.wins(Array.from({ length: 10 }, (_, i) => makeWin(`L${L + i}`)));
    expect(t.rows<{ wins: number }>('SELECT wins FROM members')[0]?.wins).toBe(140);
    // 5 concurrent requests of 10 distinct, valid wins each (L142 … L191)
    await Promise.all(Array.from({ length: 5 }, (_, k) => p.wins(Array.from({ length: 10 }, (_, i) => makeWin(`L${142 + 10 * k + i}`)))));
    const m = t.rows<{ wins: number; points: number }>('SELECT wins, points FROM members')[0];
    expect(m?.wins, 'member wins after the race').toBeLessThanOrEqual(150);
    expect(t.count('SELECT COUNT(*) FROM wins')).toBeLessThanOrEqual(150);
  });

  it.fails('[A-S3, open] concurrent requests never spend the play-time budget twice', async () => {
    const t = makeTestApp();
    const p = await one(t, 'budget-racer');
    await p.win('L2', { solveMs: 60_000 }); // a running bracket first (1 min spent of the 1 h)
    // 59 min left: each win below costs 20 min, so at most 2 more can be accepted in all
    const res = await Promise.all(
      Array.from({ length: 4 }, (_, k) => p.wins([makeWin(`L${10 + 3 * k}`, { solveMs: 20 * 60_000 }), makeWin(`L${11 + 3 * k}`, { solveMs: 20 * 60_000 })])),
    );
    const accepted = res.flatMap((r) => r.results).filter((x) => x.verdict === 'accepted').length;
    expect(accepted, 'wins of 20 min accepted from a 59 min budget').toBeLessThanOrEqual(2);
  });
});

describe('audit A: deletion', () => {
  it('[A-S4, fixed in sql-store freeGuard] a delete racing an in-flight first win leaves no member or win row of the deleted player', async () => {
    for (const delayTicks of [0, 1, 2, 3, 4, 6, 8]) {
      const t = makeTestApp();
      await playersWithWins(t, 3, 'base'); // an open bracket to join
      const p = await one(t, `victim-${delayTicks}`);
      const key = p.key();
      const winP = p.rawWins([makeWin('L77')]);
      for (let i = 0; i < delayTicks; i++) await new Promise((r) => setImmediate(r));
      const delP = p.rawMe('DELETE');
      const [w, d] = await Promise.all([winP, delP]);
      expect(d.status).toBe(204);
      void w;
      expect(t.count('SELECT COUNT(*) FROM players WHERE key = ?', key), `player row (delay ${delayTicks})`).toBe(0);
      expect(t.count('SELECT COUNT(*) FROM members WHERE player_key = ?', key), `orphan member row (delay ${delayTicks})`).toBe(0);
      expect(t.count('SELECT COUNT(*) FROM wins WHERE player_key = ?', key), `orphan win row (delay ${delayTicks})`).toBe(0);
    }
  });

  it('every row keyed by the player is gone (checked with the real key), incl. a reward, flags and hearts', async () => {
    const t = makeTestApp();
    const ps = await playersWithWins(t, 5, 'gone');
    const a = ps[0]!;
    await a.win('L40', { solveMs: 4_000 }); // soft_fast → a flag
    const key = a.key();
    const v = await a.bracket();
    await a.heart(v.bracketId!, (await ps[1]!.bracket()).me!.slot);
    await ps[2]!.heart(v.bracketId!, v.me!.slot);
    t.clock.advance(DAY + HOUR);
    await a.signIn();
    expect(a.session?.results[0]?.reward?.place).toBe(1); // a reward row exists
    expect(t.count('SELECT COUNT(*) FROM flags WHERE player_key = ?', key)).toBeGreaterThan(0);
    expect((await a.rawMe('DELETE')).status).toBe(204);
    for (const table of ['players', 'members', 'wins', 'rewards', 'flags', 'tombstones']) {
      const col = table === 'players' ? 'key' : 'player_key';
      expect(t.count(`SELECT COUNT(*) FROM ${table} WHERE ${col} = ?`, key), table).toBe(0);
    }
    expect(t.count('SELECT COUNT(*) FROM hearts')).toBe(0);
  });
});

describe('audit A: concurrency on single-use and guarded writes', () => {
  it('the same nonce and signature sent twice at once: exactly one session', async () => {
    const t = makeTestApp();
    const n = await json<{ nonce: string }>(await t.fetch('/v1/session/nonce', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }));
    const enc = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', issued_at: Math.floor(t.clock.now() / 1000), player_id: 'nonce-racer', request_payload: n.nonce })).toString('base64url');
    const sig = `${createHmac('sha256', t.env.FB_APP_SECRET as string).update(enc).digest('base64url')}.${enc}`;
    const body = JSON.stringify({ platform: 'fb', playerId: 'nonce-racer', signature: sig, nonce: n.nonce, clientVersion: '0.2.0', contentVersion: CONTENT });
    const rs = await Promise.all(Array.from({ length: 5 }, () => t.fetch('/v1/session', { method: 'POST', headers: { 'content-type': 'text/plain' }, body })));
    expect(rs.map((r) => r.status).sort()).toEqual([200, 401, 401, 401, 401]);
    expect(t.count('SELECT COUNT(*) FROM players')).toBe(1);
  });

  it('two concurrent name changes: one applies, the other is nickname_cooldown', async () => {
    const t = makeTestApp();
    const p = await one(t, 'nick-racer');
    const [r1, r2] = await Promise.all([p.rawProfile({ nickname: { adj: 1, noun: 2, num: 7 } }), p.rawProfile({ nickname: { adj: 3, noun: 4, num: 8 } })]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const ok = await json<{ player: { nickname: string } }>(r1.status === 200 ? r1 : r2);
    expect(t.rows<{ nickname: string }>('SELECT nickname FROM players')[0]?.nickname).toBe(ok.player.nickname);
  });

  it.fails('[A-S1, open] 120 concurrent first wins into an empty pool: every win counted, no bracket over 50, none empty', async () => {
    const t = makeTestApp();
    const ps: TestPlayer[] = [];
    for (let i = 0; i < 120; i++) ps.push(await one(t, `burst${i}`));
    const res = await Promise.all(ps.map((p, i) => p.wins([makeWin(`L${300 + i}`)])));
    const verdicts = res.map((r) => r.results[0]?.verdict);
    expect(verdicts.filter((v) => v !== 'accepted'), 'wins not counted').toEqual([]);
    expect(t.count('SELECT COUNT(*) FROM wins')).toBe(120);
    const sizes = t.rows<{ n: number }>('SELECT (SELECT COUNT(*) FROM members m WHERE m.bracket_id = b.id) AS n FROM brackets b').map((r) => r.n);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(50);
    expect(Math.min(...sizes)).toBeGreaterThan(0);
    expect(sizes.reduce((s, n) => s + n, 0)).toBe(120);
  });
});

describe('audit A: the solution table cannot be stepped around', () => {
  it.fails('[A-S2, open] fake ids past the table (L3001+, any 4-cell king permutation) earn no paid place', async () => {
    const t = makeTestApp();
    await playersWithWins(t, 5, 'h'); // five honest players, 3 fish each
    const p = await one(t, 'farmer');
    for (let L = 3001; L < 3151; L += 10) {
      await p.wins(Array.from({ length: 10 }, (_, i) => makeWin(`L${L + i}`, { cats: '1302', solveMs: 4000, source: 'generated' })));
    }
    t.clock.advance(DAY + HOUR);
    await p.signIn();
    expect(p.session?.results[0]?.reward ?? null, 'a paid reward for unverified farming').toBeNull();
  });
});

describe('audit A: log hygiene (spec §1.14)', () => {
  it('no log line carries the raw FB id, the token, the signature, the nickname or the client IP', async () => {
    const t = makeTestApp();
    const ip = '203.0.113.77';
    const rawId = '98765432109876543';
    const p = new TestPlayer(t, rawId);
    const s = await p.signIn();
    await p.win('L2');
    await t.fetch('/v1/bracket', { headers: { authorization: `Bearer ${p.token}`, 'cf-connecting-ip': ip } });
    await p.profile({ nickname: { adj: 5, noun: 6, num: 9 } });
    await t.fetch('/v1/bracket', { headers: { authorization: `Bearer ${p.token}x`, 'cf-connecting-ip': ip } }); // a bad token
    const all = JSON.stringify(t.logs);
    expect(all).not.toContain(rawId);
    expect(all).not.toContain(p.token);
    expect(all).not.toContain(p.token.split('.')[2] as string);
    expect(all).not.toContain(ip);
    expect(all).not.toContain(s.player.nickname);
    expect(all).not.toContain((await p.me()).player.nickname);
    expect(HOUR).toBeGreaterThan(0);
  });
});
