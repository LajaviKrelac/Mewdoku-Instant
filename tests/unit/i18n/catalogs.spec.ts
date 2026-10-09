// Owner: E (Phase 2b); G2 (Phase 2c: lives are fish in every catalogue). The translated catalogues (phase2b §6.7, §6.9): one AI draft per non-English locale; for
// every locale every English key present and non-empty (English-only date parts and `.one` forms a
// language never selects excepted), placeholder sets equal to English, every plural category that
// Intl.PluralRules selects for 0…200 and 1 000, nothing translatable left identical to English, no
// banned phrase; max lengths are warnings. The same rules back `npm run i18n:check`, whose seeded
// faults are checked here too.
import { describe, expect, it } from 'vitest';
import { cfg, type LocaleId } from '../../../src/app/config';
import { en } from '../../../src/i18n/en';
import { displayWidth, isEnglishOnly, META, placeholdersOf, sampleText, SAME_AS_ENGLISH } from '../../../src/i18n/meta';
import { pluralCategory, requiredPluralCategories } from '../../../src/i18n/plural';
import { checkCatalog, checkLocaleLists, hasReviewLine, pluralBases } from '../../../scripts/i18n-check';

type Strings = Readonly<Record<string, string | undefined>>;

const MODULES = import.meta.glob<{ catalog: Strings }>('../../../src/i18n/locales/*.ts', { eager: true });
const CATALOGS = new Map<string, Strings>(
  Object.entries(MODULES).map(([file, mod]) => [/([^/]+)\.ts$/.exec(file)?.[1] ?? file, mod.catalog]),
);
const SOURCE = en as Strings;
const BASES = pluralBases(SOURCE);
const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));

describe('the catalogue set', () => {
  it('has an AI draft for each of the 16 non-English locales, and nothing else', () => {
    const want = cfg.i18n.locales.filter((id) => id !== 'en').sort();
    expect([...CATALOGS.keys()].sort()).toEqual(want);
    expect(want).toHaveLength(16);
  });

  it('locale lists are consistent', () => {
    expect(checkLocaleLists()).toEqual([]);
  });

  it('meta describes every English key; non-translatable keys are few and named', () => {
    for (const key of Object.keys(SOURCE)) expect(META[key as keyof typeof META]?.description, key).toBeTruthy();
    const fixed = Object.keys(SOURCE).filter((k) => META[k as keyof typeof META]?.translatable === false && !k.startsWith('locale.name.') && !k.startsWith('date.'));
    expect(fixed.sort()).toEqual(
      [
        'app.name', 'boot.progress', 'event.title.game', 'fail.continue.bonus', 'fish.plus', 'game.cats', 'home.daily.size',
        'home.daily.sub', 'list.separator', 'time.daysHours', 'time.hoursMinutes', 'time.minutes', 'unit.colorWithGlyph',
      ].sort(),
    );
  });
});

for (const [id, catalog] of CATALOGS) {
  describe(`catalogue ${id}`, () => {
    const required = requiredPluralCategories(id);

    it('has every English key, non-empty (date parts and unused .one forms excepted), and no unknown key', () => {
      const missing = Object.keys(SOURCE).filter((k) => {
        if (catalog[k] !== undefined) return false;
        if (isEnglishOnly(k)) return false;
        if (!required.includes('one') && k.endsWith('.one') && BASES.includes(k.slice(0, -4))) return false;
        return true;
      });
      expect(missing).toEqual([]);
      for (const [k, v] of Object.entries(catalog)) expect(typeof v === 'string' && v.trim() !== '', k).toBe(true);
      const extra = Object.keys(catalog).filter((k) => {
        if (SOURCE[k] !== undefined) return false;
        const dot = k.lastIndexOf('.');
        return !(BASES.includes(k.slice(0, dot)) && ['zero', 'two', 'few', 'many'].includes(k.slice(dot + 1)));
      });
      expect(extra).toEqual([]);
    });

    it('keeps the English placeholder set for every key', () => {
      const bad: string[] = [];
      for (const [k, v] of Object.entries(catalog)) {
        if (v === undefined) continue;
        const isExtra = SOURCE[k] === undefined;
        const base = k.slice(0, k.lastIndexOf('.'));
        const english = SOURCE[isExtra ? `${base}.other` : k] ?? '';
        const want = placeholdersOf(english);
        const got = placeholdersOf(v);
        if (sameSet(want, got)) continue;
        // A plural form for one exact number may drop {count} (Arabic "سمكتان").
        const cat = k.slice(k.lastIndexOf('.') + 1);
        const exact = BASES.includes(base) && [...Array(201).keys(), 1000].filter((n) => pluralCategory(id, n) === cat).length === 1;
        if (exact && sameSet(want.filter((p) => p !== 'count'), got)) continue;
        bad.push(`${k}: {${got.join('},{')}} vs {${want.join('},{')}}`);
      }
      expect(bad).toEqual([]);
    });

    it(`has every plural category Intl selects for ${id} (n = 0…200, 1000)`, () => {
      const missing: string[] = [];
      for (const base of BASES) for (const c of required) if (catalog[`${base}.${c}`] === undefined) missing.push(`${base}.${c}`);
      expect(missing).toEqual([]);
    });

    it('leaves nothing translatable identical to English', () => {
      const allowed = new Set<string>(SAME_AS_ENGLISH[id as LocaleId] ?? []);
      const same = Object.keys(SOURCE).filter((k) => {
        const v = catalog[k];
        if (v === undefined || v !== SOURCE[k]) return false;
        if (META[k as keyof typeof META]?.translatable === false || allowed.has(k)) return false;
        return /\p{L}/u.test(v);
      });
      expect(same).toEqual([]);
    });

    it('passes i18n-check (max lengths are warnings)', () => {
      const r = checkCatalog(id, catalog);
      expect(r.errors).toEqual([]);
      if (r.warnings.length > 0) console.warn(r.warnings.join('\n'));
    });
  });
}

