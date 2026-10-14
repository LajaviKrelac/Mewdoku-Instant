// UI batch (2026-10-13): victory — the solve-time estimate behind "faster than about N%" (spec §0.4 H-2a). Our model:
// log-normal solve times around a median per board size and grade; deterministic; percentages floored to the step
// and clamped, so a shown number is never more precise (or more flattering) than the model.
import { describe, expect, it } from 'vitest';
import { cfg, mergeConfig } from '../../../src/app/config';
import { medianSolveMs, modelFasterThan, normalCdf, shownPct } from '../../../src/game/solve-time-model';

const board = (n: number, grade = 3, hard = false) => ({ n, grade, hard });

describe('solve-time model (victory estimate)', () => {
  it('Φ is the standard normal CDF (to 1e-6)', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 6);
    expect(normalCdf(-1.959964)).toBeCloseTo(0.025, 6);
    expect(normalCdf(1)).toBeCloseTo(0.841345, 6);
    for (const z of [-3, -1.2, -0.3, 0.7, 2.5]) expect(normalCdf(z) + normalCdf(-z)).toBeCloseTo(1, 9);
  });

  it('the median grows with the board size, the grade and a Hard level; out-of-table inputs use the nearest row', () => {
    const m = cfg.victory.model;
    expect(medianSolveMs(board(4))).toBe(m.medianSec[0]! * 1000);
    expect(medianSolveMs(board(9))).toBe(m.medianSec[5]! * 1000);
    for (let n = 5; n <= 12; n++) expect(medianSolveMs(board(n))).toBeGreaterThan(medianSolveMs(board(n - 1)));
    for (let g = 2; g <= 5; g++) expect(medianSolveMs(board(9, g))).toBeGreaterThan(medianSolveMs(board(9, g - 1)));
    expect(medianSolveMs(board(9, 3, true))).toBeGreaterThan(medianSolveMs(board(9, 3, false)));
    expect(medianSolveMs(board(2))).toBe(medianSolveMs(board(4)));
    expect(medianSolveMs(board(30))).toBe(medianSolveMs(board(12)));
    expect(medianSolveMs(board(9, 9))).toBe(medianSolveMs(board(9, 5)));
    expect(medianSolveMs(board(9, 0))).toBe(medianSolveMs(board(9, 1)));
  });

  it('"faster than": 50 at the median, more when quicker, never below 0 or above 100, deterministic', () => {
    const b = board(8, 4);
    const med = medianSolveMs(b);
    expect(modelFasterThan(med, b)).toBeCloseTo(50, 5);
    let prev = 101;
    for (const f of [0.2, 0.5, 0.8, 1, 1.5, 3, 10]) {
      const pct = modelFasterThan(med * f, b);
      expect(pct).toBeLessThan(prev);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
      prev = pct;
    }
    expect(modelFasterThan(0, b)).toBe(0);
    expect(modelFasterThan(Number.NaN, b)).toBe(0);
    expect(modelFasterThan(91_000, b)).toBe(modelFasterThan(91_000, b));
    // A wider spread pulls the same time toward 50.
    const wide = mergeConfig({ victory: { model: { sigma: 2 } } });
    expect(modelFasterThan(med / 2, b, wide)).toBeLessThan(modelFasterThan(med / 2, b));
  });

  it('a shown percentage is floored to the step and clamped to [min, max]', () => {
    expect(shownPct(73.9)).toBe(70);
    expect(shownPct(75)).toBe(75);
    expect(shownPct(99.9)).toBe(cfg.victory.model.maxPct);
    expect(shownPct(0.4)).toBe(cfg.victory.model.minPct);
    expect(shownPct(Number.NaN)).toBe(cfg.victory.model.minPct);
    for (let raw = 0; raw <= 100; raw += 3.7) expect(shownPct(raw) % cfg.victory.model.stepPct).toBe(0);
    expect(shownPct(73.9, mergeConfig({ victory: { model: { stepPct: 10 } } }))).toBe(70);
  });
});
