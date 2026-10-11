// Owner: G1 (Phase 2e). The ranking client's record (docs/phase2e/spec.md §2.3, §2.6, §2.9, §7.1, §10.1):
// the queue (enqueue, union by winId then puzzleId, cap 20, age, applyVerdicts for every verdict),
// toWinSubmission for level / daily / event / substitute / generated, encodeSolution for n = 4…12, cache
// usability against endsAt, counterBefore, the claim ledger and repair, results-seen, v4 field validation
// and merge.
import { describe, expect, it } from 'vitest';
import { cfg, mergeConfig } from '../../../src/app/config';
import {
  emptyLadder,
  encodeSolution,
  enqueueWin,
  mergeLadder,
  parseClaimEntry,
  readLadder,
  toWinSubmission,
  wireWin,
  type WinInput,
} from '../../../src/game/ladder';
import {
  afterDelete,
  applyVerdicts,
  claimEntry,
  claimsToRepair,
  counterBefore,
  currentFrom,
  droppedBy,
  isClaimed,
  isRunning,
  markDoubleWatched,
  markResultSeen,
  pruneAged,
  recordClaim,
  resultsToShow,
  sendable,
  waitingFish,
} from '../../../src/game/ladder-sync';
import type { LadderPendingWin, LadderRecord } from '../../../src/game/types';
import { isWinSubmission, parseBracketView, type BracketView, type ResultView, type WinResult } from '../../../src/shared/rank-api';

const T = 1_791_799_800_000;
const uuid = (i: number): string => `3f6c2a0e-8d1b-4c7a-9e55-${String(i).padStart(12, '0')}`;

const input = (over: Partial<WinInput> = {}): WinInput => ({
  winId: uuid(1),
  puzzleId: 'L57',
  source: 'pack',
  contentVersion: 'content-bb8a756dfaf9',
  solution: [6, 8, 1, 5, 2, 4, 0, 7, 3],
  kept: 2,
  mistakes: 1,
  revives: 0,
  hints: 0,
  kitties: 1,
  mice: 0,
  solveMs: 94_210,
  playedAt: T - 10_000,
  clientVersion: '0.2.0',
  ...over,
});

const queued = (i: number, over: Partial<WinInput> = {}, queuedAt = T): LadderPendingWin => ({
  ...(toWinSubmission(input({ winId: uuid(i), puzzleId: `L${100 + i}`, ...over })) as NonNullable<ReturnType<typeof toWinSubmission>>),
  queuedAt,
});

describe('toWinSubmission and encodeSolution (spec §2.3)', () => {
  it('the CONTRACTS §3 example: L57, pack, cats "681524073"', () => {
    const w = toWinSubmission(input());
    expect(w).toEqual({
      winId: uuid(1),
      puzzleId: 'L57',
      source: 'pack',
      contentVersion: 'content-bb8a756dfaf9',
      cats: '681524073',
      fish: 2,
      mistakes: 1,
      revives: 0,
      hints: 0,
      kitties: 1,
      mice: 0,
      solveMs: 94_210,
      playedAt: T - 10_000,
      clientVersion: '0.2.0',
    });
    expect(isWinSubmission(w)).toBe(true);
  });

  it.each([
    ['daily (daily pack)', { puzzleId: 'D2026-10-11', source: 'daily_pack' }, 'pack'],
    ['daily generated on the device', { puzzleId: 'D2029-01-01', source: 'generated' }, 'generated'],
    ['event (event pack)', { puzzleId: 'Elantern-walk-2026/3', source: 'event_pack' }, 'pack'],
    ['endless level', { puzzleId: 'L3001', source: 'generated' }, 'generated'],
    ['substitute board', { puzzleId: 'L57', source: 'substitute' }, 'substitute'],
  ] as const)('%s → source %s', (_name, over, source) => {
    expect(toWinSubmission(input(over as Partial<WinInput>))?.source).toBe(source);
  });

  it('never the tutorial (T1, L1, source tutorial), never an invalid field', () => {
    expect(toWinSubmission(input({ puzzleId: 'T1', source: 'tutorial' }))).toBeNull();
    expect(toWinSubmission(input({ puzzleId: 'L1' }))).toBeNull();
    expect(toWinSubmission(input({ source: 'tutorial' }))).toBeNull();
    expect(toWinSubmission(input({ winId: 'not-a-uuid' }))).toBeNull();
    expect(toWinSubmission(input({ kept: 0 }))).toBeNull();
    expect(toWinSubmission(input({ contentVersion: '' }))).toBeNull();
  });

  it('encodeSolution for n = 4 … 12: one base-36 digit per row (0–9, a, b)', () => {
    for (let n = 4; n <= 12; n++) {
      const sol = Array.from({ length: n }, (_, r) => (r * 5 + 3) % n);
      const s = encodeSolution(sol);
      expect(s).toHaveLength(n);
      expect(s).toMatch(/^[0-9ab]+$/);
      expect([...s].map((ch) => parseInt(ch, 36))).toEqual(sol);
    }
    expect(encodeSolution(Uint8Array.from([11, 10, 0]))).toBe('ba0');
  });
});

