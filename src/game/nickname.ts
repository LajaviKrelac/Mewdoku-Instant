// Owner: G1 (Phase 2e)
// Ranking names (docs/phase2e/spec.md §1.8, D-2e-16; CONTRACTS §6): the rendered text of a word pick
// (`${adj} ${noun} ${num}` from the append-only lists of src/shared/nick-words.ts), id bounds, and the
// fallback "Cat {num}" for an index this build's lists do not have (a newer list on another device).
// The server stores the rendered text, so this is only for the name sheet's preview and the shuffle.
// PURE: the shuffle's randomness is passed in (game/ has none of its own).
import { NICK_NUM_MAX, NICK_NUM_MIN } from '../shared/rank-api';
import type { NickWords } from '../shared/nick-words';

export interface NickPick {
  readonly adj: number;
  readonly noun: number;
  readonly num: number;
}

/** num clamped to NICK_NUM_MIN … NICK_NUM_MAX (a non-number → NICK_NUM_MIN). */
export function clampNickNum(num: number): number {
  if (!Number.isFinite(num)) return NICK_NUM_MIN;
  return Math.min(NICK_NUM_MAX, Math.max(NICK_NUM_MIN, Math.round(num)));
}

/** An index that names a word of `list`. */
export function isWordIndex(i: number, list: readonly string[]): boolean {
  return Number.isInteger(i) && i >= 0 && i < list.length;
}

/** The pick names words of both lists and a number in range. */
export function isNickPick(p: NickPick, words: NickWords): boolean {
  return isWordIndex(p.adj, words.adj) && isWordIndex(p.noun, words.noun) && Number.isInteger(p.num) && p.num >= NICK_NUM_MIN && p.num <= NICK_NUM_MAX;
}

/** "Velvet Pounce 27"; an index outside this build's lists → "Cat 27" (never an invented word). */
export function nickText(nick: NickPick, words: NickWords): string {
  const num = clampNickNum(nick.num);
  if (!isWordIndex(nick.adj, words.adj) || !isWordIndex(nick.noun, words.noun)) return `Cat ${num}`;
  return `${words.adj[nick.adj] as string} ${words.noun[nick.noun] as string} ${num}`;
}

/**
 * A new pick from `rand` (a function giving numbers in [0, 1)), skipping retired indices; the avatar is
 * not part of a name. Never returns the same name as `avoid` when another is possible.
 */
export function shufflePick(
  words: NickWords,
  rand: () => number,
  retired: { readonly adj: readonly number[]; readonly noun: readonly number[] } = { adj: [], noun: [] },
  avoid?: NickPick,
): NickPick {
  const pickIndex = (list: readonly string[], skip: readonly number[]): number => {
    const allowed: number[] = [];
    for (let i = 0; i < list.length; i++) if (!skip.includes(i)) allowed.push(i);
    if (allowed.length === 0) return 0;
    return allowed[Math.min(allowed.length - 1, Math.floor(rand() * allowed.length))] as number;
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    const p: NickPick = {
      adj: pickIndex(words.adj, retired.adj),
      noun: pickIndex(words.noun, retired.noun),
      num: clampNickNum(NICK_NUM_MIN + Math.floor(rand() * (NICK_NUM_MAX - NICK_NUM_MIN + 1))),
    };
    if (!avoid || p.adj !== avoid.adj || p.noun !== avoid.noun || p.num !== avoid.num) return p;
  }
  return { ...(avoid as NickPick), num: avoid && avoid.num < NICK_NUM_MAX ? avoid.num + 1 : NICK_NUM_MIN };
}
