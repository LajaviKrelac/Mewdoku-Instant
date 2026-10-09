// Owner: E. Runtime formatting (phase2b §6.4, §6.9): plural selection in ar, ru and pl; Latin digits
// everywhere (Arabic and Hindi included); short dates per locale; bidi isolation only in RTL;
// durations; the pseudo-locale transform.
import { afterAll, describe, expect, it } from 'vitest';
import { cfg } from '../../../src/app/config';
import {
  formatDuration,
  formatNumber,
  formatShortDate,
  getDir,
  interpolate,
  joinList,
  setLocale,
  stripIsolates,
  t,
  tn,
} from '../../../src/i18n';
import { FSI, formatNumberFor, formatShortDateFor, isolate, latnTag, PDI, pseudoLocalize } from '../../../src/i18n/format';
import { pluralCategory, requiredPluralCategories } from '../../../src/i18n/plural';

const NON_LATN_DIGITS = /[٠-٩۰-۹०-९๐-๙]/;
const doc = null; // Node: no <html> to update

afterAll(async () => {
  await setLocale('en', { doc });
});

describe('plural categories (Intl.PluralRules)', () => {
  it('Arabic uses all six', () => {
    expect([0, 1, 2, 3, 10, 11, 99, 100, 102, 103].map((n) => pluralCategory('ar', n))).toEqual([
      'zero', 'one', 'two', 'few', 'few', 'many', 'many', 'other', 'other', 'few',
    ]);
    expect(requiredPluralCategories('ar')).toEqual(['zero', 'one', 'two', 'few', 'many', 'other']);
  });

  it('Russian and Polish use one / few / many (+ other for fractions)', () => {
    expect([1, 2, 5, 11, 21, 22, 25, 0].map((n) => pluralCategory('ru', n))).toEqual(['one', 'few', 'many', 'many', 'one', 'few', 'many', 'many']);
    expect([1, 2, 5, 12, 21, 22, 0].map((n) => pluralCategory('pl', n))).toEqual(['one', 'few', 'many', 'many', 'many', 'few', 'many']);
    expect(requiredPluralCategories('ru')).toEqual(['one', 'few', 'many', 'other']);
    expect(requiredPluralCategories('pl')).toEqual(['one', 'few', 'many', 'other']);
  });

  it('French and Hindi treat 0 as one; Japanese has only other', () => {
    expect(pluralCategory('fr', 0)).toBe('one');
    expect(pluralCategory('hi', 0)).toBe('one');
    expect(requiredPluralCategories('ja')).toEqual(['other']);
  });

  it('tn picks the form of the active locale and fills {count}', async () => {
    await setLocale('ru', { doc });
    expect(tn('fish.count', 1)).toBe('1 рыбка');
    expect(tn('fish.count', 3)).toBe('3 рыбки');
    expect(tn('fish.count', 5)).toBe('5 рыбок');
    expect(tn('fish.count', 21)).toBe('21 рыбка');
    await setLocale('pl', { doc });
    expect(tn('event.reward.kitties', 1)).toBe('1 kotek');
    expect(tn('event.reward.kitties', 4)).toBe('4 kotki');
    expect(tn('event.reward.kitties', 12)).toBe('12 kotków');
    await setLocale('ar', { doc });
    expect(stripIsolates(tn('fish.count', 0))).toBe('لا سمك');
    expect(stripIsolates(tn('fish.count', 2))).toBe('سمكتان');
    expect(stripIsolates(tn('fish.count', 7))).toBe('7 سمكات');
    expect(stripIsolates(tn('fish.count', 15))).toBe('15 سمكة');
    await setLocale('ja', { doc });
    expect(tn('fish.count', 1)).toBe('さかな1匹'); // .one is absent: falls back to .other
    await setLocale('en', { doc });
    expect(tn('a11y.mistake', 1)).toBe('Wrong tile. 1 heart left.');
    expect(tn('a11y.mistake', 0)).toBe('Wrong tile. 0 hearts left.');
    expect(tn('fish.count', 1240)).toBe('1,240 fish');
  });
});

