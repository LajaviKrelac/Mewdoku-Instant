// Owner: C
// Property tests over the shipped event packs (phase2b §4.2, §4.9): every record in
// src/data/events/<id>.json is structurally valid, has exactly one solution (two solvers), is graded
// as stored and tightly, sits in its event's band and size schedule, passes the shape filter, and no
// board repeats a level, a daily or another event puzzle. The pack count matches the def. Written
// against the engine directly (not via scripts/verify-levels.ts), so the two are independent witnesses.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkRecord, decodeRegions, decodeSolution, isDailyPack, isLevelPack, recordToPuzzle } from '../../src/engine/codec';
import { canonicalKey, shapeOk } from '../../src/engine/filters';
import { grade } from '../../src/engine/grader';
import { bruteForceCount } from '../../src/engine/solver-oracle';
import { countSolutions } from '../../src/engine/solver';
import type { Grade, LevelRecord } from '../../src/engine/types';
import { eventPuzzleId, eventSizeSchedule, isEventPack, validateEventDefs, type EventDef, type EventPack } from '../../src/game/events';
import { allowG5Steps, shapeLimits } from '../../src/game/ramp';

const DATA = new URL('../../src/data/', import.meta.url);
const json = (rel: string): unknown => JSON.parse(readFileSync(new URL(rel, DATA)).toString('utf8')) as unknown;
const { defs, errors } = validateEventDefs(json('events/events.json'));
const packs = new Map<string, EventPack>();
for (const def of defs) {
  const p = json(def.puzzles.file);
  if (isEventPack(p, def.id)) packs.set(def.id, p);
}
const keyOf = (r: LevelRecord): string => canonicalKey(r.n, decodeRegions(r.r, r.n));

describe('event packs (phase2b §4.2)', () => {
  it('phase2c §5.5: every milestone grants hints and kitties only (no fish), with the spec tracks', () => {
    for (const def of defs) {
      for (const m of def.track) expect(Object.keys(m.reward).every((k) => k === 'hints' || k === 'kitties'), `${def.id} @${m.at}`).toBe(true);
      expect(def.track.map((m) => [m.at, m.reward])).toEqual([
        [3, { hints: 2 }],
        [7, { hints: 2 }],
        [12, { kitties: 2 }],
        [16, { hints: 2, kitties: 1 }],
        [21, { hints: 3, kitties: 5 }],
      ]);
    }
  });

  it('events.json is valid and every def has its pack with the right count', () => {
    expect(errors).toEqual([]);
    expect(defs.length).toBe(3);
    for (const def of defs) {
      const pack = packs.get(def.id);
      expect(pack, def.id).toBeDefined();
      expect(pack?.count).toBe(def.puzzles.count);
      expect(pack?.puzzles).toHaveLength(def.puzzles.count);
      expect(pack?.gen.startsWith('mewdoku-gen/')).toBe(true);
    }
  });

  it('no file in src/data/events is unnamed', () => {
    const files = readdirSync(new URL('events/', DATA)).filter((f) => f.endsWith('.json')).sort();
    expect(files).toEqual(['events.json', ...defs.map((d) => d.puzzles.file.slice('events/'.length))].sort());
  });

  const rows: [string, number, LevelRecord, EventDef][] = [];
  for (const def of defs) packs.get(def.id)?.puzzles.forEach((r, i) => rows.push([def.id, i, r, def]));

  it.each(rows)('%s #%i: valid, unique, graded tightly, in band and schedule', (_id, i, rec, def) => {
    expect(checkRecord(rec).ok).toBe(true);
    expect(rec.i).toBe(i + 1);
    expect(rec.h).toBe(0);
    const band = def.gen?.band ?? [1, 5];
    const n = eventSizeSchedule(def.gen?.sizes ?? [], def.puzzles.count)[i];
    expect(rec.n).toBe(n);
    const regions = decodeRegions(rec.r, rec.n);
    const sol = decodeSolution(rec.s, rec.n);
    const res = countSolutions(rec.n, regions, 2);
    expect(res.count).toBe(1);
    expect(res.solutions[0]?.join()).toBe(sol.join());
    if (rec.n <= 8) expect(bruteForceCount(rec.n, regions, 2)).toBe(1);
    const g = grade(rec.n, regions);
    expect(g.grade).toBe(rec.g);
    expect(g.effort).toBe(rec.e);
    expect(rec.g).toBeGreaterThanOrEqual(band[0]);
    expect(rec.g).toBeLessThanOrEqual(band[1]);
    expect(g.counts[5]).toBeLessThanOrEqual(allowG5Steps(band));
    if (rec.g >= 2) expect(grade(rec.n, regions, { maxLevel: (rec.g - 1) as Grade }).grade).toBe(6);
    expect(shapeOk(rec.n, regions, shapeLimits(rec.n, null))).toBe(true);
    // It decodes into the puzzle the event session plays.
    expect(recordToPuzzle(rec, eventPuzzleId(def.id, i)).id).toBe(`E${def.id}/${i}`);
  });

  it('no board repeats a shipped level, a daily or another event puzzle', () => {
    const seen = new Map<string, string>();
    for (const f of readdirSync(new URL('levels/', DATA)).filter((x) => /^pack-\d{3}\.json$/.test(x))) {
      const p = json(`levels/${f}`);
      if (isLevelPack(p)) for (const r of p.levels) seen.set(keyOf(r), `level ${r.i}`);
    }
    for (const f of readdirSync(new URL('daily/', DATA)).filter((x) => /^\d{4}-\d{2}\.json$/.test(x))) {
      const p = json(`daily/${f}`);
      if (isDailyPack(p)) for (const [d, r] of Object.entries(p.days)) seen.set(keyOf(r), `daily ${d}`);
    }
    const clashes: string[] = [];
    for (const [id, i, rec] of rows) {
      const k = keyOf(rec);
      const where = seen.get(k);
      if (where) clashes.push(`${id} #${i + 1} = ${where}`);
      seen.set(k, `${id} #${i + 1}`);
    }
    expect(clashes).toEqual([]);
  });
});
