// Owner: G1 (Phase 2e). daily.dayStartHour across the app (docs/phase2e/spec.md §6.1, critic C-26; §10.1
// "with dayStartHour: 4 the Home card, the stale-daily rule and 'Next puzzle in …' agree"): every "today"
// of the app is dailyDateKey(now) and the next day starts at nextDayStartAfter (local wall-clock maths, so
// the tests build local times). Behaviour-neutral at dayStartHour 0.
import { describe, expect, it } from 'vitest';
import { cfg, mergeConfig } from '../../../src/app/config';
import type { WinSummary } from '../../../src/app/session-effects';
import { clearStaleDaily } from '../../../src/app/shell';
import { initialAppState } from '../../../src/app/store';
import { selectHomeView, selectVictoryView, type ViewContext } from '../../../src/app/views';
import { countWin, emptyDayStreak } from '../../../src/game/day-streak';
import { dailyDateKey } from '../../../src/game/progression';
import { defaults } from '../../../src/game/save';
import type { SaveData } from '../../../src/game/types';
import type { Capabilities } from '../../../src/platform/types';

const caps: Capabilities = {
  interstitial: false,
  rewarded: false,
  banner: false,
  cloudSave: false,
  leaderboards: false,
  share: false,
  payments: false,
  paymentsIos: false,
  haptics: true,
  overlayViews: false,
  groups: false,
};
/** Local wall-clock time (the tests run in the host's zone, like the app's date keys). */
const local = (d: number, h: number, mi = 0): number => new Date(2026, 9, d, h, mi, 0).getTime();
const c4 = mergeConfig({ daily: { dayStartHour: 4 } });
const ctxAt = (now: number): ViewContext => ({ now, capabilities: caps, platformId: 'web' });
const player = (): SaveData => ({ ...defaults(local(1, 12)), tutorialDone: true, progress: { level: 40, completed: 39, best: {} } });

describe('one "today" for the Home card, the stale-daily rule, the victory countdown and the streak (dayStartHour 4)', () => {
  it('the Home daily card: 03:59 still shows yesterday\'s puzzle, 04:00 today\'s; dayStartHour 0 switches at midnight', () => {
    const s = initialAppState(player());
    expect(selectHomeView(s, ctxAt(local(12, 3, 59)), c4).daily.dateKey).toBe('2026-10-11');
    expect(selectHomeView(s, ctxAt(local(12, 4, 0)), c4).daily.dateKey).toBe('2026-10-12');
    expect(selectHomeView(s, ctxAt(local(12, 0, 0)), cfg).daily.dateKey).toBe(cfg.daily.dayStartHour === 0 ? '2026-10-12' : '2026-10-11');
  });

  it("the stale-daily rule keeps yesterday's daily in progress until 04:00, then clears it", () => {
    const base = player();
    const s: SaveData = { ...base, inProgress: { ...base.inProgress, daily: { id: 'D2026-10-11' } as never } };
    expect(clearStaleDaily(s, dailyDateKey(local(12, 3, 30), c4)).inProgress.daily).not.toBeNull();
    expect(clearStaleDaily(s, dailyDateKey(local(12, 4, 0), c4)).inProgress.daily).toBeNull();
  });

  it('"Next puzzle in …" of a daily solved at 03:00 counts down to 04:00 the same morning', () => {
    const win = {
      mode: 'daily',
      replay: false,
      restored: false,
      counted: true,
      level: null,
      dateKey: dailyDateKey(local(12, 3, 0), c4),
      hard: false,
      n: 8,
      ms: 90_000,
      mistakes: 0,
      hints: 0,
      kitties: 0,
      kept: 3,
      maxKept: 3,
      period: null,
      pointsEarned: 0,
      pointsTotal: 0,
      event: null,
      streak: null,
      dailyReward: null,
    } as unknown as WinSummary;
    const v = selectVictoryView(initialAppState(player()), ctxAt(local(12, 3, 0)), win, { praise: 0 }, c4);
    expect(v.daily?.dateKey).toBe('2026-10-11');
    expect(v.daily?.nextPuzzleAt).toBe(local(12, 4, 0));
  });

  it('the streak counts the same day as the daily: a win at 03:00 is day of the 11th; another at 04:00 is the next day', () => {
    const first = countWin(emptyDayStreak(), dailyDateKey(local(12, 3, 0), c4), c4);
    expect(first.ds.dates).toEqual(['2026-10-11']);
    const second = countWin(first.ds, dailyDateKey(local(12, 4, 0), c4), c4);
    expect(second).toMatchObject({ counted: true, day: 2 });
  });
});
