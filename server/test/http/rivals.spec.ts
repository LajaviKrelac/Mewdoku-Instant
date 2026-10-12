// Owner: G4 (Phase 2e). Computer rivals through the public API (2026-10-12, D-2e-24, user decision U-e; design
// §12.1, §12.3): the tag at creation, the rows / members / ranks a player sees, a lone player's ≈ 46–50 rows,
// real joins retiring only the lowest computer row, hearts on rival rows, rivals never paid, the frozen final
// snapshot equal to the live table at ends_at, the switches (RIVALS, hide, disclose, pools, strength, the
// scoring and production guards), test pools (/dev/rivals), the admin bracket route and the cron stats. Every
// view the server answers here also goes through the shared parser (the client's contract).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEV_DEFAULTS, devEnv } from '../../dev/serve';
import { createApp } from '../../src/app';
import { parseBracketView, parseHeartResponse, parseSessionResponse, type BracketView, type SessionResponse } from '../../src/contract';
import { NICK_WORDS_V1 } from '../../src/contract/words';
import { seededRng, type Rng } from '../../src/core/crypto';
import { decodeFinalRivals, isRivalSlot, liveRivalCount, RIVAL_TAG_RE, rivalRoster, type Roster } from '../../src/core/rivals';
import type { AppEnv, LogLine, Metrics } from '../../src/services';
import type { BracketRow } from '../../src/store/rows';
import { admin, DAY, HOUR, json, makeTestApp, makeWin, playersWithWins, RecordingDb, SERVER_DIR, T0, TEST_ENV, TestPlayer, WIDE_LIMITS, type TestApp } from '../helpers/harness';

const MIN = 60_000;
const ON: Partial<AppEnv> = { RIVALS: 'on' };
/** Design §12.3: no reward id may name a slot of 1000 or more (a rival's 9000+ never fits REWARD_ID_RE). */
const BIG_SLOT_REWARDS = "SELECT COUNT(*) FROM rewards WHERE CAST(substr(id, instr(id, ':') + 1) AS INTEGER) >= 1000";

// ── helpers ───────────────────────────────────────────────────────────────────────────────────────────────

/** Counts every metric call (and the summed values) by "name/label". */
function recorder(): { readonly metrics: Metrics; calls(key: string): number; sum(key: string): number } {
  const calls = new Map<string, number>();
  const sums = new Map<string, number>();
  return {
    metrics: {
      count(name: string, label?: string, value?: number): void {
        const k = `${name}/${label ?? ''}`;
        calls.set(k, (calls.get(k) ?? 0) + 1);
        sums.set(k, (sums.get(k) ?? 0) + (value ?? 1));
      },
    },
    calls: (k) => calls.get(k) ?? 0,
    sum: (k) => sums.get(k) ?? 0,
  };
}

/** Another app over the same database and clock: another deploy's variables (and, optionally, counted metrics). */
function sibling(t: TestApp, o: { env?: Partial<AppEnv>; overrides?: Record<string, unknown>; metrics?: Metrics; seed?: number } = {}): TestApp {
  const rec = new RecordingDb(t.db);
  const logs: LogLine[] = [];
  const env: AppEnv = { ...TEST_ENV, CONFIG_OVERRIDES: JSON.stringify({ ...WIDE_LIMITS, ...(o.overrides ?? {}) }), ...o.env };
  const app = createApp({ db: rec, env, clock: t.clock, rng: seededRng(o.seed ?? 4242), log: (l) => void logs.push(l), ...(o.metrics ? { metrics: o.metrics } : {}) });
  return {
    ...t,
    app,
    rec,
    logs,
    env,
    fetch(path: string, init: RequestInit & { host?: string } = {}): Promise<Response> {
      const { host, ...rest } = init;
      return app.fetch(new Request(`http://${host ?? '127.0.0.1:8787'}${path}`, rest));
    },
  };
}

/** A uniform integer lo…hi from test randomness. */
function int(rng: Rng, lo: number, hi: number): number {
  const b = rng.bytes(4);
  const u = (((b[0] as number) << 24) | ((b[1] as number) << 16) | ((b[2] as number) << 8) | (b[3] as number)) >>> 0;
  return lo + (u % (hi - lo + 1));
}

/** A level win of `fish` fish (fish = 3 − mistakes). */
const winOf = (level: number, fish: 1 | 2 | 3, at: number) => makeWin(`L${level}`, { fish, mistakes: 3 - fish, playedAt: at });

const bracketRow = (t: TestApp, id: string): BracketRow => t.rows<BracketRow>('SELECT * FROM brackets WHERE id = ?', id)[0] as BracketRow;
const rosterOf = (t: TestApp, id: string): Roster => {
  const b = bracketRow(t, id);
  return rivalRoster(b.rivals, b) as Roster;
};
const rivalRows = (v: BracketView) => v.rows.filter((r) => isRivalSlot(r.slot));
const realRows = (v: BracketView) => v.rows.filter((r) => !isRivalSlot(r.slot));
const rowOf = (v: BracketView, slot: number) => v.rows.find((r) => r.slot === slot) as BracketView['rows'][number];
/** What every viewer sees alike (me and likedByMe are per viewer). */
const shown = (v: BracketView) => v.rows.map((r) => ({ rank: r.rank, slot: r.slot, nickname: r.nickname, avatarId: r.avatarId, points: r.points, hearts: r.hearts }));
const top5 = (v: BracketView) => v.rows.slice(0, 5).map((r) => `${r.me ? 'ME' : r.slot}:${r.points}`);

/** The client's parser takes the view back unchanged; ranks are unique positions ≤ members; never more rows than places. */
function expectValid(v: BracketView): void {
  expect(parseBracketView(v)).toEqual(v);
  expect(v.rows.length).toBeLessThanOrEqual(v.maxMembers);
  if (!v.final) {
    expect(v.rows.length).toBe(v.members);
    expect(v.rows.map((r) => r.rank)).toEqual(v.rows.map((_, i) => i + 1));
  }
  expect(new Set(v.rows.map((r) => r.nickname.toLowerCase())).size).toBe(v.rows.length);
}

async function errorOf(r: Response): Promise<[number, string]> {
  return [r.status, (await json<{ error: { code: string } }>(r)).error.code];
}

const devPost = (t: TestApp, route: string, body: unknown, host?: string): Promise<Response> =>
  t.fetch(`/dev/${route}`, { method: 'POST', body: JSON.stringify(body), ...(host ? { host } : {}) });

// ── 12.1: off unless switched on ──────────────────────────────────────────────────────────────────────────

describe('computer rivals are off by default (design §12.1)', () => {
  it('makeTestApp() with no RIVALS: a first win leaves brackets.rivals NULL; the rules carry no computerPlayers', async () => {
    const t = makeTestApp();
    const [a] = await playersWithWins(t, 1, 'off');
    expect(t.app.services.cfg.rivals.enabled).toBe(false);
    expect(t.rows('SELECT rivals, final_rivals, final_real FROM brackets')).toEqual([{ rivals: null, final_rivals: null, final_real: null }]);
    expect('computerPlayers' in (a!.session as SessionResponse).rules).toBe(false);
    const v = await a!.bracket();
    expect(v.rows.map((r) => r.slot)).toEqual([0]);
    expect(v.members).toBe(1); // the alone line still shows in a bracket without computer players
  });

  it('the Node dev server and the e2e ranking server pin RIVALS=off (a test pool opts in with /dev/rivals)', () => {
    const none = join(SERVER_DIR, 'no-such.dev.vars');
    expect(DEV_DEFAULTS.RIVALS).toBe('off');
    expect(devEnv({}, none).RIVALS).toBe('off');
    expect(devEnv({ RIVALS: 'on' }, none).RIVALS).toBe('on'); // a developer may turn them on for the dev server
    const pw = readFileSync(join(SERVER_DIR, '..', 'playwright.config.ts'), 'utf8');
    expect(pw).toMatch(/DEV_ROUTES: 'true',[\s\S]{0,400}RIVALS: 'off'/); // Playwright's env wins over a shell or .dev.vars
  });
});

// ── the first win ─────────────────────────────────────────────────────────────────────────────────────────

