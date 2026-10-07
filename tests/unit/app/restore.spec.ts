// Owner: app. Restoring on launch (02 §15, 04 §5.1 / §7.2–7.3): load + merge, stale daily, invalid
// slots, a full board (→ win bookkeeping + O3/O7), 0 hearts (→ LOST with O4 and Continue offered),
// and an exact restore of a level and a daily in progress at the same time.
import { describe, expect, it } from 'vitest';
import { applyRestoreRules, loadSave } from '../../../src/app/boot';
import { encodeCells } from '../../../src/game/save';
import { defaults } from '../../../src/game/save';
import type { InProgressV1, SaveDataV1 } from '../../../src/game/types';
import { createFakeLevels, createHarness, levelPuzzle, NOW, SOL5, TODAY, WRONG5, last } from './harness';

function slot(id: InProgressV1['id'], mode: 'level' | 'daily', cells: Record<number, number>, extra: Partial<InProgressV1> = {}): InProgressV1 {
  const arr = new Uint8Array(25);
  for (const [i, v] of Object.entries(cells)) arr[Number(i)] = v;
  const mistakes = [...arr].filter((v) => v === 3).length;
  return {
    id,
    mode,
    cells: encodeCells(arr),
    hearts: 3 - mistakes,
    revivesUsed: 0,
    mistakes,
    hintsUsed: 0,
    kittiesUsed: 0,
    elapsedMs: 12_345,
    savedAt: NOW - 1000,
    ...extra,
  };
}

const base = (patch: Partial<SaveDataV1> = {}): SaveDataV1 => ({
  ...defaults(NOW - 86_400_000),
  tutorialDone: true,
  progress: { level: 25, completed: 24, best: {} },
  ...patch,
});

describe('loadSave (04 §7.3)', () => {
  it('uses the local copy alone when there is no cloud copy', () => {
    const local = base({ stock: { hints: 2, kitties: 1 } });
    const r = loadSave({ local, cloud: null, corrupt: false }, NOW);
    expect(r.save.stock).toEqual({ hints: 2, kitties: 1 });
    expect(r.corrupt).toEqual([]);
  });

  it('merges local and cloud (max progress, newest stock)', () => {
    const local = { ...base({ stock: { hints: 2, kitties: 1 } }), updatedAt: NOW - 5000 };
    const cloud = { ...base({ stock: { hints: 7, kitties: 0 }, progress: { level: 30, completed: 29, best: {} } }), updatedAt: NOW - 1000 };
    const r = loadSave({ local, cloud, corrupt: false }, NOW);
    expect(r.save.progress.level).toBe(30);
    expect(r.save.stock).toEqual({ hints: 7, kitties: 0 });
  });

  it('a new device (empty local) takes the cloud copy instead of fresh defaults', () => {
    const cloud = { ...base({ stock: { hints: 1, kitties: 1 } }), updatedAt: NOW - 86_400_000 };
    const r = loadSave({ local: null, cloud, corrupt: false }, NOW);
    expect(r.save.stock).toEqual({ hints: 1, kitties: 1 });
    expect(r.save.tutorialDone).toBe(true);
  });

  it('reports corrupt copies for analytics', () => {
    expect(loadSave({ local: null, cloud: null, corrupt: true }, NOW).corrupt).toEqual(['local']);
    expect(loadSave({ local: 'not json {', cloud: null, corrupt: false }, NOW).corrupt).toEqual(['local']);
    expect(loadSave({ local: null, cloud: null, corrupt: false }, NOW).save.sessions).toBe(0);
  });
});

