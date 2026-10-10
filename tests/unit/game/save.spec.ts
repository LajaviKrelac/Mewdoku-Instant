// Owner: C (Phase 2b). Phase 2c (G1): schema v3 (docs/phase2c/fish-lives-spec.md §3.8): the fixtures
// are v3 documents; the last block covers v2 → v3 (wallet and paw_points pending dropped, retired
// packs compensated once), the streak and period validation (a changed period kind starts fresh) and
// their merge rows. Phase 2c.1 (G1): the in-progress slot's optional points / catStreak / scoredRows
// (still v3; a bad field is dropped and reported, the slot kept) and the frozen streak (last block).
// Phase 2d (G1, docs/phase2d/look-spec.md §1.15): ext.settingsSeen (the settings-dot marker): kept when
// valid, dropped and reported when not, merged by max, set by markSettingsSeen; the save stays v3.
// Save schema (phase2b §9; v1 = 04 §4.3, §7): defaults, migrate (garbage, partial, wrong
// types, v1 → v3), merge table (§7.3 + phase2b §9.3), in-progress validation (§7.2), cells codec, size bound.
import { describe, expect, it } from 'vitest';
import { mergeConfig } from '../../../src/app/config';
import { toInProgress } from '../../../src/game/factory';
import {
  clearStaleSlots,
  decodeCells,
  defaults,
  encodeCells,
  markSettingsSeen,
  merge,
  migrate,
  migrateReport,
  SAVE_VERSION,
  settingsDotOn,
  settingsSeenOf,
  SETTINGS_SEEN_KEY,
  validateInProgress,
} from '../../../src/game/save';
import type { InProgressV2, SaveData, SaveDataV1, SaveDataV2 } from '../../../src/game/types';
import { dbl, lostState, makePuzzle, P5, P5G, playing, R5, run, S5, SOL5, tap, wonState, WRONG5 } from './fixtures';

const NOW = 1_790_000_000_000;

/** A fully populated, valid v3 save. */
function full(): SaveData {
  const level = toInProgress(run(playing(P5), [tap(1), dbl(WRONG5[1] as number)]).state, NOW - 5);
  return {
    v: 3,
    updatedAt: NOW - 10,
    firstSeenAt: NOW - 86_400_000 * 9,
    sessions: 12,
    tutorialDone: true,
    progress: { level: 2, completed: 1, best: { 1: [61_000, 0] } },
    stock: { hints: 2, kitties: 7 },
    daily: { '2026-10-05': [252_000, 1, 0, 0] },
    settings: { sound: false, haptics: true, patterns: true, reduceMotion: 'on', locale: 'de' },
    ads: { lastAdAt: NOW - 200_000, lastFallbackGrantAt: NOW - 700_000 },
    inProgress: { level, daily: null, event: null },
    ext: { coins: 3, nested: { a: [1, 2] } },
    points: { total: 375 },
    events: { 'lantern-walk-2026': { solved: 3, ms: 400_000, lastAt: NOW - 50 } },
    groups: { 'tour-1': { endsAt: NOW + 3_600_000, total: 120, wins: 2, claimed: 0 } },
    purchases: { noAds: false, tokens: ['hints_15|tok-1'] },
    rank: { pending: { period_points: 3_900_042 }, lastSubmitAt: NOW - 20_000 },
    streak: { current: 2, best: 6 },
    period: { key: '2026-10-05', total: 42, bestKey: '2026-09-28', bestTotal: 57 },
  };
}

/** The same player as a stored v2 document (Phase 2b shape: a wallet, no streak or period). */
function fullV2(): SaveDataV2 {
  const { v: _v, streak: _s, period: _p, ...rest } = full();
  return { ...rest, v: 2, wallet: { fish: 42, earned: 90 }, rank: { pending: { event_lantern_walk_2026: 3_000_123 }, lastSubmitAt: NOW - 20_000 } };
}

/** The same player as a stored v1 document (Phase 2 shape). */
function fullV1(): SaveDataV1 {
  const { v: _v, settings, inProgress, points: _p, events: _e, groups: _g, purchases: _pu, rank: _r, streak: _s, period: _pe, ...rest } = full();
  const { locale: _l, ...v1Settings } = settings;
  return { ...rest, v: 1, settings: v1Settings, inProgress: { level: inProgress.level as SaveDataV1['inProgress']['level'], daily: null } };
}

describe('defaults (04 §4.3)', () => {
  it('matches the spec exactly (04 §4.3 + phase2b §9.2 v2 fields + phase2c §3.8 v3 records, no wallet)', () => {
    expect(defaults(NOW)).toEqual({
      v: 3,
      updatedAt: NOW,
      firstSeenAt: NOW,
      sessions: 0,
      tutorialDone: false,
      progress: { level: 1, completed: 0, best: {} },
      stock: { hints: 5, kitties: 3 },
      daily: {},
      settings: { sound: true, haptics: true, patterns: false, reduceMotion: 'system', locale: 'auto' },
      ads: { lastAdAt: 0, lastFallbackGrantAt: 0 },
      inProgress: { level: null, daily: null, event: null },
      ext: {},
      points: { total: 0 },
      events: {},
      groups: {},
      purchases: { noAds: false, tokens: [] },
      rank: { pending: {}, lastSubmitAt: 0 },
      streak: { current: 0, best: 0 },
      period: { key: '', total: 0, bestKey: '', bestTotal: 0 },
    });
  });

  it('start stock follows the config', () => {
    expect(defaults(NOW, mergeConfig({ hints: { startStock: 9 } })).stock.hints).toBe(9);
  });
});

describe('migrate: garbage → defaults', () => {
  it.each([
    ['null', null, 'empty'],
    ['undefined', undefined, 'empty'],
    ['a number', 42, 'reset'],
    ['true', true, 'reset'],
    ['an array', [1, 2, 3], 'reset'],
    ['unparseable text', '{"v":1,', 'reset'],
    ['a JSON array string', '[1]', 'reset'],
  ] as const)('%s', (_name, raw, outcome) => {
    const r = migrateReport(raw, NOW);
    expect(r.outcome).toBe(outcome);
    expect(r.save).toEqual(defaults(NOW));
  });

  it('an empty object keeps nothing and reports the repaired fields', () => {
    const r = migrateReport({}, NOW);
    expect(r.save).toEqual(defaults(NOW));
    expect(r.outcome).toBe('repaired');
    expect(r.repairedFields).toEqual(expect.arrayContaining(['v', 'progress', 'stock', 'settings', 'ads', 'inProgress', 'daily', 'updatedAt']));
  });
});