describe('a bracket with computer rivals (RIVALS=on)', () => {
  it('first win: a tagged bracket, about 11 rows at once, no alone line, rival slots ≥ 9000, the disclosure in the rules', async () => {
    const t = makeTestApp({ env: ON });
    const a = new TestPlayer(t, 'first');
    const s = await a.signIn();
    expect(parseSessionResponse(s)).toEqual(s);
    expect(s.rules.computerPlayers).toBe(true);
    const w = await a.win('L2');
    const v = w.bracket as BracketView;
    const tag = t.rows<{ rivals: string }>('SELECT rivals FROM brackets')[0]?.rivals as string;
    expect(tag).toMatch(RIVAL_TAG_RE);
    expect(tag).toMatch(/^r1:[0-9a-z]{12}:100:\d+:\d+$/);
    expectValid(v);
    expect(v.members).toBeGreaterThanOrEqual(9);
    expect(v.members).toBeLessThanOrEqual(14);
    expect(v.members).toBe(1 + rosterOf(t, v.bracketId as string).cohort); // the opening group arrives at opened_at
    expect(v.maxMembers).toBe(50);
    expect(v.me).toMatchObject({ slot: 0, rank: 1 }); // 3 fish: exact ties with the opening group go to the real player
    expect(rivalRows(v)).toHaveLength(v.members - 1);
    expect(realRows(v).map((r) => r.slot)).toEqual([0]);
    // never on the wire: the tag or its seed; never a row: one member, one player, no reward
    expect(JSON.stringify(w)).not.toContain(tag.split(':')[1]);
    expect([t.count('SELECT COUNT(*) FROM members'), t.count('SELECT COUNT(*) FROM players'), t.count('SELECT COUNT(*) FROM rewards')]).toEqual([1, 1, 0]);
    const again = await a.signIn();
    expect(again.bracket).toMatchObject({ rank: 1, members: v.members });
  });

  it('49 real players leave one place: rival 0 alone; 50 leave none: exactly the real table', async () => {
    const t = makeTestApp({ env: ON });
    const ps = await playersWithWins(t, 49, 'full');
    let v = await ps[0]!.bracket();
    expectValid(v);
    // K = max_members − next_slot = 1 (design §4.3 says "49+ real players: K = 0"; by the K rule it is 1 here)
    expect(rivalRows(v).map((r) => r.slot)).toEqual([9000]);
    expect(v.rows).toHaveLength(50);
    await playersWithWins(t, 1, 'last', 200);
    v = await ps[0]!.bracket();
    expectValid(v);
    expect(rivalRows(v)).toEqual([]);
    expect(v.rows).toHaveLength(50);
  });

  // 2026-10-12, D-2e-24 (review fix): bracketView (and the admin route) read the bracket row and then the members as
  // two statements; a join committing between them used to give max_members + 1 rows (a view the parser rejects).
  it('a join committing between the bracket read and the members read: ≤ 50 rows, the view parses, the retired rival stays gone', async () => {
    const t = makeTestApp({ env: ON });
    const ps = await playersWithWins(t, 11, 'race');
    t.clock.set(T0 + 119 * MIN); // every rival has arrived (the last arrival minute is Wmin − 2 = 118)
    const consistent = await ps[0]!.bracket();
    expectValid(consistent);
    expect(consistent.rows).toHaveLength(50); // 11 real + K = 39 (T ≥ 46, so N ≥ 45 > 39)
    const id = consistent.bracketId as string;
    const k = liveRivalCount(rosterOf(t, id), bracketRow(t, id));
    expect(k).toBe(39);
    // From now on every bracket read answers the row as it was just before the 11th join committed, while the
    // members read already holds that member: K from the stale row alone would be 40 (51 rows).
    const store = t.app.services.store;
    const read = store.getBracket.bind(store);
    store.getBracket = async (bid: string) => {
      const b = await read(bid);
      return b && { ...b, next_slot: b.next_slot - 1, members: b.members - 1 };
    };
    const v = await ps[0]!.bracket();
    expectValid(v);
    expect(v.rows).toHaveLength(50);
    expect(v.rows.map((r) => r.slot)).not.toContain(9000 + k);
    expect(shown(v)).toEqual(shown(consistent));
    expect((await ps[1]!.signIn()).bracket).toMatchObject({ members: 50 }); // the Home chip's "#k of 50", not 51
    const ad = await json<AdminBracket>(await admin(t, 'GET', `brackets/${id}`));
    expect(ad.bracket.rivals).toMatchObject({ live: k, present: 39 });
    expect(ad.rows).toHaveLength(50);
    expect(ad.retiredRivals.map((r) => r.index)).toContain(k);
  });

  // FakeClock every 10 minutes for 25 hours, a lone player and 1, 4 or 10 others joining at random times in the
  // join window: rows ≤ 50; rows vanish only at a real join and only the lowest computer rows; a vanished one
  // never returns; rival points and hearts never fall; two members see the same table; the frozen final table is
  // the live table at ends_at.
  for (const extra of [0, 1, 4, 10]) {
    it(`a whole day with ${extra} other real player(s) joining in the window`, async () => {
      const t = makeTestApp({ env: ON });
      const rng = seededRng(1000 + extra);
      const creator = new TestPlayer(t, `day${extra}`);
      await creator.signIn();
      const first = await creator.win('L2');
      let prev = first.bracket as BracketView;
      const id = prev.bracketId as string;
      const roster = rosterOf(t, id);
      const ends = T0 + DAY;
      const joinAt = Array.from({ length: extra }, () => T0 + int(rng, 1, 118) * MIN + int(rng, 0, MIN - 1)).sort((x, y) => x - y);
      const others: TestPlayer[] = [];
      const gone = new Set<number>();
      const best = new Map<number, { points: number; hearts: number }>();
      let creatorLevel = 3;
      let atEnd: ReturnType<typeof shown> | null = null;
      for (let step = 1; step <= 150; step++) {
        const at = T0 + step * 10 * MIN;
        let joinsNow = 0;
        while (others.length < joinAt.length && (joinAt[others.length] as number) <= at) {
          t.clock.set(joinAt[others.length] as number);
          const p = new TestPlayer(t, `day${extra}-${others.length}`);
          await p.signIn();
          await p.win(`L${2 + others.length}`);
          others.push(p);
          joinsNow++;
        }
        t.clock.set(at);
        if (step === 140) for (const p of [creator, ...others]) await p.signIn(); // tokens last 24 h
        if (step % 37 === 0 && at < ends) await creator.win(`L${creatorLevel++}`, { fish: 2, mistakes: 1 });
        const v = await creator.bracket();
        expectValid(v);
        expect(v.rows.length).toBeLessThanOrEqual(50);
        expect(realRows(v)).toHaveLength(1 + others.length);
        if (at >= T0 + 2 * HOUR) expect(v.rows.length).toBe(Math.min(50, roster.size + others.length)); // every rival arrived by join_until
        if (extra === 0 && at >= T0 + 2 * HOUR) {
          expect(v.rows.length).toBeGreaterThanOrEqual(46); // a lone player: about 50 rows
          expect(v.rows.length).toBeLessThanOrEqual(50);
        }
        const nowRivals = rivalRows(v);
        for (const r of nowRivals) {
          expect(gone.has(r.slot), `rival ${r.slot} came back`).toBe(false);
          const b = best.get(r.slot);
          if (b) {
            expect(r.points).toBeGreaterThanOrEqual(b.points);
            expect(r.hearts).toBeGreaterThanOrEqual(b.hearts);
          }
          best.set(r.slot, { points: r.points, hearts: r.hearts });
        }
        const nowSlots = new Set(nowRivals.map((r) => r.slot));
        const prevRivals = rivalRows(prev);
        const vanished = prevRivals.filter((r) => !nowSlots.has(r.slot)).map((r) => r.slot);
        expect(vanished.length, `step ${step}`).toBeLessThanOrEqual(joinsNow);
        expect(vanished).toEqual(prevRivals.slice(prevRivals.length - vanished.length).map((r) => r.slot)); // the lowest computer rows
        for (const sl of vanished) gone.add(sl);
        if (others.length > 0) {
          const o = await (others[0] as TestPlayer).bracket();
          expect(shown(o)).toEqual(shown(v));
        }
        if (at === ends) {
          expect([v.state, v.final]).toEqual(['ended', false]); // inside the finalisation grace: the live table at ends_at
          atEnd = shown(v);
        }
        if (at > ends) {
          expect(v.final).toBe(true);
          expect(shown(v)).toEqual(atEnd); // the frozen snapshot is the live table at ends_at
          expect(v.result?.members).toBe(v.members);
          expect(v.result?.place).toBeLessThanOrEqual(v.members);
        }
        prev = v;
      }
      const b = bracketRow(t, id);
      expect(b.final_members).toBe(prev.rows.length);
      expect(b.final_real).toBe(1 + extra);
      expect(decodeFinalRivals(b.final_rivals, b)).toHaveLength(prev.rows.length - 1 - extra);
      expect(t.count('SELECT COUNT(*) FROM members WHERE bracket_id = ?', id)).toBe(1 + extra);
      expect(t.count(BIG_SLOT_REWARDS)).toBe(0);
      expect(t.count('SELECT COUNT(*) FROM rewards r WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.key = r.player_key)')).toBe(0);
      expect(liveRivalCount(roster, b)).toBe(Math.min(roster.rivals.length, 50 - (1 + extra)));
    });
  }

  it('listed off: that row disappears, no rival appears, the count drops by 1', async () => {
    const t = makeTestApp({ env: ON });
    const [a, b] = await playersWithWins(t, 2, 'ls');
    t.clock.advance(30 * MIN);
    const before = await a!.bracket();
    const bSlot = (await b!.bracket()).me!.slot;
    await b!.profile({ listed: false });
    const after = await a!.bracket();
    expectValid(after);
    expect(after.members).toBe(before.members - 1);
    expect(rivalRows(after).map((r) => r.slot)).toEqual(rivalRows(before).map((r) => r.slot));
    expect(after.rows.some((r) => r.slot === bSlot)).toBe(false);
    await b!.profile({ listed: true });
    expect((await a!.bracket()).members).toBe(before.members);
  });

  it("a real player takes a rival's exact name: the player keeps it, that rival moves to its next candidate, no duplicates", async () => {
    const t = makeTestApp({ env: ON });
    const [a, b] = await playersWithWins(t, 2, 'rn');
    const v = await a!.bracket();
    const target = rivalRows(v)[0] as BracketView['rows'][number];
    let pick: { adj: number; noun: number; num: number } | null = null;
    for (let i = 0; i < NICK_WORDS_V1.adj.length && !pick; i++)
      for (let j = 0; j < NICK_WORDS_V1.noun.length && !pick; j++) {
        const m = new RegExp(`^${NICK_WORDS_V1.adj[i]} ${NICK_WORDS_V1.noun[j]} (\\d+)$`).exec(target.nickname);
        if (m) pick = { adj: i, noun: j, num: Number(m[1]) };
      }
    expect(pick).not.toBeNull();
    const bSlot = (await b!.bracket()).me!.slot;
    await b!.profile({ nickname: pick as { adj: number; noun: number; num: number } });
    const after = await a!.bracket();
    expectValid(after); // names unique, case-insensitively
    expect(rowOf(after, bSlot).nickname).toBe(target.nickname);
    expect(rowOf(after, target.slot).nickname).not.toBe(target.nickname);
    expect(rowOf(after, target.slot).points).toBe(target.points);
  });

  it('utc_day: rivals scale with the long window; clock skew before opened_at; exactly ends_at; finalised like any bracket', async () => {
    const t = makeTestApp({ env: { ...ON, PERIOD_MODE: 'utc_day' } });
    const [a] = await playersWithWins(t, 1, 'ud');
    let v = await a!.bracket();
    expectValid(v);
    expect(v.mode).toBe('utc_day');
    const id = v.bracketId as string;
    const b = bracketRow(t, id);
    expect([b.opened_at, b.join_until, b.ends_at]).toEqual([T0, Date.parse('2026-11-15T22:00:00Z'), Date.parse('2026-11-16T00:00:00Z')]);
    const roster = rosterOf(t, id);
    expect(rivalRows(v)).toHaveLength(roster.cohort);
    // the server clock moved back before opened_at: rivals are clamped to opened_at (the opening group)
    t.clock.set(T0 - 5 * MIN);
    await a!.signIn();
    v = await a!.bracket();
    expectValid(v);
    expect(rivalRows(v)).toHaveLength(roster.cohort);
    // after join_until every rival has arrived
    t.clock.set(b.join_until + MIN);
    v = await a!.bracket();
    expect(v.rows).toHaveLength(roster.size);
    // exactly ends_at: ended, not final yet; then final with the same table
    t.clock.set(b.ends_at);
    await a!.signIn();
    const end = await a!.bracket();
    expect([end.state, end.final]).toEqual(['ended', false]);
    expectValid(end);
    t.clock.set(b.ends_at + HOUR);
    const fin = await a!.bracket();
    expect(fin.final).toBe(true);
    expect(shown(fin)).toEqual(shown(end));
    expect(bracketRow(t, id)).toMatchObject({ final_members: end.rows.length, final_real: 1 });
  });
});

