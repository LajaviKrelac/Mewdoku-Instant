// Owner: game. Levels repository (04 §3, §8; 02 §11.4, §12): bundled pack, lazy packs with retries,
// substitute boards, endless and daily generation through an injected generator, plus the Vite asset wiring.
import { describe, expect, it } from 'vitest';
import { mergeConfig } from '../../../src/app/config';
import { isLevelPack } from '../../../src/engine/codec';
import type { GenResult, GenSpec, LevelPack, LevelRecord } from '../../../src/engine/types';
import { availableAssets, BUNDLED_PACK, createAssetLoaders, dailyMonthUrl, packUrl } from '../../../src/game/level-assets';
import { createLevelsRepo, type LevelsRepo } from '../../../src/game/levels-repo';
import { dailySpec, endlessRetrySpec, endlessSpec, substituteSpec } from '../../../src/game/progression';
import { TUTORIAL_RECORD, tutorialPuzzle } from '../../../src/game/tutorial';
import { rec5, S5 } from './fixtures';

/** 9 shipped levels in packs of 3: pack 0 = 1–3 (bundled), pack 1 = 4–6, pack 2 = 7–9; endless from 10. */
const C = mergeConfig({ levels: { packSize: 3, shipped: 9, prefetchAhead: 1, hardFrom: 9, hardEvery: 10 } });

function levelPack(k: number, levels?: LevelRecord[]): LevelPack {
  const first = k * 3 + 1;
  return { v: 1, kind: 'levels', first, count: 3, gen: 'test', levels: levels ?? [rec5(first), rec5(first + 1), rec5(first + 2)] };
}
const BUNDLED = levelPack(0, [TUTORIAL_RECORD, rec5(2), rec5(3)]);

/** A behaviour per call: a value (resolve), an Error (reject); the last one repeats. */
type Script = readonly (unknown | Error)[];

interface Harness {
  repo: LevelsRepo;
  loads: number[];
  months: string[];
  specs: GenSpec[];
  delays: number[];
  fallbacks: string[];
}

const GRADE = { grade: 1, counts: [0, 0, 0, 0, 0, 0], pigeonMaxK: 0, effort: 7 } as const;
const okGen = (): GenResult => ({ ok: true, record: rec5(), attempts: 3, grade: GRADE });
const failGen = (): GenResult => ({ ok: false, attempts: 5000, reason: 'max_attempts' });

function harness(opts: {
  packs?: Record<number, Script>;
  daily?: Record<string, Script>;
  gen?: (spec: GenSpec, call: number) => GenResult | Error;
  bundled?: unknown;
  throwingFallback?: boolean;
} = {}): Harness {
  const h: Omit<Harness, 'repo'> = { loads: [], months: [], specs: [], delays: [], fallbacks: [] };
  const counters = new Map<string, number>();
  const play = (key: string, script: Script | undefined): Promise<unknown> => {
    const i = counters.get(key) ?? 0;
    counters.set(key, i + 1);
    if (!script) return Promise.resolve(null);
    const b = script[Math.min(i, script.length - 1)];
    return b instanceof Error ? Promise.reject(b) : Promise.resolve(b);
  };
  const repo = createLevelsRepo({
    bundled: (opts.bundled ?? BUNDLED) as LevelPack,
    config: C,
    loadPack: (k) => {
      h.loads.push(k);
      return play(`p${k}`, opts.packs?.[k] ?? [levelPack(k)]);
    },
    loadDailyMonth: (m) => {
      h.months.push(m);
      return play(`m${m}`, opts.daily?.[m]);
    },
    generate: (spec) => {
      h.specs.push(spec);
      const r = (opts.gen ?? okGen)(spec, h.specs.length);
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
    },
    delay: (ms) => {
      h.delays.push(ms);
      return Promise.resolve();
    },
    onFallback: (where) => {
      h.fallbacks.push(where);
      if (opts.throwingFallback) throw new Error('analytics down');
    },
  });
  return { repo, ...h };
}

const NET = new Error('network');

