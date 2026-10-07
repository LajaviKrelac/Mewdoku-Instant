// Owner: content
// Property tests over the shipped content (03 §11.2): every record in src/data/levels/*.json and
// src/data/daily/*.json. Checks are written against the engine and game/ramp.ts directly (not via
// scripts/verify-levels.ts), so the CI script and these tests are independent witnesses.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cfg } from '../../src/app/config';
import { checkRecord, decodeRegions, decodeSolution, isDailyPack, isLevelPack, recordToPuzzle } from '../../src/engine/codec';
import { assignColors, regionAdjacency } from '../../src/engine/colors';
import { canonicalKey, shapeOk } from '../../src/engine/filters';
import { grade } from '../../src/engine/grader';
import { bruteForceCount } from '../../src/engine/solver-oracle';
import { countSolutions } from '../../src/engine/solver';
import type { DailyPack, Grade, GradeBand, LevelPack, LevelRecord, PackManifest, PuzzleId, SizeWeight } from '../../src/engine/types';
import { createLevelsRepo } from '../../src/game/levels-repo';
import {
  allowG5Steps,
  bandFor,
  breatherBand,
  breatherPool,
  dailySlotFor,
  isHardLevel,
  RAMP,
  rampRowFor,
  shapeLimits,
} from '../../src/game/ramp';
import { TUTORIAL_RECORD } from '../../src/game/tutorial';
import { PALETTE_DE00 } from '../../src/ui/art/palette';

const DATA = new URL('../../src/data/', import.meta.url);
const read = (rel: string): Buffer => readFileSync(new URL(rel, DATA));
const json = (rel: string): unknown => JSON.parse(read(rel).toString('utf8')) as unknown;

const manifest = json('levels/manifest.json') as PackManifest;
const levelFiles = readdirSync(new URL('levels/', DATA)).filter((f) => /^pack-\d{3}\.json$/.test(f)).sort();
const dailyFiles = readdirSync(new URL('daily/', DATA)).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort();
const levelPacks = levelFiles.map((f) => json(`levels/${f}`) as LevelPack);
const dailyPacks = dailyFiles.map((f) => json(`daily/${f}`) as DailyPack);
const levels: LevelRecord[] = levelPacks.flatMap((p) => p.levels);
const dailies: [string, LevelRecord][] = dailyPacks.flatMap((p) => Object.entries(p.days));

/** The 02 §11.2 slot rules for level L (independent of scripts/level-schedule.ts). */
function slotRules(level: number): { band: GradeBand; pool: readonly SizeWeight[]; hard: boolean; breather: boolean } {
  const row = rampRowFor(level);
  const hard = isHardLevel(level);
  const breather = !hard && level > 1 && isHardLevel(level - 1);
  const band = bandFor(row, hard);
  return { hard, breather, band: breather ? breatherBand(band) : band, pool: breather ? breatherPool(row.sizes) : row.sizes };
}

interface Item {
  readonly id: PuzzleId;
  readonly rec: LevelRecord;
  readonly band: GradeBand;
  readonly limits: { minRegion: number; maxRegion: number };
}

const items: Item[] = [
  ...levels.map((rec, q): Item => {
    const level = q + 1;
    const n = typeof rec.n === 'number' ? rec.n : 0;
    return { id: `L${level}`, rec, band: slotRules(level).band, limits: shapeLimits(n, level, level === 1) };
  }),
  ...dailies.map(([date, rec]): Item => ({ id: `D${date}`, rec, band: dailySlotFor(date).band, limits: shapeLimits(rec.n, null) })),
];

/** Runs `check` on every item and returns "id: message" for each failure (one assertion per property). */
function failures(check: (it: Item, regions: Uint8Array) => string | null): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (!checkRecord(item.rec).ok) continue; // reported by the structure test
    const msg = check(item, decodeRegions(item.rec.r, item.rec.n));
    if (msg !== null) out.push(`${item.id}: ${msg}`);
  }
  return out;
}

