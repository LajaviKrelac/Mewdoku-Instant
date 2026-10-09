// Owner: E (Phase 2b). t(key, params) with {param} interpolation, locale hook, formatting helpers
// (02 §21, phase2b §6). Leaf module: imports only i18n/ and app/config.ts (lead decision, phase2b F0),
// so ui/, app/ and platform/ may all use it.
// Phase 2b F0: setLocale() is async (it will load the locale's lazy chunk, §6.3); getDir(),
// onLocaleChanged(), buildLocales() and formatNumber() exist in a minimal working form so A–D can
// call them from day 1. E replaces the resolution (locale.ts), plurals (plural.ts, Intl.PluralRules),
// formatting (format.ts) and bidi isolation behind the same signatures.
import { cfg, type LocaleId } from '../app/config';
import { buildLocaleIds } from './build-locales';
import { formatNumberFor } from './format';
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
export type { LocaleId } from '../app/config';
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

type LocaleListener = (locale: string, dir: 'ltr' | 'rtl') => void;
const listeners = new Set<LocaleListener>();

/**
 * Selects the catalogue for a platform locale such as 'en_US' or 'pt-BR' (FB: after
 * startGameAsync, 05 §4). Falls back to English. Resolves to the locale actually used and notifies
 * onLocaleChanged listeners when it changed. Never rejects.
 * Phase 2b (E, §6.3): resolve through locale.ts, load the locale's chunk (build-locales.ts loader),
 * set <html lang> / <html dir>. F0 keeps the Phase 2 lookup of registered catalogues.
 */
export async function setLocale(platformLocale: string): Promise<string> {
  const lang = platformLocale.toLowerCase().split(/[-_]/)[0] ?? 'en';
  const found = catalogs.get(lang);
  const prev = activeLang;
  activeLang = found ? lang : 'en';
  active = found ?? en;
  if (activeLang !== prev) for (const l of [...listeners]) l(activeLang, getDir());
  return activeLang;
}

export function getLocale(): string {
  return activeLang;
}

/** 'rtl' for the locales in i18n.rtl (Arabic), else 'ltr' (phase2b §6.5). */
export function getDir(): 'ltr' | 'rtl' {
  return (cfg.i18n.rtl as readonly string[]).indexOf(activeLang) >= 0 ? 'rtl' : 'ltr';
}

/** Called after every locale change (phase2b §6.3); the app forwards it as the `locale:changed` bus event. Returns an unsubscribe. */
export function onLocaleChanged(cb: LocaleListener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The locales this build contains (phase2b §6.7): every i18n.locales entry with a catalogue, or only i18n.releaseLocales in a release build. Always includes 'en'. */
export function buildLocales(): readonly LocaleId[] {
  return buildLocaleIds();
}

/** Fish, points and ranks (phase2b §6.4): Intl.NumberFormat of the active locale with Latin digits everywhere. */
export function formatNumber(n: number): string {
  return formatNumberFor(activeLang, n);
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
