// Owner: C. Limited-time events (phase2b §4.2–§4.4, §4.9): schema validation (ids, dates ordered,
// no overlap, track ascending, i18n keys exist, theme contrast), activeEvent / teaserEvent before,
// during, at the end instant and after, applyEventWin idempotent per index, milestones granted once,
// the hearts modifier, the size schedule and the slot clean-up after the end.
import { describe, expect, it } from 'vitest';
import { cfg, mergeConfig } from '../../../src/app/config';
import rawEvents from '../../../src/data/events/events.json';
import {
  activeEvent,
  applyEventWin,
  applyReward,
  clearEndedEventSlot,
  eventBoardKey,
  eventEnd,
  eventPuzzleId,
  eventRules,
  eventSizeSchedule,
  eventSpec,
  eventStart,
  milestonesBetween,
  sumRewards,
  teaserEvent,
  validateEventDef,
  validateEventDefs,
  type EventDef,
  type Reward,
} from '../../../src/game/events';
import { defaults } from '../../../src/game/save';
import type { InProgressV2, SaveData } from '../../../src/game/types';
import { isI18nKey } from '../../../src/i18n';
import { wonState } from './fixtures';

const DEFS = validateEventDefs(rawEvents).defs;
const LANTERN = DEFS.find((d) => d.id === 'lantern-walk-2026') as EventDef;
const H = 3_600_000;

