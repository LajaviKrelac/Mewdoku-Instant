// Owner: G4 (Phase 2e). Name moderation (spec §1.8): skeletons and the blocklist check. PURE.
// UI batch (profile, 2026-10-13): typed names are on (nickname.freeText), so the check grew with them:
// - accents fold away on Latin, Greek, Cyrillic, Arabic and Hebrew letters (é → e, the optional Arabic vowel signs),
//   while the scripts whose vowel signs ARE the word (Devanagari, Thai, Japanese voicing marks …) keep them;
// - a second skeleton folds Cyrillic and Greek look-alike letters into Latin ("fuсk" with a Cyrillic с) and is tested
//   against the terms folded the same way, so a native Cyrillic entry with one Latin letter in it ("xyй") still
//   matches (review fix, 2026-10-14: the terms were not folded);
// - a strong (substring) term needs a display width ≥ 3, so a 2-character Chinese term qualifies;
// - innocent words that contain a strong term (Scunthorpe, Nazia) are cut out of the name before the substring test,
//   from its letters before repeats collapse ("Niggar" is not "Nigar").
import { nameWidth } from '../contract';
import { BLOCKLIST } from '../moderation/blocklist';

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };
/** Arabic spelling variants that change nothing for a reader (alef maqsura, ta marbuta, the Persian kaf and ya). */
const VARIANT: Record<string, string> = { 'ى': 'ي', 'ة': 'ه', 'ک': 'ك', 'ی': 'ي' };
/** Cyrillic and Greek capitals that look like Latin ones (read before lowercasing: Greek Ν is an N, its ν a v). */
const CAPS: Record<string, string> = {
  А: 'a', В: 'b', Е: 'e', К: 'k', М: 'm', Н: 'h', О: 'o', Р: 'p', С: 'c', Т: 't', У: 'y', Х: 'x', Ѕ: 's', І: 'i', Ј: 'j',
  Һ: 'h', Ԛ: 'q', Ԝ: 'w',
  Α: 'a', Β: 'b', Ε: 'e', Ζ: 'z', Η: 'h', Ι: 'i', Κ: 'k', Μ: 'm', Ν: 'n', Ο: 'o', Ρ: 'p', Τ: 't', Υ: 'y', Χ: 'x',
};
/**
 * Lowercase Cyrillic and Greek letters that look like Latin ones in upright type (or like their small capitals: н, в,
 * к, т). Never an italic-only likeness: и is a u and д a d only in italics, so "Рита" never reads as "puta" (review
 * fix, 2026-10-14); п and г stay, they read as n and r in the upright sans-serif a ranking row uses.
 */
const LOOKALIKE: Record<string, string> = {
  а: 'a', в: 'b', г: 'r', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', п: 'n', р: 'p', с: 'c', т: 't', у: 'y',
  х: 'x', ь: 'b', ѕ: 's', і: 'i', ј: 'j', ԁ: 'd', һ: 'h', ӏ: 'l', ԛ: 'q', ԝ: 'w',
  α: 'a', β: 'b', γ: 'y', ε: 'e', η: 'n', ι: 'i', κ: 'k', μ: 'u', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ω: 'w',
};
/** Scripts whose combining marks are accents or optional vowel signs (dropped); every other script keeps its marks. */
const FOLD_MARKS = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}]/u;
const TATWEEL = 'ـ';

/** A skeleton before its repeats collapse (NFKD): see skeleton. */
function letters(s: string, lookalikes: boolean): string {
  let out = '';
  let base = '';
  for (const orig of s.normalize('NFKD')) {
    for (const ch of (lookalikes ? CAPS[orig] : undefined) ?? orig.toLowerCase()) {
      if (/\p{M}/u.test(ch)) {
        if (base !== '' && !FOLD_MARKS.test(base)) out += ch;
        continue;
      }
      let c = LEET[ch] ?? VARIANT[ch] ?? ch;
      if (lookalikes) c = LOOKALIKE[c] ?? c;
      if (c === TATWEEL || !/\p{L}/u.test(c)) continue;
      base = c;
      out += c;
    }
  }
  return out;
}

