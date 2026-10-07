// Owner: content
// src/game/ramp.ts → one slot per level 2…shipped (02 §11.2 four-step algorithm, 03 §8.2), RNG
// seeded with SEEDS.schedule. `tsx scripts/level-schedule.ts` prints the schedule summary.
import { pathToFileURL } from 'node:url';
import type { GradeBand } from '../src/engine/types';

export interface LevelSlot {
  readonly level: number;
  readonly n: number;
  readonly band: GradeBand;
  readonly hard: boolean;
  /** The level after a Hard level: smaller sizes, lowest grade of the band. */
  readonly breather: boolean;
  /** !hard && !breather && level ≥ 2 (03 §8.2). */
  readonly sortable: boolean;
  /** Index into RAMP. */
  readonly rowIndex: number;
}

/** Slots for levels 1…lastLevel (level 1 = the tutorial slot). Deterministic. */
export function buildSchedule(lastLevel?: number): LevelSlot[] {
  throw new Error('not implemented: buildSchedule');
}

export function main(argv: readonly string[]): void {
  throw new Error('not implemented: level-schedule main');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
