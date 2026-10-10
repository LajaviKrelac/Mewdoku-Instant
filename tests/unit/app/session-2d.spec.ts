// Owner: G1 (Phase 2d)
// The session's phase 2d parts (docs/phase2d/look-spec.md §5.1): the level-start toast on a fresh
// board and a Retry (never on a resumed board, a revive, a restored won / lost board or the tutorial);
// the mouse helper through the session (O2 'mouse' → rewarded video or the web's free fallback with its
// shared cooldown → MOUSE → one announcement, a mark sound per X, mouse_used); and the settings dot:
// every path that opens Settings (the game's gear, Home's, the event screen's) marks it seen.
import { describe, expect, it } from 'vitest';
import { bundledEventDefs, createEventFlow } from '../../../src/app/event-flow';
import { createShell, type Shell } from '../../../src/app/shell';
import { eventStart, type EventDef } from '../../../src/game/events';
import { mouseSeed, pickMouseCells } from '../../../src/game/mouse';
import { feedbackFor } from '../../../src/app/session-effects';
import { newGame } from '../../../src/game/factory';
import { CellState, type SaveData } from '../../../src/game/types';
import { t } from '../../../src/i18n';
import { createHarness, levelPuzzle, loseGame, NOW, slice, SOL5, startLevel, winGame, WRONG5, type Harness, type HarnessOptions } from './harness';

const toasts = (h: Harness): string[] => h.router.game?.startToasts ?? [];

/** After a revive (1 fish left): one more wrong cat (a tile loseGame did not use) loses again; O4 opens. */
async function loseAgain(h: Harness): Promise<void> {
  h.session.onCellDoubleTap(WRONG5[3] as number);
  await h.settle(h.config.input.cellLockAfterCatMs + h.config.fx.failOverlayDelayMs);
}

describe('level-start toast trigger (§1.14, D-2d-13)', () => {
  it("a fresh level: 'level', at the board entry (before START)", async () => {
    const h = createHarness();
    await startLevel(h, 5);
    expect(toasts(h)).toEqual(['level']);
    expect(slice(h.log, /^(startToast:|status:playing|sfx:board_in)/)).toEqual(['sfx:board_in', 'startToast:level', 'status:playing']);
  });

  it("a Hard level: 'hard'; a daily and an event puzzle: 'level'", async () => {
    const hard = createHarness({ save: (s) => ({ ...s, progress: { level: 30, completed: 29, best: {} } }) });
    await startLevel(hard, 30);
    expect(hard.store.get().session?.hard).toBe(true);
    expect(toasts(hard)).toEqual(['hard']);

    const daily = createHarness({ save: (s) => ({ ...s, progress: { level: 30, completed: 29, best: {} } }) });
    await daily.session.start({ mode: 'daily', dateKey: '2026-10-07' });
    expect(toasts(daily)).toEqual(['level']);

    const def = bundledEventDefs()[0] as EventDef;
    const ev = createHarness({
      save: (s) => ({ ...s, progress: { level: 30, completed: 29, best: {} } }),
      extra: () => ({ events: { byId: (id) => (id === def.id ? def : null) } }),
    });
    ev.clock.setNow(eventStart(def) + 3_600_000);
    await ev.session.start({ mode: 'event', eventId: def.id, index: 0 });
    expect(toasts(ev)).toEqual(['level']);
  });

  it("a Retry: 'retry'; a revive: no toast", async () => {
    const h = createHarness();
    await startLevel(h, 5);
    await loseGame(h);
    await h.session.onContinue(); // revive: the same attempt goes on
    expect(h.game().status).toBe('playing');
    expect(toasts(h)).toEqual(['level']);
    await loseAgain(h); // the second loss: no revive left
    expect(h.router.isOpen('fail')).toBe(true);
    await h.session.onRetry();
    expect(toasts(h)).toEqual(['level', 'retry']);
    await h.settle(h.config.fx.boardEntryMs);
    expect(h.game().status).toBe('playing');
  });

  it('never on a resumed board (a saved slot), a restored lost board, or the tutorial (first run and replay)', async () => {
    const h = createHarness();
    await startLevel(h, 5);
    h.session.onCellTap(1); // a mark: the slot is written
    h.session.onHome();
    expect(h.save().inProgress.level?.id).toBe('L5');
    await startLevel(h, 5);
    expect(h.game().cells[1]).toBe(CellState.Mark); // resumed
    expect(toasts(h)).toEqual([]);

    // A lost board saved by the top-bar Home before O4 shows reopens O4 on restore: no entry, no toast.
    const lost2 = createHarness();
    await startLevel(lost2, 5);
    for (const c of [1, 2, 5]) {
      lost2.session.onCellDoubleTap(c);
      await lost2.settle(lost2.config.input.cellLockAfterCatMs);
    }
    expect(lost2.game().status).toBe('lost');
    lost2.session.onHome(); // before O4: the board is saved
    await lost2.session.start({ mode: 'level', level: 5 });
    expect(lost2.router.isOpen('fail')).toBe(true);
    expect(toasts(lost2)).toEqual([]);

    const tut = createHarness({ save: (s) => ({ ...s, tutorialDone: false, progress: { level: 1, completed: 0, best: {} } }) });
    await tut.session.start({ mode: 'tutorial', replay: false });
    await tut.settle(tut.config.fx.boardEntryMs);
    expect(toasts(tut)).toEqual([]);
    const replay = createHarness();
    await replay.session.start({ mode: 'tutorial', replay: true });
    await replay.settle(replay.config.fx.boardEntryMs);
    expect(toasts(replay)).toEqual([]);
  });

  it('fx.startToast.enabled off: never', async () => {
    const h = createHarness({ config: { fx: { startToast: { enabled: false } } } });
    await startLevel(h, 5);
    await loseGame(h);
    await h.session.onContinue();
    await loseAgain(h);
    await h.session.onRetry();
    expect(h.game().status).toBe('ready');
    expect(toasts(h)).toEqual([]);
  });

  it('a game screen without playStartToast (optional until I-3) is fine', async () => {
    const h = createHarness();
    await h.session.start({ mode: 'level', level: 5 });
    const g = h.router.game;
    expect(g).not.toBeNull();
    await h.settle(h.config.fx.boardEntryMs);
    expect(h.game().status).toBe('playing');
  });
});