describe('migrate: valid and partial data', () => {
  it('a valid save round-trips through JSON unchanged (outcome ok)', () => {
    const s = full();
    const r = migrateReport(JSON.parse(JSON.stringify(s)) as unknown, NOW);
    expect(r).toEqual({ save: s, outcome: 'ok', repairedFields: [] });
    expect(migrate(JSON.stringify(s), NOW)).toEqual(s); // a stored string is parsed first
  });

  it('partial: only progress.level → the rest from defaults, completed = level − 1, tutorialDone inferred', () => {
    const s = migrate({ v: 1, progress: { level: 7 } }, NOW);
    expect(s.progress).toEqual({ level: 7, completed: 6, best: {} });
    expect(s.tutorialDone).toBe(true);
    expect(s.stock).toEqual({ hints: 5, kitties: 3 });
    expect(s.settings).toEqual(defaults(NOW).settings);
  });

  it('a settings group with one bad field keeps the good ones', () => {
    const r = migrateReport({ ...full(), settings: { sound: false, haptics: 'yes', patterns: true, reduceMotion: 'fast', locale: 'de' } }, NOW);
    expect(r.save.settings).toEqual({ sound: false, haptics: true, patterns: true, reduceMotion: 'system', locale: 'de' });
    expect(r.repairedFields).toEqual(['settings.haptics', 'settings.reduceMotion']);
    expect(r.save.stock).toEqual({ hints: 2, kitties: 7 });
  });

  it('unknown top-level fields are dropped; ext is kept as is (Phase 3 hook)', () => {
    const s = migrate({ ...full(), junk: 1 }, NOW);
    expect(s).not.toHaveProperty('junk');
    expect(s.ext).toEqual({ coins: 3, nested: { a: [1, 2] } });
  });
});

describe('migrate: wrong types are replaced field by field', () => {
  const ROWS: { path: string; patch: (d: Record<string, unknown>) => void; check: (s: SaveData) => unknown; want: unknown }[] = [
    { path: 'updatedAt', patch: (d) => (d.updatedAt = 'yesterday'), check: (s) => s.updatedAt, want: NOW },
    { path: 'firstSeenAt', patch: (d) => (d.firstSeenAt = -1), check: (s) => s.firstSeenAt, want: NOW },
    { path: 'sessions', patch: (d) => (d.sessions = 2.5), check: (s) => s.sessions, want: 0 },
    { path: 'tutorialDone', patch: (d) => (d.tutorialDone = 'true'), check: (s) => s.tutorialDone, want: true },
    { path: 'progress.level', patch: (d) => ((d.progress as Record<string, unknown>).level = 0), check: (s) => s.progress.level, want: 2 },
    { path: 'progress.completed', patch: (d) => ((d.progress as Record<string, unknown>).completed = null), check: (s) => s.progress.completed, want: 1 },
    { path: 'progress.best', patch: (d) => ((d.progress as Record<string, unknown>).best = { 1: [61_000, 0], 2: 'x', abc: [1, 1], 3: [1, -1] }), check: (s) => s.progress.best, want: { 1: [61_000, 0] } },
    { path: 'stock.hints', patch: (d) => ((d.stock as Record<string, unknown>).hints = -3), check: (s) => s.stock, want: { hints: 5, kitties: 7 } },
    { path: 'stock.kitties', patch: (d) => ((d.stock as Record<string, unknown>).kitties = '7'), check: (s) => s.stock, want: { hints: 2, kitties: 3 } },
    { path: 'stock', patch: (d) => (d.stock = [5, 3]), check: (s) => s.stock, want: { hints: 5, kitties: 3 } },
    { path: 'daily', patch: (d) => (d.daily = { '2026-10-05': [1, 2, 3, 4], '2026-13-01': [1, 0, 0, 0], '2026-10-06': [1, 0, 0] }), check: (s) => s.daily, want: { '2026-10-05': [1, 2, 3, 4] } },
    { path: 'ads.lastAdAt', patch: (d) => ((d.ads as Record<string, unknown>).lastAdAt = Number.NaN), check: (s) => s.ads.lastAdAt, want: 0 },
    { path: 'inProgress.level', patch: (d) => ((d.inProgress as Record<string, unknown>).level = { id: 'L2', mode: 'level', cells: 'abc' }), check: (s) => s.inProgress.level, want: null },
    { path: 'inProgress.daily', patch: (d) => ((d.inProgress as Record<string, unknown>).daily = { ...full().inProgress.level, mode: 'level' }), check: (s) => s.inProgress.daily, want: null },
    { path: 'ext', patch: (d) => (d.ext = 'none'), check: (s) => s.ext, want: {} },
    { path: 'v', patch: (d) => (d.v = '1'), check: (s) => s.v, want: 3 },
  ];

  it.each(ROWS)('$path', ({ path, patch, check, want }) => {
    const raw = JSON.parse(JSON.stringify(full())) as Record<string, unknown>;
    patch(raw);
    const r = migrateReport(raw, NOW);
    expect(check(r.save)).toEqual(want);
    expect(r.outcome).toBe('repaired');
    expect(r.repairedFields).toContain(path);
    // Everything else survives.
    expect(r.save.sessions === 12 || path === 'sessions').toBe(true);
    expect(r.save.settings).toEqual(full().settings);
  });

  it('a valid in-progress slot is copied without unknown fields', () => {
    const raw = JSON.parse(JSON.stringify(full())) as SaveData;
    const slot = { ...(raw.inProgress.level as InProgressV2), extra: 'x' };
    const s = migrate({ ...raw, inProgress: { level: slot, daily: null, event: null } }, NOW);
    expect(s.inProgress.level).toEqual(full().inProgress.level);
  });

  it('tutorialDone false at level ≥ 2 and tutorialDone true at level 1 are both repaired consistently', () => {
    const a = migrateReport({ ...full(), tutorialDone: false, progress: { level: 5, completed: 4, best: {} } }, NOW);
    expect(a.save.tutorialDone).toBe(true);
    expect(a.repairedFields).toContain('tutorialDone');
    const b = migrateReport({ ...full(), tutorialDone: true, progress: { level: 1, completed: 0, best: {} } }, NOW);
    expect(b.save.progress).toMatchObject({ level: 2, completed: 1 });
    expect(b.repairedFields).toContain('progress.level');
  });
});

