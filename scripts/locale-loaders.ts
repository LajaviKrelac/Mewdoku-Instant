// Owner: lead (phase2b F0, §6.7 step 4, §11). The build's locale loader map as a virtual module, and
// the lazy chunks' file names (vite.config.ts).
//
// `virtual:mewdoku-locales` exports
//   BUILD_LOCALES  : 'en' plus every locale of the mode's list that has src/i18n/locales/<id>.ts
//   LOCALE_LOADERS : one `() => import('<that file>')` per non-English entry (a lazy chunk each)
// Release modes (`--mode release`, `release-fbig`) list cfg.i18n.releaseLocales, so the other
// catalogues are not in the bundle at all; every other mode (dev, e2e, web, fbig, tests) lists
// cfg.i18n.locales. A listed locale without a catalogue file yet is skipped (E adds the files).
// Typed by src/i18n/virtual-locales.d.ts; read through src/i18n/build-locales.ts.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { cfg, type GameConfig, type LocaleId } from '../src/app/config.ts';

export const LOCALES_MODULE_ID = 'virtual:mewdoku-locales';
const RESOLVED_ID = `\0${LOCALES_MODULE_ID}`;

/** Release builds ship only the approved locales (phase2b §6.7). */
export function isReleaseMode(mode: string): boolean {
  return mode === 'release' || mode === 'release-fbig';
}

/** The locale list a build of `mode` bundles: i18n.releaseLocales in release modes, else i18n.locales. */
export function localesForMode(mode: string, c: GameConfig = cfg): readonly LocaleId[] {
  return isReleaseMode(mode) ? c.i18n.releaseLocales : c.i18n.locales;
}

/** The generated module's source for `locales`, given which catalogue files exist under `localesDir`. */
export function localeModuleSource(
  locales: readonly LocaleId[],
  localesDir: string,
  exists: (path: string) => boolean = existsSync,
): string {
  const present: LocaleId[] = ['en'];
  for (const id of locales) if (id !== 'en' && exists(resolve(localesDir, `${id}.ts`))) present.push(id);
  const loaders = present
    .filter((id) => id !== 'en')
    .map((id) => `  ${JSON.stringify(id)}: () => import(${JSON.stringify(resolve(localesDir, `${id}.ts`).split('\\').join('/'))}),`);
  return (
    `export const BUILD_LOCALES = Object.freeze(${JSON.stringify(present)});\n` +
    `export const LOCALE_LOADERS = Object.freeze({\n${loaders.join('\n')}\n});\n`
  );
}

/** Vite / Vitest plugin serving the module for `mode` (catalogue files are looked up under `root`/src/i18n/locales). */
export function localeLoaderPlugin(mode: string, root: string): Plugin {
  const dir = resolve(root, 'src/i18n/locales');
  return {
    name: 'mewdoku-locales',
    resolveId(id) {
      return id === LOCALES_MODULE_ID ? RESOLVED_ID : null;
    },
    load(id) {
      // Generated once per build (a new locale file needs a dev-server restart).
      return id === RESOLVED_ID ? localeModuleSource(localesForMode(mode), dir) : null;
    },
  };
}

/** Rolldown chunk name of a locale catalogue (`locale-<id>`), so release checks can find them in dist. */
export function localeChunkName(moduleId: string): string | null {
  const m = /[\\/]src[\\/]i18n[\\/]locales[\\/]([A-Za-z-]+)\.ts$/.exec(moduleId);
  return m ? `locale-${m[1] as string}` : null;
}

/**
 * The lazy chunks' file names (phase2b §11), so scripts/size-check.ts can budget them by name:
 * locale-<id>-*.js per catalogue, events-*.js (src/app/events-chunk.ts), fb-social-*.js
 * (src/platform/fb/fb-social.ts); everything else keeps Vite's default `assets/[name]-[hash].js`.
 */
export function chunkFileName(facadeModuleId: string | null | undefined): string {
  const id = facadeModuleId ?? '';
  const locale = localeChunkName(id);
  if (locale) return `assets/${locale}-[hash].js`;
  if (/[\\/]src[\\/]app[\\/]events-chunk\.ts$/.test(id)) return 'assets/events-[hash].js';
  if (/[\\/]src[\\/]platform[\\/]fb[\\/]fb-social\.ts$/.test(id)) return 'assets/fb-social-[hash].js';
  return 'assets/[name]-[hash].js';
}
