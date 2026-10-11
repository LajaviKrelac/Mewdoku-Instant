// Owner: G4 (Phase 2e). The abuse list of spec §10.4 over HTTP (the ones not already covered next to their
// feature: forged signature, replayed nonce, denied origin, the anonymous quota, production dev routes, the
// ALT secret in production, deleted and suspended tokens, admin keys, the 21-heart race and heart
// non-members live in session/ops/social/brackets specs).
import { describe, expect, it } from 'vitest';
import { makeTestApp, makeWin, playersWithWins, TestPlayer, json, anyKing, wrongBoard, boardOf, DAY, HOUR } from '../helpers/harness';

async function one(t: ReturnType<typeof makeTestApp>, id = 'ab'): Promise<TestPlayer> {
  const p = new TestPlayer(t, id);
  await p.signIn();
  return p;
}

const verdictOf = async (p: TestPlayer, win: Parameters<TestPlayer['wins']>[0][number]): Promise<unknown> => (await p.wins([win])).results[0];

describe('abuse: forged and replayed wins', () => {
  it('a replayed win is a duplicate; the same puzzle under a new winId counts nothing', async () => {
    const t = makeTestApp();
    const p = await one(t);
    const w = makeWin('L2');
    expect(await verdictOf(p, w)).toMatchObject({ verdict: 'accepted', points: 3 });
    expect(await verdictOf(p, w)).toMatchObject({ verdict: 'duplicate', points: 3 });
    expect(await verdictOf(p, makeWin('L2'))).toMatchObject({ verdict: 'already_counted', points: 0 });
    expect((await p.bracket()).me?.points).toBe(3);
  });

  it('a bogus contentVersion with a wrong solution, a spoofed source, L1 and unknown events', async () => {
    const t = makeTestApp();
    const p = await one(t);
    expect(await verdictOf(p, makeWin('L57', { contentVersion: 'content-bogus0000', cats: wrongBoard(boardOf('L57')) }))).toMatchObject({ verdict: 'rejected', reason: 'bad_solution' });
    expect(await verdictOf(p, makeWin('L58', { source: 'generated', cats: anyKing(boardOf('L58').length) }))).toMatchObject({ verdict: 'rejected' });
    expect(await verdictOf(p, makeWin('L1', { cats: '1302' }))).toMatchObject({ verdict: 'rejected', reason: 'bad_puzzle_id' });
    expect(await verdictOf(p, makeWin('Ecat-party-2099/0', { cats: anyKing(8) }))).toMatchObject({ verdict: 'rejected', reason: 'bad_puzzle_id' });
    expect(t.count('SELECT COUNT(*) FROM members')).toBe(0); // nothing counted: no row
    expect(t.rows<{ kind: string }>('SELECT kind FROM flags ORDER BY kind')).toEqual([{ kind: 'bad_solution' }, { kind: 'bad_solution' }]);
  });

  it('a too-fast solve, fish 4, an inconsistent fish/mistakes/revives triple', async () => {
    const t = makeTestApp();
    const p = await one(t);
    expect(await verdictOf(p, makeWin('L5', { solveMs: 500 }))).toMatchObject({ verdict: 'rejected', reason: 'too_fast' });
    expect(await verdictOf(p, makeWin('L6', { fish: 4 }))).toMatchObject({ verdict: 'rejected', reason: 'bad_fish' });
    expect(await verdictOf(p, makeWin('L7', { fish: 3, mistakes: 1 }))).toMatchObject({ verdict: 'rejected', reason: 'inconsistent' });
    expect(await verdictOf(p, makeWin('L8', { fish: 2, mistakes: 1, revives: 1 }))).toMatchObject({ verdict: 'rejected', reason: 'inconsistent' });
    expect(t.count('SELECT flag_count FROM players')).toBe(4);
  });

  it('a daily of a date that exists nowhere now; an event after its grace', async () => {
    const t = makeTestApp();
    const p = await one(t);
    expect(await verdictOf(p, makeWin('D2026-11-20'))).toMatchObject({ verdict: 'rejected', reason: 'stale_date' });
    expect(await verdictOf(p, makeWin('D2026-11-01'))).toMatchObject({ verdict: 'rejected', reason: 'stale_date' });
    expect(await verdictOf(p, makeWin('Esnow-paws-2026/0'))).toMatchObject({ verdict: 'rejected', reason: 'event_closed' }); // starts 2026-12-18
    t.clock.set(Date.parse('2026-11-27T06:00:01Z')); // lantern-walk ended 2026-11-27T00:00Z, + 6 h grace
    await p.signIn();
    expect(await verdictOf(p, makeWin('Elantern-walk-2026/0'))).toMatchObject({ verdict: 'rejected', reason: 'event_closed' });
  });

  it('151 wins in a bracket: the 151st is window_cap (the 60th raised a flag)', async () => {
    const t = makeTestApp({ overrides: { antiCheat: { budget: { initialMs: 1e12, capacityMs: 1e12, perWinCapMs: 1 } } } });
    const p = await one(t);
    let n = 0;
    for (let L = 2; n < 151; L += 10) {
      const batch = Array.from({ length: 10 }, (_, i) => makeWin(`L${L + i}`));
      const r = await p.wins(batch);
      for (const x of r.results) {
        n++;
        if (n === 151) expect(x).toMatchObject({ verdict: 'rejected', reason: 'window_cap' });
        else if (n < 151) expect(x.verdict, `win ${n}`).toBe('accepted');
      }
    }
    expect(t.count("SELECT COUNT(*) FROM flags WHERE kind = 'wins_flag'")).toBe(1);
    expect(t.count("SELECT COUNT(*) FROM flags WHERE kind = 'window_cap'")).toBeGreaterThanOrEqual(1);
    expect((await p.bracket()).me?.points).toBe(450);
  });

  it('budget exhaustion: a new player\'s 1 h runs out; real time refills it', async () => {
    const t = makeTestApp();
    const p = await one(t);
    const r = await p.wins(Array.from({ length: 4 }, (_, i) => makeWin(`L${2 + i}`, { solveMs: 20 * 60_000 })));
    expect(r.results.map((x) => x.verdict)).toEqual(['accepted', 'accepted', 'accepted', 'rejected']);
    expect(r.results[3]?.reason).toBe('budget');
    t.clock.advance(HOUR);
    expect((await p.win('L9', { solveMs: 20 * 60_000 })).results[0]?.verdict).toBe('accepted');
  });
});

