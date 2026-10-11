// Owner: G4 (Phase 2e). The win pipeline (spec §1.9.3) as a pure function over the REAL solution table:
// every reason, the lookup rule (critic C-7/C-8), the level jump (C-13), the daily window (C-14), the event
// grace, the size floors, the budget and the bracket cap.
import { describe, expect, it } from 'vitest';
import { createLookup, isKingPermutationString } from '../../src/content/lookup';
import { SOLUTIONS } from '../../src/content/generated/solutions';
import { DEFAULT_CONFIG, type ServerConfig } from '../../src/core/config';
import { evaluateWins, type PlayerWinState, type StoredWin } from '../../src/core/wins';
import type { WinSubmission } from '../../src/contract';
import { anyKing, boardOf, DAY, HOUR, makeWin, T0, wrongBoard } from '../helpers/harness';

const content = createLookup(SOLUTIONS);
const fresh: PlayerWinState = { listed: true, maxLevel: 0, budgetMs: 3_600_000, budgetAt: T0 };

function one(win: WinSubmission, o: { player?: Partial<PlayerWinState>; stored?: StoredWin[]; memberWins?: number; now?: number; cfg?: ServerConfig } = {}) {
  const r = evaluateWins({
    player: { ...fresh, ...o.player },
    wins: [win],
    stored: o.stored ?? [],
    memberWins: o.memberWins ?? 0,
    now: o.now ?? T0,
    cfg: o.cfg ?? DEFAULT_CONFIG,
    content,
  });
  return { d: r.decisions[0]!, player: r.player, r };
}

