// Owner: G4 (Phase 2e). Computer rivals, preset r1 (2026-10-12, D-2e-24; user decision U-e: fill each ranking
// to about 50 rows with simulated players, disclosed by "Rankings include computer players."). A bracket
// created with them carries a secret tag (brackets.rivals, frozen at creation: seed, strength, word-list
// lengths); everything here is a function of that tag, the bracket's times and the evaluation time. Computer
// players are never rows: no members, players or rewards row exists for one (H-1), their slots are 9000 and up.
// PURE and integer-only (a test greps this file): no clock, no randomness except the tag's seed when it is
// written, no float maths beyond exact integer division (Math.imul and >>> for hashing, `below` exact for
// n ≤ 2^20). Workerd and Node must give the same rivals for the same tag: the golden test pins r1's output,
// so r1 is FROZEN. A change to the algorithm is a new preset (r2) beside it, never an edit of r1.
// 2026-10-12, r2: preset r2 (new brackets; staging showed r1's table "frozen": a slow +1 trickle in the join
// window, 60 % casual rivals) scores every point as a win from the moment a rival arrives (its arrival is its
// first win), in short bursty sessions with sleep windows, and replaces r1's "retire the highest index" rule by a
// replay of the real joins (core/table.ts liveRivals). r1 brackets keep r1 to their end; r2 has its own golden test.
import { AVATAR_COUNT, isDisplayText, NICKNAME_MAX_LENGTH } from '../contract';
import type { BracketRow } from '../store/rows';
import { randomBase36, type Rng } from './crypto';
import { isBlocked } from './moderation';
import type { Retired, Words } from './nickname';

const MIN = 60_000;
/** Rival `i` holds slot 9000 + i (real slots stay below; a reward id needs ≤ 3 digits, so no rival is ever payable). */
export const RIVAL_SLOT_BASE = 9000;
export const isRivalSlot = (slot: number): boolean => slot >= RIVAL_SLOT_BASE;

/**
 * `<preset>:<seed: 12 base-36>:<strength %>:<adjN>:<nounN>`, preset r1 or (2026-10-12, r2) r2. Anything else
 * means "no computer players".
 */
export const RIVAL_TAG_RE = /^(r[12]):([0-9a-z]{12}):(\d{2,3}):(\d{1,4}):(\d{1,4})$/;

/** The algorithm a tag names (2026-10-12, r2): r1 for the brackets created before r2, r2 for every new one. */
export type RivalPreset = 'r1' | 'r2';

export interface RivalsTag {
  readonly preset: RivalPreset;
  readonly seed: string;
  readonly strength: number;
  readonly adjN: number;
  readonly nounN: number;
}

/**
 * The tag's parts, or null for a missing or invalid tag (the caller counts `rivals/tag_invalid` for a
 * non-null one). 2026-10-12, D-2e-24: word-list lengths of 0 are refused too (`below` needs n ≥ 1).
 * 2026-10-12, r2: both presets parse; `preset` says which algorithm the bracket runs.
 */
export function parseRivalsTag(tag: string | null | undefined): RivalsTag | null {
  const m = typeof tag === 'string' ? RIVAL_TAG_RE.exec(tag) : null;
  if (!m) return null;
  const adjN = Number(m[4]);
  const nounN = Number(m[5]);
  if (adjN < 1 || nounN < 1) return null;
  return { preset: m[1] as RivalPreset, seed: m[2] as string, strength: Number(m[3]), adjN, nounN };
}

/**
 * A new bracket's tag (written once, at creation): a 12-character secret seed from the injected randomness
 * (never on the wire, never in admin), the strength frozen so tuning reaches new brackets only, and the word
 * lists' lengths frozen so appending words never renames a running bracket's rivals.
 * 2026-10-12, r2: new brackets get preset r2 (r1 brackets already running keep r1 to their end).
 */
export function newRivalsTag(strength: number, rng: Rng, words: Words): string {
  return `r2:${randomBase36(rng, 12)}:${strength}:${words.adj.length}:${words.noun.length}`;
}

