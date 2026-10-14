// Owner: G4 (Phase 2e). The main flow over HTTP (spec §1.3–§1.6, §10.2 "HTTP (Node)"): sign in, win, read
// the bracket, end it, get the result and claim — through app.fetch only.
import { describe, expect, it } from 'vitest';
import { parseBracketView, parseClaimResponse, parseSessionResponse, parseWinsResponse } from '../../src/contract';
import { DAY, HOUR, makeTestApp, makeWin, playersWithWins, TestPlayer } from '../helpers/harness';

describe('flow: session → wins → bracket → result → claim', () => {
  it('signs in, wins, joins a bracket and sees exactly its rows', async () => {
    const t = makeTestApp();
    const a = new TestPlayer(t, '1001');
    const s = await a.signIn();
    expect(parseSessionResponse(s)).toEqual(s);
    expect(s.player.pool).toBe('fb');
    expect(s.player.trust).toBe('signed');
    expect(s.bracket).toBeNull();
    expect(s.results).toEqual([]);
    expect(s.player.nickname).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ \d{1,2}$/);

    const w = await a.win('L2');
    expect(parseWinsResponse(w)).toEqual(w);
    expect(w.results).toEqual([{ winId: expect.any(String), verdict: 'accepted', points: 3 }]);
    expect(w.windowPoints).toBe(3);
    expect(w.bracket?.state).toBe('open');
    expect(w.bracket?.members).toBe(1);
    expect(w.bracket?.rows).toHaveLength(1);
    expect(w.bracket?.me?.rank).toBe(1);

    const b = new TestPlayer(t, '1002');
    await b.signIn();
    const wb = await b.win('L2', { fish: 2, mistakes: 1 });
    expect(wb.bracket?.bracketId).toBe(w.bracket?.bracketId);
    expect(wb.bracket?.rows.map((r) => [r.rank, r.points, r.me])).toEqual([
      [1, 3, false],
      [2, 2, true],
    ]);
    const view = await a.bracket();
    expect(parseBracketView(view)).toEqual(view);
    expect(view.rows.length).toBe(view.members);
  });

  it('a bracket of five ends, finalises lazily, pays the top places and claims once', async () => {
    const t = makeTestApp();
    const ps = await playersWithWins(t, 5);
    // more points for p0 (rank 1) and p1 (rank 2)
    await ps[0]?.win('L3');
    await ps[0]?.win('L4');
    await ps[1]?.win('L4');
    t.clock.advance(DAY + HOUR);
    for (const p of ps) await p.signIn(); // tokens last 24 h
    const v = await ps[0]!.bracket();
    expect(v.state).toBe('ended');
    expect(v.final).toBe(true);
    expect(v.result?.place).toBe(1);
    expect(v.result?.members).toBe(5);
    expect(v.result?.reward?.grant).toEqual({ hints: 3, kitties: 3 });
    const c = await ps[0]!.claim(v.result!.reward!.rewardId, true);
    expect(parseClaimResponse(c)).toEqual(c);
    expect(c).toMatchObject({ grant: { hints: 6, kitties: 6 }, doubled: true, alreadyClaimed: false, place: 1 });
    const again = await ps[0]!.claim(v.result!.reward!.rewardId, false);
    expect(again).toMatchObject({ grant: { hints: 6, kitties: 6 }, doubled: true, alreadyClaimed: true });
    // the next session lists the result with its claim
    const s = await ps[0]!.signIn();
    expect(s.results[0]?.reward?.claim?.doubled).toBe(true);
    // 4th and 5th place get no reward; 3rd gets 1 hint and 1 kitty (UI batch: the server's new amounts)
    const third = (await ps[2]!.bracket()).result;
    expect(third?.place).toBe(3);
    expect(third?.reward?.grant).toEqual({ hints: 1, kitties: 1 });
    expect((await ps[4]!.bracket()).result?.reward).toBeNull();
  });

  it('queued wins: a batch of 10 counts each once, oldest first', async () => {
    const t = makeTestApp();
    const a = new TestPlayer(t, '2001');
    await a.signIn();
    const wins = Array.from({ length: 10 }, (_, i) => makeWin(`L${i + 2}`));
    const r = await a.wins(wins);
    expect(r.results.map((x) => x.verdict)).toEqual(Array(10).fill('accepted'));
    expect(r.windowPoints).toBe(30);
    const again = await a.wins(wins);
    expect(again.results.map((x) => x.verdict)).toEqual(Array(10).fill('duplicate'));
    expect(again.windowPoints).toBe(30);
    expect(t.count('SELECT COUNT(*) FROM wins')).toBe(10);
  });
});
