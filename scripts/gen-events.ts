// Owner: C
// Generates the event packs (phase2b §4.2): for each def in src/data/events/events.json, `count`
// LevelRecords with our engine, seeds `mewdoku:event:v1:<id>:<i>`, the def's size weights (shared out
// in ascending size order, game/events.ts eventSizeSchedule) and grade band, a duplicate check against
// the shipped level and daily packs and every earlier event puzzle; writes src/data/events/<id>.json.
// Deterministic. Run with `npm run events:gen` (options: --ids a,b  --workers 2  --no-cache  --out src/data).
// scripts/verify-levels.ts verifies the output.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isMainThread } from 'node:worker_threads';
import { cfg } from '../src/app/config';
import { decodeRegions, isDailyPack, isLevelPack } from '../src/engine/codec';
import { canonicalKey } from '../src/engine/filters';
import type { GenSpec, LevelRecord } from '../src/engine/types';
import { eventSpec, isEventPack, validateEventDefs, type EventDef, type EventPack } from '../src/game/events';
import { SEEDS } from '../src/game/ramp';
import { CONTENT_CACHE_DIR, parseArgs, runGenTask, runGenTasks, type GenTask, type GenTaskResult } from './gen-pool';
import { orderedRecord } from './verify-levels';

export interface GenEventsOptions {
  readonly ids?: readonly string[];
  readonly workers?: number;
  readonly noCache?: boolean;
  /** The data directory (default src/data). */
  readonly outDir?: string;
  readonly log?: (s: string) => void;
}

const keyOf = (rec: LevelRecord): string => canonicalKey(rec.n, decodeRegions(rec.r, rec.n));

/** The validated defs of `<dataDir>/events/events.json`; throws on any schema problem. */
export function readEventDefs(dataDir = 'src/data'): readonly EventDef[] {
  const raw: unknown = JSON.parse(readFileSync(`${dataDir}/events/events.json`, 'utf8'));
  const { defs, errors } = validateEventDefs(raw);
  if (errors.length > 0) throw new Error(`events.json: ${errors.join('; ')}`);
  return defs;
}

/** The specs tried for puzzle `index`: its own seed, then the retry seed with the same band. */
export function eventSpecs(def: EventDef, index: number): GenSpec[] {
  const spec = eventSpec(def, index);
  if (!spec) throw new Error(`${def.id}: no "gen" block, cannot generate puzzle ${index}`);
  return [spec, { ...spec, seed: SEEDS.retry(spec.seed) }];
}

const taskKey = (def: EventDef, index: number): string => `${def.id}/${index}`;

/** A pack record: i = puzzle number (index + 1), h = 0, the 03 §9.1 key order. */
export function eventRecord(rec: LevelRecord, index: number): LevelRecord {
  return orderedRecord({ i: index + 1, n: rec.n, r: rec.r, s: rec.s, g: rec.g, e: rec.e, h: 0 });
}

/** Compact JSON with one record per line (reviewable diffs), like the level packs. */
export function formatEventPack(p: EventPack): string {
  const head = JSON.stringify({ v: p.v, kind: p.kind, id: p.id, gen: p.gen, count: p.count }).slice(0, -1);
  return `${head},"puzzles":[\n${p.puzzles.map((r) => JSON.stringify(orderedRecord(r))).join(',\n')}\n]}\n`;
}

/** Canonical keys of every shipped level and daily board (event puzzles must avoid them). */
export function shippedKeys(dataDir: string): Set<string> {
  const seen = new Set<string>();
  const levelsDir = `${dataDir}/levels`;
  if (existsSync(levelsDir)) {
    for (const f of readdirSync(levelsDir).filter((x) => /^pack-\d{3}\.json$/.test(x)).sort()) {
      const pack: unknown = JSON.parse(readFileSync(`${levelsDir}/${f}`, 'utf8'));
      if (isLevelPack(pack)) for (const rec of pack.levels) seen.add(keyOf(rec));
    }
  }
  const dailyDir = `${dataDir}/daily`;
  if (existsSync(dailyDir)) {
    for (const f of readdirSync(dailyDir).filter((x) => /^\d{4}-\d{2}\.json$/.test(x)).sort()) {
      const pack: unknown = JSON.parse(readFileSync(`${dailyDir}/${f}`, 'utf8'));
      if (isDailyPack(pack)) for (const rec of Object.values(pack.days)) seen.add(keyOf(rec));
    }
  }
  return seen;
}

