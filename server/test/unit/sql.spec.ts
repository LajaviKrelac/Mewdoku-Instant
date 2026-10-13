// Owner: G4 (Phase 2e). SQL hygiene (spec §1.2, §1.10, §10.5 #8, §10.6 #2): every statement the app prepares
// during a full scenario reads by key or index range (EXPLAIN QUERY PLAN never shows a full SCAN of a table:
// D1 bills every row a scan touches, critic C-18); SQL is built from bound parameters only; exactly one
// statement inserts a `members` row (the join after an accepted win, or the sign-in join; H-1). 2026-10-12, D-2e-24:
// a rivals-on scenario (create with a tag, a view with computer players, a rival heart, the admin bracket route, a
// finalisation with a snapshot, a refinalize, a cron stats run) joins the probe, and the new statements are
// pinned to their keys (bracketHearts: hearts PK; giveRivalHeart: members key, brackets PK, hearts PK;
// adminBracket: members PK + players PK).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { admin, DAY, HOUR, makeTestApp, playersWithWins, SERVER_DIR, TestPlayer } from '../helpers/harness';

const TABLES = ['meta', 'players', 'brackets', 'members', 'wins', 'hearts', 'rewards', 'flags', 'seen_nonces', 'ip_quota', 'tombstones', 'admin_log', 'stats_daily'];

/** Statements allowed a full scan, with the reason. */
const ALLOWED_SCANS: { readonly match: RegExp; readonly why: string }[] = [
  { match: /^SELECT 1 AS ok$/, why: 'the health probe touches no table' },
];

async function scenario(): Promise<Set<string>> {
  const t = makeTestApp();
  const ps = await playersWithWins(t, 6, 'x');
  const v = await ps[0]!.bracket();
  await ps[0]!.heart(v.bracketId!, v.rows[1]!.slot);
  await ps[1]!.profile({ nickname: { adj: 3, noun: 4, num: 5 }, avatarId: 3, listed: false });
  await ps[1]!.profile({ listed: true });
  await ps[2]!.win('L99'); // a level jump flag
  await ps[3]!.me();
  // Leaderboard update: the auto-join at sign-in and the presence ping.
  const joiner = new TestPlayer(t, 'x-join', { join: true });
  await joiner.signIn();
  await joiner.presence('playing');
  t.clock.advance(DAY + HOUR);
  for (const p of ps) await p.signIn();
  const ended = await ps[0]!.bracket();
  await ps[0]!.claim(ended.result!.reward!.rewardId, true);
  await admin(t, 'GET', 'flags');
  await admin(t, 'GET', `players/${ps[2]!.code()}`);
  await admin(t, 'POST', `players/${ps[2]!.code()}/suspend`);
  await admin(t, 'POST', `players/${ps[2]!.code()}/reinstate`);
  await admin(t, 'POST', `players/${ps[2]!.code()}/reset-nickname`);
  await admin(t, 'POST', `brackets/${ended.bracketId!}/refinalize`);
  await admin(t, 'GET', 'stats?days=3');
  await ps[4]!.rawMe('DELETE');
  await admin(t, 'DELETE', `players/${ps[5]!.code()}`);
  await t.app.scheduled(Date.parse('2026-12-20T03:17:00Z'));
  await t.fetch('/v1/health');
  return t.rec.seen;
}

/** D-2e-24: the same paths with computer rivals on (their statements differ: the tag, the hearts reads, the totals). */
async function rivalsScenario(): Promise<Set<string>> {
  const t = makeTestApp({ env: { RIVALS: 'on' } });
  const ps = await playersWithWins(t, 3, 'rv');
  t.clock.advance(2 * HOUR + 60_000);
  const v = await ps[0]!.bracket();
  const rival = v.rows.find((r) => r.slot >= 9000)!;
  await ps[0]!.heart(v.bracketId!, rival.slot);
  await ps[1]!.bracket(); // a view that reads the bracket's heart pairs
  await admin(t, 'GET', `brackets/${v.bracketId!}`);
  t.clock.advance(DAY);
  await t.app.scheduled(); // finalisation with a snapshot + the stats rollup
  await ps[0]!.signIn();
  await ps[0]!.bracket();
  await admin(t, 'GET', `brackets/${v.bracketId!}?live=1`);
  await admin(t, 'POST', `brackets/${v.bracketId!}/refinalize`);
  await admin(t, 'GET', `players/${ps[0]!.code()}`);
  return t.rec.seen;
}