describe('the queue (spec §2.9)', () => {
  it('enqueue: oldest first; a duplicate winId or puzzleId is not added', () => {
    let rec = emptyLadder();
    rec = enqueueWin(rec, queued(1, {}, T + 1));
    rec = enqueueWin(rec, queued(2, {}, T));
    expect(rec.pending.map((w) => w.winId)).toEqual([uuid(2), uuid(1)]);
    expect(enqueueWin(rec, queued(1, {}, T + 5))).toBe(rec);
    expect(enqueueWin(rec, { ...queued(9), puzzleId: rec.pending[0]?.puzzleId as string })).toBe(rec);
  });

  it('cap 20: the oldest are dropped (droppedBy says how many)', () => {
    let rec = emptyLadder();
    for (let i = 0; i < 20; i++) rec = enqueueWin(rec, queued(i, {}, T + i));
    expect(rec.pending).toHaveLength(20);
    expect(droppedBy(rec, queued(20, {}, T + 20))).toBe(1);
    rec = enqueueWin(rec, queued(20, {}, T + 20));
    expect(rec.pending).toHaveLength(20);
    expect(rec.pending[0]?.winId).toBe(uuid(1));
    expect(droppedBy(rec, queued(5, {}, T))).toBe(0); // a duplicate drops nothing
  });

  it('age: entries older than 24 h are not sendable and pruneAged drops them', () => {
    let rec = emptyLadder();
    rec = enqueueWin(rec, queued(1, {}, T - 25 * 3_600_000));
    rec = enqueueWin(rec, queued(2, {}, T - 23 * 3_600_000));
    expect(sendable(rec, T).map((w) => w.winId)).toEqual([uuid(2)]);
    expect(pruneAged(rec, T).pending.map((w) => w.winId)).toEqual([uuid(2)]);
    const short = mergeConfig({ ladder: { pendingMaxAgeMs: 1000 } });
    expect(sendable(rec, T, short)).toEqual([]);
  });

  it('applyVerdicts: every answered win leaves (accepted, flagged, duplicate, already counted, rejected); unanswered ones stay', () => {
    let rec = emptyLadder();
    for (let i = 0; i < 6; i++) rec = enqueueWin(rec, queued(i, {}, T + i));
    const results: WinResult[] = [
      { winId: uuid(0), verdict: 'accepted', points: 2 },
      { winId: uuid(1), verdict: 'accepted_flagged', reason: 'unverified', points: 3 },
      { winId: uuid(2), verdict: 'duplicate', points: 0 },
      { winId: uuid(3), verdict: 'already_counted', points: 0 },
      { winId: uuid(4), verdict: 'rejected', reason: 'too_fast', points: 0 },
      { winId: uuid(99), verdict: 'accepted', points: 1 },
    ];
    expect(applyVerdicts(rec, results).pending.map((w) => w.winId)).toEqual([uuid(5)]);
    expect(applyVerdicts(rec, [])).toBe(rec);
  });

  it('waitingFish sums the queued fish; wireWin drops queuedAt', () => {
    let rec = emptyLadder();
    rec = enqueueWin(rec, queued(1, { kept: 2 }));
    rec = enqueueWin(rec, queued(2, { kept: 3 }));
    expect(waitingFish(rec)).toBe(5);
    const w = wireWin(rec.pending[0] as LadderPendingWin);
    expect('queuedAt' in w).toBe(false);
    expect(isWinSubmission(w)).toBe(true);
  });
});