describe('levels from packs', () => {
  it('level 1 is the tutorial; the bundled pack serves levels 2–3 without a fetch, cached', async () => {
    const h = harness();
    expect(h.repo.getTutorial()).toBe(tutorialPuzzle());
    expect(await h.repo.getLevel(1)).toEqual({ puzzle: tutorialPuzzle(), source: 'tutorial' });
    const l2 = await h.repo.getLevel(2);
    expect(l2.source).toBe('pack');
    expect(l2.puzzle).toMatchObject({ id: 'L2', n: 5, hard: false });
    expect(l2.puzzle.solution).toEqual(Uint8Array.from(S5, (ch) => Number(ch)));
    expect((await h.repo.getLevel(2)).puzzle).toBe(l2.puzzle);
    expect(h.repo.peekLevel(2)).toBe(l2.puzzle);
    expect(h.repo.peekLevel(3)?.id).toBe('L3');
    expect(h.loads).toEqual([]);
  });

  it('a later pack is fetched once, even for concurrent requests', async () => {
    const h = harness();
    expect(h.repo.peekLevel(5)).toBeNull();
    const [a, b] = await Promise.all([h.repo.getLevel(4), h.repo.getLevel(5)]);
    expect([a.source, b.source]).toEqual(['pack', 'pack']);
    expect(b.puzzle.id).toBe('L5');
    await h.repo.getLevel(6);
    expect(h.loads).toEqual([1]);
    expect(h.repo.peekLevel(6)?.id).toBe('L6');
  });

  it('retries a failed fetch after 500 ms and 2 s (04 §8)', async () => {
    const h = harness({ packs: { 1: [NET, NET, levelPack(1)] } });
    expect((await h.repo.getLevel(5)).source).toBe('pack');
    expect(h.loads).toEqual([1, 1, 1]);
    expect(h.delays).toEqual([500, 2000]);
    expect(h.fallbacks).toEqual([]);
  });

  it('after two retries: a substitute board (fallback seed), never saved in the cache; the network is tried again later', async () => {
    const h = harness({ packs: { 1: [NET, NET, NET, levelPack(1)] } });
    const sub = await h.repo.getLevel(5);
    expect(sub.source).toBe('substitute');
    expect(sub.puzzle.id).toBe('L5');
    expect(h.fallbacks).toEqual(['pack_fetch']);
    expect(h.specs).toEqual([substituteSpec(5, C)]);
    expect(h.specs[0]?.seed).toBe('mewdoku:fallback:v1:5');
    expect(h.repo.peekLevel(5)).toBeNull();
    const again = await h.repo.getLevel(5);
    expect(again.source).toBe('pack');
    expect(h.loads).toEqual([1, 1, 1, 1]);
  });

  it('a missing pack file (null) falls back at once, without retries', async () => {
    const h = harness({ packs: { 2: [null] } });
    expect((await h.repo.getLevel(8)).source).toBe('substitute');
    expect(h.delays).toEqual([]);
    expect(h.fallbacks).toEqual(['pack_missing']);
  });

  it('a pack that parsed but is wrong (not a pack, or another range) is not retried', async () => {
    for (const bad of [{ hello: 1 }, levelPack(2)]) {
      const h = harness({ packs: { 1: [bad] } });
      expect((await h.repo.getLevel(4)).source).toBe('substitute');
      expect(h.loads).toEqual([1]);
      expect(h.fallbacks).toEqual(['pack_invalid']);
    }
  });

  it('a corrupt record gets a substitute; the rest of the pack is fine', async () => {
    const broken = { ...rec5(5), s: '00000' };
    const h = harness({ packs: { 1: [levelPack(1, [rec5(4), broken, rec5(6)])] } });
    expect((await h.repo.getLevel(5)).source).toBe('substitute');
    expect(h.fallbacks).toEqual(['record']);
    expect((await h.repo.getLevel(6)).source).toBe('pack');
    expect(h.repo.peekLevel(5)).toBeNull();
  });

  it('an invalid bundled pack never crashes: substitutes for its levels, the tutorial still works', async () => {
    const h = harness({ bundled: { v: 2 } });
    expect((await h.repo.getLevel(1)).source).toBe('tutorial');
    expect((await h.repo.getLevel(2)).source).toBe('substitute');
    expect(h.fallbacks).toEqual(['pack_invalid']);
    expect(h.loads).toEqual([]);
  });

  it('a throwing analytics hook does not break loading', async () => {
    const h = harness({ packs: { 1: [null] }, throwingFallback: true });
    expect((await h.repo.getLevel(4)).source).toBe('substitute');
  });

  it('rejects bad level numbers', async () => {
    const h = harness();
    await expect(h.repo.getLevel(0)).rejects.toThrow(RangeError);
    await expect(h.repo.getLevel(2.5)).rejects.toThrow(RangeError);
  });

  it('ensurePackFor resolves (never rejects) and loads the pack holding L', async () => {
    const ok = harness();
    await ok.repo.ensurePackFor(2);
    expect(ok.loads).toEqual([]);
    await ok.repo.ensurePackFor(7);
    expect(ok.loads).toEqual([2]);
    expect(ok.repo.peekLevel(7)?.id).toBe('L7');
    const bad = harness({ packs: { 1: [NET] } });
    await expect(bad.repo.ensurePackFor(4)).resolves.toBeUndefined();
    await expect(bad.repo.ensurePackFor(12)).resolves.toBeUndefined(); // endless: nothing to load
  });
});

