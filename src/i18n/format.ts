// Owner: E
// Runtime formatting per locale (phase2b §6.4). Latin digits everywhere [DECISION], including
// Arabic, so board coordinates, timers and counters never mix digit systems. The Unicode extension
// `-u-nu-latn` is used as well as the `numberingSystem` option, because iOS Safari 14.0 (04 §1)
// ignores the option but honours the extension.

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat | null>();

/** `locale` with the Latin-digits extension: 'ar' → 'ar-u-nu-latn' (an existing -u- extension is kept). */
export function latnTag(locale: string): string {
  if (/-u-/.test(locale)) return /-nu-/.test(locale) ? locale : `${locale}-nu-latn`;
  return `${locale}-u-nu-latn`;
}

/** Intl.NumberFormat(locale) with Latin digits; falls back to 'en' for an unknown tag. */
export function formatNumberFor(locale: string, n: number): string {
  let f = numberFormats.get(locale);
  if (!f) {
    try {
      f = new Intl.NumberFormat(latnTag(locale), { numberingSystem: 'latn' } as Intl.NumberFormatOptions);
    } catch {
      f = new Intl.NumberFormat('en');
    }
    numberFormats.set(locale, f);
  }
  return f.format(n);
}

/** The key's UTC date, or null when the key is not YYYY-MM-DD. */
export function dateFromKey(dateKey: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateFormatFor(locale: string): Intl.DateTimeFormat | null {
  if (dateFormats.has(locale)) return dateFormats.get(locale) ?? null;
  let f: Intl.DateTimeFormat | null;
  try {
    f = new Intl.DateTimeFormat(latnTag(locale), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
      numberingSystem: 'latn',
    } as Intl.DateTimeFormatOptions);
  } catch {
    f = null;
  }
  dateFormats.set(locale, f);
  return f;
}

/**
 * "Tue 6 Oct" for a YYYY-MM-DD key in a non-English locale: Intl.DateTimeFormat(locale, {weekday:
 * 'short', day: 'numeric', month: 'short', timeZone: 'UTC'}) on the key's UTC date (§6.4). English
 * keeps the catalogue template (index.ts formatShortDate). Returns null when Intl cannot format it,
 * so the caller falls back to the catalogue template; returns the key itself when it is not a date.
 */
export function formatShortDateFor(locale: string, dateKey: string): string | null {
  const d = dateFromKey(dateKey);
  if (!d) return dateKey;
  const f = dateFormatFor(locale);
  if (!f) return null;
  try {
    return f.format(d);
  } catch {
    return null;
  }
}

/** First-strong isolate (U+2068) and pop directional isolate (U+2069), §6.4. */
export const FSI = '\u2068';
export const PDI = '\u2069';
/** Left-to-right (U+2066) and right-to-left (U+2067) isolates. */
export const LRI = '\u2066';
export const RLI = '\u2067';

/** A strong right-to-left letter (Hebrew, Arabic, Syriac, Thaana, N'Ko and their presentation forms). */
const STRONG_RTL = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/;
/** A strong left-to-right letter (any letter that is not right to left). */
const STRONG_LTR = /\p{L}/u;

/**
 * The direction of `value`'s first strong character at the top level, skipping nested isolates the
 * way the bidi algorithm does (UAX #9 P2), or null when the top level has none.
 */
function topLevelDir(value: string): 'ltr' | 'rtl' | null {
  let depth = 0;
  for (const ch of value) {
    if (ch === LRI || ch === RLI || ch === FSI) depth++;
    else if (ch === PDI) depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      if (STRONG_RTL.test(ch)) return 'rtl';
      if (STRONG_LTR.test(ch)) return 'ltr';
    }
  }
  return null;
}