// ── hearts ────────────────────────────────────────────────────────────────────────────────────────────────

describe('hearts on computer players (design §6)', () => {
  it('a heart on a rival: built-in + 1 for everyone, once per giver, the same cap of 20, taken back with the giver, and on the frozen rows', async () => {
    const rec = recorder();
    const t = sibling(makeTestApp({ env: ON }), { env: ON, metrics: rec.metrics });
    const [a, b, c] = await playersWithWins(t, 3, 'hr');
    let v = await a!.bracket();
    const id = v.bracketId as string;
    const aSlot = v.me!.slot;
    // a rival that has not arrived yet
    const notYet = rosterOf(t, id).rivals.find((x) => x.arrivalAt > t.clock.now());
    expect(notYet).toBeDefined();
    expect(await errorOf(await a!.rawHeart(id, notYet!.slot))).toEqual([404, 'not_found']);
    t.clock.set(T0 + 2 * HOUR + MIN);
    v = await a!.bracket();
    const r0 = rivalRows(v)[3] as BracketView['rows'][number];
    const h = await a!.heart(id, r0.slot);
    expect(parseHeartResponse(h)).toEqual(h);
    expect(h).toMatchObject({ bracketId: id, slot: r0.slot, hearts: r0.hearts + 1, likedByMe: true, givenInBracket: 1 });
    expect(rec.calls('heart/rival')).toBe(1);
    v = await a!.bracket();
    expect(rowOf(v, r0.slot)).toMatchObject({ hearts: r0.hearts + 1, likedByMe: true });
    const vb = await b!.bracket();
    expect(rowOf(vb, r0.slot)).toMatchObject({ hearts: r0.hearts + 1, likedByMe: false });
    expect(shown(vb)).toEqual(shown(v));
    expect(await errorOf(await a!.rawHeart(id, r0.slot))).toEqual([409, 'heart_exists']);
    // the same cap as real hearts: 19 more, then heart_limit
    const more = rivalRows(v).filter((r) => r.slot !== r0.slot);
    for (const [i, r] of more.slice(0, 19).entries()) expect((await a!.heart(id, r.slot)).givenInBracket).toBe(i + 2);
    expect(await errorOf(await a!.rawHeart(id, (more[19] as BracketView['rows'][number]).slot))).toEqual([409, 'heart_limit']);
    expect(t.count('SELECT COUNT(*) FROM hearts WHERE bracket_id = ? AND from_slot = ?', id, aSlot)).toBe(20);
    expect(t.count('SELECT SUM(hearts) FROM members')).toBe(0); // no member row is touched
    expect((await b!.bracket()).heartsNew).toBe(0); // rivals give no hearts; hearts to rivals reach no one
    // another giver, then that giver deletes their data: the count falls back
    await b!.heart(id, r0.slot);
    expect(rowOf(await c!.bracket(), r0.slot).hearts).toBe(r0.hearts + 2);
    expect((await b!.rawMe('DELETE')).status).toBe(204);
    expect(rowOf(await c!.bracket(), r0.slot).hearts).toBe(r0.hearts + 1);
    // after the end: hearts on the frozen snapshot rows
    t.clock.set(T0 + DAY + HOUR);
    await a!.signIn();
    await c!.signIn();
    const fin = await c!.bracket();
    expect(fin.final).toBe(true);
    expectValid(fin);
    const aLiked = new Set((await a!.bracket()).rows.filter((r) => r.likedByMe).map((r) => r.slot));
    expect(aLiked.size).toBe(20); // a's hearts survive finalisation
    const snapRow = rivalRows(fin).find((r) => !aLiked.has(r.slot)) as BracketView['rows'][number];
    const hs = await c!.heart(id, snapRow.slot);
    expect(hs.hearts).toBe(snapRow.hearts + 1);
    expect(rowOf(await a!.bracket(), snapRow.slot)).toMatchObject({ hearts: snapRow.hearts + 1, likedByMe: false });
    expect(rowOf(await c!.bracket(), snapRow.slot).likedByMe).toBe(true);
    const fb = bracketRow(t, id);
    const frozenR0 = decodeFinalRivals(fb.final_rivals, fb)?.find((x) => x.slot === r0.slot);
    expect(rowOf(fin, r0.slot).hearts).toBe((frozenR0?.hearts as number) + 1); // a's heart still counts on the frozen row
    const missing = [...Array(50).keys()].map((i) => 9000 + i).find((sl) => !fin.rows.some((r) => r.slot === sl)) as number;
    expect(await errorOf(await c!.rawHeart(id, missing))).toEqual([404, 'not_found']);
  });

  it('404: a rival retired by joins, 9000 + N, any slot of an untagged bracket, any rival under hide', async () => {
    const t = makeTestApp({ env: ON });
    const [a] = await playersWithWins(t, 1, 'ret');
    const id = (await a!.bracket()).bracketId as string;
    t.clock.set(T0 + 119 * MIN); // every rival has arrived (arrivals ≤ +118 min), still inside the join window
    const before = await a!.bracket();
    const roster = rosterOf(t, id);
    const n = roster.rivals.length;
    expect(rivalRows(before)).toHaveLength(n);
    // joins until K = N − 2: the two lowest computer rows retire
    await playersWithWins(t, 51 - n, 'retj', 100);
    const after = await a!.bracket();
    expectValid(after);
    expect(after.rows).toHaveLength(50);
    const retired = rivalRows(before)
      .map((r) => r.slot)
      .filter((sl) => !after.rows.some((r) => r.slot === sl));
    expect(retired).toEqual(rivalRows(before).slice(-2).map((r) => r.slot));
    expect(retired.sort()).toEqual([9000 + n - 2, 9000 + n - 1]);
    for (const sl of retired) expect(await errorOf(await a!.rawHeart(id, sl))).toEqual([404, 'not_found']);
    expect(await errorOf(await a!.rawHeart(id, 9000 + n))).toEqual([404, 'not_found']);
    expect(t.count('SELECT COUNT(*) FROM hearts')).toBe(0);

    const plain = makeTestApp();
    const [p] = await playersWithWins(plain, 2, 'untag');
    expect(await errorOf(await p!.rawHeart((await p!.bracket()).bracketId as string, 9000))).toEqual([404, 'not_found']);

    const hidden = sibling(t, { env: ON, overrides: { rivals: { hide: true } } });
    const ah = new TestPlayer(hidden, 'ret0');
    const s = await ah.signIn();
    expect('computerPlayers' in s.rules).toBe(false);
    const hv = await ah.bracket();
    expectValid(hv);
    expect(rivalRows(hv)).toEqual([]);
    expect(await errorOf(await ah.rawHeart(id, rivalRows(after)[0]!.slot))).toEqual([404, 'not_found']);
  });
});

