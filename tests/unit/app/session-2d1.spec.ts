// Owner: G1 (Phase 2d.1)
// The session's phase 2d.1 parts (docs/phase2d/helpers-spec.md §7.3 G1 5–6, §7.6): openHint passes
// the board and the rects (cells, boardRect, cellRect); the tickers' lines from the player's save and
// the seed puzzleId:attempt; the `points` sound when the star lands (1 330 ms after POINTS, at once
// with reduced motion, cancelled by a Retry or a new board); UNITS_DONE's `unit_done` chime and its
// "… complete." line (no chime when the same action has REGION_DONE, and that region left out of the
// line), deferred for a mouse action to its anchor's landing; the pulse's idle time (board changes,
// START, a visibility return) and the per-attempt helper use; the kitty's fewest-candidates target.
import { describe, expect, it } from 'vitest';
import { pickTickerLines } from '../../../src/app/tickers';
import { feedbackFor } from '../../../src/app/session-effects';
import { mouseLandMs, mouseSeed, pickMouseCells } from '../../../src/game/mouse';
import { newGame } from '../../../src/game/factory';
import { CellState, type GameEvent, type SaveData } from '../../../src/game/types';
import { at, createHarness, levelPuzzle, loseGame, NOW, slice, SOL5, startLevel, WRONG5, type Harness, type HarnessOptions } from './harness';

const sfx = (h: Harness, re: RegExp): string[] => slice(h.log, re);

async function playing(h: Harness, level = 5): Promise<void> {
  await startLevel(h, level);
  h.log.length = 0;
  h.said.length = 0;
}

/** A Retry from a lost board (the revive used up first). */
async function retry(h: Harness): Promise<void> {
  await loseGame(h);
  await h.session.onContinue();
  h.session.onCellDoubleTap(WRONG5[3] as number);
  await h.settle(h.config.input.cellLockAfterCatMs + h.config.fx.failOverlayDelayMs);
  await h.session.onRetry();
  await h.settle(h.config.fx.boardEntryMs);
}

describe('openHint: the card gets the board and the rects (§3.2, §3.6)', () => {
  it('cells (the board when the hint opened), boardRect and cellRect from the game screen', async () => {
    const h = createHarness();
    await playing(h);
    h.session.onCellTap(WRONG5[0] as number);
    const board = { x: 10, y: 200, width: 300, height: 300 } as DOMRect;
    const tile = { x: 12, y: 202, width: 40, height: 40 } as DOMRect;
    const g = h.router.game;
    if (!g) throw new Error('no game screen');
    const asked: number[] = [];
    g.boardRect = () => board;
    g.cellRect = (cell) => (asked.push(cell), tile);
    await h.session.onBulb();
    const props = h.router.props.hint;
    expect(props).toBeDefined();
    expect(props?.cells).toBe(h.game().cells);
    expect(props?.cells?.[WRONG5[0] as number]).toBe(CellState.Mark);
    expect(props?.boardRect?.()).toBe(board);
    expect(props?.cellRect?.(7)).toBe(tile);
    expect(asked).toEqual([7]);
    // The sound, announcement and analytics are unchanged (2b).
    expect(sfx(h, /^sfx:hint_open$/)).toHaveLength(1);
  });
});