describe('merge (04 §7.3)', () => {
  const local = (): SaveData => full();
  const cloud = (): SaveData => ({
    ...full(),
    updatedAt: NOW, // newer
    firstSeenAt: NOW - 86_400_000 * 30,
    sessions: 4,
    tutorialDone: false,
    progress: { level: 2, completed: 1, best: { 1: [70_000, 2], 9: [5, 0] } },
    stock: { hints: 9, kitties: 0 },
    daily: { '2026-10-05': [200_000, 3, 1, 1], '2026-10-04': [1000, 0, 0, 0] },
    settings: { sound: true, haptics: false, patterns: false, reduceMotion: 'off', locale: 'auto' },
    ads: { lastAdAt: 1, lastFallbackGrantAt: 2 },
    inProgress: { level: null, daily: null, event: null },
    ext: { cloud: true },
  });

  it('max / union-by-ms / min / OR / newest-document fields', () => {
    const m = merge(local(), cloud());
    expect(m.updatedAt).toBe(NOW);
    expect(m.sessions).toBe(12); // max
    expect(m.firstSeenAt).toBe(NOW - 86_400_000 * 30); // min
    expect(m.tutorialDone).toBe(true); // OR
    expect(m.progress.level).toBe(2);
    expect(m.progress.completed).toBe(1);
    expect(m.progress.best).toEqual({ 1: [61_000, 0], 9: [5, 0] }); // smaller ms wins per key
    expect(m.daily).toEqual({ '2026-10-05': [200_000, 3, 1, 1], '2026-10-04': [1000, 0, 0, 0] });
    // stock, settings, ads, inProgress, ext: from the newer document (cloud)
    expect(m.stock).toEqual({ hints: 9, kitties: 0 });
    expect(m.settings).toEqual(cloud().settings);
    expect(m.ads).toEqual({ lastAdAt: 1, lastFallbackGrantAt: 2 });
    expect(m.inProgress).toEqual({ level: null, daily: null, event: null });
    expect(m.ext).toEqual({ cloud: true });
  });

  it('the local document wins when it is newer (and on a tie)', () => {
    const older = { ...cloud(), updatedAt: NOW - 1000 };
    expect(merge(local(), older).stock).toEqual(local().stock);
    expect(merge(local(), { ...cloud(), updatedAt: local().updatedAt }).stock).toEqual(local().stock);
    expect(merge(local(), older).inProgress.level).toEqual(local().inProgress.level);
  });

  it('progress takes the max of each counter', () => {
    const m = merge({ ...local(), progress: { level: 40, completed: 39, best: {} } }, { ...cloud(), progress: { level: 12, completed: 41, best: {} } });
    expect(m.progress).toMatchObject({ level: 40, completed: 41 });
  });

  it('after merging, a level slot for an already-won level and a daily slot with a record are cleared', () => {
    const d = toInProgress(run(playing(makePuzzle('D2026-10-05', R5, S5), 'daily'), [tap(1)]).state, NOW);
    const l = { ...local(), updatedAt: NOW + 1, inProgress: { level: local().inProgress.level, daily: d, event: null } };
    const c = { ...cloud(), progress: { level: 3, completed: 2, best: {} } };
    const m = merge(l, c);
    expect(m.progress.level).toBe(3);
    expect(m.inProgress).toEqual({ level: null, daily: null, event: null }); // L2 won elsewhere; 2026-10-05 already solved
  });

  it('clearStaleSlots keeps current slots and returns the same object when nothing is stale', () => {
    const s = local();
    expect(clearStaleSlots(s)).toBe(s);
  });

  it('merge is symmetric for the order-independent fields', () => {
    const a = merge(local(), cloud());
    const b = merge(cloud(), local());
    expect(b.progress).toEqual(a.progress);
    expect(b.daily).toEqual(a.daily);
    expect(b.firstSeenAt).toBe(a.firstSeenAt);
    expect(b.stock).toEqual(a.stock);
  });
});

describe('validateInProgress (04 §7.2)', () => {
  const expectL2 = { mode: 'level' as const, id: 'L2' as const };
  const base = (): InProgressV2 => toInProgress(run(playing(), [tap(1), dbl(SOL5[0] as number), dbl(WRONG5[1] as number)]).state, NOW);

  it('accepts real slots: playing, lost, won, revived, with givens', () => {
    expect(validateInProgress(base(), P5, expectL2)).toEqual({ ok: true });
    expect(validateInProgress(toInProgress(lostState(), 1), P5, expectL2)).toEqual({ ok: true });
    expect(validateInProgress(toInProgress(wonState(), 1), P5, expectL2)).toEqual({ ok: true });
    const revived = run(lostState(), [{ type: 'REVIVE', t: 1 }, dbl(WRONG5[3] as number)]).state;
    expect(validateInProgress(toInProgress(revived, 1), P5, expectL2)).toEqual({ ok: true });
    const g = toInProgress(run(playing(P5G), [tap(1)]).state, 1);
    expect(validateInProgress(g, P5G, { mode: 'level', id: 'L3' })).toEqual({ ok: true });
  });

  const ROWS: { reason: string; slot: () => InProgressV2; puzzle?: typeof P5; expect?: { mode: 'level' | 'daily'; id: 'L2' | 'L3' | `D${string}` } }[] = [
    { reason: 'mode', slot: () => ({ ...base(), mode: 'daily' }) },
    { reason: 'id', slot: () => ({ ...base(), id: 'L3' }) },
    { reason: 'id', slot: base, expect: { mode: 'level', id: 'L3' } },
    { reason: 'length', slot: () => ({ ...base(), cells: base().cells.slice(1) }) },
    { reason: 'chars', slot: () => ({ ...base(), cells: `9${base().cells.slice(1)}` }) },
    { reason: 'counters', slot: () => ({ ...base(), hintsUsed: -1 }) },
    { reason: 'counters', slot: () => ({ ...base(), elapsedMs: Number.POSITIVE_INFINITY }) },
    { reason: 'cat', slot: () => ({ ...base(), cells: replaceAt(base().cells, WRONG5[2] as number, '2') }) },
    { reason: 'wrong', slot: () => ({ ...base(), cells: replaceAt(base().cells, SOL5[3] as number, '3') }) },
    { reason: 'given', slot: () => ({ ...base(), cells: replaceAt(base().cells, SOL5[3] as number, '4') }) },
    { reason: 'given', slot: () => ({ ...toInProgress(run(playing(), [tap(1)]).state, 1), id: 'L3' }), puzzle: P5G, expect: { mode: 'level', id: 'L3' } }, // the Given is missing
    { reason: 'mistakes', slot: () => ({ ...base(), mistakes: 2, hearts: 1 }) },
    { reason: 'hearts', slot: () => ({ ...base(), hearts: 3 }) },
    { reason: 'revives', slot: () => ({ ...toInProgress(lostState(), 1), revivesUsed: 2, hearts: 2 }) },
    { reason: 'hearts', slot: () => ({ ...base(), mistakes: 1, revivesUsed: 1, hearts: 3 }) },
  ];

  it.each(ROWS)('rejects: $reason', ({ reason, slot, puzzle, expect: ex }) => {
    const r = validateInProgress(slot(), puzzle ?? P5, ex ?? expectL2);
    expect(r).toEqual({ ok: false, reason });
  });

  it('respects a config variant for hearts and revives', () => {
    const c = mergeConfig({ hearts: { perAttempt: 4 } });
    expect(validateInProgress(base(), P5, expectL2, c)).toEqual({ ok: false, reason: 'hearts' });
    expect(validateInProgress({ ...base(), hearts: 3 }, P5, expectL2, c)).toEqual({ ok: true });
  });
});

