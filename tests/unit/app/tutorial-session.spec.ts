// Owner: C (Phase 2b; was app). The tutorial through the session (02 §11.5, 04 §4.2): the input filter runs before
// reduce, scripted marks bypass it, the bulb is free at step 5, the first-run win is one critical
// save and leads to Level 2 without an interstitial; a replay saves nothing and returns Home.
import { describe, expect, it } from 'vitest';
import { CellState } from '../../../src/game/types';
import { createHarness, slice, type Harness, last } from './harness';

// 4×4 tutorial: cats at (1,2), (2,4), (3,1), (4,3) in 1-based coordinates.
const LAVENDER = 1;
const ROW2_CAT = 7;
const HINT_CAT = 8;
const LAST_CAT = 14;

const firstRun = () =>
  createHarness({
    save: (s) => ({ ...s, tutorialDone: false, progress: { level: 1, completed: 0, best: {} }, stock: { hints: 0, kitties: 0 } }),
  });

async function begin(h: Harness, replay = false): Promise<void> {
  await h.session.start({ mode: 'tutorial', replay });
  await h.settle(h.config.fx.boardEntryMs);
}

const step = (h: Harness): number | null => h.store.get().session?.tutorialStep ?? null;

async function playThrough(h: Harness): Promise<void> {
  h.session.onCellDoubleTap(LAVENDER);
  expect(step(h)).toBe(2);
  h.session.onCoachGotIt();
  expect(step(h)).toBe(3);
  h.session.onPaint([4, 5, 6], 'erase'); // starts on the step-2 X; the filter forces mark mode
  expect(step(h)).toBe(4);
  h.session.onCellDoubleTap(ROW2_CAT);
  expect(step(h)).toBe(5);
  await h.session.onBulb();
  expect(h.game().status).toBe('hint');
  h.session.onHintApply();
  expect(h.game().cells[HINT_CAT]).toBe(CellState.Cat);
  expect(step(h)).toBe(6);
  h.session.onCellDoubleTap(LAST_CAT);
}

describe('tutorial session', () => {
  it('wrong input only pulses: no heart lost, no state change', async () => {
    const h = firstRun();
    await begin(h);
    const before = h.game();
    h.session.onCellDoubleTap(0); // not the Lavender tile
    expect(h.game()).toBe(before);
    expect(h.router.game?.played).toEqual(['PULSE']);
    expect(h.router.isOpen('coach')).toBe(true);
    expect(h.router.props.coach).toMatchObject({ step: 1, hand: 'double_tap', colorParam: 7 });
  });

  it('runs all six steps; the first-run win is critical and leads to Level 2 without an ad', async () => {
    const h = firstRun();
    await begin(h);
    await playThrough(h);
    const g = h.game();
    expect(g.status).toBe('won');
    expect(g.mistakes).toBe(0);
    expect(g.hintsUsed).toBe(0); // the tutorial hint is free (02 §9.3)
    expect(h.save().stock.hints).toBe(0);
    expect(h.save()).toMatchObject({ tutorialDone: true, progress: { level: 2, completed: 1 } });
    expect(h.platform.writes.filter((w) => w.cloud === 'flush')).toHaveLength(1);
    expect(h.analytics).toContainEqual({ name: 'tutorial_done', params: { ms: expect.any(Number), skipped: 0 } });
    expect(h.analytics.filter((e) => e.name === 'tutorial_step').map((e) => e.params)).toEqual([
      { step: 1 },
      { step: 2 },
      { step: 3 },
      { step: 4 },
      { step: 5 },
      { step: 6 },
    ]);
    expect(h.router.isOpen('coach')).toBe(false);
    // phase2c §2.5: no counter, no flight, no ranking after the tutorial; the victory at 1 200.
    await h.settle(h.config.fx.win.replayVictoryAtMs - 1);
    expect(h.router.isOpen('victory')).toBe(false);
    await h.settle(1);
    expect(h.router.isOpen('ranking')).toBe(false);
    expect(h.router.props.victory).toMatchObject({ variant: 'tutorial', nextLevel: 2, pointsEarned: null, streak: null, kept: null });
    // The tutorial is scored for neither the period board nor the streak (§3.3).
    expect(h.save().period).toEqual({ key: '', total: 0, bestKey: '', bestTotal: 0 });
    expect(h.save().streak).toEqual({ current: 0, best: 0 });
    expect(h.save()).not.toHaveProperty('wallet');
    expect(h.router.game?.counters).toEqual([]);
    expect(h.analytics.some((e) => e.name === 'win_points')).toBe(false);
    h.log.length = 0;
    await h.session.onNext();
    expect(slice(h.log, /^(ad:|screen:)/)).toEqual(['screen:game:L2']);
  });

  it('scripted marks bypass the filter (step 2 "Got it" crosses out row 1 and column 2)', async () => {
    const h = firstRun();
    await begin(h);
    h.session.onCellDoubleTap(LAVENDER);
    h.session.onCoachGotIt();
    const marks = [0, 2, 3, 5, 9, 13];
    for (const c of marks) expect(h.game().cells[c]).toBe(CellState.Mark);
  });

  it('"I know how to play" applies the tutorial bookkeeping and loads Level 2', async () => {
    const h = firstRun();
    await begin(h);
    h.session.onSkipTutorial();
    await h.settle(0);
    expect(h.save()).toMatchObject({ tutorialDone: true, progress: { level: 2, completed: 1 } });
    expect(last(h.platform.writes)?.cloud).toBe('flush');
    expect(h.analytics).toContainEqual({ name: 'tutorial_done', params: { ms: 0, skipped: 1 } });
    expect(h.store.get().session?.puzzleId).toBe('L2');
  });

  it('a replay changes nothing and its win returns Home', async () => {
    const h = createHarness();
    const before = h.save();
    await begin(h, true);
    await playThrough(h);
    expect(h.game().status).toBe('won');
    expect(h.save().progress).toEqual(before.progress);
    expect(h.platform.writes.some((w) => w.cloud === 'flush')).toBe(false);
    await h.settle(h.config.fx.win.replayVictoryAtMs);
    expect(h.router.props.victory?.variant).toBe('tutorial_replay');
    expect(h.router.props.victory).toMatchObject({ kept: null, streak: null, pointsEarned: null });
    expect(h.save().period).toEqual(before.period);
    expect(h.save().streak).toEqual(before.streak);
    await h.session.onNext();
    expect(h.homeCalls).toBe(1);
    h.session.onSkipTutorial(); // not offered in a replay
    expect(h.save().progress).toEqual(before.progress);
  });
});

