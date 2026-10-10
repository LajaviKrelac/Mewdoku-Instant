// Owner: G1 (Phase 2c.1). Replaces streak-session.spec.ts (the cross-level perfect streak is retired).
// Level points in the session (docs/phase2c/fish-lives-spec.md §3.2.3, §3.2.5, §10.4, §10.5, §10.8):
// the running total and the cat run live in GameState and are written into the in-progress slot in the
// same store update as the board, so Home and a reload resume them exactly; a scoring cat's
// announcement ends with the running total in ONE utterance; the game view carries the total (null
// where nothing scores); the win's level points are the attempt's total (shown counted or not, added
// to points.total only when the win counts); win_points has `points` and `run`; save.streak is never
// written.
import { describe, expect, it } from 'vitest';
import { migrate } from '../../../src/game/save';
import type { AppState } from '../../../src/app/store';
import type { SaveData } from '../../../src/game/types';
import { createHarness, last, loseGame, NOW, SOL5, startLevel, tapRanking, TODAY, winGame, WRONG5, type Harness } from './harness';

const C = (h: Harness, r: number): void => h.session.onCellDoubleTap(SOL5[r] as number);

async function mistake(h: Harness, k = 0): Promise<void> {
  h.session.onCellDoubleTap(WRONG5[k] as number);
  await h.settle(h.config.input.cellLockAfterCatMs);
}

const atLevel20 = (s: SaveData): SaveData => ({ ...s, progress: { level: 20, completed: 19, best: {} } });