/** One rival's whole day, computed once from the tag (times in ms since the epoch). */
export interface RivalScript {
  readonly index: number;
  readonly slot: number;
  readonly arrivalAt: number;
  /** Points at arrival (the first win's fish). */
  readonly base: number;
  /**
   * Join-window pace in tenths of a point per hour (= wins per day). 2026-10-12, r2: 0, so rivalAt's steady
   * window term is 0 (every r2 point is a win; the persona's wins per day are `winsPerDay`).
   */
  readonly pace: number;
  /** Post-window wins in time order: at `t`, `f` fish. 2026-10-12, r2: every win after the arrival win. */
  readonly wins: readonly { readonly t: number; readonly f: number }[];
  /** 2026-10-12, r2 only: the persona's wins per day after σ (λ); absent on r1 scripts. */
  readonly winsPerDay?: number;
  /** Built-in hearts, as the times they arrive, ascending. */
  readonly hearts: readonly number[];
}

export interface Roster {
  /** 2026-10-12, r2: the tag's preset (which algorithm made the scripts and which live-set rule applies). */
  readonly preset: RivalPreset;
  /** The seed's hash: secret, never sent anywhere. */
  readonly key: readonly number[];
  readonly strength: number;
  readonly adjN: number;
  readonly nounN: number;
  /** Target rows T (46…50, ≤ max_members); 0 when the bracket has no rivals (too short, max_members < 2). */
  readonly size: number;
  /** The bracket's strength σ in percent. */
  readonly sigma: number;
  readonly quiet: boolean;
  /** The opening group c0: rivals present at opened_at. */
  readonly cohort: number;
  /** N = T − 1 rivals, strongest first (r1; r2: in arrival order); rival i has slot 9000 + i. */
  readonly rivals: readonly RivalScript[];
}

// ── r1, normative (design §3.7; the golden test pins its output: add r2, never edit r1) ───────────────────

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function u32(k: readonly number[], p: number, i: number, j: number): number {
  let h = fmix32((k[0]! ^ Math.imul(p + 1, 0x9e3779b1)) >>> 0);
  h = fmix32((h ^ k[1]! ^ Math.imul(i + 1, 0x85ebca77)) >>> 0);
  h = fmix32((h ^ k[2]! ^ Math.imul(j + 1, 0xc2b2ae3d)) >>> 0);
  return fmix32((h ^ k[3]!) >>> 0);
}

/** 0 <= result < n, for 1 <= n <= 2^20 (exact: u32 * n < 2^53). */
function below(k: readonly number[], p: number, i: number, j: number, n: number): number {
  return Math.floor((u32(k, p, i, j) * n) / 4294967296);
}

// The draw purposes (the `p` of `below`): one stream each, so a draw never shifts another.
const BRACKET = 1,
  ARRIVE = 2,
  BASE = 3,
  STRENGTH = 4,
  WINS = 5,
  SESSION = 6,
  GAP = 7,
  FISH = 8,
  JITTER = 9,
  SLEEP = 10,
  HEART = 11,
  NAME_ADJ = 12,
  NAME_NOUN = 13,
  NAME_NUM = 14,
  AVATAR = 15;

/** Fish of a win from a draw 0…99: 1 at 12 %, 2 at 33 %, 3 at 55 % (mean 2.43). */
const fish = (x: number): 1 | 2 | 3 => (x < 12 ? 1 : x < 45 ? 2 : 3);

type RosterTimes = Pick<BracketRow, 'opened_at' | 'join_until' | 'ends_at' | 'max_members'>;

/**
 * The bracket's rivals from its tag (null: no valid tag, so no computer players), by the tag's preset
 * (2026-10-12, r2: r1 brackets run rosterR1 unchanged, new ones rosterR2).
 */
export function rivalRoster(tag: string | null, b: RosterTimes): Roster | null {
  const parsed = parseRivalsTag(tag);
  if (!parsed) return null;
  return parsed.preset === 'r1' ? rosterR1(parsed, b) : rosterR2(parsed, b);
}

/**
 * Preset r1. Rivals are ordered by strength: by index, arrival never comes earlier, the first points and the
 * pace never grow, so inside the join window rival i always ranks above rival j > i (a real join can only
 * retire the lowest computer row).
 */
