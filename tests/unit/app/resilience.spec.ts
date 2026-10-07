// Owner: app. Session resilience fixes from the Phase 2 review (04 §8 "the player never sees a dead
// end"): the top-bar Home before O4 shows saves the lost board (logic-1); a card whose lazy chunk
// cannot be loaded is never charged for and never leaves the game stuck (logic-2 / RP-2); a TICK
// during the kitty's engine call does not drop the kitty (logic-3); O7 after a daily solved past
// midnight does not count down a whole new day (logic-5 / SPEC-03).
import { describe, expect, it } from 'vitest';
import { localDateKey, localMidnightAfter, msUntilLocalMidnight } from '../../../src/game/progression';
import type { SaveDataV1 } from '../../../src/game/types';
import { t } from '../../../src/i18n';
import { createHarness, slice, SOL5, startLevel, WRONG5, type Harness } from './harness';

function withStock(hints: number, kitties: number): (s: SaveDataV1) => SaveDataV1 {
  return (s) => ({ ...s, stock: { hints, kitties } });
}

async function threeMistakes(h: Harness): Promise<void> {
  for (const cell of WRONG5.slice(0, 3)) {
    h.session.onCellDoubleTap(cell);
    await h.settle(h.config.input.cellLockAfterCatMs);
  }
}

async function solve(h: Harness): Promise<void> {
  for (const cell of SOL5) {
    h.session.onCellDoubleTap(cell);
    await h.settle(h.config.input.cellLockAfterCatMs);
  }
}

describe('logic-1: top-bar Home in the fail-overlay delay', () => {
  it('saves the 0-heart board (unused revive kept) instead of discarding it', async () => {
    const h = createHarness();
    await startLevel(h, 5);
    await threeMistakes(h);
    expect(h.game().status).toBe('lost');
    expect(h.router.isOpen('fail')).toBe(false); // O4 opens only after fx.failOverlayDelayMs
    h.session.onHome(); // the top bar's Home
    await h.settle(h.config.fx.failOverlayDelayMs * 2);
    const slot = h.save().inProgress.level;
    expect(slot).not.toBeNull();
    expect(slot?.hearts).toBe(0);
    expect(slot?.revivesUsed).toBe(0);
    expect(h.router.isOpen('fail')).toBe(false); // the pending O4 timer was cleared by the teardown
    expect(h.homeCalls).toBe(1);
    // Coming back restores into LOST with O4 at once (02 §15 step 5).
    await h.session.start({ mode: 'level', level: 5 });
    expect(h.game().status).toBe('lost');
    expect(h.router.isOpen('fail')).toBe(true);
    expect(h.router.props.fail?.buttonDelayMs).toBe(0);
  });

  it('Home on the open O4 still discards the attempt (02 §10.2)', async () => {
    const h = createHarness();
    await startLevel(h, 5);
    await threeMistakes(h);
    await h.settle(h.config.fx.failOverlayDelayMs);
    expect(h.router.isOpen('fail')).toBe(true);
    h.router.props.fail?.onHome();
    expect(h.save().inProgress.level).toBeNull();
  });
});