describe('level points in the session (phase2c.1 §3.2.5)', () => {
  it('every scoring cat raises the running total in the game state and the game view (576, 1 248, 2 016)', async () => {
    const h = createHarness();
    await startLevel(h);
    expect(h.game()).toMatchObject({ levelPoints: 0, catStreak: 0 });
    expect(h.router.game?.last.points).toBe(0); // F5.1: the counter starts at 0
    const totals: (number | null | undefined)[] = [];
    for (const r of [0, 1, 2]) {
      C(h, r);
      totals.push(h.router.game?.last.points);
    }
    expect(totals).toEqual([576, 1_248, 2_016]);
    expect(h.game()).toMatchObject({ levelPoints: 2_016, catStreak: 3 });
    // The screen gets POINTS right after each scoring CAT_PLACED (the HUD counter's roll and "+N").
    expect(h.router.game?.played.slice(0, 3)).toEqual(['CAT_PLACED', 'POINTS', 'REGION_DONE']);
    expect(h.router.game?.played.filter((t) => t === 'POINTS')).toHaveLength(3);
  });

  it('the slot is written with the points in the same store update as the cat: never a board without its points', async () => {
    const h = createHarness();
    await startLevel(h);
    const seen: { game: number; slot: number | undefined; cats: number }[] = [];
    const off = h.store.select(
      (s: AppState) => s,
      (s) => {
        const slot = s.save.inProgress.level;
        if (s.game && slot) seen.push({ game: s.game.levelPoints, slot: slot.points, cats: slot.cells.split('').filter((ch) => ch === '2').length });
      },
    );
    C(h, 0);
    C(h, 1);
    await mistake(h);
    C(h, 2);
    off();
    expect(seen.length).toBeGreaterThan(0);
    // Each stored slot pairs its board with exactly that board's points (576 per cat here would be wrong).
    for (const x of seen) expect(x.slot).toBe([0, 576, 1_248, 1_824][x.cats]);
    expect(h.save().inProgress.level).toMatchObject({ points: 1_824, catStreak: 1, scoredRows: 0b111, mistakes: 1 });
    await h.settle(h.config.save.localDebounceMs);
    const write = last(h.platform.writes);
    expect(write?.data.inProgress.level).toMatchObject({ points: 1_824, catStreak: 1, scoredRows: 0b111, mistakes: 1 });
  });

  it('Home and a reload restore the points and the run exactly (C C M C → 1 824, run 1; the next cat adds 672 → 2 496)', async () => {
    const h = createHarness();
    await startLevel(h);
    C(h, 0);
    C(h, 1);
    await mistake(h);
    C(h, 2);
    h.session.onHome();
    const saved = last(h.platform.writes)?.data;
    expect(saved?.inProgress.level).toMatchObject({ points: 1_824, catStreak: 1 });
    // "Reload": the stored copy goes through migrate again and the level is opened in a new app.
    const reloaded = migrate(JSON.parse(JSON.stringify(saved)) as unknown, NOW + 1000);
    const r = createHarness({ save: () => reloaded });
    await startLevel(r);
    expect(r.game()).toMatchObject({ levelPoints: 1_824, catStreak: 1, scoredRows: 0b111, mistakes: 1, catsPlaced: 3 });
    expect(r.router.game?.last.points).toBe(1_824);
    C(r, 3);
    expect(r.game().levelPoints).toBe(2_496);
    expect(r.router.game?.played).toContain('POINTS');
  });

  it('a slot saved before 2c.1 (no points fields) resumes with the derived lower bound and never more', async () => {
    const h = createHarness();
    await startLevel(h);
    C(h, 0);
    await mistake(h);
    C(h, 1);
    h.session.onHome();
    const saved = JSON.parse(JSON.stringify(last(h.platform.writes)?.data)) as SaveData;
    const slot = saved.inProgress.level as NonNullable<SaveData['inProgress']['level']>;
    delete slot.points;
    delete slot.catStreak;
    delete slot.scoredRows;
    const r = createHarness({ save: () => migrate(saved, NOW + 1000) });
    await startLevel(r);
    expect(r.game()).toMatchObject({ levelPoints: 2 * 576, catStreak: 0, catsPlaced: 2 });
  });

  it('a mistake takes nothing away; the next cat adds 576 again; Retry starts at 0 and saves 0', async () => {
    const h = createHarness({ caps: { rewarded: false, interstitial: false } });
    await startLevel(h);
    C(h, 0);
    C(h, 1);
    await mistake(h, 0);
    expect(h.game()).toMatchObject({ levelPoints: 1_248, catStreak: 0 });
    expect(h.router.game?.last.points).toBe(1_248);
    C(h, 2);
    expect(h.game().levelPoints).toBe(1_824);
    await mistake(h, 1);
    await mistake(h, 2);
    await h.settle(h.config.fx.failOverlayDelayMs);
    expect(h.game()).toMatchObject({ status: 'lost', levelPoints: 1_824 }); // LOST keeps the points
    await h.session.onRetry();
    await h.settle(h.config.fx.boardEntryMs);
    expect(h.game()).toMatchObject({ levelPoints: 0, catStreak: 0, scoredRows: 0 });
    expect(h.router.game?.last.points).toBe(0);
    C(h, 4);
    expect(h.game().levelPoints).toBe(576);
    expect(h.save().inProgress.level).toMatchObject({ points: 576, catStreak: 1, scoredRows: 1 << 4 });
  });

  it('a revive keeps the points; the next cat adds 576', async () => {
    const h = createHarness({ caps: { rewarded: false, interstitial: false } });
    await startLevel(h);
    C(h, 0);
    C(h, 1);
    await loseGame(h);
    await h.session.onContinue();
    expect(h.game()).toMatchObject({ status: 'playing', revivesUsed: 1, levelPoints: 1_248, catStreak: 0 });
    C(h, 2);
    expect(h.game().levelPoints).toBe(1_824);
  });

  it('the kitty\'s cat scores and continues the run (F5.4)', async () => {
    const h = createHarness({ save: (s) => ({ ...s, stock: { hints: 3, kitties: 3 } }) });
    await startLevel(h);
    C(h, 0);
    await h.session.onPaw();
    await h.settle(h.config.kitty.revealMs);
    expect(h.game().kittiesUsed).toBe(1);
    expect(h.game()).toMatchObject({ levelPoints: 1_248, catStreak: 2 });
    expect(h.said.some((x) => /^The kitty found a cat\. 2 of 5\. 1,248 points\. /.test(x))).toBe(true);
  });

  it('a removed cat changes nothing; putting it back adds nothing (D15, D16)', async () => {
    const h = createHarness();
    await startLevel(h);
    C(h, 0);
    C(h, 1);
    C(h, 1); // remove
    expect(h.game()).toMatchObject({ levelPoints: 1_248, catStreak: 2, catsPlaced: 1 });
    C(h, 1); // put back
    expect(h.game()).toMatchObject({ levelPoints: 1_248, catStreak: 2, catsPlaced: 2 });
    C(h, 2);
    expect(h.game().levelPoints).toBe(2_016);
  });
});

describe('screen-reader policy (phase2c.1 §10.4, D22)', () => {
  it('a scoring cat\'s line ends with the running total in ONE utterance; never the increment or the run', async () => {
    const h = createHarness();
    await startLevel(h);
    C(h, 0);
    C(h, 1);
    const before = h.said.length;
    C(h, 2);
    expect(h.said.length).toBe(before + 1); // one fx.announce for the action
    // Region C is palette index 2 (Mustard) in the harness.
    expect(last(h.said)).toBe('Cat placed. 3 of 5. 2,016 points. Mustard done.');
    expect(h.said.join(' ')).not.toMatch(/\+\d|672|768|in a row|streak/);
  });

  it('a mistake\'s line is unchanged (nothing is lost, so nothing more to say)', async () => {
    const h = createHarness();
    await startLevel(h);
    C(h, 0);
    await mistake(h);
    expect(last(h.said)).toBe('Wrong tile. 2 fish left.');
  });

  it('no points sound or vibration of its own (D23): POINTS adds nothing to the cat\'s feedback', async () => {
    const h = createHarness();
    await startLevel(h);
    const sfx = h.log.filter((x) => x.startsWith('sfx:')).length;
    const pulses = h.platform.pulses.length;
    C(h, 0);
    expect(h.log.filter((x) => x.startsWith('sfx:')).slice(sfx)).toEqual(['sfx:cat', 'sfx:region']);
    expect(h.platform.pulses.length - pulses).toBe(1); // the cat's own haptic only
  });
});

