// Owner: platform
// Bundle budget (04 §9) on dist/<mode>, RAW bytes (FB hosting may not compress, 05 §5.3; 1 KB = 1000
// bytes, as Vite prints them). Exit 1 when over.
//   First load (what index.html pulls in before the first screen): main JS (entry + modulepreload
//   chunks) ≤ 190 KB, CSS ≤ 40 KB, font ≤ 25 KB, index.html ≤ 4 KB; total ≤ 250 KB.
//   Lazy: the engine worker ≤ 25 KB (created on first generate, never during boot, 04 §5.5) and the
//   lazy JS chunks ≤ 48 KB (overlays incl. the tutorial coach, hint engine, sound recipes, RPC,
//   main-thread generator; preloaded after the first screen, the overlay chunk during boot on a
//   first run). Packs and daily months are listed, not budgeted. FB builds: ≤ 60 files.
// Budget history: integration (2026-10-07): CSS 20 → 36 KB; main JS 140 → 170 KB, worker out of the
// first-load sum. Phase 2 hardening (lead decision, 2026-10-07): main JS 170 → 190 KB, CSS 36 → 40 KB,
// first load 220 → 250 KB; lazy JS 45 → 48 KB because the coach (O8, ≈ 4.6 KB) moved from the main
// bundle into the overlay chunk (the minimal raise plus ≈ 2 KB headroom). See 04 §9.
//
// Usage: tsx scripts/size-check.ts [distDir …] [--json]
//   No dirs → every existing one of dist/web and dist/fbig. A dir whose name starts with "fbig" also
//   gets the FB file-count budget.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface SizeBudget {
  readonly label: string;
  readonly pattern: RegExp;
  readonly maxBytes: number;
  /** Also count .js files referenced by index.html (entry + modulepreload chunks). */
  readonly includeHtmlJs?: boolean;
  /** Downloaded before the first screen: summed into the first-load total. */
  readonly firstLoad?: boolean;
}

export interface SizeReport {
  readonly rows: readonly { label: string; bytes: number; maxBytes: number; ok: boolean }[];
  readonly fileCount: number;
  readonly ok: boolean;
  /** Present for FB builds (04 §9: ≤ 60 files in the zip). */
  readonly maxFiles?: number;
}

const KB = 1000;

/** In matching order: a file is counted by the first budget it matches. */
export const BUDGETS: readonly SizeBudget[] = [
  { label: 'Main JS', pattern: /^assets\/index-[^/]*\.js$/, maxBytes: 190 * KB, includeHtmlJs: true, firstLoad: true },
  { label: 'CSS', pattern: /^assets\/[^/]*\.css$/, maxBytes: 40 * KB, firstLoad: true },
  { label: 'Font', pattern: /\.woff2$/, maxBytes: 25 * KB, firstLoad: true },
  { label: 'index.html', pattern: /^index\.html$/, maxBytes: 4 * KB, firstLoad: true },
  { label: 'Worker JS (lazy)', pattern: /^assets\/[^/]*worker[^/]*\.js$/, maxBytes: 25 * KB },
  { label: 'Lazy JS chunks', pattern: /^assets\/[^/]*\.js$/, maxBytes: 48 * KB },
];

/** Everything index.html loads before the first screen (the firstLoad rows) (04 §9). */
export const FIRST_LOAD_MAX = 250 * KB;
export const FB_MAX_FILES = 60;

interface FileEntry {
  readonly path: string; // posix, relative to the dist dir
  readonly bytes: number;
}