function replaceAt(s: string, i: number, ch: string): string {
  return s.slice(0, i) + ch + s.slice(i + 1);
}

describe('cells codec', () => {
  it('one char 0..4 per cell, round trip', () => {
    const cells = Uint8Array.from([0, 1, 2, 3, 4, 0, 0, 1, 2, 3, 4, 0, 1, 2, 3, 4]);
    expect(encodeCells(cells)).toBe('0123400123401234');
    expect(decodeCells('0123400123401234', 4)).toEqual(cells);
  });

  it('rejects bad states, lengths and chars', () => {
    expect(() => encodeCells(Uint8Array.from([5]))).toThrow(RangeError);
    expect(() => decodeCells('0123', 3)).toThrow(RangeError);
    expect(() => decodeCells('012x', 2)).toThrow(RangeError);
    expect(() => decodeCells('01/3', 2)).toThrow(RangeError);
  });
});

describe('size bound (04 §4.3)', () => {
  it('1 000 levels, a year of dailies and two 12×12 boards stay under 40 KB (FB limit 1 MB)', () => {
    const s = defaults(NOW);
    const best: SaveData['progress']['best'] = {};
    for (let l = 1; l <= 1000; l++) best[l] = [3_599_999, 12];
    const daily: SaveData['daily'] = {};
    for (let d = 0; d < 365; d++) daily[new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10)] = [3_599_999, 9, 9, 9];
    const slot = (id: InProgressV2['id'], mode: 'level' | 'daily'): InProgressV2 => ({
      id, mode, cells: '1'.repeat(144), hearts: 1, revivesUsed: 1, mistakes: 3, hintsUsed: 25, kittiesUsed: 12, elapsedMs: 3_599_999, savedAt: NOW,
    });
    const big: SaveData = {
      ...s,
      sessions: 9999,
      tutorialDone: true,
      progress: { level: 1001, completed: 1000, best },
      daily,
      inProgress: { level: slot('L1001', 'level'), daily: slot('D2026-12-31', 'daily'), event: null },
    };
    const bytes = new TextEncoder().encode(JSON.stringify(big)).length;
    expect(bytes).toBeLessThan(40 * 1024);
    expect(migrate(JSON.parse(JSON.stringify(big)) as unknown, NOW)).toEqual(big);
  });
});

describe('save v2 (phase2b §9.2, §9.3): the F0 baseline', () => {
  it('a v1 document migrates (v1 → v2 → v3) with the §9.2 and §3.8 defaults; its level and daily slots are kept', () => {
    const r = migrateReport(JSON.parse(JSON.stringify(fullV1())) as unknown, NOW);
    expect(r.outcome).toBe('ok');
    expect(r.save).toEqual({
      ...full(),
      settings: { ...full().settings, locale: 'auto' },
      points: { total: 0 },
      events: {},
      groups: {},
      purchases: { noAds: false, tokens: [] },
      rank: { pending: {}, lastSubmitAt: 0 },
      streak: { current: 0, best: 0 },
      period: { key: '', total: 0, bestKey: '', bestTotal: 0 },
    });
  });

  const V2_ROWS: { path: string; patch: (d: Record<string, unknown>) => void; check: (s: SaveData) => unknown; want: unknown }[] = [
    { path: 'points.total', patch: (d) => (d.points = { total: 2.5 }), check: (s) => s.points, want: { total: 0 } },
    {
      path: 'events',
      patch: (d) => (d.events = { 'Bad Id': { solved: 1, ms: 1, lastAt: 1 }, 'ok-id': { solved: 2, ms: 9, lastAt: 1 } }),
      check: (s) => s.events,
      want: { 'ok-id': { solved: 2, ms: 9, lastAt: 1 } },
    },
    {
      path: 'purchases.tokens',
      patch: (d) => (d.purchases = { noAds: true, tokens: ['hints_15|a', 'hints_15|a', 'nope', 7] }),
      check: (s) => s.purchases,
      want: { noAds: true, tokens: ['hints_15|a'] },
    },
    {
      path: 'rank.pending',
      patch: (d) => (d.rank = { pending: { period_points: 5, bogus: 1 }, lastSubmitAt: 3 }),
      check: (s) => s.rank,
      want: { pending: { period_points: 5 }, lastSubmitAt: 3 },
    },
    { path: 'settings.locale', patch: (d) => ((d.settings as Record<string, unknown>).locale = 'xx'), check: (s) => s.settings.locale, want: 'auto' },
  ];

  it.each(V2_ROWS)('garbage in $path → its default', ({ path, patch, check, want }) => {
    const raw = JSON.parse(JSON.stringify(full())) as Record<string, unknown>;
    patch(raw);
    const r = migrateReport(raw, NOW);
    expect(check(r.save)).toEqual(want);
    expect(r.repairedFields).toContain(path);
  });

  it('merge: points max, events by more solved, noAds OR, ledger union, stock from the newer document + paid repair', () => {
    const a: SaveData = { ...full(), updatedAt: NOW - 10, points: { total: 900 }, purchases: { noAds: true, tokens: ['kitties_8|old'] } };
    const b: SaveData = {
      ...full(),
      updatedAt: NOW,
      stock: { hints: 5, kitties: 5 },
      points: { total: 10 },
      events: { 'lantern-walk-2026': { solved: 4, ms: 900_000, lastAt: NOW } },
      purchases: { noAds: false, tokens: ['hints_15|new'] },
    };
    const m = merge(a, b);
    // The newer stock, plus the kitties_8 that only the older copy holds (§9.3 paid-grant repair).
    expect(m.stock).toEqual({ hints: 5, kitties: 13 });
    expect(m).not.toHaveProperty('wallet');
    expect(m.points.total).toBe(900);
    expect(m.events['lantern-walk-2026']).toEqual({ solved: 4, ms: 900_000, lastAt: NOW });
    expect(m.purchases).toEqual({ noAds: true, tokens: ['kitties_8|old', 'hints_15|new'] });
  });

  it('an event slot below its event\'s solved count is cleared after a merge', () => {
    const slot = { ...(full().inProgress.level as InProgressV2), id: 'Elantern-walk-2026/2' as const, mode: 'event' as const };
    const s: SaveData = { ...full(), inProgress: { level: null, daily: null, event: slot } };
    expect(clearStaleSlots(s).inProgress.event).toBeNull(); // 3 solved, slot index 2
    const ahead: SaveData = { ...s, inProgress: { ...s.inProgress, event: { ...slot, id: 'Elantern-walk-2026/3' } } };
    expect(clearStaleSlots(ahead)).toBe(ahead);
  });
});

