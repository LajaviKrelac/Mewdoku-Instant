// Owner: D (Phase 2b; was platform)
// Bundle budget (04 §9, phase2b §11) on dist/<mode>, RAW bytes (FB hosting may not compress, 05 §5.3;
// 1 KB = 1000 bytes, as Vite prints them). Exit 1 when over.
//   First load (what index.html pulls in before the first screen): main JS (entry + modulepreload
//   chunks) ≤ 210 KB, CSS ≤ 53 KB, the first-load font ≤ 25 KB, index.html ≤ 4 KB; total (English)
//   ≤ 280 KB, and ≤ 305 KB with the largest non-English locale chunk added (a player whose locale
//   is not English loads exactly one).
//   Lazy: the engine worker ≤ 25 KB; the core lazy JS ≤ 62 KB (overlays incl. the poses, hint engine,
//   sound recipes, RPC, generator, win flow, ranking, victory, shop UI); the optional lazy JS ≤ 25 KB
//   (the `events` chunk + the FB `fb-social` chunk); each locale chunk ≤ 24 KB. Lazy fonts (latin-ext),
//   event packs, level packs and daily months are listed, not budgeted. FB builds: ≤ 100 files.
// Budget history: integration (2026-10-07): CSS 20 → 36 KB; main JS 140 → 170 KB, worker out of the
// first-load sum. Phase 2 hardening (lead decision, 2026-10-07): main JS 170 → 190 KB, CSS 36 → 40 KB,
// first load 220 → 250 KB; lazy JS 45 → 48 KB because the coach (O8, ≈ 4.6 KB) moved from the main
// bundle into the overlay chunk (the minimal raise plus ≈ 2 KB headroom). See 04 §9.
// Phase 2b (parity-spec §11, 2026-10-08): main JS 190 → 210 KB, CSS 40 → 53 KB, first load 250 →
// 280 KB (+ one locale ≤ 305 KB), core lazy JS 48 → 62 KB; new rows: optional lazy JS (events +
// fb-social) 25 KB, each locale chunk 24 KB; FB files 60 → 100 (platform cap 500). The lead records
// these ceilings in 04 §9 and STATUS at integration.
//
// Usage: tsx scripts/size-check.ts [distDir …] [--json]
//   No dirs → every existing one of dist/web, dist/fbig, dist/release-web and dist/release-fbig. A dir
//   whose name contains "fbig" also gets the FB file-count budget.
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
  /** maxBytes applies to EACH matching file (the row shows the largest), not to their sum. */
  readonly perFile?: boolean;
}

export interface SizeRow {
  readonly label: string;
  /** The sum of the matching files, or for a perFile row the largest one. */
  readonly bytes: number;
  readonly maxBytes: number;
  readonly ok: boolean;
  /** Matching files (perFile rows and listed rows). */
  readonly files?: number;
}

export interface SizeReport {
  readonly rows: readonly SizeRow[];
  readonly fileCount: number;
  readonly ok: boolean;
  /** Present for FB builds (phase2b §11: ≤ 100 files in the zip). */
  readonly maxFiles?: number;
}

const KB = 1000;
const LISTED = Number.POSITIVE_INFINITY;

/** Lazy locale catalogue chunks (scripts/locale-loaders.ts chunkFileName: assets/locale-<id>-<hash>.js). */
export const LOCALE_CHUNK = /^assets\/locale-[A-Za-z-]+-[^/]*\.js$/;

/** In matching order: a file is counted by the first budget it matches. */
export const BUDGETS: readonly SizeBudget[] = [
  { label: 'Main JS', pattern: /^assets\/index-[^/]*\.js$/, maxBytes: 210 * KB, includeHtmlJs: true, firstLoad: true },
  { label: 'CSS', pattern: /^assets\/[^/]*\.css$/, maxBytes: 53 * KB, firstLoad: true },
  // The latin-ext face (tr, pl) is fetched only when such glyphs appear (unicode-range, phase2b §6.6).
  { label: 'Font (lazy)', pattern: /-ext-[^/]*\.woff2$/, maxBytes: LISTED },
  { label: 'Font', pattern: /\.woff2$/, maxBytes: 25 * KB, firstLoad: true },
  { label: 'index.html', pattern: /^index\.html$/, maxBytes: 4 * KB, firstLoad: true },
  { label: 'Worker JS (lazy)', pattern: /^assets\/[^/]*worker[^/]*\.js$/, maxBytes: 25 * KB },
  { label: 'Locale chunk (each)', pattern: LOCALE_CHUNK, maxBytes: 24 * KB, perFile: true },
  { label: 'Lazy JS (optional)', pattern: /^assets\/(?:events|fb-social)-[^/]*\.js$/, maxBytes: 25 * KB },
  { label: 'Lazy JS (core)', pattern: /^assets\/[^/]*\.js$/, maxBytes: 62 * KB },
  { label: 'Event packs', pattern: /^assets\/[a-z][a-z-]*-\d{4}-[^/]*\.json$/, maxBytes: LISTED },
];

