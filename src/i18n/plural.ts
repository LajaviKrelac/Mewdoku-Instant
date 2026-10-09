// Owner: E
// Plural categories through Intl.PluralRules (phase2b §6.4). tn(base, count) picks
// `${base}.${category}`, falling back to `.other`. F0 stub; index.ts tn() keeps the Phase 2
// one/other rule until E switches it to pluralCategory().

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/** Intl.PluralRules(locale).select(n), cached per locale. */
export function pluralCategory(locale: string, n: number): PluralCategory {
  void locale;
  void n;
  throw new Error('not implemented: pluralCategory (E, phase2b §6.4)');
}
