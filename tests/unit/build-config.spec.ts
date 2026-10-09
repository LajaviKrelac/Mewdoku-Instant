// Owner: lead. Build helpers of phase2b F0 (§6.7 step 4, §11): which locales a build mode bundles, the
// generated `virtual:mewdoku-locales` module, and the lazy chunks' file names.
import { describe, expect, it } from 'vitest';
import { cfg, mergeConfig } from '../../src/app/config';
import { buildLocales } from '../../src/i18n';
import { chunkFileName, isReleaseMode, localeChunkName, localeModuleSource, localesForMode } from '../../scripts/locale-loaders';

describe('locale loader map (phase2b §6.7)', () => {
  it('release modes bundle i18n.releaseLocales; every other mode i18n.locales', () => {
    expect(isReleaseMode('release')).toBe(true);
    expect(isReleaseMode('release-fbig')).toBe(true);
    for (const m of ['production', 'development', 'fbig', 'e2e', 'test']) expect(isReleaseMode(m)).toBe(false);
    expect(localesForMode('release')).toEqual(['en']);
    expect(localesForMode('fbig')).toEqual(cfg.i18n.locales);
    const c = mergeConfig({ i18n: { releaseLocales: ['en', 'es'] } });
    expect(localesForMode('release-fbig', c)).toEqual(['en', 'es']);
  });

  it('lists en plus the locales that have a catalogue file, with one lazy import each', () => {
    const exists = (p: string): boolean => /[\\/](es|pt-BR)\.ts$/.test(p);
    const src = localeModuleSource(['en', 'es', 'pt-BR', 'fr'], '/repo/src/i18n/locales', exists);
    expect(src).toContain('export const BUILD_LOCALES = Object.freeze(["en","es","pt-BR"]);');
    expect(src).toContain('"es": () => import("/repo/src/i18n/locales/es.ts"),');
    expect(src).toContain('"pt-BR": () => import("/repo/src/i18n/locales/pt-BR.ts"),');
    expect(src).not.toContain('fr.ts');
    expect(localeModuleSource(['es'], '/repo/x', () => false)).toContain('BUILD_LOCALES = Object.freeze(["en"])');
  });

  it('the test build sees en (plus any catalogue E has added)', () => {
    expect(buildLocales()[0]).toBe('en');
    for (const id of buildLocales()) expect(cfg.i18n.locales).toContain(id);
  });
});

describe('lazy chunk names (phase2b §11)', () => {
  it('names the locale, events, fb-social and social-flows chunks for size-check; everything else keeps [name]', () => {
    expect(localeChunkName('/r/src/i18n/locales/zh-Hans.ts')).toBe('locale-zh-Hans');
    expect(localeChunkName('/r/src/i18n/en.ts')).toBeNull();
    expect(chunkFileName('/r/src/i18n/locales/pt-BR.ts')).toBe('assets/locale-pt-BR-[hash].js');
    expect(chunkFileName('/r/src/app/events-chunk.ts')).toBe('assets/events-[hash].js');
    expect(chunkFileName('C:\\r\\src\\platform\\fb\\fb-social.ts')).toBe('assets/fb-social-[hash].js');
    expect(chunkFileName('/r/src/app/social-flows.ts')).toBe('assets/social-flows-[hash].js');
    expect(chunkFileName('/r/src/app/overlay-chunk.ts')).toBe('assets/[name]-[hash].js');
    expect(chunkFileName(null)).toBe('assets/[name]-[hash].js');
  });
});
