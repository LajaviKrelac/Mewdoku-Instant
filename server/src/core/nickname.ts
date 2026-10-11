// Owner: G4 (Phase 2e). Nicknames and avatars (spec §1.8, D-2e-16): `adj + " " + noun + " " + num` from our
// append-only word lists (src/shared/nick-words.ts), picked from a hash of the player key at the first
// session; re-pickable; free text only if `nickname.freeText` is switched on. PURE.
import { AVATAR_COUNT, NICK_NUM_MAX, NICK_NUM_MIN, NICKNAME_MAX_LENGTH } from '../contract';
import { isBlocked } from './moderation';

export interface Words {
  readonly adj: readonly string[];
  readonly noun: readonly string[];
}
export interface Retired {
  readonly adj: readonly number[];
  readonly noun: readonly number[];
}
export interface NickPick {
  readonly adj: number;
  readonly noun: number;
  readonly num: number;
}

export function renderNick(words: Words, p: NickPick): string {
  return `${words.adj[p.adj] ?? 'Cat'} ${words.noun[p.noun] ?? 'Cat'} ${p.num}`;
}

const pickable = (len: number, retired: readonly number[]): number[] => {
  const out: number[] = [];
  for (let i = 0; i < len; i++) if (!retired.includes(i)) out.push(i);
  return out;
};

/** A name and avatar from ≥ 6 seed bytes (the first session; the same key always gets the same first name). */
export function generateNick(seed: Uint8Array, words: Words, retired: Retired): { nick: NickPick; avatarId: number } {
  const b = (i: number): number => seed[i % seed.length] ?? 0;
  const adjs = pickable(words.adj.length, retired.adj);
  const nouns = pickable(words.noun.length, retired.noun);
  const adj = adjs[((b(0) << 8) | b(1)) % adjs.length] ?? 0;
  const noun = nouns[((b(2) << 8) | b(3)) % nouns.length] ?? 0;
  const num = NICK_NUM_MIN + (((b(4) << 8) | b(5)) % (NICK_NUM_MAX - NICK_NUM_MIN + 1));
  return { nick: { adj, noun, num }, avatarId: b(6) % AVATAR_COUNT };
}

export type PickCheck = { readonly ok: true; readonly nick: NickPick } | { readonly ok: false; readonly code: 'nickname_invalid' | 'nickname_blocked' };

/** A word pick from the profile request (`num` omitted: keep `currentNum`). */
export function checkPick(pick: { readonly adj: number; readonly noun: number; readonly num?: number }, currentNum: number, words: Words, retired: Retired): PickCheck {
  const num = pick.num ?? currentNum;
  if (pick.adj < 0 || pick.adj >= words.adj.length || retired.adj.includes(pick.adj)) return { ok: false, code: 'nickname_invalid' };
  if (pick.noun < 0 || pick.noun >= words.noun.length || retired.noun.includes(pick.noun)) return { ok: false, code: 'nickname_invalid' };
  if (!Number.isInteger(num) || num < NICK_NUM_MIN || num > NICK_NUM_MAX) return { ok: false, code: 'nickname_invalid' };
  const nick = { adj: pick.adj, noun: pick.noun, num };
  if (isBlocked(renderNick(words, nick))) return { ok: false, code: 'nickname_blocked' };
  return { ok: true, nick };
}

export type TextCheck = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly code: 'nickname_invalid' | 'nickname_blocked' };

/**
 * Free text (only with `nickname.freeText`, spec §1.8): NFKC, 3–16 characters of letters, digits, space,
 * `.`, `_`, `-`; at most 4 digits; no URL or handle pattern; the skeleton not blocked.
 */
export function checkFreeText(raw: string): TextCheck {
  const text = raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const chars = [...text];
  if (chars.length < 3 || chars.length > 16 || text.length > NICKNAME_MAX_LENGTH) return { ok: false, code: 'nickname_invalid' };
  if (!/^[\p{L}\p{N} ._-]+$/u.test(text)) return { ok: false, code: 'nickname_invalid' };
  if ((text.match(/\p{N}/gu) ?? []).length > 4) return { ok: false, code: 'nickname_invalid' };
  if (/www|\.com|\.net|\.org|http|@|\.\w{2,3}$/i.test(text)) return { ok: false, code: 'nickname_invalid' };
  if (isBlocked(text)) return { ok: false, code: 'nickname_blocked' };
  return { ok: true, text };
}

/** The next allowed change (PlayerView.nicknameChangeAt): null while the first change is still free or the cooldown is over. */
export function nextNickChange(nickChangedAt: number | null, cooldownMs: number, now: number): number | null {
  if (nickChangedAt === null) return null;
  const at = nickChangedAt + cooldownMs;
  return at > now ? at : null;
}
