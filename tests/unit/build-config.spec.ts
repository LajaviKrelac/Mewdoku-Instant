// Owner: lead. Build helpers of phase2b F0 (§6.7 step 4, §11): which locales a build mode bundles, the
// generated `virtual:mewdoku-locales` module, and the lazy chunks' file names. Phase 2e L0: the ladder chunk's
// name and the VITE_LADDER_* passthrough (scripts/ladder-env.ts, spec §7.3, §2.11).
import { describe, expect, it } from 'vitest';
import { cfg, mergeConfig } from '../../src/app/config';
import { buildLocales } from '../../src/i18n';
import { ladderDefine, ladderEnv, ladderUrl } from '../../scripts/ladder-env';
import { chunkFileName, isReleaseMode, localeChunkName, localeModuleSource, localesForMode } from '../../scripts/locale-loaders';
import { isPreviewMode, PREVIEW_MODE, PREVIEW_OUT_DIR, PREVIEW_SAMPLE_ORIGIN, previewDefine, previewHtml } from '../../scripts/preview-mode';

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

  it('Phase 2e L0: the ladder chunk (src/app/ladder-chunk.ts) is assets/ladder-*.js; its neighbours keep [name]', () => {
    expect(chunkFileName('/r/src/app/ladder-chunk.ts')).toBe('assets/ladder-[hash].js');
    expect(chunkFileName('C:\\r\\src\\app\\ladder-chunk.ts')).toBe('assets/ladder-[hash].js');
    for (const id of ['/r/src/app/ladder-flow.ts', '/r/src/app/ladder-client.ts', '/r/src/game/ladder.ts', '/r/src/ui/overlays/ladder-sheet.ts']) {
      expect(chunkFileName(id), id).toBe('assets/[name]-[hash].js');
    }
  });
});

describe('VITE_LADDER_* passthrough (Phase 2e L0, spec §7.3, §2.11)', () => {
  it('passes the API base trimmed and without a trailing slash; empty or missing is off', () => {
    expect(ladderUrl('https://rank.example.org/')).toBe('https://rank.example.org');
    expect(ladderUrl('  http://127.0.0.1:8787  ')).toBe('http://127.0.0.1:8787');
    expect(ladderUrl('https://example.org/rank//')).toBe('https://example.org/rank');
    expect(ladderUrl('')).toBeUndefined();
    expect(ladderUrl('   ')).toBeUndefined();
    expect(ladderUrl(undefined)).toBeUndefined();
  });

  it('drops a value that is not a plain http(s) API base (null), never breaking the build', () => {
    for (const bad of ['rank.example.org', 'ftp://rank.example.org', 'javascript:alert(1)', 'https://u:p@rank.example.org', 'https://rank.example.org/?x=1', 'https://rank.example.org/#a']) {
      expect(ladderUrl(bad), bad).toBeNull();
    }
    const le = ladderEnv('fbig', { VITE_LADDER_URL: 'rank.example.org' });
    expect(le.url).toBeUndefined();
    expect(le.warnings).toHaveLength(1);
    expect(le.warnings[0]).toContain('VITE_LADDER_URL');
  });

  it('VITE_LADDER_WEB overrides cfg.ladder.web in dev, e2e and other non-release builds only', () => {
    for (const mode of ['development', 'production', 'e2e', 'fbig']) {
      expect(ladderEnv(mode, { VITE_LADDER_WEB: 'anon' }), mode).toEqual({ url: undefined, web: 'anon', warnings: [] });
      expect(ladderEnv(mode, { VITE_LADDER_WEB: 'off' }).web).toBe('off');
    }
    // Web-prod never calls the ranking server (§2.11, §10.5 #12): release builds never get the override.
    for (const mode of ['release', 'release-fbig']) {
      const le = ladderEnv(mode, { VITE_LADDER_URL: 'https://rank.example.org', VITE_LADDER_WEB: 'anon' });
      expect(le.web, mode).toBeUndefined();
      expect(le.url).toBe('https://rank.example.org');
      expect(le.warnings.join('\n')).toContain('ignored');
      expect(ladderEnv(mode, { VITE_LADDER_WEB: 'off' })).toEqual({ url: undefined, web: undefined, warnings: [] });
    }
    const odd = ladderEnv('e2e', { VITE_LADDER_WEB: 'on' });
    expect(odd.web).toBeUndefined();
    expect(odd.warnings).toHaveLength(1);
    expect(ladderEnv('e2e', {})).toEqual({ url: undefined, web: undefined, warnings: [] });
  });

  it('defines both keys: a JSON string, or the expression undefined when not given', () => {
    expect(ladderDefine(ladderEnv('e2e', { VITE_LADDER_URL: 'http://127.0.0.1:8787/', VITE_LADDER_WEB: 'anon' }))).toEqual({
      'import.meta.env.VITE_LADDER_URL': '"http://127.0.0.1:8787"',
      'import.meta.env.VITE_LADDER_WEB': '"anon"',
    });
    expect(ladderDefine(ladderEnv('release', { VITE_LADDER_WEB: 'anon' }))).toEqual({
      'import.meta.env.VITE_LADDER_URL': 'undefined',
      'import.meta.env.VITE_LADDER_WEB': 'undefined',
    });
  });
});

