// Owner: E. Locale resolution (phase2b §6.3, §6.9): the FB/web tag table, the override, the special
// map, candidate order, build-restricted lists and the boot guess.
import { describe, expect, it } from 'vitest';
import { cfg, type LocaleId } from '../../../src/app/config';
import { guessLocale, isLocaleId, isRtl, localeCandidates, matchTag, normalizeTag, resolveLocale } from '../../../src/i18n/locale';

const ALL = cfg.i18n.locales;
const resolve = (tag: string, available: readonly LocaleId[] = ALL): LocaleId =>
  resolveLocale({ candidates: [tag], override: 'auto', available });

describe('normalizeTag', () => {
  it('replaces _ with -, lowercases the language, uppercases the region, title-cases the script', () => {
    expect(normalizeTag('pt_br')).toBe('pt-BR');
    expect(normalizeTag('en_US')).toBe('en-US');
    expect(normalizeTag('ZH_hans_cn')).toBe('zh-Hans-CN');
    expect(normalizeTag('es-419')).toBe('es-419');
    expect(normalizeTag(' de_DE.UTF-8 ')).toBe('de-DE');
    expect(normalizeTag('sr_RS@latin')).toBe('sr-RS');
    expect(normalizeTag('')).toBe('');
    expect(normalizeTag(undefined as unknown as string)).toBe('');
  });
});

describe('resolveLocale (§6.3 table)', () => {
  it('maps FB ll_CC codes and browser tags onto the 17 locales', () => {
    const table: [string, LocaleId][] = [
      ['en_US', 'en'], ['en_GB', 'en'], ['en_UD', 'en'],
      ['es_LA', 'es'], ['es_ES', 'es'], ['es-419', 'es'],
      ['pt_BR', 'pt-BR'], ['pt_PT', 'pt-BR'], ['pt', 'pt-BR'],
      ['fr_FR', 'fr'], ['fr_CA', 'fr'], ['de_DE', 'de'], ['it_IT', 'it'], ['id_ID', 'id'], ['in_ID', 'id'],
      ['tr_TR', 'tr'], ['pl_PL', 'pl'], ['ru_RU', 'ru'], ['vi_VN', 'vi'], ['th_TH', 'th'],
      ['ja_JP', 'ja'], ['ja_KS', 'ja'], ['ko_KR', 'ko'],
      ['zh_CN', 'zh-Hans'], ['zh_SG', 'zh-Hans'], ['zh_TW', 'zh-Hans'], ['zh_HK', 'zh-Hans'], ['zh-MO', 'zh-Hans'],
      ['zh-Hant-TW', 'zh-Hans'], ['zh-Hans', 'zh-Hans'], ['zh', 'zh-Hans'],
      ['hi_IN', 'hi'], ['ar_AR', 'ar'], ['ar-EG', 'ar'],
      ['xx_YY', 'en'], ['fb_LT', 'en'], ['', 'en'], ['nl_NL', 'en'],
    ];
    for (const [tag, want] of table) expect(resolve(tag), tag).toBe(want);
  });

  it('an exact id is matched case-insensitively', () => {
    expect(resolve('PT-br')).toBe('pt-BR');
    expect(matchTag('ZH-HANS', ALL)).toBe('zh-Hans');
  });

  it('tries the candidates in order (web navigator.languages), then falls back to en', () => {
    expect(resolveLocale({ candidates: ['nl-NL', 'fr-BE', 'de'], override: 'auto', available: ALL })).toBe('fr');
    expect(resolveLocale({ candidates: ['nl', 'sv'], override: 'auto', available: ALL })).toBe('en');
    expect(resolveLocale({ candidates: [], override: 'auto', available: ALL })).toBe('en');
  });

  it('a saved override wins when the build contains it', () => {
    expect(resolveLocale({ candidates: ['de_DE'], override: 'ja', available: ALL })).toBe('ja');
  });

  it("in a build with only ['en','es']: fr_FR resolves to en, and a saved override de resolves as 'auto'", () => {
    const available: LocaleId[] = ['en', 'es'];
    expect(resolveLocale({ candidates: ['fr_FR'], override: 'auto', available })).toBe('en');
    expect(resolveLocale({ candidates: ['es_MX'], override: 'auto', available })).toBe('es');
    const input = Object.freeze({ candidates: Object.freeze(['es_LA']), override: 'de' as const, available });
    expect(resolveLocale(input)).toBe('es');
    // Pure: the override (settings.locale in the save) is not touched.
    expect(input.override).toBe('de');
    expect(resolveLocale({ candidates: ['fr_FR'], override: 'de', available })).toBe('en');
  });

  it('the special map only applies when the build contains its target', () => {
    expect(resolveLocale({ candidates: ['zh_TW', 'ja_JP'], override: 'auto', available: ['en', 'ja'] })).toBe('ja');
    expect(resolveLocale({ candidates: ['pt_PT'], override: 'auto', available: ['en'] })).toBe('en');
  });
});

describe('boot guess and candidate list', () => {
  it('guessLocale reads navigator.language against the build list', () => {
    expect(guessLocale('de-AT', ALL)).toBe('de');
    expect(guessLocale('zh-TW', ALL)).toBe('zh-Hans');
    expect(guessLocale(undefined, ALL)).toBe('en');
    expect(guessLocale('de-DE', ['en'])).toBe('en');
  });

  it('web: navigator.languages in order, then language, then the platform tag; FB: the platform tag only', () => {
    const nav = { language: 'fr-FR', languages: ['nl-NL', 'fr-FR', 'en-US'] };
    expect(localeCandidates('web', 'fr_FR', nav)).toEqual(['nl-NL', 'fr-FR', 'en-US']);
    expect(localeCandidates('web', 'de_DE', { language: 'de-DE' })).toEqual(['de-DE']);
    expect(localeCandidates('fbig', 'es_LA', nav)).toEqual(['es-LA']);
    expect(localeCandidates('fbig', null, nav)).toEqual([]);
    expect(resolveLocale({ candidates: localeCandidates('web', 'fr_FR', nav), override: 'auto', available: ALL })).toBe('fr');
  });

  it('helpers: isLocaleId, isRtl', () => {
    expect(isLocaleId('pt-BR')).toBe(true);
    expect(isLocaleId('pt')).toBe(false);
    expect(isLocaleId(3)).toBe(false);
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('he')).toBe(false);
    expect(ALL.filter((id) => isRtl(id))).toEqual(['ar']);
  });
});