describe('endless levels (02 §11.4)', () => {
  it('generated from the level seed, cached in memory, Hard flag from the level number', async () => {
    const h = harness();
    const l10 = await h.repo.getLevel(10);
    expect(l10.source).toBe('generated');
    expect(l10.puzzle).toMatchObject({ id: 'L10', hard: true }); // hardFrom 9, every 10 in this config
    expect(h.specs).toEqual([endlessSpec(10, C)]);
    expect((await h.repo.getLevel(10)).puzzle).toBe(l10.puzzle);
    expect(h.repo.peekLevel(10)).toBe(l10.puzzle);
    expect(h.specs).toHaveLength(1);
    expect((await h.repo.getLevel(13)).puzzle.hard).toBe(false);
  });

  it('after max_attempts, retries once with the widened :r1 spec', async () => {
    const h = harness({ gen: (_s, call) => (call === 1 ? failGen() : okGen()) });
    expect((await h.repo.getLevel(11)).source).toBe('generated');
    expect(h.specs).toEqual([endlessSpec(11, C), endlessRetrySpec(endlessSpec(11, C))]);
  });

  it('when both attempts fail the promise rejects (generate fallback logged) and a later call tries again', async () => {
    let fail = true;
    const h = harness({ gen: () => (fail ? failGen() : okGen()) });
    await expect(h.repo.getLevel(12)).rejects.toThrow();
    expect(h.fallbacks).toEqual(['generate']);
    fail = false;
    expect((await h.repo.getLevel(12)).source).toBe('generated');
  });

  it('a worker crash (generate rejects) surfaces as a rejection', async () => {
    const h = harness({ packs: { 1: [null] }, gen: () => new Error('worker died') });
    await expect(h.repo.getLevel(4)).rejects.toThrow('worker died');
    expect(h.fallbacks).toEqual(['pack_missing', 'generate']);
  });

  it('prefetch loads upcoming packs and generates the next endless level in the background', async () => {
    const h = harness();
    h.repo.prefetch(3); // pack 1 starts at 4; prefetchAhead 1
    await Promise.resolve();
    expect(h.loads).toEqual([1]);
    h.repo.prefetch(9);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(h.specs).toEqual([endlessSpec(10, C)]);
    expect((await h.repo.getLevel(10)).source).toBe('generated');
    expect(h.specs).toHaveLength(1);
  });
});