// ── Phase 2c (G2, fish-lives-spec §1.5, Appendix A): the lives are fish in every catalogue ──
describe('Phase 2c: lives are fish, the period and streak copy, no fish currency', () => {
  /** Each draft's 2b word for a heart (glossary §2), which no lives string may keep. */
  const HEART: Readonly<Record<string, RegExp>> = {
    de: /herz/i, es: /coraz/i, fr: /cœur/i, it: /cuor/i, 'pt-BR': /coraç/i, id: /\bhati\b/i, tr: /kalp|kalb/i, pl: /serc|serduszk/i,
    ru: /серд/i, vi: /\btim\b/i, th: /หัวใจ/, ja: /ハート/, ko: /하트/, 'zh-Hans': /[颗]心|心用|心，/, hi: /दिल/, ar: /قلب|قلو/,
  };
  const LIVES = (key: string): boolean =>
    ['game.hearts.a11y', 'howto.hearts', 'fail.title', 'a11y.lost', 'a11y.revived'].includes(key) ||
    key.startsWith('fail.continue.a11y.') ||
    key.startsWith('a11y.mistake.');
  const REMOVED = [
    'victory.bonus.hard', 'victory.bonus.daily', 'shop.swap', 'shop.swap.hint', 'shop.swap.kitty', 'shop.swap.action', 'shop.swap.done',
    'shop.swap.a11y', 'rewarded.swap', 'shop.product.fish_250.name', 'shop.product.fish_250.desc', 'shop.product.fish_900.name',
    'shop.product.fish_900.desc', 'event.reward.fish.one', 'event.reward.fish.other',
    // The last three once G1 stopped calling them (G1 request R2): the fish-earned line, the paw-points title, "Not enough fish".
    'a11y.fishEarned.one', 'a11y.fishEarned.other', 'rank.title.points', 'shop.notEnough',
    // Integration step I-3: the paw-points score and its "This level" records row went with the board.
    'rank.points', 'rank.records.thisLevel',
  ];

  it.each([...CATALOGS.keys()].sort())('%s: no lives string still says "heart"', (id) => {
    const catalog = CATALOGS.get(id) as Strings;
    const re = HEART[id] as RegExp;
    expect(re, `a heart word for ${id}`).toBeDefined();
    const left = Object.entries(catalog).filter(([k, v]) => LIVES(k) && typeof v === 'string' && re.test(v)).map(([k]) => k);
    expect(left).toEqual([]);
    // Every lives string is there (the drafts were redone, not dropped).
    for (const k of ['game.hearts.a11y', 'howto.hearts', 'fail.title', 'a11y.lost', 'a11y.revived']) expect(catalog[k], `${id} ${k}`).toBeTruthy();
  });

  it('the fish-currency keys are gone from English and every catalogue (A.3)', () => {
    for (const key of REMOVED) expect(key in en, key).toBe(false);
    for (const [id, catalog] of CATALOGS) {
      const stale = Object.keys(catalog).filter(
        (k) => REMOVED.includes(k) || k.startsWith('event.reward.fish.') || k.startsWith('a11y.fishEarned.') || k.startsWith('shop.swap'),
      );
      expect(stale, id).toEqual([]);
    }
  });

  it('every catalogue has the period, streak and kept-fish copy for all three period kinds', () => {
    const kinds = ['day', 'week', 'month'] as const;
    const singles = kinds.flatMap((k) => [`period.total.${k}`, `rank.title.period.${k}`, `rank.tab.period.${k}`, `rank.records.best.${k}`, `howto.points.${k}`]);
    const plurals = [...kinds.flatMap((k) => [`period.pill.${k}`, `a11y.fishKept.${k}`]), 'rank.sub.period', 'victory.streak.a11y'];
    for (const key of [...singles, 'rank.records.streak', 'rank.records.streakBest', 'victory.streak']) expect(SOURCE[key], key).toBeTruthy();
    for (const base of plurals) expect(BASES, base).toContain(base);
    for (const [id, catalog] of CATALOGS) {
      for (const key of [...singles, 'rank.records.streak', 'rank.records.streakBest', 'victory.streak']) expect(catalog[key], `${id} ${key}`).toBeTruthy();
      for (const base of plurals) expect(catalog[`${base}.other`], `${id} ${base}.other`).toBeTruthy();
      // The weekly copy names Monday 00:00 UTC (a fixed boundary for every player): the digits stay.
      expect(catalog['howto.points.week'], id).toContain('00:00 UTC');
    }
  });
});

