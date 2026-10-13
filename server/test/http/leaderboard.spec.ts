// Leaderboard update (the Meowdoku-style leaderboard): the auto-join at sign-in (`join: true` on POST /v1/session)
// and the rows' activity (POST /v1/presence, BracketRow.seenAt / .playing). Every join rule of spec §1.5 still
// holds for a 0-fish join (one running bracket per player, one open bracket per pool, listed players only), and a
// 0-fish member is never paid (§1.6).
// 2026-10-13 (merge with the computer rivals): a bracket a sign-in opens gets computer players like one a win opens,
// and their rows carry an activity from their scripts (core/table.ts rivalActivity), frozen at ends_at when final; the
// rivals present at the opening each carry their own sighting from before it (review fix, core/rivals.ts openingSeenBefore).
import { describe, expect, it } from 'vitest';
import { parseBracketView, parseSessionResponse, type BracketView } from '../../src/contract';
import { RIVAL_TAG_RE } from '../../src/core/rivals';
import { RIVAL_PING_MS } from '../../src/core/table';
import { DAY, HOUR, makeTestApp, TestPlayer } from '../helpers/harness';

describe('auto-join at sign-in', () => {
  it('a session with join puts a listed player into a bracket at once, with 0 fish and a full countdown', async () => {
    const t = makeTestApp();
    const p = new TestPlayer(t, 'aj', { join: true });
    const s = await p.signIn();
    expect(s.bracket).toMatchObject({ state: 'open', rank: 1, members: 1, points: 0 });
    expect(s.bracket?.endsAt).toBe(t.clock.now() + DAY);
    const v = await p.bracket();
    expect(parseBracketView(v)).toEqual(v);
    expect(v.rows).toHaveLength(1);
    expect(v.me).toMatchObject({ rank: 1, points: 0, me: true, seenAt: t.clock.now(), playing: false });
    expect(t.count('SELECT COUNT(*) FROM members WHERE player_key = ?', p.key())).toBe(1);
  });

  it('later joiners share the bracket; a win adds to the same row (never a second one)', async () => {
    const t = makeTestApp();
    const a = new TestPlayer(t, 'aj-a', { join: true });
    const b = new TestPlayer(t, 'aj-b', { join: true });
    await a.signIn();
    t.clock.advance(60_000);
    await b.signIn();
    const w = await b.win('L5');
    expect(w.results[0]?.verdict).toBe('accepted');
    const v = await a.bracket();
    expect(v.members).toBe(2);
    expect(v.rows.map((r) => [r.rank, r.points, r.me])).toEqual([
      [1, 3, false],
      [2, 0, true],
    ]);
    expect(t.count('SELECT COUNT(*) FROM brackets')).toBe(1);
    expect(t.count('SELECT COUNT(*) FROM members WHERE player_key = ?', b.key())).toBe(1);
  });

  it('a second sign-in while the bracket runs joins nothing new; after the end it joins the next bracket', async () => {
    const t = makeTestApp();
    const p = new TestPlayer(t, 'aj-again', { join: true });
    const first = (await p.signIn()).bracket?.bracketId;
    await p.signIn();
    expect(t.count('SELECT COUNT(*) FROM members WHERE player_key = ?', p.key())).toBe(1);
    t.clock.advance(DAY + 60_000);
    const next = (await p.signIn()).bracket;
    expect(next?.state).toBe('open');
    expect(next?.bracketId).not.toBe(first);
    expect(t.count('SELECT COUNT(*) FROM members WHERE player_key = ?', p.key())).toBe(2);
  });

  it('never without the flag, for a player who is not listed, or with bracket.joinOnSession off', async () => {
    const t = makeTestApp();
    const old = new TestPlayer(t, 'aj-old');
    expect((await old.signIn()).bracket).toBeNull();
    const off = new TestPlayer(t, 'aj-off', { join: true });
    await off.signIn();
    await off.profile({ listed: false });
    t.clock.advance(DAY + 60_000);
    // The ended bracket stays readable for a day (its hidden row); no new one is joined.
    expect((await off.signIn()).bracket?.state).toBe('ended');
    expect(t.count('SELECT COUNT(*) FROM members WHERE player_key = ?', off.key())).toBe(1);
    expect(t.count('SELECT COUNT(*) FROM members WHERE player_key = ? AND hidden = 0', off.key())).toBe(0);

    const t2 = makeTestApp({ overrides: { bracket: { joinOnSession: false } } });
    const q = new TestPlayer(t2, 'aj-cfg', { join: true });
    expect((await q.signIn()).bracket).toBeNull();
    expect(t2.count('SELECT COUNT(*) FROM members')).toBe(0);
  });

  it('a bad join value is a 400', async () => {
    const t = makeTestApp();
    const p = new TestPlayer(t, 'aj-bad');
    const n = (await (await t.fetch('/v1/session/nonce', { method: 'POST', body: '{}' })).json()) as { nonce: string };
    const r = await t.fetch('/v1/session', {
      method: 'POST',
      body: JSON.stringify({ platform: 'web', device: p.device, clientVersion: '0.2.0', contentVersion: 'x', join: 'yes', nonce: n.nonce }),
    });
    expect(r.status).toBe(400);
  });

  it('concurrent sign-ins of new players in an empty pool open ONE bracket', async () => {
    const t = makeTestApp();
    const ps = Array.from({ length: 8 }, (_, i) => new TestPlayer(t, `aj-race${i}`, { join: true }));
    await Promise.all(ps.map((p) => p.signIn()));
    expect(t.count('SELECT COUNT(*) FROM brackets')).toBe(1);
    expect(t.count('SELECT COUNT(*) FROM members')).toBe(8);
  });

  it('a 0-fish member is never paid', async () => {
    const t = makeTestApp();
    const ps = Array.from({ length: 5 }, (_, i) => new TestPlayer(t, `aj-pay${i}`, { join: true }));
    for (const p of ps) await p.signIn();
    await ps[3]!.win('L9');
    t.clock.advance(DAY + 60_000);
    await t.app.scheduled();
    expect(t.rows<{ place: number; player_key: string }>('SELECT place, player_key FROM rewards')).toEqual([{ place: 1, player_key: ps[3]!.key() }]);
  });
});

