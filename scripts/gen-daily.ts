// Owner: content
// Generates src/data/daily/YYYY-MM.json for a month range (03 §8.6): weekday size/band (02 §12),
// seed SEEDS.daily(date), dedup shared with the level packs. Usage: --from 2026-10 --to 2028-12.
// Options: --workers 2, --out src/data, --no-cache. Resumable like gen-levels (JSONL cache).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isMainThread } from 'node:worker_threads';
import { cfg } from '../src/app/config';
import { decodeRegions, isDailyPack, isLevelPack } from '../src/engine/codec';
import { canonicalKey } from '../src/engine/filters';
import type { DailyPack, GenSpec, LevelRecord } from '../src/engine/types';
import { dailySpec } from '../src/game/progression';
import { SEEDS, weekdayOfDateKey } from '../src/game/ramp';
import { CONTENT_CACHE_DIR, parseArgs, runGenTask, runGenTasks, type GenTask, type GenTaskResult } from './gen-levels';
import { nextMonth, orderedRecord, updateManifest, writeDailyPack } from './verify-levels';

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** YYYY-MM months from `from` to `to`, inclusive. */
export function monthRange(from: string, to: string): string[] {
  if (!MONTH_RE.test(from) || !MONTH_RE.test(to)) throw new RangeError(`monthRange: bad month ${from} / ${to}`);
  if (from > to) throw new RangeError(`monthRange: ${from} is after ${to}`);
  const out: string[] = [];
  for (let m = from; m <= to; m = nextMonth(m)) out.push(m);
  return out;
}

/** Every YYYY-MM-DD of a month, in order. */
export function datesOf(month: string): string[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: days }, (_, d) => `${month}-${String(d + 1).padStart(2, '0')}`);
}

/** The runtime daily spec (game/progression dailySpec), then the retry seed with the same band. */
export function dailySpecs(dateKey: string): GenSpec[] {
  const spec = dailySpec(dateKey);
  return [spec, { ...spec, seed: SEEDS.retry(spec.seed) }];
}

const dailyTask = (dateKey: string): GenTask => ({ key: dateKey, specs: dailySpecs(dateKey) });
const keyOf = (rec: LevelRecord): string => canonicalKey(rec.n, decodeRegions(rec.r, rec.n));
const dailyRecord = (rec: LevelRecord): LevelRecord => orderedRecord({ n: rec.n, r: rec.r, s: rec.s, g: rec.g, e: rec.e, h: 0 });

/** One record for a date (no `i`). */
export function generateDaily(dateKey: string, seen: Set<string>): LevelRecord {
  return dailyRecord(runGenTask(dailyTask(dateKey), seen).record);
}

export function generateMonth(month: string, seen: Set<string>): DailyPack {
  const days: Record<string, LevelRecord> = {};
  for (const date of datesOf(month)) {
    const rec = generateDaily(date, seen);
    seen.add(keyOf(rec));
    days[date] = rec;
  }
  return { v: 1, kind: 'daily', month, gen: cfg.gen.version, days };
}

/**
 * Canonical keys a daily for the first date of `firstMonth` must avoid: every shipped level, and
 * every daily record of an earlier month already on disk (so the set for a date never depends on
 * which months were generated in the same run).
 */
export function seenBefore(dataDir: string, firstMonth: string): Set<string> {
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
    for (const f of readdirSync(dailyDir).filter((x) => /^\d{4}-\d{2}\.json$/.test(x) && x.slice(0, 7) < firstMonth)) {
      const pack: unknown = JSON.parse(readFileSync(`${dailyDir}/${f}`, 'utf8'));
      if (isDailyPack(pack)) for (const rec of Object.values(pack.days)) seen.add(keyOf(rec));
    }
  }
  return seen;
}

export async function generateDailies(opts: {
  from: string;
  to: string;
  outDir?: string;
  workers?: number;
  cache?: boolean;
  log?: (s: string) => void;
}): Promise<DailyPack[]> {
  const log = opts.log ?? ((s: string) => process.stdout.write(`${s}\n`));
  const t0 = performance.now();
  const outDir = opts.outDir ?? 'src/data';
  const months = monthRange(opts.from, opts.to);
  const dates = months.flatMap(datesOf);
  const cachePath = opts.cache === false ? null : `${CONTENT_CACHE_DIR}/daily.jsonl`;
  const raw = await runGenTasks(dates.map(dailyTask), { workers: opts.workers ?? 2, cachePath, log, label: 'daily' });
  const seen = seenBefore(outDir, opts.from);
  if (seen.size === 0) log('warning: no level packs found; dailies are deduplicated only among themselves');
  const fallbacks: string[] = [];
  const regenerated: string[] = [];
  const packs: DailyPack[] = [];
  const files: { file: string; month: string; bytes: Uint8Array }[] = [];
  for (const month of months) {
    const days: Record<string, LevelRecord> = {};
    for (const date of datesOf(month)) {
      const res = raw.get(date) as GenTaskResult;
      if (res.specIndex > 0) fallbacks.push(date);
      let rec = dailyRecord(res.record);
      if (seen.has(keyOf(rec))) {
        regenerated.push(date);
        rec = generateDaily(date, seen);
      }
      seen.add(keyOf(rec));
      days[date] = rec;
    }
    const pack: DailyPack = { v: 1, kind: 'daily', month, gen: cfg.gen.version, days };
    const file = `daily/${month}.json`;
    writeDailyPack(`${outDir}/${file}`, pack);
    files.push({ file, month, bytes: readFileSync(`${outDir}/${file}`) });
    packs.push(pack);
  }
  updateManifest(outDir, { daily: files });
  // Report: grade mix per weekday, sizes, time.
  const perDay = WEEKDAYS.map(() => [0, 0, 0, 0, 0, 0]);
  for (const p of packs) {
    for (const [d, r] of Object.entries(p.days)) {
      const row = perDay[weekdayOfDateKey(d)] as number[];
      row[r.g] = (row[r.g] ?? 0) + 1;
    }
  }
  log('daily grade mix per weekday (G1 G2 G3 G4 G5):');
  perDay.forEach((row, w) => log(`  ${WEEKDAYS[w]}: ${row.slice(1).map((k) => String(k).padStart(4)).join(' ')}`));
  const bytes = files.map((f) => f.bytes.length);
  log(`months: ${months.length} (${dates.length} days), bytes per month ${Math.min(...bytes)}–${Math.max(...bytes)}, total ${bytes.reduce((a, b) => a + b, 0)}`);
  log(`fallback seeds: ${fallbacks.join(', ') || 'none'}; duplicates regenerated: ${regenerated.join(', ') || 'none'}`);
  let genMs = 0;
  for (const r of raw.values()) genMs += r.ms;
  log(`time: ${((performance.now() - t0) / 1000).toFixed(1)} s wall, ${(genMs / 1000).toFixed(1)} s summed per-date generation`);
  return packs;
}

export async function main(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const outDir = args.str('--out');
  const workers = args.num('--workers');
  await generateDailies({
    from: args.str('--from') ?? cfg.daily.firstPackMonth,
    to: args.str('--to') ?? '2028-12',
    ...(outDir !== undefined ? { outDir } : {}),
    ...(workers !== undefined ? { workers } : {}),
    cache: !args.flag('--no-cache'),
  });
}

if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exitCode = 1;
  });
}
