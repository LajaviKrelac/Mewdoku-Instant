// Owner: app
// Main-thread face of the engine (03 §6, 04 §5.5): async getHint() (main thread while within
// hint.mainThreadBudgetMs, otherwise the worker) and generate() in a lazily created module worker:
//   new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
import type { CellIndex, GenResult, GenSpec, HintStep, Puzzle } from '../engine/types';

export interface EngineClient {
  generate(spec: GenSpec): Promise<GenResult>;
  /** Rejects when the engine throws (the session shows "Hint unavailable" and charges nothing). */
  getHint(puzzle: Puzzle, cells: Readonly<Uint8Array>): Promise<HintStep>;
  /** pickKittyCell on the main thread (O(N²)). */
  pickKittyCell(puzzle: Puzzle, cells: Readonly<Uint8Array>): CellIndex;
  dispose(): void;
}

export interface EngineClientOptions {
  /** Test seam: replaces the Worker constructor. */
  readonly createWorker?: () => Worker;
  /** Force hints through the worker. */
  readonly hintsInWorker?: boolean;
}

export function createEngineClient(opts?: EngineClientOptions): EngineClient {
  throw new Error('not implemented: createEngineClient');
}