/** Repeated code points as one, then NFC. */
function collapse(s: string): string {
  let out = '';
  let prev = '';
  for (const ch of s) {
    if (ch !== prev) out += ch;
    prev = ch;
  }
  return out.normalize('NFC');
}

/**
 * NFKD, lowercase; 0→o 1→i 3→e 4→a 5→s 7→t @→a $→s; accents dropped (see FOLD_MARKS); anything that is not a letter
 * (or a kept mark) stripped; repeated letters collapsed; NFC. `lookalikes`: Cyrillic and Greek look-alikes as Latin.
 */
export function skeleton(s: string, lookalikes = false): string {
  return collapse(letters(s, lookalikes));
}

/** The words of a name (split on anything that is not a letter, a mark, a digit or a leet sign). */
function words(s: string): string[] {
  return s.split(/[^\p{L}\p{M}\p{N}@$]+/u).filter((w) => w.length > 0);
}

export interface Blocklist {
  readonly strong: readonly string[];
  readonly ambiguous: readonly string[];
  /** Innocent words that contain a strong term (place and family names); cut out before the substring test. */
  readonly innocent?: readonly string[];
}

interface Terms {
  readonly strong: readonly string[];
  readonly ambiguous: ReadonlySet<string>;
}

interface Prepared {
  /** The terms' skeletons, for the plain skeleton of a name. */
  readonly plain: Terms;
  /** The terms' look-alike skeletons, for the look-alike skeleton of a name: a native Cyrillic term with one Latin
   *  letter in it ("Xуй", "пиздa") reads the same as the term on both sides (review fix, 2026-10-14). */
  readonly folded: Terms;
  /** Innocent words as letters, repeats kept: "Nigar" is cut, "Niggar" is not. */
  readonly innocent: readonly string[];
}

/** Pre-skeletonised once per isolate. */
function prepared(list: Blocklist): Prepared {
  const strong = list.strong.filter((x) => nameWidth(x) >= 3);
  const terms = (fold: boolean): Terms => ({
    strong: strong.map((x) => skeleton(x, fold)).filter((x) => x.length > 0),
    ambiguous: new Set(list.ambiguous.map((x) => skeleton(x, fold)).filter((x) => x.length > 0)),
  });
  return {
    plain: terms(false),
    folded: terms(true),
    innocent: (list.innocent ?? []).map((x) => letters(x, false)).filter((x) => x.length > 0),
  };
}

const DEFAULT = prepared(BLOCKLIST);

/**
 * The name's skeleton with the innocent words cut out: cut from its letters BEFORE the repeats collapse (a doubled
 * letter is no longer the innocent word), and as a space, never a letter, so the two sides cannot join into a term.
 */
function withoutInnocent(text: string, fold: boolean, innocent: readonly string[]): string {
  let s = letters(text, fold);
  for (const w of innocent) s = s.split(w).join(' ');
  return collapse(s);
}

/**
 * The first blocked term the text contains (strong: anywhere in the skeleton; ambiguous: a whole word), the plain
 * skeleton against the plain terms and the look-alike one against the folded terms, or null.
 */
export function blockedTerm(text: string, list: Blocklist | null = null): string | null {
  const p = list === null ? DEFAULT : prepared(list);
  for (const fold of [false, true]) {
    const terms = fold ? p.folded : p.plain;
    const whole = withoutInnocent(text, fold, p.innocent);
    for (const t of terms.strong) if (whole.includes(t)) return t;
    for (const w of words(text)) {
      const k = skeleton(w, fold);
      if (terms.ambiguous.has(k)) return k;
    }
  }
  return null;
}

export function isBlocked(text: string, list: Blocklist | null = null): boolean {
  return blockedTerm(text, list) !== null;
}