describe('tickers (§5.4, §5.5): the session picks the lines from the save and the seed', () => {
  const veteran = (s: SaveData): SaveData => ({
    ...s,
    progress: { level: 5, completed: 4, best: { 5: [95_000, 0] } },
    points: { total: 2016 },
  });

  it('a fresh level: pickTickerLines with the level, n, the save and the seed `${puzzleId}:0`', async () => {
    const h = createHarness({ save: veteran });
    await startLevel(h, 5);
    const got = h.router.game?.tickers ?? [];
    expect(got).toHaveLength(1);
    expect(got[0]?.[0]).toEqual({ key: 'ticker.best', ms: 95_000 });
    expect(got[0]).toEqual(
      pickTickerLines({
        save: h.save(),
        mode: 'level',
        level: 5,
        n: 5,
        hard: false,
        retry: false,
        dailyOpen: false, // 4 levels: the daily is still locked
        todayKey: '2026-10-07',
        seed: 'L5:0',
        now: NOW,
      }),
    );
  });

  it('a Retry: the Retry line and the next attempt in the seed', async () => {
    const h = createHarness({ save: veteran });
    await startLevel(h, 5);
    await retry(h);
    const got = h.router.game?.tickers ?? [];
    expect(got).toHaveLength(2);
    expect(got[1]?.[0]).toEqual({ key: 'toast.start.retry' });
    const expected = pickTickerLines({
      save: h.save(),
      mode: 'level',
      level: 5,
      n: 5,
      hard: false,
      retry: true,
      dailyOpen: false,
      todayKey: '2026-10-07',
      seed: 'L5:1',
      now: h.clock.now() - h.config.fx.boardEntryMs,
    });
    expect(got[1]?.[1]).toEqual(expected[1]);
  });

  it('the daily line when the daily is open (never on the daily itself)', async () => {
    const opts: HarnessOptions = { save: (s) => ({ ...s, progress: { level: 30, completed: 29, best: {} } }) };
    const seen = new Set<string>();
    for (let level = 30; level < 60; level++) {
      const h = createHarness(opts);
      await startLevel(h, level);
      for (const l of h.router.game?.tickers ?? []) seen.add(l[1].key);
    }
    expect(seen.has('ticker.daily')).toBe(true);
    const d = createHarness(opts);
    await d.session.start({ mode: 'daily', dateKey: '2026-10-07' });
    for (const l of d.router.game?.tickers ?? []) expect(l[1].key).not.toBe('ticker.daily');
  });
});

describe('the points sound (§2.5): when the star lands', () => {
  it('1 330 ms after POINTS (fx.points.starAtMs + 17 + flightMs); one per POINTS', async () => {
    const h = createHarness();
    await playing(h);
    h.session.onCellDoubleTap(SOL5[0] as number);
    expect(h.router.game?.played).toContain('POINTS');
    expect(1330).toBe(h.config.fx.points.starAtMs + 17 + h.config.fx.points.flightMs);
    await h.settle(1329);
    expect(sfx(h, /^sfx:points$/)).toEqual([]);
    await h.settle(1);
    expect(sfx(h, /^sfx:points$/)).toEqual(['sfx:points']);
    await h.settle(h.config.input.cellLockAfterCatMs);
    h.session.onCellDoubleTap(SOL5[1] as number);
    await h.settle(1330);
    expect(sfx(h, /^sfx:points$/)).toEqual(['sfx:points', 'sfx:points']);
    // A cat that does not score (its row scored before) has no POINTS and no sound.
    h.session.onCellDoubleTap(SOL5[1] as number); // removed
    await h.settle(h.config.input.cellLockAfterCatMs);
    h.session.onCellDoubleTap(SOL5[1] as number); // back: no points
    await h.settle(2000);
    expect(sfx(h, /^sfx:points$/)).toHaveLength(2);
  });

  it('reduced motion: at once (no star)', async () => {
    const h = createHarness();
    await playing(h);
    h.store.update((s) => ({ ...s, ui: { ...s.ui, reducedMotion: true } }));
    h.session.onCellDoubleTap(SOL5[0] as number);
    expect(sfx(h, /^sfx:points$/)).toEqual(['sfx:points']);
    await h.settle(2000);
    expect(sfx(h, /^sfx:points$/)).toEqual(['sfx:points']);
  });

  it('cancelled by a Retry (a props render of the board)', async () => {
    const h = createHarness({ caps: { interstitial: false } });
    await playing(h);
    h.session.onCellDoubleTap(SOL5[0] as number); // POINTS now: its star would land at 1 330
    for (const c of WRONG5.slice(0, 3)) h.session.onCellDoubleTap(c);
    expect(h.game().status).toBe('lost');
    await h.session.onRetry();
    expect(h.game().status).toBe('ready');
    await h.settle(2000);
    expect(sfx(h, /^sfx:points$/)).toEqual([]);
  });

  it('cancelled by a new board (a props render)', async () => {
    const h = createHarness();
    await playing(h);
    h.session.onCellDoubleTap(SOL5[0] as number);
    await h.settle(500);
    h.session.onHome();
    await h.settle(2000);
    expect(sfx(h, /^sfx:points$/)).toEqual([]);
  });
});

