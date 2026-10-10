// Owner: C (Phase 2b; was app)
// Engine worker (04 §5.5): generate(spec) for endless levels, missing daily months and substitute
// boards; getHint() when the main-thread budget is exceeded (03 §6). Created lazily, never at boot.
// getHint() and pickKittyCell() also answer when the main thread cannot load its hint chunk (04 §8).
// Phase 2d.1 (G1, helpers-spec §2.3): both come from ./hint-chunk (the kitty's fewest-candidates rule).
import { generate } from '../engine/generator';
import type { CellIndex, GenResult, GenSpec, HintStep, Puzzle } from '../engine/types';
import { getHintStep, pickKittyCell } from './hint-chunk';
import { exposeRpc, type MessagePortLike } from './rpc';

export interface EngineWorkerApi {
  generate(spec: GenSpec): GenResult;
  getHint(puzzle: Puzzle, cells: Uint8Array): HintStep;
  pickKittyCell(puzzle: Puzzle, cells: Uint8Array): CellIndex;
}

export const engineWorkerApi: EngineWorkerApi = {
  generate: (spec) => generate(spec),
  getHint: (puzzle, cells) => getHintStep(puzzle, cells),
  pickKittyCell: (puzzle, cells) => pickKittyCell(puzzle, cells),
};

// Only when running as a dedicated worker (not when imported by tests).
const scope = globalThis as unknown as { importScripts?: unknown; document?: unknown };
if (typeof scope.importScripts === 'function' && scope.document === undefined) {
  exposeRpc(engineWorkerApi, globalThis as unknown as MessagePortLike);
}
