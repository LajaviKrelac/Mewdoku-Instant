// Owner: G4 (Phase 2e). Rewards (§1.6), hearts (§1.7) and the profile (§1.8, §2.7) over HTTP: claim once,
// double once, expiry, another player's reward, voided after a suspension; hearts once per pair, own row
// once, the cap of 20 (also under a 21-heart race), hidden rows, non-members, heartsNew; names, cooldown,
// avatars, "Show me in rankings".
import { describe, expect, it } from 'vitest';
import { parseHeartResponse, parseProfileResponse } from '../../src/contract';
import { NICK_WORDS_V1 } from '../../src/contract/words';
import { admin, DAY, HOUR, json, makeTestApp, playersWithWins, TestPlayer } from '../helpers/harness';

async function endedFive(t: ReturnType<typeof makeTestApp>): Promise<TestPlayer[]> {
  const ps = await playersWithWins(t, 5, 'r');
  await ps[0]!.win('L40');
  await ps[0]!.win('L41');
  await ps[1]!.win('L42');
  t.clock.advance(DAY + HOUR);
  for (const p of ps) await p.signIn();
  return ps;
}

describe('rewards (§1.6)', () => {
  it('claim once; ×2 once; a retry returns the stored claim; another player\'s reward is 404', async () => {
    const t = makeTestApp();
    const ps = await endedFive(t);
    const r1 = ps[0]!.session!.results[0]!.reward!;
    expect(r1).toMatchObject({ place: 1, grant: { hints: 2, kitties: 2 }, canDouble: true, claim: null });
    expect(await ps[0]!.claim(r1.rewardId, false)).toMatchObject({ grant: { hints: 2, kitties: 2 }, doubled: false, alreadyClaimed: false });
    // a later ×2 after a plain claim does not double: the stored claim stands
    expect(await ps[0]!.claim(r1.rewardId, true)).toMatchObject({ grant: { hints: 2, kitties: 2 }, doubled: false, alreadyClaimed: true });
    const theft = await ps[1]!.rawClaim(r1.rewardId, true);
    expect(theft.status).toBe(404);
    const second = ps[1]!.session!.results[0]!.reward!;
    expect(second.place).toBe(2);
    const [a, b] = await Promise.all([ps[1]!.claim(second.rewardId, true), ps[1]!.claim(second.rewardId, true)]);
    expect([a.alreadyClaimed, b.alreadyClaimed].sort()).toEqual([false, true]);
    expect(a.grant).toEqual({ hints: 2, kitties: 2 });
    expect(t.rows<{ doubled: number }>('SELECT doubled FROM rewards WHERE id = ?', second.rewardId)[0]?.doubled).toBe(1);
  });

  it('expires after 7 days; a suspension voids it; ×2 is off when the rules say so', async () => {
    const t = makeTestApp();
    const ps = await endedFive(t);
    const rid = ps[2]!.session!.results[0]!.reward!.rewardId;
    t.clock.advance(7 * DAY + HOUR);
    await ps[2]!.signIn();
    expect((await ps[2]!.rawClaim(rid)).status).toBe(404);
    expect(ps[2]!.session!.results).toEqual([]); // past the claim window: no card

    const t2 = makeTestApp();
    const qs = await endedFive(t2);
    const rid2 = qs[0]!.session!.results[0]!.reward!.rewardId;
    await admin(t2, 'POST', `players/${qs[0]!.code()}/suspend`);
    expect(t2.rows<{ voided: number }>('SELECT voided FROM rewards WHERE id = ?', rid2)[0]?.voided).toBe(1);
    await admin(t2, 'POST', `players/${qs[0]!.code()}/reinstate`);
    await qs[0]!.signIn();
    expect(qs[0]!.session!.results[0]?.reward).toBeNull();
    expect((await qs[0]!.rawClaim(rid2)).status).toBe(404);

    const t3 = makeTestApp({ overrides: { rewards: { doubleByVideo: false } } });
    const rs = await endedFive(t3);
    const r = rs[0]!.session!;
    expect(r.rules.doubleByVideo).toBe(false);
    expect(r.results[0]?.reward?.canDouble).toBe(false);
    expect(await rs[0]!.claim(r.results[0]!.reward!.rewardId, true)).toMatchObject({ doubled: false, grant: { hints: 2, kitties: 2 } });
  });

  it('refinalize after a removal pays a place that became eligible inside the window; claimed rewards stay', async () => {
    const t = makeTestApp();
    const ps = await playersWithWins(t, 6, 'rf');
    await ps[0]!.win('L50');
    await ps[0]!.win('L51');
    t.clock.advance(DAY + HOUR);
    for (const p of ps) await p.signIn();
    const view = await ps[0]!.bracket();
    const rid1 = view.result!.reward!.rewardId;
    await ps[0]!.claim(rid1);
    const fourth = view.rows.find((r) => r.rank === 4)!;
    const third = view.rows.find((r) => r.rank === 3)!;
    const thirdPlayer = ps.find((p) => p.session!.player.nickname === third.nickname)!;
    await admin(t, 'POST', `players/${thirdPlayer.code()}/suspend`);
    const r = await admin(t, 'POST', `brackets/${view.bracketId!}/refinalize`);
    expect(r.status).toBe(200);
    const fourthPlayer = ps.find((p) => p.session!.player.nickname === fourth.nickname)!;
    await fourthPlayer.signIn();
    expect(fourthPlayer.session!.results[0]).toMatchObject({ place: 3, members: 5 });
    expect(fourthPlayer.session!.results[0]?.reward?.place).toBe(3);
    expect(t.rows<{ claimed_at: number | null }>('SELECT claimed_at FROM rewards WHERE id = ?', rid1)[0]?.claimed_at).not.toBeNull();
  });
});