describe('save v2 (phase2b §9.4): merge table, paid-grant repair, event slots, size', () => {
  const T = (tokens: string[], updatedAt: number, extra: Partial<SaveData> = {}): SaveData => ({
    ...full(),
    updatedAt,
    purchases: { noAds: false, tokens },
    ...extra,
  });

  it('a fish_900 on the OLDER document survives a merge with a newer document that lacks it, exactly once (as its compensation)', () => {
    const older = T(['fish_900|tok-1'], NOW - 50, { stock: { hints: 40, kitties: 20 } });
    const newer = T([], NOW, { stock: { hints: 1, kitties: 2 } });
    const m = merge(older, newer);
    expect(m.stock).toEqual({ hints: 31, kitties: 17 });
    expect(m.purchases.tokens).toEqual(['fish_900|tok-1']);
    // Merging the result again (with either copy) never grants it a second time.
    expect(merge({ ...m, updatedAt: NOW + 5 }, older).stock).toEqual(m.stock);
    expect(merge(newer, { ...m, updatedAt: NOW + 5 }).stock).toEqual(m.stock);
    // Order of the arguments does not matter: the newer copy is picked by updatedAt.
    expect(merge(newer, older).stock).toEqual(m.stock);
  });

  it('the repair covers hints and kitties packs; a token both copies hold is not re-applied', () => {
    const older = T(['hints_15|a', 'kitties_8|b', 'fish_250|both'], NOW - 50);
    const newer = T(['fish_250|both'], NOW, { stock: { hints: 1, kitties: 0 } });
    const m = merge(older, newer);
    expect(m.stock).toEqual({ hints: 16, kitties: 8 });
  });

  it('No Ads from either document survives (OR); its ledger entry adds nothing else', () => {
    const older = T(['remove_ads|x'], NOW - 50, { purchases: { noAds: true, tokens: ['remove_ads|x'] } });
    const newer = T([], NOW);
    const m = merge(older, newer);
    expect(m.purchases.noAds).toBe(true);
    expect(m.stock).toEqual(newer.stock);
  });

  it('an older-only entry that does not survive the 50-entry ledger cap is not re-granted', () => {
    const fifty = Array.from({ length: 50 }, (_, i) => `hints_15|n${i}`);
    const older = T(['fish_900|ancient'], NOW - 50);
    const newer = T(fifty, NOW);
    const m = merge(older, newer);
    expect(m.purchases.tokens).toEqual(fifty);
    expect(m.stock).toEqual(newer.stock);
  });

  it('events: more solved wins, a tie keeps the smaller ms, lastAt is the max; groups: union with max', () => {
    const a = T([], NOW - 50, {
      events: { 'snow-paws-2026': { solved: 3, ms: 500, lastAt: 9 }, 'yarn-hearts-2027': { solved: 1, ms: 1, lastAt: 1 } },
      groups: { g1: { endsAt: 100, total: 40, wins: 2, claimed: 0 } },
    });
    const b = T([], NOW, {
      events: { 'snow-paws-2026': { solved: 3, ms: 400, lastAt: 3 } },
      groups: { g1: { endsAt: 100, total: 30, wins: 3, claimed: 1 }, g2: { endsAt: 200, total: 5, wins: 1, claimed: 0 } },
    });
    const m = merge(a, b);
    expect(m.events).toEqual({
      'snow-paws-2026': { solved: 3, ms: 400, lastAt: 9 },
      'yarn-hearts-2027': { solved: 1, ms: 1, lastAt: 1 },
    });
    expect(m.groups).toEqual({ g1: { endsAt: 100, total: 40, wins: 3, claimed: 1 }, g2: { endsAt: 200, total: 5, wins: 1, claimed: 0 } });
  });

  it('rank.pending and inProgress.event follow the newer document; lastSubmitAt is the max', () => {
    const slot = { ...(full().inProgress.level as InProgressV2), id: 'Elantern-walk-2026/5' as const, mode: 'event' as const };
    const a = T([], NOW - 50, { rank: { pending: { period_points: 99 }, lastSubmitAt: 70 }, inProgress: { level: null, daily: null, event: slot } });
    const b = T([], NOW, { rank: { pending: { daily_fastest: 5 }, lastSubmitAt: 10 } });
    const m = merge(a, b);
    expect(m.rank).toEqual({ pending: { daily_fastest: 5 }, lastSubmitAt: 70 });
    expect(m.inProgress.event).toBeNull();
    expect(merge(b, { ...a, updatedAt: NOW + 1 }).inProgress.event).toEqual(slot);
  });

  it('round trip: a v3 document with every new field set survives JSON + migrate unchanged', () => {
    const slot = { ...(full().inProgress.level as InProgressV2), id: 'Elantern-walk-2026/3' as const, mode: 'event' as const };
    const s: SaveData = {
      ...full(),
      inProgress: { ...full().inProgress, event: slot },
      groups: { 'tour-1': { endsAt: NOW + 5, total: 120, wins: 4, claimed: 0 } },
      purchases: { noAds: true, tokens: ['remove_ads|t1', 'fish_250|t2'] },
      rank: { pending: { event_lantern_walk_2026: 3_000_123, period_points: 3_900_042 }, lastSubmitAt: NOW - 3 },
    };
    const r = migrateReport(JSON.parse(JSON.stringify(s)) as unknown, NOW);
    expect(r.outcome).toBe('ok');
    expect(r.save).toEqual(s);
  });

  it('validateSlot accepts an event slot for its puzzle and rejects one for another id or mode', () => {
    const ep = makePuzzle('Elantern-walk-2026/0', R5, S5);
    const st = run(playing(ep, 'event'), [tap(1)]).state;
    const slot = toInProgress(st, NOW);
    expect(slot.mode).toBe('event');
    expect(validateInProgress(slot, ep, { mode: 'event', id: ep.id }).ok).toBe(true);
    expect(validateInProgress(slot, ep, { mode: 'event', id: 'Elantern-walk-2026/1' }).ok).toBe(false);
    expect(validateInProgress({ ...slot, mode: 'level' }, ep, { mode: 'event', id: ep.id }).ok).toBe(false);
  });

  it('size bound: 1 000 levels, a year of dailies, 3 events, 10 groups and 50 ledger entries stay under 40 KB', () => {
    const best: Record<number, [number, number]> = {};
    for (let l = 1; l <= 1000; l++) best[l] = [3_599_999, 3];
    const daily: Record<string, [number, number, number, number]> = {};
    for (let d = 0; d < 366; d++) daily[new Date(Date.UTC(2026, 0, 1) + d * 86_400_000).toISOString().slice(0, 10)] = [3_599_999, 3, 9, 9];
    const groups: SaveData['groups'] = {};
    for (let g = 0; g < 10; g++) groups[`tournament-${g}-0123456789`] = { endsAt: NOW + g, total: 999_999, wins: 999, claimed: 1 };
    const s: SaveData = {
      ...full(),
      progress: { level: 1001, completed: 1000, best },
      daily,
      events: {
        'lantern-walk-2026': { solved: 21, ms: 99_999_999, lastAt: NOW },
        'snow-paws-2026': { solved: 21, ms: 99_999_999, lastAt: NOW },
        'yarn-hearts-2027': { solved: 21, ms: 99_999_999, lastAt: NOW },
      },
      groups,
      purchases: { noAds: true, tokens: Array.from({ length: 50 }, (_, i) => `fish_900|${'x'.repeat(40)}${i}`) },
    };
    const json = JSON.stringify(s);
    expect(json.length).toBeLessThan(40_000);
    expect(migrate(JSON.parse(json) as unknown, NOW)).toEqual(s);
  });
});