function hex(c: string): [number, number, number] {
  const x = parseInt(c.slice(1), 16);
  return [(x >> 16) & 255, (x >> 8) & 255, x & 255];
}
function lum([r, g, b]: [number, number, number]): number {
  const f = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: string, b: string): number {
  const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

describe('events.json (our three events, §4.3)', () => {
  it('validates with no errors: ids, dates ordered, track ascending, leaderboard keys, no overlap', () => {
    const { defs, errors } = validateEventDefs(rawEvents);
    expect(errors).toEqual([]);
    expect(defs.map((d) => d.id)).toEqual(['lantern-walk-2026', 'snow-paws-2026', 'yarn-hearts-2027']);
  });

  it('dates, counts, unlock and the shared milestone track are the spec values', () => {
    expect(LANTERN.startUtc).toBe('2026-11-13T00:00Z');
    expect(eventEnd(LANTERN) - eventStart(LANTERN)).toBe(14 * 24 * H);
    for (const d of DEFS) {
      expect(d.puzzles.count).toBe(21);
      expect(d.unlockAfterLevel).toBe(10);
      expect(d.rules?.hearts).toBeUndefined();
      // phase2c §5.5: the milestone fish became hints and kitties at the old swap rates.
      expect(d.track).toEqual([
        { at: 3, reward: { hints: 2 } },
        { at: 7, reward: { hints: 2 } },
        { at: 12, reward: { kitties: 2 } },
        { at: 16, reward: { hints: 2, kitties: 1 } },
        { at: 21, reward: { hints: 3, kitties: 5 } },
      ]);
      expect(d.leaderboard).toBe(eventBoardKey(d.id));
      expect(d.puzzles.file).toBe(`events/${d.id}.json`);
    }
  });

  it('every name and tagline key exists in the English catalogue', () => {
    for (const d of DEFS) {
      expect(isI18nKey(d.nameKey)).toBe(true);
      expect(isI18nKey(d.taglineKey)).toBe(true);
    }
  });

  it('theme contrast: --ink-2 (#665E6C) ≥ 4.5 on every event page; the board card is light', () => {
    for (const d of DEFS) {
      expect(contrast('#665E6C', d.theme.page)).toBeGreaterThanOrEqual(4.5);
      expect(contrast('#2F2A35', d.theme.boardCard)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the event names are ours (never the original event names)', () => {
    const text = JSON.stringify(rawEvents).toLowerCase();
    for (const banned of ['meow cup', 'long live meow', 'moonlit meows', 'golden fish']) expect(text).not.toContain(banned);
  });
});

describe('validateEventDef rejects', () => {
  const good = (): Record<string, unknown> => JSON.parse(JSON.stringify(LANTERN)) as Record<string, unknown>;
  const ROWS: { what: string; patch: (d: Record<string, unknown>) => void; error: RegExp }[] = [
    { what: 'a bad id', patch: (d) => (d.id = 'Bad_ID'), error: /^id/ },
    { what: 'end before start', patch: (d) => (d.endUtc = '2026-11-01T00:00Z'), error: /^dates/ },
    { what: 'a non-UTC date', patch: (d) => (d.startUtc = '2026-11-13'), error: /^startUtc/ },
    { what: 'a descending track', patch: (d) => ((d.track as { at: number }[])[1] = { at: 2, reward: { hints: 1 } } as never), error: /not ascending/ },
    { what: 'a milestone beyond the count', patch: (d) => ((d.track as unknown[]).push({ at: 22, reward: { hints: 1 } })), error: /beyond/ },
    { what: 'an empty reward', patch: (d) => ((d.track as unknown[])[0] = { at: 3, reward: {} }), error: /empty reward/ },
    // phase2c §5.5: fish are lives, not a reward; a fish reward is unknown (and alone it is empty).
    { what: 'a fish reward', patch: (d) => ((d.track as unknown[])[1] = { at: 7, reward: { fish: 30, hints: 1 } }), error: /fish: unknown reward/ },
    { what: 'a wrong leaderboard', patch: (d) => (d.leaderboard = 'event_other'), error: /^leaderboard/ },
    { what: 'a theme colour that is not hex', patch: (d) => ((d.theme as Record<string, unknown>).page = 'orange'), error: /theme.page/ },
    { what: 'an unknown page art', patch: (d) => ((d.theme as Record<string, unknown>).pageArt = 'stars'), error: /pageArt/ },
    { what: 'a pack file of another event', patch: (d) => ((d.puzzles as Record<string, unknown>).file = 'events/snow-paws-2026.json'), error: /puzzles.file/ },
    { what: 'a bad hearts modifier', patch: (d) => (d.rules = { hearts: 0 }), error: /rules.hearts/ },
    { what: 'a bad gen band', patch: (d) => ((d.gen as Record<string, unknown>).band = [4, 2]), error: /gen.band/ },
  ];
  it.each(ROWS)('$what', ({ patch, error }) => {
    const d = good();
    patch(d);
    const r = validateEventDef(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => error.test(e))).toBe(true);
  });

  it('overlapping or duplicate events', () => {
    const a = JSON.parse(JSON.stringify(LANTERN)) as Record<string, unknown>;
    const b = { ...a, id: 'lantern-two', leaderboard: 'event_lantern_two', puzzles: { file: 'events/lantern-two.json', count: 21 }, startUtc: '2026-11-20T00:00Z', endUtc: '2026-11-30T00:00Z' };
    expect(validateEventDefs([a, b]).errors.join()).toMatch(/overlap/);
    expect(validateEventDefs([a, a]).errors.join()).toMatch(/duplicate/);
    expect(validateEventDefs('nope').errors).toEqual(['events: not an array']);
  });
});

describe('activeEvent / teaserEvent (§4.4, device clock)', () => {
  const start = eventStart(LANTERN);
  const end = eventEnd(LANTERN);
  it('before, at the start instant, during, at the end instant and after', () => {
    expect(activeEvent(DEFS, start - 1)).toBeNull();
    expect(activeEvent(DEFS, start)?.id).toBe('lantern-walk-2026');
    expect(activeEvent(DEFS, end - 1)?.id).toBe('lantern-walk-2026');
    expect(activeEvent(DEFS, end)).toBeNull(); // end is exclusive
    expect(activeEvent(DEFS, Date.UTC(2026, 11, 25))?.id).toBe('snow-paws-2026');
    expect(activeEvent(DEFS, Date.UTC(2030, 0, 1))).toBeNull();
  });

  it('teases the next event within 72 h, never one already running', () => {
    expect(teaserEvent(DEFS, start - 72 * H - 1)).toBeNull();
    expect(teaserEvent(DEFS, start - 72 * H)?.id).toBe('lantern-walk-2026');
    expect(teaserEvent(DEFS, start - 1)?.id).toBe('lantern-walk-2026');
    expect(teaserEvent(DEFS, start)).toBeNull();
    expect(teaserEvent(DEFS, start - 100 * H, mergeConfig({ events: { teaseHours: 120 } }))?.id).toBe('lantern-walk-2026');
  });
});

describe('applyEventWin (§4.3)', () => {
  const NOW = eventStart(LANTERN) + 5 * H;
  const won = wonState(undefined, 'event');
  const at = (solved: number, extra: Partial<SaveData> = {}): SaveData => ({
    ...defaults(NOW),
    events: solved > 0 ? { [LANTERN.id]: { solved, ms: 1000 * solved, lastAt: NOW - H } } : {},
    ...extra,
  });

  it('counts the next puzzle once, adds its ms and sets lastAt', () => {
    const r = applyEventWin(at(0), LANTERN, 0, won, NOW);
    expect(r.counted).toBe(true);
    expect(r.solvedBefore).toBe(0);
    expect(r.solvedAfter).toBe(1);
    expect(r.save.events[LANTERN.id]).toEqual({ solved: 1, ms: Math.round(won.elapsedMs), lastAt: NOW });
    expect(r.milestones).toEqual([]);
  });

  it('idempotent per index: the same puzzle again changes nothing', () => {
    const once = applyEventWin(at(0), LANTERN, 0, won, NOW).save;
    const twice = applyEventWin(once, LANTERN, 0, won, NOW + 1);
    expect(twice.counted).toBe(false);
    expect(twice.save.events).toEqual(once.events);
  });

  it('a milestone is granted at once, exactly once (3 → +2 hints; 7 → +2 hints; 16 → +2 hints +1 kitty; 21 → +3 hints +5 kitties)', () => {
    const s2 = at(2);
    const r = applyEventWin(s2, LANTERN, 2, won, NOW);
    expect(r.milestones.map((m) => m.at)).toEqual([3]);
    expect(r.save.stock.hints).toBe(s2.stock.hints + 2);
    expect(applyEventWin(r.save, LANTERN, 2, won, NOW).save.stock.hints).toBe(s2.stock.hints + 2);
    const st = defaults(NOW).stock;
    const r7 = applyEventWin(at(6), LANTERN, 6, won, NOW);
    expect(r7.save.stock).toEqual({ hints: st.hints + 2, kitties: st.kitties });
    expect(r7.save).not.toHaveProperty('wallet');
    const r16 = applyEventWin(at(15), LANTERN, 15, won, NOW);
    expect(r16.save.stock).toEqual({ hints: st.hints + 2, kitties: st.kitties + 1 });
    const r21 = applyEventWin(at(20), LANTERN, 20, won, NOW);
    expect(r21.save.stock).toEqual({ hints: st.hints + 3, kitties: st.kitties + 5 });
    expect(applyEventWin(r21.save, LANTERN, 21, won, NOW).counted).toBe(false); // past the count
  });

  it('applyReward never grants fish, even from an old def that still lists them (phase2c §5.5)', () => {
    const s = defaults(NOW);
    // Reward.fish was deleted at I-3; a stray old def object must still grant hints and kitties only.
    const stray = (r: Record<string, number>): Reward => r as unknown as Reward;
    const out = applyReward(s, stray({ fish: 30, hints: 1 }));
    expect(out).not.toHaveProperty('wallet');
    expect(out.stock).toEqual({ hints: s.stock.hints + 1, kitties: s.stock.kitties });
    expect(applyReward(s, stray({ fish: 30 }))).toBe(s);
    expect(sumRewards([stray({ fish: 30 }), { hints: 2 }])).toEqual({ hints: 2 });
  });

  it('clears this puzzle\'s slot; another index never counts', () => {
    const slot: InProgressV2 = { id: eventPuzzleId(LANTERN.id, 4), mode: 'event', cells: '0', hearts: 3, revivesUsed: 0, mistakes: 0, hintsUsed: 0, kittiesUsed: 0, elapsedMs: 1, savedAt: 1 };
    const s = at(4, { inProgress: { level: null, daily: null, event: slot } });
    const r = applyEventWin(s, LANTERN, 4, won, NOW);
    expect(r.save.inProgress.event).toBeNull();
    expect(applyEventWin(at(4), LANTERN, 7, won, NOW).counted).toBe(false);
    expect(applyEventWin(at(4), LANTERN, 2, won, NOW).counted).toBe(false);
  });

  it('milestonesBetween and sumRewards', () => {
    expect(milestonesBetween(LANTERN, 0, 21).map((m) => m.at)).toEqual([3, 7, 12, 16, 21]);
    expect(milestonesBetween(LANTERN, 3, 6)).toEqual([]);
    expect(sumRewards(milestonesBetween(LANTERN, 15, 21).map((m) => m.reward))).toEqual({ hints: 5, kitties: 6 });
    expect(sumRewards([])).toBeNull();
  });
});

describe('rules, schedule, slots', () => {
  it('hearts default to hearts.perAttempt; a modifier lowers them', () => {
    expect(eventRules(LANTERN).heartsPerAttempt).toBe(cfg.hearts.perAttempt);
    expect(eventRules({ ...LANTERN, rules: { hearts: 2 } }).heartsPerAttempt).toBe(2);
    expect(eventRules(LANTERN).mistakePenalty).toBe(true);
  });

  it('sizes are shared out by weight in ascending order (21 puzzles)', () => {
    expect(eventSizeSchedule([[7, 1], [8, 2], [9, 2], [10, 1]], 21)).toEqual([7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 9, 10, 10, 10]);
    for (const d of DEFS) expect(eventSizeSchedule(d.gen?.sizes ?? [], 21)).toHaveLength(21);
  });

  it('eventSpec: our seed per index, the event band, the scheduled size', () => {
    const spec = eventSpec(LANTERN, 0);
    expect(spec?.seed).toBe('mewdoku:event:v1:lantern-walk-2026:0');
    expect(spec?.n).toBe(7);
    expect(spec?.gradeBand).toEqual([2, 3]);
    expect(eventSpec(LANTERN, 20)?.n).toBe(10);
    expect(eventSpec(LANTERN, 21)).toBeNull();
    expect(eventSpec({ ...LANTERN, gen: undefined } as EventDef, 0)).toBeNull();
  });

  it('clearEndedEventSlot: cleared after the end or for an unknown event; kept while it runs', () => {
    const slot: InProgressV2 = { id: eventPuzzleId(LANTERN.id, 2), mode: 'event', cells: '0', hearts: 3, revivesUsed: 0, mistakes: 0, hintsUsed: 0, kittiesUsed: 0, elapsedMs: 1, savedAt: 1 };
    const s: SaveData = { ...defaults(0), inProgress: { level: null, daily: null, event: slot } };
    expect(clearEndedEventSlot(s, DEFS, eventEnd(LANTERN) - 1)).toBe(s);
    expect(clearEndedEventSlot(s, DEFS, eventEnd(LANTERN)).inProgress.event).toBeNull();
    expect(clearEndedEventSlot(s, [], eventStart(LANTERN)).inProgress.event).toBeNull();
    const none = defaults(0);
    expect(clearEndedEventSlot(none, DEFS, 0)).toBe(none);
  });
});
