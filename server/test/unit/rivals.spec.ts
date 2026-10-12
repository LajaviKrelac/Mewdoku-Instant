// Owner: G4 (Phase 2e). Computer rivals, preset r1 (2026-10-12, D-2e-24; design §3, §4.1, §5.1–5.2, §12.2):
// the purity grep, the golden fixture (FROZEN: add r2, never edit r1), the order guarantee inside the join
// window, monotonicity, the K rule, names, the calibration bands, the snapshot codec, the combined tables,
// the finalisation plan, rival heart targets, and the switches (config + who gets rivals).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isDisplayText } from '../../src/contract';
import { NICK_WORDS_V1, RETIRED_V1 } from '../../src/contract/words';
import { paidPlaces, rankRows } from '../../src/core/brackets';
import { DEFAULT_CONFIG, loadConfig, type ServerConfig } from '../../src/core/config';
import { seededRng, type Rng } from '../../src/core/crypto';
import { rewardId } from '../../src/core/ids';
import { isBlocked } from '../../src/core/moderation';
import {
  decodeFinalRivals,
  encodeFinalRivals,
  FINAL_RIVALS_MAX_CHARS,
  isRivalSlot,
  liveRivalCount,
  newRivalsTag,
  parseRivalsTag,
  RIVAL_SLOT_BASE,
  RIVAL_TAG_RE,
  rivalAt,
  rivalNames,
  rivalRoster,
  type FinalRival,
  type Roster,
} from '../../src/core/rivals';
import { finalPlan, finalTable, freezeTable, liveRivalCountOf, liveTable, pointsForRank, rivalHeartTarget, withRealHearts, type RankedRow } from '../../src/core/table';
import { makeServices, rivalsForPool, rivalsNoteFor, type DevState } from '../../src/services';
import type { BracketRow, MemberRow } from '../../src/store/rows';
import { DAY, HOUR, SERVER_DIR } from '../helpers/harness';

const MIN = 60_000;
const FROZEN = 'presets are frozen: add r2, never edit r1';

// ── fixtures ──────────────────────────────────────────────────────────────────────────────────────────────

/** Design §3.8: the golden tag and bracket (rolling, 2026-10-12T08:00Z, join +2 h, end +24 h, 50 places). */
const GOLD_TAG = 'r1:k3j9x0a1b20a:100:64:64';
const O = Date.parse('2026-10-12T08:00:00Z');

function bracket(over: Partial<BracketRow> = {}): BracketRow {
  return {
    id: 'mgk1a2b3c4d5e6',
    pool: 'fb',
    mode: 'rolling',
    opened_at: O,
    join_until: O + 2 * HOUR,
    ends_at: O + DAY,
    members: 1,
    next_slot: 1,
    max_members: 50,
    finalized_at: null,
    final_members: null,
    rivals: GOLD_TAG,
    final_rivals: null,
    final_real: null,
    ...over,
  };
}

function member(slot: number, over: Partial<MemberRow> = {}): MemberRow {
  return {
    bracket_id: 'mgk1a2b3c4d5e6',
    slot,
    player_key: `key-${slot}`,
    nickname: slot === 0 ? 'Velvet Pounce 27' : `Player ${slot}`,
    avatar: 1,
    points: 0,
    wins: 0,
    hearts: 0,
    hearts_seen: 0,
    hearts_self: 0,
    scored_at: O,
    joined_at: O,
    hidden: 0,
    final_rank: null,
    ...over,
  };
}

/** A uniform integer lo…hi from test randomness. */
function int(rng: Rng, lo: number, hi: number): number {
  const b = rng.bytes(4);
  const u = (((b[0] as number) << 24) | ((b[1] as number) << 16) | ((b[2] as number) << 8) | (b[3] as number)) >>> 0;
  return lo + (u % (hi - lo + 1));
}

/** n tagged brackets: rolling ones opened at varied times of day (so sleep windows vary) and, every 10th, a utc_day one. */
function brackets(n: number, seed: number, utcDay = true): BracketRow[] {
  const rng = seededRng(seed);
  const out: BracketRow[] = [];
  for (let g = 0; g < n; g++) {
    const tag = newRivalsTag(100, rng, NICK_WORDS_V1);
    if (utcDay && g % 10 === 9) {
      const day = Date.parse('2026-10-12T00:00:00Z');
      const opened = day + int(rng, 0, 21 * 60) * MIN + int(rng, 0, MIN - 1);
      out.push(bracket({ mode: 'utc_day', rivals: tag, opened_at: opened, join_until: day + 22 * HOUR, ends_at: day + DAY }));
    } else {
      const opened = O + int(rng, 0, DAY - 1);
      out.push(bracket({ rivals: tag, opened_at: opened, join_until: opened + 2 * HOUR, ends_at: opened + DAY }));
    }
  }
  return out;
}

