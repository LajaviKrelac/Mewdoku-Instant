// Owner: content
// The content pipeline itself (03 §8.2–8.3, 02 §11.2): schedule rules, effort sort + repair, month
// ranges, and that scripts/verify-levels.ts catches tampered content (so a green verify means
// something). Runs in the `property` project next to levels.spec.ts.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cfg } from '../../src/app/config';
import type { LevelPack, LevelRecord, PackManifest } from '../../src/engine/types';
import { bandFor, breatherBand, breatherPool, isHardLevel, rampRowFor, RAMP } from '../../src/game/ramp';
import { datesOf, monthRange } from '../../scripts/gen-daily';
import { slotSpec, sortAndRepair, tutorialRecord } from '../../scripts/gen-levels';
import { buildSchedule, tripleRuns, type LevelSlot } from '../../scripts/level-schedule';
import { formatLevelPack, MANIFEST_FILE, sha256Hex, verifyAll } from '../../scripts/verify-levels';

const slots = buildSchedule();

describe('level schedule (02 §11.2 four steps, 03 §8.2)', () => {
  it('is deterministic and covers levels 1…shipped', () => {
    expect(buildSchedule()).toEqual(slots);
    expect(slots.map((s) => s.level)).toEqual(Array.from({ length: cfg.levels.shipped }, (_, k) => k + 1));
    expect(buildSchedule(50)).toEqual(slots.slice(0, 50));
  });

  it('level 1 is the 4×4 tutorial slot; levels 2–3 are 5×5 and level 4 is forced to 6×6', () => {
    expect(slots[0]).toMatchObject({ level: 1, n: 4, band: [1, 1], hard: false, breather: false, sortable: false });
    expect(slots.slice(1, 4).map((s) => s.n)).toEqual([5, 5, 6]);
  });

  it('every slot follows steps 1–2 (pool, band, hard, breather) and picks n from its pool', () => {
    for (const s of slots.slice(1)) {
      const row = rampRowFor(s.level);
      const hard = isHardLevel(s.level);
      const breather = !hard && isHardLevel(s.level - 1);
      const band = bandFor(row, hard);
      expect({ hard: s.hard, breather: s.breather, sortable: s.sortable, row: s.rowIndex }).toEqual({ hard, breather, sortable: !hard && !breather, row: RAMP.indexOf(row) });
      expect(s.band).toEqual(breather ? breatherBand(band) : band);
      expect(s.pool).toEqual(breather ? breatherPool(row.sizes) : row.sizes);
      expect(s.pool.map(([n]) => n)).toContain(s.n);
    }
  });

  it('step 3: no three equal sizes in a row in the schedule', () => {
    expect(tripleRuns(slots.map((s) => s.n))).toEqual([]);
  });

  it('slot specs carry the shape-filter exemption only up to level 6, and G5 only on hard bands from 101', () => {
    for (const s of slots.slice(1)) {
      const spec = slotSpec(s);
      expect(spec.minRegion).toBe(s.level <= 6 || s.n < 6 ? 1 : 2);
      expect(spec.maxRegion).toBe(Math.ceil(2.5 * s.n));
      expect(spec.allowG5Steps).toBe(s.hard && s.level >= 101 ? 1 : 0);
      expect(spec.seed).toBe(`mewdoku:level:v1:${s.level}`);
    }
  });

  it('the tutorial record comes out of the engine as 02 §11.5 describes it', () => {
    expect(tutorialRecord()).toEqual({ i: 1, n: 4, r: 'ABCCAACCADDCDDDD', s: '1302', g: 1, e: 8, h: 0, gv: '', tut: 1 });
  });
});

/** Synthetic records: n from the slot, effort from `effort(level)`. */
const fake = (ss: readonly LevelSlot[], effort: (level: number) => number): LevelRecord[] =>
  ss.map((s) => ({ n: s.n, r: `L${s.level}`, s: '', g: 3, e: effort(s.level), h: 0 }));