describe('logic-2 / RP-2: the overlay chunk cannot be loaded', () => {
  it('the bulb charges nothing, opens nothing and leaves the board playable', async () => {
    const h = createHarness({ save: withStock(5, 3) });
    await startLevel(h, 5);
    h.router.chunkOk = false;
    h.log.length = 0;
    await h.session.onBulb();
    expect(h.save().stock.hints).toBe(5);
    expect(h.game().status).toBe('playing');
    expect(h.game().hintsUsed).toBe(0);
    expect(slice(h.log, /^(open:|save:|engine:|toast:)/)).toEqual([`toast:${t('hint.unavailable')}`]);
    expect(h.store.get().ui.inputLocked).toBe(false);
    h.session.onCellTap(WRONG5[3] as number); // board input still works
    expect(h.game().cells[WRONG5[3] as number]).not.toBe(0);
  });

  it('at stock 0 no O2 is asked (no ad, no grant), for the bulb and for the paw', async () => {
    const h = createHarness({ save: withStock(0, 0) });
    await startLevel(h, 5);
    h.router.chunkOk = false;
    h.log.length = 0;
    await h.session.onBulb();
    await h.session.onPaw();
    expect(slice(h.log, /^(open:|ad:|save:|toast:)/)).toEqual([`toast:${t('hint.unavailable')}`, `toast:${t('kitty.unavailable')}`]);
    expect(h.save().stock).toEqual({ hints: 0, kitties: 0 });
    expect(h.game().status).toBe('playing');
  });

  it('the tutorial bulb (step 5) toasts and stays at step 5; it works once the chunk loads', async () => {
    const h = createHarness({ save: (s) => ({ ...s, tutorialDone: false, progress: { level: 1, completed: 0, best: {} } }) });
    await h.session.start({ mode: 'tutorial', replay: false });
    await h.settle(h.config.fx.boardEntryMs);
    h.session.onCellDoubleTap(1); // step 1: the Lavender tile (see tutorial-session.spec)
    h.session.onCoachGotIt(); // step 2
    h.session.onPaint([4, 5, 6], 'mark'); // step 3
    h.session.onCellDoubleTap(7); // step 4
    expect(h.store.get().session?.tutorialStep).toBe(5);
    h.router.chunkOk = false;
    await h.session.onBulb();
    expect(h.game().status).toBe('playing');
    expect(h.router.toasts).toEqual([t('hint.unavailable')]);
    expect(h.router.isOpen('hint')).toBe(false);
    h.router.chunkOk = true;
    await h.session.onBulb();
    expect(h.game().status).toBe('hint');
    expect(h.router.isOpen('hint')).toBe(true);
  });

  it('a hint card that fails to open returns the game to playing', async () => {
    const h = createHarness({ save: withStock(5, 3) });
    await startLevel(h, 5);
    await h.session.onBulb();
    expect(h.game().status).toBe('hint');
    h.router.close('hint'); // the router dropped the queued card…
    h.bus.emit('overlay:failed', { id: 'hint' }); // …because its chunk failed
    expect(h.game().status).toBe('playing');
    expect(h.router.toasts).toContain(t('hint.unavailable'));
    expect(h.store.get().ui.inputLocked).toBe(false);
  });

  it('no O3 after a win: toast, then Home with the win saved', async () => {
    const h = createHarness();
    await startLevel(h, 5);
    await solve(h);
    expect(h.game().status).toBe('won');
    await h.settle(h.config.fx.winOverlayDelayMs);
    h.router.close('win');
    h.bus.emit('overlay:failed', { id: 'win' });
    expect(h.router.toasts).toEqual([t('toast.error')]);
    expect(h.homeCalls).toBe(1);
    expect(h.save().progress.level).toBe(6);
    expect(h.store.get().game).toBeNull();
  });

  it('no O4 after the last heart: toast, then Home keeping the lost board and its revive', async () => {
    const h = createHarness();
    await startLevel(h, 5);
    await threeMistakes(h);
    await h.settle(h.config.fx.failOverlayDelayMs);
    h.router.close('fail');
    h.bus.emit('overlay:failed', { id: 'fail' });
    expect(h.router.toasts).toEqual([t('toast.error')]);
    expect(h.homeCalls).toBe(1);
    expect(h.save().inProgress.level?.hearts).toBe(0);
    expect(h.save().inProgress.level?.revivesUsed).toBe(0);
  });

  it('other overlays (Settings) only toast; the board stays as it is', async () => {
    const h = createHarness();
    await startLevel(h, 5);
    h.bus.emit('overlay:failed', { id: 'settings' });
    expect(h.router.toasts).toEqual([t('toast.error')]);
    expect(h.homeCalls).toBe(0);
    expect(h.game().status).toBe('playing');
  });
});

