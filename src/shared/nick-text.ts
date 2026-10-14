// UI batch (2026-10-13): profile — the shape of a typed ranking name, one rule for the server and the name sheet.
// PURE leaf, like ./rank-api.ts: imports nothing, no DOM / Worker / Node global, ES2020 only. The server's
// checkFreeText (server/src/core/nickname.ts) applies it before its blocklist; the client's name sheet shows the
// same verdict while the player types (passed in by the app: ui/ imports shared/ for types only). The blocklist
// itself never leaves the server.
//
// A name: NFKC, trimmed, inner runs of white space as one space; 3 … 16 characters wide, where a wide character
// (CJK, kana, Hangul, fullwidth) counts 2, so a 2-character Chinese or Japanese name fits, and a spacing vowel sign
// counts 1 (राम is 3 wide); at most 16 code points; letters (with their combining marks: Hindi, Thai, Vietnamese …),
// digits, space, `.`, `_`, `-`, never a letter that draws nothing (the Hangul fillers); at least one letter; at most
// 4 digits; no web address or @ handle ("Dr.Cat" and "J.Lo" are names, "cats.com" is not).

/** At most this many code points (the sheet's input stops there; the save keeps `ladder.me.name` ≤ 40 units). */
export const NAME_MAX_CHARS = 16;
/** At least this display width (a wide character counts 2, a combining mark 0). */
export const NAME_MIN_WIDTH = 3;
export const NAME_MAX_DIGITS = 4;
/** Combining marks on one base character (a Thai vowel plus a tone mark needs 2; more is "Zalgo" noise). */
export const NAME_MAX_MARKS = 3;

/** What is wrong with a typed name; null when its shape is fine (the server's blocklist still decides). */
export type NameProblem = 'short' | 'long' | 'chars' | 'digits' | 'link';

/** NFKC, trimmed, inner white space collapsed to one space. */
export function normalizeName(raw: string): string {
  return raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

/** East Asian wide and fullwidth code points (the same ranges as src/i18n/meta.ts displayWidth). */
function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa960 && cp <= 0xa97f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

/**
 * Display width: a wide character 2, a non-spacing or enclosing mark 0 (it sits on its letter), anything else 1 —
 * a spacing mark too (Devanagari ा ि ी take room: राम is 3 wide, सीता 4).
 */
export function nameWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    if (/[\p{Mn}\p{Me}]/u.test(ch)) continue;
    w += isWide(ch.codePointAt(0) ?? 0) ? 2 : 1;
  }
  return w;
}

const MARK_RUN = new RegExp(`\\p{M}{${NAME_MAX_MARKS + 1},}`, 'u');
/**
 * A link: an @ handle, http, a "www" word, a well-known top-level domain in any case ("Cats.Com", "MEW.IO"), or any
 * lower-case 2–3 letter ending after a dot ("cat.tv"). Not a dot before a capital or a longer word: "Dr.Cat", "J.Lo",
 * "Mr.Comet", and not "Awww".
 */
const LINK = /@|http|\bwww\b|\.(?:com|net|org|info|io|gg|xyz|app|ru|uk|tv)\b/i;
const LINK_END = /\.[a-z]{2,3}$/;
/** Letters that draw nothing (the Hangul fillers; any default-ignorable code point that is not a mark). */
const INVISIBLE = /(?!\p{M})\p{Default_Ignorable_Code_Point}/u;

/** The shape check of a NORMALISED name (normalizeName first). */
export function nameProblem(text: string): NameProblem | null {
  if (text === '') return 'short';
  if ([...text].length > NAME_MAX_CHARS) return 'long';
  // a link or a handle first: "@cat" is said as a handle, not as a character we do not take
  if (LINK.test(text) || LINK_END.test(text)) return 'link';
  if (!/^[\p{L}\p{M}\p{N} ._-]+$/u.test(text) || !/\p{L}/u.test(text) || INVISIBLE.test(text)) return 'chars';
  // A mark sits on a letter, and only a few of them (no stacked noise over the row above or below).
  if (/(^|[^\p{L}\p{M}])\p{M}/u.test(text) || MARK_RUN.test(text)) return 'chars';
  if (nameWidth(text) < NAME_MIN_WIDTH) return 'short';
  if ((text.match(/\p{N}/gu) ?? []).length > NAME_MAX_DIGITS) return 'digits';
  return null;
}