const roster = (b: BracketRow): Roster => rivalRoster(b.rivals, b) as Roster;
const top5 = (rows: readonly RankedRow[]): string[] => rows.slice(0, 5).map((r) => `${r.kind === 'player' ? 'ME' : r.slot}:${r.points}`);
const median = (xs: readonly number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;
const pct = (xs: readonly number[], q: number): number => [...xs].sort((a, b) => a - b)[Math.floor(q * (xs.length - 1))] as number;

/** The golden real player (design §3.8): 4 wins at 0:00–0:12 (11 fish), 5 at 5:00–5:14 (12), 6 at 20:00–20:20 (16). */
function goldPlayerAt(t: number): MemberRow {
  const h = (t - O) / HOUR;
  if (h >= 20 + 20 / 60) return member(0, { points: 39, wins: 15, scored_at: O + 20 * HOUR + 20 * MIN });
  if (h >= 5 + 14 / 60) return member(0, { points: 23, wins: 9, scored_at: O + 5 * HOUR + 14 * MIN });
  return member(0, { points: 11, wins: 4, scored_at: O + 12 * MIN });
}

// ── 1. purity ─────────────────────────────────────────────────────────────────────────────────────────────

describe('r1 purity and determinism (design §3.2)', () => {
  const strip = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  it('core/rivals.ts and core/table.ts use no clock, no randomness and no float maths', () => {
    for (const file of ['src/core/rivals.ts', 'src/core/table.ts']) {
      const src = readFileSync(join(SERVER_DIR, file), 'utf8');
      // The tag's seed is the one random value: newRivalsTag draws it from the INJECTED rng (randomBase36).
      const imports = src.split('\n').filter((l) => /from '\.\/crypto'/.test(l));
      expect(imports, file).toEqual(file.endsWith('rivals.ts') ? ["import { randomBase36, type Rng } from './crypto';"] : []);
      const code = strip(src.replace(/^import .* from '\.\/crypto';$/m, ''));
      for (const banned of [/Math\.random/, /Date\.now/, /new Date\b/, /performance\./, /\bcrypto\b/, /Math\.pow/, /Math\.sqrt/, /Math\.exp/, /Math\.log/, /\*\*/, /from '\.\/clock'/]) {
        expect(banned.test(code), `${file}: ${String(banned)}`).toBe(false);
      }
    }
  });
  it('the same tag and bracket always give the same roster; another seed gives another', () => {
    const b = bracket();
    expect(JSON.stringify(rivalRoster(GOLD_TAG, b))).toBe(JSON.stringify(rivalRoster(GOLD_TAG, { ...b })));
    const other = rivalRoster('r1:k3j9x0a1b20b:100:64:64', b) as Roster;
    expect(other.rivals.map((r) => r.arrivalAt)).not.toEqual(roster(b).rivals.map((r) => r.arrivalAt));
  });
});

// ── 2. golden ─────────────────────────────────────────────────────────────────────────────────────────────

describe('r1 golden fixture (design §3.8)', () => {
  const b = bracket();
  const r = roster(b);
  it('bracket parameters', () => {
    expect([r.size, r.rivals.length, r.sigma, r.quiet, r.cohort], FROZEN).toEqual([50, 49, 105, false, 10]);
    expect(r.rivals.map((x) => x.slot), FROZEN).toEqual(Array.from({ length: 49 }, (_, i) => 9000 + i));
  });
  it('rival 9000: script and points over the day', () => {
    const x = r.rivals[0] as Roster['rivals'][number];
    expect([x.arrivalAt - O, x.base, x.pace, x.wins.length, x.hearts.length], FROZEN).toEqual([0, 3, 16, 14, 8]);
    expect(
      x.wins.map((w) => [Math.floor((w.t - O) / MIN), w.f]),
      FROZEN,
    ).toEqual([
      [415, 3], [417, 3], [420, 3], [421, 3], [424, 3],
      [490, 3], [492, 3], [495, 3], [498, 2], [499, 3],
      [706, 2], [711, 3], [713, 1], [718, 1],
    ]);
    expect(x.hearts.slice(0, 2).map((h) => (h - O) / MIN), FROZEN).toEqual([175, 248]);
    const at = (h: number) => rivalAt(x, b.join_until, O + h * HOUR);
    expect(at(1), FROZEN).toEqual({ points: 4, scoredAt: O + 37.5 * MIN, hearts: 0 });
    expect(at(2), FROZEN).toEqual({ points: 6, scoredAt: O + 112.5 * MIN, hearts: 0 });
    expect(at(6), FROZEN).toEqual({ points: 6, scoredAt: O + 112.5 * MIN, hearts: 2 });
    const end = at(23);
    expect([end?.points, Math.floor(((end?.scoredAt ?? 0) - O) / 6000) / 10, end?.hearts], FROZEN).toEqual([42, 718.2, 8]);
  });
  it('rival 9048 and the present counts', () => {
    const y = r.rivals[48] as Roster['rivals'][number];
    expect([y.arrivalAt - O, y.base, y.pace], FROZEN).toEqual([114 * MIN, 1, 1]);
    const present = (t: number) => r.rivals.filter((z) => rivalAt(z, b.join_until, t) !== null).length;
    expect([present(O), present(O + HOUR), present(O + 2 * HOUR)], FROZEN).toEqual([10, 30, 49]);
  });
  it('names, avatars and the rename', () => {
    const names = rivalNames(r, new Set(['velvet pounce 27']), NICK_WORDS_V1, RETIRED_V1);
    expect([9000, 9001, 9002, 9003, 9048].map((s) => names.get(s)), FROZEN).toEqual([
      { nickname: 'Calm Pumpkin 6', avatar: 6 },
      { nickname: 'Bouncy Comet 62', avatar: 2 },
      { nickname: 'Sweet Fern 70', avatar: 8 },
      { nickname: 'Cloudy Cupcake 74', avatar: 3 },
      { nickname: 'Brave Noodle 85', avatar: 4 },
    ]);
    const renamed = rivalNames(r, new Set(['velvet pounce 27', 'calm pumpkin 6']), NICK_WORDS_V1, RETIRED_V1);
    expect(renamed.get(9000), FROZEN).toEqual({ nickname: 'Silky Tuft 44', avatar: 6 });
    expect(renamed.get(9001), FROZEN).toEqual(names.get(9001));
  });
  it('the whole bracket with one real player who wins 15 times at 39 fish', () => {
    const view = (h: number) => {
      const t = O + h * HOUR;
      const rows = liveTable(b, [goldPlayerAt(t)], t, false);
      return { rows: rows.length, top: top5(rows), me: rows.find((x) => x.kind === 'player')?.rank };
    };
    expect(view(1), FROZEN).toEqual({ rows: 31, top: ['ME:11', '9000:4', '9001:4', '9002:4', '9003:4'], me: 1 });
    expect(view(2), FROZEN).toEqual({ rows: 50, top: ['ME:11', '9000:6', '9001:5', '9002:5', '9003:5'], me: 1 });
    expect(view(6), FROZEN).toEqual({ rows: 50, top: ['9001:27', '9002:24', 'ME:23', '9005:16', '9009:16'], me: 3 });
    expect(view(12), FROZEN).toEqual({ rows: 50, top: ['9000:42', '9001:38', '9002:30', 'ME:23', '9009:21'], me: 4 });
    expect(view(23), FROZEN).toEqual({ rows: 50, top: ['9000:42', 'ME:39', '9001:38', '9003:34', '9004:32'], me: 2 });
    // Final: 2nd behind a rival, paid the 2nd place (1 hint + 1 kitty); the rival's 1st is not paid.
    const plan = finalPlan(b, [goldPlayerAt(O + DAY)], DEFAULT_CONFIG, O + DAY + HOUR, true);
    expect(plan.ranks).toEqual([{ slot: 0, rank: 2 }]);
    expect(plan.rewards.map((w) => [w.id, w.place, w.hints, w.kitties, w.playerKey])).toEqual([['mgk1a2b3c4d5e6:0', 2, 1, 1, 'key-0']]);
    // Rivals hold 1st and 3rd: both places unpaid, not passed down.
    expect([plan.totals.finalMembers, plan.totals.finalReal, plan.rivalPlaces]).toEqual([50, 1, 2]);
    expect(freezeTable(b, [goldPlayerAt(O + DAY)], false).slice(0, 3).map((x) => x.kind)).toEqual(['rival', 'player', 'rival']);
  });
});

// ── 3. order inside the join window ───────────────────────────────────────────────────────────────────────

describe('order guarantee inside the join window (design §3.4)', () => {
  it('500 tags, every minute up to join_until: rival i ranks above rival i + 1 (and arrives no later)', () => {
    let checked = 0;
    for (const b of brackets(500, 31, false)) {
      const r = roster(b);
      for (let t = b.opened_at; t <= b.join_until; t += MIN) {
        let prev: { points: number; scoredAt: number } | null = null;
        let gone = false;
        for (const x of r.rivals) {
          const v = rivalAt(x, b.join_until, t);
          if (v === null) {
            gone = true;
            continue;
          }
          if (gone) expect.fail(`${b.rivals} t=${t}: rival ${x.index} is present while an earlier one is not`);
          if (prev) {
            const ahead = prev.points > v.points || (prev.points === v.points && prev.scoredAt <= v.scoredAt);
            if (!ahead) expect.fail(`${b.rivals} t=${t}: rival ${x.index - 1} not above ${x.index}`);
          }
          prev = v;
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(500 * 49 * 40);
  });
  it('utc_day windows (up to 22 h) keep the order too', () => {
    const days = brackets(200, 32).filter((x) => x.mode === 'utc_day');
    expect(days.length).toBe(20);
    for (const b of days) {
      const r = roster(b);
      for (let t = b.opened_at; t <= b.join_until; t += 5 * MIN) {
        const v = r.rivals.map((x) => rivalAt(x, b.join_until, t));
        for (let i = 1; i < v.length; i++) {
          const a = v[i - 1],
            c = v[i];
          if (c === null || c === undefined) continue;
          if (!a || !(a.points > c.points || (a.points === c.points && a.scoredAt <= c.scoredAt))) expect.fail(`${b.rivals}: order at ${t}`);
        }
      }
    }
  });
});

// ── 4. monotone ───────────────────────────────────────────────────────────────────────────────────────────

describe('monotone over the day (design §3.4)', () => {
  it('500 tags, every 5 min over [opened_at, ends_at + 1 h]: nothing falls, the present set only grows', () => {
    for (const b of brackets(500, 41)) {
      const r = roster(b);
      for (const x of r.rivals) {
        expect(x.arrivalAt).toBeGreaterThanOrEqual(b.opened_at);
        expect(x.arrivalAt).toBeLessThan(b.join_until);
        for (const w of x.wins) {
          if (!(w.t > b.join_until && w.t < b.ends_at)) expect.fail(`${b.rivals}: win at ${w.t} outside (join_until, ends_at)`);
          if (![1, 2, 3].includes(w.f)) expect.fail(`fish ${w.f}`);
        }
        for (const h of x.hearts) if (!(h >= x.arrivalAt && h < b.ends_at)) expect.fail(`heart at ${h}`);
        let prev: { points: number; scoredAt: number; hearts: number } | null = null;
        for (let at = b.opened_at; at <= b.ends_at + HOUR; at += 5 * MIN) {
          const t = Math.min(at, b.ends_at); // the caller's clamp
          const v = rivalAt(x, b.join_until, t);
          if (v === null) {
            if (prev !== null) expect.fail('a present rival vanished');
            continue;
          }
          if (v.scoredAt > t || v.scoredAt < x.arrivalAt) expect.fail(`scoredAt ${v.scoredAt} outside [arrival, t=${t}]`);
          if (prev && (v.points < prev.points || v.scoredAt < prev.scoredAt || v.hearts < prev.hearts)) expect.fail(`${b.rivals}: rival ${x.index} fell at ${t}`);
          prev = v;
        }
        // At the end: base + window gain + every win's fish; every built-in heart.
        const end = rivalAt(x, b.join_until, b.ends_at);
        const window = Math.floor(((b.join_until - x.arrivalAt) * x.pace) / 36_000_000);
        expect(end).toEqual({ points: x.base + window + x.wins.reduce((s, w) => s + w.f, 0), scoredAt: end?.scoredAt, hearts: x.hearts.length });
      }
    }
  });
  it('the roster is strength-ordered: arrival never earlier, base and pace never higher, by index', () => {
    for (const b of brackets(200, 42)) {
      const rv = roster(b).rivals;
      for (let i = 1; i < rv.length; i++) {
        const a = rv[i - 1] as (typeof rv)[number],
          c = rv[i] as (typeof rv)[number];
        expect(a.arrivalAt <= c.arrivalAt && a.base >= c.base && a.pace >= c.pace).toBe(true);
      }
    }
  });
});

// ── 5. the K rule ─────────────────────────────────────────────────────────────────────────────────────────

describe('the K rule (design §3.5, §4.3)', () => {
  it('liveRivalCount edges: a full bracket, max_members < 2, a bracket shorter than a minute', () => {
    const r = roster(bracket());
    expect(liveRivalCount(r, { next_slot: 1, max_members: 50 })).toBe(49);
    expect(liveRivalCount(r, { next_slot: 4, max_members: 50 })).toBe(46);
    expect(liveRivalCount(r, { next_slot: 50, max_members: 50 })).toBe(0);
    expect(liveRivalCount(r, { next_slot: 75, max_members: 50 })).toBe(0);
    expect(liveRivalCount(r, { next_slot: 0, max_members: 50 })).toBe(49); // never more than the roster
    const one = rivalRoster(GOLD_TAG, { ...bracket(), max_members: 1 }) as Roster;
    expect([one.size, one.rivals.length, liveRivalCount(one, { next_slot: 0, max_members: 1 })]).toEqual([0, 0, 0]);
    const short = rivalRoster(GOLD_TAG, { ...bracket(), join_until: O + 30_000, ends_at: O + 59_999 }) as Roster;
    expect([short.size, short.rivals.length]).toEqual([0, 0]);
    // T ≤ max_members: a 20-place bracket has 19 rivals at most, and rows never pass 20.
    const small = bracket({ max_members: 20 });
    expect(roster(small).rivals.length).toBe(19);
    expect(liveTable(small, [member(0)], small.join_until, false).length).toBe(20);
    // K = max_members − next_slot (design §3.5): 49 real players leave one place (T = 50 here), 50 leave none.
    const reals = Array.from({ length: 50 }, (_, i) => member(i, { points: i, scored_at: O + i }));
    const fortyNine = liveTable(bracket({ next_slot: 49, members: 49 }), reals.slice(0, 49), O + 2 * HOUR, false);
    expect([fortyNine.length, fortyNine.filter((x) => x.kind === 'rival').map((x) => x.slot)]).toEqual([50, [9000]]);
    const full = bracket({ next_slot: 50, members: 50 });
    const old = rankRows(reals.map((m) => ({ ...m, scoredAt: m.scored_at }))).map((m) => [m.slot, m.rank]);
    expect(liveTable(full, reals, full.join_until, false).map((x) => [x.slot, x.rank])).toEqual(old);
  });

  it('random joins, hides and deletes: rows ≤ max_members; a join retires at most index K − 1 (the lowest present rival); nothing returns', () => {
    const rng = seededRng(51);
    for (const b0 of brackets(100, 52)) {
      const b = { ...b0 } as { -readonly [K in keyof BracketRow]: BracketRow[K] };
      let members: MemberRow[] = [member(0, { joined_at: b.opened_at, scored_at: b.opened_at, points: int(rng, 1, 3) })];
      const joins = int(rng, 0, 60);
      type Ev = { t: number; kind: 'join' | 'hide' | 'unhide' | 'delete' };
      const evs: Ev[] = [];
      for (let j = 0; j < joins; j++) evs.push({ t: int(rng, b.opened_at, b.join_until - 1), kind: 'join' });
      for (let j = 0; j < int(rng, 0, 12); j++) evs.push({ t: int(rng, b.opened_at, b.ends_at), kind: (['hide', 'unhide', 'delete'] as const)[int(rng, 0, 2)] as Ev['kind'] });
      evs.sort((x, y) => x.t - y.t);
      const retired = new Set<number>();
      const rivalSlots = (rows: readonly RankedRow[]) => rows.filter((x) => x.kind === 'rival').map((x) => x.slot);
      for (const ev of evs) {
        const before = liveTable(b, members, ev.t, false);
        const kBefore = liveRivalCount(roster(b), b);
        if (ev.kind === 'join') {
          if (members.length >= b.max_members || ev.t >= b.join_until) continue; // the member insert's guards
          members = [...members, member(b.next_slot, { joined_at: ev.t, scored_at: ev.t, points: int(rng, 1, 3) })];
          b.next_slot += 1;
          b.members = members.length;
        } else if (members.length > 1) {
          const victim = members[int(rng, 1, members.length - 1)] as MemberRow;
          if (ev.kind === 'delete') members = members.filter((m) => m !== victim);
          else members = members.map((m) => (m === victim ? { ...m, hidden: ev.kind === 'hide' ? 2 : 0 } : m));
        }
        const after = liveTable(b, members, ev.t, false);
        expect(after.length).toBeLessThanOrEqual(b.max_members);
        const was = rivalSlots(before),
          now = rivalSlots(after);
        const removed = was.filter((s) => !now.includes(s));
        expect(now.filter((s) => !was.includes(s)), 'no rival appears at a join, hide or delete').toEqual([]);
        if (ev.kind !== 'join') {
          expect(removed).toEqual([]);
          continue;
        }
        expect(removed.length).toBeLessThanOrEqual(1);
        if (removed.length === 1) {
          expect(removed[0]).toBe(RIVAL_SLOT_BASE + kBefore - 1);
          expect(was[was.length - 1], 'the removed rival was the lowest-ranked rival row').toBe(removed[0]);
        }
        for (let i = liveRivalCount(roster(b), b); i < kBefore; i++) retired.add(RIVAL_SLOT_BASE + i);
        for (const s of now) expect(retired.has(s)).toBe(false);
      }
      for (let t = b.opened_at; t <= b.ends_at; t += 2 * HOUR) {
        const rows = liveTable(b, members, t, false);
        expect(rows.length).toBeLessThanOrEqual(b.max_members);
        for (const s of rivalSlots(rows)) expect(retired.has(s), 'a retired rival never returns').toBe(false);
      }
    }
  });

  // 2026-10-12, D-2e-24 (review fix): bracketView and the admin route read the bracket row and the members as two
  // statements; a join committing between them leaves a stale next_slot beside the new member.
  it('a stale bracket row (next_slot n) beside n + 1 members: still ≤ max_members rows, and the rival that join retired stays gone', () => {
    const at = O + 119 * MIN; // every rival of the golden bracket has arrived (the last at +114 min)
    const reals = Array.from({ length: 11 }, (_, i) => member(i, { points: 1 + (i % 3), scored_at: O + i * MIN, joined_at: O + i * MIN }));
    const stale = bracket({ next_slot: 10, members: 10 }); // read before the 11th member's join committed
    const fresh = bracket({ next_slot: 11, members: 11 });
    const r = roster(stale);
    expect(liveRivalCount(r, stale)).toBe(40); // K from the stale row alone: 11 + 40 = 51 rows
    expect(liveRivalCountOf(r, stale, reals)).toBe(39);
    expect(liveRivalCountOf(r, fresh, reals)).toBe(39);
    const rows = liveTable(stale, reals, at, false);
    expect(rows.length).toBe(50);
    expect(rows.map((x) => x.slot)).not.toContain(RIVAL_SLOT_BASE + 39);
    expect(rows).toEqual(liveTable(fresh, reals, at, false));
    expect(freezeTable(stale, reals, false)).toEqual(freezeTable(fresh, reals, false));
    // consistent reads are unchanged: hidden and deleted members never move K (next_slot keeps the deleted slots)
    expect(liveRivalCountOf(r, bracket({ next_slot: 5 }), [member(0), member(2, { hidden: 2 })])).toBe(liveRivalCount(r, bracket({ next_slot: 5 })));
    expect(liveRivalCountOf(r, bracket({ next_slot: 0 }), [])).toBe(49);
    // a sweep: after every random join, the table from the bracket row read BEFORE it equals the consistent one
    const rng = seededRng(53);
    for (const b0 of brackets(60, 54)) {
      const b = { ...b0 } as { -readonly [K in keyof BracketRow]: BracketRow[K] };
      let members: MemberRow[] = [member(0, { joined_at: b.opened_at, scored_at: b.opened_at, points: int(rng, 1, 3) })];
      const times = Array.from({ length: int(rng, 0, 55) }, () => int(rng, b.opened_at, b.join_until - 1)).sort((x, y) => x - y);
      for (const t of times) {
        if (members.length >= b.max_members) break;
        const before = { ...b };
        members = [...members, member(b.next_slot, { joined_at: t, scored_at: t, points: int(rng, 1, 3) })];
        b.next_slot += 1;
        b.members = members.length;
        const consistent = liveTable(b, members, t, false);
        expect(liveTable(before, members, t, false)).toEqual(consistent);
        expect(consistent.length).toBeLessThanOrEqual(b.max_members);
      }
    }
  });
});

// ── 6. names ──────────────────────────────────────────────────────────────────────────────────────────────

describe('rival names (design §3.6)', () => {
  it('unique, never a member name (case-insensitive), never blocked, avatars 0–11, from our lists', () => {
    let fortyFive = 0;
    for (const b of brackets(300, 61)) {
      const r = roster(b);
      const names = [...rivalNames(r, new Set(['velvet pounce 27']), NICK_WORDS_V1, RETIRED_V1).values()];
      expect(new Set(names.map((n) => n.nickname.toLowerCase())).size).toBe(names.length);
      for (const n of names) {
        expect(isBlocked(n.nickname)).toBe(false);
        expect(n.nickname.toLowerCase()).not.toBe('velvet pounce 27');
        expect(n.avatar >= 0 && n.avatar <= 11 && Number.isInteger(n.avatar)).toBe(true);
        const m = /^(\S+) (\S+) (\d+)$/.exec(n.nickname);
        expect(m && NICK_WORDS_V1.adj.includes(m[1] as string) && NICK_WORDS_V1.noun.includes(m[2] as string) && Number(m[3]) >= 1 && Number(m[3]) <= 99).toBeTruthy();
        if (n.nickname.endsWith(' 45')) fortyFive++;
      }
    }
    // "… 45" reads "as" to the blocklist: about 1 in 99 first candidates, so ≈ 150 here without the check.
    expect(isBlocked('Calm Pumpkin 45')).toBe(true);
    expect(fortyFive).toBe(0);
  });
  it('an adversarial set (the rivals own first picks, upper-cased members) moves every rival to a free name', () => {
    const b = bracket();
    const r = roster(b);
    const first = [...rivalNames(r, new Set(), NICK_WORDS_V1, RETIRED_V1).values()].map((n) => n.nickname);
    const taken = new Set(first.map((n) => n.toLowerCase()));
    const second = [...rivalNames(r, taken, NICK_WORDS_V1, RETIRED_V1).values()].map((n) => n.nickname);
    expect(new Set(second.map((n) => n.toLowerCase())).size).toBe(second.length);
    for (const n of second) expect(taken.has(n.toLowerCase())).toBe(false);
    // Through the table: members hold the names upper-cased, hidden rows included.
    const members = first.slice(0, 5).map((n, i) => member(i, { nickname: n.toUpperCase(), hidden: i === 4 ? 1 : 0, points: 1 }));
    const rows = liveTable({ ...b, next_slot: 5, members: 5 }, members, b.join_until, false);
    const all = rows.map((x) => x.nickname.toLowerCase());
    expect(new Set(all).size).toBe(all.length);
    for (const n of first.slice(0, 5)) expect(rows.filter((x) => x.kind === 'rival').some((x) => x.nickname === n)).toBe(false);
    // A real player who takes a rival's exact name keeps it; that rival shows its next candidate.
    const takenBy = liveTable(b, [member(0, { nickname: 'Calm Pumpkin 6' })], O + HOUR, false);
    expect(takenBy.find((x) => x.slot === 0)?.nickname).toBe('Calm Pumpkin 6');
    expect(takenBy.find((x) => x.slot === 9000)?.nickname).toBe('Silky Tuft 44');
  });
  it('never a retired word; appended words never rename a running bracket (the tag freezes adjN/nounN)', () => {
    const r = roster(bracket());
    const retired = { adj: [NICK_WORDS_V1.adj.indexOf('Calm')], noun: [NICK_WORDS_V1.noun.indexOf('Pumpkin'), NICK_WORDS_V1.noun.indexOf('Comet')] };
    for (const n of rivalNames(r, new Set(), NICK_WORDS_V1, retired).values()) {
      const [adj, noun] = n.nickname.split(' ');
      expect(adj).not.toBe('Calm');
      expect(['Pumpkin', 'Comet']).not.toContain(noun);
    }
    const longer = { adj: [...NICK_WORDS_V1.adj, 'Extra1', 'Extra2', 'Extra3', 'Extra4', 'Extra5', 'Extra6'], noun: [...NICK_WORDS_V1.noun, 'More1'] };
    expect(longer.adj.length).toBe(70);
    expect([...rivalNames(r, new Set(), longer, RETIRED_V1)]).toEqual([...rivalNames(r, new Set(), NICK_WORDS_V1, RETIRED_V1)]);
    // A tag that names longer lists than this code has (a rollback) skips the missing words instead of printing "undefined".
    const ahead = roster(bracket({ rivals: 'r1:k3j9x0a1b20a:100:9999:9999' }));
    for (const n of rivalNames(ahead, new Set(), NICK_WORDS_V1, RETIRED_V1).values()) expect(n.nickname).not.toMatch(/undefined/);
  });
  it('after 16 misses: the fallback "<adj 0> <noun 0> <index + 1>"', () => {
    const tiny = { adj: ['Sleepy'], noun: ['Whisker'] };
    const r = roster(bracket({ rivals: 'r1:k3j9x0a1b20a:100:1:1' }));
    const all = new Set(Array.from({ length: 99 }, (_, i) => `sleepy whisker ${i + 1}`));
    const names = rivalNames(r, all, tiny, { adj: [], noun: [] });
    expect(names.get(9000)?.nickname).toBe('Sleepy Whisker 1');
    expect(names.get(9048)?.nickname).toBe('Sleepy Whisker 49');
  });
});

// ── 7. calibration ────────────────────────────────────────────────────────────────────────────────────────

describe('calibration bands (design §3.10; 2,000 tags, a lone real player at 2.43 fish a win)', () => {
  const N = 2000;
  const rng = seededRng(71);
  const finals = brackets(N, 72, false).map((b) => {
    const r = roster(b);
    const rows = r.rivals.map((x) => rivalAt(x, b.join_until, b.ends_at) as { points: number; scoredAt: number });
    const lambdaMax = Math.floor((24 * r.sigma) / 100);
    const wmin = Math.floor((b.join_until - b.opened_at) / MIN);
    return { b, rows, top: Math.max(...rows.map((x) => x.points)), bound: 3 + Math.floor((wmin * lambdaMax) / 600) + 3 * lambdaMax };
  });
  const fish = (): number => {
    const x = int(rng, 0, 99);
    return x < 12 ? 1 : x < 45 ? 2 : 3;
  };
  /** The share of brackets where a player with `wins` wins (last one at a uniform time) finishes 1st / in the top 3. */
  const rates = (wins: number): { first: number; top3: number } => {
    let first = 0,
      top3 = 0;
    for (const f of finals) {
      let points = 0;
      for (let w = 0; w < wins; w++) points += fish();
      const me = { slot: 0, points, scoredAt: int(rng, f.b.opened_at, f.b.ends_at - 1) };
      const ranked = rankRows([me, ...f.rows.map((x, i) => ({ slot: RIVAL_SLOT_BASE + i, points: x.points, scoredAt: x.scoredAt }))]);
      const place = (ranked.find((x) => x.slot === 0) as { rank: number }).rank;
      if (place === 1) first++;
      if (place <= 3) top3++;
    }
    return { first: first / N, top3: top3 / N };
  };
  it('the top rival: p50 in [38, 50]; never above the bound 3 + floor(Wmin·λmax/600) + 3·λmax', () => {
    const tops = finals.map((f) => f.top);
    expect(pct(tops, 0.5)).toBeGreaterThanOrEqual(38);
    expect(pct(tops, 0.5)).toBeLessThanOrEqual(50);
    for (const f of finals) expect(f.top).toBeLessThanOrEqual(f.bound);
    expect(Math.max(...finals.map((f) => f.bound))).toBeLessThanOrEqual(102); // S = 100
  });
  it('competitive but beatable across 5–30 wins, no cliff', () => {
    expect(rates(5).top3).toBeLessThanOrEqual(0.05);
    const ten = rates(10);
    expect(ten.top3).toBeGreaterThanOrEqual(0.08);
    expect(ten.top3).toBeLessThanOrEqual(0.3);
    const fifteen = rates(15);
    expect(fifteen.top3).toBeGreaterThanOrEqual(0.5);
    expect(fifteen.top3).toBeLessThanOrEqual(0.8);
    expect(fifteen.first).toBeGreaterThanOrEqual(0.15);
    expect(fifteen.first).toBeLessThanOrEqual(0.4);
    const twenty = rates(20);
    expect(twenty.first).toBeGreaterThanOrEqual(0.45);
    expect(twenty.first).toBeLessThanOrEqual(0.8);
    expect(rates(30).first).toBeGreaterThanOrEqual(0.9);
  });
  it('rows over time from the first win: about 11 at once, 46–50 from join_until, never above 50', () => {
    const at = (dt: number) => finals.slice(0, 500).map((f) => liveTable(f.b, [member(0, { points: 2, scored_at: f.b.opened_at })], f.b.opened_at + dt, false).length);
    const first = at(0);
    expect(Math.min(...first)).toBeGreaterThanOrEqual(9); // 8–12 rivals + the player: never the alone line, never 'min'
    expect(Math.max(...first)).toBeLessThanOrEqual(13);
    const full = at(2 * HOUR);
    expect(Math.min(...full)).toBeGreaterThanOrEqual(46);
    expect(Math.max(...full)).toBeLessThanOrEqual(50);
  });
});

// ── 8. codecs ─────────────────────────────────────────────────────────────────────────────────────────────

describe('the tag and the final snapshot (design §3.1, §5.2)', () => {
  it('the tag: written with the strength and list lengths, parsed strictly', () => {
    const tag = newRivalsTag(120, seededRng(5), NICK_WORDS_V1);
    expect(tag).toMatch(RIVAL_TAG_RE);
    expect(tag).toMatch(/^r1:[0-9a-z]{12}:120:64:64$/);
    expect(newRivalsTag(120, seededRng(6), NICK_WORDS_V1)).not.toBe(tag);
    expect(parseRivalsTag(GOLD_TAG)).toEqual({ seed: 'k3j9x0a1b20a', strength: 100, adjN: 64, nounN: 64 });
    for (const bad of [
      null,
      undefined,
      '',
      'r1:K3J9X0A1B20A:100:64:64',
      'r1:k3j9x0a1b20:100:64:64',
      'r1:k3j9x0a1b20aa:100:64:64',
      'r2:k3j9x0a1b20a:100:64:64',
      'r1:k3j9x0a1b20a:9:64:64',
      'r1:k3j9x0a1b20a:1000:64:64',
      'r1:k3j9x0a1b20a:100:64',
      'r1:k3j9x0a1b20a:100:64:64 ',
      'r1:k3j9x0a1b20a:100:64:12345',
      'r1:k3j9x0a1b20a:100:0:64',
      'r1:k3j9x0a1b20a:100:64:0',
    ]) {
      expect(parseRivalsTag(bad), String(bad)).toBeNull();
      expect(rivalRoster(bad ?? null, bracket()), String(bad)).toBeNull();
    }
    expect(isRivalSlot(8999)).toBe(false);
    expect(isRivalSlot(9000)).toBe(true);
  });

  const b = bracket({ finalized_at: O + DAY + HOUR, final_members: 50 });
  const good: FinalRival[] = [
    { slot: 9000, rank: 1, points: 42, scoredAt: O + 718 * MIN, hearts: 8, avatar: 6, nickname: 'Calm Pumpkin 6' },
    { slot: 9001, rank: 3, points: 38, scoredAt: O + 700 * MIN, hearts: 0, avatar: 2, nickname: 'Bouncy Comet 62' },
  ];
  it('round trip, in the order given; about 2 KB for a full table', () => {
    const s = encodeFinalRivals(good, b);
    expect(JSON.parse(s)).toEqual([
      [9000, 1, 42, 718 * MIN, 8, 6, 'Calm Pumpkin 6'],
      [9001, 3, 38, 700 * MIN, 0, 2, 'Bouncy Comet 62'],
    ]);
    expect(decodeFinalRivals(s, b)).toEqual(good);
    const plan = finalPlan(bracket(), [goldPlayerAt(O + DAY)], DEFAULT_CONFIG, O + DAY + HOUR, true);
    const s49 = plan.totals.finalRivals as string;
    expect(s49.length).toBeLessThan(3000);
    const decoded = decodeFinalRivals(s49, { ...b, final_members: plan.totals.finalMembers }) as FinalRival[];
    const frozen = freezeTable(bracket(), [goldPlayerAt(O + DAY)], false).filter((x) => x.kind === 'rival');
    expect(decoded.map((x) => [x.slot, x.rank, x.points, x.scoredAt, x.hearts, x.avatar, x.nickname])).toEqual(frozen.map((x) => [x.slot, x.rank, x.points, x.scoredAt, x.hearts, x.avatar, x.nickname]));
  });
  it('any malformed part voids the whole snapshot', () => {
    const row = (over: Partial<Record<number, unknown>> = {}): unknown[] => {
      const base: unknown[] = [9000, 1, 42, 1000, 8, 6, 'Calm Pumpkin 6'];
      for (const [i, v] of Object.entries(over)) base[Number(i)] = v;
      return base;
    };
    const enc = (rows: unknown[]): string => JSON.stringify(rows);
    expect(decodeFinalRivals(enc([row()]), b)).not.toBeNull();
    const bad: [string, string][] = [
      ['null snapshot', 'null'],
      ['not JSON', '[[9000,'],
      ['not an array', '{"a":1}'],
      ['too long', enc([row({ 6: 'x'.repeat(FINAL_RIVALS_MAX_CHARS) })])],
      ['more entries than max_members', enc(Array.from({ length: 51 }, (_, i) => row({ 0: 9000 + i, 1: i + 1 })))],
      ['short entry', enc([[9000, 1, 42, 1000, 8, 6]])],
      ['slot 8999', enc([row({ 0: 8999 })])],
      ['slot 10000', enc([row({ 0: 10_000 })])],
      ['duplicate slot', enc([row(), row({ 1: 2 })])],
      ['rank 0', enc([row({ 1: 0 })])],
      ['rank above final_members', enc([row({ 1: 51 })])],
      ['duplicate rank', enc([row(), row({ 0: 9001 })])],
      ['points 0', enc([row({ 2: 0 })])],
      ['points not an integer', enc([row({ 2: 4.5 })])],
      ['negative offset', enc([row({ 3: -1 })])],
      ['hearts -1', enc([row({ 4: -1 })])],
      ['hearts 1001', enc([row({ 4: 1001 })])],
      ['avatar 12', enc([row({ 5: 12 })])],
      ['avatar as text', enc([row({ 5: '6' })])],
      ['empty nickname', enc([row({ 6: '' })])],
      ['control character', enc([row({ 6: 'Calm\u0007Pumpkin' })])],
      ['nickname of 41', enc([row({ 6: 'x'.repeat(41) })])],
    ];
    for (const [why, s] of bad) expect(decodeFinalRivals(s, b), why).toBeNull();
    expect(decodeFinalRivals(enc([row()]), { ...b, final_members: null }), 'no final_members: no valid rank').toBeNull();
    expect(decodeFinalRivals(null, b)).toBeNull();
    expect(isDisplayText('Calm Pumpkin 6', 40)).toBe(true);
  });
});

// ── 9. tables, the finalisation plan, hearts ──────────────────────────────────────────────────────────────

describe('the combined tables (design §4.1)', () => {
  it('without a tag (or under hide) the live table is exactly the old open ranking', () => {
    const members = [member(0, { points: 9, scored_at: O + 5 }), member(1, { points: 9, scored_at: O + 3 }), member(2, { points: 4, hidden: 1 }), member(3, { points: 12, scored_at: O + 9 })];
    const old = rankRows(members.filter((m) => m.hidden === 0).map((m) => ({ ...m, scoredAt: m.scored_at }))).map((m) => [m.slot, m.rank, m.points, m.nickname, m.avatar, m.hearts]);
    for (const [b, hide] of [
      [bracket({ rivals: null, next_slot: 4 }), false],
      [bracket({ rivals: 'garbage', next_slot: 4 }), false],
      [bracket({ next_slot: 4 }), true],
    ] as const) {
      const rows = liveTable(b, members, O + HOUR, hide);
      expect(rows.map((m) => [m.slot, m.rank, m.points, m.nickname, m.avatar, m.hearts])).toEqual(old);
      expect(rows.every((m) => m.kind === 'player' && m.playerKey === `key-${m.slot}`)).toBe(true);
    }
  });
  it('the evaluation time is clamped to [opened_at, ends_at]; exact ties go to the real player', () => {
    const b = bracket();
    const early = liveTable(b, [member(0, { points: 3, scored_at: O })], O - 5 * MIN, false);
    expect(early.map((x) => x.slot)).toEqual(liveTable(b, [member(0, { points: 3, scored_at: O })], O, false).map((x) => x.slot));
    expect(early.length).toBe(11); // the opening group of 10 + the creator
    // 9000 has base 3 at opened_at: the same points and ms as the creator, who ranks first (slot 0 < 9000).
    expect(early.slice(0, 2).map((x) => x.slot)).toEqual([0, 9000]);
    const late = liveTable(b, [goldPlayerAt(O + DAY)], O + DAY + 5 * HOUR, false);
    expect(late).toEqual(liveTable(b, [goldPlayerAt(O + DAY)], O + DAY, false));
    expect(late).toEqual(freezeTable(b, [goldPlayerAt(O + DAY)], false));
  });
  it('the final table: real final ranks plus the snapshot by rank; a gap after a deletion; none under hide or a bad snapshot', () => {
    const plan = finalPlan(bracket({ next_slot: 3, members: 3 }), [member(0, { points: 39 }), member(1, { points: 20 }), member(2, { points: 1 })], DEFAULT_CONFIG, O + DAY + HOUR, true);
    const b = bracket({ next_slot: 3, members: 3, finalized_at: O + DAY + HOUR, final_members: plan.totals.finalMembers, final_real: plan.totals.finalReal, final_rivals: plan.totals.finalRivals });
    const rankOf = new Map(plan.ranks.map((r) => [r.slot, r.rank]));
    const finals = [member(0, { points: 39 }), member(1, { points: 20 }), member(2, { points: 1 })].map((m) => ({ ...m, final_rank: rankOf.get(m.slot) ?? null }));
    const full = finalTable(b, finals, false);
    expect(full.map((x) => x.rank)).toEqual(Array.from({ length: plan.totals.finalMembers }, (_, i) => i + 1));
    expect(full.filter((x) => x.kind === 'player').map((x) => [x.slot, x.rank])).toEqual(plan.ranks.map((r) => [r.slot, r.rank]));
    const deleted = finalTable(b, finals.filter((m) => m.slot !== 1), false);
    expect(deleted.length).toBe(full.length - 1);
    expect(deleted.map((x) => x.rank)).not.toContain(rankOf.get(1));
    expect(finalTable(b, finals, true).map((x) => x.kind)).toEqual(['player', 'player', 'player']);
    expect(finalTable({ ...b, final_rivals: '[[1,2]]' }, finals, false).every((x) => x.kind === 'player')).toBe(true);
  });
  it('withRealHearts adds real hearts to rival rows only', () => {
    const rows = liveTable(bracket(), [member(0, { points: 11, hearts: 2, scored_at: O + 12 * MIN })], O + 6 * HOUR, false);
    const out = withRealHearts(rows, new Map([[9000, 3], [0, 5]]));
    expect(out.find((x) => x.slot === 9000)?.hearts).toBe((rows.find((x) => x.slot === 9000)?.hearts ?? 0) + 3);
    expect(out.find((x) => x.slot === 0)?.hearts).toBe(2);
    expect(out.find((x) => x.slot === 9001)?.hearts).toBe(rows.find((x) => x.slot === 9001)?.hearts);
  });
});

describe('pointsForRank (design §11, §12.2 #10: the preview places its player among the rivals)', () => {
  it('200 tags at varied times: the place is met with the smallest points, scoredAt never after `at`', () => {
    const met = new Map<string, number>();
    for (const b of brackets(200, 4242)) {
      const T = b.opened_at + 5 * HOUR;
      const at = T - 50 * MIN;
      // The rival rows do not depend on the real row's points (only next_slot and the names), so place it among them.
      const others = liveTable(b, [member(0)], T, false).filter((r) => r.kind === 'rival');
      const rankAt = (points: number, scoredAt: number): number => (liveTable(b, [member(0, { points, scored_at: scoredAt })], T, false).find((r) => r.slot === 0) as RankedRow).rank;
      for (const rank of [1, 2, 5, 10, others.length + 1]) {
        const r = pointsForRank(others, rank, at);
        if (!r) continue;
        const name = rank === others.length + 1 ? 'last' : String(rank);
        met.set(name, (met.get(name) ?? 0) + 1);
        expect(r.scoredAt).toBeLessThanOrEqual(at);
        expect(r.points).toBeGreaterThanOrEqual(1);
        expect(rankAt(r.points, r.scoredAt), `rank ${rank}`).toBe(rank);
        // Smallest: one point less reaches the place at neither candidate time.
        if (r.points > 1) for (const s of [at, r.scoredAt]) expect(rankAt(r.points - 1, s)).toBeGreaterThan(rank);
      }
    }
    // 1st and last are always reachable. A middle place fails when the rows around it share their points and the
    // row above scored after `at` (a session in the last 50 min): measured 2026-10-12, rank 5 met in about 86 % of
    // tags (the design's sketch said 98 %), so the preview retries with up to 8 tags (all 8 failing: about 1e-7).
    expect([met.get('1'), met.get('last')]).toEqual([200, 200]);
    expect(met.get('5') ?? 0).toBeGreaterThanOrEqual(150);
  });
  it('null when two rows tie exactly around the place (the opening group at opened_at); edges', () => {
    const tie = [
      { points: 3, scoredAt: O, slot: 9000 },
      { points: 3, scoredAt: O, slot: 9001 },
    ];
    expect(pointsForRank(tie, 2, O + HOUR)).toBeNull();
    expect(pointsForRank(tie, 1, O + HOUR)).toEqual({ points: 4, scoredAt: O + HOUR }); // 1st: scoredAt is `at` only
    expect(pointsForRank(tie, 1, O)).toEqual({ points: 3, scoredAt: O }); // slot 0 wins the exact tie
    expect(pointsForRank(tie, 3, O + HOUR)).toEqual({ points: 1, scoredAt: O + HOUR });
    // The golden bracket at opened_at: the opening group's exact ties leave some places unreachable.
    const opening = liveTable(bracket(), [member(0)], O, false).filter((r) => r.kind === 'rival');
    const sorted = rankRows(opening);
    const tied = sorted.findIndex((r, i) => i > 0 && r.points === (sorted[i - 1] as RankedRow).points && r.scoredAt === (sorted[i - 1] as RankedRow).scoredAt);
    expect(tied).toBeGreaterThan(0);
    expect(pointsForRank(opening, tied + 1, O)).toBeNull();
    expect(pointsForRank([], 1, O)).toEqual({ points: 1, scoredAt: O });
    expect(pointsForRank(tie, 0, O)).toBeNull();
    expect(pointsForRank(tie, 4, O)).toBeNull();
    // A real row's own slot breaks ties with other real rows (slot 5 ranks behind slot 2 at the same points and ms).
    expect(pointsForRank([{ points: 4, scoredAt: O, slot: 2 }], 2, O, 5)).toEqual({ points: 1, scoredAt: O });
    expect(pointsForRank([{ points: 4, scoredAt: O, slot: 2 }], 1, O, 1)).toEqual({ points: 4, scoredAt: O });
    expect(pointsForRank([{ points: 4, scoredAt: O, slot: 2 }], 1, O, 5)).toEqual({ points: 5, scoredAt: O });
  });
});

describe('finalPlan (design §5.1, §5.3)', () => {
  const at = O + DAY + HOUR;
  it('rivals in 1st–3rd: no reward; a lone strong player: 1st, 2 + 2', () => {
    const weak = finalPlan(bracket(), [member(0, { points: 1, scored_at: O + 23 * HOUR })], DEFAULT_CONFIG, at, true);
    expect([weak.rewards, weak.rivalPlaces, weak.ranks]).toEqual([[], 3, [{ slot: 0, rank: 50 }]]);
    const strong = finalPlan(bracket(), [member(0, { points: 90, scored_at: O + 23 * HOUR })], DEFAULT_CONFIG, at, true);
    expect(strong.rewards).toEqual([{ id: 'mgk1a2b3c4d5e6:0', playerKey: 'key-0', place: 1, hints: 2, kitties: 2, expiresAt: at + DEFAULT_CONFIG.rewards.claimTtlMs }]);
    expect(strong.rivalPlaces).toBe(2);
    expect(finalPlan(bracket(), [member(0, { points: 90 })], DEFAULT_CONFIG, at, false).rewards).toEqual([]);
  });
  it('never a reward on a slot ≥ 9000; every reward id fits REWARD_ID_RE; independent of when it runs', () => {
    const rng = seededRng(91);
    for (const b of brackets(200, 92)) {
      const n = int(rng, 1, 8);
      const members = Array.from({ length: n }, (_, i) => member(i, { points: int(rng, 1, 70), scored_at: int(rng, b.opened_at, b.ends_at - 1) }));
      const nb = { ...b, next_slot: n, members: n };
      const plan = finalPlan(nb, members, DEFAULT_CONFIG, nb.ends_at + HOUR, true);
      for (const w of plan.rewards) {
        expect(w.id).toMatch(/^[0-9a-z]+:\d{1,3}$/);
        expect(isRivalSlot(Number(w.id.split(':')[1]))).toBe(false);
      }
      expect(plan.totals.finalMembers).toBeLessThanOrEqual(nb.max_members);
      expect(plan.totals.finalReal).toBe(n);
      expect(plan.ranks.length).toBe(n);
      const later = finalPlan(nb, members, DEFAULT_CONFIG, nb.ends_at + 5 * HOUR, true);
      expect([later.ranks, later.totals, later.rewards.map((w) => ({ ...w, expiresAt: 0 }))]).toEqual([plan.ranks, plan.totals, plan.rewards.map((w) => ({ ...w, expiresAt: 0 }))]);
    }
  });
  it('an untagged bracket gives exactly the old finalisation', () => {
    const members = [member(0, { points: 9, scored_at: O + 5 }), member(1, { points: 9, scored_at: O + 3 }), member(2, { points: 4, hidden: 2 }), member(3, { points: 12 }), member(4, { points: 2 }), member(5, { points: 7 }), member(6, { points: 0 })];
    const b = bracket({ rivals: null, next_slot: 7, members: 7 });
    // The inline ranking finalizeIfDue used before D-2e-24:
    const ranked = rankRows(members.filter((m) => m.hidden === 0).map((m) => ({ slot: m.slot, points: m.points, scoredAt: m.scored_at, key: m.player_key })));
    const rewards = paidPlaces(ranked, DEFAULT_CONFIG).map((p) => ({
      id: rewardId(b.id, p.slot),
      playerKey: (ranked.find((r) => r.slot === p.slot) as { key: string }).key,
      place: p.place,
      hints: p.hints,
      kitties: p.kitties,
      expiresAt: at + DEFAULT_CONFIG.rewards.claimTtlMs,
    }));
    const plan = finalPlan(b, members, DEFAULT_CONFIG, at, true);
    expect(plan).toEqual({ ranks: ranked.map((r) => ({ slot: r.slot, rank: r.rank })), rewards, totals: { finalMembers: 6, finalReal: 6, finalRivals: null }, rivalPlaces: 0 });
  });
  it('hide at finalisation: real-only, no snapshot', () => {
    const hidden: ServerConfig = { ...DEFAULT_CONFIG, rivals: { ...DEFAULT_CONFIG.rivals, hide: true } };
    const plan = finalPlan(bracket(), [member(0, { points: 5 })], hidden, at, true);
    expect([plan.ranks, plan.rewards, plan.totals, plan.rivalPlaces]).toEqual([[{ slot: 0, rank: 1 }], [], { finalMembers: 1, finalReal: 1, finalRivals: null }, 0]);
  });
  it('refinalize re-ranks with the snapshot rivals (even under hide) and pays a newly earned real place', () => {
    const members = [member(0, { points: 40, scored_at: O + 20 * HOUR }), member(1, { points: 43, scored_at: O + 21 * HOUR }), member(2, { points: 39, scored_at: O + 22 * HOUR })];
    const b = bracket({ next_slot: 3, members: 3 });
    const first = finalPlan(b, members, DEFAULT_CONFIG, at, true);
    const fb = { ...b, finalized_at: at, final_members: first.totals.finalMembers, final_real: 3, final_rivals: first.totals.finalRivals };
    const before = new Map(first.ranks.map((r) => [r.slot, r.rank]));
    // An admin deletes the cheater in slot 1: the others move up past nobody new; the snapshot rivals keep their points.
    const hidden: ServerConfig = { ...DEFAULT_CONFIG, rivals: { ...DEFAULT_CONFIG.rivals, hide: true } };
    const again = finalPlan(fb, members.filter((m) => m.slot !== 1), hidden, at + HOUR, true);
    // The same frozen rivals (points, scoredAt, hearts, names), re-numbered around the real rows.
    const strip = (s: string | null) => (decodeFinalRivals(s, { ...fb, final_members: 50 }) ?? []).map(({ rank: _rank, ...r }) => r);
    expect(again.totals.finalRivals).not.toBeNull();
    expect(strip(again.totals.finalRivals)).toEqual(strip(first.totals.finalRivals));
    expect(again.totals.finalMembers).toBe(first.totals.finalMembers - 1);
    expect(again.totals.finalReal).toBe(2);
    for (const r of again.ranks) expect(r.rank).toBeLessThanOrEqual(before.get(r.slot) as number);
    const expected = rankRows([...members.filter((m) => m.slot !== 1).map((m) => ({ slot: m.slot, points: m.points, scoredAt: m.scored_at })), ...(decodeFinalRivals(first.totals.finalRivals, fb) as FinalRival[])]);
    expect(again.ranks).toEqual(expected.filter((x) => x.slot < RIVAL_SLOT_BASE).map((x) => ({ slot: x.slot, rank: x.rank })));
    const paidNow = paidPlaces(expected, DEFAULT_CONFIG).filter((p) => p.slot < RIVAL_SLOT_BASE);
    expect(again.rewards.map((w) => [w.place, w.playerKey])).toEqual(paidNow.map((p) => [p.place, `key-${p.slot}`]));
  });
  it('[stage 2] a finalised bracket without a usable snapshot (real-only under hide, by pre-0003 code, or undecodable) re-ranks real-only: never recomputed from the tag', () => {
    const members = [member(0, { points: 40, scored_at: O + 20 * HOUR }), member(1, { points: 3, scored_at: O + 21 * HOUR })];
    const b = bracket({ next_slot: 2, members: 2 });
    for (const finalRivals of [null, '{', '[[1,2]]']) {
      const fb = { ...b, finalized_at: O + DAY + HOUR, final_members: 2, final_real: 2, final_rivals: finalRivals };
      const plan = finalPlan(fb, members, DEFAULT_CONFIG, O + DAY + 2 * HOUR, true);
      expect([plan.ranks, plan.totals, plan.rivalPlaces], String(finalRivals)).toEqual([[{ slot: 0, rank: 1 }, { slot: 1, rank: 2 }], { finalMembers: 2, finalReal: 2, finalRivals: null }, 0]);
      expect(plan.rewards).toEqual([]); // two rows: below minMembers, as the frozen result read
    }
    // while a not yet finalised bracket with the same tag is frozen at ends_at with its rivals
    expect(finalPlan(b, members, DEFAULT_CONFIG, O + DAY + 2 * HOUR, true).totals.finalMembers).toBe(50);
  });
});

describe('rivalHeartTarget (design §6.1)', () => {
  const b = bracket();
  it('an open bracket: a present, live rival only', () => {
    expect(rivalHeartTarget(b, 9000, O + 6 * HOUR, false)).toEqual({ builtIn: 2, maxNextSlot: 49 });
    expect(rivalHeartTarget(b, 9048, O + 6 * HOUR, false)).toEqual({ builtIn: expect.any(Number), maxNextSlot: 1 });
    expect(rivalHeartTarget(b, 9048, O + HOUR, false), 'not arrived (+114 min)').toBeNull();
    expect(rivalHeartTarget(b, 9049, O + 6 * HOUR, false), 'beyond the roster').toBeNull();
    expect(rivalHeartTarget(b, 0, O + 6 * HOUR, false), 'a real slot').toBeNull();
    expect(rivalHeartTarget(b, 9000, O + 6 * HOUR, true), 'hide').toBeNull();
    expect(rivalHeartTarget({ ...b, rivals: null }, 9000, O + 6 * HOUR, false), 'untagged').toBeNull();
    // Rival i is live while next_slot ≤ max_members − 1 − i.
    expect(rivalHeartTarget({ ...b, next_slot: 40 }, 9009, O + 6 * HOUR, false)).not.toBeNull();
    expect(rivalHeartTarget({ ...b, next_slot: 41 }, 9009, O + 6 * HOUR, false), 'retired by joins').toBeNull();
    // Built-in hearts at the clamped time.
    expect(rivalHeartTarget(b, 9000, O + 3 * DAY, false)?.builtIn).toBe(8);
  });
  it('a final bracket: the snapshot rows only', () => {
    const plan = finalPlan(b, [goldPlayerAt(O + DAY)], DEFAULT_CONFIG, O + DAY + HOUR, true);
    const fb = { ...b, finalized_at: O + DAY + HOUR, final_members: plan.totals.finalMembers, final_rivals: plan.totals.finalRivals };
    expect(rivalHeartTarget(fb, 9000, O + DAY + 2 * HOUR, false)).toEqual({ builtIn: 8, maxNextSlot: 1 });
    expect(rivalHeartTarget(fb, 9049, O + DAY + 2 * HOUR, false)).toBeNull();
    expect(rivalHeartTarget({ ...fb, final_rivals: null }, 9000, O + DAY + 2 * HOUR, false)).toBeNull();
    expect(rivalHeartTarget({ ...fb, final_rivals: '{' }, 9000, O + DAY + 2 * HOUR, false)).toBeNull();
    expect(rivalHeartTarget(fb, 9000, O + DAY + 2 * HOUR, true)).toBeNull();
  });
});

// ── 10. switches ──────────────────────────────────────────────────────────────────────────────────────────

describe('switches: config and who gets rivals (design §1)', () => {
  it('the defaults: off, both pools, strength 100, disclosed, not hidden, no test pools', () => {
    expect(DEFAULT_CONFIG.rivals).toEqual({ enabled: false, pools: ['fb', 'web'], strength: 100, disclose: true, hide: false, testPools: false });
    expect(loadConfig({}).cfg.rivals.enabled).toBe(false);
    expect(loadConfig({}).problems).toEqual([]);
  });
  it('RIVALS=on|off; anything else is a problem and keeps the config value', () => {
    expect(loadConfig({ RIVALS: 'on' }).cfg.rivals.enabled).toBe(true);
    expect(loadConfig({ RIVALS: 'off', CONFIG_OVERRIDES: '{"rivals":{"enabled":true}}' }).cfg.rivals.enabled).toBe(false);
    expect(loadConfig({ CONFIG_OVERRIDES: '{"rivals":{"enabled":true}}' }).cfg.rivals.enabled).toBe(true); // dev and staging
    const bad = loadConfig({ RIVALS: 'ON' });
    expect(bad.cfg.rivals.enabled).toBe(false);
    expect(bad.problems).toEqual(['RIVALS: expected on | off']);
  });
  it('production: only RIVALS=on itself turns them on', () => {
    expect(loadConfig({ DEPLOY_ENV: 'production', RIVALS: 'on' }).cfg.rivals.enabled).toBe(true);
    const viaOverrides = loadConfig({ DEPLOY_ENV: 'production', CONFIG_OVERRIDES: '{"rivals":{"enabled":true}}' });
    expect(viaOverrides.cfg.rivals.enabled).toBe(false);
    expect(viaOverrides.problems).toEqual(['rivals.enabled: ignored in production without RIVALS=on']);
    expect(loadConfig({ DEPLOY_ENV: 'production', RIVALS: 'off' }).cfg.rivals.enabled).toBe(false);
    expect(loadConfig({ DEPLOY_ENV: 'staging', CONFIG_OVERRIDES: '{"rivals":{"enabled":true}}' }).cfg.rivals.enabled).toBe(true);
  });
  it('pools keep fb and web; strength must be an integer 50…200; other keys merge', () => {
    const c = loadConfig({ RIVALS: 'on', CONFIG_OVERRIDES: '{"rivals":{"pools":["fb","web:e2e",3],"strength":150,"disclose":false,"hide":true,"testPools":true}}' });
    expect(c.cfg.rivals).toEqual({ enabled: true, pools: ['fb'], strength: 150, disclose: false, hide: true, testPools: true });
    expect(c.problems).toEqual(['rivals.pools: dropped "web:e2e"', 'rivals.pools: dropped 3']);
    for (const s of [49, 201, 99.5]) {
      const x = loadConfig({ CONFIG_OVERRIDES: JSON.stringify({ rivals: { strength: s } }) });
      expect(x.cfg.rivals.strength).toBe(100);
      expect(x.problems).toEqual(['rivals.strength: expected an integer 50..200']);
    }
    expect(loadConfig({ CONFIG_OVERRIDES: '{"rivals":{"strength":"90"}}' }).problems).toEqual(['rivals.strength: expected number']);
    expect(loadConfig({ CONFIG_OVERRIDES: '{"rivals":{"pools":[]}}' }).cfg.rivals.pools).toEqual([]);
  });
  it('the scoring guard: preset r1 needs one point per fish and at most 3 fish', () => {
    const two = loadConfig({ RIVALS: 'on', CONFIG_OVERRIDES: '{"scoring":{"pointsPerFish":2}}' });
    expect(two.cfg.rivals.enabled).toBe(false);
    expect(two.problems).toEqual(['rivals: preset r1 needs pointsPerFish 1 and fishMax 3']);
    expect(loadConfig({ RIVALS: 'on', CONFIG_OVERRIDES: '{"scoring":{"fishMax":5}}' }).cfg.rivals.enabled).toBe(false);
    expect(loadConfig({ CONFIG_OVERRIDES: '{"scoring":{"pointsPerFish":2}}' }).problems).toEqual([]); // off anyway: nothing to report
  });

  const svc = (rivals: Partial<ServerConfig['rivals']>, devRoutes = false, dev: [string, boolean][] = []): { cfg: ServerConfig; dev: DevState } => ({
    cfg: { ...DEFAULT_CONFIG, devRoutes, rivals: { ...DEFAULT_CONFIG.rivals, ...rivals } },
    dev: { offsets: new Map(), switches: new Map(), rivals: new Map(dev) },
  });
  it('rivalsForPool: real pools by enabled + pools; test pools by /dev/rivals or testPools; never under hide', () => {
    expect(rivalsForPool(svc({}), 'fb')).toBe(false);
    expect(rivalsForPool(svc({ enabled: true }), 'fb')).toBe(true);
    expect(rivalsForPool(svc({ enabled: true }), 'web')).toBe(true);
    expect(rivalsForPool(svc({ enabled: true, pools: ['fb'] }), 'web')).toBe(false);
    expect(rivalsForPool(svc({ enabled: true, pools: [] }), 'fb')).toBe(false);
    expect(rivalsForPool(svc({ enabled: true, hide: true }), 'fb')).toBe(false);
    // Test pools: untagged by default, even with rivals on.
    expect(rivalsForPool(svc({ enabled: true }, true), 'fb:e2e-1')).toBe(false);
    expect(rivalsForPool(svc({ enabled: true }, true), 'fb:synthetic')).toBe(false);
    expect(rivalsForPool(svc({ enabled: true, testPools: true }), 'fb:synthetic')).toBe(true);
    expect(rivalsForPool(svc({ enabled: true, testPools: true }), 'web:e2e-1')).toBe(true);
    expect(rivalsForPool(svc({ testPools: true }), 'fb:synthetic')).toBe(false);
    expect(rivalsForPool(svc({}, true, [['e2e-1', true]]), 'fb:e2e-1')).toBe(true);
    expect(rivalsForPool(svc({}, true, [['e2e-1', true]]), 'fb:e2e-2')).toBe(false);
    expect(rivalsForPool(svc({}, false, [['e2e-1', true]]), 'fb:e2e-1'), 'the switch needs dev routes').toBe(false);
    expect(rivalsForPool(svc({ hide: true }, true, [['e2e-1', true]]), 'fb:e2e-1')).toBe(false);
  });
  it('rivalsNoteFor: disclosed while rivals are on (pools [] included) or the test pool is switched on', () => {
    expect(rivalsNoteFor(svc({}), 'fb')).toBe(false);
    expect(rivalsNoteFor(svc({ enabled: true }), 'fb')).toBe(true);
    expect(rivalsNoteFor(svc({ enabled: true, pools: [] }), 'web')).toBe(true);
    expect(rivalsNoteFor(svc({ enabled: true, disclose: false }), 'fb')).toBe(false);
    expect(rivalsNoteFor(svc({ enabled: true, hide: true }), 'fb')).toBe(false);
    expect(rivalsNoteFor(svc({}, true, [['e2e-1', true]]), 'fb:e2e-1')).toBe(true);
    expect(rivalsNoteFor(svc({}, true, [['e2e-1', true]]), 'fb:e2e-2')).toBe(false);
    expect(rivalsNoteFor(svc({}, true, [['e2e-1', true]]), 'fb')).toBe(false);
  });
  it('makeServices starts with no test pool switched on', () => {
    const s = makeServices({
      cfg: DEFAULT_CONFIG,
      configProblems: [],
      env: {},
      store: {} as never,
      content: {} as never,
      clock: { now: () => O },
      rng: seededRng(1),
      metrics: { count: () => undefined },
      log: () => undefined,
    });
    expect(s.dev.rivals.size).toBe(0);
    expect(rivalsForPool(s, 'fb')).toBe(false);
  });
});

// ── 11. cost ──────────────────────────────────────────────────────────────────────────────────────────────

describe('CPU (design §3.7: about 0.12 ms in Node)', () => {
  it('roster, evaluation and names: median under 2 ms', () => {
    const bs = brackets(40, 111);
    const times: number[] = [];
    for (const b of bs) {
      const t0 = performance.now();
      liveTable(b, [member(0, { points: 20 })], b.opened_at + 6 * HOUR, false);
      times.push(performance.now() - t0);
    }
    expect(median(times)).toBeLessThan(2);
  });
});