describe('dailies (02 §12)', () => {
  const month = (days: Record<string, unknown>, m = '2026-10'): unknown => ({ v: 1, kind: 'daily', month: m, gen: 'test', days });

  it('served from the month pack, one fetch per month, cached per date', async () => {
    const h = harness({ daily: { '2026-10': [month({ '2026-10-06': rec5(), '2026-10-07': rec5() })] } });
    const d = await h.repo.getDaily('2026-10-06');
    expect(d.source).toBe('daily_pack');
    expect(d.puzzle.id).toBe('D2026-10-06');
    expect(await h.repo.getDaily('2026-10-06')).toBe(d);
    expect((await h.repo.getDaily('2026-10-07')).source).toBe('daily_pack');
    expect(h.months).toEqual(['2026-10']);
    expect(h.specs).toEqual([]);
  });

  it('a missing month (or date) is generated from the daily seed', async () => {
    const h = harness({ daily: { '2026-11': [month({}, '2026-11')] } });
    const d = await h.repo.getDaily('2027-03-02');
    expect(d.source).toBe('generated');
    expect(d.puzzle).toMatchObject({ id: 'D2027-03-02', hard: false });
    expect(h.specs).toEqual([dailySpec('2027-03-02', C)]);
    expect((await h.repo.getDaily('2026-11-30')).source).toBe('generated');
    expect(h.fallbacks).toEqual([]);
  });

  it('an invalid month file or a corrupt record is logged and generated instead', async () => {
    const h = harness({
      daily: { '2026-10': [month({ '2026-10-06': { ...rec5(), r: 'nope' } })], '2026-12': [{ v: 1, kind: 'daily' }] },
    });
    expect((await h.repo.getDaily('2026-10-06')).source).toBe('generated');
    expect((await h.repo.getDaily('2026-12-25')).source).toBe('generated');
    expect(h.fallbacks).toEqual(['daily_record', 'daily_invalid']);
  });

  it('network failures are retried, then the board is generated; the month is fetched again next time', async () => {
    const h = harness({ daily: { '2026-10': [NET, NET, NET, month({ '2026-10-08': rec5() })] } });
    expect((await h.repo.getDaily('2026-10-07')).source).toBe('generated');
    expect(h.delays).toEqual([500, 2000]);
    expect(h.fallbacks).toEqual(['daily_fetch']);
    expect((await h.repo.getDaily('2026-10-08')).source).toBe('daily_pack');
    expect(h.months).toEqual(['2026-10', '2026-10', '2026-10', '2026-10']);
  });

  it('rejects a malformed date key', async () => {
    await expect(harness().repo.getDaily('2026-10-6')).rejects.toThrow(RangeError);
  });
});

describe('Vite asset wiring (level-assets.ts)', () => {
  it('pack-000 is bundled and starts with the tutorial record', () => {
    expect(isLevelPack(BUNDLED_PACK)).toBe(true);
    expect(BUNDLED_PACK.first).toBe(1);
    expect(BUNDLED_PACK.levels[0]).toMatchObject({ r: TUTORIAL_RECORD.r, s: TUTORIAL_RECORD.s, tut: 1 });
  });

  it('pack-000 is never a fetched asset; absent files have no URL', () => {
    const { packs, months } = availableAssets();
    expect(packs).not.toContain(0);
    expect(packUrl(0)).toBeNull();
    expect(packUrl(4242)).toBeNull();
    expect(dailyMonthUrl('1999-01')).toBeNull();
    for (const k of packs) expect(typeof packUrl(k)).toBe('string');
    for (const m of months) expect(typeof dailyMonthUrl(m)).toBe('string');
  });

  it('loaders resolve null for absent files without fetching, and fetch present ones by URL', async () => {
    const urls: string[] = [];
    const loaders = createAssetLoaders((url) => {
      urls.push(url);
      return Promise.resolve({ fetched: url });
    });
    expect(loaders.bundled).toBe(BUNDLED_PACK);
    await expect(loaders.loadPack(4242)).resolves.toBeNull();
    await expect(loaders.loadDailyMonth('1999-01')).resolves.toBeNull();
    expect(urls).toEqual([]);
    const { packs } = availableAssets();
    if (packs.length > 0) {
      const k = packs[0] as number;
      await expect(loaders.loadPack(k)).resolves.toEqual({ fetched: packUrl(k) });
    }
  });

  it('the real bundled pack decodes through the repo (first and last level of pack 000)', async () => {
    const repo = createLevelsRepo({
      ...createAssetLoaders(() => Promise.reject(new Error('offline'))),
      generate: () => Promise.reject(new Error('no worker in this test')),
      delay: () => Promise.resolve(),
    });
    const last = BUNDLED_PACK.first + BUNDLED_PACK.levels.length - 1;
    for (const level of [2, last]) {
      const got = await repo.getLevel(level);
      expect(got.source).toBe('pack');
      expect(got.puzzle.id).toBe(`L${level}`);
    }
  });
});
