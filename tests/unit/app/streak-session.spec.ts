// Owner: G1 (Phase 2c). The perfect streak in the session (docs/phase2c/fish-lives-spec.md §3.2, D4):
// a mistake breaks it AT ONCE, in the same store update as the board slot and in the same save, so
// Home, a reload, a fail or Retry can never restore it; a revive resets it; Retry neither breaks nor
// restores; hints and kitties never matter; the tutorial and a mode outside levelPoints.modes leave it
// alone; a perfect retried win starts a new streak at 1.
import { describe, expect, it } from 'vitest';
import { migrate } from '../../../src/game/save';
import type { SaveData } from '../../../src/game/types';
import { createHarness, last, loseGame, NOW, SOL5, startLevel, TODAY, winGame, WRONG5, type Harness } from './harness';

const withStreak = (current: number, best = current) => (s: SaveData): SaveData => ({ ...s, streak: { current, best } });

async function mistake(h: Harness, k = 0): Promise<void> {
  h.session.onCellDoubleTap(WRONG5[k] as number);
  await h.settle(h.config.input.cellLockAfterCatMs);
}

describe('the perfect streak in the session (phase2c §3.2)', () => {
  it('a mistake breaks the streak in the same store update as the board slot (one touch save that holds both)', async () => {
    const h = createHarness({ save: withStreak(4, 6) });
    await startLevel(h);
    const seen: { streak: number; slotMistakes: number | null }[] = [];
    const off = h.store.select(
      (s) => s.save,
      (save) => void seen.push({ streak: save.streak.current, slotMistakes: save.inProgress.level?.mistakes ?? null }),
    );
    await mistake(h);
    off();
    // Never a state where the board holds the mistake while the streak is still unbroken.
    expect(seen.some((x) => x.slotMistakes === 1 && x.streak !== 0)).toBe(false);
    expect(h.save().streak).toEqual({ current: 0, best: 6 });
    await h.settle(h.config.save.localDebounceMs);
    const write = last(h.platform.writes);
    expect(write?.cloud).toBe('debounced');
    expect(write?.data.streak).toEqual({ current: 0, best: 6 });
    expect(write?.data.inProgress.level?.mistakes).toBe(1);
  });

  it('Home and a reload cannot undo it: the saved board and the saved streak agree', async () => {
    const h = createHarness({ save: withStreak(3) });
    await startLevel(h);
    await mistake(h);
    h.session.onHome();
    const saved = last(h.platform.writes)?.data;
    expect(saved?.streak.current).toBe(0);
    // "Reload": the stored copy goes through migrate again.
    const reloaded = migrate(JSON.parse(JSON.stringify(saved)) as unknown, NOW + 1000);
    expect(reloaded.streak).toEqual({ current: 0, best: 3 });
    expect(reloaded.inProgress.level?.mistakes).toBe(1);
  });

  it('Retry neither breaks nor restores; a perfect retried win starts a new streak at 1', async () => {
    const h = createHarness({ caps: { rewarded: false, interstitial: false }, save: withStreak(7, 7) });
    await startLevel(h);
    await loseGame(h);
    expect(h.save().streak).toEqual({ current: 0, best: 7 }); // the mistakes broke it, before the fail
    await h.session.onRetry();
    await h.settle(h.config.fx.boardEntryMs);
    expect(h.save().streak).toEqual({ current: 0, best: 7 });
    winGame(h);
    expect(h.save().streak).toEqual({ current: 1, best: 7 });
  });

  it('a revive resets the streak (explicitly, even when a merge brought a streak back while O4 was open)', async () => {
    const h = createHarness({ caps: { rewarded: false, interstitial: false } });
    await startLevel(h);
    await loseGame(h);
    h.store.update((s) => ({ ...s, save: { ...s.save, streak: { current: 5, best: 5 } } }));
    await h.session.onContinue();
    expect(h.game().revivesUsed).toBe(1);
    expect(h.save().streak).toEqual({ current: 0, best: 5 });
  });

  it('a win after a revive is not perfect: no streak, no bonus, the one fish left goes to this period', async () => {
    const h = createHarness({ caps: { rewarded: false, interstitial: false }, save: withStreak(2, 2) });
    await startLevel(h);
    await loseGame(h);
    await h.session.onContinue();
    winGame(h);
    expect(h.game().status).toBe('won');
    expect(h.save().streak).toEqual({ current: 0, best: 2 });
    expect(h.save().points.total).toBe(50);
    expect(h.save().period.total).toBe(1);
  });

  it('hints and kitties never break it; a perfect aided win still moves it', async () => {
    const h = createHarness({ save: (s) => ({ ...withStreak(2, 2)(s), stock: { hints: 3, kitties: 3 } }) });
    await startLevel(h);
    await h.session.onPaw();
    await h.settle(h.config.kitty.revealMs);
    expect(h.save().streak.current).toBe(2);
    winGame(h);
    expect(h.game().kittiesUsed).toBe(1);
    expect(h.save().streak).toEqual({ current: 3, best: 3 });
  });

  it('dailies and events move the streak like levels (D5); a daily mistake breaks it', async () => {
    const h = createHarness({ save: (s) => ({ ...withStreak(1, 1)(s), progress: { level: 20, completed: 19, best: {} } }) });
    await h.session.start({ mode: 'daily', dateKey: TODAY });
    await h.settle(h.config.fx.boardEntryMs);
    for (const c of SOL5) h.session.onCellDoubleTap(c);
    expect(h.save().streak).toEqual({ current: 2, best: 2 });
    expect(h.save().period.total).toBe(3);
    const d = createHarness({ save: (s) => ({ ...withStreak(4, 4)(s), progress: { level: 20, completed: 19, best: {} } }) });
    await d.session.start({ mode: 'daily', dateKey: TODAY });
    await d.settle(d.config.fx.boardEntryMs);
    await mistake(d);
    expect(d.save().streak.current).toBe(0);
  });

  it('a mode outside levelPoints.modes neither breaks nor moves it', async () => {
    const h = createHarness({ config: { levelPoints: { modes: ['level', 'event'] } }, save: (s) => ({ ...withStreak(4, 4)(s), progress: { level: 20, completed: 19, best: {} } }) });
    await h.session.start({ mode: 'daily', dateKey: TODAY });
    await h.settle(h.config.fx.boardEntryMs);
    await mistake(h);
    expect(h.save().streak.current).toBe(4);
    winGame(h);
    expect(h.save().streak.current).toBe(4);
    expect(h.save().points.total).toBe(0); // no level points either
    expect(h.save().period.total).toBe(2); // the board still counts (period.modes)
  });

  it('the tutorial (no mistake penalty) never touches it and scores nothing', async () => {
    const h = createHarness({ save: (s) => ({ ...withStreak(3, 3)(s), tutorialDone: false, progress: { level: 1, completed: 0, best: {} } }) });
    await h.session.start({ mode: 'tutorial', replay: false });
    expect(h.game().rules.mistakePenalty).toBe(false);
    expect(h.save().streak).toEqual({ current: 3, best: 3 });
  });

  it('a second mistake when the streak is already 0 changes nothing more (no extra save for the streak)', async () => {
    const h = createHarness();
    await startLevel(h);
    await mistake(h, 0);
    const save = h.save();
    expect(save.streak.current).toBe(0);
    await mistake(h, 1);
    expect(h.save().streak).toBe(save.streak); // the same record object: breakStreak was a no-op
  });
});
