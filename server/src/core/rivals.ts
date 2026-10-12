// Owner: G4 (Phase 2e). Computer rivals, preset r1 (2026-10-12, D-2e-24; user decision U-e: fill each ranking
// to about 50 rows with simulated players, disclosed by "Rankings include computer players."). A bracket
// created with them carries a secret tag (brackets.rivals, frozen at creation: seed, strength, word-list
// lengths); everything here is a function of that tag, the bracket's times and the evaluation time. Computer
// players are never rows: no members, players or rewards row exists for one (H-1), their slots are 9000 and up.
// PURE and integer-only (a test greps this file): no clock, no randomness except the tag's seed when it is
// written, no float maths beyond exact integer division (Math.imul and >>> for hashing, `below` exact for
// n ≤ 2^20). Workerd and Node must give the same rivals for the same tag: the golden test pins r1's output,
// so r1 is FROZEN. A change to the algorithm is a new preset (r2) beside it, never an edit of r1.
import { AVATAR_COUNT, isDisplayText, NICKNAME_MAX_LENGTH } from '../contract';
import type { BracketRow } from '../store/rows';
import { randomBase36, type Rng } from './crypto';
import { isBlocked } from './moderation';
import type { Retired, Words } from './nickname';

const MIN = 60_000;
/** Rival `i` holds slot 9000 + i (real slots stay below; a reward id needs ≤ 3 digits, so no rival is ever payable). */
export const RIVAL_SLOT_BASE = 9000;
export const isRivalSlot = (slot: number): boolean => slot >= RIVAL_SLOT_BASE;

/** `r1:<seed: 12 base-36>:<strength %>:<adjN>:<nounN>`. Anything else means "no computer players". */
export const RIVAL_TAG_RE = /^r1:([0-9a-z]{12}):(\d{2,3}):(\d{1,4}):(\d{1,4})$/;

export interface RivalsTag {
  readonly seed: string;
  readonly strength: number;
  readonly adjN: number;
  readonly nounN: number;
}

/**
 * The tag's parts, or null for a missing or invalid tag (the caller counts `rivals/tag_invalid` for a
 * non-null one). 2026-10-12, D-2e-24: word-list lengths of 0 are refused too (`below` needs n ≥ 1).
 */
export function parseRivalsTag(tag: string | null | undefined): RivalsTag | null {
  const m = typeof tag === 'string' ? RIVAL_TAG_RE.exec(tag) : null;
  if (!m) return null;
  const adjN = Number(m[3]);
  const nounN = Number(m[4]);
  if (adjN < 1 || nounN < 1) return null;
  return { seed: m[1] as string, strength: Number(m[2]), adjN, nounN };
}

/**
 * A new bracket's tag (written once, at creation): a 12-character secret seed from the injected randomness
 * (never on the wire, never in admin), the strength frozen so tuning reaches new brackets only, and the word
 * lists' lengths frozen so appending words never renames a running bracket's rivals.
 */
export function newRivalsTag(strength: number, rng: Rng, words: Words): string {
  return `r1:${randomBase36(rng, 12)}:${strength}:${words.adj.length}:${words.noun.length}`;
}

/** One rival's whole day, computed once from the tag (times in ms since the epoch). */
export interface RivalScript {
  readonly index: number;
  readonly slot: number;
  readonly arrivalAt: number;
  /** Points at arrival (the first win's fish). */
  readonly base: number;
  /** Join-window pace in tenths of a point per hour (= wins per day). */
  readonly pace: number;
  /** Post-window wins in time order: at `t`, `f` fish. */
  readonly wins: readonly { readonly t: number; readonly f: number }[];
  /** Built-in hearts, as the times they arrive, ascending. */
  readonly hearts: readonly number[];
}

export interface Roster {
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
  /** N = T − 1 rivals, strongest first; rival i has slot 9000 + i. */
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

/**
 * The bracket's rivals from its tag (null: no valid tag, so no computer players). Rivals are ordered by
 * strength: by index, arrival never comes earlier, the first points and the pace never grow, so inside the
 * join window rival i always ranks above rival j > i (a real join can only retire the lowest computer row).
 */
export function rivalRoster(tag: string | null, b: Pick<BracketRow, 'opened_at' | 'join_until' | 'ends_at' | 'max_members'>): Roster | null {
  const parsed = parseRivalsTag(tag);
  if (!parsed) return null;
  const k = cyrb128(parsed.seed),
    S = parsed.strength;
  const O = b.opened_at,
    J = b.join_until,
    E = b.ends_at;
  const Dmin = Math.floor((E - O) / MIN),
    Wmin = Math.floor((J - O) / MIN);
  const empty: Roster = { key: k, strength: S, adjN: parsed.adjN, nounN: parsed.nounN, size: 0, sigma: 0, quiet: false, cohort: 0, rivals: [] };
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
  return { key: k, strength: S, adjN: parsed.adjN, nounN: parsed.nounN, size: T, sigma, quiet, cohort: c0, rivals };
}

/**
 * A rival at time `t` (the caller clamps t to [opened_at, ends_at]), or null before it arrives. Join window:
 * +1 at a steady pace; after it: the fish of its sessions' wins. Never reads a real member's points.
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
 * Rival i is shown while i < K and it has arrived.
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
