// Owner: content
// Generation task runner shared by gen-levels.ts and gen-daily.ts (03 §8.3): a worker_threads pool
// (one task = specs tried in order, the first accepted puzzle wins) and a resumable JSONL cache
// (node_modules/.cache/mewdoku-content/), so an interrupted run resumes where it stopped. Moved out of
// gen-levels.ts (lead decision, Phase 2 integration); the generated packs are byte-identical.
// The pool's workers load THIS module (not gen-levels.ts), so they only pull in the engine.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { cfg } from '../src/app/config';
import { generate } from '../src/engine/generator';
import type { GenSpec, LevelRecord } from '../src/engine/types';

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
 * resolution (extensionless imports), so the worker registers tsx first and then imports us. null when
 * this module was loaded as CommonJS (no import.meta.resolve): the caller then runs in-thread.
 */
function workerBoot(): string | null {
  const resolve = (import.meta as { resolve?: (specifier: string) => string }).resolve;
  if (typeof resolve !== 'function') return null;
  return `import(${JSON.stringify(resolve('tsx/esm/api'))}).then((m) => { m.register(); return import(${JSON.stringify(import.meta.url)}); });`;
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
  const boot = opts.workers > 1 && pending.length > 1 ? workerBoot() : null;
  if (opts.workers > 1 && pending.length > 1 && boot === null) opts.log(`${opts.label}: worker threads unavailable here; generating in-thread`);
  if (boot === null) {
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
        const w = new Worker(boot, { eval: true, workerData: { mewdokuGenWorker: true } });
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