describe('presence', () => {
  it('my pings set my row; the others see seenAt and playing; a counted win is online again', async () => {
    const t = makeTestApp();
    const a = new TestPlayer(t, 'pr-a', { join: true });
    const b = new TestPlayer(t, 'pr-b', { join: true });
    await a.signIn();
    await b.signIn();
    const joinedAt = t.clock.now();
    t.clock.advance(90_000);
    expect(await b.presence('playing')).toEqual({ updated: true, serverTime: t.clock.now() });
    let row = (await a.bracket()).rows.find((r) => !r.me);
    expect(row).toMatchObject({ seenAt: t.clock.now(), playing: true });
    expect((await a.bracket()).me).toMatchObject({ seenAt: joinedAt, playing: false });
    t.clock.advance(120_000);
    await b.win('L7');
    row = (await a.bracket()).rows.find((r) => !r.me);
    expect(row).toMatchObject({ seenAt: t.clock.now(), playing: false, points: 3 });
    t.clock.advance(60_000);
    await a.signIn(); // a sign-in is "online" on my running bracket
    expect((await b.bracket()).rows.find((r) => !r.me)).toMatchObject({ seenAt: t.clock.now(), playing: false });
  });

  it('nothing to update without a running bracket; a bad state is a 400; presence off sends no activity', async () => {
    const t = makeTestApp();
    const p = new TestPlayer(t, 'pr-none');
    await p.signIn();
    expect((await p.presence('online')).updated).toBe(false);
    expect((await p.rawPresence('dancing')).status).toBe(400);

    const t2 = makeTestApp({ overrides: { presence: { enabled: false } } });
    const q = new TestPlayer(t2, 'pr-off', { join: true });
    await q.signIn();
    expect((await q.presence('playing')).updated).toBe(false);
    expect((await q.bracket()).me).toMatchObject({ seenAt: null, playing: false });
  });
});

