// Owner: E. setLocale (phase2b §6.3): resolution against the build's locales, lazy chunk loading,
// <html lang>/<html dir>, listeners, the boot prefetch, a newer call superseding a slower one, and
// the English fallback when a chunk fails. The build's loader map is replaced by controllable
// loaders (vi.mock of build-locales.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocaleId } from '../../../src/app/config';
import type { LocaleModule } from '../../../src/i18n/build-locales';

interface Deferred {
  resolve(m: LocaleModule): void;
  reject(e: unknown): void;
}

const pending = new Map<string, Deferred>();
const calls: string[] = [];

vi.mock('../../../src/i18n/build-locales', () => ({
  buildLocaleIds: (): readonly LocaleId[] => ['en', 'de', 'fr', 'ar', 'ja'],
  localeLoader: (id: LocaleId) =>
    id === 'en'
      ? null
      : () =>
          new Promise<LocaleModule>((resolve, reject) => {
            calls.push(id);
            pending.set(id, { resolve, reject });
          }),
}));

type I18n = typeof import('../../../src/i18n');
let i18n: I18n;

function fakeDoc(): Document {
  const attrs = new Map<string, string>([['lang', 'en']]);
  const documentElement = {
    getAttribute: (n: string) => attrs.get(n) ?? null,
    setAttribute: (n: string, v: string) => void attrs.set(n, v),
  };
  return { documentElement } as unknown as Document;
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

const cat = (title: string): LocaleModule => ({ catalog: { 'settings.title': title } });

// A fresh module per case: loaded catalogues and in-flight loads never leak between cases.
beforeEach(async () => {
  calls.length = 0;
  pending.clear();
  vi.resetModules();
  i18n = await import('../../../src/i18n');
});

afterEach(async () => {
  await i18n.setLocale('en', { doc: null });
});

describe('setLocale', () => {
  it('resolves the tag, loads the chunk, then switches catalogue, <html lang|dir> and notifies', async () => {
    const doc = fakeDoc();
    const seen: string[] = [];
    const off = i18n.onLocaleChanged((id, dir) => seen.push(`${id}/${dir}`));
    const p = i18n.setLocale('de_DE', { doc });
    await settle();
    expect(calls).toEqual(['de']);
    expect(i18n.getLocale()).toBe('en'); // still English while the chunk loads
    pending.get('de')?.resolve(cat('Einstellungen'));
    await expect(p).resolves.toBe('de');
    expect(i18n.t('settings.title')).toBe('Einstellungen');
    expect(i18n.t('common.close')).toBe('Close'); // missing keys fall back to English
    expect(doc.documentElement.getAttribute('lang')).toBe('de');
    expect(doc.documentElement.getAttribute('dir')).toBe('ltr');
    expect(seen).toEqual(['de/ltr']);
    // A loaded catalogue switches synchronously (the prefetched boot path).
    await i18n.setLocale('en', { doc });
    const again = i18n.setLocale('de', { doc });
    expect(i18n.getLocale()).toBe('de');
    await again;
    expect(calls).toEqual(['de']);
    off();
  });

  it('Arabic sets dir=rtl', async () => {
    const doc = fakeDoc();
    const p = i18n.setLocale('ar_AR', { doc });
    await settle();
    pending.get('ar')?.resolve(cat('الإعدادات'));
    await p;
    expect(i18n.getDir()).toBe('rtl');
    expect(doc.documentElement.getAttribute('dir')).toBe('rtl');
    expect(doc.documentElement.getAttribute('lang')).toBe('ar');
  });

  it('the saved override wins; a locale the build lacks falls back to English without loading', async () => {
    const p = i18n.setLocale('de_DE', { override: 'ja', doc: null });
    await settle();
    expect(calls).toEqual(['ja']);
    pending.get('ja')?.resolve(cat('設定'));
    await expect(p).resolves.toBe('ja');
    calls.length = 0;
    await expect(i18n.setLocale('ko_KR', { doc: null })).resolves.toBe('en');
    expect(calls).toEqual([]);
    const list = i18n.setLocale(['nl-NL', 'fr-BE'], { doc: null });
    await settle();
    pending.get('fr')?.resolve(cat('Réglages'));
    await expect(list).resolves.toBe('fr');
  });

  it('a newer call supersedes an older one that is still loading', async () => {
    const slow = i18n.setLocale('fr', { doc: null });
    await settle();
    const fast = i18n.setLocale('en', { doc: null });
    await expect(fast).resolves.toBe('en');
    pending.get('fr')?.resolve(cat('Réglages'));
    await expect(slow).resolves.toBe('en');
    expect(i18n.getLocale()).toBe('en');
    expect(i18n.t('settings.title')).toBe('Settings');
  });

  it('a chunk that fails to load leaves English in place and can be retried', async () => {
    const p = i18n.setLocale('fr', { doc: null });
    await settle();
    pending.get('fr')?.reject(new Error('offline'));
    await expect(p).resolves.toBe('en');
    expect(i18n.getLocale()).toBe('en');
    const retry = i18n.setLocale('fr', { doc: null });
    await settle();
    expect(calls.filter((c) => c === 'fr')).toHaveLength(2);
    pending.get('fr')?.resolve(cat('Réglages'));
    await expect(retry).resolves.toBe('fr');
  });

  it('a chunk whose failed import named its URL is retried from a cache-busting URL (review ROB-2)', async () => {
    // Chromium keeps the failed module record: importing the same specifier again rejects at once
    // without a request, so the plain loader can never recover. The retry must use a fresh URL.
    const urls: string[] = [];
    i18n.setLocaleUrlImport((url) => {
      urls.push(url);
      return Promise.resolve(cat('Einstellungen'));
    });
    try {
      const first = i18n.setLocale('de', { doc: null });
      await settle();
      pending.get('de')?.reject(new TypeError('Failed to fetch dynamically imported module: http://127.0.0.1:4173/assets/locale-de-C80p9Ncn.js'));
      await expect(first).resolves.toBe('en');
      // Settings → Language → Deutsch again.
      await expect(i18n.setLocale('de', { doc: null })).resolves.toBe('de');
      expect(calls.filter((c) => c === 'de')).toHaveLength(1); // the plain loader was not asked again
      expect(urls).toEqual(['http://127.0.0.1:4173/assets/locale-de-C80p9Ncn.js?retry=1']);
      expect(i18n.t('settings.title')).toBe('Einstellungen');
    } finally {
      i18n.setLocaleUrlImport(null);
    }
  });

  it('failedChunkUrl reads the chunk URL from Chromium and Firefox import errors', () => {
    expect(i18n.failedChunkUrl(new TypeError('Failed to fetch dynamically imported module: https://x.test/a/locale-fr-1.js'))).toBe('https://x.test/a/locale-fr-1.js');
    expect(i18n.failedChunkUrl(new TypeError('error loading dynamically imported module: http://h/locale-ar-9.js'))).toBe('http://h/locale-ar-9.js');
    expect(i18n.failedChunkUrl(new Error('offline'))).toBeNull();
  });

  it('prefetch shares the request with a later setLocale', async () => {
    expect(i18n.prefetchGuess({ language: 'ja-JP' })).toBe('ja');
    const pre = i18n.prefetchLocale('ja');
    await settle();
    expect(calls).toEqual(['ja']);
    const p = i18n.setLocale('ja_JP', { doc: null });
    pending.get('ja')?.resolve(cat('設定'));
    await expect(pre).resolves.toBe(true);
    await expect(p).resolves.toBe('ja');
    expect(calls).toEqual(['ja']);
    await expect(i18n.prefetchLocale('ko')).resolves.toBe(false);
  });

  it('buildLocales and localeName come from the build list and the endonyms', () => {
    expect(i18n.buildLocales()).toEqual(['en', 'de', 'fr', 'ar', 'ja']);
    expect(i18n.localeName('de')).toBe('Deutsch');
    expect(i18n.localeName('zh-Hans')).toBe('简体中文');
  });
});
