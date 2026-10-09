// Owner: E
// Runtime formatting per locale (phase2b §6.4). F0: formatNumberFor works (Latin digits everywhere,
// [DECISION]); the date and duration helpers for non-English locales are E's.
import type { LocaleId } from '../app/config';

const numberFormats = new Map<string, Intl.NumberFormat>();

/** Intl.NumberFormat(locale, { numberingSystem: 'latn' }); falls back to 'en' for an unknown tag. */
export function formatNumberFor(locale: string, n: number): string {
  let f = numberFormats.get(locale);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, { numberingSystem: 'latn' });
    } catch {
      f = new Intl.NumberFormat('en', { numberingSystem: 'latn' });
    }
    numberFormats.set(locale, f);
  }
  return f.format(n);
}

/**
 * "Tue 6 Oct" for a YYYY-MM-DD key in a non-English locale: Intl.DateTimeFormat(locale, {weekday:
 * 'short', day: 'numeric', month: 'short', timeZone: 'UTC'}) on the key's UTC date (§6.4). English
 * keeps the catalogue template (index.ts formatShortDate).
 */
export function formatShortDateFor(locale: LocaleId, dateKey: string): string {
  void locale;
  void dateKey;
  throw new Error('not implemented: formatShortDateFor (E, phase2b §6.4)');
}

/** In RTL locales each interpolated parameter is wrapped in U+2068 … U+2069 (first-strong isolate), §6.4. */
export function isolate(value: string, dir: 'ltr' | 'rtl'): string {
  void value;
  void dir;
  throw new Error('not implemented: isolate (E, phase2b §6.4)');
}
