// Owner: content
// Generates src/data/levels/pack-000…009.json + manifest.json (03 §8.3): per-slot generation with
// SEEDS.level(L), shape filters, grade band, dedup across all packs; then the per-row effort sort
// with SEEDS.sort noise and the no-three-in-a-row repair. Parallelisable with worker_threads.
import { pathToFileURL } from 'node:url';
import type { LevelRecord } from '../src/engine/types';
import type { LevelSlot } from './level-schedule';

export interface GenLevelsOptions {
  readonly from?: number;
  readonly to?: number;
  readonly outDir?: string;
  readonly workers?: number;
}

/** One accepted record for a slot (no `i` yet), or throws after cfg.gen.maxAttempts with a report. */
export function generateSlot(slot: LevelSlot, seen: Set<string>): LevelRecord {
  throw new Error('not implemented: generateSlot');
}

/** 03 §8.3 sort and repair; sets rec.i = slot level for every record. */
export function sortAndRepair(slots: readonly LevelSlot[], records: readonly LevelRecord[]): LevelRecord[] {
  throw new Error('not implemented: sortAndRepair');
}

export async function main(argv: readonly string[]): Promise<void> {
  throw new Error('not implemented: gen-levels main');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main(process.argv.slice(2));