describe('save v3 (phase2c §3.8)', () => {
  it('a v2 document migrates to v3: no wallet, the streak and period defaults, everything else kept', () => {
    const r = migrateReport(JSON.parse(JSON.stringify(fullV2())) as unknown, NOW);
    expect(r.outcome).toBe('ok');
    expect(r.save).not.toHaveProperty('wallet');
    expect(r.save).toEqual({
      ...full(),
      rank: fullV2().rank,
      streak: { current: 0, best: 0 },
      period: { key: '', total: 0, bestKey: '', bestTotal: 0 },
    });
  });

  it('the acceptance case: a wallet, a paw_points pending score and a fish_250 entry → no wallet, no paw score, +10 hints +3 kitties once', () => {
    const v2 = { ...fullV2(), rank: { pending: { paw_points: 375, event_snow_paws_2026: 2_000_000 }, lastSubmitAt: 1 }, purchases: { noAds: false, tokens: ['fish_250|tok-9'] } };
    const s = migrate(JSON.parse(JSON.stringify(v2)) as unknown, NOW);
    expect(s).not.toHaveProperty('wallet');
    expect(s.rank.pending).toEqual({ event_snow_paws_2026: 2_000_000 });
    expect(s.stock).toEqual({ hints: full().stock.hints + 10, kitties: full().stock.kitties + 3 });
    expect(s.purchases.tokens).toEqual(['fish_250|tok-9']);
    // Already v3: a second migration (the next boot) does not compensate again.
    expect(migrate(JSON.parse(JSON.stringify(s)) as unknown, NOW).stock).toEqual(s.stock);
    // Also after a merge with its own v2 cloud copy (both migrated): once.
    const cloud = migrate(JSON.parse(JSON.stringify({ ...v2, updatedAt: NOW - 1000 })) as unknown, NOW);
    expect(merge(s, cloud).stock).toEqual(s.stock);
    expect(merge(cloud, s).stock).toEqual(s.stock);
  });

  it('a v3 document is never compensated (its retired entries were compensated when it was migrated)', () => {
    const s: SaveData = { ...full(), purchases: { noAds: false, tokens: ['fish_900|x'] } };
    expect(migrate(JSON.parse(JSON.stringify(s)) as unknown, NOW).stock).toEqual(s.stock);
  });

  const V3_ROWS: { path: string; patch: (d: Record<string, unknown>) => void; check: (s: SaveData) => unknown; want: unknown }[] = [
    { path: 'streak', patch: (d) => (d.streak = 'hot'), check: (s) => s.streak, want: { current: 0, best: 0 } },
    { path: 'streak.current', patch: (d) => (d.streak = { current: -1, best: 4 }), check: (s) => s.streak, want: { current: 0, best: 4 } },
    { path: 'streak.best', patch: (d) => (d.streak = { current: 7, best: 3 }), check: (s) => s.streak, want: { current: 7, best: 7 } },
    { path: 'streak.best', patch: (d) => (d.streak = { current: 1, best: 2_000_000 }), check: (s) => s.streak, want: { current: 1, best: 1 } },
    { path: 'period', patch: (d) => (d.period = null), check: (s) => s.period, want: { key: '', total: 0, bestKey: '', bestTotal: 0 } },
    // A key that is not a Monday (e.g. written under another period.kind) resets the whole record.
    { path: 'period', patch: (d) => (d.period = { key: '2026-10-06', total: 4, bestKey: '', bestTotal: 0 }), check: (s) => s.period, want: { key: '', total: 0, bestKey: '', bestTotal: 0 } },
    { path: 'period', patch: (d) => (d.period = { key: '2026-10-05', total: 4, bestKey: 'last week', bestTotal: 9 }), check: (s) => s.period, want: { key: '', total: 0, bestKey: '', bestTotal: 0 } },
    { path: 'period.total', patch: (d) => (d.period = { key: '2026-10-05', total: 100_000, bestKey: '2026-09-28', bestTotal: 9 }), check: (s) => s.period, want: { key: '2026-10-05', total: 0, bestKey: '2026-09-28', bestTotal: 9 } },
    { path: 'period.total', patch: (d) => (d.period = { key: '', total: 5, bestKey: '', bestTotal: 0 }), check: (s) => s.period, want: { key: '', total: 0, bestKey: '', bestTotal: 0 } },
    { path: 'period.bestTotal', patch: (d) => (d.period = { key: '2026-10-05', total: 12, bestKey: '2026-10-05', bestTotal: 3 }), check: (s) => s.period, want: { key: '2026-10-05', total: 12, bestKey: '2026-10-05', bestTotal: 12 } },
  ];

  it.each(V3_ROWS)('garbage in $path → repaired', ({ path, patch, check, want }) => {
    const raw = JSON.parse(JSON.stringify(full())) as Record<string, unknown>;
    patch(raw);
    const r = migrateReport(raw, NOW);
    expect(check(r.save)).toEqual(want);
    expect(r.outcome).toBe('repaired');
    expect(r.repairedFields).toContain(path);
    expect(r.save.stock).toEqual(full().stock);
  });

  it('a changed period.kind starts the period record fresh; the streak is kept', () => {
    const day = mergeConfig({ period: { kind: 'day' } });
    const month = mergeConfig({ period: { kind: 'month' } });
    const weekly = JSON.parse(JSON.stringify(full())) as unknown;
    // '2026-10-05' is a day start too: kept under 'day'; under 'month' it is not a period start.
    expect(migrate(weekly, NOW, day).period).toEqual(full().period);
    expect(migrate(weekly, NOW, month).period).toEqual({ key: '', total: 0, bestKey: '', bestTotal: 0 });
    expect(migrate(weekly, NOW, month).streak).toEqual(full().streak);
  });

  it('merge: streak.current from the newer document, best = max of both', () => {
    const a: SaveData = { ...full(), updatedAt: NOW - 10, streak: { current: 9, best: 9 } };
    const b: SaveData = { ...full(), updatedAt: NOW, streak: { current: 0, best: 4 } }; // a mistake on the newer device
    expect(merge(a, b).streak).toEqual({ current: 0, best: 9 });
    expect(merge(b, a).streak).toEqual({ current: 0, best: 9 });
  });

  it('merge: equal period keys → total max; different keys → the later key; best = the higher bestTotal (tie: later key)', () => {
    const P = (key: string, total: number, bestKey: string, bestTotal: number): SaveData['period'] => ({ key, total, bestKey, bestTotal });
    const a: SaveData = { ...full(), updatedAt: NOW, period: P('2026-10-05', 7, '2026-09-28', 30) };
    const b: SaveData = { ...full(), updatedAt: NOW - 10, period: P('2026-10-05', 11, '2026-10-05', 11) };
    expect(merge(a, b).period).toEqual(P('2026-10-05', 11, '2026-09-28', 30));
    // The newer document's period is OLDER (it was not played this week): the later key wins anyway.
    const c: SaveData = { ...full(), updatedAt: NOW, period: P('2026-09-28', 20, '2026-09-28', 20) };
    const d: SaveData = { ...full(), updatedAt: NOW - 10, period: P('2026-10-05', 3, '2026-09-21', 20) };
    expect(merge(c, d).period).toEqual(P('2026-10-05', 3, '2026-09-28', 20));
    expect(merge(d, c).period).toEqual(P('2026-10-05', 3, '2026-09-28', 20));
    // best is never below the merged total.
    const e: SaveData = { ...full(), period: P('2026-10-05', 40, '2026-10-05', 40) };
    const f: SaveData = { ...full(), updatedAt: NOW, period: P('2026-10-05', 10, '2026-09-28', 30) };
    expect(merge(e, f).period).toEqual(P('2026-10-05', 40, '2026-10-05', 40));
  });

  it('the pending period_points score round-trips and follows the newer document', () => {
    const s = migrate(JSON.parse(JSON.stringify(full())) as unknown, NOW);
    expect(s.rank.pending).toEqual({ period_points: 3_900_042 });
  });
});

