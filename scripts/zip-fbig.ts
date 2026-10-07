// Owner: platform
// dist/fbig → dist-zip/<name>-fbig-<version>-<gitsha>.zip with index.html at the root (04 §10, 05 §5):
// refuses source maps and .gz/.br files, > 500 files or > 1 MB; prints a size table. Uses fflate.
//
// Usage: tsx scripts/zip-fbig.ts [--dist dist/fbig] [--out dist-zip]
// The zip is deterministic (sorted entries, fixed timestamps), so the same build gives the same bytes.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zipSync, type Zippable } from 'fflate';
import { FB_MAX_FILES, listFiles } from './size-check';

export interface ZipResult {
  readonly file: string;
  readonly bytes: number;
  readonly fileCount: number;
}

export interface ZipOptions {
  distDir?: string;
  outDir?: string;
  /** Overrides for the file name (defaults: package.json name and version, `git rev-parse --short HEAD`). */
  name?: string;
  version?: string;
  sha?: string;
  /** No table on stdout (tests). */
  quiet?: boolean;
}

/** Platform cap (05 §5.3, *likely*). */
export const MAX_FILES = 500;
/** Our hard ceiling (04 §10); the 04 §9 budget is 500 KB and only warns here. */
export const MAX_BYTES = 1_000_000;
export const BUDGET_ZIP_BYTES = 500_000;
/** Must be at the zip root (05 §5.1). */
export const REQUIRED_ROOT_FILES = ['index.html', 'fbapp-config.json'] as const;

const FORBIDDEN = /\.(map|gz|br)$/i;
/** Already compressed formats are stored, not deflated again. */
const STORED = /\.(woff2?|png|jpe?g|webp|gif|mp3|ogg|zip)$/i;
/** Fixed entry time (local 1980-01-01 is the ZIP epoch; use a later safe date). */
const ENTRY_TIME = new Date(2020, 0, 1, 0, 0, 0);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function gitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'nogit';
  }
}

function pkgInfo(): { name: string; version: string } {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { name?: string; version?: string };
  return { name: (pkg.name ?? 'game').replace(/^@[^/]+\//, ''), version: pkg.version ?? '0.0.0' };
}

export function zipFbig(opts: ZipOptions = {}): ZipResult {
  const distDir = resolve(ROOT, opts.distDir ?? 'dist/fbig');
  const outDir = resolve(ROOT, opts.outDir ?? 'dist-zip');
  if (!existsSync(distDir)) throw new Error(`${relative(ROOT, distDir) || distDir} not found: run "npm run build:fbig" first`);

  const files = listFiles(distDir);
  const problems: string[] = [];
  for (const req of REQUIRED_ROOT_FILES) {
    if (!files.some((f) => f.path === req)) problems.push(`missing ${req} at the bundle root`);
  }
  const forbidden = files.filter((f) => FORBIDDEN.test(f.path)).map((f) => f.path);
  if (forbidden.length > 0) problems.push(`refusing source maps / precompressed files: ${forbidden.join(', ')}`);
  if (files.length > MAX_FILES) problems.push(`${files.length} files, over the platform cap of ${MAX_FILES}`);
  const rawBytes = files.reduce((s, f) => s + f.bytes, 0);
  if (rawBytes > MAX_BYTES) problems.push(`${rawBytes} raw bytes, over ${MAX_BYTES}`);
  if (problems.length > 0) throw new Error(`zip-fbig: ${problems.join('; ')}`);

  const entries: Zippable = {};
  for (const f of files) {
    entries[f.path] = [readFileSync(join(distDir, f.path)), { level: STORED.test(f.path) ? 0 : 9, mtime: ENTRY_TIME }];
  }
  const zip = zipSync(entries);
  if (zip.length > MAX_BYTES) throw new Error(`zip-fbig: the zip is ${zip.length} bytes, over ${MAX_BYTES}`);

  const pkg = pkgInfo();
  const name = `${opts.name ?? pkg.name}-fbig-${opts.version ?? pkg.version}-${opts.sha ?? gitSha()}.zip`;
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, name);
  writeFileSync(file, zip);

  if (!opts.quiet) {
    const kb = (n: number): string => `${(n / 1000).toFixed(1)} KB`;
    console.log(`FB bundle: ${relative(ROOT, file)}`);
    for (const f of files) console.log(`  ${f.path.padEnd(48)} ${kb(f.bytes).padStart(10)}`);
    console.log(`  ${'total (raw)'.padEnd(48)} ${kb(rawBytes).padStart(10)}`);
    console.log(`  ${'zip'.padEnd(48)} ${kb(zip.length).padStart(10)}`);
    console.log(`  files: ${files.length} (budget ${FB_MAX_FILES}, platform cap ${MAX_FILES})`);
    if (files.length > FB_MAX_FILES) console.warn(`  warning: more than ${FB_MAX_FILES} files (04 §9 budget)`);
    if (zip.length > BUDGET_ZIP_BYTES) console.warn(`  warning: zip over the ${kb(BUDGET_ZIP_BYTES)} budget (04 §9)`);
  }
  return { file, bytes: zip.length, fileCount: files.length };
}

function argValue(argv: readonly string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function main(argv: readonly string[]): void {
  try {
    const distDir = argValue(argv, '--dist');
    const outDir = argValue(argv, '--out');
    zipFbig({ ...(distDir ? { distDir } : {}), ...(outDir ? { outDir } : {}) });
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
