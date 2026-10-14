// UI batch (2026-10-13): levelbutton — the generated Extra-hard list (src/game/level-tiers.ts) against the shipped packs.
// The list saves the runtime a pack load to label the Home button; these checks re-read every pack record, so a pack
// regeneration or a new levels.extraHardMinEffort without `npx tsx scripts/gen-level-tiers.ts` fails here.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cfg } from '../../src/app/config';
import type { LevelPack } from '../../src/engine/types';
import { EXTRA_HARD_LEVELS } from '../../src/game/level-tiers';
import { isHardLevel, levelTier } from '../../src/game/ramp';
import { levelTiersSource } from '../../scripts/gen-level-tiers';

const DATA = new URL('../../src/data/', import.meta.url);
const packFiles = readdirSync(new URL('levels/', DATA)).filter((f) => /^pack-\d{3}\.json$/.test(f)).sort();
const records = packFiles.flatMap((f) => {
  const pack = JSON.parse(readFileSync(new URL(`levels/${f}`, DATA), 'utf8')) as LevelPack;
  return pack.levels.map((rec, q) => ({ level: rec.i ?? pack.first + q, g: rec.g, e: rec.e, h: rec.h }));
});

describe('level tiers of the shipped levels (UI batch 2026-10-13)', () => {
  it('the list is exactly the Hard levels whose own record is G5 or has effort ≥ levels.extraHardMinEffort', () => {
    expect(records).toHaveLength(cfg.levels.shipped);
    const want = records
      .filter((r) => r.h === 1 && (r.g === 5 || r.e >= cfg.levels.extraHardMinEffort))
      .map((r) => r.level)
      .sort((a, b) => a - b);
    expect([...EXTRA_HARD_LEVELS]).toEqual(want);
    // every G5 board ships on a Hard level, and every one of them is Extra hard
    for (const r of records.filter((x) => x.g === 5)) expect(EXTRA_HARD_LEVELS, `L${r.level}`).toContain(r.level);
  });

  it('roughly a quarter to a third of the Hard levels are Extra hard (the threshold\'s intent)', () => {
    const hard = records.filter((r) => r.h === 1).length;
    const share = EXTRA_HARD_LEVELS.length / hard;
    expect(share).toBeGreaterThanOrEqual(0.25);
    expect(share).toBeLessThanOrEqual(0.35);
  });

  it('levelTier without the board (the list) agrees with levelTier from the board, for every shipped level', () => {
    const bad: string[] = [];
    for (const r of records) {
      const fromList = levelTier(r.level);
      const fromBoard = levelTier(r.level, cfg, { grade: r.g, effort: r.e });
      if (fromList !== fromBoard) bad.push(`L${r.level}: ${fromList} ≠ ${fromBoard}`);
      if ((fromList !== 'normal') !== isHardLevel(r.level)) bad.push(`L${r.level}: tier ${fromList}, hard ${isHardLevel(r.level)}`);
    }
    expect(bad).toEqual([]);
  });

  it('src/game/level-tiers.ts is what scripts/gen-level-tiers.ts writes today', () => {
    const file = readFileSync(new URL('../../src/game/level-tiers.ts', import.meta.url), 'utf8');
    expect(file).toBe(levelTiersSource(fileURLToPath(DATA).replace(/[\\/]$/, '')));
  });
});
