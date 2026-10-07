// Owner: game. Save schema v1 (04 §4.3, §7): defaults, migrate (garbage, partial, wrong types), merge table
// (§7.3), in-progress validation (§7.2), cells codec, size bound.
import { describe, expect, it } from 'vitest';
import { mergeConfig } from '../../../src/app/config';
import { toInProgress } from '../../../src/game/factory';
import {
  clearStaleSlots,
  decodeCells,
  defaults,
  encodeCells,
  merge,
  migrate,
  migrateReport,
  validateInProgress,
} from '../../../src/game/save';
import type { InProgressV1, SaveDataV1 } from '../../../src/game/types';
import { dbl, lostState, makePuzzle, P5, P5G, playing, R5, run, S5, SOL5, tap, wonState, WRONG5 } from './fixtures';

const NOW = 1_790_000_000_000;

/** A fully populated, valid save. */
function full(): SaveDataV1 {
  const level = toInProgress(run(playing(P5), [tap(1), dbl(WRONG5[1] as number)]).state, NOW - 5);
  return {
    v: 1,
    updatedAt: NOW - 10,
    firstSeenAt: NOW - 86_400_000 * 9,
    sessions: 12,
    tutorialDone: true,
    progress: { level: 2, completed: 1, best: { 1: [61_000, 0] } },
    stock: { hints: 2, kitties: 7 },
    daily: { '2026-10-05': [252_000, 1, 0, 0] },
    settings: { sound: false, haptics: true, patterns: true, reduceMotion: 'on' },
    ads: { lastAdAt: NOW - 200_000, lastFallbackGrantAt: NOW - 700_000 },
    inProgress: { level, daily: null },
    ext: { coins: 3, nested: { a: [1, 2] } },
  };
}

describe('defaults (04 §4.3)', () => {
  it('matches the spec exactly', () => {
    expect(defaults(NOW)).toEqual({
      v: 1,
      updatedAt: NOW,
      firstSeenAt: NOW,
      sessions: 0,
      tutorialDone: false,
      progress: { level: 1, completed: 0, best: {} },
      stock: { hints: 5, kitties: 3 },
      daily: {},
      settings: { sound: true, haptics: true, patterns: false, reduceMotion: 'system' },
      ads: { lastAdAt: 0, lastFallbackGrantAt: 0 },
      inProgress: { level: null, daily: null },
      ext: {},
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
    const r = migrateReport({ ...full(), settings: { sound: false, haptics: 'yes', patterns: true, reduceMotion: 'fast' } }, NOW);
    expect(r.save.settings).toEqual({ sound: false, haptics: true, patterns: true, reduceMotion: 'system' });
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
  const ROWS: { path: string; patch: (d: Record<string, unknown>) => void; check: (s: SaveDataV1) => unknown; want: unknown }[] = [
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
    { path: 'v', patch: (d) => (d.v = '1'), check: (s) => s.v, want: 1 },
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
    const raw = JSON.parse(JSON.stringify(full())) as SaveDataV1;
    const slot = { ...(raw.inProgress.level as InProgressV1), extra: 'x' };
    const s = migrate({ ...raw, inProgress: { level: slot, daily: null } }, NOW);
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
  const local = (): SaveDataV1 => full();
  const cloud = (): SaveDataV1 => ({
    ...full(),
    updatedAt: NOW, // newer
    firstSeenAt: NOW - 86_400_000 * 30,
    sessions: 4,
    tutorialDone: false,
    progress: { level: 2, completed: 1, best: { 1: [70_000, 2], 9: [5, 0] } },
    stock: { hints: 9, kitties: 0 },
    daily: { '2026-10-05': [200_000, 3, 1, 1], '2026-10-04': [1000, 0, 0, 0] },
    settings: { sound: true, haptics: false, patterns: false, reduceMotion: 'off' },
    ads: { lastAdAt: 1, lastFallbackGrantAt: 2 },
    inProgress: { level: null, daily: null },
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
    expect(m.inProgress).toEqual({ level: null, daily: null });
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
    const l = { ...local(), updatedAt: NOW + 1, inProgress: { level: local().inProgress.level, daily: d } };
    const c = { ...cloud(), progress: { level: 3, completed: 2, best: {} } };
    const m = merge(l, c);
    expect(m.progress.level).toBe(3);
    expect(m.inProgress).toEqual({ level: null, daily: null }); // L2 won elsewhere; 2026-10-05 already solved
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
  const base = (): InProgressV1 => toInProgress(run(playing(), [tap(1), dbl(SOL5[0] as number), dbl(WRONG5[1] as number)]).state, NOW);

  it('accepts real slots: playing, lost, won, revived, with givens', () => {
    expect(validateInProgress(base(), P5, expectL2)).toEqual({ ok: true });
    expect(validateInProgress(toInProgress(lostState(), 1), P5, expectL2)).toEqual({ ok: true });
    expect(validateInProgress(toInProgress(wonState(), 1), P5, expectL2)).toEqual({ ok: true });
    const revived = run(lostState(), [{ type: 'REVIVE', t: 1 }, dbl(WRONG5[3] as number)]).state;
    expect(validateInProgress(toInProgress(revived, 1), P5, expectL2)).toEqual({ ok: true });
    const g = toInProgress(run(playing(P5G), [tap(1)]).state, 1);
    expect(validateInProgress(g, P5G, { mode: 'level', id: 'L3' })).toEqual({ ok: true });
  });

  const ROWS: { reason: string; slot: () => InProgressV1; puzzle?: typeof P5; expect?: { mode: 'level' | 'daily'; id: 'L2' | 'L3' | `D${string}` } }[] = [
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
    const best: SaveDataV1['progress']['best'] = {};
    for (let l = 1; l <= 1000; l++) best[l] = [3_599_999, 12];
    const daily: SaveDataV1['daily'] = {};
    for (let d = 0; d < 365; d++) daily[new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10)] = [3_599_999, 9, 9, 9];
    const slot = (id: InProgressV1['id'], mode: 'level' | 'daily'): InProgressV1 => ({
      id, mode, cells: '1'.repeat(144), hearts: 1, revivesUsed: 1, mistakes: 3, hintsUsed: 25, kittiesUsed: 12, elapsedMs: 3_599_999, savedAt: NOW,
    });
    const big: SaveDataV1 = {
      ...s,
      sessions: 9999,
      tutorialDone: true,
      progress: { level: 1001, completed: 1000, best },
      daily,
      inProgress: { level: slot('L1001', 'level'), daily: slot('D2026-12-31', 'daily') },
    };
    const bytes = new TextEncoder().encode(JSON.stringify(big)).length;
    expect(bytes).toBeLessThan(40 * 1024);
    expect(migrate(JSON.parse(JSON.stringify(big)) as unknown, NOW)).toEqual(big);
  });
});
