// Owner: G1 (Phase 2e). The daily streak engine (docs/phase2e/spec.md §5, §10.1): day 1 → 7 → the reward
// once → day 1 of the next cycle with the run going on; a missed day resets; the clock going back is
// ignored, a jump of ≥ 2 days resets; DST weekends and local midnight between two wins (through
// dailyDateKey); dayStartHour; two wins one day count once; every merge case (same days, disjoint, the
// stale-device chain, the 14-day overflow, the paid union); validation repairs.
import { describe, expect, it } from 'vitest';
import { cfg, mergeConfig } from '../../../src/app/config';
import {
  countWin,
  cycleDay,
  dateKeyOfDay,
  dayNumber,
  emptyDayStreak,
  isDateKey,
  mergeDayStreak,
  paidEntry,
  parsePaidEntry,
  readDayStreak,
  rewardForDay,
  streakView,
  streakWeek,
  type DayStreakRecord,
  type StreakWeekDay,
} from '../../../src/game/day-streak';
import { dailyDateKey } from '../../../src/game/progression';

/** The date key `n` days after 2026-10-01. */
const day = (n: number): string => {
  const d = new Date(Date.UTC(2026, 9, 1 + n));
  return d.toISOString().slice(0, 10);
};

/** Counts a win on each of the given days, in order. */
function play(days: readonly number[], c = cfg, from: DayStreakRecord = emptyDayStreak()): DayStreakRecord {
  let ds = from;
  for (const n of days) ds = countWin(ds, day(n), c).ds;
  return ds;
}

describe('countWin: the cycle (spec §5.1)', () => {
  it('days 1 → 7, the reward on day 7 only (2 hints + 2 kitties), then day 1 of a new cycle with the run going on', () => {
    let ds = emptyDayStreak();
    const seen: { day: number; reward: unknown }[] = [];
    for (let n = 0; n < 9; n++) {
      const r = countWin(ds, day(n));
      expect(r.counted).toBe(true);
      expect(r.reset).toBe(false);
      seen.push({ day: r.day, reward: r.reward });
      ds = r.ds;
    }
    expect(seen.map((s) => s.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 1, 2]);
    expect(seen.filter((s) => s.reward !== null)).toEqual([{ day: 7, reward: { hints: 2, kitties: 2 } }]);
    expect(ds.run).toBe(9);
    expect(ds.best).toBe(9);
    expect(ds.paid).toEqual([paidEntry(day(6), { hints: 2, kitties: 2 })]);
    // The 14th day pays again (second cycle).
    const r14 = countWin(play([9, 10, 11, 12], cfg, ds), day(13));
    expect(r14.day).toBe(7);
    expect(r14.reward).toEqual({ hints: 2, kitties: 2 });
  });

  it('two wins on one day count once; the second win is not counted (day 0, no reward)', () => {
    const first = countWin(emptyDayStreak(), day(0));
    const second = countWin(first.ds, day(0));
    expect(second.counted).toBe(false);
    expect(second.day).toBe(0);
    expect(second.ds).toBe(first.ds);
  });

  it('a missed day resets: the next counted day is day 1 (reset true, prevRun kept for streak_reset)', () => {
    const ds = play([0, 1, 2]);
    const r = countWin(ds, day(4));
    expect(r.counted).toBe(true);
    expect(r.reset).toBe(true);
    expect(r.prevRun).toBe(3);
    expect(r.day).toBe(1);
    expect(r.ds.run).toBe(1);
    expect(r.ds.best).toBe(3);
  });

  it('missResets off: a gap does not break the run', () => {
    const c = mergeConfig({ dayStreak: { missResets: false } });
    const r = countWin(play([0, 1], c), day(5), c);
    expect(r.reset).toBe(false);
    expect(r.ds.run).toBe(3);
  });

  it('clock guards: a date before the last counted one is ignored (neither counts nor resets); a forward jump of ≥ 2 days resets', () => {
    const ds = play([10, 11]);
    const back = countWin(ds, day(5));
    expect(back.counted).toBe(false);
    expect(back.ds).toBe(ds);
    const jump = countWin(ds, day(13));
    expect(jump.reset).toBe(true);
    expect(jump.ds.run).toBe(1);
  });

  it('one day forward, a win, then back: tomorrow counted early; on the real tomorrow nothing counts twice; the reward is paid once per date', () => {
    const six = play([0, 1, 2, 3, 4, 5]);
    const early = countWin(six, day(6)); // the clock moved forward a day
    expect(early.reward).not.toBeNull();
    // Back on the real day (day 5 again): ignored; the real tomorrow (day 6): already counted.
    expect(countWin(early.ds, day(5)).counted).toBe(false);
    const again = countWin(early.ds, day(6));
    expect(again.counted).toBe(false);
    expect(again.reward).toBeNull();
  });

  it('a reward is never paid twice for one date even if the paid list already holds it', () => {
    const six: DayStreakRecord = { ...play([0, 1, 2, 3, 4, 5]), paid: [paidEntry(day(6), { hints: 2, kitties: 2 })] };
    const r = countWin(six, day(6));
    expect(r.counted).toBe(true);
    expect(r.day).toBe(7);
    expect(r.reward).toBeNull();
  });

  it('dayRewards add a reward on their own day; cycleDays from config; disabled = nothing counts; a bad key = nothing', () => {
    const c = mergeConfig({ dayStreak: { cycleDays: 3, dayRewards: [{ day: 2, hints: 1, kitties: 0 }] } });
    const r1 = countWin(emptyDayStreak(), day(0), c);
    const r2 = countWin(r1.ds, day(1), c);
    const r3 = countWin(r2.ds, day(2), c);
    expect([r1.reward, r2.reward, r3.reward]).toEqual([null, { hints: 1, kitties: 0 }, { hints: 2, kitties: 2 }]);
    expect(cycleDay(4, c)).toBe(1);
    expect(rewardForDay(7)).toEqual({ hints: 2, kitties: 2 });
    expect(rewardForDay(6)).toBeNull();
    expect(countWin(emptyDayStreak(), day(0), mergeConfig({ dayStreak: { enabled: false } })).counted).toBe(false);
    expect(countWin(emptyDayStreak(), '2026-02-30').counted).toBe(false);
    expect(countWin(emptyDayStreak(), 'today').counted).toBe(false);
  });

  it('history keeps the newest historyDays dates; the run goes on past it', () => {
    const ds = play(Array.from({ length: 20 }, (_, i) => i));
    expect(ds.dates).toHaveLength(14);
    expect(ds.dates[0]).toBe(day(6));
    expect(ds.run).toBe(20);
  });
});

