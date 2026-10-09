// Owner: E (Phase 2b). t(key, params) with {param} interpolation, locale resolution and loading,
// plurals and formatting (02 §21, phase2b §6). Leaf module: imports only i18n/ and app/config.ts
// (lead decision, phase2b F0), so ui/, app/ and platform/ may all use it.
//
// Locales (phase2b §6.3): setLocale() resolves the platform tag(s) and the saved override through
// locale.ts against the locales this build contains (build-locales.ts), loads the locale's lazy
// chunk, then switches the catalogue, sets <html lang> / <html dir> and notifies onLocaleChanged
// listeners (the app forwards them as the `locale:changed` bus event). A catalogue that is already
// loaded switches synchronously, so a prefetched locale applies before the first route even when the
// caller does not await. Missing keys fall back to English.
import { cfg, type LocaleId } from '../app/config';
import { buildLocaleIds, localeLoader, type LocaleCatalog } from './build-locales';
import { formatNumberFor, formatShortDateFor, isolate, pseudoLocalize, stripMarks } from './format';
import { guessLocale, isLocaleId, isRtl, resolveLocale, type NavigatorLike } from './locale';
import { pluralCategory } from './plural';
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
  type PluralBase,
} from './en';

export type { Catalog, I18nKey, PluralBase, PluralExtraKey } from './en';
export type { LocaleId } from '../app/config';
export type { LocaleCatalog } from './build-locales';
export { COLOR_KEYS, GLYPH_KEYS, PRAISE_KEYS, TUTORIAL_STEP_KEYS } from './en';
export { isLocaleId, localeCandidates, normalizeTag, resolveLocale, guessLocale } from './locale';
export { markCount, splitMarks, stripIsolates, stripMarks } from './format';

export type ParamValue = string | number;
export type Params = Readonly<Record<string, ParamValue>>;

type ParamNames<S extends string> = S extends `${string}{${infer P}}${infer Rest}` ? P | ParamNames<Rest> : never;
/** Placeholder names of a key's English template, e.g. ParamsFor<'home.play'> = 'level'. */
export type ParamsFor<K extends I18nKey> = ParamNames<En[K]>;
export type ParamsArg<K extends I18nKey> = [ParamsFor<K>] extends [never]
  ? []
  : [params: { readonly [P in ParamsFor<K>]: ParamValue }];

type Lookup = Readonly<Record<string, string | undefined>>;

/**
 * The "xx-long" pseudo-locale (phase2b §6.9): `?i18n=pseudo` in dev and e2e builds only (both flags
 * are build-time constants, so production builds drop it). Every string is pseudo-translated on top
 * of the active catalogue; tests/e2e/i18n.spec.ts uses it to find clipping and overflow.
 */
const PSEUDO: boolean = (() => {
  const devOrE2e = Boolean(import.meta.env?.DEV) || (typeof __E2E__ !== 'undefined' && __E2E__);
  if (!devOrE2e) return false;
  try {
    return typeof location !== 'undefined' && /[?&]i18n=pseudo(&|$)/.test(location.search);
  } catch {
    return false;
  }
})();

/** Loaded catalogues by locale id ('en' is bundled). */
const catalogs = new Map<string, LocaleCatalog>([['en', en]]);
/** In-flight chunk loads, so a prefetch and a setLocale share one request. */
const loading = new Map<string, Promise<LocaleCatalog | null>>();
let activeLang: LocaleId = 'en';
let active: Lookup = en;
let activeDir: 'ltr' | 'rtl' = 'ltr';
/** Bumped by every setLocale call: a slower, older load never overrides a newer choice. */
let requestSeq = 0;

/**
 * Registers a catalogue under a locale id ('es', 'pt-BR', …; a bare language such as 'pt' maps like
 * a platform tag). Tests and tools only: the game loads catalogues through the build's loader map.
 */