describe('the cached bracket and the counter (spec §2.3)', () => {
  const view = (over: Partial<BracketView> = {}): BracketView =>
    parseBracketView({
      state: 'open',
      bracketId: 'mgk0b7q1z4a8',
      pool: 'fb',
      mode: 'rolling',
      openedAt: T - 3_600_000,
      endsAt: T + 3_600_000,
      members: 3,
      maxMembers: 50,
      rows: [
        { rank: 1, slot: 0, nickname: 'Sleepy Whisker 27', avatarId: 1, points: 31, hearts: 4, me: false, likedByMe: false },
        { rank: 2, slot: 2, nickname: 'Velvet Pounce 27', avatarId: 4, points: 16, hearts: 2, me: true, likedByMe: false },
        { rank: 3, slot: 1, nickname: 'Cozy Biscuit 41', avatarId: 7, points: 9, hearts: 0, me: false, likedByMe: true },
      ],
      me: { rank: 2, slot: 2, nickname: 'Velvet Pounce 27', avatarId: 4, points: 16, hearts: 2, me: true, likedByMe: false },
      final: false,
      heartsNew: 1,
      result: null,
      serverTime: T + 5000,
      ...over,
    }) as BracketView;

  it('currentFrom keeps the server numbers without rows; the offset is serverTime − device now', () => {
    const cur = currentFrom(view(), T);
    expect(cur).toEqual({ bracketId: 'mgk0b7q1z4a8', endsAt: T + 3_600_000, serverOffsetMs: 5000, fetchedAt: T, points: 16, rank: 2, members: 3, maxMembers: 50 });
    expect(JSON.stringify(cur)).not.toContain('Sleepy');
    expect(currentFrom(view({ state: 'none', bracketId: null, endsAt: null, rows: [], me: null, members: 0 }), T)).toBeNull();
  });

  it('counterBefore: the points while endsAt (server clock) is in the future, else 0', () => {
    const rec: LadderRecord = { ...emptyLadder(), current: currentFrom(view(), T) };
    expect(counterBefore(rec, T)).toBe(16);
    expect(isRunning(rec.current, T + 3_600_000 - 5001)).toBe(true);
    expect(counterBefore(rec, T + 3_600_000 - 5000)).toBe(0); // the device clock + the offset reached endsAt
    expect(counterBefore(emptyLadder(), T)).toBe(0);
  });
});

