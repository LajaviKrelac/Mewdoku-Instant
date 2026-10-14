// UI batch (2026-10-13): messages — the approximate per-board odds behind ticker.odds.* (spec §0.4 H-2a): rounded,
// bounded, deterministic, harder boards never look easier, and the calibration the model's header states holds over
// the levels and dailies we ship (re-read from the packs, so a regenerated pack that shifts it fails here).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { LevelRecord } from '../../../src/engine/types';
import { firstTryShare, levelOdds, ODDS_MODEL, roundPct, type OddsInput } from '../../../src/game/level-odds';

const DATA = fileURLToPath(new URL('../../../src/data/', import.meta.url));
const read = (f: string): unknown => JSON.parse(readFileSync(f, 'utf8'));
const levels = (): LevelRecord[] =>
  readdirSync(join(DATA, 'levels'))
    .filter((f) => /^pack-\d{3}\.json$/.test(f))
    .flatMap((f) => (read(join(DATA, 'levels', f)) as { levels: LevelRecord[] }).levels)
    .filter((r) => !r.tut);
const dailies = (): LevelRecord[] =>
  readdirSync(join(DATA, 'daily'))
    .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
    .flatMap((f) => Object.values((read(join(DATA, 'daily', f)) as { days: Record<string, LevelRecord> }).days));
const board = (r: LevelRecord): OddsInput => ({ grade: r.g, effort: r.e, n: r.n, hard: r.h === 1 });
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;

describe('levelOdds (game/level-odds.ts)', () => {
  it('rounds a percentage to 5 inside 5…95 (never "nobody" or "everyone") and tries to a half', () => {
    expect([0, 0.01, 0.024, 0.026, 0.5, 0.674, 0.676, 0.99, 1, 2, -1].map(roundPct)).toEqual([5, 5, 5, 5, 50, 65, 70, 95, 95, 95, 5]);
    for (const grade of [1, 2, 3, 4, 5]) {
      for (let effort = 0; effort <= 200; effort += 7) {
        for (const n of [4, 8, 12]) {
          for (const hard of [false, true]) {
            const o = levelOdds({ grade, effort, n, hard });
            for (const pct of [o.firstTryPct, o.retryPct]) {
              expect(pct % 5).toBe(0);
              expect(pct).toBeGreaterThanOrEqual(5);
              expect(pct).toBeLessThanOrEqual(95);
            }
            expect(o.retryPct).toBeGreaterThanOrEqual(o.firstTryPct); // a retry keeps what was learnt
            expect((o.tries * 2) % 1).toBe(0);
            expect(o.tries).toBeGreaterThanOrEqual(1);
            expect(o.tries).toBeLessThanOrEqual(3);
          }
        }
      }
    }
  });

  it('is deterministic and never says a harder board is easier (more effort, a higher grade, a larger board, Hard)', () => {
    const b: OddsInput = { grade: 4, effort: 90, n: 10, hard: true };
    expect(levelOdds(b)).toEqual(levelOdds({ ...b }));
    const p = firstTryShare(b);
    expect(firstTryShare({ ...b, effort: 120 })).toBeLessThan(p);
    expect(firstTryShare({ ...b, grade: 5 })).toBeLessThan(p);
    expect(firstTryShare({ ...b, n: 12 })).toBeLessThan(p);
    expect(firstTryShare({ ...b, hard: false })).toBeGreaterThan(p);
    for (let e = 0; e < 200; e++) expect(firstTryShare({ ...b, effort: e + 1 })).toBeLessThanOrEqual(firstTryShare({ ...b, effort: e }));
    // A broken record never yields NaN.
    const odd = levelOdds({ grade: Number.NaN, effort: Number.NaN, n: Number.NaN, hard: false });
    expect(Number.isFinite(odd.firstTryPct) && Number.isFinite(odd.retryPct) && Number.isFinite(odd.tries)).toBe(true);
  });

  it('the model\'s weights are the documented ones (a change is a copy change: re-check the calibration below)', () => {
    expect(ODDS_MODEL).toEqual({ base: 0.94, effortFrom: 30, effortSpan: 110, effortDrop: 0.52, perGrade: 0.04, g5: 0.06, hard: 0.1, perSize: 0.012, floor: 0.2, ceil: 0.96, learn: 0.3 });
  });

  it('calibration over our shipped levels and dailies (the header\'s numbers)', () => {
    const ls = levels();
    expect(ls.length).toBeGreaterThan(900);
    const normal = ls.filter((r) => r.h !== 1).map((r) => levelOdds(board(r)).firstTryPct);
    const hard = ls.filter((r) => r.h === 1 && r.g < 5).map((r) => levelOdds(board(r)).firstTryPct);
    const g5 = ls.filter((r) => r.g === 5).map((r) => levelOdds(board(r)).firstTryPct);
    expect(Math.min(...normal)).toBeGreaterThanOrEqual(30);
    expect(Math.max(...normal)).toBe(95);
    expect(median(normal)).toBe(70);
    // Most Hard levels: 45–65 %; the what-if (G5) boards: 20–45 %.
    expect(hard.filter((p) => p >= 45 && p <= 65).length / hard.length).toBeGreaterThan(0.7);
    expect(median(hard)).toBeLessThan(median(normal));
    expect(g5.length).toBeGreaterThan(0);
    for (const p of g5) expect(p >= 20 && p <= 45, String(p)).toBe(true);
    // About a fifth of the normal levels (and of the dailies) count as tough at the shipped threshold (55).
    const tough = normal.filter((p) => p <= 55).length / normal.length;
    expect(tough).toBeGreaterThan(0.1);
    expect(tough).toBeLessThan(0.25);
    const ds = dailies().map((r) => levelOdds(board(r)).firstTryPct);
    expect(ds.length).toBeGreaterThan(300);
    expect(ds.filter((p) => p <= 55).length / ds.length).toBeLessThan(0.2);
  });
});