describe('the lookup rule (§1.9.2, C-7, C-8)', () => {
  it('a known id must match one of its boards, whatever the claimed source or version', () => {
    expect(one(makeWin('L57')).d.verdict).toBe('accepted');
    expect(one(makeWin('L57', { contentVersion: 'content-bogus0001', cats: wrongBoard(boardOf('L57')) })).d).toMatchObject({ verdict: 'rejected', reason: 'bad_solution' });
    expect(one(makeWin('L57', { contentVersion: 'content-bogus0001' })).d.verdict).toBe('accepted');
    // the pack board sent as a substitute is still the pack board
    expect(one(makeWin('L57', { source: 'substitute' })).d.verdict).toBe('accepted');
  });

  it('every board the device can show is accepted (substitute, endless, post-pack daily, event fallback)', () => {
    const entry = SOLUTIONS.levels.boards.split(',')[57 - 2] as string;
    const sub = entry.split('|')[1];
    expect(sub).toBeDefined();
    expect(one(makeWin('L57', { source: 'substitute', cats: sub as string })).d.verdict).toBe('accepted');
    expect(one(makeWin('L1500', { source: 'generated' }), { player: { maxLevel: 1490 } }).d.verdict).toBe('accepted');
    const d = '2029-03-03';
    expect(one(makeWin(`D${d}`, { source: 'generated' }), { now: Date.parse(`${d}T12:00:00Z`) }).d.verdict).toBe('accepted');
  });

  it('L1, a daily before the first pack month, an unknown event and an index past its count are bad_puzzle_id', () => {
    expect(one(makeWin('L1', { cats: '1302' })).d).toMatchObject({ verdict: 'rejected', reason: 'bad_puzzle_id' });
    expect(one(makeWin('D2026-09-30', { cats: anyKing(8) })).d).toMatchObject({ verdict: 'rejected', reason: 'bad_puzzle_id' });
    expect(one(makeWin('D2026-02-30', { cats: anyKing(8) })).d).toMatchObject({ verdict: 'rejected', reason: 'bad_puzzle_id' });
    expect(one(makeWin('Enope-event/0', { cats: anyKing(8) })).d).toMatchObject({ verdict: 'rejected', reason: 'bad_puzzle_id' });
    expect(one(makeWin('Elantern-walk-2026/21', { cats: anyKing(8) })).d).toMatchObject({ verdict: 'rejected', reason: 'bad_puzzle_id' });
  });

  it('beyond the table: a king permutation is accepted and flagged unverified; anything else is bad_solution', () => {
    const r = one(makeWin('L3001', { source: 'generated', cats: anyKing(9) }), { player: { maxLevel: 2995 } });
    expect(r.d).toMatchObject({ verdict: 'accepted_flagged', reason: 'unverified', write: true });
    expect(r.d.flags.map((f) => f.kind)).toEqual(['unverified']);
    expect(one(makeWin('L3001', { cats: '012345678' }), { player: { maxLevel: 2995 } }).d).toMatchObject({ verdict: 'rejected', reason: 'bad_solution' });
    const strict: ServerConfig = { ...DEFAULT_CONFIG, antiCheat: { ...DEFAULT_CONFIG.antiCheat, unknownPuzzle: 'reject' } };
    expect(one(makeWin('L3001', { cats: anyKing(9) }), { player: { maxLevel: 2995 }, cfg: strict }).d).toMatchObject({ verdict: 'rejected', reason: 'bad_puzzle_id' });
    expect(isKingPermutationString(anyKing(12))).toBe(true);
  });

  it('[audit A-S2] past the table: only a size the table\'s tail shows, and a level only within maxLevelJump of a baseline', () => {
    expect(content.tailSizes('level')).toEqual([8, 12]);
    expect(content.tailSizes('daily')).toEqual([8, 12]);
    // a first win (no baseline) past the table is never counted: rejected, flagged for the admin
    const first = one(makeWin('L3001', { source: 'generated', cats: anyKing(9) }));
    expect(first.d).toMatchObject({ verdict: 'rejected', reason: 'bad_puzzle_id', write: false });
    expect(first.d.flags.map((f) => f.kind)).toEqual(['unverified']);
    // a baseline too far below (2960 + 30 < 3001)
    expect(one(makeWin('L3001', { cats: anyKing(9) }), { player: { maxLevel: 2960 } }).d).toMatchObject({ verdict: 'rejected', reason: 'bad_puzzle_id' });
    // the edge: 2971 + 30 = 3001
    expect(one(makeWin('L3001', { cats: anyKing(9) }), { player: { maxLevel: 2971 } }).d).toMatchObject({ verdict: 'accepted_flagged', reason: 'unverified' });
    // the auditor's 4-cell arrangement, even with a baseline: a size the schedule never shows there
    expect(isKingPermutationString('1302')).toBe(true);
    expect(one(makeWin('L3001', { cats: '1302', solveMs: 4000 }), { player: { maxLevel: 2995 } }).d).toMatchObject({ verdict: 'rejected', reason: 'bad_solution' });
    expect(one(makeWin('L3001', { cats: anyKing(7) }), { player: { maxLevel: 2995 } }).d).toMatchObject({ verdict: 'rejected', reason: 'bad_solution' });
    // the baseline is carried through one request: L2990 (a table level) then L3001 … L3020 in steps of ≤ 30
    const climb = evaluateWins({
      player: { ...fresh, maxLevel: 2960 },
      wins: [makeWin('L2990'), makeWin('L3001', { cats: anyKing(10) }), makeWin('L3020', { cats: anyKing(11) })],
      stored: [],
      memberWins: 0,
      now: T0,
      cfg: DEFAULT_CONFIG,
      content,
    });
    expect(climb.decisions.map((d) => d.verdict)).toEqual(['accepted', 'accepted_flagged', 'accepted_flagged']);
  });

  it('an unknown content version is reported (logged), never a key', () => {
    const r = one(makeWin('L57', { contentVersion: 'content-future0001' }));
    expect(r.d.verdict).toBe('accepted');
    expect(r.r.unknownVersions).toEqual(['content-future0001']);
  });
});