describe('UNITS_DONE feedback (§4.3)', () => {
  const g = { ...newGame(levelPuzzle(5), 'level'), status: 'playing' as const };
  const colors = Uint8Array.from([0, 1, 2, 3, 5]);

  it('feedbackFor: the unit_done chime (pitch = units − 1) and one "… complete." line', () => {
    const one: GameEvent = { type: 'UNITS_DONE', units: [{ kind: 'row', index: 0, anchor: 4 }] };
    expect(feedbackFor(one, g, colors, undefined, [one])).toEqual({ sfx: 'unit_done', sfxIndex: 0, announce: 'Row 1 complete.' });
    const two: GameEvent = {
      type: 'UNITS_DONE',
      units: [
        { kind: 'row', index: 4, anchor: 23 },
        { kind: 'col', index: 3, anchor: 23 },
        { kind: 'region', index: 4, anchor: 23 },
      ],
    };
    // Region 4 has palette index 5 here (colors[4]).
    expect(feedbackFor(two, g, colors, undefined, [two])).toEqual({ sfx: 'unit_done', sfxIndex: 2, announce: 'Row 5, column 4 and Lagoon complete.' });
  });

  it('no chime when the same action has REGION_DONE, and that region is left out of the line', () => {
    const units: GameEvent = {
      type: 'UNITS_DONE',
      units: [
        { kind: 'row', index: 4, anchor: 23 },
        { kind: 'region', index: 4, anchor: 23 },
      ],
    };
    const action: GameEvent[] = [{ type: 'CAT_PLACED', cell: 23, source: 'player' }, { type: 'REGION_DONE', region: 4 }, units];
    expect(feedbackFor(units, g, colors, undefined, action)).toEqual({ announce: 'Row 5 complete.' });
    const onlyRegion: GameEvent = { type: 'UNITS_DONE', units: [{ kind: 'region', index: 2, anchor: 8 }] };
    expect(feedbackFor(onlyRegion, g, colors, undefined, [{ type: 'REGION_DONE', region: 2 }, onlyRegion])).toEqual({});
  });

  it('in the session: the chime at once with the action, and the line joins the action\'s one utterance', async () => {
    const h = createHarness();
    await playing(h);
    h.session.onCellDoubleTap(SOL5[0] as number); // the cat of row 1 (region A done): no units yet
    await h.settle(h.config.input.cellLockAfterCatMs);
    h.said.length = 0;
    for (const c of [at(0, 1), at(0, 2), at(0, 3)]) h.session.onCellTap(c);
    expect(sfx(h, /^sfx:unit_done$/)).toEqual([]);
    h.session.onCellTap(at(0, 4));
    expect(sfx(h, /^sfx:unit_done$/)).toEqual(['sfx:unit_done']);
    expect(h.said[h.said.length - 1]).toBe('1 tile crossed out. Row 1 complete.');
    expect(h.router.game?.played.slice(-2)).toEqual(['MARKED', 'UNITS_DONE']);
  });

  it('a cat that completes its row AND its colour: the region chime only; the line names the row', async () => {
    const h = createHarness();
    await playing(h);
    // Row 1 crossed except its cat (0,0); region A = (0,0) (0,1) (1,0) (2,0): cross (1,0) and (2,0).
    for (const c of [at(0, 1), at(0, 2), at(0, 3), at(0, 4), at(1, 0), at(2, 0)]) h.session.onCellTap(c);
    h.log.length = 0;
    h.said.length = 0;
    h.session.onCellDoubleTap(SOL5[0] as number);
    expect(h.router.game?.played.slice(-4)).toEqual(['CAT_PLACED', 'POINTS', 'REGION_DONE', 'UNITS_DONE']);
    expect(sfx(h, /^sfx:(unit_done|region|cat)$/)).toEqual(['sfx:cat', 'sfx:region']);
    expect(h.said).toHaveLength(1);
    expect(h.said[0]).toMatch(/Row 1 complete\.$/);
    expect(h.said[0]).not.toMatch(/Coral complete/);
  });

  it('a mouse action: the chime waits for the anchor X to land (mouseLandMs of its visit index); the line does not', async () => {
    const h = createHarness();
    await playing(h);
    h.session.onCellDoubleTap(SOL5[0] as number);
    await h.settle(h.config.input.cellLockAfterCatMs);
    // Leave exactly two candidates on the whole board, both in row 1: the mouse crosses them both.
    const { n, solution } = h.game().puzzle;
    const keep = [at(0, 3), at(0, 4)];
    const rest = [...h.game().cells.keys()].filter((i) => solution[Math.floor(i / n)] !== i % n && !keep.includes(i));
    h.session.onPaint(rest, 'mark');
    const order = pickMouseCells(h.game(), 3, mouseSeed('L5', 0));
    expect([...order].sort((a, b) => a - b)).toEqual(keep);
    h.log.length = 0;
    h.said.length = 0;
    const played = h.router.game?.played ?? [];
    played.length = 0; // (the paint completed region A: its cat and every other tile crossed)
    let done = false;
    const p = h.session.onMouse().then(() => void (done = true));
    for (let i = 0; i < 50 && !played.includes('UNITS_DONE'); i++) await h.settle(0);
    expect(played).toEqual(['MARKED', 'UNITS_DONE']);
    expect(h.said).toEqual(['The mouse crossed out 2 tiles. Row 1 complete.']); // not deferred
    expect(sfx(h, /^sfx:unit_done$/)).toEqual([]);
    // The anchor is the X that lands last (visit index 1): 935 + 850.
    expect(mouseLandMs(1, h.config)).toBe(1785);
    await h.settle(1784);
    expect(sfx(h, /^sfx:unit_done$/)).toEqual([]);
    await h.settle(1);
    expect(sfx(h, /^sfx:unit_done$/)).toEqual(['sfx:unit_done']);
    for (let i = 0; i < 20 && !done; i++) await h.settle(500);
    await p;
  });
});

