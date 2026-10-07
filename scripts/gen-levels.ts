// Owner: content
// Generates src/data/levels/pack-000…009.json + manifest.json (03 §8.3): per-slot generation with
// SEEDS.level(L), shape filters, grade band, dedup across all packs; then the per-row effort sort
// with SEEDS.sort noise and the no-three-in-a-row repair. Parallelisable with worker_threads.
//
// Usage: tsx scripts/gen-levels.ts [--workers 2] [--from L --to L] [--out src/data] [--no-cache]
// Every finished slot is appended to a JSONL cache (node_modules/.cache/mewdoku-content/), so an
// interrupted run resumes where it stopped. Output is byte-identical for the same engine version.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { cfg } from '../src/app/config';
import { decodeRegions } from '../src/engine/codec';
import { canonicalKey } from '../src/engine/filters';
import { generate } from '../src/engine/generator';
import { grade } from '../src/engine/grader';
import { makeRng } from '../src/engine/rng';
import { countSolutions } from '../src/engine/solver';
import type { GenSpec, LevelPack, LevelRecord } from '../src/engine/types';
import { makeGenSpec, RAMP, SEEDS } from '../src/game/ramp';
import { TUTORIAL_RECORD } from '../src/game/tutorial';
import { buildSchedule, tripleRuns, type LevelSlot } from './level-schedule';
import { orderedRecord, updateManifest, writeLevelPack } from './verify-levels';

// ───────────────────── Generation tasks: worker pool + resumable cache ─────────────────────

/** Specs tried in order; the first accepted puzzle wins. */
export interface GenTask {
  readonly key: string;
  readonly specs: readonly GenSpec[];
}

export interface GenTaskResult {
  readonly key: string;
  /** Index of the spec that produced the record (> 0: a fallback seed was needed). */
  readonly specIndex: number;
  readonly record: LevelRecord;
  readonly attempts: number;
  readonly ms: number;
}

/** Cache directory for resumable runs (git-ignored through node_modules/). */
export const CONTENT_CACHE_DIR = 'node_modules/.cache/mewdoku-content';

/** Runs one task in this thread; `seen` adds the 03 §8.4 duplicate check. Throws when every spec fails. */
export function runGenTask(task: GenTask, seen?: { has(key: string): boolean }): GenTaskResult {
  const t0 = performance.now();
  let attempts = 0;
  for (let i = 0; i < task.specs.length; i++) {
    const spec = task.specs[i] as GenSpec;
    const res = generate(spec, seen ? { seen } : {});
    attempts += res.attempts;
    if (res.ok) return { key: task.key, specIndex: i, record: res.record, attempts, ms: performance.now() - t0 };
  }
  const s = task.specs[0];
  throw new Error(`${task.key}: no accepted puzzle after ${attempts} attempts (n=${s?.n}, band G${s?.gradeBand.join('–G')}, seeds ${task.specs.map((x) => x.seed).join(', ')})`);
}

const taskHash = (task: GenTask): string =>
  createHash('sha256').update(JSON.stringify([cfg.gen.version, task.specs])).digest('hex').slice(0, 16);

function readCache(path: string): Map<string, GenTaskResult & { hash: string }> {
  const out = new Map<string, GenTaskResult & { hash: string }>();
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      const entry = JSON.parse(line) as GenTaskResult & { hash: string };
      if (typeof entry.key === 'string' && typeof entry.hash === 'string' && entry.record) out.set(entry.key, entry);
    } catch {
      // a torn last line after a crash: ignore it, the task runs again
    }
  }
  return out;
}

/**
 * Worker bootstrap: Node's built-in type stripping would load this .ts file without tsx's module
 * resolution (extensionless imports), so the worker registers tsx first and then imports us.
 */
function workerBoot(): string {
  const api = import.meta.resolve('tsx/esm/api');
  return `import(${JSON.stringify(api)}).then((m) => { m.register(); return import(${JSON.stringify(import.meta.url)}); });`;
}

type WorkerReply = { ok: true; result: GenTaskResult } | { ok: false; key: string; error: string };