describe('the win (phase2c.1 §3.2.5, §3.7, §10.5)', () => {
  it('a counted win adds the level\'s total to points.total; win_points carries points and run, no streak', async () => {
    const h = createHarness({ save: (s) => ({ ...s, points: { total: 1_000 } }) });
    await startLevel(h);
    C(h, 0);
    C(h, 1);
    await mistake(h);
    winGame(h); // C C M C C C → 576 + 672 + 576 + 672 + 768 = 3 264, run 3
    expect(h.game()).toMatchObject({ status: 'won', levelPoints: 3_264, catStreak: 3 });
    expect(h.save().points.total).toBe(1_000 + 3_264);
    const wp = h.analytics.find((e) => e.name === 'win_points');
    expect(wp).toEqual({ name: 'win_points', params: { mode: 'level', fish: 2, total: 2, points: 3_264, run: 3 } });
    expect(wp?.params).not.toHaveProperty('streak');
    await h.settle(h.config.fx.winOverlayDelayMs);
    await tapRanking(h);
    expect(h.router.props.victory?.pointsEarned).toBe(3_264);
    // The winning cat's line already ends with the level's total (no separate win line for points).
    expect(h.said.some((x) => x.startsWith('Cat placed. 5 of 5. 3,264 points. '))).toBe(true);
  });

  it('a win that does not count shows its total and adds nothing to points.total', async () => {
    const h = createHarness({ save: (s) => ({ ...atLevel20(s), points: { total: 7 } }) });
    await startLevel(h, 5); // an old level: not counted
    winGame(h);
    expect(h.save().points.total).toBe(7);
    expect(h.analytics.some((e) => e.name === 'win_points')).toBe(false);
    await h.settle(h.config.fx.winOverlayDelayMs);
    await tapRanking(h);
    expect(h.router.props.victory?.pointsEarned).toBe(3_840);
  });

  it('dailies score with the same rule (D17); the daily slot carries the points', async () => {
    const h = createHarness({ save: atLevel20 });
    await h.session.start({ mode: 'daily', dateKey: TODAY });
    await h.settle(h.config.fx.boardEntryMs);
    C(h, 0);
    C(h, 1);
    expect(h.save().inProgress.daily).toMatchObject({ points: 1_248, catStreak: 2 });
    for (const r of [2, 3, 4]) C(h, r);
    expect(h.save().points.total).toBe(3_840);
    expect(h.analytics).toContainEqual({ name: 'win_points', params: { mode: 'daily', fish: 3, total: 3, points: 3_840, run: 5 } });
  });

  it('a mode outside levelPoints.modes: no counter (points null), no POINTS, no lifetime points; its fish still count', async () => {
    const h = createHarness({ config: { levelPoints: { modes: ['level', 'event'] } }, save: atLevel20 });
    await h.session.start({ mode: 'daily', dateKey: TODAY });
    await h.settle(h.config.fx.boardEntryMs);
    expect(h.router.game?.last.points).toBeNull();
    winGame(h);
    expect(h.game().levelPoints).toBe(0);
    expect(h.router.game?.played).not.toContain('POINTS');
    expect(h.save().points.total).toBe(0);
    expect(h.save().period.total).toBe(3);
    expect(h.said.join(' ')).not.toMatch(/points/);
  });

  it('save.streak is never written: mistakes, a revive, Retry and wins leave the 2c record as it was', async () => {
    const streak = { current: 3, best: 9 };
    const h = createHarness({ caps: { rewarded: false, interstitial: false }, save: (s) => ({ ...s, streak }) });
    await startLevel(h);
    C(h, 0);
    await loseGame(h);
    await h.session.onContinue();
    winGame(h);
    expect(h.save().streak).toBe(streak);
    await h.session.onNext();
    await h.settle(h.config.fx.boardEntryMs);
    await loseGame(h);
    await h.session.onRetry();
    await h.settle(h.config.fx.boardEntryMs);
    winGame(h);
    expect(h.save().streak).toBe(streak);
    for (const w of h.platform.writes) expect(w.data.streak).toEqual(streak);
  });
});
