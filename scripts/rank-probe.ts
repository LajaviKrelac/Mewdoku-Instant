// Owner: lead (Phase 2e; docs/phase2e/spec.md §8.2 step 4, §11.6; gates G-SRV-1 and G-SRV-2). Builds the ranking
// probe (dev/rank-probe/: a standalone Instant Game page, SDK 8.0) against a ranking server and zips it for a PRIVATE
// FB test build: dist-zip/mewdoku-rank-probe-<sha>.zip (index.html and fbapp-config.json at the root, no source maps).
//   npm run probe -- --url https://mewdoku-rank-staging.<account>.workers.dev      build + zip (https only)
//   npm run probe -- --url http://127.0.0.1:8787 --no-zip                          a local build to try with the stub
// The URL may also come from PROBE_URL. It must be an http(s) API base (scripts/ladder-env.ts rules); the zip needs
// https (an FB page cannot call plain http). The probe is never a release: it carries no game, only the six checks.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zipSync, type Zippable } from 'fflate';
import { ladderUrl } from './ladder-env.ts';
import { testDataProblems } from './release-check.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PROBE_DIR = join(ROOT, 'dev/rank-probe');
export const PROBE_OUT = join(ROOT, 'dist/rank-probe');
/** Bumped when the probe's steps or wording change (shown in its header line). */
export const PROBE_VERSION = 'p1';
const ENTRY_TIME = new Date(2020, 0, 1, 0, 0, 0);

export interface ProbeOptions {
  readonly url: string;
  readonly zip?: boolean;
  readonly outDir?: string;
  readonly sha?: string;
  readonly quiet?: boolean;
}

/** The checked API base, or an error message. */
export function probeUrl(raw: string | undefined, zip: boolean): { url: string } | { error: string } {
  const url = ladderUrl(raw);
  if (url === undefined) return { error: 'no server: pass --url <ranking API base> (or PROBE_URL)' };
  if (url === null) return { error: `${JSON.stringify(raw)} is not an http(s) API base (no credentials, query or fragment)` };
  if (zip && !url.startsWith('https://')) return { error: `${url}: a zip for FB needs an https server (use --no-zip for a local try)` };
  return { url };
}

function gitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'nogit';
  }
}

function files(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const n of readdirSync(d)) {
      const f = join(d, n);
      if (statSync(f).isDirectory()) walk(f);
      else out.push(relative(dir, f).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/** Zips a built probe dir deterministically; refuses a dir without index.html / fbapp-config.json or with maps. */
export function zipProbe(distDir: string, outDir: string, sha: string): string {
  const list = files(distDir);
  for (const req of ['index.html', 'fbapp-config.json']) if (!list.includes(req)) throw new Error(`rank-probe: ${req} missing at the root of ${distDir}`);
  const maps = list.filter((f) => /\.(map|gz|br)$/i.test(f));
  if (maps.length) throw new Error(`rank-probe: refusing source maps / precompressed files: ${maps.join(', ')}`);
  const texts = list.filter((f) => /\.(js|html|json|css)$/i.test(f)).map((f) => ({ path: f, text: readFileSync(join(distDir, f), 'utf8') }));
  const problems = testDataProblems(texts);
  if (problems.length) throw new Error(`rank-probe: ${problems.join('; ')}`);
  const entries: Zippable = {};
  for (const f of list) entries[f] = [readFileSync(join(distDir, f)), { level: 9, mtime: ENTRY_TIME }];
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `mewdoku-rank-probe-${sha}.zip`);
  writeFileSync(file, zipSync(entries));
  return file;
}

export async function buildProbe(o: ProbeOptions): Promise<{ distDir: string; zip: string | null }> {
  const zip = o.zip ?? true;
  const checked = probeUrl(o.url, zip);
  if ('error' in checked) throw new Error(`rank-probe: ${checked.error}`);
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
  const manifest = JSON.parse(readFileSync(join(ROOT, 'src/data/levels/manifest.json'), 'utf8')) as { version: string };
  const { build } = await import('vite');
  await build({
    configFile: false,
    root: PROBE_DIR,
    base: './',
    logLevel: o.quiet ? 'silent' : 'warn',
    define: {
      __PROBE_URL__: JSON.stringify(checked.url),
      __PROBE_VERSION__: JSON.stringify(PROBE_VERSION),
      __PROBE_CLIENT_VERSION__: JSON.stringify(pkg.version),
      __PROBE_CONTENT_VERSION__: JSON.stringify(manifest.version),
    },
    build: { outDir: PROBE_OUT, emptyOutDir: true, target: 'es2020', sourcemap: false, modulePreload: { polyfill: false }, assetsInlineLimit: 0 },
  });
  copyFileSync(join(ROOT, 'platform-assets/fbig/fbapp-config.json'), join(PROBE_OUT, 'fbapp-config.json'));
  const file = zip ? zipProbe(PROBE_OUT, resolve(ROOT, o.outDir ?? 'dist-zip'), o.sha ?? gitSha()) : null;
  if (!o.quiet) {
    console.log(`rank-probe: built ${relative(ROOT, PROBE_OUT)} against ${checked.url}`);
    if (file) console.log(`rank-probe: ${relative(ROOT, file)} — upload it as a PRIVATE build (docs/phase2e/STATUS-2e.md, "The probe")`);
  }
  return { distDir: PROBE_OUT, zip: file };
}

export async function main(argv: readonly string[]): Promise<number> {
  const i = argv.indexOf('--url');
  const raw = i >= 0 ? argv[i + 1] : process.env.PROBE_URL;
  try {
    await buildProbe({ url: raw ?? '', zip: !argv.includes('--no-zip') });
    return 0;
  } catch (err) {
    console.error((err as Error).message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}