describe('logic-3: a TICK during the kitty engine call', () => {
  it('still places the kitty (the board, not the state object, is compared)', async () => {
    const h = createHarness({ save: withStock(5, 3) });
    await startLevel(h, 5);
    const real = h.engine.pickKittyCell;
    h.engine.pickKittyCell = (p, c) => new Promise((resolve) => h.clock.setTimeout(() => resolve(real(p, c)), 1200));
    const before = h.game().catsPlaced;
    const flow = h.session.onPaw();
    await h.settle(1500); // crosses at least one 1 s TICK
    await flow;
    expect(h.game().catsPlaced).toBe(before + 1);
    expect(h.game().kittiesUsed).toBe(1);
    expect(h.save().stock.kitties).toBe(2);
  });
});

describe('logic-5 / SPEC-03: O7 for a daily solved after midnight', () => {
  it('counts down to the midnight after the daily’s own date (already past), not 24 h ahead', async () => {
    const h = createHarness();
    const day = localDateKey(h.clock.now());
    const [y, m, d] = day.split('-').map(Number) as [number, number, number];
    await h.settle(new Date(y, m - 1, d, 23, 58).getTime() - h.clock.now()); // no session yet: no TICKs
    await h.session.start({ mode: 'daily', dateKey: day });
    await h.settle(h.config.fx.boardEntryMs);
    for (const cell of SOL5.slice(0, 4)) {
      h.session.onCellDoubleTap(cell);
      await h.settle(h.config.input.cellLockAfterCatMs);
    }
    await h.settle(3 * 60_000); // past midnight
    expect(localDateKey(h.clock.now())).not.toBe(day);
    h.session.onCellDoubleTap(SOL5[4] as number);
    await h.settle(h.config.fx.winOverlayDelayMs);
    const props = h.router.props.daily_result;
    expect(props?.dateKey).toBe(day); // credited to its original date (02 §12)
    expect(props?.nextPuzzleAt).toBe(localMidnightAfter(day));
    expect((props?.nextPuzzleAt ?? Infinity) - (props?.now() ?? 0)).toBeLessThanOrEqual(0);
  });

  it('solved before midnight: the usual countdown to the next local midnight', async () => {
    const h = createHarness();
    const day = localDateKey(h.clock.now());
    await h.session.start({ mode: 'daily', dateKey: day });
    await h.settle(h.config.fx.boardEntryMs);
    await solve(h);
    await h.settle(h.config.fx.winOverlayDelayMs);
    const props = h.router.props.daily_result;
    expect(props?.nextPuzzleAt).toBe(h.clock.now() - h.config.fx.winOverlayDelayMs + msUntilLocalMidnight(h.clock.now() - h.config.fx.winOverlayDelayMs));
  });
});

describe('PLAT-1 edge: a late cloud merge moves progress on while an older level is open', () => {
  /** The FB cloud copy lands mid-level: progress is now level 9, with level 9's board in the slot. */
  function lateCloudMerge(h: Harness): void {
    const l9 = { ...(h.save().inProgress.level as NonNullable<SaveDataV1['inProgress']['level']>), id: 'L9' as const, cells: 'cloud-board', savedAt: 1 };
    h.store.update((app) => ({
      ...app,
      save: { ...app.save, progress: { level: 9, completed: 8, best: {} }, inProgress: { ...app.save.inProgress, level: l9 } },
    }));
  }

  it('moves on level 5 never overwrite the level 9 board, nor does Home save it there', async () => {
    const h = createHarness();
    await startLevel(h, 5);
    h.session.onCellTap(WRONG5[3] as number); // writes the L5 slot as usual
    expect(h.save().inProgress.level?.id).toBe('L5');
    lateCloudMerge(h);
    h.session.onCellTap(WRONG5[4] as number); // a board change on level 5
    expect(h.save().inProgress.level).toMatchObject({ id: 'L9', cells: 'cloud-board' });
    h.session.onHome(); // saveNow → saveBoard
    expect(h.save().inProgress.level).toMatchObject({ id: 'L9', cells: 'cloud-board' });
  });

  it('discarding level 5 from O4 keeps the level 9 board', async () => {
    const h = createHarness();
    await startLevel(h, 5);
    await threeMistakes(h);
    await h.settle(h.config.fx.failOverlayDelayMs);
    lateCloudMerge(h);
    h.router.props.fail?.onHome();
    expect(h.save().inProgress.level).toMatchObject({ id: 'L9', cells: 'cloud-board' });
  });
});
