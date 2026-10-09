// Owner: C. Events in the app (phase2b §4.4, §4.5, §4.9): the Home card states (teaser, active,
// locked, done, ends soon), the event screen view, an event session (slot E<id>/<i>, save and
// restore, hearts modifier, event_start), its win (record, milestone, period points, level points, the victory's
// event variant), the event_next interstitial and "Back to event", and the slot cleared after the end.
import { afterEach, describe, expect, it } from 'vitest';
import { createEventFlow, bundledEventDefs } from '../../../src/app/event-flow';
import { setFlagOverrides } from '../../../src/app/flags';
import { createStore, initialAppState, type AppState } from '../../../src/app/store';
import { selectEventCard, selectEventView, selectHomeView, type ViewContext } from '../../../src/app/views';
import { eventEnd, eventStart, type EventDef } from '../../../src/game/events';
import { defaults } from '../../../src/game/save';
import type { InProgressV2, SaveData } from '../../../src/game/types';
import { t } from '../../../src/i18n';
import { createHarness, SOL5, WRONG5, type Harness, tapRanking } from './harness';

const DEFS = bundledEventDefs();
const LANTERN = DEFS[0] as EventDef;
const H = 3_600_000;
const START = eventStart(LANTERN);

afterEach(() => setFlagOverrides({}));

function state(patch: Partial<SaveData> = {}): AppState {
  return initialAppState({ ...defaults(START), tutorialDone: true, progress: { level: 15, completed: 14, best: {} }, ...patch });
}
const ctx = (now: number): ViewContext => ({
  now,
  capabilities: { interstitial: false, rewarded: false, banner: false, cloudSave: false, leaderboards: false, share: false, payments: false, overlayViews: false, groups: false, haptics: false },
  platformId: 'web',
  events: DEFS,
});

describe('Home event card (§4.4)', () => {
  it('teaser within 72 h (not tappable), nothing before', () => {
    expect(selectEventCard(state(), ctx(START - 73 * H))).toBeNull();
    expect(selectEventCard(state(), ctx(START - 2 * H))).toMatchObject({ state: 'teaser', startsAt: START, solved: 0, total: 21, endsSoon: false });
  });

  it('active with progress; "ends soon" in the last 48 h; done when all 21 are solved', () => {
    const s = state({ events: { [LANTERN.id]: { solved: 7, ms: 1000, lastAt: START } } });
    expect(selectEventCard(s, ctx(START + H))).toMatchObject({ state: 'active', solved: 7, total: 21, endsSoon: false });
    expect(selectEventCard(s, ctx(eventEnd(LANTERN) - 47 * H))?.endsSoon).toBe(true);
    const done = state({ events: { [LANTERN.id]: { solved: 21, ms: 1000, lastAt: START } } });
    expect(selectEventCard(done, ctx(START + H))?.state).toBe('done');
  });

  it('locked until progress.level passes the unlock level ("Opens after level 10")', () => {
    const early = state({ progress: { level: 10, completed: 9, best: {} } });
    expect(selectEventCard(early, ctx(START + H))).toMatchObject({ state: 'locked', unlockLevel: 10 });
    const ok = state({ progress: { level: 11, completed: 10, best: {} } });
    expect(selectEventCard(ok, ctx(START + H))?.state).toBe('active');
  });

  it('gone after the end; off with the events flag; part of the Home view', () => {
    expect(selectEventCard(state(), ctx(eventEnd(LANTERN)))).toBeNull();
    setFlagOverrides({ events: false });
    expect(selectEventCard(state(), ctx(START + H))).toBeNull();
    setFlagOverrides({});
    expect(selectHomeView(state(), ctx(START + H)).event?.def.id).toBe(LANTERN.id);
  });

  it('the event screen view: track nodes reached, the next puzzle, the end time', () => {
    const v = selectEventView(state({ events: { [LANTERN.id]: { solved: 7, ms: 1000, lastAt: START } } }), ctx(START + H));
    expect(v).toMatchObject({ solved: 7, total: 21, nextIndex: 7, endsAt: eventEnd(LANTERN) });
    expect(v?.track.map((n) => n.reached)).toEqual([true, true, false, false, false]);
    expect(selectEventView(state({ events: { [LANTERN.id]: { solved: 21, ms: 1, lastAt: 1 } } }), ctx(START + H))?.nextIndex).toBeNull();
    expect(selectEventView(state(), ctx(START - H))).toBeNull();
  });
});