export function registerCatalog(lang: string, catalog: LocaleCatalog): void {
  const id = isLocaleId(lang) ? lang : resolveLocale({ candidates: [lang], override: 'auto', available: cfg.i18n.locales });
  catalogs.set(id, catalog);
}

type LocaleListener = (locale: LocaleId, dir: 'ltr' | 'rtl') => void;
const listeners = new Set<LocaleListener>();

/** The locales this build contains (phase2b §6.7): every i18n.locales entry with a catalogue, or only i18n.releaseLocales in a release build. Always includes 'en'. */
export function buildLocales(): readonly LocaleId[] {
  return buildLocaleIds();
}

/**
 * Locale chunks whose last load failed, with the chunk URL the import error named (null when it
 * named none). Chromium keeps a failed dynamic import() in its module map, so importing the same
 * specifier again rejects at once without a request (src/workers/lazy-chunk.ts): the next attempt
 * imports the URL plus a cache-busting query instead (review ROB-2). Without a URL (Safari) the
 * plain loader is tried again.
 */
const failedChunks = new Map<LocaleId, string | null>();
let busts = 0;
type UrlImport = (url: string) => Promise<unknown>;
const defaultUrlImport: UrlImport = (url) => import(/* @vite-ignore */ url);
let urlImport: UrlImport = defaultUrlImport;

/** Test seam: the importer used for a cache-busting retry (null restores the dynamic import()). */
export function setLocaleUrlImport(fn: UrlImport | null): void {
  urlImport = fn ?? defaultUrlImport;
}

