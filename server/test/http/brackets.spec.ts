// Owner: G4 (Phase 2e). Brackets over HTTP (spec §1.5, critic C-9, C-10, C-11, C-19; §10.2, §10.4):
// assignment and capacity, the join window, concurrent joins (exactly 50, every win once, never a win row
// without a member row), slot reuse after a deletion, the hidden bits, both period modes, finalisation
// (ties, minMembers, hidden members, idempotent) and the honesty rule rows.length === members.
import { describe, expect, it } from 'vitest';
import { parseBracketView } from '../../src/contract';
import { admin, DAY, HOUR, makeTestApp, makeWin, playersWithWins, TestPlayer } from '../helpers/harness';

async function signedIn(t: ReturnType<typeof makeTestApp>, n: number, prefix: string): Promise<TestPlayer[]> {
  const out: TestPlayer[] = [];
  for (let i = 0; i < n; i++) {
    const p = new TestPlayer(t, `${prefix}${i}`);
    await p.signIn();
    out.push(p);
  }
  return out;
}

describe('assignment and capacity', () => {
  it('fills to 50; the 51st opens a new bracket; players who only open the game get no row', async () => {
    const t = makeTestApp();
    const ps = await playersWithWins(t, 51, 'f');
    const ids = new Set(t.rows<{ id: string }>('SELECT id FROM brackets').map((r) => r.id));
    expect(ids.size).toBe(2);
    expect(t.rows<{ members: number }>('SELECT members FROM brackets ORDER BY opened_at').map((r) => r.members)).toEqual([50, 1]);
    const v = await ps[0]!.bracket();
    expect(v.rows).toHaveLength(50);
    expect(v.members).toBe(50);
    expect(parseBracketView(v)).toEqual(v);
    const idle = new TestPlayer(t, 'idle');
    await idle.signIn();
    expect(t.count('SELECT COUNT(*) FROM members WHERE player_key = ?', idle.key())).toBe(0);
    expect((await idle.bracket()).state).toBe('none');
  });

  it('after the 2 h join window a newcomer opens a new bracket; the sparse one shows exactly its members', async () => {
    const t = makeTestApp();
    const [a] = await playersWithWins(t, 1, 'w');
    t.clock.advance(2 * HOUR);
    const [b] = await playersWithWins(t, 1, 'v');
    expect((await a!.bracket()).bracketId).not.toBe((await b!.bracket()).bracketId);
    const va = await a!.bracket();
    expect(va.rows).toHaveLength(1);
    expect(va.members).toBe(1);
  });

  it('a win queued across the end counts in the next bracket (server time decides)', async () => {
    const t = makeTestApp();
    const [a] = await playersWithWins(t, 1, 'q');
    const first = (await a!.bracket()).bracketId;
    t.clock.advance(DAY + 60_000);
    await a!.signIn();
    const w = await a!.wins([makeWin('L20', { playedAt: t.clock.now() - 2 * HOUR })]);
    expect(w.results[0]?.verdict).toBe('accepted');
    expect(w.bracket?.bracketId).not.toBe(first);
    expect(w.windowPoints).toBe(3);
  });

  it('50 concurrent first wins into a bracket of 45: exactly 50 members, the rest in a new bracket, each win once', async () => {
    const t = makeTestApp();
    await playersWithWins(t, 45, 'base');
    const racers = await signedIn(t, 10, 'race');
    const results = await Promise.all(racers.map((p, i) => p.wins([makeWin(`L${100 + i}`)])));
    expect(results.every((r) => r.results[0]?.verdict === 'accepted')).toBe(true);
    const counts = t.rows<{ members: number; real: number }>('SELECT b.members, (SELECT COUNT(*) FROM members m WHERE m.bracket_id = b.id) AS real FROM brackets b ORDER BY b.opened_at');
    expect(counts[0]).toEqual({ members: 50, real: 50 });
    expect(counts.reduce((s, c) => s + c.real, 0)).toBe(55);
    expect(t.count('SELECT COUNT(*) FROM wins')).toBe(55);
    // never a win row without its member row (C-9)
    expect(t.count('SELECT COUNT(*) FROM wins w WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m.bracket_id = w.bracket_id AND m.player_key = w.player_key)')).toBe(0);
    // points = the sum of the counted wins, per member
    expect(t.count('SELECT COUNT(*) FROM members m WHERE m.points <> (SELECT COALESCE(SUM(points), 0) FROM wins w WHERE w.player_key = m.player_key AND w.bracket_id = m.bracket_id)')).toBe(0);
  });

  it('the same player racing itself: one join, every win counted once', async () => {
    const t = makeTestApp();
    const [a] = await signedIn(t, 1, 'self');
    const res = await Promise.all([a!.wins([makeWin('L2')]), a!.wins([makeWin('L3')]), a!.wins([makeWin('L4')])]);
    expect(res.flatMap((r) => r.results.map((x) => x.verdict)).filter((v) => v === 'accepted')).toHaveLength(3);
    expect(t.count('SELECT COUNT(*) FROM members')).toBe(1);
    expect(t.rows<{ points: number }>('SELECT points FROM members')[0]?.points).toBe(9);
  });

  it('the same win twice at once is counted once', async () => {
    const t = makeTestApp();
    const [a] = await signedIn(t, 1, 'dup');
    const w = makeWin('L2');
    const [r1, r2] = await Promise.all([a!.wins([w]), a!.wins([w])]);
    const verdicts = [r1.results[0]?.verdict, r2.results[0]?.verdict].sort();
    expect(verdicts).toEqual(['accepted', 'duplicate']);
    expect(t.rows<{ points: number }>('SELECT points FROM members')[0]?.points).toBe(3);
  });
});