describe('the preview link build mode (lead, 2026-10-11; scripts/preview-mode.ts)', () => {
  it('is its own mode, never a release mode; its ranking is the in-page sample origin (`.invalid` never resolves) in anon mode', () => {
    expect(isPreviewMode(PREVIEW_MODE)).toBe(true);
    for (const m of ['production', 'development', 'fbig', 'e2e', 'release', 'release-fbig', 'preview']) expect(isPreviewMode(m), m).toBe(false);
    expect(isReleaseMode(PREVIEW_MODE)).toBe(false);
    expect(new URL(PREVIEW_SAMPLE_ORIGIN).hostname.endsWith('.invalid')).toBe(true);
    const d = previewDefine({ at: '2026-10-11T12:00:00.000Z', sha: 'abc1234', version: '0.1.0' });
    expect(d['import.meta.env.VITE_LADDER_URL']).toBe(JSON.stringify(PREVIEW_SAMPLE_ORIGIN));
    expect(d['import.meta.env.VITE_LADDER_WEB']).toBe('"anon"');
    expect(JSON.parse(d.__PREVIEW_BUILD__ as string)).toEqual({ at: '2026-10-11T12:00:00.000Z', sha: 'abc1234', version: '0.1.0' });
  });

  it('its page says Preview and noindex; the platform head marker stays for the FB script slot', () => {
    const html = previewHtml('<head><title>Mewdoku</title>\n    <!--PLATFORM_HEAD-->\n</head>');
    expect(html).toContain('<title>Mewdoku · Preview</title>');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(html).toContain('<!--PLATFORM_HEAD-->');
  });

  it("vite.config.ts: only the preview-link mode maps '@platform' to preview/ and writes dist/preview; every other mode keeps its own platform", async () => {
    const { default: config } = await import('../../vite.config');
    const resolveFor = async (mode: string) => {
      const c = await (config as unknown as (env: { mode: string; command: 'serve' | 'build'; isPreview?: boolean }) => Promise<UserConfigLike> | UserConfigLike)({ mode, command: 'serve' });
      return c;
    };
    const preview = await resolveFor(PREVIEW_MODE);
    expect(String(preview.resolve?.alias?.['@platform'])).toMatch(/[\\/]preview[\\/]platform\.ts$/);
    expect(preview.build?.outDir).toBe(PREVIEW_OUT_DIR);
    expect(preview.define?.['import.meta.env.VITE_LADDER_URL']).toBe(JSON.stringify(PREVIEW_SAMPLE_ORIGIN));
    for (const [mode, entry] of [
      ['production', /[\\/]src[\\/]platform[\\/]web[\\/]index\.ts$/],
      ['e2e', /[\\/]src[\\/]platform[\\/]web[\\/]index\.ts$/],
      ['release', /[\\/]src[\\/]platform[\\/]web[\\/]index\.ts$/],
      ['fbig', /[\\/]src[\\/]platform[\\/]fb[\\/]index\.ts$/],
      ['release-fbig', /[\\/]src[\\/]platform[\\/]fb[\\/]index\.ts$/],
    ] as const) {
      const c = await resolveFor(mode);
      expect(String(c.resolve?.alias?.['@platform']), mode).toMatch(entry);
      expect(c.define?.__PREVIEW_BUILD__, mode).toBeUndefined();
    }
  });
});

interface UserConfigLike {
  readonly resolve?: { readonly alias?: Record<string, string> };
  readonly build?: { readonly outDir?: string };
  readonly define?: Record<string, string>;
}
