// Owner: E
// Locale resolution (phase2b §6.3): FB `platform.getLocale()` after start (ll_CC) or the web's
// navigator.languages; a saved override (settings.locale ≠ 'auto') always wins when the build
// contains it. Pure functions: no DOM, no chunk loading (index.ts setLocale does that).
import { cfg, type GameConfig, type LocaleId } from '../app/config';

/**
 * Replaces '_' with '-', lowercases the language and uppercases the region ('pt_br' → 'pt-BR');
 * script subtags are title-cased ('zh_hans_cn' → 'zh-Hans-CN'). POSIX suffixes ('de_DE.UTF-8',
 * '@euro') and surrounding blanks are dropped. Returns '' for an empty or non-string tag.
 */
export function normalizeTag(tag: string): string {
  if (typeof tag !== 'string') return '';
  const core = tag.trim().split(/[.@]/)[0] ?? '';
  const parts = core.split(/[-_]+/).filter((p) => p.length > 0);
  if (parts.length === 0) return '';
  return parts
    .map((p, i) => {
      if (i === 0) return p.toLowerCase();
      if (/^[A-Za-z]{4}$/.test(p)) return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
      if (/^([A-Za-z]{2}|\d{3})$/.test(p)) return p.toUpperCase();
      return p.toLowerCase();
    })
    .join('-');
}

export interface ResolveInput {
  /** FB: [getLocale()]; web: navigator.languages in order (the next entry is tried on a miss). */
  readonly candidates: readonly string[];
  /** settings.locale: an override wins when the build contains it; otherwise it resolves like 'auto' (and stays saved). */
  readonly override: 'auto' | LocaleId;
  /** buildLocales(): anything else falls back to i18n.fallback ('en'). */
  readonly available: readonly LocaleId[];
}

/** Legacy or alternative language subtags some platforms still report (old Android 'in' for Indonesian). */
const LANGUAGE_ALIASES: Readonly<Record<string, string>> = { in: 'id' };

/**
 * Step (2) of the §6.3 match: Chinese regions and scripts → zh-Hans (zh-Hant is a Phase 3 locale, so
 * Traditional Chinese readers get Simplified until it ships); every Portuguese → pt-BR; every Spanish → es.
 */
function specialMatch(lang: string): LocaleId | null {
  if (lang === 'zh') return 'zh-Hans';
  if (lang === 'pt') return 'pt-BR';
  if (lang === 'es') return 'es';
  return null;
}

/** The build locale a single normalised tag matches, or null (steps 1–3 of §6.3). */
export function matchTag(tag: string, available: readonly LocaleId[]): LocaleId | null {
  const norm = normalizeTag(tag);
  if (norm === '') return null;
  const lower = norm.toLowerCase();
  // (1) An exact id (case-insensitive): 'pt-BR', 'zh-Hans', 'en'.
  for (const id of available) if (id.toLowerCase() === lower) return id;
  const parts = norm.split('-');
  const first = parts[0] ?? '';
  const lang = LANGUAGE_ALIASES[first] ?? first;
  // (2) The special map: zh-CN/SG/TW/HK/MO and zh-Hans-*/zh-Hant-* → zh-Hans; pt-* → pt-BR; es-* → es.
  const special = specialMatch(lang);
  if (special !== null && available.indexOf(special) >= 0) return special;
  // (3) The language subtag alone: 'fr-CA' → 'fr', 'ja-KS' → 'ja', 'en-UD' → 'en'.
  for (const id of available) if (id.toLowerCase() === lang) return id;
  return null;
}

/**
 * The §6.3 match: an override the build contains wins; then for each candidate in order (1) exact id,
 * (2) the special map, (3) the language subtag alone; (4) the next candidate; (5) i18n.fallback.
 */
export function resolveLocale(input: ResolveInput, c: GameConfig = cfg): LocaleId {
  const { override, available } = input;
  if (override !== 'auto' && available.indexOf(override) >= 0) return override;
  for (const candidate of input.candidates) {
    const id = matchTag(candidate, available);
    if (id !== null) return id;
  }
  return available.indexOf(c.i18n.fallback) >= 0 || available.length === 0 ? c.i18n.fallback : (available[0] as LocaleId);
}

/** The boot prefetch guess from navigator.language, before start() (§6.3). */
export function guessLocale(navigatorLanguage: string | undefined, available: readonly LocaleId[]): LocaleId {
  return resolveLocale({ candidates: navigatorLanguage ? [navigatorLanguage] : [], override: 'auto', available });
}

/** The parts of Navigator that locale sources read (a structural type, so tests pass plain objects). */
export interface NavigatorLike {
  readonly language?: string;
  readonly languages?: readonly string[];
}

/**
 * The candidate list of §6.3 "Source": on FB the platform locale alone (valid after startGameAsync);
 * on the web navigator.languages in order, then navigator.language, then the platform locale (the
 * web adapter's getLocale() reads navigator.language). Empty and duplicate entries are dropped.
 */
export function localeCandidates(
  platformId: 'web' | 'fbig' | string,
  platformLocale: string | null | undefined,
  nav: NavigatorLike | undefined = typeof navigator !== 'undefined' ? navigator : undefined,
): string[] {
  const raw: (string | null | undefined)[] =
    platformId === 'web' ? [...(nav?.languages ?? []), nav?.language, platformLocale] : [platformLocale];
  const out: string[] = [];
  for (const r of raw) {
    const n = typeof r === 'string' ? normalizeTag(r) : '';
    if (n !== '' && out.indexOf(n) < 0) out.push(n);
  }
  return out;
}

/** Whether `id` is written right to left (i18n.rtl, §6.5). */
export function isRtl(id: string, c: GameConfig = cfg): boolean {
  return (c.i18n.rtl as readonly string[]).indexOf(id) >= 0;
}

/** Narrows a string to a LocaleId of i18n.locales. */
export function isLocaleId(x: unknown, c: GameConfig = cfg): x is LocaleId {
  return typeof x === 'string' && (c.i18n.locales as readonly string[]).indexOf(x) >= 0;
}