describe('applyRestoreRules (02 §15 steps 1–3)', () => {
  const levels = createFakeLevels();

  it('step 2: clears a daily slot from an earlier date, keeps today\'s', async () => {
    const stale = base({ inProgress: { level: null, daily: slot('D2026-10-06', 'daily', { 0: 1 }) } });
    const r1 = await applyRestoreRules(stale, { today: TODAY, levels });
    expect(r1.save.inProgress.daily).toBeNull();
    expect(r1.cleared).toEqual(['daily']);
    const fresh = base({ inProgress: { level: null, daily: slot(`D${TODAY}`, 'daily', { 0: 1 }) } });
    const r2 = await applyRestoreRules(fresh, { today: TODAY, levels });
    expect(r2.save.inProgress.daily?.id).toBe(`D${TODAY}`);
    expect(r2.cleared).toEqual([]);
  });

  it('step 3: clears a slot that fails validation against its puzzle', async () => {
    // A cat on a non-solution cell can never be saved by the game.
    const bad = base({ inProgress: { level: slot('L25', 'level', { [WRONG5[0] as number]: 2 }), daily: null } });
    const r = await applyRestoreRules(bad, { today: TODAY, levels });
    expect(r.save.inProgress.level).toBeNull();
    expect(r.cleared).toEqual(['level']);
  });

  it('step 3: clears a level slot that is not the current level', async () => {
    const other = base({ inProgress: { level: slot('L24', 'level', { 0: 1 }), daily: null } });
    expect((await applyRestoreRules(other, { today: TODAY, levels })).save.inProgress.level).toBeNull();
  });

  it('keeps valid slots, and hearts-0 / full boards (steps 4–5 run when the board opens)', async () => {
    const full: Record<number, number> = {};
    for (const c of SOL5) full[c] = 2;
    const lost = slot(`D${TODAY}`, 'daily', { [WRONG5[0] as number]: 3, [WRONG5[1] as number]: 3, [WRONG5[2] as number]: 3 });
    const save = base({ inProgress: { level: slot('L25', 'level', full), daily: lost } });
    expect(lost.hearts).toBe(0);
    const r = await applyRestoreRules(save, { today: TODAY, levels });
    expect(r.cleared).toEqual([]);
    expect(r.save).toBe(save);
  });

  it('keeps a slot it cannot check now (substitute board / load failure)', async () => {
    const save = base({ inProgress: { level: slot('L25', 'level', { 0: 1 }), daily: null } });
    const offline = createFakeLevels({
      peekLevel: () => null,
      getLevel: async () => ({ puzzle: levelPuzzle(25), source: 'substitute' }),
    });
    expect((await applyRestoreRules(save, { today: TODAY, levels: offline })).cleared).toEqual([]);
    const failing = createFakeLevels({ peekLevel: () => null, getLevel: () => Promise.reject(new Error('offline')) });
    expect((await applyRestoreRules(save, { today: TODAY, levels: failing })).cleared).toEqual([]);
  });

  it('accepts a custom validator', async () => {
    const save = base({ inProgress: { level: slot('L25', 'level', { 0: 1 }), daily: null } });
    const r = await applyRestoreRules(save, { today: TODAY, levels, validate: () => false });
    expect(r.cleared).toEqual(['level']);
  });
});