// ── finalisation and rewards ──────────────────────────────────────────────────────────────────────────────

describe('finalisation with computer rivals (design §5)', () => {
  /** Three real players with wins through the day (the same calls in every app, so the same ids and tag). */
  async function threePlayers(t: TestApp): Promise<string> {
    const [a, b, c] = await playersWithWins(t, 3, 'fz');
    t.clock.advance(3 * HOUR);
    await a!.wins([winOf(40, 3, t.clock.now()), winOf(41, 2, t.clock.now())]);
    t.clock.advance(9 * HOUR);
    await b!.wins([winOf(42, 3, t.clock.now())]);
    t.clock.advance(6 * HOUR);
    await c!.wins([winOf(43, 1, t.clock.now())]);
    return (await a!.bracket()).bracketId as string;
  }
  const frozen = (t: TestApp, id: string) => ({
    bracket: t.rows('SELECT finalized_at IS NOT NULL AS final, final_members, final_real, final_rivals FROM brackets WHERE id = ?', id),
    ranks: t.rows('SELECT slot, final_rank FROM members WHERE bracket_id = ? ORDER BY slot', id),
    rewards: t.rows('SELECT id, player_key, place, hints, kitties FROM rewards ORDER BY id'),
  });

  it('lazy at +1 h equals the cron at +5 h; final_members = rows, final_real = the real rows, final_rivals decodes', async () => {
    const lazy = makeTestApp({ env: ON });
    const cron = makeTestApp({ env: ON });
    const id = await threePlayers(lazy);
    expect(await threePlayers(cron)).toBe(id);
    const end = bracketRow(lazy, id).ends_at;
    lazy.clock.set(end + HOUR);
    const viewer = new TestPlayer(lazy, 'fz0');
    await viewer.signIn();
    const v = await viewer.bracket();
    expect(v.final).toBe(true);
    expectValid(v);
    cron.clock.set(end + 5 * HOUR);
    expect((await cron.app.scheduled()).finalized).toBe(1);
    expect(frozen(cron, id)).toEqual(frozen(lazy, id));
    const b = bracketRow(lazy, id);
    expect(b.final_members).toBe(v.rows.length);
    expect(b.final_real).toBe(3);
    const snap = decodeFinalRivals(b.final_rivals, b);
    expect(snap).toHaveLength(v.rows.length - 3);
    expect(snap!.map((r) => r.slot)).toEqual(rivalRows(v).map((r) => r.slot));
    expect(v.members).toBe(b.final_members);
    expect(v.result!.members).toBeGreaterThanOrEqual(v.result!.place);
    // a ranked member row exists for real players only; rewards only for real players
    expect(lazy.count('SELECT COUNT(*) FROM members WHERE bracket_id = ? AND final_rank IS NOT NULL', id)).toBe(3);
    expect(lazy.count(BIG_SLOT_REWARDS)).toBe(0);
    const s = await viewer.signIn();
    expect(parseSessionResponse(s)).toEqual(s);
    expect(s.results[0]).toMatchObject({ bracketId: id, members: b.final_members });
  });

  it('concurrent finalisers write once (sessions, reads and two crons at the same instant)', async () => {
    const rec = recorder();
    const t = sibling(makeTestApp({ env: ON }), { env: ON, metrics: rec.metrics });
    const id = await threePlayers(t);
    t.clock.set(bracketRow(t, id).ends_at + HOUR);
    const [x, y, z] = ['fz0', 'fz1', 'fz2'].map((n) => new TestPlayer(t, n));
    await Promise.all([x!.signIn(), y!.signIn(), z!.signIn(), t.app.scheduled(), t.app.scheduled()]);
    expect(rec.calls('bracket_final/members')).toBe(1);
    expect(rec.sum('bracket_final/members')).toBe(3);
    expect(rec.calls('bracket_final/rivals')).toBe(1);
    const b = bracketRow(t, id);
    expect(rec.sum('bracket_final/rivals')).toBe((b.final_members as number) - 3);
    expect(t.count('SELECT COUNT(*) FROM rewards')).toBe(rec.sum('reward/created'));
    expect(rec.sum('reward/created') + rec.sum('reward/rival_place')).toBeLessThanOrEqual(3);
    expect(t.count(BIG_SLOT_REWARDS)).toBe(0);
  });

  it('golden (design §3.8) through the API: 15 wins at 39 fish end 2nd behind a rival, paid the 2nd place (1 + 1)', async () => {
    const O = Date.parse('2026-10-12T08:00:00Z');
    const GOLD_TAG = 'r1:k3j9x0a1b20a:100:64:64';
    const rec = recorder();
    const t = sibling(makeTestApp({ env: ON, now: O }), { env: ON, metrics: rec.metrics });
    const me = new TestPlayer(t, 'gold');
    await me.signIn();
    await me.profile({ nickname: { adj: 2, noun: 5, num: 27 } }); // "Velvet Pounce 27", the fixture's real player
    const plays: [number, 1 | 2 | 3][] = [
      [0, 3], [4, 3], [8, 3], [12, 2],
      [300, 3], [303, 3], [307, 2], [310, 2], [314, 2],
      [1200, 3], [1204, 3], [1208, 3], [1212, 3], [1216, 2], [1220, 2],
    ];
    const views = new Map<number, BracketView>();
    const at = (h: number): Promise<BracketView> => (t.clock.set(O + h * HOUR), me.bracket());
    let level = 2;
    for (const [i, [minute, fish]] of plays.entries()) {
      for (const h of [1, 2, 6, 12]) if (!views.has(h) && O + h * HOUR <= O + minute * MIN) views.set(h, await at(h));
      t.clock.set(O + minute * MIN);
      if (minute === 1200) await me.signIn();
      await me.wins([winOf(level++, fish, t.clock.now())]);
      // the test's only write outside the API: the golden tag on the bracket the first win opened (seed from §3.8)
      if (i === 0) t.db.raw.prepare('UPDATE brackets SET rivals = ?').run(GOLD_TAG);
    }
    views.set(23, await at(23));
    for (const v of views.values()) expectValid(v);
    expect(views.get(1)!.rows).toHaveLength(31);
    expect(top5(views.get(1)!)).toEqual(['ME:11', '9000:4', '9001:4', '9002:4', '9003:4']);
    expect(top5(views.get(2)!)).toEqual(['ME:11', '9000:6', '9001:5', '9002:5', '9003:5']);
    expect(top5(views.get(6)!)).toEqual(['9001:27', '9002:24', 'ME:23', '9005:16', '9009:16']);
    expect(top5(views.get(12)!)).toEqual(['9000:42', '9001:38', '9002:30', 'ME:23', '9009:21']);
    expect(top5(views.get(23)!)).toEqual(['9000:42', 'ME:39', '9001:38', '9003:34', '9004:32']);
    expect([2, 6, 12, 23].map((h) => views.get(h)!.rows.length)).toEqual([50, 50, 50, 50]);
    expect(rowOf(views.get(23)!, 9000)).toMatchObject({ nickname: 'Calm Pumpkin 6', avatarId: 6, hearts: 8 });
    expect([9001, 9002, 9003, 9048].map((sl) => rowOf(views.get(23)!, sl).nickname)).toEqual(['Bouncy Comet 62', 'Sweet Fern 70', 'Cloudy Cupcake 74', 'Brave Noodle 85']);
    // the end: 2nd of 50; the rival's 1st and 3rd places are not paid and not passed down
    t.clock.set(O + DAY + HOUR);
    const s = await me.signIn();
    expect(s.results[0]).toMatchObject({ place: 2, members: 50, points: 39, reward: { place: 2, grant: { hints: 1, kitties: 1 } } });
    const fin = await me.bracket();
    expectValid(fin);
    expect(fin.result).toMatchObject({ place: 2, members: 50 });
    expect(t.rows('SELECT id, place, hints, kitties FROM rewards')).toEqual([{ id: `${fin.bracketId}:0`, place: 2, hints: 1, kitties: 1 }]);
    expect([rec.sum('reward/rival_place'), rec.sum('bracket_final/members'), rec.sum('bracket_final/rivals'), rec.sum('reward/created')]).toEqual([2, 1, 49, 1]);
    expect((await me.claim(`${fin.bracketId}:0`, true)).grant).toEqual({ hints: 2, kitties: 2 });
  });

  it('30 wins of 3 fish (90 points) win 1st over every rival: 2 + 2', async () => {
    const t = makeTestApp({ env: ON });
    const me = new TestPlayer(t, 'champ');
    await me.signIn();
    for (let k = 0; k < 3; k++) {
      await me.wins(Array.from({ length: 10 }, (_, i) => winOf(2 + k * 10 + i, 3, t.clock.now())));
      t.clock.advance(4 * HOUR);
    }
    t.clock.set(T0 + DAY + HOUR);
    const s = await me.signIn();
    expect(s.results[0]).toMatchObject({ place: 1, points: 90, reward: { place: 1, grant: { hints: 2, kitties: 2 } } });
    expect(s.results[0]!.members).toBeGreaterThanOrEqual(46);
    expect(t.count(BIG_SLOT_REWARDS)).toBe(0);
  });

  it('an admin delete after finalisation leaves a gap and the frozen rivals; refinalize re-ranks with the snapshot and pays a newly earned place', async () => {
    const t = makeTestApp({ env: ON });
    const ps = ['da', 'db', 'dc', 'dd'].map((n) => new TestPlayer(t, n));
    for (const [i, p] of ps.entries()) {
      await p.signIn();
      await p.wins([winOf(2 + i, 3, t.clock.now())]);
    }
    const id = (await ps[0]!.bracket()).bracketId as string;
    // every real player beats every rival: rivals' best final total from the admin route
    const top = (await json<{ bracket: { rivals: { topFinal: number } } }>(await admin(t, 'GET', `brackets/${id}`))).bracket.rivals.topFinal;
    const need = Math.ceil((top + 1) / 3); // wins of 3 fish for the 4th real player
    let lv = 10;
    for (const [i, p] of ps.entries()) {
      let left = need + 3 - i - 1; // a: need + 2 more wins … d: need − 1 more (each has one already)
      while (left > 0) {
        const k = Math.min(10, left);
        await p.wins(Array.from({ length: k }, () => winOf(lv++, 3, t.clock.now())));
        left -= k;
      }
      t.clock.advance(MIN);
    }
    t.clock.set(T0 + DAY + HOUR);
    for (const p of ps) await p.signIn();
    const v = await ps[1]!.bracket();
    expect(v.final).toBe(true);
    expect(realRows(v).map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(t.rows<{ place: number }>('SELECT place FROM rewards ORDER BY place').map((r) => r.place)).toEqual([1, 2, 3]);
    // the admin deletes the 1st (an emailed request): an honest gap, the frozen rivals as they were
    expect((await admin(t, 'DELETE', `players/${ps[0]!.code()}`)).status).toBe(204);
    const gap = await ps[1]!.bracket();
    expectValid(gap);
    expect(gap.members).toBe(v.members);
    expect(gap.rows).toHaveLength(v.rows.length - 1);
    expect(gap.rows[0]!.rank).toBe(2);
    expect(rivalRows(gap)).toEqual(rivalRows(v));
    // refinalize: the real players move up, the rivals keep their points and names, renumbered one place up
    const r = await json<{ bracket: Record<string, number | string> }>(await admin(t, 'POST', `brackets/${id}/refinalize`));
    expect(r.bracket).toEqual({ id, finalMembers: v.members - 1, finalReal: 3, rivalRows: v.members - 4, rewards: 3 });
    const re = await ps[3]!.bracket();
    expectValid(re);
    expect(re.members).toBe(v.members - 1);
    expect(realRows(re).map((x) => x.rank)).toEqual([1, 2, 3]);
    expect(rivalRows(re).map((x) => ({ ...x, rank: x.rank + 1 }))).toEqual(rivalRows(v));
    const dReward = t.rows<{ place: number }>('SELECT place FROM rewards WHERE id = ?', `${id}:${re.me!.slot}`);
    expect(dReward).toEqual([{ place: 3 }]); // newly earned inside the claim window
    expect(re.result).toMatchObject({ place: 3, members: v.members - 1, reward: { place: 3 } });
    expect(bracketRow(t, id)).toMatchObject({ final_members: v.members - 1, final_real: 3 });
    expect(t.count(BIG_SLOT_REWARDS)).toBe(0);
  });
});

describe('stored rival values that do not parse (design §3.1, §4.2; metrics that must stay 0)', () => {
  it('an invalid tag means no computer players (rivals/tag_invalid); an undecodable snapshot shows real rows only (rivals/decode_error)', async () => {
    const rec = recorder();
    const t = sibling(makeTestApp({ env: ON }), { env: ON, metrics: rec.metrics });
    const [a, b] = await playersWithWins(t, 2, 'bad');
    const id = (await a!.bracket()).bracketId as string;
    // the test's only writes outside the API: damaged stored values (what a bad manual edit would leave)
    t.db.raw.prepare('UPDATE brackets SET rivals = ? WHERE id = ?').run('r9:not-a-tag', id);
    const v = await a!.bracket();
    expectValid(v);
    expect(v.rows.map((r) => r.slot).sort()).toEqual([0, 1]);
    expect(rec.calls('rivals/tag_invalid')).toBeGreaterThan(0);
    expect(await errorOf(await a!.rawHeart(id, 9000))).toEqual([404, 'not_found']);
    // a valid tag again, finalised with a snapshot; then the snapshot is damaged
    t.db.raw.prepare('UPDATE brackets SET rivals = ? WHERE id = ?').run('r1:k3j9x0a1b20a:100:64:64', id);
    t.clock.set(T0 + DAY + HOUR);
    await a!.signIn();
    const fin = await a!.bracket();
    expect(rivalRows(fin).length).toBeGreaterThan(0);
    expect(rec.calls('rivals/decode_error')).toBe(0);
    t.db.raw.prepare('UPDATE brackets SET final_rivals = ? WHERE id = ?').run('[[9000, 1, "x"]]', id);
    const broken = await a!.bracket();
    expectValid(broken);
    expect(broken.members).toBe(fin.members); // final_members: an honest count with gaps
    expect(broken.rows.map((r) => [r.slot, r.rank])).toEqual(realRows(fin).map((r) => [r.slot, r.rank]));
    expect(rec.calls('rivals/decode_error')).toBeGreaterThan(0);
    expect(b).toBeDefined();
  });
});

// ── switches ──────────────────────────────────────────────────────────────────────────────────────────────

describe('the switches (design §1.3)', () => {
  it('a deploy with RIVALS unset over the same database: the running tagged bracket keeps its rivals; a new bracket is untagged; no note', async () => {
    const t = makeTestApp({ env: ON });
    const [a] = await playersWithWins(t, 1, 'sw');
    t.clock.advance(30 * MIN);
    const onView = await a!.bracket();
    const off = sibling(t);
    const a2 = new TestPlayer(off, 'sw0');
    const s = await a2.signIn();
    expect('computerPlayers' in s.rules).toBe(false);
    const v = await a2.bracket();
    expectValid(v);
    expect(shown(v)).toEqual(shown(onView));
    expect(rivalRows(v).length).toBeGreaterThan(0);
    const w = new TestPlayer(off, 'swweb', { platform: 'web' });
    await w.signIn();
    await w.win('L5');
    expect(t.rows("SELECT rivals FROM brackets WHERE pool = 'web'")).toEqual([{ rivals: null }]);
    expect(rivalRows(await w.bracket())).toEqual([]);
  });

  it('hide: views real-only, finalisation real-only, snapshots not rendered (still parser-valid); a frozen result is never recomputed', async () => {
    const t = makeTestApp({ env: ON });
    const [a, b] = await playersWithWins(t, 2, 'hd');
    const fbId = (await a!.bracket()).bracketId as string;
    const [w1, w2] = [new TestPlayer(t, 'hw1', { platform: 'web' }), new TestPlayer(t, 'hw2', { platform: 'web' })];
    for (const [i, p] of [w1, w2].entries()) {
      await p!.signIn();
      await p!.win(`L${10 + i}`);
    }
    const webId = (await w1!.bracket()).bracketId as string;
    expect(bracketRow(t, webId).rivals).toMatch(RIVAL_TAG_RE);
    const hide = sibling(t, { env: ON, overrides: { rivals: { hide: true } } });
    // running: real rows only, no note, no rival hearts, a new bracket untagged
    const ah = new TestPlayer(hide, 'hd0');
    const s = await ah.signIn();
    expect('computerPlayers' in s.rules).toBe(false);
    const hv = await ah.bracket();
    expectValid(hv);
    expect(hv.rows.map((r) => r.slot).sort()).toEqual([0, 1]);
    const hiddenNew = makeTestApp({ env: ON, overrides: { rivals: { hide: true } } });
    await playersWithWins(hiddenNew, 1, 'hdnew');
    expect(hiddenNew.rows('SELECT rivals FROM brackets')).toEqual([{ rivals: null }]); // a new bracket under hide is untagged
    // the fb bracket is finalised by the deploy without hide: it keeps a snapshot
    t.clock.set(T0 + DAY + HOUR);
    await a!.signIn();
    const fin = await a!.bracket();
    expect(fin.final).toBe(true);
    expect(rivalRows(fin).length).toBeGreaterThan(0);
    // seen under hide: the snapshot rows are not rendered (rank gaps), the view still parses
    await ah.signIn();
    const fh = await ah.bracket();
    expectValid(fh);
    expect(fh.final).toBe(true);
    expect(fh.members).toBe(fin.members);
    expect(fh.rows.map((r) => r.slot)).toEqual(realRows(fin).map((r) => r.slot));
    expect(fh.rows.map((r) => r.rank)).toEqual(realRows(fin).map((r) => r.rank));
    expect(await errorOf(await ah.rawHeart(fbId, rivalRows(fin)[0]!.slot))).toEqual([404, 'not_found']);
    // the web bracket is finalised under hide: real-only, no snapshot
    const w1h = new TestPlayer(hide, 'hw1', { platform: 'web' });
    w1h.device.id = w1!.device.id;
    w1h.device.secret = w1!.device.secret;
    await w1h.signIn();
    const wf = await w1h.bracket();
    expectValid(wf);
    expect(wf.rows).toHaveLength(2);
    expect(bracketRow(t, webId)).toMatchObject({ final_members: 2, final_real: 2, final_rivals: null });
    // hide off again: that result stays real-only, and a refinalize never adds rivals to it
    await w1!.signIn();
    expect((await w1!.bracket()).rows).toHaveLength(2);
    const r = await json<{ bracket: { finalMembers: number; rivalRows: number } }>(await admin(t, 'POST', `brackets/${webId}/refinalize`));
    expect(r.bracket).toMatchObject({ finalMembers: 2, rivalRows: 0 });
    expect(bracketRow(t, webId).final_rivals).toBeNull();
    // while the fb snapshot survives a refinalize under hide (a re-rank never destroys a snapshot)
    const keep = await json<{ bracket: { rivalRows: number } }>(await admin(hide, 'POST', `brackets/${fbId}/refinalize`));
    expect(keep.bracket.rivalRows).toBe(rivalRows(fin).length);
    expect(b).toBeDefined();
  });

  it('disclose: false drops the note (rivals stay); pools: [fb] leaves web untagged; strength 150 goes into the tag', async () => {
    const quiet = makeTestApp({ env: ON, overrides: { rivals: { disclose: false } } });
    const [q] = await playersWithWins(quiet, 1, 'dq');
    expect('computerPlayers' in q!.session!.rules).toBe(false);
    expect(rivalRows(await q!.bracket()).length).toBeGreaterThan(0);

    const fbOnly = makeTestApp({ env: ON, overrides: { rivals: { pools: ['fb'] } } });
    const [f] = await playersWithWins(fbOnly, 1, 'po');
    const w = new TestPlayer(fbOnly, 'poweb', { platform: 'web' });
    await w.signIn();
    expect(w.session!.rules.computerPlayers).toBe(true); // the note stays while rivals are on (runbook: pools [] first)
    await w.win('L9');
    expect(fbOnly.rows<{ pool: string; tagged: number }>('SELECT pool, rivals IS NOT NULL AS tagged FROM brackets ORDER BY pool')).toEqual([
      { pool: 'fb', tagged: 1 },
      { pool: 'web', tagged: 0 },
    ]);
    expect(f).toBeDefined();

    const strong = makeTestApp({ env: ON, overrides: { rivals: { strength: 150 } } });
    await playersWithWins(strong, 1, 'st');
    expect(strong.rows<{ rivals: string }>('SELECT rivals FROM brackets')[0]?.rivals).toMatch(/^r1:[0-9a-z]{12}:150:\d+:\d+$/);
  });

  it('the guards: another scoring turns rivals off with a problem; production takes them only from RIVALS=on', async () => {
    const doubled = makeTestApp({ env: ON, overrides: { scoring: { pointsPerFish: 2 } } });
    expect(doubled.app.services.cfg.rivals.enabled).toBe(false);
    expect(doubled.app.services.configProblems).toContain('rivals: preset r1 needs pointsPerFish 1 and fishMax 3');
    const [d] = await playersWithWins(doubled, 1, 'gd');
    expect(doubled.rows('SELECT rivals FROM brackets')).toEqual([{ rivals: null }]);
    expect('computerPlayers' in d!.session!.rules).toBe(false);

    const prodEnv: Partial<AppEnv> = { DEPLOY_ENV: 'production', DEV_ROUTES: 'false' };
    const prod = makeTestApp({ env: prodEnv, overrides: { rivals: { enabled: true } } });
    expect(prod.app.services.cfg.rivals.enabled).toBe(false);
    expect(prod.app.services.configProblems).toContain('rivals.enabled: ignored in production without RIVALS=on');
    expect(makeTestApp({ env: { ...prodEnv, RIVALS: 'on' } }).app.services.cfg.rivals.enabled).toBe(true);
  });

  it('test pools: untagged by default; POST /dev/rivals turns rivals and the note on for that pool only; /dev/reset clears it', async () => {
    const t = makeTestApp(); // RIVALS unset, like the dev server (DEV_DEFAULTS: off)
    const p1 = new TestPlayer(t, 'tp1', { devPool: 'riv-1' });
    expect('computerPlayers' in (await p1.signIn()).rules).toBe(false);
    await p1.win('L2');
    expect(t.rows("SELECT rivals FROM brackets WHERE pool = 'fb:riv-1'")).toEqual([{ rivals: null }]);
    expect(await errorOf(await devPost(t, 'rivals', { devPool: 'riv-2', on: 'yes' }))).toEqual([400, 'bad_request']);
    expect(await errorOf(await devPost(t, 'rivals', { devPool: 'Not A Pool', on: true }))).toEqual([400, 'bad_request']);
    expect((await devPost(t, 'rivals', { devPool: 'riv-2', on: true }, 'rank.example.com')).status).toBe(404); // loopback only
    const r = await devPost(t, 'rivals', { devPool: 'riv-2', on: true });
    expect(r.status).toBe(200);
    expect(await json(r)).toMatchObject({ devPool: 'riv-2', on: true });
    const p2 = new TestPlayer(t, 'tp2', { devPool: 'riv-2' });
    expect((await p2.signIn()).rules.computerPlayers).toBe(true);
    const w2 = await p2.win('L2');
    expectValid(w2.bracket as BracketView);
    expect(rivalRows(w2.bracket as BracketView).length).toBeGreaterThan(0);
    expect(t.rows<{ rivals: string }>("SELECT rivals FROM brackets WHERE pool = 'fb:riv-2'")[0]?.rivals).toMatch(RIVAL_TAG_RE);
    // only that pool: another test pool and the real pool stay without
    for (const p of [new TestPlayer(t, 'tp3', { devPool: 'riv-3' }), new TestPlayer(t, 'tpreal')]) {
      expect('computerPlayers' in (await p.signIn()).rules).toBe(false);
      await p.win('L3');
    }
    expect(t.rows("SELECT pool FROM brackets WHERE rivals IS NOT NULL")).toEqual([{ pool: 'fb:riv-2' }]);
    // reset: the switch goes with the pool
    expect((await devPost(t, 'reset', { devPool: 'riv-2' })).status).toBe(200);
    expect(t.app.services.dev.rivals.has('riv-2')).toBe(false);
    const p4 = new TestPlayer(t, 'tp4', { devPool: 'riv-2' });
    expect('computerPlayers' in (await p4.signIn()).rules).toBe(false);
    await p4.win('L2');
    expect(t.rows("SELECT rivals FROM brackets WHERE pool = 'fb:riv-2'")).toEqual([{ rivals: null }]);
    // switched off explicitly
    await devPost(t, 'rivals', { devPool: 'riv-5', on: false });
    expect(t.app.services.dev.rivals.get('riv-5')).toBe(false);
  });

  it('RIVALS=on: a test pool is untagged unless testPools (the staging soak), the note shows while rivals are on', async () => {
    const t = makeTestApp({ env: ON });
    const p = new TestPlayer(t, 'soak1', { devPool: 'soak' });
    expect((await p.signIn()).rules.computerPlayers).toBe(true);
    await p.win('L2');
    expect(t.rows('SELECT rivals FROM brackets')).toEqual([{ rivals: null }]);
    const soak = makeTestApp({ env: ON, overrides: { rivals: { testPools: true } } });
    const q = new TestPlayer(soak, 'soak2', { devPool: 'soak' });
    await q.signIn();
    await q.win('L2');
    expect(soak.rows<{ rivals: string }>('SELECT rivals FROM brackets')[0]?.rivals).toMatch(RIVAL_TAG_RE);
  });
});

// ── admin and stats ───────────────────────────────────────────────────────────────────────────────────────

interface AdminRow {
  rank: number;
  kind: 'player' | 'rival';
  slot: number;
  nickname: string;
  avatarId: number;
  points: number;
  hearts: number;
  scoredAt: number;
  code?: string | null;
  hidden?: number;
  finalRank?: number | null;
  index?: number;
  arrivalAt?: number;
  paceTenthsPerHour?: number;
  builtInHearts?: number;
  realHearts?: number;
}
interface AdminBracket {
  bracket: Record<string, unknown> & { rivals: { preset: string; strength: number; roster: number; live: number; present: number; topFinal: number | null; hidden: boolean } | null };
  at: number;
  rows: AdminRow[];
  retiredRivals: { slot: number; index: number; arrivalAt: number }[];
  hiddenPlayers: { slot: number; code: string | null; hidden: number }[];
  serverTime: number;
}

describe('admin GET /admin/v1/brackets/{id} (design §7)', () => {
  it('labels every row, codes on player rows only, never the seed; ?at= clamps; ?live=1 on a final bracket equals the snapshot', async () => {
    const t = makeTestApp({ env: ON });
    const [a, b] = await playersWithWins(t, 2, 'ad');
    const id = (await a!.bracket()).bracketId as string;
    const tag = bracketRow(t, id).rivals as string;
    await admin(t, 'POST', `players/${b!.code()}/suspend`);
    const logged = t.count('SELECT COUNT(*) FROM admin_log');
    t.clock.set(T0 + 30 * MIN);
    const res = await admin(t, 'GET', `brackets/${id}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(tag.split(':')[1]);
    expect(text).not.toContain(tag);
    const body = JSON.parse(text) as AdminBracket;
    expect(body.at).toBe(T0 + 30 * MIN);
    expect(body.bracket).toMatchObject({ id, pool: 'fb', openedAt: T0, nextSlot: 2, capacityMembers: 2, finalMembers: null, finalReal: null });
    const roster = rosterOf(t, id);
    expect(body.bracket.rivals).toMatchObject({ preset: 'r1', strength: 100, roster: roster.rivals.length, live: liveRivalCount(roster, bracketRow(t, id)) });
    expect(body.bracket.rivals!.present).toBe(body.rows.filter((r) => r.kind === 'rival').length);
    expect(body.retiredRivals).toHaveLength(roster.rivals.length - body.bracket.rivals!.live);
    for (const r of body.rows) {
      expect(['player', 'rival']).toContain(r.kind);
      if (r.kind === 'player') {
        expect(r.code).toBe(a!.code());
        expect(r.index).toBeUndefined();
      } else {
        expect('code' in r).toBe(false);
        expect(r.slot).toBe(9000 + (r.index as number));
        expect(r).toMatchObject({ arrivalAt: expect.any(Number), paceTenthsPerHour: expect.any(Number), builtInHearts: r.hearts, realHearts: 0 });
      }
    }
    expect(body.hiddenPlayers).toEqual([{ slot: 1, code: b!.code(), hidden: 1 }]);
    // the players' table, labelled: the same rows a member sees
    expect(body.rows.map((r) => [r.rank, r.slot, r.points])).toEqual((await a!.bracket()).rows.map((r) => [r.rank, r.slot, r.points]));
    // ?at= is clamped to [opened_at, min(now, ends_at)]
    const early = await json<AdminBracket>(await admin(t, 'GET', `brackets/${id}?at=0`));
    expect(early.at).toBe(T0);
    expect(early.rows.filter((r) => r.kind === 'rival')).toHaveLength(roster.cohort);
    expect((await json<AdminBracket>(await admin(t, 'GET', `brackets/${id}?at=${T0 + 5 * HOUR}`))).at).toBe(T0 + 30 * MIN);
    expect((await admin(t, 'GET', `brackets/${id}?at=soon`)).status).toBe(400);
    expect((await t.fetch(`/admin/v1/brackets/${id}`)).status).toBe(401);
    expect((await admin(t, 'GET', "brackets/'1'")).status).toBe(400);
    expect((await admin(t, 'GET', 'brackets/zzzzzzzzzzzz')).status).toBe(404);
    expect(t.count('SELECT COUNT(*) FROM admin_log')).toBe(logged); // read-only: not logged
    // a heart shows as a real heart on the rival's row
    const rv = early.rows.find((r) => r.kind === 'rival') as AdminRow;
    await a!.heart(id, rv.slot);
    const hearted = (await json<AdminBracket>(await admin(t, 'GET', `brackets/${id}`))).rows.find((r) => r.slot === rv.slot) as AdminRow;
    expect(hearted).toMatchObject({ realHearts: 1, hearts: (hearted.builtInHearts as number) + 1 });
    // final: the frozen table; ?live=1 recomputes it at ends_at: the audit "frozen equals live"
    t.clock.set(T0 + DAY + HOUR);
    await a!.signIn();
    const fin = await json<AdminBracket>(await admin(t, 'GET', `brackets/${id}`));
    const live = await json<AdminBracket>(await admin(t, 'GET', `brackets/${id}?live=1`));
    expect(fin.at).toBe(T0 + DAY);
    expect(fin.bracket).toMatchObject({ finalMembers: fin.rows.length, finalReal: 1 });
    expect(live.rows).toEqual(fin.rows);
    expect(fin.rows.map((r) => [r.rank, r.slot, r.nickname, r.points, r.hearts])).toEqual((await a!.bracket()).rows.map((r) => [r.rank, r.slot, r.nickname, r.points, r.hearts]));
    expect(fin.bracket.rivals!.topFinal).toBe(Math.max(...fin.rows.filter((r) => r.kind === 'rival').map((r) => r.points)));
  });

  // 2026-10-12, D-2e-24 (review fixes): admin under the emergency hide (H-9: admin always labels computer players),
  // and what `at` moves.
  it('under hide admin still lists the computer players (rivals.hidden: true); a final snapshot shows the rows refinalize ranks with', async () => {
    const t = makeTestApp({ env: ON });
    const [a, b] = await playersWithWins(t, 2, 'ah');
    const id = (await a!.bracket()).bracketId as string;
    t.clock.set(T0 + 3 * HOUR);
    const hide = sibling(t, { env: ON, overrides: { rivals: { hide: true } } });
    // open: players see the real rows only; admin lists the same rows as without hide, and says hide is on
    const plain = await json<AdminBracket>(await admin(t, 'GET', `brackets/${id}`));
    const hidden = await json<AdminBracket>(await admin(hide, 'GET', `brackets/${id}`));
    expect(plain.bracket.rivals!.hidden).toBe(false);
    expect(hidden.bracket.rivals!.hidden).toBe(true);
    expect(hidden.rows).toEqual(plain.rows);
    expect(hidden.rows.filter((r) => r.kind === 'rival').length).toBeGreaterThan(0);
    const ah = new TestPlayer(hide, 'ah0');
    ah.device.id = a!.device.id;
    ah.device.secret = a!.device.secret;
    await ah.signIn();
    expect(rivalRows(await ah.bracket())).toEqual([]);
    // finalised by the deploy without hide (a snapshot), then viewed under hide: the frozen rows, labelled
    t.clock.set(T0 + DAY + HOUR);
    await a!.signIn();
    const fin = await a!.bracket();
    expect(fin.final).toBe(true);
    const frozen = rivalRows(fin);
    expect(frozen.length).toBeGreaterThan(0);
    const view = await json<AdminBracket>(await admin(hide, 'GET', `brackets/${id}`));
    expect(view.rows.map((r) => [r.rank, r.kind === 'rival', r.slot, r.points])).toEqual(fin.rows.map((r) => [r.rank, isRivalSlot(r.slot), r.slot, r.points]));
    expect(view.bracket.rivals).toMatchObject({ present: frozen.length, topFinal: Math.max(...frozen.map((r) => r.points)), hidden: true });
    expect(view.bracket).toMatchObject({ finalMembers: view.rows.length, finalReal: 2 });
    expect((await json<AdminBracket>(await admin(hide, 'GET', `brackets/${id}?live=1`))).rows).toEqual(view.rows); // frozen equals live, under hide too
    const r = await json<{ bracket: { finalMembers: number; finalReal: number; rivalRows: number } }>(await admin(hide, 'POST', `brackets/${id}/refinalize`));
    expect(r.bracket).toMatchObject({ finalMembers: view.rows.length, finalReal: 2, rivalRows: view.rows.filter((x) => x.kind === 'rival').length });
    expect(b).toBeDefined();
  });

  it('?at= moves only the computer players: the real rows carry their current points, K counts from the current next_slot', async () => {
    const t = makeTestApp({ env: ON });
    const ps = await playersWithWins(t, 5, 'at');
    const id = (await ps[0]!.bracket()).bracketId as string;
    t.clock.set(T0 + 60 * MIN);
    await playersWithWins(t, 1, 'atlate', 30); // a 6th join at +60 min: K = min(N, 44) < N, so rival 44 retires now
    await ps[0]!.wins([winOf(40, 3, t.clock.now()), winOf(41, 3, t.clock.now())]);
    t.clock.set(T0 + 90 * MIN);
    const current = await ps[0]!.bracket();
    const past = await json<AdminBracket>(await admin(t, 'GET', `brackets/${id}?at=${T0 + 30 * MIN}`));
    expect(past.at).toBe(T0 + 30 * MIN);
    const k = liveRivalCount(rosterOf(t, id), bracketRow(t, id));
    expect(k).toBe(44);
    // the real rows: today's totals (6 of them, the +60 min join included), not the totals at `at`
    expect(past.rows.filter((r) => r.kind === 'player').map((r) => [r.slot, r.points]).sort((x, y) => x[0]! - y[0]!)).toEqual(
      realRows(current).map((r) => [r.slot, r.points]).sort((x, y) => x[0]! - y[0]!),
    );
    // the computer players: evaluated at `at`, among the rivals live NOW (index < K); the retired ones are listed apart
    const roster = rosterOf(t, id);
    const rivals = past.rows.filter((r) => r.kind === 'rival');
    expect(rivals.map((r) => r.index).sort((x, y) => x! - y!)).toEqual(roster.rivals.slice(0, k).filter((x) => x.arrivalAt <= T0 + 30 * MIN).map((x) => x.index));
    expect(past.retiredRivals.map((r) => r.index)).toEqual(roster.rivals.slice(k).map((x) => x.index));
  });

  it('player detail marks brackets with computer players and their real size', async () => {
    const t = makeTestApp({ env: ON });
    const [a] = await playersWithWins(t, 1, 'pd');
    t.clock.set(T0 + DAY + HOUR);
    await a!.signIn();
    const d = await json<{ brackets: Record<string, unknown>[] }>(await admin(t, 'GET', `players/${a!.code()}`));
    expect(d.brackets[0]).toMatchObject({ final_real: 1, rivals: 1 });
    expect(d.brackets[0]!.final_members as number).toBeGreaterThanOrEqual(46);
  });
});

describe('cron stats with computer rivals (design §7)', () => {
  it('members_p* stay real sizes; brackets_rivals counts the brackets with computer players', async () => {
    const t = makeTestApp({ env: ON });
    await playersWithWins(t, 2, 'cs');
    t.clock.set(T0 + DAY + HOUR);
    await t.app.scheduled();
    const v = (name: string): number => t.count('SELECT v FROM stats_daily WHERE name = ?', name);
    expect([v('brackets_ended'), v('members_p50'), v('members_p90'), v('brackets_rivals')]).toEqual([1, 2, 2, 1]);
    expect(t.count('SELECT final_members FROM brackets')).toBeGreaterThan(2);

    const off = makeTestApp();
    await playersWithWins(off, 3, 'cs');
    off.clock.set(T0 + DAY + HOUR);
    await off.app.scheduled();
    expect(off.count("SELECT v FROM stats_daily WHERE name = 'brackets_rivals'")).toBe(0);
    expect(off.count("SELECT v FROM stats_daily WHERE name = 'members_p50'")).toBe(3);
  });
});
