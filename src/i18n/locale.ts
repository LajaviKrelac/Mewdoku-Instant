// Owner: E
// Locale resolution (phase2b §6.3): FB `platform.getLocale()` after start (ll_CC) or the web's
// navigator.languages; a saved override (settings.locale ≠ 'auto') always wins. F0 stub.
import type { LocaleId } from '../app/config';

/** Replaces '_' with '-', lowercases the language and uppercases the region ('pt_br' → 'pt-BR'). */
export function normalizeTag(tag: string): string {
  void tag;
  throw new Error('not implemented: normalizeTag (E, phase2b §6.3)');
}

export interface ResolveInput {
  /** FB: [getLocale()]; web: navigator.languages in order (the next entry is tried on a miss). */
  readonly candidates: readonly string[];
  /** settings.locale: an override wins when the build contains it; otherwise it resolves like 'auto' (and stays saved). */
  readonly override: 'auto' | LocaleId;
  /** buildLocales(): anything else falls back to i18n.fallback ('en'). */
  readonly available: readonly LocaleId[];
}

/**
 * The §6.3 match: (1) exact id (pt-BR); (2) zh-CN/SG/TW/HK/MO → zh-Hans, pt-* → pt-BR, es-* → es;
 * (3) the language subtag alone (fr-CA → fr); (4) the next candidate; (5) en.
 */
export function resolveLocale(input: ResolveInput): LocaleId {
  void input;
  throw new Error('not implemented: resolveLocale (E, phase2b §6.3)');
}

/** The boot prefetch guess from navigator.language, before start() (§6.3). */
export function guessLocale(navigatorLanguage: string | undefined, available: readonly LocaleId[]): LocaleId {
  void navigatorLanguage;
  void available;
  throw new Error('not implemented: guessLocale (E, phase2b §6.3)');
}