describe('fish (§1.9.3 step 3)', () => {
  it('rejects out-of-range fish and broken invariants, with a flag', () => {
    expect(one(makeWin('L9', { fish: 4 })).d).toMatchObject({ verdict: 'rejected', reason: 'bad_fish' });
    expect(one(makeWin('L9', { fish: 2, mistakes: 0 })).d).toMatchObject({ verdict: 'rejected', reason: 'inconsistent' });
    expect(one(makeWin('L9', { fish: 1, mistakes: 3, revives: 1 })).d.verdict).toBe('accepted'); // 3 + 1 − 3
    expect(one(makeWin('L9', { fish: 1, mistakes: 3, revives: 2 })).d).toMatchObject({ verdict: 'rejected', reason: 'inconsistent' });
    expect(one(makeWin('L9', { fish: 2, mistakes: 2, revives: 1 })).d).toMatchObject({ verdict: 'rejected', reason: 'inconsistent' }); // > fishOnRevive after a revive
    expect(one(makeWin('L9', { fish: 4 })).d.flags[0]?.kind).toBe('bad_fish');
  });
  it("uses the event's lives as its fish maximum", () => {
    const now = Date.parse('2026-11-20T12:00:00Z');
    expect(one(makeWin('Elantern-walk-2026/3'), { now }).d.verdict).toBe('accepted');
  });
});

describe('speed floors (§1.9.4)', () => {
  it('below hard → too_fast; below soft → soft_fast (flagged, counted)', () => {
    const n = boardOf('L57').length;
    const [hard, soft] = DEFAULT_CONFIG.antiCheat.minSolveMs[String(n)] as [number, number];
    expect(one(makeWin('L57', { solveMs: hard - 1 })).d).toMatchObject({ verdict: 'rejected', reason: 'too_fast' });
    expect(one(makeWin('L57', { solveMs: hard })).d).toMatchObject({ verdict: 'accepted_flagged', reason: 'soft_fast', points: 3 });
    expect(one(makeWin('L57', { solveMs: soft })).d.verdict).toBe('accepted');
  });
});

describe('dates and windows (§1.9.3 step 6, C-14)', () => {
  const at = (iso: string): number => Date.parse(iso);
  it('a daily queued 23 h ago in UTC−12 and in UTC+14 is accepted; three days old is stale', () => {
    // UTC−12: the local 2026-11-14 ran until 2026-11-15T12:00Z; sent 23 h later.
    expect(one(makeWin('D2026-11-14'), { now: at('2026-11-16T11:00:00Z') }).d.verdict).toBe('accepted');
    // UTC+14: 2026-11-16 starts at 2026-11-15T10:00Z.
    expect(one(makeWin('D2026-11-16'), { now: at('2026-11-15T10:30:00Z') }).d.verdict).toBe('accepted');
    expect(one(makeWin('D2026-11-12'), { now: at('2026-11-15T12:00:00Z') }).d).toMatchObject({ verdict: 'rejected', reason: 'stale_date' });
    // a date still in the future everywhere
    expect(one(makeWin('D2026-11-17'), { now: at('2026-11-15T12:00:00Z') }).d).toMatchObject({ verdict: 'rejected', reason: 'stale_date' });
  });
  it('the window edges: lower = UTC date of (now − 12 h − 25 h), upper = UTC date of (now + 15 h)', () => {
    const now = at('2026-11-15T12:00:00Z'); // lower 2026-11-13T23:00 → 2026-11-13; upper 2026-11-16T03:00 → 2026-11-16
    expect(one(makeWin('D2026-11-13'), { now }).d.verdict).toBe('accepted');
    expect(one(makeWin('D2026-11-16'), { now }).d.verdict).toBe('accepted');
  });
  it('an event win is accepted from 1 h before its start to 6 h after its end', () => {
    const e = createLookup(SOLUTIONS).event('lantern-walk-2026')!;
    expect(one(makeWin('Elantern-walk-2026/0'), { now: e.startMs - HOUR }).d.verdict).toBe('accepted');
    expect(one(makeWin('Elantern-walk-2026/0'), { now: e.startMs - HOUR - 1 }).d).toMatchObject({ verdict: 'rejected', reason: 'event_closed' });
    expect(one(makeWin('Elantern-walk-2026/0'), { now: e.endMs + 6 * HOUR }).d.verdict).toBe('accepted');
    expect(one(makeWin('Elantern-walk-2026/0'), { now: e.endMs + 6 * HOUR + 1 }).d).toMatchObject({ verdict: 'rejected', reason: 'event_closed' });
  });
});