describe('tutorial: the coach lives in the lazy overlay chunk (04 §9)', () => {
  it('a coach that cannot load never dead-ends the tutorial: the "Got it" step moves on by itself', async () => {
    const h = firstRun();
    await begin(h);
    h.session.onCellDoubleTap(LAVENDER);
    expect(step(h)).toBe(2);
    h.log.length = 0;
    h.bus.emit('overlay:failed', { id: 'coach' }); // the chunk failed after its retries
    expect(step(h)).toBe(3);
    expect(slice(h.log, /^toast:/)).toHaveLength(1);
    expect(h.router.isOpen('coach')).toBe(true); // step 3's coach asks for the chunk again
    expect(h.router.props.coach).toMatchObject({ step: 3 });
  });

  it('step 5 cannot dead-end: when the hint card cannot load, the bulb applies the step directly', async () => {
    const h = firstRun();
    await begin(h);
    h.session.onCellDoubleTap(LAVENDER);
    h.session.onCoachGotIt();
    h.session.onPaint([4, 5, 6], 'mark');
    h.session.onCellDoubleTap(ROW2_CAT);
    expect(step(h)).toBe(5);
    h.router.chunkOk = false; // the lazy overlay chunk never loads (offline first run)
    await h.session.onBulb();
    expect(h.router.isOpen('hint')).toBe(false);
    expect(h.game().status).toBe('playing');
    expect(h.game().cells[HINT_CAT]).toBe(CellState.Cat);
    expect(step(h)).toBe(6);
    expect(h.save().stock.hints).toBe(0); // still free
    h.session.onCellDoubleTap(LAST_CAT);
    expect(h.game().status).toBe('won');
  });

  it('on any other step the failure only toasts; the step stays and the board outlines remain', async () => {
    const h = firstRun();
    await begin(h);
    h.bus.emit('overlay:failed', { id: 'coach' });
    expect(step(h)).toBe(1);
    expect(h.game().status).toBe('playing');
    h.session.onCellDoubleTap(LAVENDER); // still playable
    expect(step(h)).toBe(2);
  });
});