describe('claims, repair and result cards (spec §2.6)', () => {
  const result = (id: string, over: Partial<ResultView> = {}, claimed = false): ResultView => ({
    bracketId: id,
    endedAt: T - 1000,
    place: 2,
    members: 37,
    points: 22,
    reward: {
      rewardId: `${id}:11`,
      place: 2,
      grant: { hints: 1, kitties: 1 },
      canDouble: true,
      expiresAt: T + 7 * 86_400_000,
      claim: claimed ? { rewardId: `${id}:11`, grant: { hints: 2, kitties: 2 }, doubled: true, claimedAt: T - 500 } : null,
    },
    ...over,
  });

  it('recordClaim once per reward id; the entry carries the applied grant; doubleWatched cleared', () => {
    let rec = markDoubleWatched(emptyLadder(), 'mgj1a0k3x9f2:11');
    rec = recordClaim(rec, { rewardId: 'mgj1a0k3x9f2:11', grant: { hints: 2, kitties: 2 } });
    expect(rec.claimed).toEqual(['mgj1a0k3x9f2:11|2|2']);
    expect(rec.doubleWatched).toEqual([]);
    expect(isClaimed(rec, 'mgj1a0k3x9f2:11')).toBe(true);
    expect(recordClaim(rec, { rewardId: 'mgj1a0k3x9f2:11', grant: { hints: 9, kitties: 9 } })).toBe(rec);
    expect(parseClaimEntry(claimEntry({ rewardId: 'mgj1a0k3x9f2:11', grant: { hints: 1, kitties: 0 } }))).toEqual({ rewardId: 'mgj1a0k3x9f2:11', hints: 1, kitties: 0 });
  });

  it('claimed keeps the newest claimedKept (30)', () => {
    let rec = emptyLadder();
    for (let i = 0; i < 35; i++) rec = recordClaim(rec, { rewardId: `bracket${String(i).padStart(4, '0')}:1`, grant: { hints: 1, kitties: 0 } });
    expect(rec.claimed).toHaveLength(30);
    expect(rec.claimed[0]).toBe('bracket0005:1|1|0');
  });

  it('repair: a result claimed on the server but missing here is returned once; a recorded one is not', () => {
    const results = [result('aaaaaaaaaa01', {}, true), result('aaaaaaaaaa02', {}, false)];
    expect(claimsToRepair(emptyLadder(), results).map((x) => x.rewardId)).toEqual(['aaaaaaaaaa01:11']);
    const rec = recordClaim(emptyLadder(), { rewardId: 'aaaaaaaaaa01:11', grant: { hints: 2, kitties: 2 } });
    expect(claimsToRepair(rec, results)).toEqual([]);
  });

  it('resultsToShow: unclaimed rewards until claimed or expired; unpaid results once; newest first; rewardOnly', () => {
    const paid = result('aaaaaaaaaa01', { endedAt: T - 5000 });
    const unpaid = result('aaaaaaaaaa02', { reward: null, place: 12, endedAt: T - 1000 });
    const claimedThere = result('aaaaaaaaaa03', {}, true);
    const all = [paid, unpaid, claimedThere];
    expect(resultsToShow(emptyLadder(), all, cfg, T).map((r) => r.bracketId)).toEqual(['aaaaaaaaaa02', 'aaaaaaaaaa01']);
    // Shown once: the unpaid card does not come back; the paid one does until claimed.
    let rec = markResultSeen(markResultSeen(emptyLadder(), 'aaaaaaaaaa01'), 'aaaaaaaaaa02');
    expect(resultsToShow(rec, all, cfg, T).map((r) => r.bracketId)).toEqual(['aaaaaaaaaa01']);
    rec = recordClaim(rec, { rewardId: 'aaaaaaaaaa01:11', grant: { hints: 1, kitties: 1 } });
    expect(resultsToShow(rec, all, cfg, T)).toEqual([]);
    // Expired rewards are never shown.
    expect(resultsToShow(emptyLadder(), [paid], cfg, T + 8 * 86_400_000)).toEqual([]);
    // rewardOnly: only paid places.
    const only = mergeConfig({ ladder: { resultCard: 'rewardOnly' } });
    expect(resultsToShow(emptyLadder(), all, only, T).map((r) => r.bracketId)).toEqual(['aaaaaaaaaa01']);
  });

  it('afterDelete: the local fields reset, claimed stays, not listed', () => {
    let rec: LadderRecord = { ...emptyLadder(), me: { name: 'Velvet Pounce 27', avatarId: 4, code: '7KQ2M9XD' } };
    rec = enqueueWin(rec, queued(1));
    rec = recordClaim(rec, { rewardId: 'aaaaaaaaaa01:11', grant: { hints: 1, kitties: 1 } });
    const d = afterDelete(rec);
    expect(d).toEqual({ ...emptyLadder(), listed: false, claimed: rec.claimed, nickLineSeen: rec.nickLineSeen, noticeSeen: rec.noticeSeen });
  });
});