describe('slots, hidden rows, deletion (C-10, C-11)', () => {
  it('after slot 1 of 3 is deleted the next joiner gets slot 3 and none of slot 1\'s hearts', async () => {
    const t = makeTestApp();
    const [a, b, c] = await playersWithWins(t, 3, 's');
    const id = (await a!.bracket()).bracketId!;
    await a!.heart(id, 1);
    expect((await b!.rawMe('DELETE')).status).toBe(204);
    const [d] = await playersWithWins(t, 1, 'late', 50);
    const v = await d!.bracket();
    expect(v.bracketId).toBe(id);
    expect(v.me?.slot).toBe(3);
    expect(v.me?.hearts).toBe(0);
    expect(v.rows.map((r) => r.slot).sort()).toEqual([0, 2, 3]);
    expect(t.count('SELECT COUNT(*) FROM hearts')).toBe(0);
    expect(c).toBeDefined();
  });

  it('suspend + unlist + reinstate keeps the row hidden; listed on after a suspension keeps it hidden', async () => {
    const t = makeTestApp();
    const [a, b] = await playersWithWins(t, 2, 'h');
    const rowsOf = async (): Promise<number> => (await b!.bracket()).rows.length;
    expect(await rowsOf()).toBe(2);
    await a!.profile({ listed: false });
    expect(await rowsOf()).toBe(1);
    expect((await admin(t, 'POST', `players/${a!.code()}/suspend`)).status).toBe(200);
    expect(await rowsOf()).toBe(1);
    expect(t.rows<{ hidden: number }>('SELECT hidden FROM members WHERE player_key = ?', a!.key())[0]?.hidden).toBe(3);
    expect((await admin(t, 'POST', `players/${a!.code()}/reinstate`)).status).toBe(200);
    expect(await rowsOf()).toBe(1); // still opted out
    await a!.profile({ listed: true });
    expect(await rowsOf()).toBe(2);
    // the other order: suspended, then listed on → still hidden
    await a!.profile({ listed: false });
    await admin(t, 'POST', `players/${a!.code()}/suspend`);
    expect((await a!.rawProfile({ listed: true })).status).toBe(403); // suspended players are told, not served
    expect(await rowsOf()).toBe(1);
  });

  it('an unlisted player\'s wins are rejected quietly and never join', async () => {
    const t = makeTestApp();
    const a = new TestPlayer(t, 'u');
    await a.signIn();
    await a.profile({ listed: false });
    const r = await a.win('L2');
    expect(r.results[0]).toMatchObject({ verdict: 'rejected', reason: 'unlisted', points: 0 });
    expect(r.bracket).toBeNull();
    expect(t.count('SELECT COUNT(*) FROM members')).toBe(0);
  });
});