export async function genEvents(opts: GenEventsOptions = {}): Promise<EventPack[]> {
  const log = opts.log ?? ((s: string) => process.stdout.write(`${s}\n`));
  const t0 = performance.now();
  const dataDir = opts.outDir ?? 'src/data';
  const all = readEventDefs(dataDir);
  const wanted = opts.ids ? all.filter((d) => opts.ids?.includes(d.id)) : all;
  if (opts.ids) {
    const missing = opts.ids.filter((id) => !all.some((d) => d.id === id));
    if (missing.length) throw new Error(`unknown event id(s): ${missing.join(', ')}`);
  }
  const tasks: GenTask[] = [];
  for (const def of wanted) for (let i = 0; i < def.puzzles.count; i++) tasks.push({ key: taskKey(def, i), specs: eventSpecs(def, i) });
  const cachePath = opts.noCache ? null : `${CONTENT_CACHE_DIR}/events.jsonl`;
  const raw = await runGenTasks(tasks, { workers: opts.workers ?? 2, cachePath, log, label: 'events' });

  // Duplicates: shipped levels and dailies, then every earlier event (start order), then earlier puzzles.
  const seen = shippedKeys(dataDir);
  if (seen.size === 0) log('warning: no level or daily packs found; events are deduplicated only among themselves');
  const packs: EventPack[] = [];
  const fallbacks: string[] = [];
  const regenerated: string[] = [];
  for (const def of all) {
    const generating = wanted.includes(def);
    if (!generating) {
      // Earlier events keep their shipped boards; later ones must avoid them too.
      const path = `${dataDir}/${def.puzzles.file}`;
      if (existsSync(path)) {
        const pack: unknown = JSON.parse(readFileSync(path, 'utf8'));
        if (isEventPack(pack, def.id)) for (const rec of pack.puzzles) seen.add(keyOf(rec));
      }
      continue;
    }
    const puzzles: LevelRecord[] = [];
    for (let i = 0; i < def.puzzles.count; i++) {
      const key = taskKey(def, i);
      const res = raw.get(key) as GenTaskResult;
      if (res.specIndex > 0) fallbacks.push(key);
      let rec = eventRecord(res.record, i);
      if (seen.has(keyOf(rec))) {
        regenerated.push(key);
        rec = eventRecord(runGenTask({ key, specs: eventSpecs(def, i) }, seen).record, i);
      }
      seen.add(keyOf(rec));
      puzzles.push(rec);
    }
    const pack: EventPack = { v: 1, kind: 'event', id: def.id, gen: cfg.gen.version, count: puzzles.length, puzzles };
    writeFileSync(`${dataDir}/${def.puzzles.file}`, formatEventPack(pack));
    packs.push(pack);
    const sizes = puzzles.map((r) => r.n).join(' ');
    const grades = [1, 2, 3, 4, 5].map((g) => puzzles.filter((r) => r.g === g).length);
    log(`${def.id}: ${puzzles.length} puzzles, sizes ${sizes}; grades G1–G5 ${grades.join(' ')}`);
  }
  log(`fallback seeds: ${fallbacks.join(', ') || 'none'}; duplicates regenerated: ${regenerated.join(', ') || 'none'}`);
  log(`time: ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  return packs;
}

export async function main(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const ids = args.str('--ids');
  const workers = args.num('--workers');
  const outDir = args.str('--out');
  await genEvents({
    ...(ids !== undefined ? { ids: ids.split(',').map((s) => s.trim()).filter(Boolean) } : {}),
    ...(workers !== undefined ? { workers } : {}),
    ...(outDir !== undefined ? { outDir } : {}),
    noCache: args.flag('--no-cache'),
  });
}

if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exitCode = 1;
  });
}