describe('abuse: request shape', () => {
  it('11 wins in one call → 413; a 17 KB body → 413; a bad field → 400 naming it', async () => {
    const t = makeTestApp();
    const p = await one(t);
    const eleven = await p.rawWins(Array.from({ length: 11 }, (_, i) => makeWin(`L${2 + i}`)));
    expect(eleven.status).toBe(413);
    expect((await json(eleven)).error).toMatchObject({ code: 'too_large' });
    const big = await t.fetch('/v1/wins', { method: 'POST', headers: { authorization: `Bearer ${p.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ wins: [makeWin('L2')], pad: 'x'.repeat(17_000) }) });
    expect(big.status).toBe(413);
    const bad = await p.rawWins([makeWin('L2', { fish: 2.5 })]);
    expect(bad.status).toBe(400);
    expect((await json(bad)).error).toMatchObject({ code: 'bad_request', message: 'wins[0].fish' });
    const notJson = await t.fetch('/v1/wins', { method: 'POST', headers: { authorization: `Bearer ${p.token}` }, body: '{"wins": [' });
    expect(notJson.status).toBe(400);
    const xml = await t.fetch('/v1/wins', { method: 'POST', headers: { authorization: `Bearer ${p.token}`, 'content-type': 'application/xml' }, body: '<wins/>' });
    expect(xml.status).toBe(400);
  });

  it('SQL-shaped values in every id field are 400 before any SQL', async () => {
    const t = makeTestApp();
    const p = await one(t);
    const evil = ["'; DROP TABLE wins;--", '%27', 'x'.repeat(5000), 'L2 OR 1=1', 'mgk0b7q1z4a8:1; --'];
    for (const v of evil) {
      expect((await p.rawWins([makeWin('L2', { puzzleId: v })])).status, `puzzleId ${v.slice(0, 20)}`).toBe(400);
      expect((await p.rawWins([makeWin('L2', { winId: v })])).status).toBe(400);
      expect((await p.rawWins([makeWin('L2', { cats: v })])).status).toBe(400);
      expect((await p.rawWins([makeWin('L2', { contentVersion: v })])).status).toBe(400);
      expect((await p.rawClaim(v)).status).toBe(400);
      expect((await p.rawHeart(v, 0)).status).toBe(400);
    }
    const s = await t.fetch('/v1/session', { method: 'POST', body: JSON.stringify({ platform: 'fb', playerId: "1' OR '1'='1", signature: 'a.b', nonce: "n1'--", clientVersion: '0.2.0', contentVersion: 'c' }) });
    expect(s.status).toBe(400);
    expect(t.count("SELECT COUNT(*) FROM sqlite_master WHERE name = 'wins'")).toBe(1);
    expect(t.count('SELECT COUNT(*) FROM wins')).toBe(0);
  });

  it('a token in the URL, a cookie or a body field is ignored: only the Authorization header counts', async () => {
    const t = makeTestApp();
    const p = await one(t);
    const r = await t.fetch(`/v1/bracket?token=${p.token}`, { headers: { cookie: `token=${p.token}` } });
    expect(r.status).toBe(401);
  });
});

describe('abuse: 50 concurrent joins into a bracket of 45', () => {
  it('exactly 50 members in it, the rest in new brackets, every win counted once', async () => {
    const t = makeTestApp();
    await playersWithWins(t, 45, 'base');
    const racers: TestPlayer[] = [];
    for (let i = 0; i < 50; i++) racers.push(await one(t, `racer${i}`));
    const res = await Promise.all(racers.map((p, i) => p.wins([makeWin(`L${200 + i}`)])));
    expect(res.every((r) => r.results[0]?.verdict === 'accepted')).toBe(true);
    const brackets = t.rows<{ id: string; members: number; real: number }>(
      'SELECT b.id, b.members, (SELECT COUNT(*) FROM members m WHERE m.bracket_id = b.id) AS real FROM brackets b',
    );
    const baseId = t.rows<{ bracket_id: string }>("SELECT m.bracket_id FROM members m JOIN players p ON p.key = m.player_key WHERE p.code = (SELECT code FROM players ORDER BY created_at, rowid LIMIT 1)")[0]?.bracket_id;
    expect(brackets.find((b) => b.id === baseId)).toMatchObject({ members: 50, real: 50 });
    for (const b of brackets) {
      expect(b.members).toBe(b.real);
      expect(b.real).toBeLessThanOrEqual(50);
      expect(b.real).toBeGreaterThan(0); // never an empty bracket
    }
    expect(brackets.reduce((s, b) => s + b.real, 0)).toBe(95);
    expect(t.count('SELECT COUNT(*) FROM wins')).toBe(95);
    expect(t.count('SELECT COUNT(*) FROM (SELECT player_key FROM members GROUP BY player_key HAVING COUNT(*) > 1)')).toBe(0);
    expect(t.count('SELECT COUNT(*) FROM members WHERE points = 0')).toBe(0);
    expect(DAY).toBeGreaterThan(0);
  });
});
