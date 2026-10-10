// Owner: C (Phase 2b; was app). SaveScheduler modes (04 §7.1, 02 §15) and when the session uses each one.
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg } from '../../../src/app/config';
import { createEventBus, type AppEventMap } from '../../../src/app/events';
import { createSaveScheduler } from '../../../src/app/saves';
import { createStore, initialAppState, type AppState } from '../../../src/app/store';
import { defaults } from '../../../src/game/save';
import { createFakePlatform, createHarness, NOW, SOL5, startLevel, winGame, WRONG5 } from './harness';

function scheduler() {
  const log: string[] = [];
  const clock = createFakeClock(NOW);
  const store = createStore<AppState>(initialAppState(defaults(NOW - 1000)));
  const platform = createFakePlatform(log);
  const bus = createEventBus<AppEventMap>();
  const modes: string[] = [];
  bus.on('save', ({ mode }) => void modes.push(mode));
  const saves = createSaveScheduler({ store, storage: platform.storage, clock, bus });
  return { log, clock, store, platform, saves, modes };
}

describe('SaveScheduler', () => {
  it('touch(): one local write after save.localDebounceMs, cloud "debounced"', () => {
    const s = scheduler();
    s.saves.touch();
    s.clock.advance(100);
    s.saves.touch(); // restarts the debounce
    s.clock.advance(cfg.save.localDebounceMs - 1);
    expect(s.platform.writes).toHaveLength(0);
    s.clock.advance(1);
    expect(s.platform.writes.map((w) => w.cloud)).toEqual(['debounced']);
    expect(s.modes).toEqual(['touch']);
  });

  it('now(): cancels a pending touch and writes at once with cloud "now"', () => {
    const s = scheduler();
    s.saves.touch();
    s.saves.now();
    s.clock.advance(cfg.save.localDebounceMs * 2);
    expect(s.platform.writes.map((w) => w.cloud)).toEqual(['now']);
  });

  it('critical(): writes at once with cloud "flush"', () => {
    const s = scheduler();
    s.saves.touch();
    s.saves.critical();
    s.clock.advance(cfg.save.localDebounceMs * 2);
    expect(s.platform.writes.map((w) => w.cloud)).toEqual(['flush']);
  });

  it('flush(): writes a pending touch now, and is a no-op otherwise', () => {
    const s = scheduler();
    s.saves.flush();
    expect(s.platform.writes).toHaveLength(0);
    s.saves.touch();
    s.saves.flush();
    expect(s.platform.writes.map((w) => w.cloud)).toEqual(['debounced']);
    s.clock.advance(cfg.save.localDebounceMs);
    expect(s.platform.writes).toHaveLength(1);
  });

  it('stamps updatedAt on every write, in the store and in the written data', () => {
    const s = scheduler();
    s.clock.advance(5000);
    s.saves.now();
    expect(s.platform.writes[0]?.data.updatedAt).toBe(NOW + 5000);
    expect(s.store.get().save.updatedAt).toBe(NOW + 5000);
  });

  it('dispose(): cancels the pending write and ignores later calls', () => {
    const s = scheduler();
    s.saves.touch();
    s.saves.dispose();
    s.saves.now();
    s.saves.critical();
    s.clock.advance(cfg.save.localDebounceMs);
    expect(s.platform.writes).toHaveLength(0);
  });
});

describe('session save modes', () => {
  it('a board change is a debounced touch with the in-progress slot', async () => {
    const h = createHarness();
    await startLevel(h);
    h.platform.writes.length = 0;
    h.session.onCellTap(WRONG5[0] as number);
    expect(h.save().inProgress.level?.cells).toMatch(/^0+10*$/);
    expect(h.platform.writes).toHaveLength(0);
    await h.settle(h.config.save.localDebounceMs);
    expect(h.platform.writes.map((w) => w.cloud)).toEqual(['debounced']);
    expect(h.platform.writes[0]?.data.inProgress.level?.id).toBe('L5');
  });

  it('page hide / FB onPause: saves.now with the board, never a flush', async () => {
    const h = createHarness();
    await startLevel(h);
    h.session.onCellTap(WRONG5[0] as number);
    await h.settle(2500);
    h.platform.writes.length = 0;
    h.bus.emit('pause', { reason: 'fb_pause' });
    h.session.saveNow();
    expect(h.platform.writes.map((w) => w.cloud)).toEqual(['now']);
    const slot = h.platform.writes[0]?.data.inProgress.level;
    expect(slot?.elapsedMs).toBe(2500); // the partial TICK is credited before saving
    expect(h.platform.writes.some((w) => w.cloud === 'flush')).toBe(false);
  });

  it('Home saves the board with "now"', async () => {
    const h = createHarness();
    await startLevel(h);
    h.session.onCellTap(WRONG5[1] as number);
    h.platform.writes.length = 0;
    h.session.onHome();
    expect(h.platform.writes.map((w) => w.cloud)).toEqual(['now']);
    expect(h.save().inProgress.level?.id).toBe('L5');
    expect(h.homeCalls).toBe(1);
  });

  it('a level win is one critical save with the progress and no slot', async () => {
    const h = createHarness();
    await startLevel(h);
    await h.settle(4000);
    h.platform.writes.length = 0;
    winGame(h);
    const flushes = h.platform.writes.filter((w) => w.cloud === 'flush');
    expect(flushes).toHaveLength(1);
    const data = flushes[0]?.data;
    expect(data?.progress).toMatchObject({ level: 6, completed: 5 });
    expect(data?.progress.best[5]).toEqual([4000, 0]);
    expect(data?.inProgress.level).toBeNull();
    // No later debounced write puts the finished board back.
    await h.settle(h.config.save.localDebounceMs * 2);
    expect(h.save().inProgress.level).toBeNull();
  });

  it('a daily win is one critical save with the record', async () => {
    const h = createHarness({ save: (s) => ({ ...s, progress: { level: 25, completed: 24, best: {} } }) });
    await h.session.start({ mode: 'daily', dateKey: '2026-10-07' });
    await h.settle(h.config.fx.boardEntryMs + 1000);
    h.session.onCellDoubleTap(WRONG5[0] as number);
    h.platform.writes.length = 0;
    winGame(h);
    const flushes = h.platform.writes.filter((w) => w.cloud === 'flush');
    expect(flushes).toHaveLength(1);
    expect(flushes[0]?.data.daily['2026-10-07']).toEqual([1000, 1, 0, 0]);
    expect(flushes[0]?.data.inProgress.daily).toBeNull();
    expect(flushes[0]?.data.progress.completed).toBe(24); // dailies are not levels
  });

  it('the tutorial is never saved as in-progress; its first-run win is critical', async () => {
    const h = createHarness({ save: (s) => ({ ...s, tutorialDone: false, progress: { level: 1, completed: 0, best: {} } }) });
    await h.session.start({ mode: 'tutorial', replay: false });
    await h.settle(h.config.fx.boardEntryMs);
    h.session.onCellDoubleTap(1); // step 1: the Violet tile
    await h.settle(h.config.save.localDebounceMs);
    expect(h.save().inProgress).toEqual({ level: null, daily: null, event: null });
    expect(h.platform.writes).toHaveLength(0);
    expect(SOL5).toHaveLength(5);
  });
});
