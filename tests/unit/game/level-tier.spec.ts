// UI batch (2026-10-13): levelbutton — the level tiers normal | hard | extra (game/ramp.ts levelTier, isExtraHardBoard).
import { describe, expect, it } from 'vitest';
import { cfg, mergeConfig } from '../../../src/app/config';
import { EXTRA_HARD_LEVELS } from '../../../src/game/level-tiers';
import { isExtraHardBoard, isHardLevel, levelTier } from '../../../src/game/ramp';

describe('isExtraHardBoard', () => {
  it.each([
    [{ grade: 5, effort: 10 }, true], // our hardest technique, whatever the effort
    [{ grade: 4, effort: 90 }, true], // the threshold itself
    [{ grade: 4, effort: 89 }, false],
    [{ grade: 3, effort: 145 }, true],
    [{ grade: 1, effort: 0 }, false],
  ])('%o → %s', (board, extra) => {
    expect(cfg.levels.extraHardMinEffort).toBe(90);
    expect(isExtraHardBoard(board)).toBe(extra);
  });

  it('follows levels.extraHardMinEffort', () => {
    expect(isExtraHardBoard({ grade: 4, effort: 60 }, mergeConfig({ levels: { extraHardMinEffort: 60 } }))).toBe(true);
    expect(isExtraHardBoard({ grade: 4, effort: 100 }, mergeConfig({ levels: { extraHardMinEffort: 101 } }))).toBe(false);
  });
});

describe('levelTier', () => {
  it.each([
    [1, 'normal'], [29, 'normal'], [30, 'hard'], [40, 'hard'], [139, 'normal'], [140, 'extra'], [150, 'hard'],
    [340, 'extra'], [341, 'normal'], [1000, 'hard'], [940, 'extra'],
  ] as const)('shipped level %i (from the generated list) → %s', (level, tier) => {
    expect(levelTier(level)).toBe(tier);
  });

  it('a known board decides for a Hard level (a substitute board, an endless board)', () => {
    expect(levelTier(140, cfg, { grade: 4, effort: 40 })).toBe('hard'); // the list says extra, the board in hand does not
    expect(levelTier(150, cfg, { grade: 5, effort: 40 })).toBe('extra');
    expect(levelTier(1010, cfg, { grade: 4, effort: 120 })).toBe('extra');
    expect(levelTier(1010, cfg, { grade: 4, effort: 70 })).toBe('hard');
    expect(levelTier(1010, cfg, null)).toBe('hard'); // endless, board not generated yet: never more than Hard
  });

  it('a level that is not Hard is never extra, whatever its board', () => {
    expect(levelTier(141, cfg, { grade: 5, effort: 200 })).toBe('normal');
    expect(levelTier(1011, cfg, { grade: 5, effort: 200 })).toBe('normal');
  });

  it('the generated list holds Hard levels only, ascending, within the shipped range', () => {
    expect(EXTRA_HARD_LEVELS.length).toBeGreaterThan(0);
    expect([...EXTRA_HARD_LEVELS].sort((a, b) => a - b)).toEqual([...EXTRA_HARD_LEVELS]);
    for (const level of EXTRA_HARD_LEVELS) {
      expect(isHardLevel(level), `L${level}`).toBe(true);
      expect(level).toBeLessThanOrEqual(cfg.levels.shipped);
    }
  });

  it('follows the Hard schedule of the config it is given', () => {
    const c = mergeConfig({ levels: { hardFrom: 9, hardEvery: 3 } });
    expect(levelTier(9, c)).toBe('hard');
    expect(levelTier(10, c)).toBe('normal');
    expect(levelTier(12, c, { grade: 5, effort: 1 })).toBe('extra');
  });
});