// ─────────────────────────────── the mouse (§1.12) ───────────────────────────────

const FLOW = /^(open:rewarded|close:rewarded|ad:rewarded|toast:|sfx:mark)/;
const mouseEvents = (h: Harness) => h.analytics.filter((e) => e.name === 'mouse_used');
const marks = (h: Harness): number[] => [...h.game().cells.keys()].filter((i) => h.game().cells[i] === CellState.Mark);

async function playing(h: Harness, level = 5): Promise<void> {
  await startLevel(h, level);
  h.log.length = 0;
  h.said.length = 0;
}

describe('the mouse through the session (§1.12, D-2d-12)', () => {
  it('O2 (placement mouse, video) → rewarded → MOUSE: 3 X marks off the solution, one line, mouse_used; no stock', async () => {
    const h = createHarness();
    await playing(h);
    const stock = h.save().stock;
    const expected = pickMouseCells(h.game(), 3, mouseSeed('L5', 0));
    await h.session.onMouse();
    expect(h.router.props.rewarded).toMatchObject({ placement: 'mouse', variant: 'video' });
    expect(slice(h.log, FLOW).slice(0, 3)).toEqual(['open:rewarded', 'close:rewarded', 'ad:rewarded:mouse']);
    expect(marks(h)).toEqual(expected);
    expect(expected).toHaveLength(3);
    for (const c of expected) expect(SOL5).not.toContain(c);
    expect(h.router.game?.played).toContain('MARKED');
    expect(h.said).toEqual(['The mouse crossed out 3 tiles.']);
    expect(mouseEvents(h)).toEqual([{ name: 'mouse_used', params: { mode: 'level', cells: 3 } }]);
    expect(h.analytics).toContainEqual({ name: 'ad_rewarded', params: { placement: 'mouse', result: 'ok' } });
    expect(h.save().stock).toEqual(stock); // no stock: nothing charged or granted
    expect(h.game()).toMatchObject({ hintsUsed: 0, kittiesUsed: 0, mistakes: 0, levelPoints: 0, status: 'playing' });
    // The X marks are in the saved slot like any mark.
    expect(h.save().inProgress.level?.cells.split('').filter((ch) => ch === '1')).toHaveLength(3);
  });

  it('the event the board gets carries source: mouse; a mark sound per X, fx.mouseStaggerMs apart', async () => {
    const h = createHarness();
    await playing(h);
    const events: unknown[] = [];
    h.bus.on('game:events', (e) => void events.push(...e.events));
    await h.session.onMouse();
    expect(events).toEqual([{ type: 'MARKED', cells: marks(h), source: 'mouse' }]);
    expect(slice(h.log, /^sfx:mark$/)).toHaveLength(1);
    await h.settle(h.config.fx.mouseStaggerMs);
    expect(slice(h.log, /^sfx:mark$/)).toHaveLength(2);
    await h.settle(h.config.fx.mouseStaggerMs);
    expect(slice(h.log, /^sfx:mark$/)).toHaveLength(3);
    await h.settle(1000);
    expect(slice(h.log, /^sfx:mark$/)).toHaveLength(3);
  });

  it("feedbackFor: the mouse's MARKED is one plural line (a11y.mouse) with the mark sound; a plain MARKED keeps a11y.marked", () => {
    const g = { ...newGame(levelPuzzle(5), 'level'), status: 'playing' as const };
    const colors = Uint8Array.from([0, 1, 2, 3, 5]);
    expect(feedbackFor({ type: 'MARKED', cells: [1], source: 'mouse' }, g, colors)).toMatchObject({
      sfx: 'mark',
      announce: 'The mouse crossed out 1 tile.',
    });
    expect(feedbackFor({ type: 'MARKED', cells: [1, 2, 3], source: 'mouse' }, g, colors).announce).toBe('The mouse crossed out 3 tiles.');
    expect(feedbackFor({ type: 'MARKED', cells: [1, 2] }, g, colors).announce).toBe('2 tiles crossed out.');
  });

  it('reduced motion: the X marks at once, one sound', async () => {
    const h = createHarness();
    await playing(h);
    h.store.update((s) => ({ ...s, ui: { ...s.ui, reducedMotion: true } }));
    await h.session.onMouse();
    await h.settle(1000);
    expect(slice(h.log, /^sfx:mark$/)).toHaveLength(1);
    expect(marks(h)).toHaveLength(3);
  });

  it('a second use picks with the next seed; a Retry restarts the count', async () => {
    const h = createHarness();
    await playing(h);
    await h.session.onMouse();
    const first = marks(h);
    const second = pickMouseCells(h.game(), 3, mouseSeed('L5', 1));
    await h.session.onMouse();
    expect(marks(h)).toEqual([...first, ...second].sort((a, b) => a - b));
    await loseGame(h);
    await h.session.onContinue();
    await loseAgain(h);
    await h.session.onRetry();
    await h.settle(h.config.fx.boardEntryMs);
    expect(marks(h)).toEqual([]);
    const fresh = pickMouseCells(h.game(), 3, mouseSeed('L5', 0));
    await h.session.onMouse();
    expect(marks(h)).toEqual(fresh);
  });

  it('"Not now", or a video that fails: nothing marked, no mouse_used', async () => {
    const h = createHarness();
    await playing(h);
    h.router.rewardedAnswer = 'decline';
    await h.session.onMouse();
    expect(marks(h)).toEqual([]);
    expect(slice(h.log, /^ad:/)).toEqual([]);
    h.router.rewardedAnswer = 'accept';
    h.platform.rewardedResults.push({ ok: false, reason: 'skipped' });
    await h.session.onMouse();
    expect(marks(h)).toEqual([]);
    expect(h.router.toasts).toEqual([t('rewarded.noVideo')]);
    expect(mouseEvents(h)).toEqual([]);
  });

  it('web (no rewarded ads): the free variant grants once, then the countdown, sharing the cooldown with hint and kitty', async () => {
    const h = createHarness({ caps: { rewarded: false, interstitial: false }, save: (s) => ({ ...s, stock: { hints: 0, kitties: 0 } }) });
    await playing(h);
    await h.session.onMouse();
    expect(h.router.props.rewarded).toMatchObject({ placement: 'mouse', variant: 'free' });
    expect(marks(h)).toHaveLength(3);
    const grantedAt = h.save().ads.lastFallbackGrantAt;
    expect(grantedAt).toBe(h.clock.now());
    expect(h.analytics).toContainEqual({ name: 'ad_rewarded', params: { placement: 'mouse', result: 'fallback' } });
    // Inside the shared cooldown: the mouse and the bulb only get the countdown.
    await h.session.onMouse();
    expect(h.router.props.rewarded).toMatchObject({ placement: 'mouse', variant: 'countdown', nextFreeAt: grantedAt + 600_000 });
    expect(marks(h)).toHaveLength(3);
    await h.session.onBulb();
    expect(h.router.props.rewarded).toMatchObject({ placement: 'hint', variant: 'countdown' });
    // After the cooldown the mouse is free again.
    await h.settle(600_000);
    await h.session.onMouse();
    expect(h.router.props.rewarded?.variant).toBe('free');
    expect(marks(h)).toHaveLength(6);
    expect(mouseEvents(h)).toHaveLength(2);
  });

  it('a hint grant starts the cooldown for the mouse too', async () => {
    const h = createHarness({ caps: { rewarded: false, interstitial: false }, save: (s) => ({ ...s, stock: { hints: 0, kitties: 0 } }) });
    await playing(h);
    await h.session.onBulb(); // the free hint
    h.session.onHintClose();
    await h.session.onMouse();
    expect(h.router.props.rewarded).toMatchObject({ placement: 'mouse', variant: 'countdown' });
    expect(marks(h)).toEqual([]);
  });

  it('the O2 chunk cannot load: the mouse.unavailable toast, nothing asked or shown', async () => {
    const h = createHarness();
    await playing(h);
    h.router.chunkOk = false;
    await h.session.onMouse();
    expect(h.router.toasts).toEqual([t('mouse.unavailable')]);
    expect(slice(h.log, /^(open:|ad:)/)).toEqual([]);
  });

  it('nothing at all: no tile left to cross out, not PLAYING, an overlay open, cfg.mouse.enabled off, the tutorial', async () => {
    const full = createHarness();
    await playing(full);
    const { n, solution } = full.game().puzzle;
    full.session.onPaint(
      [...full.game().cells.keys()].filter((i) => solution[Math.floor(i / n)] !== i % n),
      'mark',
    );
    full.log.length = 0;
    await full.session.onMouse();
    expect(slice(full.log, /^(open:|ad:)/)).toEqual([]);

    const ready = createHarness();
    await ready.session.start({ mode: 'level', level: 5 }); // still READY (board entry)
    await ready.session.onMouse();
    expect(slice(ready.log, /^(open:rewarded|ad:)/)).toEqual([]);

    const modal = createHarness();
    await playing(modal);
    modal.router.open('settings', {} as never);
    await modal.session.onMouse();
    expect(slice(modal.log, /^(open:rewarded|ad:)/)).toEqual([]);

    const off = createHarness({ config: { mouse: { enabled: false } } });
    await playing(off);
    await off.session.onMouse();
    expect(slice(off.log, /^(open:|ad:)/)).toEqual([]);
    expect(off.router.game?.last.mouse).toEqual({ shown: false, enabled: false });

    const tut = createHarness({ save: (s) => ({ ...s, tutorialDone: false, progress: { level: 1, completed: 0, best: {} } }) });
    await tut.session.start({ mode: 'tutorial', replay: false });
    await tut.settle(tut.config.fx.boardEntryMs);
    for (const step of [1, 2, 3]) {
      tut.store.update((s) => (s.session ? { ...s, session: { ...s.session, tutorialStep: step } } : s));
      await tut.session.onMouse();
    }
    expect(slice(tut.log, /^(open:rewarded|ad:)/)).toEqual([]);
    expect(tut.router.game?.last.mouse?.shown).toBe(false);
  });

  it('the game screen callback and the view: onMouse is bound; mouse shown and enabled while playing', async () => {
    const h = createHarness();
    await playing(h);
    expect(h.router.game?.last.mouse).toEqual({ shown: true, enabled: true });
    h.router.game?.cb.onMouse?.();
    for (let i = 0; i < 10 && marks(h).length === 0; i++) await h.settle(1);
    expect(marks(h)).toHaveLength(3);
    // The second level of the daily is allowed too (kittyAllowed modes).
    const d = createHarness({ save: (s) => ({ ...s, progress: { level: 30, completed: 29, best: {} } }) });
    await d.session.start({ mode: 'daily', dateKey: '2026-10-07' });
    await d.settle(d.config.fx.boardEntryMs);
    await d.session.onMouse();
    expect(d.analytics.filter((e) => e.name === 'mouse_used')).toEqual([{ name: 'mouse_used', params: { mode: 'daily', cells: 3 } }]);
  });

  it('the X marks behave like the player\'s own: no win, no mistake, cleared by a tap', async () => {
    const h = createHarness();
    await playing(h);
    await h.session.onMouse();
    const [first] = marks(h);
    h.session.onCellTap(first as number);
    expect(h.game().cells[first as number]).toBe(CellState.Empty);
    winGame(h);
    expect(h.game().status).toBe('won');
    expect(levelPuzzle(5).n).toBe(5);
  });
});