describe('i18n-check catches seeded faults', () => {
  const de = CATALOGS.get('de') ?? {};

  it('a missing key, an unknown key, a renamed placeholder, a missing plural form, an English leftover, a banned phrase', () => {
    const broken: Record<string, string | undefined> = { ...de };
    delete broken['hint.title'];
    broken['hint.nonsense'] = 'x';
    broken['home.play'] = 'Level {lvl}';
    broken['common.close'] = 'Close';
    broken['toast.error'] = 'Golden fish ahoy';
    const ru = { ...(CATALOGS.get('ru') ?? {}) } as Record<string, string | undefined>;
    delete ru['fish.count.few'];
    const e1 = checkCatalog('de', broken).errors.join('\n');
    expect(e1).toContain('missing hint.title');
    expect(e1).toContain('unknown key hint.nonsense');
    expect(e1).toContain('home.play placeholders');
    expect(e1).toContain('common.close is identical to English');
    expect(e1).toContain('banned phrase "golden fish"');
    expect(checkCatalog('ru', ru).errors.join('\n')).toContain('plural fish.count lacks .few');
  });

  it('the original\'s Indonesian victory label is a banned phrase (review CLEAN-1)', () => {
    const id = { ...(CATALOGS.get('id') ?? {}), 'win.levelComplete': 'Kelas Master {level}' };
    expect(checkCatalog('id', id).errors.join('\n')).toContain('banned phrase "kelas master"');
  });

  it('keyword markers must pair up and match English (review PAR-7)', () => {
    expect(en['tutorial.step1']).toContain('*exactly one cat*');
    const unpaired = { ...de, 'tutorial.step2': 'Eine Katze beansprucht ihre *ganze Zeile und Spalte.' };
    expect(checkCatalog('de', unpaired).errors.join('\n')).toContain('tutorial.step2 has an unpaired keyword marker');
    const missing = { ...de, 'howto.rule.lines': 'Auch jede Zeile und jede Spalte enthält eine Katze.' };
    expect(checkCatalog('de', missing).errors.join('\n')).toContain('howto.rule.lines marks 0 keyword(s), English 1');
    const extra = { ...de, 'hint.title': '*Tipp*' };
    expect(checkCatalog('de', extra).errors.join('\n')).toContain('hint.title marks 1 keyword(s), English 0');
  });

  it('warns on an over-long string and on a stale translation', () => {
    const long = { ...de, 'game.chip.colours': 'Eine Katze in jeder einzelnen Farbe' };
    expect(checkCatalog('de', long).warnings.join('\n')).toContain('game.chip.colours');
    const stale = checkCatalog('de', de, { draftedFrom: { 'hint.title': 'Clue' } }).warnings.join('\n');
    expect(stale).toContain('hint.title was translated from "Clue"');
  });

  it('display width counts CJK as 2 and combining marks as 0', () => {
    expect(displayWidth('abc')).toBe(3);
    expect(displayWidth('設定')).toBe(4);
    expect(displayWidth('한국어')).toBe(6);
    expect(displayWidth('ที่')).toBe(1);
    expect(displayWidth(sampleText('Level {level}'))).toBe(8);
  });

  it('a review-log approval is a table row naming the locale', () => {
    expect(hasReviewLine('| es | Ana | 2026-11-02 | abc123 |', 'es')).toBe(true);
    expect(hasReviewLine('| `pt-BR` | Bia | 2026-11-02 | abc123 |', 'pt-BR')).toBe(true);
    expect(hasReviewLine('| pt | Bia |', 'pt-BR')).toBe(false);
    expect(hasReviewLine('es is pending review', 'es')).toBe(false);
  });
});