describe('hearts (§1.7)', () => {
  it('once per pair, own row once, no reward; heartsNew counts others only and is seen once', async () => {
    const t = makeTestApp();
    const [a, b] = await playersWithWins(t, 2, 'h');
    const v = await a!.bracket();
    const id = v.bracketId!;
    const bSlot = v.rows.find((r) => !r.me)!.slot;
    const aSlot = v.me!.slot;
    const h = await a!.heart(id, bSlot);
    expect(parseHeartResponse(h)).toEqual(h);
    expect(h).toMatchObject({ hearts: 1, likedByMe: true, givenInBracket: 1 });
    const again = await a!.rawHeart(id, bSlot);
    expect(again.status).toBe(409);
    expect((await json(again)).error).toMatchObject({ code: 'heart_exists' });
    expect((await a!.heart(id, aSlot)).hearts).toBe(1); // own row once
    expect((await a!.rawHeart(id, aSlot)).status).toBe(409);
    await b!.heart(id, aSlot);
    const va = await a!.bracket();
    expect(va.heartsNew).toBe(1); // b's heart, not my own
    expect(va.rows.find((r) => r.slot === bSlot)?.likedByMe).toBe(true);
    expect((await a!.bracket()).heartsNew).toBe(0);
    const vb = await b!.bracket();
    expect(vb.heartsNew).toBe(1);
    expect(vb.me?.hearts).toBe(1);
  });

  it('non-members, hidden rows, bad slots and closed brackets', async () => {
    const t = makeTestApp();
    const [a, b] = await playersWithWins(t, 2, 'n');
    const id = (await a!.bracket()).bracketId!;
    const outsider = new TestPlayer(t, 'outsider');
    await outsider.signIn();
    const r = await outsider.rawHeart(id, 0);
    expect(r.status).toBe(403);
    expect((await json(r)).error).toMatchObject({ code: 'not_member' });
    await b!.profile({ listed: false });
    const bSlot = t.rows<{ slot: number }>('SELECT slot FROM members WHERE player_key = ?', b!.key())[0]!.slot;
    expect((await a!.rawHeart(id, bSlot)).status).toBe(404);
    expect((await a!.rawHeart(id, 99)).status).toBe(404);
    expect((await a!.rawHeart('zzzzzzzzzzzz', 0)).status).toBe(404);
    t.clock.advance(2 * DAY);
    await a!.signIn();
    expect((await a!.rawHeart(id, 0)).status).toBe(404);
  });

  it('the cap: 20 per bracket; 21 concurrent hearts store exactly 20', async () => {
    const t = makeTestApp();
    const ps = await playersWithWins(t, 23, 'c');
    const giver = ps[0]!;
    const view = await giver.bracket();
    const targets = view.rows.map((r) => r.slot).slice(0, 21);
    const res = await Promise.all(targets.map((slot) => giver.rawHeart(view.bracketId!, slot)));
    const ok = res.filter((r) => r.status === 200).length;
    expect(ok).toBe(20);
    expect(t.count('SELECT COUNT(*) FROM hearts WHERE from_slot = ?', view.me!.slot)).toBe(20);
    expect(t.count('SELECT SUM(hearts) FROM members')).toBe(20);
    const codes = await Promise.all(res.filter((r) => r.status !== 200).map(async (r) => (await json(r)).error));
    expect(codes).toEqual([expect.objectContaining({ code: 'heart_limit' })]);
  });
});