describe('finalisation (§1.5, §1.6)', () => {
  it('ties go to who reached the total first; ranks are frozen; idempotent; members = final_members', async () => {
    const t = makeTestApp();
    const ps = await playersWithWins(t, 6, 'tie');
    // p5 reaches 6 first, then p4 reaches 6: p5 ranks above p4
    await ps[5]!.win('L30');
    t.clock.advance(1000);
    await ps[4]!.win('L31');
    t.clock.advance(DAY + HOUR);
    await ps[0]!.signIn();
    const v = await ps[0]!.bracket();
    expect(v.final).toBe(true);
    expect(v.rows.slice(0, 2).map((r) => r.nickname)).toEqual([(await ps[5]!.signIn()).player.nickname, (await ps[4]!.signIn()).player.nickname]);
    const finalized = t.rows<{ finalized_at: number; final_members: number }>('SELECT finalized_at, final_members FROM brackets')[0];
    expect(finalized?.final_members).toBe(6);
    // a second finaliser changes nothing
    t.clock.advance(HOUR);
    await t.app.scheduled();
    expect(t.rows<{ finalized_at: number }>('SELECT finalized_at FROM brackets')[0]?.finalized_at).toBe(finalized?.finalized_at);
    expect(t.count('SELECT COUNT(*) FROM rewards')).toBe(3);
  });

  it('too few members: ranks but no rewards; hidden members are not ranked', async () => {
    const t = makeTestApp();
    const ps = await playersWithWins(t, 5, 'few');
    await ps[4]!.profile({ listed: false }); // 4 visible
    t.clock.advance(DAY + HOUR);
    await t.app.scheduled();
    expect(t.count('SELECT COUNT(*) FROM rewards')).toBe(0);
    expect(t.rows<{ final_members: number }>('SELECT final_members FROM brackets')[0]?.final_members).toBe(4);
    expect(t.rows<{ final_rank: number | null }>('SELECT final_rank FROM members WHERE player_key = ?', ps[4]!.key())[0]?.final_rank).toBeNull();
    await ps[0]!.signIn();
    const s = ps[0]!.session!;
    expect(s.results).toHaveLength(1);
    expect(s.results[0]).toMatchObject({ members: 4, reward: null });
  });

  it('a deletion after the end keeps past ranks and the count (an honest gap)', async () => {
    const t = makeTestApp();
    const ps = await playersWithWins(t, 5, 'gap');
    t.clock.advance(DAY + HOUR);
    for (const p of ps) await p.signIn();
    const before = await ps[0]!.bracket();
    expect(before.members).toBe(5);
    const second = before.rows.find((r) => r.rank === 2)!;
    const victim = ps.find((p) => p.session!.player.nickname === second.nickname)!;
    await victim.rawMe('DELETE');
    const after = await ps.find((p) => p !== victim)!.bracket();
    expect(after.members).toBe(5);
    expect(after.rows.map((r) => r.rank)).toEqual(before.rows.map((r) => r.rank).filter((r) => r !== 2));
    expect(parseBracketView(after)).not.toBeNull();
  });

  it('the ended view lasts 24 h, then state none', async () => {
    const t = makeTestApp();
    const [a] = await playersWithWins(t, 1, 'end');
    t.clock.advance(DAY + HOUR);
    await a!.signIn();
    expect((await a!.bracket()).state).toBe('ended');
    t.clock.advance(DAY);
    await a!.signIn();
    expect((await a!.bracket()).state).toBe('none');
  });
});

describe('period mode utc_day (PERIOD_MODE)', () => {
  it('brackets end at 00:00 UTC and a late opener runs to the next day', async () => {
    const t = makeTestApp({ env: { PERIOD_MODE: 'utc_day' } });
    const [a] = await playersWithWins(t, 1, 'utc');
    const v = await a!.bracket();
    expect(v.mode).toBe('utc_day');
    expect(v.endsAt).toBe(Date.parse('2026-11-16T00:00:00Z'));
    t.clock.set(Date.parse('2026-11-15T22:30:00Z'));
    const [b] = await playersWithWins(t, 1, 'late', 60);
    expect((await b!.bracket()).endsAt).toBe(Date.parse('2026-11-17T00:00:00Z'));
  });
});
