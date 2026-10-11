// Owner: G1 (Phase 2e). Save schema v4 (docs/phase2e/spec.md §7.1, §10.1): v3 → v4 (defaults,
// period_points dropped, no retro grant); validation; every merge row of §7.1; repairPaidGrants over
// ladder.claimed and dayStreak.paid; a v4 document read by the v3 field readers keeps the v3 fields.
import { describe, expect, it } from 'vitest';
import { cfg } from '../../../src/app/config';
import { countWin, emptyDayStreak, paidEntry } from '../../../src/game/day-streak';
import { emptyLadder } from '../../../src/game/ladder';
import { recordClaim } from '../../../src/game/ladder-sync';
import { addPending, grantPending, isPending, pendingRecords, removePending } from '../../../src/game/purchases';
import { defaults, merge, migrate, migrateReport, SAVE_VERSION } from '../../../src/game/save';
import { readV3Fields } from '../../../src/game/save-v3';
import { capPending, migrate_3_to_4 } from '../../../src/game/save-v4';
import type { SaveData } from '../../../src/game/types';

const NOW = 1_791_799_800_000;

/** A stored v3 document (Phase 2c/2d shape) with a daily played and a queued FB period score. */
function v3doc(): Record<string, unknown> {
  const { v: _v, ladder: _l, dayStreak: _d, purchases, ...rest } = defaults(NOW - 1000);
  return {
    ...rest,
    v: 3,
    tutorialDone: true,
    progress: { level: 30, completed: 29, best: {} },
    daily: { '2026-10-05': [1000, 0, 0, 0], '2026-10-06': [1000, 0, 0, 0] },
    purchases: { noAds: purchases.noAds, tokens: ['hints_15|tok-1'] },
    rank: { pending: { period_points: 3_900_042, event_lantern_walk_2026: 5 }, lastSubmitAt: 7 },
  };
}