/** Every file under `dir`, with posix paths relative to it, sorted. */
export function listFiles(dir: string): FileEntry[] {
  const out: FileEntry[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else out.push({ path: relative(dir, full).split(sep).join('/'), bytes: st.size });
    }
  };
  walk(dir);
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Local .js files that index.html loads (module entry and modulepreload links). */
function htmlScripts(html: string): Set<string> {
  const refs = new Set<string>();
  const re = /\b(?:src|href)\s*=\s*["']([^"']+\.js)["']/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const ref = m[1] ?? '';
    if (/^[a-z]+:\/\//i.test(ref) || ref.startsWith('//')) continue; // the FB SDK tag is not ours
    refs.add(ref.replace(/^\.?\//, ''));
  }
  return refs;
}

export function checkSizes(distDir: string, opts: { fb?: boolean } = {}): SizeReport {
  if (!existsSync(distDir)) throw new Error(`${distDir} does not exist: build it first`);
  const files = listFiles(distDir);
  const htmlPath = join(distDir, 'index.html');
  const fromHtml = existsSync(htmlPath) ? htmlScripts(readFileSync(htmlPath, 'utf8')) : new Set<string>();
  const counted = new Set<string>();
  const rows: { label: string; bytes: number; maxBytes: number; ok: boolean }[] = [];

  let first = 0;
  for (const b of BUDGETS) {
    let bytes = 0;
    for (const f of files) {
      const hit = b.pattern.test(f.path) || (b.includeHtmlJs === true && fromHtml.has(f.path) && !counted.has(f.path));
      if (!hit || counted.has(f.path)) continue;
      counted.add(f.path);
      bytes += f.bytes;
    }
    if (b.firstLoad) first += bytes;
    rows.push({ label: b.label, bytes, maxBytes: b.maxBytes, ok: bytes <= b.maxBytes });
  }
  const firstRow = { label: 'First-load total', bytes: first, maxBytes: FIRST_LOAD_MAX, ok: first <= FIRST_LOAD_MAX };
  rows.splice(BUDGETS.filter((b) => b.firstLoad).length, 0, firstRow);
  // Source maps are never downloaded by players (and the FB zip refuses them), so they are left out.
  const lazy = files.filter((f) => !counted.has(f.path) && !f.path.endsWith('.map')).reduce((s, f) => s + f.bytes, 0);
  rows.push({ label: 'Lazy (packs, other)', bytes: lazy, maxBytes: Number.POSITIVE_INFINITY, ok: true });

  const fb = opts.fb ?? basename(distDir).startsWith('fbig');
  const filesOk = !fb || files.length <= FB_MAX_FILES;
  return {
    rows,
    fileCount: files.length,
    ok: filesOk && rows.every((r) => r.ok),
    ...(fb ? { maxFiles: FB_MAX_FILES } : {}),
  };
}

export function formatReport(dir: string, r: SizeReport): string {
  const kb = (n: number): string => (Number.isFinite(n) ? `${(n / KB).toFixed(1)} KB` : '—');
  const lines = [`Bundle sizes: ${dir}`];
  for (const row of r.rows) {
    lines.push(`  ${row.label.padEnd(22)} ${kb(row.bytes).padStart(10)} / ${kb(row.maxBytes).padStart(9)}  ${row.ok ? 'ok' : 'OVER'}`);
  }
  const files = r.maxFiles === undefined ? `${r.fileCount}` : `${r.fileCount} / ${r.maxFiles}`;
  const filesOk = r.maxFiles === undefined || r.fileCount <= r.maxFiles;
  lines.push(`  ${'Files'.padEnd(22)} ${files.padStart(10)}${' '.repeat(14)}${filesOk ? 'ok' : 'OVER'}`);
  lines.push(r.ok ? '  within budget' : '  OVER BUDGET');
  return lines.join('\n');
}

export function main(argv: readonly string[]): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const json = argv.includes('--json');
  const given = argv.filter((a) => !a.startsWith('--'));
  const dirs = given.length > 0 ? given.map((d) => resolve(d)) : ['dist/web', 'dist/fbig'].map((d) => join(root, d)).filter((d) => existsSync(d));
  if (dirs.length === 0) {
    console.error('size-check: no dist/web or dist/fbig found; run a build first');
    process.exitCode = 1;
    return;
  }
  let ok = true;
  const all: Record<string, SizeReport> = {};
  for (const dir of dirs) {
    try {
      const r = checkSizes(dir);
      all[relative(root, dir) || dir] = r;
      ok &&= r.ok;
      if (!json) console.log(formatReport(relative(root, dir) || dir, r));
    } catch (err) {
      ok = false;
      console.error(`size-check: ${(err as Error).message}`);
    }
  }
  if (json) console.log(JSON.stringify(all, (_k, v: unknown) => (v === Number.POSITIVE_INFINITY ? null : v), 2));
  if (!ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