describe('profile (§1.8, §2.7)', () => {
  it('a word pick: the first change is free, then once a day; copied to my open rows', async () => {
    const t = makeTestApp();
    const [a, b] = await playersWithWins(t, 2, 'nm');
    const p = await a!.profile({ nickname: { adj: 7, noun: 12, num: 3 }, avatarId: 9 });
    expect(parseProfileResponse(p)).toEqual(p);
    expect(p.player).toMatchObject({ nickname: `${NICK_WORDS_V1.adj[7]} ${NICK_WORDS_V1.noun[12]} 3`, avatarId: 9, nick: { adj: 7, noun: 12, num: 3 } });
    expect(p.player.nicknameChangeAt).toBe(t.clock.now() + DAY);
    const row = (await b!.bracket()).rows.find((r) => !r.me)!;
    expect([row.nickname, row.avatarId]).toEqual([p.player.nickname, 9]);
    const again = await a!.rawProfile({ nickname: { adj: 1, noun: 1, num: 1 } });
    expect(again.status).toBe(409);
    const err = (await json(again)).error as { code: string; retryAfterMs: number };
    expect(err.code).toBe('nickname_cooldown');
    expect(err.retryAfterMs).toBe(DAY);
    // the avatar alone has no cooldown; the same name again is not a change
    expect((await a!.profile({ avatarId: 2 })).player.avatarId).toBe(2);
    expect((await a!.rawProfile({ nickname: { adj: 7, noun: 12, num: 3 } })).status).toBe(200);
    t.clock.advance(DAY);
    await a!.signIn();
    expect((await a!.rawProfile({ nickname: { adj: 1, noun: 1 } })).status).toBe(200);
  });

  it('422s: unknown words, numbers out of range, avatars past AVATAR_COUNT, free text while off', async () => {
    const t = makeTestApp();
    const a = new TestPlayer(t, 'bad');
    await a.signIn();
    const code = async (body: Record<string, unknown>): Promise<unknown> => (await json(await a.rawProfile(body))).error;
    expect(await code({ nickname: { adj: 9999, noun: 1 } })).toMatchObject({ code: 'nickname_invalid' });
    expect(await code({ nickname: { adj: 1, noun: 1, num: 100 } })).toMatchObject({ code: 'nickname_invalid' });
    expect(await code({ avatarId: 12 })).toMatchObject({ code: 'avatar_invalid' });
    expect(await code({ nickname: { text: 'Kitty' } })).toMatchObject({ code: 'nickname_invalid' });
    expect(await code({})).toMatchObject({ code: 'bad_request' });
  });

  it('free text when switched on: moderated, a blocked name flagged', async () => {
    const t = makeTestApp({ overrides: { nickname: { freeText: true } } });
    const a = new TestPlayer(t, 'ft');
    await a.signIn();
    expect((await a.profile({ nickname: { text: 'Gato Feliz' } })).player).toMatchObject({ nickname: 'Gato Feliz', nick: null });
    t.clock.advance(DAY);
    await a.signIn();
    const r = await a.rawProfile({ nickname: { text: 'Sh1t Cat' } });
    expect((await json(r)).error).toMatchObject({ code: 'nickname_blocked' });
    expect(t.rows<{ kind: string }>('SELECT kind FROM flags')).toEqual([{ kind: 'nickname_blocked' }]);
  });

  it('listed off hides my open rows and refuses wins; on again shows them', async () => {
    const t = makeTestApp();
    const [a, b] = await playersWithWins(t, 2, 'ls');
    expect((await a!.profile({ listed: false })).player.listed).toBe(false);
    expect((await b!.bracket()).rows).toHaveLength(1);
    expect((await a!.win('L60')).results[0]).toMatchObject({ verdict: 'rejected', reason: 'unlisted' });
    expect((await a!.profile({ listed: true })).player.listed).toBe(true);
    expect((await b!.bracket()).rows).toHaveLength(2);
  });
});