describe('auto-join and activity with computer players (2026-10-13, merge)', () => {
  const rivalsOf = (v: BracketView): BracketView['rows'] => v.rows.filter((r) => r.slot >= 9000);

  it('a sign-in that opens a bracket tags it like a win does: computer players at once, my 0-fish row last, the disclosure', async () => {
    const t = makeTestApp({ env: { RIVALS: 'on' } });
    const p = new TestPlayer(t, 'ajr', { join: true });
    const s = await p.signIn();
    expect(parseSessionResponse(s)).toEqual(s);
    expect(s.rules.computerPlayers).toBe(true);
    const tags = t.rows<{ rivals: string | null }>('SELECT rivals FROM brackets');
    expect(tags).toHaveLength(1);
    expect(tags[0]?.rivals).toMatch(RIVAL_TAG_RE);
    expect(tags[0]?.rivals?.startsWith('r2:')).toBe(true);
    const v = await p.bracket();
    expect(parseBracketView(v)).toEqual(v);
    expect(rivalsOf(v).length).toBeGreaterThanOrEqual(8); // the opening group
    expect(v.members).toBe(v.rows.length);
    expect(v.me).toMatchObject({ points: 0, rank: v.members, seenAt: t.clock.now(), playing: false });
    expect(s.bracket).toMatchObject({ rank: v.members, members: v.members, points: 0 });
    // Without RIVALS the same sign-in opens an untagged bracket (exactly the leaderboard update's behaviour).
    const off = makeTestApp();
    await new TestPlayer(off, 'ajr-off', { join: true }).signIn();
    expect(off.rows<{ rivals: string | null }>('SELECT rivals FROM brackets')).toEqual([{ rivals: null }]);
  });

  it('rival rows carry seenAt ≤ serverTime and playing (at most a ping old while playing); some play and some do not over the day; frozen at ends_at once final', async () => {
    const t = makeTestApp({ env: { RIVALS: 'on' } });
    const p = new TestPlayer(t, 'ajr-act', { join: true });
    await p.signIn();
    let playing = 0,
      away = 0;
    for (let h = 0; h < 24; h++) {
      const v = await p.bracket();
      for (const r of rivalsOf(v)) {
        expect(Number.isInteger(r.seenAt)).toBe(true);
        expect(r.seenAt as number).toBeLessThanOrEqual(v.serverTime);
        // 2026-10-13 (review): the opening group may still show its sighting from before the opening (openingSeenBefore, < 20 h).
        expect(r.seenAt as number).toBeGreaterThan((v.openedAt as number) - 20 * HOUR);
        if (r.playing) {
          playing++;
          expect(v.serverTime - (r.seenAt as number)).toBeLessThan(RIVAL_PING_MS);
        } else away++;
      }
      t.clock.advance(HOUR - 7 * 60_000);
      if (h === 12) await p.signIn(); // a fresh token (sessions last a day); the bracket still runs, so no new join
    }
    expect(playing).toBeGreaterThan(0);
    expect(away).toBeGreaterThan(playing);
    const endsAt = (await p.bracket()).endsAt as number;
    t.clock.set(endsAt); // ended, not final yet (the finalising grace): the table at ends_at
    const atEnd = await p.bracket();
    expect([atEnd.state, atEnd.final]).toEqual(['ended', false]);
    t.clock.advance(HOUR);
    const final = await p.bracket();
    expect(final.final).toBe(true);
    const act = (v: BracketView): [number, number | null, boolean][] => rivalsOf(v).map((r) => [r.slot, r.seenAt, r.playing]);
    expect(act(final)).toEqual(act(atEnd));
    expect(final.me).toMatchObject({ points: 0, rank: final.members });
    // A 0-fish member is never paid, computer players or not.
    expect(t.count('SELECT COUNT(*) FROM rewards')).toBe(0);
  });

  it('the computer players present when a sign-in opens the bracket do not share one status (review)', async () => {
    const t = makeTestApp({ env: { RIVALS: 'on' } });
    const p = new TestPlayer(t, 'coh', { join: true });
    await p.signIn();
    const t0 = t.clock.now();
    const first = await p.bracket();
    expect(first.openedAt).toBe(t0);
    const opening = new Set(rivalsOf(first).map((r) => r.slot));
    expect(opening.size).toBeGreaterThanOrEqual(8);
    // Before the fix every one of them was "Playing now" at the first view, seen at my own sign-in time, then all
    // "Online now" together and the same "Nm ago" for hours. Now: a mix at once, and no two seen at the same ms.
    expect(rivalsOf(first).filter((r) => r.seenAt === t0)).toEqual([]);
    expect(rivalsOf(first).some((r) => !r.playing)).toBe(true);
    for (const dt of [0, 60_000, 150_000, 5 * 60_000, 20 * 60_000, HOUR]) {
      t.clock.set(t0 + dt);
      const v = await p.bracket();
      const seen = rivalsOf(v).filter((r) => opening.has(r.slot)).map((r) => r.seenAt as number);
      expect(seen.length, `+${dt} ms`).toBe(opening.size);
      expect(new Set(seen).size, `+${dt} ms: no two share a seenAt`).toBe(seen.length);
      expect(seen.every((x) => x <= v.serverTime)).toBe(true);
    }
  });

  it('presence off: no activity on any row, computer players included', async () => {
    const t = makeTestApp({ env: { RIVALS: 'on' }, overrides: { presence: { enabled: false } } });
    const p = new TestPlayer(t, 'ajr-off', { join: true });
    await p.signIn();
    t.clock.advance(3 * HOUR);
    const v = await p.bracket();
    expect(rivalsOf(v).length).toBeGreaterThan(0);
    expect(v.rows.every((r) => r.seenAt === null && r.playing === false)).toBe(true);
  });
});