describe('v3 → v4 (spec §7.1)', () => {
  it('SAVE_VERSION 4; the migration adds the defaults, drops period_points, keeps everything else', () => {
    expect(SAVE_VERSION).toBe(4);
    const r = migrateReport(v3doc(), NOW);
    expect(r.outcome).toBe('ok');
    expect(r.save.v).toBe(4);
    expect(r.save.ladder).toEqual(emptyLadder());
    expect(r.save.dayStreak).toEqual(emptyDayStreak());
    expect(r.save.purchases).toEqual({ noAds: false, tokens: ['hints_15|tok-1'], pending: [] });
    expect(r.save.rank).toEqual({ pending: { event_lantern_walk_2026: 5 }, lastSubmitAt: 7 });
    expect(r.save.progress.level).toBe(30);
  });

  it('no retro grant: the streak starts empty even with dailies played; the stock is unchanged', () => {
    const s = migrate(v3doc(), NOW);
    expect(s.dayStreak.run).toBe(0);
    expect(s.dayStreak.dates).toEqual([]);
    expect(s.stock).toEqual(defaults(NOW).stock);
  });

  it('migrate_3_to_4 leaves a non-object purchases for validation to repair', () => {
    const out = migrate_3_to_4({ v: 3, purchases: 7 });
    expect(out.purchases).toBe(7);
    const r = migrateReport({ ...v3doc(), purchases: 7 }, NOW);
    expect(r.repairedFields).toContain('purchases');
    expect(r.save.purchases).toEqual({ noAds: false, tokens: [], pending: [] });
  });

  it('a v4 document read by the v3 field readers keeps the v3 fields (forward reading)', () => {
    const v4 = { ...defaults(NOW), streak: { current: 1, best: 4 }, period: { key: '2026-10-05', total: 9, bestKey: '2026-10-05', bestTotal: 9 } };
    const rep: string[] = [];
    expect(readV3Fields(JSON.parse(JSON.stringify(v4)) as Record<string, unknown>, cfg, rep)).toEqual({ streak: v4.streak, period: v4.period });
    expect(rep).toEqual([]);
  });

  it('a full v4 document round-trips through JSON + migrate (outcome ok)', () => {
    let ds = emptyDayStreak();
    for (const d of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']) ds = countWin(ds, d).ds;
    const s: SaveData = {
      ...defaults(NOW),
      purchases: { noAds: false, tokens: ['hints_15|a'], pending: ['kitties_8|b'] },
      ladder: { ...recordClaim(emptyLadder(), { rewardId: 'mgj1a0k3x9f2:11', grant: { hints: 1, kitties: 1 } }), nickLineSeen: true },
      dayStreak: ds,
    };
    const r = migrateReport(JSON.parse(JSON.stringify(s)) as unknown, NOW);
    expect(r.outcome).toBe('ok');
    expect(r.save).toEqual(s);
  });
});

describe('validation of the v4 fields (spec §7.1)', () => {
  it.each([
    ['purchases.pending not a list', (d: Record<string, unknown>): unknown => ((d.purchases as Record<string, unknown>).pending = 'x'), (s: SaveData): void => void expect(s.purchases.pending).toEqual([]), 'purchases.pending'],
    ['an unknown product in pending', (d: Record<string, unknown>): unknown => ((d.purchases as Record<string, unknown>).pending = ['gold_1|t', 'hints_15|t2']), (s: SaveData): void => void expect(s.purchases.pending).toEqual(['hints_15|t2']), 'purchases.pending'],
    ['a pending token already granted', (d: Record<string, unknown>): unknown => ((d.purchases as Record<string, unknown>).pending = ['hints_15|tok-1']), (s: SaveData): void => void expect(s.purchases.pending).toEqual([]), 'purchases.pending'],
    ['ladder not an object', (d: Record<string, unknown>): unknown => (d.ladder = 3), (s: SaveData): void => void expect(s.ladder).toEqual(emptyLadder()), 'ladder'],
    ['dayStreak not an object', (d: Record<string, unknown>): unknown => (d.dayStreak = null), (s: SaveData): void => void expect(s.dayStreak).toEqual(emptyDayStreak()), 'dayStreak'],
  ] as const)('%s → default, reported', (_name, patch, check, path) => {
    const d = JSON.parse(JSON.stringify({ ...defaults(NOW), purchases: { noAds: false, tokens: ['hints_15|tok-1'], pending: [] } })) as Record<string, unknown>;
    patch(d);
    const r = migrateReport(d, NOW);
    check(r.save);
    expect(r.repairedFields).toContain(path);
  });

  it('pending keeps the newest iap.pendingKept (10)', () => {
    const many = Array.from({ length: 14 }, (_, i) => `hints_15|t${i}`);
    expect(capPending(many, new Set())).toEqual(many.slice(4));
  });
});

describe('the merge rows of §7.1 and the grant repair', () => {
  const at = (updatedAt: number, patch: Partial<SaveData>): SaveData => ({ ...defaults(NOW), updatedAt, ...patch });

  it('purchases.pending: union minus every token in either copy\'s tokens', () => {
    const a = at(NOW - 10, { purchases: { noAds: false, tokens: ['hints_15|done'], pending: ['kitties_8|p1', 'hints_15|done'] } });
    const b = at(NOW, { purchases: { noAds: false, tokens: [], pending: ['hints_15|p2'] } });
    expect(merge(a, b).purchases.pending).toEqual(['kitties_8|p1', 'hints_15|p2']);
    const c = at(NOW, { purchases: { noAds: false, tokens: ['kitties_8|p1'], pending: [] } });
    expect(merge(a, c).purchases.pending).toEqual([]);
  });

  it('a rank-reward claim only the OLDER copy holds is re-granted once to the newer stock', () => {
    const older = at(NOW - 10, { stock: { hints: 7, kitties: 7 }, ladder: recordClaim(emptyLadder(), { rewardId: 'mgj1a0k3x9f2:11', grant: { hints: 2, kitties: 2 } }) });
    const newer = at(NOW, { stock: { hints: 5, kitties: 3 } });
    const m = merge(older, newer);
    expect(m.stock).toEqual({ hints: 7, kitties: 5 });
    expect(m.ladder.claimed).toEqual(['mgj1a0k3x9f2:11|2|2']);
    // Merging the merged copy again adds nothing (both hold the entry now).
    expect(merge(m, { ...m, updatedAt: NOW + 1 }).stock).toEqual(m.stock);
    // A claim both copies hold is not re-granted.
    expect(merge(older, { ...newer, ladder: older.ladder }).stock).toEqual(newer.stock);
  });

  it('a streak reward only the OLDER copy paid is re-granted once; the merged streak counts the union', () => {
    let ds = emptyDayStreak();
    for (const d of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']) ds = countWin(ds, d).ds;
    expect(ds.paid).toEqual([paidEntry('2026-10-07', { hints: 2, kitties: 2 })]);
    const older = at(NOW - 10, { stock: { hints: 9, kitties: 9 }, dayStreak: ds });
    const newer = at(NOW, { stock: { hints: 5, kitties: 3 } });
    const m = merge(older, newer);
    expect(m.stock).toEqual({ hints: 7, kitties: 5 });
    expect(m.dayStreak.run).toBe(7);
    expect(m.dayStreak.paid).toEqual(ds.paid);
  });

  it('ladder and dayStreak go through their own merges (listed from the newer copy, the run recomputed)', () => {
    const a = at(NOW - 10, { ladder: { ...emptyLadder(), listed: false, nickLineSeen: true } });
    const b = at(NOW, { ladder: { ...emptyLadder(), listed: true } });
    const m = merge(a, b);
    expect(m.ladder.listed).toBe(true);
    expect(m.ladder.nickLineSeen).toBe(true);
  });
});

describe('the intent ledger helpers (spec §4.2)', () => {
  it('add → pending; grant → tokens and stock, pending dropped; a granted token is never granted twice', () => {
    let s = defaults(NOW);
    s = addPending(s, { productId: 'hints_15', purchaseToken: 'T1' });
    expect(s.purchases.pending).toEqual(['hints_15|T1']);
    expect(isPending(s, 'T1')).toBe(true);
    expect(addPending(s, { productId: 'hints_15', purchaseToken: 'T1' })).toBe(s);
    expect(pendingRecords(s)).toEqual([{ productId: 'hints_15', purchaseToken: 'T1' }]);
    const g = grantPending(s, { productId: 'hints_15', purchaseToken: 'T1' });
    expect(g.stock.hints).toBe(s.stock.hints + 15);
    expect(g.purchases.tokens).toEqual(['hints_15|T1']);
    expect(g.purchases.pending).toEqual([]);
    // Again (a crash after the grant, before leaving pending): only dropped from pending.
    const again = grantPending({ ...g, purchases: { ...g.purchases, pending: ['hints_15|T1'] } }, { productId: 'hints_15', purchaseToken: 'T1' });
    expect(again.stock).toEqual(g.stock);
    expect(again.purchases.pending).toEqual([]);
    expect(addPending(g, { productId: 'hints_15', purchaseToken: 'T1' })).toBe(g); // already granted
    expect(removePending(s, 'nope')).toBe(s);
  });
});
