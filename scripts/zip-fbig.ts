// Owner: D (Phase 2b; was platform)
// An FBIG build → dist-zip/<name>-fbig[-preview]-<version>-<gitsha>.zip with index.html at the root
// (04 §10, 05 §5); prints a size table. Uses fflate.
//
// Phase 2b rules (parity-spec §6.7, §11):
//   - The PRODUCTION zip comes from the release-mode build, dist/release-fbig (`npm run
//     build:release`), which bundles only cfg.i18n.releaseLocales. That is the default, and in
//     release mode the zip is refused when the build holds a locale chunk outside releaseLocales.
//   - `--preview` zips a dev or preview build instead (default dist/fbig, all 17 locales), for
//     testing on FB; its file name says "preview" so it cannot be mistaken for a release.
//   - Always refused: a missing index.html or fbapp-config.json at the root, source maps and
//     .gz/.br files, the e2e test hooks (a dist/fbig-e2e build), more than 500 files (platform cap,
//     05 §5.3) and a zip over 1 MB (ours). Warned: more than 100 files or a zip over 750 KB
//     (the §11 budget).
//
// Usage: tsx scripts/zip-fbig.ts [--preview] [--dist <dir>] [--out dist-zip]
// The zip is deterministic (sorted entries, fixed timestamps), so the same build gives the same bytes.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zipSync, type Zippable } from 'fflate';
import { cfg } from '../src/app/config';
import { FB_MAX_FILES, listFiles, LOCALE_CHUNK } from './size-check';

export interface ZipResult {
  readonly file: string;
  readonly bytes: number;
  readonly fileCount: number;
}

export interface ZipOptions {
  /** Default: dist/release-fbig (release) or dist/fbig (preview). */
  distDir?: string;
  outDir?: string;
  /** false (`--preview`): a dev or preview build, any locales. Default true: the production zip. */
  release?: boolean;
  /** The locales a release zip may carry (default cfg.i18n.releaseLocales). */
  releaseLocales?: readonly string[];
  /** Overrides for the file name (defaults: package.json name and version, `git rev-parse --short HEAD`). */
  name?: string;
  version?: string;
  sha?: string;
  /** No table on stdout (tests). */
  quiet?: boolean;
}

/** Platform cap (05 §5.3, *likely*). */
export const MAX_FILES = 500;
/** Our hard ceiling on the zip (04 §10; phase2b: on the zip's bytes, not the raw total). */
export const MAX_BYTES = 1_000_000;
/** The phase2b §11 zip budget (warns). */
export const BUDGET_ZIP_BYTES = 750_000;
/** A string only the e2e test hooks put into a build (src/app/boot.ts, window.__mewdoku). */
const E2E_MARKER = '__mewdoku';
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

/** Locale ids of the locale chunks in a build (assets/locale-<id>-<hash>.js). */
export function localeChunkIds(paths: readonly string[]): string[] {
  const ids = new Set<string>();
  for (const p of paths) {
    if (!LOCALE_CHUNK.test(p)) continue;
    const m = /^assets\/locale-(.+)-[^-]+\.js$/.exec(p);
    if (m) ids.add(m[1] as string);
  }
  return Array.from(ids).sort();
}

export function zipFbig(opts: ZipOptions = {}): ZipResult {
  const release = opts.release ?? true;
  const distDir = resolve(ROOT, opts.distDir ?? (release ? 'dist/release-fbig' : 'dist/fbig'));
  const outDir = resolve(ROOT, opts.outDir ?? 'dist-zip');
  if (!existsSync(distDir)) {
    const how = release ? 'npm run build:release' : 'npm run build:fbig';
    throw new Error(`${relative(ROOT, distDir) || distDir} not found: run "${how}" first`);
  }

  const files = listFiles(distDir);
  const problems: string[] = [];
  for (const req of REQUIRED_ROOT_FILES) {
    if (!files.some((f) => f.path === req)) problems.push(`missing ${req} at the bundle root`);
  }
  const forbidden = files.filter((f) => FORBIDDEN.test(f.path)).map((f) => f.path);
  if (forbidden.length > 0) problems.push(`refusing source maps / precompressed files: ${forbidden.join(', ')}`);
  if (files.length > MAX_FILES) problems.push(`${files.length} files, over the platform cap of ${MAX_FILES}`);
  const hooks = files.filter((f) => f.path.endsWith('.js') && readFileSync(join(distDir, f.path), 'utf8').includes(E2E_MARKER));
  if (hooks.length > 0) problems.push(`refusing a build with the e2e test hooks (${hooks.map((f) => f.path).join(', ')}): zip a release or preview build`);
  if (release) {
    const allowed = new Set(opts.releaseLocales ?? cfg.i18n.releaseLocales);
    const stray = localeChunkIds(files.map((f) => f.path)).filter((id) => !allowed.has(id));
    if (stray.length > 0) {
      problems.push(
        `release zip with locales outside i18n.releaseLocales (${stray.join(', ')}): zip dist/release-fbig (npm run build:release), or pass --preview`,
      );
    }
  }
  const rawBytes = files.reduce((s, f) => s + f.bytes, 0);
  if (problems.length > 0) throw new Error(`zip-fbig: ${problems.join('; ')}`);

  const entries: Zippable = {};
  for (const f of files) {
    entries[f.path] = [readFileSync(join(distDir, f.path)), { level: STORED.test(f.path) ? 0 : 9, mtime: ENTRY_TIME }];
  }
  const zip = zipSync(entries);
  if (zip.length > MAX_BYTES) throw new Error(`zip-fbig: the zip is ${zip.length} bytes, over ${MAX_BYTES}`);

  const pkg = pkgInfo();
  const kind = release ? 'fbig' : 'fbig-preview';
  const name = `${opts.name ?? pkg.name}-${kind}-${opts.version ?? pkg.version}-${opts.sha ?? gitSha()}.zip`;
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
    console.log(`  ${release ? 'release zip' : 'PREVIEW zip (not for production)'}; locales: en${localeChunkIds(files.map((f) => f.path)).map((id) => `, ${id}`).join('')}`);
    if (files.length > FB_MAX_FILES) console.warn(`  warning: more than ${FB_MAX_FILES} files (phase2b §11 budget)`);
    if (zip.length > BUDGET_ZIP_BYTES) console.warn(`  warning: zip over the ${kb(BUDGET_ZIP_BYTES)} budget (phase2b §11)`);
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
    zipFbig({ release: !argv.includes('--preview'), ...(distDir ? { distDir } : {}), ...(outDir ? { outDir } : {}) });
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