describe('dates through dailyDateKey (DST weekends, local midnight, dayStartHour)', () => {
  it('a win at 23:59 and one at 00:01 are two days; with dayStartHour 4 they are one', () => {
    const late = new Date(2026, 9, 24, 23, 59).getTime();
    const early = new Date(2026, 9, 25, 0, 1).getTime();
    const a = countWin(emptyDayStreak(), dailyDateKey(late));
    const b = countWin(a.ds, dailyDateKey(early));
    expect(b.counted).toBe(true);
    expect(b.ds.run).toBe(2);
    const c4 = mergeConfig({ daily: { dayStartHour: 4 } });
    const a4 = countWin(emptyDayStreak(), dailyDateKey(late, c4));
    const b4 = countWin(a4.ds, dailyDateKey(early, c4));
    expect(b4.counted).toBe(false);
  });

  it('across a DST weekend (25 and 26 Oct 2026, 29 and 30 Mar 2026) consecutive local days stay consecutive', () => {
    for (const [y, m, d] of [
      [2026, 9, 24],
      [2026, 2, 28],
    ] as const) {
      let ds = emptyDayStreak();
      for (let i = 0; i < 4; i++) ds = countWin(ds, dailyDateKey(new Date(y, m, d + i, 12).getTime())).ds;
      expect(ds.run).toBe(4);
    }
  });

  it('dayNumber is calendar arithmetic (no time zone)', () => {
    expect(dayNumber('2026-10-26') - dayNumber('2026-10-25')).toBe(1);
    expect(dayNumber('2027-01-01') - dayNumber('2026-12-31')).toBe(1);
    expect(dayNumber('2028-03-01') - dayNumber('2028-02-28')).toBe(2);
    expect(isDateKey('2028-02-29')).toBe(true);
    expect(isDateKey('2027-02-29')).toBe(false);
  });
});