/**
 * In RTL locales each interpolated parameter is wrapped in U+2068 … U+2069 (first-strong isolate),
 * §6.4. A value whose top level has no strong character but holds an isolated right-to-left word
 * ("+⁨تلميحان⁩", a plural inside the "+{count}" template) gets an explicit RLI instead: a first-strong
 * isolate skips the nested isolate (UAX #9 P2), resolves to LTR and would draw the "+" on the wrong
 * side (review I18N-RTL-1).
 */
export function isolate(value: string, dir: 'ltr' | 'rtl'): string {
  if (dir !== 'rtl' || value.length === 0) return value;
  if (topLevelDir(value) === null && STRONG_RTL.test(value)) return `${RLI}${value}${PDI}`;
  return `${FSI}${value}${PDI}`;
}

/** Removes the isolates again (tests, analytics, anything that compares text). */
export function stripIsolates(text: string): string {
  return text.replace(/[\u2066-\u2069]/g, '');
}

// ── Keyword markers (review PAR-7) ──────────────────────────────────────────────────────────────

/**
 * Rule keywords in teaching copy (the tutorial coach, How to play) are wrapped in `*…*` in the
 * catalogues, so the UI can print them in the accent colour (01 §9.3). translate() and t() strip the
 * markers; translateMarked() keeps them for the rich-text renderer. A catalogue's markers must pair
 * up and match English's count (scripts/i18n-check.ts).
 */
export const MARK = '*';

/** The text without its keyword markers. */
export function stripMarks(text: string): string {
  return text.indexOf(MARK) < 0 ? text : text.split(MARK).join('');
}

/** Number of marked spans in a template (null when the markers do not pair up). */
export function markCount(text: string): number | null {
  const n = text.split(MARK).length - 1;
  return n % 2 === 0 ? n / 2 : null;
}

/** `*a* b *c*` → [{text:'a', kw:true}, {text:' b ', kw:false}, {text:'c', kw:true}] (empty parts dropped). */
export function splitMarks(text: string): { readonly text: string; readonly kw: boolean }[] {
  const out: { text: string; kw: boolean }[] = [];
  text.split(MARK).forEach((part, i) => {
    if (part !== '') out.push({ text: part, kw: i % 2 === 1 });
  });
  return out;
}

// ── Pseudo-locale "xx-long" (phase2b §6.9; dev and e2e builds only) ─────────────────────────────

const PSEUDO_MAP: Readonly<Record<string, string>> = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'ď', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'í', j: 'ĵ', k: 'ķ', l: 'ľ', m: 'ḿ',
  n: 'ñ', o: 'ö', p: 'ṕ', q: 'ʠ', r: 'ŕ', s: 'š', t: 'ţ', u: 'ü', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Á', B: 'Ɓ', C: 'Ç', D: 'Ď', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Í', J: 'Ĵ', K: 'Ķ', L: 'Ľ', M: 'Ḿ',
  N: 'Ñ', O: 'Ö', P: 'Ṕ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Ü', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};
const PSEUDO_FILLER = 'ļöŕéḿ íṕšüḿ ďöľöŕ šíţ áḿéţ çöñšéçţéţüŕ áďíṕíšçíñĝ éľíţ šéď ďö éíüšḿöď';

/**
 * The "xx-long" pseudo-translation of a template: every Latin letter accented (stacked diacritics
 * test line height), {placeholders} kept, the text made 40 % longer with filler words (German and
 * Russian copy runs about that much longer than English), and wrapped in ⟦ ⟧ so a clipped edge shows.
 */
export function pseudoLocalize(template: string, growth = 0.4): string {
  let out = '';
  for (const part of template.split(/(\{\w+\})/)) {
    if (/^\{\w+\}$/.test(part)) out += part;
    else for (const ch of part) out += PSEUDO_MAP[ch] ?? ch;
  }
  const extra = Math.ceil(template.length * growth);
  const filler = extra > 0 ? ` ${PSEUDO_FILLER.slice(0, Math.max(1, extra - 1)).trimEnd()}` : '';
  return `⟦${out}${filler}⟧`;
}
