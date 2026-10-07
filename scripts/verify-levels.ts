// Owner: content
// CI re-verification of every shipped record (03 §11.2): structure, uniqueness, grade reproducible
// and tight, band, shape filters, no duplicates, contiguous numbering, hard/breather schedule,
// manifest SHA-256. Exit code 1 on any failure.
import { pathToFileURL } from 'node:url';

export interface VerifyIssue {
  readonly file: string;
  readonly key: string; // level number or date
  readonly message: string;
}

export function verifyAll(dataDir?: string): VerifyIssue[] {
  throw new Error('not implemented: verifyAll');
}

export function main(argv: readonly string[]): void {
  throw new Error('not implemented: verify-levels main');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
