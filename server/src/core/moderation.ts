// Owner: G4 (Phase 2e). Name moderation (spec §1.8): skeletons and the blocklist check. PURE.
// UI batch (profile, 2026-10-13): typed names are on (nickname.freeText), so the check grew with them:
// - accents fold away on Latin, Greek, Cyrillic, Arabic and Hebrew letters (é → e, the optional Arabic vowel signs),
//   while the scripts whose vowel signs ARE the word (Devanagari, Thai, Japanese voicing marks …) keep them;
// - a second skeleton folds Cyrillic and Greek look-alike letters into Latin ("fuсk" with a Cyrillic с), and every
//   term is tested against both, so a native Cyrillic entry still matches the first;
// - a strong (substring) term needs a display width ≥ 3, so a 2-character Chinese term qualifies;
// - innocent words that contain a strong term (Scunthorpe) are cut out of the name before the substring test.
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
/** Lowercase Cyrillic and Greek letters that look like Latin ones (or like their small capitals: н, в, к, т). */
const LOOKALIKE: Record<string, string> = {
  а: 'a', в: 'b', г: 'r', д: 'd', е: 'e', и: 'u', к: 'k', м: 'm', н: 'h', о: 'o', п: 'n', р: 'p', с: 'c', т: 't', у: 'y',
  х: 'x', ь: 'b', ѕ: 's', і: 'i', ј: 'j', ԁ: 'd', һ: 'h', ӏ: 'l', ԛ: 'q', ԝ: 'w',
  α: 'a', β: 'b', γ: 'y', ε: 'e', η: 'n', ι: 'i', κ: 'k', μ: 'u', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ω: 'w',
};
/** Scripts whose combining marks are accents or optional vowel signs (dropped); every other script keeps its marks. */
const FOLD_MARKS = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}]/u;
const TATWEEL = 'ـ';

/**
 * NFKD, lowercase; 0→o 1→i 3→e 4→a 5→s 7→t @→a $→s; accents dropped (see FOLD_MARKS); anything that is not a letter
 * (or a kept mark) stripped; repeated letters collapsed; NFC. `lookalikes`: Cyrillic and Greek look-alikes as Latin.
 */
export function skeleton(s: string, lookalikes = false): string {
  let out = '';
  let base = '';
  for (const orig of s.normalize('NFKD')) {
    for (const ch of (lookalikes ? CAPS[orig] : undefined) ?? orig.toLowerCase()) {
      if (/\p{M}/u.test(ch)) {
        if (base !== '' && !FOLD_MARKS.test(base) && !out.endsWith(ch)) out += ch;
        continue;
      }
      let c = LEET[ch] ?? VARIANT[ch] ?? ch;
      if (lookalikes) c = LOOKALIKE[c] ?? c;
      if (c === TATWEEL || !/\p{L}/u.test(c)) continue;
      base = c;
      if (out.endsWith(c)) continue;
      out += c;
    }
  }
  return out.normalize('NFC');
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

interface Prepared {
  readonly strong: readonly string[];
  readonly ambiguous: ReadonlySet<string>;
  readonly innocent: readonly string[];
}

/** Pre-skeletonised once per isolate. */
function prepared(list: Blocklist): Prepared {
  return {
    strong: list.strong.filter((x) => nameWidth(x) >= 3).map((x) => skeleton(x)).filter((x) => x.length > 0),
    ambiguous: new Set(list.ambiguous.map((x) => skeleton(x)).filter((x) => x.length > 0)),
    innocent: (list.innocent ?? []).map((x) => skeleton(x)).filter((x) => x.length > 0),
  };
}

const DEFAULT = prepared(BLOCKLIST);

/** The skeleton with the innocent words cut out (a space, never a letter, so the two sides cannot join into a term). */
function withoutInnocent(skel: string, innocent: readonly string[]): string {
  let s = skel;
  for (const w of innocent) s = s.split(w).join(' ');
  return s;
}

/**
 * The first blocked term the text contains (strong: anywhere in the skeleton; ambiguous: a whole word), each against
 * the plain and the look-alike skeleton, or null.
 */
export function blockedTerm(text: string, list: Blocklist | null = null): string | null {
  const p = list === null ? DEFAULT : prepared(list);
  for (const fold of [false, true]) {
    const whole = withoutInnocent(skeleton(text, fold), p.innocent);
    for (const t of p.strong) if (whole.includes(t)) return t;
    for (const w of words(text)) {
      const k = skeleton(w, fold);
      if (p.ambiguous.has(k)) return k;
    }
  }
  return null;
}

export function isBlocked(text: string, list: Blocklist | null = null): boolean {
  return blockedTerm(text, list) !== null;
}