describe('dedupe, level order, cap, budget (§1.9.3 steps 7–10)', () => {
  it('the same winId → duplicate with the original points; the same puzzle → already_counted', () => {
    const w = makeWin('L9');
    expect(one(w, { stored: [{ puzzleId: 'L9', winId: w.winId, points: 2 }] }).d).toMatchObject({ verdict: 'duplicate', points: 2, write: false });
    expect(one(makeWin('L9'), { stored: [{ puzzleId: 'L9', winId: 'other', points: 3 }] }).d).toMatchObject({ verdict: 'already_counted', points: 0 });
  });
  it('within one request: a repeated winId and a repeated puzzle', () => {
    const w = makeWin('L9');
    const r = evaluateWins({ player: fresh, wins: [w, w, makeWin('L9')], stored: [], memberWins: 0, now: T0, cfg: DEFAULT_CONFIG, content });
    expect(r.decisions.map((d) => d.verdict)).toEqual(['accepted', 'duplicate', 'already_counted']);
  });
  it('levels: at or below the baseline → already_counted; a jump of 31 is accepted, flagged and re-baselined', () => {
    expect(one(makeWin('L9'), { player: { maxLevel: 9 } }).d.verdict).toBe('already_counted');
    expect(one(makeWin('L39'), { player: { maxLevel: 9 } }).d.verdict).toBe('accepted'); // a jump of 30
    const jump = one(makeWin('L40'), { player: { maxLevel: 9 } }); // a jump of 31
    expect(jump.d).toMatchObject({ verdict: 'accepted_flagged', reason: 'level_jump' });
    expect(jump.player.maxLevel).toBe(40);
    expect(one(makeWin('L500')).d.verdict).toBe('accepted'); // the first level win sets the baseline
  });
  it('the bracket cap: 150 → window_cap; the 60th win raises wins_flag', () => {
    expect(one(makeWin('L9'), { memberWins: 150 }).d).toMatchObject({ verdict: 'rejected', reason: 'window_cap' });
    const sixtieth = one(makeWin('L9'), { memberWins: 59 });
    expect(sixtieth.d.verdict).toBe('accepted');
    expect(sixtieth.d.flags.map((f) => f.kind)).toEqual(['wins_flag']);
  });
  it('the budget refills at real time to 8 h and each win costs max(solveMs, softMin)', () => {
    const empty = { budgetMs: 0, budgetAt: T0 };
    expect(one(makeWin('L9', { solveMs: 60_000 }), { player: empty }).d).toMatchObject({ verdict: 'rejected', reason: 'budget' });
    expect(one(makeWin('L9', { solveMs: 60_000 }), { player: empty, now: T0 + 60_000 }).d.verdict).toBe('accepted');
    const r = one(makeWin('L9', { solveMs: 60_000 }), { player: { budgetMs: 0, budgetAt: T0 - 30 * DAY } });
    expect(r.player.budgetMs).toBe(8 * HOUR - 60_000);
    // the per-win cost is capped at 30 min
    expect(one(makeWin('L9', { solveMs: 5 * HOUR }), { player: { budgetMs: 31 * 60_000 } }).player.budgetMs).toBe(60_000);
  });
  it('not scored and not listed', () => {
    const noDaily: ServerConfig = { ...DEFAULT_CONFIG, scoring: { ...DEFAULT_CONFIG.scoring, modes: ['level'] } };
    expect(one(makeWin('D2026-11-15'), { cfg: noDaily }).d).toMatchObject({ verdict: 'rejected', reason: 'not_scored' });
    expect(one(makeWin('L9'), { player: { listed: false } }).d).toMatchObject({ verdict: 'rejected', reason: 'unlisted' });
  });
});