describe('the pulse through the session (§4.6)', () => {
  const pulse = (h: Harness) => h.router.game?.last.pulse;

  it('none until fx.helperPulse.idleMs after the board entry; a board change and a visibility return restart the idle time', async () => {
    const h = createHarness();
    await playing(h);
    expect(pulse(h)).toBeNull();
    await h.settle(4000);
    expect(pulse(h)).toBeNull();
    await h.settle(1000); // 5 s after START (the TICK re-renders)
    expect(pulse(h)).toBe('paw');
    h.session.onCellTap(WRONG5[0] as number);
    expect(pulse(h)).toBeNull();
    await h.settle(5000);
    expect(pulse(h)).toBe('bulb');
    h.bus.emit('pause', { reason: 'hidden' });
    await h.settle(30_000);
    h.bus.emit('resume', { reason: 'hidden' });
    expect(pulse(h)).toBeNull();
    await h.settle(5000);
    expect(pulse(h)).toBe('bulb');
  });

  it('none once a hint, the kitty or the mouse was used in the attempt; again after a Retry', async () => {
    const hint = createHarness();
    await playing(hint);
    await hint.session.onBulb();
    hint.session.onHintClose();
    await hint.settle(10_000);
    expect(hint.router.game?.last.pulse).toBeNull();

    const kitty = createHarness();
    await playing(kitty);
    await kitty.session.onPaw();
    await kitty.settle(10_000);
    expect(kitty.router.game?.last.pulse).toBeNull();

    const mouse = createHarness();
    await playing(mouse);
    let done = false;
    const p = mouse.session.onMouse().then(() => void (done = true));
    for (let i = 0; i < 60 && !done; i++) await mouse.settle(i < 30 ? 0 : 500);
    await p;
    await mouse.settle(10_000);
    expect(mouse.router.game?.last.pulse).toBeNull();
    await retry(mouse);
    expect(mouse.router.game?.last.pulse).toBeNull(); // the entry just ended
    await mouse.settle(5000);
    expect(mouse.router.game?.last.pulse).toBe('paw');
  });

  it('none with the suggested helper at 0 (the video badge), and the other does not take its place', async () => {
    const h = createHarness({ save: (s) => ({ ...s, stock: { hints: 2, kitties: 0 } }) });
    await playing(h);
    await h.settle(10_000);
    expect(h.router.game?.last.pulse).toBeNull();
    h.session.onCellTap(WRONG5[0] as number);
    await h.settle(5000);
    expect(h.router.game?.last.pulse).toBe('bulb');
  });
});

describe('the kitty (§2.3): the fewest-candidates target through the engine client', () => {
  it('our 5 × 5 on an empty board: regions A and D tie at 4 candidates; A\'s cell (0,0) comes first', async () => {
    const h = createHarness();
    await playing(h);
    await h.session.onPaw();
    expect(h.game().cells[SOL5[0] as number]).toBe(CellState.Cat);
    expect(h.router.game?.played).toContain('CAT_PLACED');
  });
});