describe('numbers: Latin digits everywhere', () => {
  it('formatNumberFor groups per locale with Latin digits', () => {
    for (const id of cfg.i18n.locales) {
      const s = formatNumberFor(id, 1234567);
      expect(s, id).not.toMatch(NON_LATN_DIGITS);
      expect(s.replace(/\D/g, ''), id).toBe('1234567');
    }
    expect(formatNumberFor('de', 1234)).toBe('1.234');
    expect(formatNumberFor('en', 1234)).toBe('1,234');
    expect(formatNumberFor('not a tag!', 5)).toBe('5');
  });

  it('formatNumber follows the active locale', async () => {
    await setLocale('ar', { doc });
    expect(formatNumber(999999)).not.toMatch(NON_LATN_DIGITS);
    await setLocale('en', { doc });
    expect(formatNumber(999999)).toBe('999,999');
  });

  it('latnTag adds the numbering extension once', () => {
    expect(latnTag('ar')).toBe('ar-u-nu-latn');
    expect(latnTag('ar-u-ca-gregory')).toBe('ar-u-ca-gregory-nu-latn');
    expect(latnTag('hi-u-nu-latn')).toBe('hi-u-nu-latn');
  });
});

describe('dates', () => {
  it('English keeps the catalogue template', () => {
    expect(formatShortDate('2026-10-06')).toBe('Tue 6 Oct');
    expect(formatShortDate('not-a-date')).toBe('not-a-date');
  });

  it('other locales use Intl on the UTC date, with Latin digits (snapshot)', () => {
    const out: Record<string, string> = {};
    for (const id of cfg.i18n.locales) {
      if (id === 'en') continue;
      const s = formatShortDateFor(id, '2026-10-06') ?? '';
      expect(s, id).toMatch(/6/);
      expect(s, id).not.toMatch(NON_LATN_DIGITS);
      out[id] = s;
    }
    expect(out).toMatchSnapshot();
  });

  it('formatShortDate uses Intl for the active non-English locale', async () => {
    await setLocale('de', { doc });
    expect(formatShortDate('2026-10-06')).toBe(formatShortDateFor('de', '2026-10-06'));
    await setLocale('en', { doc });
  });
});

describe('bidi isolation (RTL only)', () => {
  it('isolate wraps only in rtl', () => {
    expect(isolate('Level 3', 'ltr')).toBe('Level 3');
    expect(isolate('3', 'rtl')).toBe(`${FSI}3${PDI}`);
    expect(isolate('', 'rtl')).toBe('');
  });

  it('interpolate isolates each parameter in Arabic, never in English', async () => {
    await setLocale('ar', { doc });
    expect(getDir()).toBe('rtl');
    const s = t('home.play', { level: 37 });
    expect(s).toBe(`المستوى ${FSI}37${PDI}`);
    expect(stripIsolates(s)).toBe('المستوى 37');
    expect(interpolate('{a}/{b}', { a: 1, b: 2 })).toBe(`${FSI}1${PDI}/${FSI}2${PDI}`);
    expect(stripIsolates(joinList(['2', '4', '5']))).toBe('2، 4 و5');
    await setLocale('en', { doc });
    expect(getDir()).toBe('ltr');
    expect(t('home.play', { level: 37 })).toBe('Level 37');
    expect(interpolate('{a}/{b}', { a: 1, b: 2 })).toBe('1/2');
  });
});

describe('durations', () => {
  it('hours and minutes, days from 24 h on, and under a minute', async () => {
    expect(formatDuration(30_000)).toBe('under a minute');
    expect(formatDuration((7 * 60 + 48) * 60_000)).toBe('7 h 48 min');
    expect(formatDuration(5 * 60_000)).toBe('5 min');
    expect(formatDuration((2 * 24 + 5) * 3_600_000 + 59 * 60_000)).toBe('2 d 5 h');
    await setLocale('de', { doc });
    expect(formatDuration((7 * 60 + 48) * 60_000)).toBe('7 Std. 48 Min.');
    expect(formatDuration((3 * 24 + 1) * 3_600_000)).toBe('3 T. 1 Std.');
    await setLocale('en', { doc });
  });
});

describe('pseudo-locale xx-long', () => {
  it('accents letters, keeps placeholders, grows by about 40 %, and brackets the text', () => {
    const p = pseudoLocalize('Level {level}');
    expect(p.startsWith('⟦Ľéṽéľ {level}')).toBe(true);
    expect(p.endsWith('⟧')).toBe(true);
    expect(p).toContain('{level}');
    const src = 'Tap a tile to cross it out.';
    expect(pseudoLocalize(src).length).toBeGreaterThanOrEqual(Math.floor(src.length * 1.4));
    expect(pseudoLocalize('')).toBe('⟦⟧');
  });
});