describe('event-flow (§4.4)', () => {
  it('active / teaser / byId, and the slot of an ended event cleared at launch', () => {
    const slot: InProgressV2 = { id: `E${LANTERN.id}/3`, mode: 'event', cells: '0', hearts: 3, revivesUsed: 0, mistakes: 0, hintsUsed: 0, kittiesUsed: 0, elapsedMs: 1, savedAt: 1 };
    const store = createStore<AppState>(state({ inProgress: { level: null, daily: null, event: slot } }));
    let now = START + H;
    const flow = createEventFlow({ store, defs: DEFS, now: () => now, loadChunk: async () => ({}) as never });
    expect(flow.active()?.id).toBe(LANTERN.id);
    expect(flow.byId('snow-paws-2026')?.id).toBe('snow-paws-2026');
    expect(flow.clearEnded()).toBe(false);
    now = eventEnd(LANTERN);
    expect(flow.active()).toBeNull();
    expect(flow.clearEnded()).toBe(true);
    expect(store.get().save.inProgress.event).toBeNull();
  });

  it('preload never rejects and retries after a failure', async () => {
    let n = 0;
    const flow = createEventFlow({
      store: createStore<AppState>(state()),
      defs: DEFS,
      now: () => START,
      loadChunk: async () => {
        n++;
        if (n === 1) throw new Error('offline');
        return { createEventScreen: () => null } as never;
      },
    });
    expect(await flow.preload()).toBeNull();
    expect(await flow.preload()).not.toBeNull();
  });
});

