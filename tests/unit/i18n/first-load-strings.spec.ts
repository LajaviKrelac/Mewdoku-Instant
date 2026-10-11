// Owner: lead (Phase 2e I-4, the first load). The English catalogue is two runtime tables: src/i18n/en-first.ts (in the
// first load) and src/i18n/en/lazy.ts (registered by src/i18n/en-lazy.ts, a lazy chunk). A key in the wrong table
// would show as the bare key: these checks fail first. scripts/i18n-split.ts does the static walk.
import { describe, expect, it } from 'vitest';
import { firstLoadFiles, lazyEntries, splitReport } from '../../../scripts/i18n-split';
import { en, EN_PARTS } from '../../../src/i18n/en';
import { COLOR_KEYS, enFirst, GLYPH_KEYS, MONTH_KEYS, PRAISE_KEYS, TUTORIAL_STEP_KEYS, WEEKDAY_KEYS } from '../../../src/i18n/en-first';
import { enLazy } from '../../../src/i18n/en-lazy';
import { enLazyTable } from '../../../src/i18n/en/lazy';
import { isI18nKey, translate, type I18nKey } from '../../../src/i18n';

describe('the English first-load / lazy split (Phase 2e I-4)', () => {
  it('no first-load file names a key that only the lazy table has', async () => {
    const r = await splitReport();
    expect(r.first.length).toBeGreaterThan(50);
    expect(r.firstNamesLazy).toEqual([]);
  });

  it('every lazy entry that shows a lazy key imports src/i18n/en-lazy.ts', async () => {
    const r = await splitReport();
    expect(r.entriesWithoutLazy).toEqual([]);
  });

  it('the analyzer sees the first load and the lazy barrels (a broken walk would pass vacuously)', () => {
    const first = [...firstLoadFiles()].map((f) => f.replace(/\\/g, '/'));
    for (const f of ['src/main.ts', 'src/app/boot.ts', 'src/ui/screens/home-screen.ts', 'src/ui/screens/game-screen.ts', 'src/i18n/en-first.ts']) {
      expect(first.some((p) => p.endsWith(f)), f).toBe(true);
    }
    for (const f of ['src/i18n/en-lazy.ts', 'src/i18n/en/lazy.ts', 'src/i18n/en.ts', 'src/app/overlay-chunk.ts', 'src/app/ladder-chunk.ts']) {
      expect(first.some((p) => p.endsWith(f)), f).toBe(false);
    }
    const entries = lazyEntries(firstLoadFiles()).map((f) => f.replace(/\\/g, '/'));
    for (const f of ['src/app/overlay-chunk.ts', 'src/app/ladder-chunk.ts', 'src/app/ladder-boot.ts', 'src/app/events-chunk.ts', 'src/app/social-flows.ts', 'src/ui/fx/celebrate.ts']) {
      expect(entries.some((p) => p.endsWith(f)), f).toBe(true);
    }
  });

  it('the two tables are disjoint and together are the whole catalogue', () => {
    const first = Object.keys(enFirst);
    const lazy = Object.keys(enLazyTable);
    expect(first.filter((k) => k in enLazyTable)).toEqual([]);
    expect(new Set([...first, ...lazy])).toEqual(new Set(Object.keys(en)));
    let parts = 0;
    for (const part of Object.values(EN_PARTS)) parts += Object.keys(part).length;
    expect(parts).toBe(Object.keys(en).length);
    expect(enLazy).toBe(enLazyTable);
  });

  it('the indexed key lists are first-load keys', () => {
    for (const k of [...COLOR_KEYS, ...GLYPH_KEYS, ...PRAISE_KEYS, ...TUTORIAL_STEP_KEYS, ...WEEKDAY_KEYS, ...MONTH_KEYS]) expect(k in enFirst, k).toBe(true);
  });

  it('once en-lazy.ts is loaded every key resolves to its English string', () => {
    for (const [k, v] of Object.entries(en)) {
      expect(isI18nKey(k), k).toBe(true);
      if (!/\{/.test(v) && !/\*/.test(v)) expect(translate(k as I18nKey), k).toBe(v);
    }
  });

  it('the first load bundles en-first.ts, never en.ts or en/lazy.ts (src/i18n/index.ts imports only types from en.ts)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../../src/i18n/index.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/^import \{[^}]*\benFirst\b[^}]*\} from '\.\/en-first';$/m);
    expect(src).toMatch(/^import type \{[^}]*\} from '\.\/en';$/m);
    expect(src).not.toMatch(/^import \{[^}]*\} from '\.\/en';$/m);
    expect(src).not.toMatch(/from '\.\/en\/lazy'|from '\.\/en-lazy'/);
  });
});