describe('streakView (Home, spec §5.3)', () => {
  it('none → alive (today not yet) → done; broken after a missed day; best kept', () => {
    expect(streakView(emptyDayStreak(), day(0))).toMatchObject({ day: 0, alive: false, broken: false, todayDone: false, total: 7 });
    const ds = play([0, 1, 2]);
    expect(streakView(ds, day(2))).toMatchObject({ day: 3, todayDone: true, alive: true, broken: false });
    expect(streakView(ds, day(3))).toMatchObject({ day: 3, todayDone: false, alive: true, broken: false });
    expect(streakView(ds, day(4))).toMatchObject({ day: 0, alive: false, broken: true, best: 3 });
  });

  it('day 7 done shows 7; the next day (alive, not yet) still shows 7 (the strip says the next is day 1)', () => {
    const ds = play([0, 1, 2, 3, 4, 5, 6]);
    expect(streakView(ds, day(6))).toMatchObject({ day: 7, todayDone: true });
    expect(streakView(ds, day(7))).toMatchObject({ day: 7, todayDone: false, alive: true });
  });

  it('the clock went back (today before the last date): shown as done, alive', () => {
    expect(streakView(play([5, 6]), day(3))).toMatchObject({ todayDone: true, alive: true, day: 2 });
  });
});

