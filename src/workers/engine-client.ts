// Owner: C (Phase 2b; was app)
// Main-thread face of the engine (03 §6, 04 §5.5): async getHint() (main thread while within
// hint.mainThreadBudgetMs, otherwise the worker) and generate() in a lazily created module worker:
//   new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
// Resilience: when the worker cannot start or crashes (old WebViews without module workers, CSP),
// work falls back to the main thread; generate() then loads the generator through a dynamic import
// so it stays out of the main bundle.
// Bundle (04 §9): the hint engine (hint, techniques, grader) and the RPC layer are lazy chunks too.
// Nothing needs them before the first hint, kitty or generated board; preload() warms the hint
// engine up after the first screen (boot step 8).
// Never hangs, never dead-ends (04 §8): lazy chunks are re-fetched with a cache-busting URL after a
// failure (lazy-chunk.ts); when the hint chunk still cannot load, hints and kitty cells come from the
// worker (its own module graph). The worker's start-up and every call have a deadline
// (worker.callTimeoutMs): on expiry the worker is dropped and the work runs on the main thread.
import { cfg, type GameConfig } from '../app/config';
import type { CellIndex, GenResult, GenSpec, HintStep, Puzzle } from '../engine/types';
import type { EngineWorkerApi } from './engine.worker';
import { deadline, loadChunk } from './lazy-chunk';
import type { RpcChannel } from './rpc';

export interface EngineClient {
  generate(spec: GenSpec): Promise<GenResult>;
  /** Rejects when the engine throws (the session shows "Hint unavailable" and charges nothing). */
  getHint(puzzle: Puzzle, cells: Readonly<Uint8Array>): Promise<HintStep>;
  /** pickKittyCell on the main thread (O(N²)); async only because the hint engine is a lazy chunk. */
  pickKittyCell(puzzle: Puzzle, cells: Readonly<Uint8Array>): Promise<CellIndex>;
  /** Starts loading the hint engine chunk (never rejects; boot calls it after the first route). */
  preload(): void;
  dispose(): void;
}

/** The main-thread hint engine (a lazy chunk). */
export type HintEngine = Pick<typeof import('../engine/hint'), 'getHintStep' | 'pickKittyCell'>;

export interface EngineClientOptions {
  /** Test seam: replaces the Worker constructor. Return null to simulate "no Worker support". */
  readonly createWorker?: () => Worker | null;
  /** Force hints through the worker. */
  readonly hintsInWorker?: boolean;
  /** Test seam: main-thread generate (default: dynamic import of engine/generator). */
  readonly generateOnMain?: (spec: GenSpec) => Promise<GenResult>;
  /** Test seam: monotonic ms for the hint budget. */
  readonly perf?: () => number;
  /** Test seam: loads the main-thread hint engine (default: dynamic import of engine/hint). */
  readonly loadHintEngine?: () => Promise<HintEngine>;
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
  const mod = await loadChunk(() => import('../engine/generator'));
  return mod.generate(spec);
}

function defaultLoadHintEngine(): Promise<HintEngine> {
  return loadChunk(() => import('../engine/hint'));
}

export function createEngineClient(opts: EngineClientOptions = {}): EngineClient {
  const c = opts.config ?? cfg;
  const perf = opts.perf ?? defaultPerf;
  const generateOnMain = opts.generateOnMain ?? defaultGenerateOnMain;
  const loadHintEngine = opts.loadHintEngine ?? defaultLoadHintEngine;
  let worker: Worker | null = null;
  let channel: RpcChannel<EngineWorkerApi> | null = null;
  let starting: Promise<RpcChannel<EngineWorkerApi> | null> | null = null;
  let hintEngine: Promise<HintEngine> | null = null;
  /** The worker failed to start or crashed: everything runs on the main thread from now on. */
  let broken = false;
  let disposed = false;
  /** Board sizes whose main-thread hint exceeded the budget (03 §6): later hints go to the worker. */
  const slowSizes = new Set<number>();

  /** The hint engine chunk; a failed load is retried on the next call. */
  function hints(): Promise<HintEngine> {
    hintEngine ??= loadHintEngine().catch((err: unknown) => {
      hintEngine = null;
      throw err;
    });
    return hintEngine;
  }

  function fail(reason: string): void {
    broken = true;
    const ch = channel;
    const w = worker;
    channel = null;
    worker = null;
    starting = null;
    ch?.rejectAll(reason);
    ch?.dispose();
    try {
      w?.terminate();
    } catch {
      // already gone
    }
  }

  /** Lazily creates the worker and its RPC channel (never during boot). null → use the main thread. */
  function ensureWorker(): Promise<RpcChannel<EngineWorkerApi> | null> {
    if (channel) return Promise.resolve(channel);
    if (broken || disposed) return Promise.resolve(null);
    starting ??= (async () => {
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
      w.addEventListener('error', (ev) => {
        ev.preventDefault();
        fail('engine worker error');
      });
      w.addEventListener('messageerror', () => fail('engine worker message error'));
      let rpc: typeof import('./rpc');
      try {
        rpc = await loadChunk(() => import('./rpc'), { config: c });
      } catch {
        fail('rpc chunk unavailable');
        return null;
      }
      if (disposed || broken || worker !== w) return null;
      channel = rpc.createRpcChannel<EngineWorkerApi>(w);
      return channel;
    })();
    return starting;
  }

  /**
   * Runs `onWorker`; when the worker is unavailable, dies mid-call or misses the deadline (it is then
   * dropped for good), runs `onMain` instead.
   */
  async function viaWorker<T>(onWorker: (ch: RpcChannel<EngineWorkerApi>) => Promise<T>, onMain: () => Promise<T>): Promise<T> {
    const ch = await ensureWorker();
    if (!ch) return onMain();
    try {
      return await deadline(onWorker(ch), c.worker.callTimeoutMs, () => fail('engine worker timeout'));
    } catch (err) {
      if (broken) return onMain(); // the worker crashed or hung: not an engine error
      throw err;
    }
  }

  /** `main(hint engine)`; when the hint chunk cannot be loaded, `inWorker` (else the load error). */
  function withHints<T>(main: (engine: HintEngine) => T, inWorker: (ch: RpcChannel<EngineWorkerApi>) => Promise<T>): Promise<T> {
    return hints().then(main, (err: unknown) => viaWorker(inWorker, () => Promise.reject(err)));
  }

  function hintOnMain(puzzle: Puzzle, cells: Readonly<Uint8Array>): Promise<HintStep> {
    return withHints(
      (engine) => {
        const t0 = perf();
        const step = engine.getHintStep(puzzle, cells);
        if (perf() - t0 > c.hint.mainThreadBudgetMs) slowSizes.add(puzzle.n);
        return step;
      },
      (ch) => ch.remote.getHint(puzzle, cells as Uint8Array),
    );
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
      if (!opts.hintsInWorker && !slowSizes.has(puzzle.n)) return hintOnMain(puzzle, snapshot);
      return viaWorker(
        (ch) => ch.remote.getHint(puzzle, snapshot),
        () => hints().then((engine) => engine.getHintStep(puzzle, snapshot)),
      );
    },
    pickKittyCell(puzzle, cells) {
      const snapshot = Uint8Array.from(cells);
      return withHints(
        (engine) => engine.pickKittyCell(puzzle, snapshot),
        (ch) => ch.remote.pickKittyCell(puzzle, snapshot),
      );
    },
    preload() {
      if (!disposed) hints().catch(() => undefined);
    },
    dispose() {
      disposed = true;
      if (channel || worker) fail('engine client disposed');
    },
  };
}