/** Everything index.html loads before the first screen, English (the firstLoad rows). */
export const FIRST_LOAD_MAX = 280 * KB;
/** The first load plus the largest non-English locale chunk (phase2b §11). */
export const FIRST_LOAD_LOCALE_MAX = 305 * KB;
export const FB_MAX_FILES = 100;

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
  const rows: SizeRow[] = [];

  let first = 0;
  let largestLocale = 0;
  for (const b of BUDGETS) {
    let bytes = 0;
    let n = 0;
    for (const f of files) {
      const hit = b.pattern.test(f.path) || (b.includeHtmlJs === true && fromHtml.has(f.path) && !counted.has(f.path));
      if (!hit || counted.has(f.path)) continue;
      counted.add(f.path);
      n++;
      bytes = b.perFile ? Math.max(bytes, f.bytes) : bytes + f.bytes;
    }
    if (b.firstLoad) first += bytes;
    if (b.pattern === LOCALE_CHUNK) largestLocale = bytes;
    const listed = b.maxBytes === LISTED || b.perFile;
    rows.push({ label: b.label, bytes, maxBytes: b.maxBytes, ok: bytes <= b.maxBytes, ...(listed ? { files: n } : {}) });
  }
  // The two first-load totals go right after the last first-load row.
  const at = rows.findIndex((r) => r.label === 'index.html') + 1;
  rows.splice(
    at,
    0,
    { label: 'First-load total', bytes: first, maxBytes: FIRST_LOAD_MAX, ok: first <= FIRST_LOAD_MAX },
    {
      label: 'First load + 1 locale',
      bytes: first + largestLocale,
      maxBytes: FIRST_LOAD_LOCALE_MAX,
      ok: first + largestLocale <= FIRST_LOAD_LOCALE_MAX,
    },
  );
  // Source maps are never downloaded by players (and the FB zip refuses them), so they are left out.
  const rest = files.filter((f) => !counted.has(f.path) && !f.path.endsWith('.map'));
  rows.push({ label: 'Lazy (packs, other)', bytes: rest.reduce((s, f) => s + f.bytes, 0), maxBytes: LISTED, ok: true, files: rest.length });

  const fb = opts.fb ?? basename(distDir).includes('fbig');
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
    const count = row.files === undefined ? '' : `  (${row.files} file${row.files === 1 ? '' : 's'})`;
    lines.push(`  ${row.label.padEnd(24)} ${kb(row.bytes).padStart(10)} / ${kb(row.maxBytes).padStart(9)}  ${row.ok ? 'ok' : 'OVER'}${count}`);
  }
  const files = r.maxFiles === undefined ? `${r.fileCount}` : `${r.fileCount} / ${r.maxFiles}`;
  const filesOk = r.maxFiles === undefined || r.fileCount <= r.maxFiles;
  lines.push(`  ${'Files'.padEnd(24)} ${files.padStart(10)}${' '.repeat(14)}${filesOk ? 'ok' : 'OVER'}`);
  lines.push(r.ok ? '  within budget' : '  OVER BUDGET');
  return lines.join('\n');
}

export function main(argv: readonly string[]): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const json = argv.includes('--json');
  const given = argv.filter((a) => !a.startsWith('--'));
  const dirs =
    given.length > 0
      ? given.map((d) => resolve(d))
      : ['dist/web', 'dist/fbig', 'dist/release-web', 'dist/release-fbig'].map((d) => join(root, d)).filter((d) => existsSync(d));
  if (dirs.length === 0) {
    console.error('size-check: no dist/web, dist/fbig, dist/release-web or dist/release-fbig found; run a build first');
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