// ─────────────────────────────── the settings dot (§1.15) ───────────────────────────────

describe('the settings dot: every path that opens Settings marks it seen (§1.15, critic C16)', () => {
  const DEFS = bundledEventDefs();
  const LANTERN = DEFS[0] as EventDef;

  function setup(save: (s: SaveData) => SaveData = (s) => s, opts: HarnessOptions = {}) {
    let shell: Shell | null = null;
    const h = createHarness({
      ...opts,
      save: (s) => save({ ...s, progress: { level: 15, completed: 14, best: {} } }),
      extra: () => ({
        events: { byId: (id) => DEFS.find((d) => d.id === id) ?? null },
        openSettings: () => shell?.openSettings(),
      }),
    });
    h.clock.setNow(eventStart(LANTERN) + 3_600_000);
    const events = createEventFlow({ store: h.store, defs: DEFS, now: () => h.clock.now(), loadChunk: async () => ({}) as never });
    shell = createShell({
      store: h.store,
      bus: h.bus,
      clock: h.clock,
      router: h.router,
      platform: h.platform,
      saves: h.saves,
      session: () => h.session,
      audio: { setMuted: () => undefined },
      applyReducedMotion: () => false,
      version: 'test',
      events,
      ...(opts.config ? { config: h.config } : {}),
    });
    return { h, shell: shell as Shell };
  }
  const seen = (h: Harness): unknown => h.save().ext.settingsSeen;

  it("Home's gear: the dot shows until Settings opens; then settingsSeen = settingsDot.version, saved at once", async () => {
    const { h, shell } = setup();
    shell.showHome();
    expect(h.router.homeView?.settingsDot).toBe(true);
    h.log.length = 0;
    h.router.homeCb?.onSettings();
    expect(h.router.isOpen('settings')).toBe(true);
    expect(seen(h)).toBe(1);
    expect(slice(h.log, /^save:now/)).toHaveLength(1); // saved at once (saves.now)
    expect(h.router.homeView?.settingsDot).toBe(false);
    // Opening it again changes nothing and writes nothing.
    h.router.close('settings');
    h.log.length = 0;
    h.router.homeCb?.onSettings();
    expect(slice(h.log, /^save:/)).toEqual([]);
  });

  it("the game's gear: the game view's dot clears", async () => {
    const { h } = setup();
    await startLevel(h, 15);
    expect(h.router.game?.last.settingsDot).toBe(true);
    h.router.game?.cb.onSettings();
    expect(h.router.isOpen('settings')).toBe(true);
    expect(seen(h)).toBe(1);
    expect(h.router.game?.last.settingsDot).toBe(false);
  });

  it("the event screen's gear", async () => {
    const { h, shell } = setup();
    await shell.showEvent(LANTERN);
    await h.settle(0);
    expect(h.router.eventView?.settingsDot).toBe(true);
    h.router.eventCb?.onSettings();
    expect(seen(h)).toBe(1);
    expect(h.router.eventView?.settingsDot).toBe(false);
  });

  it('any other router.open("settings") counts too; a player who has seen it keeps no dot', async () => {
    const { h, shell } = setup((s) => ({ ...s, ext: { settingsSeen: 1 } }));
    shell.showHome();
    expect(h.router.homeView?.settingsDot).toBe(false);
    const other = setup();
    other.h.router.open('settings', {} as never);
    expect(seen(other.h)).toBe(1);
  });

  it('a newer Settings change (settingsDot.version 2) shows the dot again until opened', async () => {
    const { h, shell } = setup((s) => ({ ...s, ext: { settingsSeen: 1 } }), { config: { settingsDot: { version: 2 } } });
    shell.showHome();
    expect(h.router.homeView?.settingsDot).toBe(true);
    shell.openSettings();
    expect(seen(h)).toBe(2);
    expect(h.router.homeView?.settingsDot).toBe(false);
    expect(newGame(levelPuzzle(5), 'level').status).toBe('ready');
    expect(NOW).toBeGreaterThan(0);
  });
});
