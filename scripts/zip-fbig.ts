// Owner: platform
// dist/fbig → dist-zip/<name>-fbig-<version>-<gitsha>.zip with index.html at the root (04 §10, 05 §5):
// refuses source maps and .gz/.br files, > 500 files or > 1 MB; prints a size table. Uses fflate.
import { pathToFileURL } from 'node:url';

export interface ZipResult {
  readonly file: string;
  readonly bytes: number;
  readonly fileCount: number;
}

export function zipFbig(opts?: { distDir?: string; outDir?: string }): ZipResult {
  throw new Error('not implemented: zipFbig');
}

export function main(argv: readonly string[]): void {
  throw new Error('not implemented: zip-fbig main');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