describe('effort sort and repair (03 §8.3)', () => {
  const records = fake(slots, (L) => 1000 - L); // reverse effort: the sort must turn every row around
  const warnings: string[] = [];
  const out = sortAndRepair(slots, records, warnings);

  it('numbers every record by its slot, sets h from the schedule, and keeps hard and breather records in place', () => {
    out.forEach((rec, k) => {
      const slot = slots[k] as LevelSlot;
      expect(rec.i).toBe(slot.level);
      expect(rec.h).toBe(slot.hard ? 1 : 0);
      if (!slot.sortable) expect(rec.r).toBe(`L${slot.level}`);
    });
  });

  it('only permutes records among the sortable slots of the same ramp row', () => {
    for (let row = 0; row < RAMP.length; row++) {
      const levels = slots.filter((s) => s.rowIndex === row && s.sortable).map((s) => s.level);
      const placed = levels.map((L) => out[L - 1]?.r).sort();
      expect(placed).toEqual(levels.map((L) => `L${L}`).sort());
    }
  });

  it('leaves no runs of three, and puts low effort first despite the ±10 % noise', () => {
    expect(warnings).toEqual([]);
    expect(tripleRuns(out.map((r) => r.n))).toEqual([]);
    // Two effort classes 10× apart: the noise cannot cross them, so only repair swaps may.
    const twoClass = sortAndRepair(slots, fake(slots, (L) => (L % 2 === 0 ? 100 : 10)));
    for (const row of [6, 7, 8]) {
      const es = slots.filter((s) => s.rowIndex === row && s.sortable).map((s) => (twoClass[s.level - 1] as LevelRecord).e);
      const lows = es.filter((e) => e === 10).length;
      const lowFirst = es.slice(0, lows).filter((e) => e === 10).length;
      expect(lowFirst / lows).toBeGreaterThan(0.9);
    }
  });

  it('is deterministic', () => {
    expect(sortAndRepair(slots, records)).toEqual(out);
  });
});

describe('daily months', () => {
  it('monthRange is inclusive and crosses years; datesOf knows leap years', () => {
    const months = monthRange('2026-10', '2028-12');
    expect(months).toHaveLength(27);
    expect([months[0], months[3], months[26]]).toEqual(['2026-10', '2027-01', '2028-12']);
    expect(datesOf('2028-02')).toHaveLength(29);
    expect(datesOf('2027-02')).toHaveLength(28);
    expect(() => monthRange('2027-13', '2028-01')).toThrow(RangeError);
    expect(() => monthRange('2028-01', '2027-01')).toThrow(RangeError);
  });
});

describe('verify-levels catches tampered content', () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  /** A copy of the shipped level packs (no dailies) with `edit` applied to pack 0 and re-hashed. */
  function tampered(edit: (pack: LevelPack) => void, rehash = true): string {
    const dir = mkdtempSync(join(tmpdir(), 'mewdoku-verify-'));
    dirs.push(dir);
    cpSync('src/data/levels', join(dir, 'levels'), { recursive: true });
    const packPath = join(dir, 'levels/pack-000.json');
    const pack = JSON.parse(readFileSync(packPath, 'utf8')) as LevelPack;
    edit(pack);
    writeFileSync(packPath, formatLevelPack(pack));
    const manifest = JSON.parse(readFileSync(join(dir, MANIFEST_FILE), 'utf8')) as PackManifest;
    manifest.daily = [];
    if (rehash && manifest.packs[0]) manifest.packs[0].sha256 = sha256Hex(readFileSync(packPath));
    writeFileSync(join(dir, MANIFEST_FILE), JSON.stringify(manifest));
    return dir;
  }
  const lv = (pack: LevelPack, level: number): LevelRecord => pack.levels[level - 1] as LevelRecord;
  const messages = (dir: string): string[] => verifyAll(dir, { oracle: false }).map((i) => `${i.key}: ${i.message}`);

  it('passes an untouched copy', () => {
    expect(messages(tampered(() => undefined))).toEqual([]);
  });

  it('flags a changed grade, a hash mismatch, a duplicate board and a wrong hard flag', () => {
    expect(messages(tampered((p) => void (lv(p, 50).g = 3 === lv(p, 50).g ? 4 : 3))).join('\n')).toMatch(/50: stored g=/);
    expect(messages(tampered((p) => void (lv(p, 9).e += 1), false)).join('\n')).toMatch(/SHA-256 does not match/);
    expect(messages(tampered((p) => void Object.assign(lv(p, 60), { ...lv(p, 59), i: 60 }))).join('\n')).toMatch(/60: duplicate board/);
    expect(messages(tampered((p) => void (lv(p, 30).h = 0))).join('\n')).toMatch(/30: h=0/);
  });

  it('flags a board with many solutions and a broken numbering', () => {
    // Rows as regions: structurally valid (s = 41302 is a king permutation, one cat per region), but
    // every king permutation solves it.
    const manySolutions = tampered((p) => void (lv(p, 2).r = 'AAAAABBBBBCCCCCDDDDDEEEEE'));
    expect(messages(manySolutions)).toContain('2: 2 solutions (expected exactly 1)');
    expect(messages(tampered((p) => void p.levels.splice(10, 1))).join('\n')).toMatch(/i=12, expected 11|count mismatch/);
  });
});
