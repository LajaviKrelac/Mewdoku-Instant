// Owner: E
// The build's locale loader map (phase2b §6.7 step 4). `virtual:mewdoku-locales` is generated at
// build time by scripts/locale-loaders.ts (wired in vite.config.ts and vitest.config.ts, lead): it
// lists `en` plus every locale of i18n.locales (or, in `--mode release` / `release-fbig`, of
// i18n.releaseLocales) that has a catalogue file src/i18n/locales/<id>.ts, with one lazy chunk each
// (`locale-<id>-[hash].js`). A locale file default-exports nothing; it exports
// `catalog: LocaleCatalog` (see LocaleModule).
import { BUILD_LOCALES, LOCALE_LOADERS } from 'virtual:mewdoku-locales';
import type { LocaleId } from '../app/config';
import type { Catalog } from './en';

/** A translated catalogue (E's drafts). Missing keys fall back to English at runtime; the catalogue test (E) requires them all. */
export type LocaleCatalog = Partial<Catalog>;

/** The shape of src/i18n/locales/<id>.ts. */
export interface LocaleModule {
  readonly catalog: LocaleCatalog;
}

/** The locales this build contains, 'en' first. */
export function buildLocaleIds(): readonly LocaleId[] {
  return BUILD_LOCALES;
}

/** The lazy loader of a locale's chunk, or null for 'en' (bundled) and for locales this build lacks. */
export function localeLoader(id: LocaleId): (() => Promise<LocaleModule>) | null {
  return LOCALE_LOADERS[id] ?? null;
}