describe('phase2c.1 §3.2.3–§3.2.4: the slot\'s level-points fields; the save stays v3; the streak is frozen', () => {
  /** A level slot from a real attempt: C C M C on P5 → 1 824 points, run 1, rows 0–2. */
  const scored = (): InProgressV2 =>
    toInProgress(run(playing(P5), [dbl(SOL5[0] as number), dbl(SOL5[1] as number), dbl(WRONG5[0] as number), dbl(SOL5[2] as number)]).state, NOW - 3);
  const withSlot = (slot: unknown): unknown => ({ ...(JSON.parse(JSON.stringify(full())) as SaveData), inProgress: { level: slot, daily: null, event: null } });

  it('the version stays 3 and the three fields round-trip through JSON + migrate (outcome ok)', () => {
    expect(SAVE_VERSION).toBe(3);
    const r = migrateReport(JSON.parse(JSON.stringify(withSlot(scored()))) as unknown, NOW);
    expect(r.outcome).toBe('ok');
    expect(r.save.v).toBe(3);
    expect(r.save.inProgress.level).toEqual(scored());
    expect(r.save.inProgress.level).toMatchObject({ points: 1_824, catStreak: 1, scoredRows: 0b111 });
  });

  it('a slot written before 2c.1 (without the fields) is valid as it is: kept, not repaired, nothing invented', () => {
    const { points: _p, catStreak: _s, scoredRows: _r, ...old } = scored();
    const r = migrateReport(withSlot(old), NOW);
    expect(r.outcome).toBe('ok');
    expect(r.save.inProgress.level).toEqual(old);
    expect(Object.keys(r.save.inProgress.level as object)).not.toContain('points');
    expect(validateInProgress(old, P5, { mode: 'level', id: 'L2' }).ok).toBe(true);
    expect(validateInProgress(scored(), P5, { mode: 'level', id: 'L2' }).ok).toBe(true);
  });

  it.each([
    ['points', -1],
    ['points', 1.5],
    ['catStreak', '1'],
    ['scoredRows', null],
    ['points', Number.MAX_SAFE_INTEGER + 2],
  ] as const)('an invalid %s (%s) is dropped and reported; the slot and the other fields are kept', (key, bad) => {
    const r = migrateReport(withSlot({ ...scored(), [key]: bad }), NOW);
    expect(r.outcome).toBe('repaired');
    expect(r.repairedFields).toEqual([`inProgress.level.${key}`]);
    const slot = r.save.inProgress.level as InProgressV2;
    expect(slot).not.toBeNull();
    expect(key in slot).toBe(false);
    const { [key]: _gone, ...rest } = scored();
    expect(slot).toEqual(rest);
  });

  it('merge takes inProgress whole from the newer document, the level-points fields included', () => {
    const older: SaveData = { ...full(), updatedAt: NOW - 100 };
    const newer: SaveData = { ...full(), updatedAt: NOW, inProgress: { level: scored(), daily: null, event: null } };
    expect(merge(older, newer).inProgress.level).toEqual(scored());
    expect(merge(newer, older).inProgress.level).toEqual(scored());
  });

  it('a 2c perfect-streak record is still read and left unchanged (nothing writes it after 2c.1)', () => {
    const doc = { ...(JSON.parse(JSON.stringify(full())) as SaveData), streak: { current: 3, best: 9 } };
    const r = migrateReport(doc, NOW);
    expect(r.outcome).toBe('ok');
    expect(r.save.streak).toEqual({ current: 3, best: 9 });
  });
});

