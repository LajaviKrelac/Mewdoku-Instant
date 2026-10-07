// Owner: content
// Generates src/data/daily/YYYY-MM.json for a month range (03 §8.6): weekday size/band (02 §12),
// seed SEEDS.daily(date), dedup shared with the level packs. Usage: --from 2026-10 --to 2028-12.
import { pathToFileURL } from 'node:url';
import type { DailyPack, LevelRecord } from '../src/engine/types';

/** YYYY-MM months from `from` to `to`, inclusive. */
export function monthRange(from: string, to: string): string[] {
  throw new Error('not implemented: monthRange');
}

/** One record for a date (no `i`). */
export function generateDaily(dateKey: string, seen: Set<string>): LevelRecord {
  throw new Error('not implemented: generateDaily');
}

export function generateMonth(month: string, seen: Set<string>): DailyPack {
  throw new Error('not implemented: generateMonth');
}

export async function main(argv: readonly string[]): Promise<void> {
  throw new Error('not implemented: gen-daily main');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main(process.argv.slice(2));
