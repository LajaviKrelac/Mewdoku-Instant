// Owner: content
// src/game/ramp.ts → one slot per level 2…shipped (02 §11.2 four-step algorithm, 03 §8.2), RNG
// seeded with SEEDS.schedule. `tsx scripts/level-schedule.ts` prints the schedule summary.
import { pathToFileURL } from 'node:url';
import { cfg, type GameConfig } from '../src/app/config';
import { makeRng } from '../src/engine/rng';
import type { GradeBand, SizeWeight } from '../src/engine/types';
import {
  bandFor,
  breatherBand,
  breatherPool,
  isHardLevel,
  pickWeighted,
  RAMP,
  rampRowFor,
  SEEDS,
} from '../src/game/ramp';

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
  /**
   * The size pool after steps 1–2 (row pool, or the breather pool), before the no-three-in-a-row
   * removal. Every record placed on this slot, also after the effort sort, has its n in this pool.
   */
  readonly pool: readonly SizeWeight[];
}

/** Level 1: the hand-made tutorial board (02 §11.5), 4×4, G1. */
function tutorialSlot(): LevelSlot {
  const row = RAMP[0];
  if (!row) throw new Error('RAMP is empty');
  return { level: 1, n: 4, band: row.normal, hard: false, breather: false, sortable: false, rowIndex: 0, pool: row.sizes };
}

/** Slots for levels 1…lastLevel (level 1 = the tutorial slot). Deterministic. */
export function buildSchedule(lastLevel: number = cfg.levels.shipped, c: GameConfig = cfg): LevelSlot[] {
  if (!Number.isInteger(lastLevel) || lastLevel < 1) throw new RangeError(`buildSchedule: bad lastLevel ${lastLevel}`);
  const rng = makeRng(SEEDS.schedule);
  const slots: LevelSlot[] = [tutorialSlot()];
  for (let level = 2; level <= lastLevel; level++) {
    // Step 1: the row's pool and band (hard column on Hard levels).
    const row = rampRowFor(level);
    const rowIndex = RAMP.indexOf(row);
    const hard = isHardLevel(level, c);
    let band = bandFor(row, hard);
    // Step 2: breather after a Hard level.
    const breather = !hard && isHardLevel(level - 1, c);
    const pool: SizeWeight[] = breather ? breatherPool(row.sizes) : [...row.sizes];
    if (breather) band = breatherBand(band);
    // Step 3: no three in a row, when the pool has another size.
    let pick = pool;
    const a = slots[level - 3];
    const b = slots[level - 2];
    if (a && b && a.n === b.n && pool.some(([n]) => n !== b.n)) pick = pool.filter(([n]) => n !== b.n);
    // Step 4: weighted pick, rng.int(sum of weights).
    const n = pickWeighted(pick, (total) => rng.int(total));
    slots.push({ level, n, band, hard, breather, sortable: !hard && !breather, rowIndex, pool });
  }
  return slots;
}

/** Levels L (≥ 3) where L−2, L−1 and L share n, given n per level (index 0 = level 1). */
export function tripleRuns(ns: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 2; i < ns.length; i++) if (ns[i] === ns[i - 1] && ns[i] === ns[i - 2]) out.push(i + 1);
  return out;
}

export interface RowSummary {
  readonly rowIndex: number;
  readonly from: number;
  readonly to: number;
  readonly sizes: Record<number, number>;
  readonly hard: number;
  readonly breathers: number;
  readonly sortable: number;
}

export function summarize(slots: readonly LevelSlot[]): RowSummary[] {
  return RAMP.map((row, rowIndex) => {
    const inRow = slots.filter((s) => s.rowIndex === rowIndex);
    const sizes: Record<number, number> = {};
    for (const s of inRow) sizes[s.n] = (sizes[s.n] ?? 0) + 1;
    return {
      rowIndex,
      from: row.from,
      to: row.to,
      sizes,
      hard: inRow.filter((s) => s.hard).length,
      breathers: inRow.filter((s) => s.breather).length,
      sortable: inRow.filter((s) => s.sortable).length,
    };
  }).filter((r) => r.hard + r.breathers + r.sortable > 0 || r.rowIndex === 0);
}

export function main(argv: readonly string[]): void {
  const lastArg = argv.indexOf('--last');
  const last = lastArg >= 0 ? Number(argv[lastArg + 1]) : cfg.levels.shipped;
  const slots = buildSchedule(last);
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(slots.map(({ pool: _pool, ...s }) => s))}\n`);
    return;
  }
  const lines = ['levels      sizes (count per n)                      hard  breather  sortable'];
  for (const r of summarize(slots)) {
    const sizes = Object.entries(r.sizes)
      .map(([n, k]) => `${n}×${n}: ${k}`)
      .join(', ');
    lines.push(`${`${r.from}–${r.to}`.padEnd(11)} ${sizes.padEnd(40)} ${String(r.hard).padStart(4)}  ${String(r.breathers).padStart(8)}  ${String(r.sortable).padStart(8)}`);
  }
  const triples = tripleRuns(slots.map((s) => s.n));
  lines.push(`slots: ${slots.length}; three-in-a-row: ${triples.length === 0 ? 'none' : triples.join(', ')}`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
