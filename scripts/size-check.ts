// Owner: platform
// Bundle budget (04 §9) on dist/<mode>: main JS ≤ 140 KB, worker ≤ 25 KB, CSS ≤ 20 KB, font ≤ 25 KB,
// index.html ≤ 4 KB, first-load ≤ 220 KB (raw bytes), FB: ≤ 60 files. Exit 1 when over.
import { pathToFileURL } from 'node:url';

export interface SizeBudget {
  readonly label: string;
  readonly pattern: RegExp;
  readonly maxBytes: number;
}

export interface SizeReport {
  readonly rows: readonly { label: string; bytes: number; maxBytes: number; ok: boolean }[];
  readonly fileCount: number;
  readonly ok: boolean;
}

export const BUDGETS: readonly SizeBudget[] = [];

export function checkSizes(distDir: string): SizeReport {
  throw new Error('not implemented: checkSizes');
}

export function main(argv: readonly string[]): void {
  throw new Error('not implemented: size-check main');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
