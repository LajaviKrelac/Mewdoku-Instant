// Owner: app
// Main-thread face of the engine (03 §6, 04 §5.5): async getHint() (main thread while within
// hint.mainThreadBudgetMs, otherwise the worker) and generate() in a lazily created module worker:
//   new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
// Resilience: when the worker cannot start or crashes (old WebViews without module workers, CSP),
// work falls back to the main thread; generate() then loads the generator through a dynamic import
// so it stays out of the main bundle.
import { cfg, type GameConfig } from '../app/config';
import { getHintStep, pickKittyCell } from '../engine/hint';
import type { CellIndex, GenResult, GenSpec, HintStep, Puzzle } from '../engine/types';
import type { EngineWorkerApi } from './engine.worker';
import { createRpcChannel, type RpcChannel } from './rpc';

export interface EngineClient {
  generate(spec: GenSpec): Promise<GenResult>;
  /** Rejects when the engine throws (the session shows "Hint unavailable" and charges nothing). */
  getHint(puzzle: Puzzle, cells: Readonly<Uint8Array>): Promise<HintStep>;
  /** pickKittyCell on the main thread (O(N²)). */
  pickKittyCell(puzzle: Puzzle, cells: Readonly<Uint8Array>): CellIndex;
  dispose(): void;
}

export interface EngineClientOptions {
  /** Test seam: replaces the Worker constructor. Return null to simulate "no Worker support". */
  readonly createWorker?: () => Worker | null;
  /** Force hints through the worker. */
  readonly hintsInWorker?: boolean;
  /** Test seam: main-thread generate (default: dynamic import of engine/generator). */
  readonly generateOnMain?: (spec: GenSpec) => Promise<GenResult>;
  /** Test seam: monotonic ms for the hint budget. */
  readonly perf?: () => number;
  readonly config?: GameConfig;
}

function defaultCreateWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
}

function defaultPerf(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

async function defaultGenerateOnMain(spec: GenSpec): Promise<GenResult> {
  const mod = await import('../engine/generator');
  return mod.generate(spec);
}

export function createEngineClient(opts: EngineClientOptions = {}): EngineClient {
  const c = opts.config ?? cfg;
  const perf = opts.perf ?? defaultPerf;
  const generateOnMain = opts.generateOnMain ?? defaultGenerateOnMain;
  let worker: Worker | null = null;
  let channel: RpcChannel<EngineWorkerApi> | null = null;
  /** The worker failed to start or crashed: everything runs on the main thread from now on. */
  let broken = false;
  let disposed = false;
  /** Board sizes whose main-thread hint exceeded the budget (03 §6): later hints go to the worker. */
  const slowSizes = new Set<number>();

  function fail(reason: string): void {
    broken = true;
    const ch = channel;
    const w = worker;
    channel = null;
    worker = null;
    ch?.rejectAll(reason);
    ch?.dispose();
    try {
      w?.terminate();
    } catch {
      // already gone
    }
  }

  /** Lazily creates the worker (never during boot). null → use the main thread. */
  function ensureWorker(): RpcChannel<EngineWorkerApi> | null {
    if (channel) return channel;
    if (broken || disposed) return null;
    let w: Worker | null;
    try {
      w = (opts.createWorker ?? defaultCreateWorker)();
    } catch {
      w = null;
    }
    if (!w) {
      broken = true;
      return null;
    }
    worker = w;
    channel = createRpcChannel<EngineWorkerApi>(w);
    w.addEventListener('error', (ev) => {
      ev.preventDefault();
      fail('engine worker error');
    });
    w.addEventListener('messageerror', () => fail('engine worker message error'));
    return channel;
  }

  /** Runs `onWorker`; when the worker is unavailable or dies mid-call, runs `onMain` instead. */
  async function viaWorker<T>(onWorker: (ch: RpcChannel<EngineWorkerApi>) => Promise<T>, onMain: () => Promise<T>): Promise<T> {
    const ch = ensureWorker();
    if (!ch) return onMain();
    try {
      return await onWorker(ch);
    } catch (err) {
      if (broken) return onMain(); // the worker crashed: not an engine error
      throw err;
    }
  }

  function hintOnMain(puzzle: Puzzle, cells: Readonly<Uint8Array>): HintStep {
    const t0 = perf();
    const step = getHintStep(puzzle, cells);
    if (perf() - t0 > c.hint.mainThreadBudgetMs) slowSizes.add(puzzle.n);
    return step;
  }

  return {
    generate(spec) {
      if (disposed) return Promise.reject(new Error('engine client disposed'));
      return viaWorker(
        (ch) => ch.remote.generate(spec),
        () => generateOnMain(spec),
      );
    },
    getHint(puzzle, cells) {
      if (disposed) return Promise.reject(new Error('engine client disposed'));
      const snapshot = Uint8Array.from(cells);
      if (!opts.hintsInWorker && !slowSizes.has(puzzle.n)) {
        try {
          return Promise.resolve(hintOnMain(puzzle, snapshot));
        } catch (err) {
          return Promise.reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
      return viaWorker(
        (ch) => ch.remote.getHint(puzzle, snapshot),
        () => Promise.resolve().then(() => getHintStep(puzzle, snapshot)),
      );
    },
    pickKittyCell(puzzle, cells) {
      return pickKittyCell(puzzle, cells);
    },
    dispose() {
      disposed = true;
      if (channel || worker) fail('engine client disposed');
    },
  };
}