describe('opening a restored board (02 §15 steps 3–6)', () => {
  it('restores a level exactly: cells, hearts, counters, elapsed time; READY → PLAYING', async () => {
    const s = slot('L25', 'level', { [SOL5[0] as number]: 2, 7: 1, [WRONG5[0] as number]: 3 }, { hintsUsed: 1 });
    const h = createHarness({ save: () => base({ inProgress: { level: s, daily: null } }) });
    await h.session.start({ mode: 'level', level: 25 });
    const g = h.game();
    expect(encodeCells(g.cells)).toBe(s.cells);
    expect(g).toMatchObject({ hearts: 2, mistakes: 1, hintsUsed: 1, elapsedMs: 12_345, status: 'ready', catsPlaced: 1 });
    await h.settle(h.config.fx.boardEntryMs);
    expect(h.game().status).toBe('playing');
  });

  it('clears an invalid slot when the board opens and starts fresh', async () => {
    const s = slot('L25', 'level', { [WRONG5[0] as number]: 2 });
    const h = createHarness({ save: () => base({ inProgress: { level: s, daily: null } }) });
    await h.session.start({ mode: 'level', level: 25 });
    expect(h.save().inProgress.level).toBeNull();
    expect(h.game().cells.every((v) => v === 0)).toBe(true);
  });

  it('a full board runs the win bookkeeping and shows O3 at once', async () => {
    const full: Record<number, number> = {};
    for (const c of SOL5) full[c] = 2;
    const h = createHarness({ save: () => base({ inProgress: { level: slot('L25', 'level', full), daily: null } }) });
    await h.session.start({ mode: 'level', level: 25 });
    expect(h.game().status).toBe('won');
    expect(h.save().progress).toMatchObject({ level: 26, completed: 25 });
    expect(h.save().inProgress.level).toBeNull();
    expect(last(h.platform.writes)?.cloud).toBe('flush');
    await h.settle(0);
    expect(h.router.isOpen('win')).toBe(true);
    expect(h.router.props.win).toMatchObject({ variant: 'level', level: 25, nextLevel: 26 });
  });

  it('a full daily board records the daily and shows O7', async () => {
    const full: Record<number, number> = {};
    for (const c of SOL5) full[c] = 2;
    const h = createHarness({ save: () => base({ inProgress: { level: null, daily: slot(`D${TODAY}`, 'daily', full) } }) });
    await h.session.start({ mode: 'daily', dateKey: TODAY });
    await h.settle(0);
    expect(h.save().daily[TODAY]).toEqual([12_345, 0, 0, 0]);
    expect(h.router.isOpen('daily_result')).toBe(true);
  });

  it('hearts 0 → LOST with O4 shown at once and Continue still offered', async () => {
    const lost = slot('L25', 'level', { [WRONG5[0] as number]: 3, [WRONG5[1] as number]: 3, [WRONG5[2] as number]: 3 });
    const h = createHarness({ save: () => base({ inProgress: { level: lost, daily: null } }) });
    await h.session.start({ mode: 'level', level: 25 });
    expect(h.game().status).toBe('lost');
    expect(h.router.isOpen('fail')).toBe(true);
    expect(h.router.props.fail).toMatchObject({ continueOffer: 'video', buttonDelayMs: 0, busy: false });
    await h.session.onContinue();
    expect(h.game()).toMatchObject({ status: 'playing', hearts: 1, revivesUsed: 1 });
  });

  it('a level and a daily in progress are both restored', async () => {
    const lv = slot('L25', 'level', { 3: 1 });
    const dy = slot(`D${TODAY}`, 'daily', { 4: 1, [WRONG5[3] as number]: 3 });
    const h = createHarness({ save: () => base({ inProgress: { level: lv, daily: dy } }) });
    await h.session.start({ mode: 'level', level: 25 });
    await h.settle(h.config.fx.boardEntryMs);
    expect(encodeCells(h.game().cells)).toBe(lv.cells);
    h.session.onHome();
    await h.session.start({ mode: 'daily', dateKey: TODAY });
    expect(encodeCells(h.game().cells)).toBe(dy.cells);
    expect(h.game().hearts).toBe(2);
    expect(h.save().inProgress.level?.cells).toBe(lv.cells); // playing the daily never discards the level
  });

  it('O4 Home discards the attempt', async () => {
    const lost = slot('L25', 'level', { [WRONG5[0] as number]: 3, [WRONG5[1] as number]: 3, [WRONG5[2] as number]: 3 });
    const h = createHarness({ save: () => base({ inProgress: { level: lost, daily: null } }) });
    await h.session.start({ mode: 'level', level: 25 });
    h.session.onHome();
    expect(h.save().inProgress.level).toBeNull();
    expect(last(h.platform.writes)?.cloud).toBe('now');
    expect(h.store.get().game).toBeNull();
  });
});