/** The EXPLAIN QUERY PLAN lines of a statement (bound values null). */
function planOf(probe: ReturnType<typeof makeTestApp>, sql: string): string[] {
  const params = (sql.match(/\?/g) ?? []).map(() => null);
  return (probe.db.raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as { detail: string }[]).map((r) => r.detail);
}

describe('sql: every statement uses an index (EXPLAIN QUERY PLAN)', () => {
  it('no full table scan in the hot paths, the cron, the sweep, admin (computer rivals off and on)', async () => {
    const seen = new Set([...(await scenario()), ...(await rivalsScenario())]);
    expect(seen.size).toBeGreaterThan(40);
    const probe = makeTestApp();
    const problems: string[] = [];
    for (const sql of seen) {
      if (ALLOWED_SCANS.some((a) => a.match.test(sql.trim()))) continue;
      for (const detail of planOf(probe, sql)) {
        const m = /^SCAN (\w+)/.exec(detail);
        if (m && TABLES.includes(m[1] as string)) problems.push(`${detail}  ←  ${sql.replace(/\s+/g, ' ').slice(0, 160)}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('[D-2e-24] the rival statements read by key: bracketHearts, giveRivalHeart, adminBracket, the stats window', async () => {
    const seen = [...(await rivalsScenario())];
    const probe = makeTestApp();
    const find = (re: RegExp): string => {
      const sql = seen.find((x) => re.test(x.replace(/\s+/g, ' ')));
      expect(sql, String(re)).toBeDefined();
      return sql as string;
    };
    expect(planOf(probe, find(/^SELECT from_slot, to_slot FROM hearts WHERE bracket_id = \?$/))).toEqual(['SEARCH hearts USING PRIMARY KEY (bracket_id=?)']);
    const give = planOf(probe, find(/^INSERT INTO hearts .* rivals IS NOT NULL/));
    expect(give.some((d) => /^SEARCH members USING (COVERING INDEX|PRIMARY KEY|INDEX)/.test(d))).toBe(true);
    expect(give.some((d) => /^SEARCH brackets USING INDEX sqlite_autoindex_brackets_1 \(id=\?\)/.test(d))).toBe(true);
    expect(give.some((d) => /^SEARCH hearts USING PRIMARY KEY \(bracket_id=\? AND from_slot=\?\)/.test(d))).toBe(true);
    expect(planOf(probe, find(/^SELECT COUNT\(\*\) AS n FROM hearts WHERE bracket_id = \? AND to_slot = \?$/))).toEqual(['SEARCH hearts USING PRIMARY KEY (bracket_id=?)']);
    expect(planOf(probe, find(/^SELECT m\.\*, p\.code FROM members m LEFT JOIN players p/))).toEqual([
      'SEARCH m USING PRIMARY KEY (bracket_id=?)',
      'SEARCH p USING INDEX sqlite_autoindex_players_1 (key=?) LEFT-JOIN',
    ]);
    expect(planOf(probe, find(/^SELECT final_members, final_real, members, CASE WHEN rivals IS NULL/))).toEqual(['SEARCH brackets USING INDEX brackets_ended (ends_at>? AND ends_at<?)']);
    // the create carries the tag; the finalisation writes the totals; no other win, join or member statement changed
    expect(seen.some((x) => /INSERT INTO brackets \(id, pool, mode, opened_at, join_until, ends_at, members, next_slot, max_members, rivals\)/.test(x))).toBe(true);
    expect(seen.some((x) => x.includes('UPDATE brackets SET finalized_at = ?, final_members = ?, final_real = ?, final_rivals = ? WHERE id = ? AND finalized_at IS NULL'))).toBe(true);
  });
});

describe('sql: hygiene', () => {
  const src = readFileSync(join(SERVER_DIR, 'src', 'store', 'sql-store.ts'), 'utf8');

  it('values are always bound: interpolation in SQL only for placeholders and fixed fragments', () => {
    // Every ${…} inside a SQL template must be one of the reviewed fixed fragments (no request value ever).
    const allowed = new Set([
      'marks(puzzleIds.length)',
      'marks(winIds.length)',
      'marks(chunk.length)',
      'marks(ids.length)',
      'marks(pools.length)',
      "chunk.map(() => '(?, ?, ?)').join(', ')",
      'merge',
      "chunk.map(() => 'WHEN ? THEN ?').join(' ')",
      'rows',
      'RUNNING',
      'memberGuard',
      'cooldown',
      'open',
      'mine',
      'inPools',
      'players',
      'freeGuard',
      'newGuard',
      'poolGuard', // integration I-6: "the pool has no joinable bracket" on a create (a fixed fragment; its values are bound)
      'cas', // audit A-S3: "the player's wins token is the one this request read" (a fixed fragment; its values are bound)
      'placed', // audit A-S3: the batch's rest applies only with its wins (a fixed fragment; its values are bound)
      "input.wins.map(() => '(NOT EXISTS (SELECT 1 FROM wins WHERE player_key = ? AND puzzle_id = ?) AND NOT EXISTS (SELECT 1 FROM wins WHERE player_key = ? AND win_id = ?))').join(' OR ')",
      "guardFinal ? 'EXISTS (SELECT 1 FROM brackets WHERE id = ? AND finalized_at IS NULL)' : '1 = 1'",
      'guard',
      'p.listed ? CLEAR_UNLISTED : SET_UNLISTED',
      'SET_SUSPENDED',
      'CLEAR_SUSPENDED',
    ]);
    const found = new Set<string>();
    for (const m of src.matchAll(/`([^`]*)`/g)) {
      const body = m[1] as string;
      if (!/\b(SELECT|INSERT|UPDATE|DELETE)\b/.test(body)) continue;
      for (const x of body.matchAll(/\$\{([^}]*)\}/g)) found.add(x[1] as string);
    }
    expect([...found].filter((x) => !allowed.has(x))).toEqual([]);
    // and no string concatenation into SQL
    expect(src).not.toMatch(/(SELECT|INSERT|UPDATE|DELETE)[^`'\n]*['"]\s*\+\s*[a-z]/);
  });

  it('[D-2e-24] computer players are never rows: no statement writes a members, players or rewards row for one', () => {
    // the only new writes are the tag in the bracket create, the totals of finalize/refinalize and a hearts row
    expect([...src.matchAll(/INSERT INTO players/g)]).toHaveLength(1);
    expect([...src.matchAll(/INSERT INTO rewards/g)]).toHaveLength(1);
    expect([...src.matchAll(/INSERT INTO hearts/g)]).toHaveLength(2); // a real heart and a rival heart
  });

  it('exactly one statement inserts a members row: the join in writeWins (H-1)', () => {
    const all = [...src.matchAll(/INSERT INTO members/g)];
    expect(all).toHaveLength(1);
    const before = src.slice(0, all[0]!.index);
    expect(before.lastIndexOf('async writeWins(')).toBeGreaterThan(before.lastIndexOf('async ', before.lastIndexOf('async writeWins(') - 1) - 1);
    // no other file of the server writes SQL
    expect(readFileSync(join(SERVER_DIR, 'src', 'handlers', 'wins.ts'), 'utf8')).not.toMatch(/INSERT INTO|UPDATE \w+ SET|DELETE FROM/);
  });

  it('no SQLite-only syntax that a Postgres driver could not take (INSERT OR IGNORE, date functions)', () => {
    expect(src).not.toMatch(/INSERT OR (IGNORE|REPLACE)/);
    expect(src).not.toMatch(/\b(datetime|strftime|julianday|date)\(/i);
    expect(src).not.toMatch(/ [|&] (?=\d)|~\s*\d/); // no bit operators
  });
});