describe('event sessions (§4.4, §4.5)', () => {
  function eventHarness(save: (s: SaveData) => SaveData = (s) => s): Harness & { events: string[] } {
    const events: string[] = [];
    const h = createHarness({
      save: (s) => save({ ...s, progress: { level: 15, completed: 14, best: {} }, ads: { lastAdAt: 0, lastFallbackGrantAt: 0 } }),
      extra: () => ({
        events: {
          byId: (id) => DEFS.find((d) => d.id === id) ?? null,
          preload: () => (events.push('preload'), Promise.resolve(null)),
        },
        goEvent: (def) => void events.push(`goEvent:${def.id}`),
      }),
    });
    h.clock.setNow(START + H);
    return Object.assign(h, { events });
  }

  async function play(h: Harness, index: number): Promise<void> {
    await h.session.start({ mode: 'event', eventId: LANTERN.id, index });
    await h.settle(h.config.fx.boardEntryMs);
  }

  it('mounts E<id>/<i> in event mode, logs event_start, saves progress in inProgress.event', async () => {
    const h = eventHarness();
    await play(h, 0);
    expect(h.game().puzzle.id).toBe(`E${LANTERN.id}/0`);
    expect(h.store.get().session?.event).toEqual({ def: LANTERN, index: 0 });
    expect(h.analytics).toContainEqual({ name: 'event_start', params: { id: LANTERN.id, index: 0, size: 5 } });
    h.session.onCellTap(WRONG5[3] as number);
    expect(h.save().inProgress.event?.id).toBe(`E${LANTERN.id}/0`);
    expect(h.router.game?.last.event).toEqual({ def: LANTERN, index: 0 });
    // The accessory symbols are in the lazy events chunk: an event board starts loading it (A's request).
    expect(h.events).toContain('preload');
  });

  it('a saved event slot is restored when the same puzzle opens again', async () => {
    const h = eventHarness();
    await play(h, 0);
    h.session.onCellTap(WRONG5[3] as number);
    h.session.onHome();
    await play(h, 0);
    expect(h.game().cells[WRONG5[3] as number]).toBe(1);
  });

  it('a hearts modifier applies (rules.hearts)', async () => {
    const two = { ...LANTERN, rules: { hearts: 2 } };
    const h = createHarness({ extra: () => ({ events: { byId: () => two } }) });
    h.clock.setNow(START + H);
    await h.session.start({ mode: 'event', eventId: two.id, index: 0 });
    expect(h.game().hearts).toBe(2);
  });

  it('a win counts the puzzle, adds its kept fish to this period and level points, and the victory shows the event variant (D5, D7)', async () => {
    const h = eventHarness((s) => ({ ...s, events: { [LANTERN.id]: { solved: 2, ms: 50_000, lastAt: 1 } } }));
    await play(h, 2);
    for (const c of SOL5) h.session.onCellDoubleTap(c);
    expect(h.save().events[LANTERN.id]?.solved).toBe(3);
    expect(h.save().period.total).toBe(3); // the fish kept go to this period's board in every scored mode
    expect(h.save().streak.current).toBe(1);
    expect(h.save()).not.toHaveProperty('wallet');
    expect(h.save().stock.hints).toBe(5 + 2); // the 3-puzzle milestone: +2 hints at once
    expect(h.save().points.total).toBe(5 * 10 + 10);
    expect(h.analytics).toContainEqual({ name: 'event_milestone', params: { id: LANTERN.id, at: 3 } });
    await h.settle(h.config.fx.winOverlayDelayMs);
    // phase2c §2.6: the post-win panel shows the period board in every mode (the event board stays on the event screen).
    expect(h.router.props.ranking).toMatchObject({ board: 'period', eventNameKey: null, result: { kind: 'period', gained: 3, total: 3 } });
    await tapRanking(h);
    expect(h.router.props.victory?.event).toMatchObject({ index: 2, total: 21, solvedBefore: 2, solvedAfter: 3, reward: { hints: 2 }, last: false });
  });

  it('"Puzzle {i+1}" passes the event_next gate, then opens the next puzzle', async () => {
    const h = eventHarness();
    await play(h, 0);
    for (const c of SOL5) h.session.onCellDoubleTap(c);
    await h.settle(h.config.fx.winOverlayDelayMs);
    h.log.length = 0;
    await h.session.onNext();
    expect(h.log.filter((l) => /^(ad:|screen:)/.test(l))).toEqual(['ad:interstitial:event_next', `screen:game:E${LANTERN.id}/1`]);
  });

  it('after the 21st: "Back to event" (gate, then the event screen)', async () => {
    const h = eventHarness((s) => ({ ...s, events: { [LANTERN.id]: { solved: 20, ms: 1, lastAt: 1 } } }));
    await play(h, 20);
    for (const c of SOL5) h.session.onCellDoubleTap(c);
    await h.settle(h.config.fx.winOverlayDelayMs);
    await tapRanking(h);
    expect(h.router.props.victory?.event?.last).toBe(true);
    await h.session.onNext();
    expect(h.events.filter((e) => e !== 'preload')).toEqual([`goEvent:${LANTERN.id}`]);
    expect(h.store.get().game).toBeNull();
  });

  it('L2B-4: a puzzle won after the end offers "Back to event"; onNext goes there, with no start and no error toast', async () => {
    const h = eventHarness();
    await play(h, 0);
    h.clock.setNow(eventEnd(LANTERN) + 1000); // the event ended mid-puzzle
    for (const c of SOL5) h.session.onCellDoubleTap(c);
    await h.settle(h.config.fx.winOverlayDelayMs);
    await tapRanking(h);
    expect(h.router.props.victory?.event).toMatchObject({ solvedAfter: 1, total: 21, last: true });
    h.log.length = 0;
    await h.session.onNext();
    expect(h.log.filter((l) => l.startsWith('screen:game'))).toEqual([]);
    expect(h.events.filter((e) => e !== 'preload')).toEqual([`goEvent:${LANTERN.id}`]);
    expect(h.router.toasts).not.toContain(t('toast.error'));
    expect(h.store.get().game).toBeNull();
  });

  it('an event that has ended cannot start: toast and Home', async () => {
    const h = eventHarness();
    h.clock.setNow(eventEnd(LANTERN));
    await h.session.start({ mode: 'event', eventId: LANTERN.id, index: 0 });
    expect(h.homeCalls).toBe(1);
    expect(h.store.get().game).toBeNull();
  });
});
