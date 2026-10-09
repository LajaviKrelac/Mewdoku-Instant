// Owner: E
// Plural categories through Intl.PluralRules (phase2b §6.4). tn(base, count) in index.ts picks
// `${base}.${pluralCategory(locale, count)}`, falling back to `${base}.other`. English keeps the
// `.one` / `.other` pair; other catalogues add `.zero`, `.two`, `.few` and `.many` where their
// language uses them (Arabic all six, Russian and Polish one/few/many/other, …).

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/** Every category, in CLDR order. */
export const PLURAL_CATEGORIES: readonly PluralCategory[] = ['zero', 'one', 'two', 'few', 'many', 'other'];

interface PluralSelector {
  select(n: number): string;
}

const rules = new Map<string, PluralSelector>();

/** The English rule, used where Intl.PluralRules is missing or rejects the tag (never on the 04 §1 baseline). */
const ONE_OTHER: PluralSelector = { select: (n) => (n === 1 ? 'one' : 'other') };

function selectorFor(locale: string): PluralSelector {
  let r = rules.get(locale);
  if (!r) {
    try {
      r = typeof Intl !== 'undefined' && typeof Intl.PluralRules === 'function' ? new Intl.PluralRules(locale) : ONE_OTHER;
    } catch {
      r = ONE_OTHER;
    }
    rules.set(locale, r);
  }
  return r;
}

/** Intl.PluralRules(locale).select(n) (cardinal), cached per locale. Unknown output maps to 'other'. */
export function pluralCategory(locale: string, n: number): PluralCategory {
  const c = selectorFor(locale).select(n);
  return (PLURAL_CATEGORIES as readonly string[]).indexOf(c) >= 0 ? (c as PluralCategory) : 'other';
}

/** The counts the catalogue check samples (phase2b §6.9): 0…200 and 1 000. */
export const PLURAL_SAMPLE_COUNTS: readonly number[] = [...Array.from({ length: 201 }, (_, i) => i), 1000];

/**
 * The categories a catalogue for `locale` must provide for every plural base: those that
 * pluralCategory returns for the sample counts, in CLDR order (always includes 'other').
 */
export function requiredPluralCategories(locale: string, counts: readonly number[] = PLURAL_SAMPLE_COUNTS): PluralCategory[] {
  const seen = new Set<PluralCategory>(['other']);
  for (const n of counts) seen.add(pluralCategory(locale, n));
  return PLURAL_CATEGORIES.filter((c) => seen.has(c));
}