describe('streakWeek (UI batch 2026-10-13: the streak screen\'s row is the run\'s current cycle)', () => {
  const marks = (w: readonly StreakWeekDay[]): string =>
    w.map((d) => `${d.played ? 'x' : '.'}${d.today ? 'T' : ''}${d.reward ? (d.paid ? 'G' : 'g') : ''}`).join(' ');

  it('no streak: day 1 is today, nothing played, the gift on the last day only (rewardForDay)', () => {
    const w = streakWeek(emptyDayStreak(), day(3));
    expect(w.map((d) => d.dateKey)).toEqual([3, 4, 5, 6, 7, 8, 9].map(day));
    expect(w.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(marks(w)).toBe('.T . . . . . .g');
    expect(w[6]?.reward).toEqual({ hints: 2, kitties: 2 });
  });

  it('a live run, today not counted yet: the cycle starts at the run\'s cycle day 1, today is the next cell', () => {
    expect(marks(streakWeek(play([0, 1, 2]), day(3)))).toBe('x x x .T . . .g');
    expect(streakWeek(play([0, 1, 2]), day(3))[0]?.dateKey).toBe(day(0));
  });

  it('today counted: today is played and ringed; the second cycle starts on the run\'s day 8', () => {
    expect(marks(streakWeek(play([0, 1, 2, 3]), day(3)))).toBe('x x x xT . . .g');
    const w = streakWeek(play([0, 1, 2, 3, 4, 5, 6, 7, 8]), day(8));
    expect(w[0]?.dateKey).toBe(day(7));
    expect(marks(w)).toBe('x xT . . . . .g');
  });

  it('day 7 counted today: the gift shows paid; the next day (not counted yet) a new cycle starts today', () => {
    const ds = play([0, 1, 2, 3, 4, 5, 6]);
    expect(marks(streakWeek(ds, day(6)))).toBe('x x x x x x xTG');
    const next = streakWeek(ds, day(7));
    expect(next[0]?.dateKey).toBe(day(7));
    expect(marks(next)).toBe('.T . . . . . .g');
  });

  it('a broken run never shows its old days: day 1 is today', () => {
    const w = streakWeek(play([0, 1, 2]), day(5));
    expect(w[0]?.dateKey).toBe(day(5));
    expect(marks(w)).toBe('.T . . . . . .g');
  });

  it('the clock went back: the record\'s cycle, as counted; a bad today gives no row; cycleDays and dayRewards from config', () => {
    expect(marks(streakWeek(play([2, 3, 4, 5, 6]), day(4)))).toBe('x x xT x x . .g');
    expect(streakWeek(play([0]), 'not-a-date')).toEqual([]);
    const c = mergeConfig({ dayStreak: { cycleDays: 3, dayRewards: [{ day: 2, hints: 1, kitties: 0 }] } });
    expect(marks(streakWeek(play([0, 1], c), day(1), c))).toBe('x xTG .g');
  });

  it('dateKeyOfDay is dayNumber\'s inverse', () => {
    for (const k of ['1970-01-01', '2026-02-28', '2026-03-01', '2028-02-29', '2026-12-31']) expect(dateKeyOfDay(dayNumber(k))).toBe(k);
  });
});

describe('mergeDayStreak (spec §5.2)', () => {
  it('same days → the same record; disjoint runs → the newest chain', () => {
    const a = play([0, 1, 2]);
    expect(mergeDayStreak(a, a)).toEqual(a);
    const b = play([10, 11]);
    const m = mergeDayStreak(a, b);
    expect(m.run).toBe(2);
    expect(m.best).toBe(3);
    expect(m.dates).toEqual([day(0), day(1), day(2), day(10), day(11)]);
  });

  it('the stale-device chain: one copy counted yesterday as day 6, the other only today → day 7 merged', () => {
    const a = play([0, 1, 2, 3, 4, 5]); // day 6 = run 6
    const b = countWin(emptyDayStreak(), day(6)).ds; // a stale device: run 1 on day(6)
    const m = mergeDayStreak(a, b);
    expect(m.run).toBe(7);
    expect(m.best).toBe(7);
  });

  it('the 14-day overflow: a run longer than the kept history is extended from the copy whose last date is in the chain', () => {
    const a = play(Array.from({ length: 30 }, (_, i) => i)); // run 30, 14 dates kept
    const b = countWin({ ...a, dates: [], run: 0 }, day(30)).ds; // another device: only today
    const m = mergeDayStreak(a, b);
    expect(m.dates).toHaveLength(14);
    expect(m.run).toBe(31);
  });

  it('a gap inside the union stops the chain (the older copy\'s run is not used across it)', () => {
    const a = play(Array.from({ length: 10 }, (_, i) => i)); // run 10 ending day 9
    const b = play([11, 12]);
    expect(mergeDayStreak(a, b).run).toBe(2);
  });

  it('paid = the union (newest paidKept)', () => {
    const p1 = paidEntry(day(6), { hints: 2, kitties: 2 });
    const p2 = paidEntry(day(13), { hints: 2, kitties: 2 });
    const a: DayStreakRecord = { ...play([12, 13]), paid: [p1] };
    const b: DayStreakRecord = { ...play([12, 13]), paid: [p2] };
    expect(mergeDayStreak(a, b).paid).toEqual([p1, p2]);
    const many = Array.from({ length: 12 }, (_, i) => paidEntry(day(i * 7 + 6), { hints: 2, kitties: 2 }));
    expect(mergeDayStreak({ ...a, paid: many }, b).paid).toHaveLength(8);
    expect(parsePaidEntry(p1)).toEqual({ date: day(6), hints: 2, kitties: 2 });
    expect(parsePaidEntry('2026-13-01|1|1')).toBeNull();
  });
});

describe('readDayStreak (validation, spec §7.1)', () => {
  it('a valid record is kept as is, nothing reported', () => {
    const ds = play([0, 1, 2, 3, 4, 5, 6]);
    const rep: string[] = [];
    expect(readDayStreak(JSON.parse(JSON.stringify(ds)), cfg, rep)).toEqual(ds);
    expect(rep).toEqual([]);
  });

  it.each([
    ['not an object', 'x', emptyDayStreak(), ['dayStreak']],
    ['unsorted, duplicate and bad dates', { dates: ['2026-10-03', '2026-10-01', '2026-10-03', 'x', '2026-10-02'], run: 3, best: 3, paid: [] }, { dates: ['2026-10-01', '2026-10-02', '2026-10-03'], run: 3, best: 3, paid: [] }, ['dayStreak.dates']],
    ['run below the chain the dates show', { dates: ['2026-10-01', '2026-10-02'], run: 1, best: 1, paid: [] }, { dates: ['2026-10-01', '2026-10-02'], run: 2, best: 2, paid: [] }, ['dayStreak.run', 'dayStreak.best']],
    ['run beyond a gap', { dates: ['2026-10-01', '2026-10-03'], run: 5, best: 5, paid: [] }, { dates: ['2026-10-01', '2026-10-03'], run: 1, best: 5, paid: [] }, ['dayStreak.run']],
    ['run without dates', { dates: [], run: 4, best: 4, paid: [] }, { dates: [], run: 0, best: 4, paid: [] }, ['dayStreak.run']],
    ['best below run, a bad paid entry', { dates: ['2026-10-01'], run: 1, best: 0, paid: ['nope', '2026-10-07|2|2'] }, { dates: ['2026-10-01'], run: 1, best: 1, paid: ['2026-10-07|2|2'] }, ['dayStreak.best', 'dayStreak.paid']],
    ['run not an integer', { dates: [], run: 1.5, best: 0, paid: [] }, emptyDayStreak(), ['dayStreak.run']],
  ] as const)('%s', (_name, raw, want, paths) => {
    const rep: string[] = [];
    expect(readDayStreak(raw, cfg, rep)).toEqual(want);
    expect(rep).toEqual(expect.arrayContaining([...paths]));
  });

  it('a run longer than the kept dates is valid when the dates are one unbroken chain', () => {
    const ds = play(Array.from({ length: 20 }, (_, i) => i));
    const rep: string[] = [];
    expect(readDayStreak(ds, cfg, rep).run).toBe(20);
    expect(rep).toEqual([]);
  });
});