function rosterR1(parsed: RivalsTag, b: RosterTimes): Roster {
  const k = cyrb128(parsed.seed),
    S = parsed.strength;
  const O = b.opened_at,
    J = b.join_until,
    E = b.ends_at;
  const Dmin = Math.floor((E - O) / MIN),
    Wmin = Math.floor((J - O) / MIN);
  const empty: Roster = { preset: 'r1', key: k, strength: S, adjN: parsed.adjN, nounN: parsed.nounN, size: 0, sigma: 0, quiet: false, cohort: 0, rivals: [] };
  if (Dmin < 1 || b.max_members < 2) return empty;
  const T = Math.min(b.max_members, 46 + below(k, BRACKET, 0, 0, 5));
  const N = T - 1;
  let sigma = Math.floor((S * (70 + below(k, BRACKET, 1, 0, 61))) / 100);
  const quiet = below(k, BRACKET, 3, 0, 100) < 8;
  if (quiet) sigma = Math.floor((sigma * 40) / 100);
  const c0 = Math.min(N, 8 + below(k, BRACKET, 2, 0, 5));
  const arr: number[] = [],
    base: number[] = [],
    lam: number[] = [];
  for (let i = 0; i < N; i++) {
    arr.push(i < c0 || Wmin < 3 ? 0 : 1 + below(k, ARRIVE, i, 0, Wmin - 2));
    base.push(fish(below(k, BASE, i, 0, 100)));
    const x = below(k, STRENGTH, i, 0, 1000);
    const l0 = x < 600 ? 1 + below(k, STRENGTH, i, 1, 6) : x < 900 ? 4 + below(k, STRENGTH, i, 1, 8) : x < 980 ? 9 + below(k, STRENGTH, i, 1, 9) : 15 + below(k, STRENGTH, i, 1, 10);
    lam.push(Math.max(1, Math.floor((l0 * sigma) / 100)));
  }
  arr.sort((x, y) => x - y);
  base.sort((x, y) => y - x);
  lam.sort((x, y) => y - x);
  const Pmin = Math.floor((E - J) / MIN) - 1;
  const rivals: RivalScript[] = [];
  for (let i = 0; i < N; i++) {
    const a = O + arr[i]! * MIN;
    const sl = below(k, SLEEP, i, 0, 1440),
      L = 420 + below(k, SLEEP, i, 1, 121);
    const awake = (t: number): boolean => ((Math.floor(t / MIN) % 1440) - sl + 1440) % 1440 >= L;
    const wins: { t: number; f: number }[] = [];
    if (Pmin > 10) {
      const q = lam[i]! * Pmin;
      const n = Math.floor(q / 1440) + (below(k, WINS, i, 0, 1440) < q % 1440 ? 1 : 0);
      if (n > 0) {
        const per = 3 + below(k, WINS, i, 1, 5);
        const sessions = Math.min(8, Math.floor((n + per - 1) / per));
        const starts: number[] = [];
        for (let s = 0; s < sessions; s++)
          for (let tr = 0; tr < 8; tr++) {
            const st = below(k, SESSION, i, s * 8 + tr, Pmin - 10);
            if (awake(J + st * MIN)) {
              starts.push(st);
              break;
            }
          }
        starts.sort((x, y) => x - y);
        const cur = starts.slice();
        for (let w = 0; w < n && starts.length > 0; w++) {
          const s = w % starts.length;
          if (cur[s]! <= Pmin - 1) wins.push({ t: J + cur[s]! * MIN + 1 + below(k, JITTER, i, w, 59999), f: fish(below(k, FISH, i, w, 100)) });
          cur[s] = cur[s]! + 1 + below(k, GAP, i, w, 5);
        }
        wins.sort((x, y) => x.t - y.t);
      }
    }
    const hx = below(k, HEART, i, 0, 100);
    const H = hx < 55 ? 0 : hx < 80 ? 1 : hx < 92 ? 2 + below(k, HEART, i, 1, 2) : 4 + below(k, HEART, i, 2, 6);
    const span = Math.max(1, Math.floor((E - a) / MIN));
    const hearts: number[] = [];
    for (let h = 0; h < H; h++) hearts.push(a + MIN * below(k, HEART, i, 3 + h, span));
    hearts.sort((x, y) => x - y);
    rivals.push({ index: i, slot: RIVAL_SLOT_BASE + i, arrivalAt: a, base: base[i]!, pace: lam[i]!, wins, hearts });
  }
  return { preset: 'r1', key: k, strength: S, adjN: parsed.adjN, nounN: parsed.nounN, size: T, sigma, quiet, cohort: c0, rivals };
}

// ── r2, normative (2026-10-12, r2; its golden test pins its output: once shipped, r2 is frozen like r1) ──────

// r2's own draw purposes. The shared ones keep one meaning per preset: BRACKET (T, σ, c0, quiet: as r1), ARRIVE
// (i, 0 minute; i, 1 ms), BASE (the arrival win's fish), STRENGTH (i, 0 persona; i, 1 wins a day), SESSION (a
// uniform session start, try j = s·8 + tr), GAP / JITTER / FISH (attempt w), SLEEP, HEART (as r1).
const PER = 16,
  FIRST = 17;