describe('readLadder and mergeLadder (spec §7.1)', () => {
  const full = (): LadderRecord => ({
    listed: true,
    pending: [queued(1), queued(2, {}, T + 1)],
    current: { bracketId: 'mgk0b7q1z4a8', endsAt: T + 1000, serverOffsetMs: -250, fetchedAt: T, points: 14, rank: 5, members: 37, maxMembers: 50 },
    claimed: ['mgj1a0k3x9f2:11|1|1'],
    doubleWatched: ['mgj1a0k3x9f2:12'],
    resultsSeen: ['mgj1a0k3x9f2'],
    nickLineSeen: true,
    noticeSeen: true,
    me: { name: 'Velvet Pounce 27', avatarId: 4, code: '7KQ2M9XD' },
  });

  it('a valid record round-trips through JSON unchanged, nothing reported', () => {
    const rep: string[] = [];
    expect(readLadder(JSON.parse(JSON.stringify(full())), cfg, rep)).toEqual(full());
    expect(rep).toEqual([]);
  });

  it.each([
    ['not an object', (): unknown => 'x', (r: LadderRecord): void => void expect(r).toEqual(emptyLadder()), 'ladder'],
    ['listed', (d: Record<string, unknown>): unknown => (d.listed = 'yes'), (r: LadderRecord): void => void expect(r.listed).toBe(true), 'ladder.listed'],
    ['a pending win with a bad fish', (d: Record<string, unknown>): unknown => ((d.pending as Record<string, unknown>[])[0]!.fish = 0), (r: LadderRecord): void => void expect(r.pending).toHaveLength(1), 'ladder.pending'],
    ['a pending win without queuedAt', (d: Record<string, unknown>): unknown => delete (d.pending as Record<string, unknown>[])[1]!.queuedAt, (r: LadderRecord): void => void expect(r.pending).toHaveLength(1), 'ladder.pending'],
    ['current with members > maxMembers', (d: Record<string, unknown>): unknown => ((d.current as Record<string, unknown>).members = 99), (r: LadderRecord): void => void expect(r.current).toBeNull(), 'ladder.current'],
    ['a bad claimed entry', (d: Record<string, unknown>): unknown => (d.claimed = ['x', 'mgj1a0k3x9f2:11|1|1']), (r: LadderRecord): void => void expect(r.claimed).toEqual(['mgj1a0k3x9f2:11|1|1']), 'ladder.claimed'],
    ['a bad resultsSeen id', (d: Record<string, unknown>): unknown => (d.resultsSeen = ["'; DROP"]), (r: LadderRecord): void => void expect(r.resultsSeen).toEqual([]), 'ladder.resultsSeen'],
    ['me with a bad avatar', (d: Record<string, unknown>): unknown => ((d.me as Record<string, unknown>).avatarId = 12), (r: LadderRecord): void => void expect(r.me).toBeNull(), 'ladder.me'],
    ['me with a lowercase code', (d: Record<string, unknown>): unknown => ((d.me as Record<string, unknown>).code = '7kq2m9xd'), (r: LadderRecord): void => void expect(r.me).toBeNull(), 'ladder.me'],
    ['noticeSeen not a boolean', (d: Record<string, unknown>): unknown => (d.noticeSeen = 1), (r: LadderRecord): void => void expect(r.noticeSeen).toBe(false), 'ladder.noticeSeen'],
  ] as const)('%s → its default, reported', (_name, patch, check, path) => {
    const d = JSON.parse(JSON.stringify(full())) as Record<string, unknown>;
    const out = patch(d);
    const rep: string[] = [];
    const r = readLadder(_name === 'not an object' ? out : d, cfg, rep);
    check(r);
    expect(rep).toContain(path);
  });

  it('noticeSeen (G1 addition, ladder.noticeFirst): a copy without it reads false and is not reported', () => {
    const d = JSON.parse(JSON.stringify(full())) as Record<string, unknown>;
    delete d.noticeSeen;
    const rep: string[] = [];
    expect(readLadder(d, cfg, rep).noticeSeen).toBe(false);
    expect(rep).toEqual([]);
  });

  it('merge: listed and me from the newer copy; pending union by winId then puzzleId; current by later fetchedAt; unions; nickLineSeen and noticeSeen OR', () => {
    const a = full();
    const b: LadderRecord = {
      listed: false,
      pending: [queued(2, {}, T + 1), queued(3, {}, T + 2), { ...queued(4, {}, T + 3), puzzleId: a.pending[0]?.puzzleId as string }],
      current: { ...(a.current as NonNullable<LadderRecord['current']>), fetchedAt: T + 10, points: 20 },
      claimed: ['mgj1a0k3x9f2:22|2|2'],
      doubleWatched: [],
      resultsSeen: ['mgj1a0k3x9f3'],
      nickLineSeen: false,
      noticeSeen: false,
      me: null,
    };
    const m = mergeLadder(a, b, b);
    expect(m.listed).toBe(false);
    expect(m.me).toBeNull();
    expect(m.pending.map((w) => w.winId)).toEqual([uuid(1), uuid(2), uuid(3)]);
    expect(m.current?.points).toBe(20);
    expect(m.claimed).toEqual(['mgj1a0k3x9f2:11|1|1', 'mgj1a0k3x9f2:22|2|2']);
    expect(m.doubleWatched).toEqual(['mgj1a0k3x9f2:12']);
    expect(m.resultsSeen).toEqual(['mgj1a0k3x9f2', 'mgj1a0k3x9f3']);
    expect(m.nickLineSeen).toBe(true);
    expect(m.noticeSeen).toBe(true);
    expect(mergeLadder({ ...a, noticeSeen: false }, b, b).noticeSeen).toBe(false);
    expect(mergeLadder(a, b, a).listed).toBe(true);
  });

  it('merge: the union keeps at most pendingMax wins, the oldest dropped', () => {
    const many = (from: number): LadderRecord => {
      let rec = emptyLadder();
      for (let i = from; i < from + 15; i++) rec = enqueueWin(rec, queued(i, {}, T + i));
      return rec;
    };
    const m = mergeLadder(many(0), many(15), many(15));
    expect(m.pending).toHaveLength(20);
    expect(m.pending[0]?.winId).toBe(uuid(10));
  });
});