export interface RunOptions {
  readonly workers: number;
  readonly cachePath: string | null;
  readonly log: (s: string) => void;
  readonly label: string;
}

/**
 * Runs tasks on `workers` worker threads (≤ 1: in this thread). Results already in the cache with an
 * identical spec hash are reused; each new result is appended to the cache as soon as it arrives.
 * Rejects after all tasks ran if any task failed, listing every failure.
 */
export async function runGenTasks(tasks: readonly GenTask[], opts: RunOptions): Promise<Map<string, GenTaskResult>> {
  const results = new Map<string, GenTaskResult>();
  const cached = opts.cachePath ? readCache(opts.cachePath) : new Map<string, GenTaskResult & { hash: string }>();
  const pending: (GenTask & { hash: string })[] = [];
  for (const task of tasks) {
    const hash = taskHash(task);
    const hit = cached.get(task.key);
    if (hit && hit.hash === hash) results.set(task.key, hit);
    else pending.push({ ...task, hash });
  }
  if (opts.cachePath) mkdirSync(dirname(opts.cachePath), { recursive: true });
  const t0 = performance.now();
  let done = 0;
  let lastLog = t0;
  const failures: string[] = [];
  const accept = (task: GenTask & { hash: string }, reply: WorkerReply): void => {
    done++;
    if (!reply.ok) failures.push(reply.error);
    else {
      results.set(task.key, reply.result);
      if (opts.cachePath) appendFileSync(opts.cachePath, `${JSON.stringify({ ...reply.result, hash: task.hash })}\n`);
    }
    const now = performance.now();
    if (now - lastLog > 10_000 || done === pending.length) {
      lastLog = now;
      opts.log(`${opts.label}: ${done}/${pending.length} generated (${tasks.length - pending.length} cached), ${((now - t0) / 1000).toFixed(0)} s`);
    }
  };
  const runLocal = (task: GenTask): WorkerReply => {
    try {
      return { ok: true, result: runGenTask(task) };
    } catch (err) {
      return { ok: false, key: task.key, error: err instanceof Error ? err.message : String(err) };
    }
  };
  if (opts.workers <= 1 || pending.length < 2) {
    for (const task of pending) accept(task, runLocal(task));
  } else {
    let next = 0;
    const pool: Worker[] = [];
    await new Promise<void>((resolveAll, rejectAll) => {
      let live = Math.min(opts.workers, pending.length);
      let failed = false;
      // Any crash stops the whole pool, so the script exits non-zero instead of hanging.
      const fail = (err: unknown): void => {
        if (failed) return;
        failed = true;
        for (const w of pool) void w.terminate();
        rejectAll(err instanceof Error ? err : new Error(String(err)));
      };
      for (let t = live; t > 0; t--) {
        const w = new Worker(workerBoot(), { eval: true, workerData: { mewdokuGenWorker: true } });
        pool.push(w);
        let current: (GenTask & { hash: string }) | undefined;
        let finished = false;
        const feed = (): void => {
          current = pending[next++];
          if (current) return void w.postMessage({ key: current.key, specs: current.specs } satisfies GenTask);
          finished = true;
          void w.terminate();
          if (--live === 0 && !failed) resolveAll();
        };
        w.on('message', (reply: WorkerReply) => {
          if (current) accept(current, reply);
          feed();
        });
        w.on('error', fail);
        w.on('exit', (code) => {
          if (!finished) fail(new Error(`${opts.label}: worker exited early (code ${code}) while on ${current?.key ?? '-'}`));
        });
        feed();
      }
    });
  }
  if (failures.length > 0) throw new Error(`${opts.label}: ${failures.length} task(s) failed:\n  ${failures.join('\n  ')}`);
  return results;
}

if (!isMainThread && (workerData as { mewdokuGenWorker?: boolean } | null)?.mewdokuGenWorker) {
  parentPort?.on('message', (task: GenTask) => {
    try {
      parentPort?.postMessage({ ok: true, result: runGenTask(task) } satisfies WorkerReply);
    } catch (err) {
      parentPort?.postMessage({ ok: false, key: task.key, error: err instanceof Error ? err.message : String(err) } satisfies WorkerReply);
    }
  });
}