/** r2 personas (cumulative share in percent; wins a day lo…hi, inclusive): casual 45, regular 37, keen 14, grinder 4. */
const R2_PERSONAS: readonly (readonly [number, number, number])[] = [
  [45, 3, 7],
  [82, 7, 14],
  [96, 14, 26],
  [100, 26, 40],
];
/** At most this many sessions per rival (a cap the wins of a day, ≤ 4 a session, practically never reach). */
const R2_MAX_SESSIONS = 60;
const DAY_MS = 86_400_000;

/** Rival i's sleep: it starts at minute `start` (0…1439) of the UTC day and lasts `minutes` (420…540). r1's inline draw is the same. */
const sleepOf = (k: readonly number[], i: number): { start: number; minutes: number } => ({ start: below(k, SLEEP, i, 0, 1440), minutes: 420 + below(k, SLEEP, i, 1, 121) });

/**
 * Rival `index`'s daily sleep window, [start, start + minutes) in minutes of the UTC day, wrapping at midnight
 * (2026-10-12, r2: for the tests that check r2 places its sessions while the rival is awake; the same draw r1 makes).
 */
export function rivalSleep(r: Roster, index: number): { start: number; minutes: number } {
  return sleepOf(r.key, index);
}

/**
 * Preset r2 (2026-10-12, r2). The bracket draws are r1's (T 46…50 ≤ max_members, N = T − 1, σ 70…130 % of the
 * tag's strength, the 8 % quiet bracket at 40 %, the opening group c0 = 8…12 at opened_at); the other rivals
 * arrive at a uniform minute (plus ms) of the join window, sorted, so index = arrival order. A rival's arrival is
 * its first win (fish 1: 12 %, 2: 33 %, 3: 55 %); after it, n = round(λ · (ends_at − arrival) / 24 h) − 1 more
 * wins (λ = max(1, floor(persona wins a day · σ / 100))) in sessions of 1…4 wins, 1…4 min apart (plus ms): the
 * first session starts 1…25 min after the arrival at 60 %, every other one at a uniform minute of
 * [arrival, ends_at − 10 min) drawn up to 8 times to miss the rival's sleep (7–9 h a day; the 8th is kept); a win
 * at or after ends_at − 1 min is dropped. No order guarantee: rivals overtake each other at any time, and the
 * live set comes from a replay of the real joins (core/table.ts liveRivals), not from the index.
 */