describe('shipped content (03 §11.2)', () => {
  it('has 1 000 levels in 10 packs and every daily month 2026-10…2028-12', () => {
    expect(levelFiles).toEqual(Array.from({ length: 10 }, (_, k) => `pack-${String(k).padStart(3, '0')}.json`));
    expect(levels).toHaveLength(cfg.levels.shipped);
    const months: string[] = [];
    for (let y = 2026, m = 10; y < 2029; m === 12 ? ((y += 1), (m = 1)) : (m += 1)) months.push(`${y}-${String(m).padStart(2, '0')}`);
    expect(dailyFiles).toEqual(months.map((m) => `${m}.json`));
  });

  it('1. every record decodes and passes the 03 §9.4 structural check; containers are well-formed', () => {
    const bad = items.map((i) => [i.id, checkRecord(i.rec)] as const).filter(([, c]) => !c.ok);
    expect(bad).toEqual([]);
    levelPacks.forEach((p, k) => {
      expect(isLevelPack(p)).toBe(true);
      expect(p).toMatchObject({ v: 1, kind: 'levels', first: k * cfg.levels.packSize + 1, count: p.levels.length, gen: cfg.gen.version });
    });
    dailyPacks.forEach((p, k) => {
      expect(isDailyPack(p)).toBe(true);
      expect(p.month).toBe(dailyFiles[k]?.slice(0, 7));
      const [y, m] = p.month.split('-').map(Number) as [number, number];
      const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      expect(Object.keys(p.days).sort()).toEqual(Array.from({ length: days }, (_, d) => `${p.month}-${String(d + 1).padStart(2, '0')}`));
    });
  });

  it('2. exactly one solution, and it equals s', () => {
    expect(
      failures(({ rec }, regions) => {
        const res = countSolutions(rec.n, regions, 2);
        if (res.count !== 1) return `${res.count} solutions`;
        return res.solutions[0]?.join() === decodeSolution(rec.s, rec.n).join() ? null : 'solution differs from s';
      }),
    ).toEqual([]);
  });

  it('3. for N ≤ 9 an independent brute-force count is also exactly 1', () => {
    expect(failures(({ rec }, regions) => (rec.n > 9 || bruteForceCount(rec.n, regions, 2) === 1 ? null : 'brute force ≠ 1'))).toEqual([]);
  });

  it('4. grade and effort reproduce; g is inside the slot band; G5 at most once and only where allowed', () => {
    expect(
      failures(({ rec, band }, regions) => {
        const g = grade(rec.n, regions);
        if (g.grade !== rec.g || g.effort !== rec.e) return `stored g${rec.g}/e${rec.e}, grader g${g.grade}/e${g.effort}`;
        if (rec.g < band[0] || rec.g > band[1]) return `g${rec.g} outside G${band[0]}–G${band[1]}`;
        return g.counts[5] <= allowG5Steps(band) ? null : `${g.counts[5]} trial steps`;
      }),
    ).toEqual([]);
  });

  it('5. solvable without guessing up to its rating, and the rating is tight', () => {
    expect(
      failures(({ rec }, regions) => {
        if (grade(rec.n, regions, { maxLevel: rec.g }).grade === 6) return 'stuck at maxLevel = g';
        if (rec.g > 1 && grade(rec.n, regions, { maxLevel: (rec.g - 1) as Grade }).grade !== 6) return 'solvable at g − 1';
        return null;
      }),
    ).toEqual([]);
  });

  it('6. shape filters hold (min region from N ≥ 6 past level 6, max ⌈2.5 N⌉)', () => {
    expect(failures(({ rec, limits }, regions) => (shapeOk(rec.n, regions, limits) ? null : 'shape filter'))).toEqual([]);
  });

  it('7. no canonical-key duplicates across all level and daily packs', () => {
    const seen = new Map<string, string>();
    const dups = failures(({ id, rec }, regions) => {
      const key = canonicalKey(rec.n, regions);
      const prev = seen.get(key);
      seen.set(key, id);
      return prev ? `same board as ${prev}` : null;
    });
    expect(dups).toEqual([]);
    expect(seen.size).toBe(items.length);
  });

  it('8. numbering, tutorial, hard schedule, sizes, breathers and no three equal sizes in a row', () => {
    const bad: string[] = [];
    levels.forEach((rec, q) => {
      const level = q + 1;
      const rule = slotRules(level);
      if (rec.i !== level) bad.push(`L${level}: i=${rec.i}`);
      if (rec.h !== (rule.hard ? 1 : 0)) bad.push(`L${level}: h=${rec.h}`);
      if (!rule.pool.some(([n]) => n === rec.n)) bad.push(`L${level}: n=${rec.n} not in ${rule.pool.map(([n]) => n).join('/')}`);
      if (rule.breather && (rec.g !== rule.band[0] || rec.n > Math.max(...breatherPool(rampRowFor(level).sizes).map(([n]) => n)))) bad.push(`L${level}: breather g${rec.g} n${rec.n}`);
      if (level > 1 && (rec.tut === 1 || (rec.gv ?? '') !== '')) bad.push(`L${level}: tut/gv on a normal level`);
      const a = levels[q - 2];
      const b = levels[q - 1];
      if (a && b && a.n === rec.n && b.n === rec.n && rule.pool.some(([n]) => n !== rec.n)) bad.push(`L${level}: three ${rec.n}×${rec.n} in a row`);
    });
    expect(bad).toEqual([]);
    expect(levels[0]).toEqual({ ...TUTORIAL_RECORD });
    expect(levels.filter((r) => r.h === 1)).toHaveLength(Array.from({ length: 1000 }, (_, k) => k + 1).filter((L) => isHardLevel(L)).length);
    for (const [date, rec] of dailies) {
      expect.soft(rec.n, date).toBe(dailySlotFor(date).n);
      expect.soft({ i: rec.i, h: rec.h, tut: rec.tut }, date).toEqual({ i: undefined, h: 0, tut: undefined });
    }
  });

  it('effort rises inside each ramp row (03 §8.3): rank correlation ≥ 0.9 on rows with ≥ 40 sortable levels', () => {
    for (const row of RAMP) {
      const es: number[] = [];
      for (let L = Math.max(row.from, 2); L <= row.to; L++) {
        const rule = slotRules(L);
        if (!rule.hard && !rule.breather) es.push((levels[L - 1] as LevelRecord).e);
      }
      if (es.length < 40) continue;
      const rank = es.map((e, k) => [e, k] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let d2 = 0;
      rank.forEach(([, k], r) => (d2 += (r - k) ** 2));
      const rho = 1 - (6 * d2) / (es.length * (es.length ** 2 - 1));
      expect(rho, `levels ${row.from}–${row.to}`).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('9. the manifest lists every file with a matching SHA-256', () => {
    const sha = (rel: string): string => createHash('sha256').update(read(rel)).digest('hex');
    expect(manifest).toMatchObject({ v: 1, gen: cfg.gen.version });
    expect(manifest.packs.map((p) => p.file)).toEqual(levelFiles.map((f) => `levels/${f}`));
    expect(manifest.daily.map((d) => d.file)).toEqual(dailyFiles.map((f) => `daily/${f}`));
    for (const p of manifest.packs) expect(p.sha256, p.file).toBe(sha(p.file));
    for (const d of manifest.daily) expect(d.sha256, d.file).toBe(sha(d.file));
    manifest.packs.forEach((p, k) => expect([p.first, p.count]).toEqual([levelPacks[k]?.first, levelPacks[k]?.count]));
  });

  it('colours: distinct per board and adjacent regions ≥ ΔE 10 on every shipped record (03 §11.1)', () => {
    expect(
      failures(({ id, rec }, regions) => {
        const colors = assignColors({ id, n: rec.n, regions }, PALETTE_DE00);
        if (new Set(colors).size !== rec.n) return 'colours not distinct';
        const adj = regionAdjacency(rec.n, regions);
        for (let g = 0; g < rec.n; g++) {
          for (let h = g + 1; h < rec.n; h++) {
            if (((adj[g] as number) >> h) & 1 && (PALETTE_DE00[(colors[g] as number) * 12 + (colors[h] as number)] as number) < 1000) return `regions ${g}/${h} ΔE < 10`;
          }
        }
        return null;
      }),
    ).toEqual([]);
  });

  it('the runtime levels repo serves every level and sampled dailies from these files (no substitutes)', async () => {
    const byMonth = new Map(dailyPacks.map((p) => [p.month, p]));
    const fallbacks: string[] = [];
    const repo = createLevelsRepo({
      bundled: levelPacks[0] as LevelPack,
      loadPack: (k) => Promise.resolve(levelPacks[k] ?? null),
      loadDailyMonth: (m) => Promise.resolve(byMonth.get(m) ?? null),
      generate: () => Promise.reject(new Error('no generation expected')),
      delay: () => Promise.resolve(),
      onFallback: (where) => void fallbacks.push(where),
    });
    for (let L = 2; L <= cfg.levels.shipped; L++) {
      const { puzzle, source } = await repo.getLevel(L);
      expect.soft(source, `L${L}`).toBe('pack');
      expect.soft(puzzle.hard, `L${L}`).toBe(isHardLevel(L));
    }
    for (const [date, rec] of dailies.filter((_, k) => k % 7 === 0)) {
      const { puzzle, source } = await repo.getDaily(date);
      expect.soft(source, date).toBe('daily_pack');
      expect.soft(puzzle.id).toBe(`D${date}`);
      expect.soft(puzzle).toEqual(recordToPuzzle(rec, `D${date}`));
    }
    expect(fallbacks).toEqual([]);
  });
});
