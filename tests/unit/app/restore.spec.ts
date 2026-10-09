// Owner: C (Phase 2b; was app). Restoring on launch (02 §15, 04 §5.1 / §7.2–7.3): load + merge, stale daily, invalid
// slots, a full board (→ win bookkeeping + O3/O7), 0 hearts (→ LOST with O4 and Continue offered),
// and an exact restore of a level and a daily in progress at the same time.
import { describe, expect, it } from 'vitest';
import { applyRestoreRules, loadSave } from '../../../src/app/boot';
import { mergeArrived } from '../../../src/app/restore';
import { encodeCells } from '../../../src/game/save';
import { defaults } from '../../../src/game/save';
import type { InProgressV2, SaveData } from '../../../src/game/types';
import { createFakeLevels, createHarness, levelPuzzle, NOW, SOL5, TODAY, WRONG5, last } from './harness';

function slot(id: InProgressV2['id'], mode: 'level' | 'daily', cells: Record<number, number>, extra: Partial<InProgressV2> = {}): InProgressV2 {
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

const base = (patch: Partial<SaveData> = {}): SaveData => ({
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

describe('loadSave: a local copy that never merged the cloud (PLAT-1)', () => {
  // Session 1 could not read the cloud, so it ran on defaults and stamped a fresh updatedAt.
  const unmergedLocal = {
    ...defaults(NOW - 60_000),
    updatedAt: NOW - 60_000,
    sessions: 1,
    progress: { level: 2, completed: 1, best: { 1: [5_000, 0] as [number, number] } },
  };
  const cloud = {
    ...base({
      stock: { hints: 9, kitties: 9 },
      settings: { ...defaults(NOW).settings, sound: false, haptics: false },
      progress: { level: 40, completed: 39, best: { 12: [33_000, 0] as [number, number] } },
    }),
    updatedAt: NOW - 3_600_000,
  };

  it('takes stock, settings and the other newest-wins fields from the cloud; max / union still apply', () => {
    const r = loadSave({ local: unmergedLocal, cloud, corrupt: false, localUnmerged: true }, NOW);
    expect(r.save.stock).toEqual({ hints: 9, kitties: 9 });
    expect(r.save.settings.sound).toBe(false);
    expect(r.save.settings.haptics).toBe(false);
    expect(r.save.progress.level).toBe(40);
    expect(r.save.progress.best).toEqual({ 1: [5_000, 0], 12: [33_000, 0] });
    expect(r.save.tutorialDone).toBe(true);
    expect(r.save.updatedAt).toBe(NOW - 60_000);
  });

  it('without the flag the newer copy wins as before (04 §7.3)', () => {
    const r = loadSave({ local: unmergedLocal, cloud, corrupt: false }, NOW);
    expect(r.save.stock).toEqual(defaults(NOW).stock);
    expect(r.save.progress.level).toBe(40);
  });
});

describe('mergeArrived: copies that arrive after launch', () => {
  const live = { ...base({ stock: { hints: 1, kitties: 0 }, progress: { level: 5, completed: 4, best: {} } }), updatedAt: NOW };

  it("the late FB cloud copy wins the newest-wins fields even though it is older (PLAT-1)", () => {
    const cloud = { ...base({ stock: { hints: 9, kitties: 9 }, progress: { level: 40, completed: 39, best: {} } }), updatedAt: NOW - 3_600_000 };
    const out = mergeArrived(live, { source: 'cloud', value: cloud }, NOW);
    expect(out.stock).toEqual({ hints: 9, kitties: 9 });
    expect(out.progress.level).toBe(40);
  });

  it("another tab's newer write is merged with the plain rules: progress and bests never go backwards (RP-5)", () => {
    const tab = {
      ...base({ stock: { hints: 3, kitties: 2 }, progress: { level: 6, completed: 5, best: { 5: [2_246, 0] as [number, number] } } }),
      updatedAt: NOW + 1_000,
    };
    const out = mergeArrived(live, { source: 'tab', value: tab }, NOW);
    expect(out.progress).toEqual({ level: 6, completed: 5, best: { 5: [2_246, 0] } });
    expect(out.stock).toEqual({ hints: 3, kitties: 2 });
    const stale = { ...tab, updatedAt: NOW - 5_000, progress: { level: 3, completed: 2, best: {} }, stock: { hints: 0, kitties: 0 } };
    const kept = mergeArrived(out, { source: 'tab', value: stale }, NOW);
    expect(kept.progress.level).toBe(6);
    expect(kept.stock).toEqual({ hints: 3, kitties: 2 });
  });

  it('an empty or unreadable copy changes nothing', () => {
    expect(mergeArrived(live, { source: 'cloud', value: null }, NOW)).toBe(live);
    expect(mergeArrived(live, { source: 'tab', value: 'not json {' }, NOW)).toBe(live);
  });
});

describe('applyRestoreRules (02 §15 steps 1–3)', () => {
  const levels = createFakeLevels();

  it('step 2: clears a daily slot from an earlier date, keeps today\'s', async () => {
    const stale = base({ inProgress: { level: null, daily: slot('D2026-10-06', 'daily', { 0: 1 }), event: null } });
    const r1 = await applyRestoreRules(stale, { today: TODAY, levels });
    expect(r1.save.inProgress.daily).toBeNull();
    expect(r1.cleared).toEqual(['daily']);
    const fresh = base({ inProgress: { level: null, daily: slot(`D${TODAY}`, 'daily', { 0: 1 }), event: null } });
    const r2 = await applyRestoreRules(fresh, { today: TODAY, levels });
    expect(r2.save.inProgress.daily?.id).toBe(`D${TODAY}`);
    expect(r2.cleared).toEqual([]);
  });

  it('step 3: clears a slot that fails validation against its puzzle', async () => {
    // A cat on a non-solution cell can never be saved by the game.
    const bad = base({ inProgress: { level: slot('L25', 'level', { [WRONG5[0] as number]: 2 }), daily: null, event: null } });
    const r = await applyRestoreRules(bad, { today: TODAY, levels });
    expect(r.save.inProgress.level).toBeNull();
    expect(r.cleared).toEqual(['level']);
  });

  it('step 3: clears a level slot that is not the current level', async () => {
    const other = base({ inProgress: { level: slot('L24', 'level', { 0: 1 }), daily: null, event: null } });
    expect((await applyRestoreRules(other, { today: TODAY, levels })).save.inProgress.level).toBeNull();
  });

  it('keeps valid slots, and hearts-0 / full boards (steps 4–5 run when the board opens)', async () => {
    const full: Record<number, number> = {};
    for (const c of SOL5) full[c] = 2;
    const lost = slot(`D${TODAY}`, 'daily', { [WRONG5[0] as number]: 3, [WRONG5[1] as number]: 3, [WRONG5[2] as number]: 3 });
    const save = base({ inProgress: { level: slot('L25', 'level', full), daily: lost, event: null } });
    expect(lost.hearts).toBe(0);
    const r = await applyRestoreRules(save, { today: TODAY, levels });
    expect(r.cleared).toEqual([]);
    expect(r.save).toBe(save);
  });

  it('keeps a slot it cannot check now (substitute board / load failure)', async () => {
    const save = base({ inProgress: { level: slot('L25', 'level', { 0: 1 }), daily: null, event: null } });
    const offline = createFakeLevels({
      peekLevel: () => null,
      getLevel: async () => ({ puzzle: levelPuzzle(25), source: 'substitute' }),
    });
    expect((await applyRestoreRules(save, { today: TODAY, levels: offline })).cleared).toEqual([]);
    const failing = createFakeLevels({ peekLevel: () => null, getLevel: () => Promise.reject(new Error('offline')) });
    expect((await applyRestoreRules(save, { today: TODAY, levels: failing })).cleared).toEqual([]);
  });

  it('accepts a custom validator', async () => {
    const save = base({ inProgress: { level: slot('L25', 'level', { 0: 1 }), daily: null, event: null } });
    const r = await applyRestoreRules(save, { today: TODAY, levels, validate: () => false });
    expect(r.cleared).toEqual(['level']);
  });
});

describe('opening a restored board (02 §15 steps 3–6)', () => {
  it('restores a level exactly: cells, hearts, counters, elapsed time; READY → PLAYING', async () => {
    const s = slot('L25', 'level', { [SOL5[0] as number]: 2, 7: 1, [WRONG5[0] as number]: 3 }, { hintsUsed: 1 });
    const h = createHarness({ save: () => base({ inProgress: { level: s, daily: null, event: null } }) });
    await h.session.start({ mode: 'level', level: 25 });
    const g = h.game();
    expect(encodeCells(g.cells)).toBe(s.cells);
    expect(g).toMatchObject({ hearts: 2, mistakes: 1, hintsUsed: 1, elapsedMs: 12_345, status: 'ready', catsPlaced: 1 });
    await h.settle(h.config.fx.boardEntryMs);
    expect(h.game().status).toBe('playing');
  });

  it("restores with the mode's RuleFlags under the session config (5 hearts per attempt)", async () => {
    // Two mistakes: 5 − 2 = 3 hearts is only valid with 5 hearts per attempt.
    const s = slot('L25', 'level', { [WRONG5[0] as number]: 3, [WRONG5[1] as number]: 3 }, { hearts: 3 });
    const h = createHarness({
      config: { hearts: { perAttempt: 5 } },
      save: () => base({ inProgress: { level: s, daily: null, event: null } }),
    });
    await h.session.start({ mode: 'level', level: 25 });
    expect(h.game()).toMatchObject({ hearts: 3, mistakes: 2, status: 'ready' });
    expect(h.game().rules).toMatchObject({ heartsPerAttempt: 5 });
    expect(h.save().inProgress.level).toEqual(s);
    // The same slot breaks the hearts invariant under the default config (3 − 2 ≠ 3): cleared, fresh board.
    const d = createHarness({ save: () => base({ inProgress: { level: s, daily: null, event: null } }) });
    await d.session.start({ mode: 'level', level: 25 });
    expect(d.game()).toMatchObject({ hearts: 3, mistakes: 0 });
    expect(d.game().rules).toMatchObject({ heartsPerAttempt: 3 });
    expect(d.save().inProgress.level).toBeNull();
  });

  it('clears an invalid slot when the board opens and starts fresh', async () => {
    const s = slot('L25', 'level', { [WRONG5[0] as number]: 2 });
    const h = createHarness({ save: () => base({ inProgress: { level: s, daily: null, event: null } }) });
    await h.session.start({ mode: 'level', level: 25 });
    expect(h.save().inProgress.level).toBeNull();
    expect(h.game().cells.every((v) => v === 0)).toBe(true);
  });

  it('a full board runs the win bookkeeping and shows the victory screen at once (no panel)', async () => {
    const full: Record<number, number> = {};
    for (const c of SOL5) full[c] = 2;
    const h = createHarness({ save: () => base({ inProgress: { level: slot('L25', 'level', full), daily: null, event: null } }) });
    await h.session.start({ mode: 'level', level: 25 });
    expect(h.game().status).toBe('won');
    expect(h.save().progress).toMatchObject({ level: 26, completed: 25 });
    expect(h.save().inProgress.level).toBeNull();
    expect(last(h.platform.writes)?.cloud).toBe('flush');
    await h.settle(0);
    expect(h.router.isOpen('ranking')).toBe(false);
    expect(h.router.isOpen('victory')).toBe(true);
    expect(h.router.props.victory).toMatchObject({ variant: 'level', level: 25, nextLevel: 26 });
  });

  it('a full daily board records the daily and shows the daily victory', async () => {
    const full: Record<number, number> = {};
    for (const c of SOL5) full[c] = 2;
    const h = createHarness({ save: () => base({ inProgress: { level: null, daily: slot(`D${TODAY}`, 'daily', full), event: null } }) });
    await h.session.start({ mode: 'daily', dateKey: TODAY });
    await h.settle(0);
    expect(h.save().daily[TODAY]).toEqual([12_345, 0, 0, 0]);
    expect(h.router.props.victory?.variant).toBe('daily');
  });

  it('hearts 0 → LOST with O4 shown at once and Continue still offered', async () => {
    const lost = slot('L25', 'level', { [WRONG5[0] as number]: 3, [WRONG5[1] as number]: 3, [WRONG5[2] as number]: 3 });
    const h = createHarness({ save: () => base({ inProgress: { level: lost, daily: null, event: null } }) });
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
    const h = createHarness({ save: () => base({ inProgress: { level: lv, daily: dy, event: null } }) });
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
    const h = createHarness({ save: () => base({ inProgress: { level: lost, daily: null, event: null } }) });
    await h.session.start({ mode: 'level', level: 25 });
    h.session.onHome();
    expect(h.save().inProgress.level).toBeNull();
    expect(last(h.platform.writes)?.cloud).toBe('now');
    expect(h.store.get().game).toBeNull();
  });
});