function rosterR2(parsed: RivalsTag, b: RosterTimes): Roster {
  const k = cyrb128(parsed.seed),
    S = parsed.strength;
  const O = b.opened_at,
    J = b.join_until,
    E = b.ends_at;
  const Dmin = Math.floor((E - O) / MIN),
    Wmin = Math.floor((J - O) / MIN);
  const empty: Roster = { preset: 'r2', key: k, strength: S, adjN: parsed.adjN, nounN: parsed.nounN, size: 0, sigma: 0, quiet: false, cohort: 0, rivals: [] };
  if (Dmin < 1 || b.max_members < 2) return empty;
  const T = Math.min(b.max_members, 46 + below(k, BRACKET, 0, 0, 5));
  const N = T - 1;
  let sigma = Math.floor((S * (70 + below(k, BRACKET, 1, 0, 61))) / 100);
  const quiet = below(k, BRACKET, 3, 0, 100) < 8;
  if (quiet) sigma = Math.floor((sigma * 40) / 100);
  const c0 = Math.min(N, 8 + below(k, BRACKET, 2, 0, 5));
  const arr: number[] = [];
  for (let i = 0; i < N; i++) arr.push(i < c0 || Wmin < 3 ? 0 : (1 + below(k, ARRIVE, i, 0, Wmin - 2)) * MIN + below(k, ARRIVE, i, 1, 60_000));
  arr.sort((x, y) => x - y);
  const rivals: RivalScript[] = [];
  for (let i = 0; i < N; i++) {
    const a = O + arr[i]!;
    const x = below(k, STRENGTH, i, 0, 100);
    const p = R2_PERSONAS.find((q) => x < q[0]) as readonly [number, number, number];
    const lam = Math.max(1, Math.floor(((p[1] + below(k, STRENGTH, i, 1, p[2] - p[1] + 1)) * sigma) / 100));
    // round(λ · span / day) − 1 in integers: floor((2q + day) / 2·day), q = λ · span < 2^53.
    const n = Math.max(0, Math.floor((2 * lam * (E - a) + DAY_MS) / (2 * DAY_MS)) - 1);
    const { start: sl, minutes: L } = sleepOf(k, i);
    const awake = (t: number): boolean => ((Math.floor(t / MIN) % 1440) - sl + 1440) % 1440 >= L;
    const spanMin = Math.max(1, Math.floor((E - 10 * MIN - a) / MIN));
    const wins: { t: number; f: number }[] = [];
    let w = 0;
    for (let s = 0; s < R2_MAX_SESSIONS && wins.length < n; s++) {
      let st = a;
      if (s === 0 && below(k, FIRST, i, 0, 100) < 60) st = a + (1 + below(k, FIRST, i, 1, 25)) * MIN;
      else
        for (let tr = 0; tr < 8; tr++) {
          st = a + below(k, SESSION, i, s * 8 + tr, spanMin) * MIN;
          if (awake(st)) break;
        }
      const per = 1 + below(k, PER, i, s, 4);
      for (let c = 0; c < per && wins.length < n; c++, w++) {
        st += (1 + below(k, GAP, i, w, 4)) * MIN;
        const t = st + below(k, JITTER, i, w, 60_000);
        if (t < E - MIN) wins.push({ t, f: fish(below(k, FISH, i, w, 100)) });
      }
    }
    wins.sort((x, y) => x.t - y.t);
    const hx = below(k, HEART, i, 0, 100);
    const H = hx < 55 ? 0 : hx < 80 ? 1 : hx < 92 ? 2 + below(k, HEART, i, 1, 2) : 4 + below(k, HEART, i, 2, 6);
    const span = Math.max(1, Math.floor((E - a) / MIN));
    const hearts: number[] = [];
    for (let h = 0; h < H; h++) hearts.push(a + MIN * below(k, HEART, i, 3 + h, span));
    hearts.sort((x, y) => x - y);
    rivals.push({ index: i, slot: RIVAL_SLOT_BASE + i, arrivalAt: a, base: fish(below(k, BASE, i, 0, 100)), pace: 0, wins, hearts, winsPerDay: lam });
  }
  return { preset: 'r2', key: k, strength: S, adjN: parsed.adjN, nounN: parsed.nounN, size: T, sigma, quiet, cohort: c0, rivals };
}

/**
 * A rival at time `t` (the caller clamps t to [opened_at, ends_at]), or null before it arrives. Join window:
 * +1 at a steady pace; after it: the fish of its sessions' wins. Never reads a real member's points.
 * 2026-10-12, r2: an r2 script has pace 0, so this is its arrival win's fish plus every win at or before t
 * (scoredAt: the last of them, the arrival included), at any time of the day.
 */
export function rivalAt(r: RivalScript, joinUntil: number, t: number): { points: number; scoredAt: number; hearts: number } | null {
  if (t < r.arrivalAt) return null;
  const tw = Math.min(t, joinUntil);
  let points = r.base + Math.floor(((tw - r.arrivalAt) * r.pace) / 36_000_000);
  let scoredAt = points <= r.base ? r.arrivalAt : r.arrivalAt + Math.floor(((points - r.base) * 36_000_000 + r.pace - 1) / r.pace);
  for (const w of r.wins) {
    if (w.t > t) break;
    points += w.f;
    scoredAt = w.t;
  }
  let hearts = 0;
  for (const h of r.hearts) if (h <= t) hearts++;
  return { points, scoredAt, hearts };
}

/**
 * K: how many rivals may show (2026-10-12, D-2e-24). `next_slot` counts every real join and never drops
 * (hide, suspend and delete leave it), so rows ≤ max_members always and a retired rival never returns.
 * Rival i is shown while i < K and it has arrived. 2026-10-12, r2: K is the same count for r2, but WHICH K
 * rivals are live comes from core/table.ts liveRivals (a replay of the real joins), not from the index; a deleted
 * joiner's join keeps its time there (brackets.deleted_joins), so a retired r2 rival never returns either.
 */
export function liveRivalCount(r: Roster, b: Pick<BracketRow, 'next_slot' | 'max_members'>): number {
  return Math.max(0, Math.min(r.rivals.length, b.max_members - b.next_slot));
}

/**
 * Every rival's name and avatar, resolved for ALL rivals in index order (so a name depends on neither the
 * time nor K): the first of 16 candidates whose words are not retired, whose text no one in `takenLower`
 * (every member's nickname, hidden rows included, lowercased) or an earlier rival holds, and that passes
 * the blocklist. Words are sliced to the tag's adjN / nounN.
 */