/** The chunk URL named by a failed import's error (Chromium, Firefox), else null. */
export function failedChunkUrl(err: unknown): string | null {
  return /\b(?:https?|file):\/\/[^\s'"<>]+?\.m?js\b/.exec(String((err as Error | null)?.message ?? err))?.[0] ?? null;
}

/**
 * Loads (once) the catalogue of `id`; null for a locale this build lacks or a chunk that failed. A
 * later call retries, from a cache-busting URL when the failed import named one (ROB-2).
 */
function loadCatalog(id: LocaleId): Promise<LocaleCatalog | null> {
  const have = catalogs.get(id);
  if (have) return Promise.resolve(have);
  const pending = loading.get(id);
  if (pending) return pending;
  const loader = localeLoader(id);
  if (!loader) return Promise.resolve(null);
  const failedUrl = failedChunks.get(id) ?? null;
  const attempt = failedUrl
    ? (): Promise<{ catalog?: LocaleCatalog } | null | undefined> =>
        urlImport(`${failedUrl}${failedUrl.indexOf('?') < 0 ? '?' : '&'}retry=${++busts}`) as Promise<{ catalog?: LocaleCatalog }>
    : loader;
  const p = Promise.resolve()
    .then(attempt)
    .then((mod) => {
      const cat = mod?.catalog ?? null;
      if (cat) {
        catalogs.set(id, cat);
        failedChunks.delete(id);
      }
      loading.delete(id);
      return cat;
    })
    .catch((err: unknown) => {
      // Keep the first URL we learned: a cache-busted retry's own error names the busted URL.
      failedChunks.set(id, failedUrl ?? failedChunkUrl(err));
      loading.delete(id);
      return null;
    });
  loading.set(id, p);
  return p;
}

/**
 * Starts loading a locale's chunk without switching to it (the boot prefetch, §6.3). Resolves true
 * when the catalogue is ready. Never rejects.
 */
export function prefetchLocale(id: LocaleId): Promise<boolean> {
  if (buildLocales().indexOf(id) < 0) return Promise.resolve(false);
  return loadCatalog(id).then((c) => c !== null);
}

/**
 * The boot prefetch (§6.3): guesses the locale from navigator.language and starts loading its chunk
 * (nothing for English). Returns the guess. Idempotent; never throws.
 */
export function prefetchGuess(nav: NavigatorLike | undefined = typeof navigator !== 'undefined' ? navigator : undefined): LocaleId {
  let guess: LocaleId = 'en';
  try {
    guess = guessLocale(nav?.language, buildLocales());
    if (guess !== 'en') void prefetchLocale(guess);
  } catch {
    // A broken navigator object only costs the prefetch.
  }
  return guess;
}

export interface SetLocaleOptions {
  /** settings.locale: wins when the build contains it; otherwise the candidates decide ('auto'). */
  readonly override?: 'auto' | LocaleId;
  /** The document whose <html lang> / <html dir> follow the locale (default: the global document). */
  readonly doc?: Document | null;
}

function applyLocale(id: LocaleId, doc: Document | null | undefined): void {
  const prev = activeLang;
  activeLang = id;
  active = (catalogs.get(id) ?? en) as Lookup;
  activeDir = isRtl(id) ? 'rtl' : 'ltr';
  const d = doc === undefined ? (typeof document !== 'undefined' ? document : null) : doc;
  const html = d?.documentElement;
  if (html) {
    if (html.getAttribute('lang') !== id) html.setAttribute('lang', id);
    if (html.getAttribute('dir') !== activeDir) html.setAttribute('dir', activeDir);
  }
  if (id !== prev) {
    for (const l of [...listeners]) {
      try {
        l(id, activeDir);
      } catch {
        // A failing listener never stops the others or the switch itself.
      }
    }
  }
}

/**
 * Switches the UI language (phase2b §6.3). `input` is a platform locale ('en_US', 'pt-BR'), a
 * candidate list (the web's navigator.languages, in order) or a LocaleId; `opts.override` is the saved
 * settings.locale. The result is resolved against buildLocales(): anything the build lacks falls
 * back to English. The locale's chunk is loaded first (instant when prefetched), then the catalogue,
 * <html lang> and <html dir> switch and onLocaleChanged listeners run. Resolves to the locale in use
 * once this call settles; a newer call supersedes an older one still loading. Never rejects.
 */
export function setLocale(input: string | readonly string[], opts: SetLocaleOptions = {}): Promise<LocaleId> {
  const seq = ++requestSeq;
  let id: LocaleId;
  try {
    const candidates = typeof input === 'string' ? [input] : [...input];
    id = resolveLocale({ candidates, override: opts.override ?? 'auto', available: buildLocales() });
  } catch {
    id = cfg.i18n.fallback;
  }
  if (catalogs.has(id)) {
    applyLocale(id, opts.doc);
    return Promise.resolve(id);
  }
  return loadCatalog(id).then((cat) => {
    if (seq !== requestSeq) return activeLang;
    applyLocale(cat ? id : cfg.i18n.fallback, opts.doc);
    return activeLang;
  });
}

/** The active locale id ('en' until boot resolves one). */
export function getLocale(): LocaleId {
  return activeLang;
}

/** 'rtl' for the locales in i18n.rtl (Arabic), else 'ltr' (phase2b §6.5). */
export function getDir(): 'ltr' | 'rtl' {
  return activeDir;
}

/** Called after every locale change (phase2b §6.3); the app forwards it as the `locale:changed` bus event. Returns an unsubscribe. */
export function onLocaleChanged(cb: LocaleListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Fish, points and ranks (phase2b §6.4): Intl.NumberFormat of the active locale with Latin digits everywhere. */
export function formatNumber(n: number): string {
  return formatNumberFor(activeLang, n);
}

/** The language's own name for the Settings Language row (`locale.name.<id>`, the same in every catalogue). */
export function localeName(id: LocaleId): string {
  return translate(`locale.name.${id}` as I18nKey);
}

/** Strictly typed lookup: params are required exactly when the English template has placeholders. */
export function t<K extends I18nKey>(key: K, ...args: ParamsArg<K>): string {
  return translate(key, args[0] as Params | undefined);
}

/** The active template of `key` (English fallback, pseudo-localized in ?i18n=pseudo builds), markers kept. */
function template(key: I18nKey): string {
  const raw = active[key] ?? en[key];
  return PSEUDO && key !== 'app.name' ? pseudoLocalize(raw) : raw;
}

/** Loosely typed lookup for computed keys. Unknown placeholders are left as `{name}`; keyword markers are removed. */
export function translate(key: I18nKey, params?: Params): string {
  const tpl = stripMarks(template(key));
  return params ? interpolate(tpl, params) : tpl;
}

/**
 * translate() that keeps the `*keyword*` markers of teaching copy (review PAR-7), for the UI's rich
 * text renderer (src/ui/rich-text.ts). Never show its result as plain text.
 */
export function translateMarked(key: I18nKey, params?: Params): string {
  const tpl = template(key);
  return params ? interpolate(tpl, params) : tpl;
}

/**
 * Plural lookup (phase2b §6.4): `${base}.${Intl.PluralRules(locale).select(count)}`, falling back to
 * `${base}.other`, then to English. {count} is filled with formatNumber(count) unless params.count
 * is given.
 */
export function tn(base: PluralBase, count: number, params?: Params): string {
  const own = active[`${base}.${pluralCategory(activeLang, count)}`] ?? active[`${base}.other`];
  const lookup = en as Lookup;
  const raw = own ?? lookup[`${base}.${pluralCategory('en', count)}`] ?? lookup[`${base}.other`] ?? base;
  const template = PSEUDO ? pseudoLocalize(raw) : raw;
  return interpolate(template, { count: formatNumber(count), ...params });
}

/** Fills {name} placeholders; in RTL locales each value is wrapped in first-strong isolates (§6.4). */
export function interpolate(template: string, params: Params): string {
  return template.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = params[name];
    return v === undefined ? m : isolate(String(v), activeDir);
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

/** "A", "A and B", "A, B and C" (02 §9.1), with the active catalogue's list.* templates. */
export function joinList(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] ?? '';
  const last = items[items.length - 1] ?? '';
  if (items.length === 2) return translate('list.pair', { first: items[0] ?? '', last });
  const rest = items.slice(0, -1).join(translate('list.separator'));
  return translate('list.serial', { rest, last });
}

export function capitalizeFirst(s: string): string {
  if (s.length === 0) return s;
  let upper: string;
  try {
    upper = s.charAt(0).toLocaleUpperCase(activeLang);
  } catch {
    upper = s.charAt(0).toUpperCase();
  }
  return upper + s.slice(1);
}

/** Solve-time style clock: "4:12", "12:03", "1:02:03" in every locale (§6.4). Negative values clamp to 0. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Coarse duration: "7 h 48 min", "2 d 5 h" from a day on (event cards, §6.4), "under a minute". */
export function formatDuration(ms: number): string {
  const mins = Math.floor(Math.max(0, ms) / 60_000);
  if (mins < 1) return translate('time.underMinute');
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 24) return translate('time.daysHours', { d: Math.floor(h / 24), h: h % 24 });
  return h > 0 ? translate('time.hoursMinutes', { h, m }) : translate('time.minutes', { m });
}

/**
 * "Tue 6 Oct" from a YYYY-MM-DD key (02 §12). English keeps the catalogue template; other locales use
 * Intl.DateTimeFormat on the key's UTC date, with Latin digits (§6.4), and the template as a fallback.
 */
export function formatShortDate(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return dateKey;
  if (activeLang !== 'en') {
    const viaIntl = formatShortDateFor(activeLang, dateKey);
    if (viaIntl !== null) return viaIntl;
  }
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

// The boot prefetch (§6.3): in a browser, start loading the chunk of the locale navigator.language
// suggests as soon as the main bundle runs, so it is usually ready when boot resolves the real locale
// after start(). Boot may also call prefetchGuess()/prefetchLocale(); the request is shared.
if (typeof document !== 'undefined') prefetchGuess();