describe('phase 2d §1.15: ext.settingsSeen (the settings dot); the save stays v3', () => {
  const withExt = (ext: unknown): Record<string, unknown> => ({ ...(JSON.parse(JSON.stringify(full())) as Record<string, unknown>), ext });

  it('a valid marker (a finite number ≥ 0) is kept with the other ext keys; absent reads as 0', () => {
    expect(SETTINGS_SEEN_KEY).toBe('settingsSeen');
    for (const v of [0, 1, 2, 1.5, 1_000_000]) {
      const r = migrateReport(withExt({ coins: 3, settingsSeen: v }), NOW);
      expect(r.save.ext).toEqual({ coins: 3, settingsSeen: v });
      expect(r.repairedFields).not.toContain('ext.settingsSeen');
      expect(settingsSeenOf(r.save)).toBe(v);
    }
    const none = migrate(withExt({ coins: 3 }), NOW);
    expect(none.ext).toEqual({ coins: 3 });
    expect(settingsSeenOf(none)).toBe(0);
    expect(SAVE_VERSION).toBe(3);
    expect(none.v).toBe(3);
  });

  it('an invalid marker is dropped and reported; the rest of ext stays', () => {
    for (const bad of [-1, 'x', null, true, [1], { a: 1 }]) {
      const r = migrateReport(withExt({ coins: 3, settingsSeen: bad }), NOW);
      expect(r.save.ext).toEqual({ coins: 3 });
      expect(r.repairedFields).toContain('ext.settingsSeen');
      expect(r.outcome).toBe('repaired');
    }
    // NaN and Infinity do not survive JSON; as in-memory values they are dropped too.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = migrateReport({ ...withExt({}), ext: { settingsSeen: bad } }, NOW);
      expect(r.save.ext).toEqual({});
      expect(r.repairedFields).toContain('ext.settingsSeen');
    }
  });

  it('merge keeps the larger marker whichever copy is newer; absent in both stays absent', () => {
    const a = { ...full(), updatedAt: NOW, ext: { coins: 1, settingsSeen: 1 } };
    const b = { ...full(), updatedAt: NOW + 1, ext: { coins: 2 } };
    expect(merge(a, b).ext).toEqual({ coins: 2, settingsSeen: 1 }); // newer ext, the larger marker
    expect(merge(b, a).ext).toEqual({ coins: 2, settingsSeen: 1 });
    const c = { ...b, ext: { coins: 2, settingsSeen: 3 } };
    expect(merge(a, c).ext).toEqual({ coins: 2, settingsSeen: 3 });
    const older = { ...c, updatedAt: NOW - 10 };
    expect(merge(older, a).ext).toEqual({ coins: 1, settingsSeen: 3 }); // the older copy's larger marker wins
    const none = merge({ ...full(), ext: {} }, { ...full(), updatedAt: NOW + 5, ext: { coins: 9 } });
    expect(none.ext).toEqual({ coins: 9 });
    expect(SETTINGS_SEEN_KEY in none.ext).toBe(false);
  });

  it('markSettingsSeen sets the marker to settingsDot.version (never lowers it); settingsDotOn compares', () => {
    const s = { ...full(), ext: { coins: 3 } };
    expect(settingsDotOn(s)).toBe(true);
    const seen = markSettingsSeen(s);
    expect(seen.ext).toEqual({ coins: 3, settingsSeen: 1 });
    expect(settingsDotOn(seen)).toBe(false);
    expect(markSettingsSeen(seen)).toBe(seen); // nothing to change: the same object
    const later = { ...s, ext: { settingsSeen: 5 } };
    expect(markSettingsSeen(later)).toBe(later); // never lowered
    const v2 = mergeConfig({ settingsDot: { version: 2 } });
    expect(settingsDotOn(seen, v2)).toBe(true);
    expect(markSettingsSeen(seen, v2).ext).toEqual({ coins: 3, settingsSeen: 2 });
    const off = mergeConfig({ settingsDot: { version: 0 } });
    expect(settingsDotOn(s, off)).toBe(false);
    expect(markSettingsSeen(s, off)).toBe(s);
  });

  it('a migrated and saved marker round-trips (JSON)', () => {
    const seen = markSettingsSeen(full());
    expect(migrate(JSON.stringify(seen), NOW).ext).toEqual(seen.ext);
  });
});