export function rivalNames(r: Roster, takenLower: ReadonlySet<string>, words: Words, retired: Retired): Map<number, { nickname: string; avatar: number }> {
  const taken = new Set(takenLower);
  const out = new Map<number, { nickname: string; avatar: number }>();
  for (const x of r.rivals) {
    let pick: string | null = null;
    for (let c = 0; c < 16 && pick === null; c++) {
      const adj = below(r.key, NAME_ADJ, x.index, c, r.adjN),
        noun = below(r.key, NAME_NOUN, x.index, c, r.nounN),
        num = 1 + below(r.key, NAME_NUM, x.index, c, 99);
      if (retired.adj.includes(adj) || retired.noun.includes(noun)) continue;
      // 2026-10-12, D-2e-24: a tag written by newer code with longer lists (a rollback) skips the missing words.
      const a = words.adj[adj],
        n = words.noun[noun];
      if (a === undefined || n === undefined) continue;
      const text = `${a} ${n} ${num}`;
      if (taken.has(text.toLowerCase()) || isBlocked(text)) continue;
      pick = text;
    }
    pick ??= `${words.adj[0] ?? 'Cat'} ${words.noun[0] ?? 'Cat'} ${x.index + 1}`;
    taken.add(pick.toLowerCase());
    out.set(x.slot, { nickname: pick, avatar: below(r.key, AVATAR, x.index, 0, 12) });
  }
  return out;
}

// ── The frozen final snapshot (brackets.final_rivals, design §5.2) ────────────────────────────────────────

/** A computer player's row of the frozen final standings. */
export interface FinalRival {
  readonly slot: number;
  readonly rank: number;
  readonly points: number;
  readonly scoredAt: number;
  /** Built-in hearts at ends_at (real hearts are counted from the hearts table on read). */
  readonly hearts: number;
  readonly avatar: number;
  readonly nickname: string;
}

/** The snapshot's size limit; 50 rows take about 2 KB. */
export const FINAL_RIVALS_MAX_CHARS = 8192;

/** `[[slot, rank, points, scoredAt − opened_at, hearts, avatar, "nickname"], …]`, in the order given (rank order). */
export function encodeFinalRivals(rows: readonly FinalRival[], b: Pick<BracketRow, 'opened_at'>): string {
  return JSON.stringify(rows.map((r) => [r.slot, r.rank, r.points, r.scoredAt - b.opened_at, r.hearts, r.avatar, r.nickname]));
}

const isInt = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi;

/**
 * The snapshot's rows, or null when there is none or ANY part of it is malformed (the whole snapshot is then
 * ignored and the caller counts `rivals/decode_error` for a non-null one): more than 8 KB, more entries than
 * max_members, a slot outside 9000…9999 or repeated, a rank outside 1…final_members or repeated, points < 1,
 * a negative offset, hearts outside 0…1000, an avatar we do not draw, a nickname that is not display text.
 */
export function decodeFinalRivals(s: string | null | undefined, b: Pick<BracketRow, 'opened_at' | 'max_members' | 'final_members'>): FinalRival[] | null {
  if (typeof s !== 'string' || s.length > FINAL_RIVALS_MAX_CHARS) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(s);
  } catch {
    return null;
  }
  if (!Array.isArray(raw) || raw.length > b.max_members) return null;
  const maxRank = b.final_members ?? 0;
  const slots = new Set<number>();
  const ranks = new Set<number>();
  const out: FinalRival[] = [];
  for (const e of raw as unknown[]) {
    if (!Array.isArray(e) || e.length !== 7) return null;
    const [slot, rank, points, offset, hearts, avatar, nickname] = e as unknown[];
    if (!isInt(slot, RIVAL_SLOT_BASE, 9999) || slots.has(slot)) return null;
    if (!isInt(rank, 1, maxRank) || ranks.has(rank)) return null;
    if (!isInt(points, 1, Number.MAX_SAFE_INTEGER) || !isInt(offset, 0, Number.MAX_SAFE_INTEGER)) return null;
    if (!isInt(hearts, 0, 1000) || !isInt(avatar, 0, AVATAR_COUNT - 1)) return null;
    if (!isDisplayText(nickname, NICKNAME_MAX_LENGTH)) return null;
    slots.add(slot);
    ranks.add(rank);
    out.push({ slot, rank, points, scoredAt: b.opened_at + offset, hearts, avatar, nickname });
  }
  return out;
}