/** `--name value` and `--flag` parsing for the content scripts. */
export function parseArgs(argv: readonly string[]): { str(name: string): string | undefined; num(name: string): number | undefined; flag(name: string): boolean } {
  const str = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    str,
    num(name) {
      const v = str(name);
      if (v === undefined) return undefined;
      const x = Number(v);
      if (!Number.isFinite(x)) throw new RangeError(`${name}: not a number: ${v}`);
      return x;
    },
    flag: (name) => argv.includes(name),
  };
}

// ───────────────────────────────────── Level slots ─────────────────────────────────────

export interface GenLevelsOptions {
  readonly from?: number;
  readonly to?: number;
  readonly outDir?: string;
  readonly workers?: number;
}

/** GenSpec of a shipped slot: the schedule's n and band, the 03 §4.5 shape limits, cfg.gen tuning. */
export function slotSpec(slot: LevelSlot): GenSpec {
  const base = makeGenSpec({ n: slot.n, seed: SEEDS.level(slot.level), band: slot.band, level: slot.level });
  return { ...base, edenOneIn: cfg.gen.edenOneIn, repairMaxIter: cfg.gen.repairMaxIter };
}

/**
 * Specs tried in order for a slot: the slot seed, then (only if 5 000 attempts fail) the retry seed
 * `<seed>:r1` with the same band and filters. A slot that needs the second spec is a "fallback" and
 * is listed in the build report.
 */
export function slotSpecs(slot: LevelSlot): GenSpec[] {
  const spec = slotSpec(slot);
  return [spec, { ...spec, seed: SEEDS.retry(spec.seed) }];
}

/** The hand-made tutorial board (02 §11.5) as a pack record; g and e come from the engine. */
export function tutorialRecord(): LevelRecord {
  const { n, r, s } = TUTORIAL_RECORD;
  const regions = decodeRegions(r, n);
  const sol = countSolutions(n, regions, 2);
  const g = grade(n, regions);
  if (sol.count !== 1 || g.grade !== 1) throw new Error(`tutorial board: ${sol.count} solutions, grade ${g.grade}`);
  return { i: 1, n, r, s, g: g.grade, e: g.effort, h: 0, gv: '', tut: 1 };
}

const slotTask = (slot: LevelSlot): GenTask => ({ key: `L${slot.level}`, specs: slotSpecs(slot) });

/**
 * One accepted record for a slot (no `i` yet; h from the schedule). Throws with a report when both the
 * slot seed and the retry seed fail cfg.gen.maxAttempts times (see slotSpecs).
 */
export function generateSlot(slot: LevelSlot, seen: Set<string>): LevelRecord {
  if (slot.level === 1) return tutorialRecord();
  const res = runGenTask(slotTask(slot), seen);
  return { ...res.record, h: slot.hard ? 1 : 0 };
}

/**
 * true when position x (0-based) is part of three equal sizes in a row whose members are all
 * "settled": at or before position `settled`, or fixed (hard/breather slots never move). Unsettled
 * sortable positions are checked when the repair reaches them.
 */
function runAt(slots: readonly LevelSlot[], recs: readonly LevelRecord[], x: number, settled: number): boolean {
  const ok = (p: number): boolean => p >= 0 && p < recs.length && (p <= settled || !(slots[p] as LevelSlot).sortable);
  const n = (p: number): number => (recs[p] as LevelRecord).n;
  for (let a = x - 2; a <= x; a++) {
    if (ok(a) && ok(a + 1) && ok(a + 2) && n(a) === n(a + 1) && n(a + 1) === n(a + 2)) return true;
  }
  return false;
}

const swap = (recs: LevelRecord[], a: number, b: number): void => {
  [recs[a], recs[b]] = [recs[b] as LevelRecord, recs[a] as LevelRecord];
};

