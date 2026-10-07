// Owner: app
// Engine worker (04 §5.5): generate(spec) for endless levels, missing daily months and substitute
// boards; getHint() when the main-thread budget is exceeded (03 §6). Created lazily, never at boot.
import { generate } from '../engine/generator';
import { getHintStep } from '../engine/hint';
import type { GenResult, GenSpec, HintStep, Puzzle } from '../engine/types';
import { exposeRpc, type MessagePortLike } from './rpc';

export interface EngineWorkerApi {
  generate(spec: GenSpec): GenResult;
  getHint(puzzle: Puzzle, cells: Uint8Array): HintStep;
}

export const engineWorkerApi: EngineWorkerApi = {
  generate: (spec) => generate(spec),
  getHint: (puzzle, cells) => getHintStep(puzzle, cells),
};

// Only when running as a dedicated worker (not when imported by tests).
const scope = globalThis as unknown as { importScripts?: unknown; document?: unknown };
if (typeof scope.importScripts === 'function' && scope.document === undefined) {
  exposeRpc(engineWorkerApi, globalThis as unknown as MessagePortLike);
}
