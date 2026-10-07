// Owner: foundation. t(key, params) with {param} interpolation, locale hook, formatting helpers
// (02 §21). Leaf module: imports only ./en, so ui/, app/ and platform/ may all use it.
import {
  COLOR_KEYS,
  en,
  GLYPH_KEYS,
  MONTH_KEYS,
  PRAISE_KEYS,
  WEEKDAY_KEYS,
  type Catalog,
  type En,
  type I18nKey,
} from './en';

export type { Catalog, I18nKey } from './en';
export { COLOR_KEYS, GLYPH_KEYS, PRAISE_KEYS, TUTORIAL_STEP_KEYS } from './en';

export type ParamValue = string | number;
export type Params = Readonly<Record<string, ParamValue>>;

type ParamNames<S extends string> = S extends `${string}{${infer P}}${infer Rest}` ? P | ParamNames<Rest> : never;
/** Placeholder names of a key's English template, e.g. ParamsFor<'home.play'> = 'level'. */
export type ParamsFor<K extends I18nKey> = ParamNames<En[K]>;
export type ParamsArg<K extends I18nKey> = [ParamsFor<K>] extends [never]
  ? []
  : [params: { readonly [P in ParamsFor<K>]: ParamValue }];

/** Keys B such that both `${B}.one` and `${B}.other` exist. */
export type PluralBase = {
  [K in I18nKey]: K extends `${infer B}.one` ? (`${B}.other` extends I18nKey ? B : never) : never;
}[I18nKey];

const catalogs = new Map<string, Partial<Catalog>>([['en', en]]);
let activeLang = 'en';
let active: Partial<Catalog> = en;

/** Registers a catalogue for a language code ('en', 'es', …). Missing keys fall back to English. */
export function registerCatalog(lang: string, catalog: Partial<Catalog>): void {
  catalogs.set(lang.toLowerCase(), catalog);
}

/**
 * Selects the catalogue for a platform locale such as 'en_US' or 'pt-BR' (FB: after
 * startGameAsync, 05 §4). Falls back to English. Returns the language actually used.
 */
export function setLocale(platformLocale: string): string {
  const lang = platformLocale.toLowerCase().split(/[-_]/)[0] ?? 'en';
  const found = catalogs.get(lang);
  activeLang = found ? lang : 'en';
  active = found ?? en;
  return activeLang;
}

export function getLocale(): string {
  return activeLang;
}

/** Strictly typed lookup: params are required exactly when the English template has placeholders. */
export function t<K extends I18nKey>(key: K, ...args: ParamsArg<K>): string {
  return translate(key, args[0] as Params | undefined);
}

/** Loosely typed lookup for computed keys. Unknown placeholders are left as `{name}`. */
export function translate(key: I18nKey, params?: Params): string {
  const template = active[key] ?? en[key];
  return params ? interpolate(template, params) : template;
}

/** Plural lookup: `${base}.one` when count === 1, else `${base}.other`; {count} is filled in. */
export function tn(base: PluralBase, count: number, params?: Params): string {
  const key = `${base}.${count === 1 ? 'one' : 'other'}` as I18nKey;
  return translate(key, { count, ...params });
}

export function interpolate(template: string, params: Params): string {
  return template.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = params[name];
    return v === undefined ? m : String(v);
  });
}

export function isI18nKey(key: string): key is I18nKey {
  return Object.prototype.hasOwnProperty.call(en, key);
}

/** Region colour name for a palette index 0..11 (02 §17.2). */
export function colorName(paletteIndex: number): string {
  return translate(COLOR_KEYS[paletteIndex] ?? 'color.0');
}

/** Pattern glyph name for a palette index 0..11 (02 §18). */
export function glyphName(paletteIndex: number): string {
  return translate(GLYPH_KEYS[paletteIndex] ?? 'glyph.0');
}

export const PRAISE_COUNT = PRAISE_KEYS.length;

/** Praise word i (wraps around). */
export function praise(index: number): string {
  const n = PRAISE_KEYS.length;
  return translate(PRAISE_KEYS[((index % n) + n) % n] ?? 'win.praise.0');
}

/** "A", "A and B", "A, B and C" (02 §9.1). */
export function joinList(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] ?? '';
  const last = items[items.length - 1] ?? '';
  if (items.length === 2) return translate('list.pair', { first: items[0] ?? '', last });
  const rest = items.slice(0, -1).join(translate('list.separator'));
  return translate('list.serial', { rest, last });
}

export function capitalizeFirst(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toLocaleUpperCase(activeLang) + s.slice(1);
}

/** Solve-time style clock: "4:12", "12:03", "1:02:03". Negative values clamp to 0. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Coarse duration for "Next puzzle in 7 h 48 min" (02 §5 O7). */
export function formatDuration(ms: number): string {
  const mins = Math.floor(Math.max(0, ms) / 60_000);
  if (mins < 1) return translate('time.underMinute');
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? translate('time.hoursMinutes', { h, m }) : translate('time.minutes', { m });
}

/** "Tue 6 Oct" from a YYYY-MM-DD key; the weekday comes from the date string (02 §12). */
export function formatShortDate(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return dateKey;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const weekday = new Date(Date.UTC(y, mo, d)).getUTCDay();
  return translate('date.short', {
    weekday: translate(WEEKDAY_KEYS[weekday] ?? 'date.weekday.0'),
    day: d,
    month: translate(MONTH_KEYS[mo] ?? 'date.month.0'),
  });
}