/**
 * 03 §8.3 sort and repair; sets rec.i = slot level for every record. `records[k]` is the record
 * generated for `slots[k]`. Within each ramp row, the sortable slots get their records in ascending
 * e × (90 + rng.int(21)) order (ties: original level). The repair walks the sortable slots in level
 * order and, where a slot makes three equal sizes in a row, swaps in the first later record of the
 * row that breaks the run. Two additions to 03 §8.3: runs that end in fixed (hard or breather)
 * slots count too, since the repair never revisits those; and when no later record helps (the last
 * sortable slot of a row), the nearest earlier record of the row is tried, accepted only if neither
 * position is then in a run. `warnings` collects runs it could not break.
 */
export function sortAndRepair(
  slots: readonly LevelSlot[],
  records: readonly LevelRecord[],
  warnings: string[] = [],
): LevelRecord[] {
  if (slots.length !== records.length) throw new Error('sortAndRepair: slots and records differ in length');
  const recs = records.slice();
  const rng = makeRng(SEEDS.sort);
  for (let row = 0; row < RAMP.length; row++) {
    const idx: number[] = [];
    slots.forEach((s, k) => {
      if (s.rowIndex === row && s.sortable) idx.push(k);
    });
    if (idx.length === 0) continue;
    const keyed = idx.map((k) => {
      const rec = recs[k] as LevelRecord;
      return { rec, level: (slots[k] as LevelSlot).level, key: rec.e * (cfg.gen.sortNoiseBase + rng.int(cfg.gen.sortNoiseSpan)) };
    });
    keyed.sort((a, b) => a.key - b.key || a.level - b.level);
    idx.forEach((k, q) => {
      recs[k] = (keyed[q] as (typeof keyed)[number]).rec;
    });
    for (let q = 0; q < idx.length; q++) {
      const j = idx[q] as number;
      if (!runAt(slots, recs, j, j)) continue;
      const nj = (recs[j] as LevelRecord).n;
      const tryWith = (k: number): boolean => {
        if ((recs[k] as LevelRecord).n === nj) return false;
        swap(recs, j, k);
        if (!runAt(slots, recs, j, j) && (k > j || !runAt(slots, recs, k, j))) return true;
        swap(recs, j, k);
        return false;
      };
      let fixed = false;
      for (let p = q + 1; p < idx.length && !fixed; p++) fixed = tryWith(idx[p] as number);
      for (let p = q - 1; p >= 0 && !fixed; p--) fixed = tryWith(idx[p] as number);
      if (!fixed) warnings.push(`level ${(slots[j] as LevelSlot).level}: three ${nj}×${nj} in a row kept (no record of the row breaks the run)`);
    }
  }
  return recs.map((rec, k) => {
    const slot = slots[k] as LevelSlot;
    return orderedRecord({ ...rec, i: slot.level, h: slot.hard ? 1 : 0 });
  });
}

interface BuildReport {
  readonly fallbacks: string[];
  readonly dedupRegenerated: string[];
  readonly warnings: string[];
}

/**
 * Raw (pre-sort) records for every slot. Workers generate without the duplicate check; a sequential
 * pass in level order then regenerates any duplicate with the shared `seen` set, which gives exactly
 * the records of a fully sequential run (the check consumes no randomness, 03 §8.4).
 */
const keyOf = (rec: LevelRecord): string => canonicalKey(rec.n, decodeRegions(rec.r, rec.n));

function dedupInOrder(slots: readonly LevelSlot[], raw: ReadonlyMap<string, GenTaskResult>, report: BuildReport): LevelRecord[] {
  const seen = new Set<string>();
  const out: LevelRecord[] = [];
  for (const slot of slots) {
    let rec: LevelRecord;
    if (slot.level === 1) rec = tutorialRecord();
    else {
      let res = raw.get(`L${slot.level}`);
      if (!res) throw new Error(`missing result for level ${slot.level}`);
      if (seen.has(keyOf(res.record))) {
        report.dedupRegenerated.push(`level ${slot.level}`);
        res = runGenTask(slotTask(slot), seen);
      }
      if (res.specIndex > 0) report.fallbacks.push(`level ${slot.level} (seed ${slotSpecs(slot)[res.specIndex]?.seed})`);
      rec = res.record;
    }
    seen.add(keyOf(rec));
    out.push({ ...rec, h: slot.hard ? 1 : 0 });
  }
  return out;
}

function summary(records: readonly LevelRecord[], packSizes: readonly number[], report: BuildReport, ms: number, genMs: number): string {
  const lines: string[] = [];
  const byN = new Map<number, number[]>();
  for (const r of records) {
    const row = byN.get(r.n) ?? [0, 0, 0, 0, 0, 0];
    row[r.g] = (row[r.g] ?? 0) + 1;
    byN.set(r.n, row);
  }
  lines.push('grade distribution per size (n: G1 G2 G3 G4 G5 | total)');
  for (const n of [...byN.keys()].sort((a, b) => a - b)) {
    const row = byN.get(n) ?? [];
    lines.push(`  ${String(n).padStart(2)}×${n}: ${row.slice(1).map((k) => String(k).padStart(4)).join(' ')} | ${row.reduce((a, b) => a + b, 0)}`);
  }
  const hard = records.filter((r) => r.h === 1);
  lines.push(`hard levels: ${hard.length} (G4 ${hard.filter((r) => r.g === 4).length}, G5 ${hard.filter((r) => r.g === 5).length}, G3 ${hard.filter((r) => r.g === 3).length})`);
  lines.push(`pack sizes (bytes): ${packSizes.join(', ')} (total ${packSizes.reduce((a, b) => a + b, 0)})`);
  lines.push(`three-in-a-row after sort: ${tripleRuns(records.map((r) => r.n)).join(', ') || 'none'}`);
  lines.push(`fallback seeds: ${report.fallbacks.join('; ') || 'none'}`);
  lines.push(`duplicates regenerated: ${report.dedupRegenerated.join('; ') || 'none'}`);
  lines.push(`repair warnings: ${report.warnings.join('; ') || 'none'}`);
  lines.push(`time: ${(ms / 1000).toFixed(1)} s wall, ${(genMs / 1000).toFixed(1)} s summed per-slot generation`);
  return lines.join('\n');
}

export async function generateLevels(opts: GenLevelsOptions & { cache?: boolean; log?: (s: string) => void } = {}): Promise<LevelRecord[] | null> {
  const log = opts.log ?? ((s: string) => process.stdout.write(`${s}\n`));
  const t0 = performance.now();
  const shipped = cfg.levels.shipped;
  const slots = buildSchedule(shipped);
  const from = Math.max(2, opts.from ?? 2);
  const to = Math.min(shipped, opts.to ?? shipped);
  const tasks = slots.filter((s) => s.level >= from && s.level <= to).map(slotTask);
  const cachePath = opts.cache === false ? null : `${CONTENT_CACHE_DIR}/levels.jsonl`;
  const raw = await runGenTasks(tasks, { workers: opts.workers ?? 2, cachePath, log, label: 'levels' });
  if (from > 2 || to < shipped) {
    log(`partial run (levels ${from}–${to}): ${raw.size} results cached; packs not written`);
    return null;
  }
  const report: BuildReport = { fallbacks: [], dedupRegenerated: [], warnings: [] };
  const records = sortAndRepair(slots, dedupInOrder(slots, raw, report), report.warnings);
  const outDir = opts.outDir ?? 'src/data';
  const packSize = cfg.levels.packSize;
  const packs: { file: string; first: number; count: number; bytes: Uint8Array }[] = [];
  for (let first = 1; first <= shipped; first += packSize) {
    const levels = records.slice(first - 1, first - 1 + packSize);
    const pack: LevelPack = { v: 1, kind: 'levels', first, count: levels.length, gen: cfg.gen.version, levels };
    const file = `levels/pack-${String((first - 1) / packSize).padStart(3, '0')}.json`;
    writeLevelPack(`${outDir}/${file}`, pack);
    packs.push({ file, first, count: levels.length, bytes: readFileSync(`${outDir}/${file}`) });
  }
  updateManifest(outDir, { packs });
  let genMs = 0;
  for (const r of raw.values()) genMs += r.ms;
  log(summary(records, packs.map((p) => p.bytes.length), report, performance.now() - t0, genMs));
  return records;
}

export async function main(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const from = args.num('--from');
  const to = args.num('--to');
  const outDir = args.str('--out');
  const workers = args.num('--workers');
  await generateLevels({
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
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
