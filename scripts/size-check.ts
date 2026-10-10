// Owner: D (Phase 2b; was platform)
// Bundle budget (04 §9, phase2b §11) on dist/<mode>, RAW bytes (FB hosting may not compress, 05 §5.3;
// 1 KB = 1000 bytes, as Vite prints them), plus the first load's gzip size (what a compressing CDN
// or the FB CDN sends). Exit 1 when over.
//   First load (what index.html pulls in before the first screen): main JS (entry + modulepreload
//   chunks), the first-load stylesheet (the CSS index.html links), the first-load font and
//   index.html; their total in English, the total with the largest non-English locale chunk added (a
//   player whose locale is not English loads exactly one), and the total gzipped (fonts are woff2,
//   already compressed, so they count as they are).
//   Lazy: the engine worker; the core lazy JS (overlays incl. the poses, hint engine, sound recipes,
//   RPC, generator, win flow UI, ranking, victory, shop UI); the optional lazy JS (the `events`,
//   `fb-social` and `social-flows` chunks); the lazy CSS (the overlay and events chunks' stylesheets,
//   loaded with their chunk); each locale chunk. Lazy fonts (latin-ext), event packs, level packs and
//   daily months are listed, not budgeted. FB builds: ≤ 100 files.
// Budget history: integration (2026-10-07): CSS 20 → 36 KB; main JS 140 → 170 KB, worker out of the
// first-load sum. Phase 2 hardening (lead decision, 2026-10-07): main JS 170 → 190 KB, CSS 36 → 40 KB,
// first load 220 → 250 KB; lazy JS 45 → 48 KB because the coach (O8, ≈ 4.6 KB) moved from the main
// bundle into the overlay chunk (the minimal raise plus ≈ 2 KB headroom). See 04 §9.
// Phase 2b (parity-spec §11, 2026-10-08): main JS 190 → 210 KB, CSS 40 → 53 KB, first load 250 →
// 280 KB (+ one locale ≤ 305 KB), core lazy JS 48 → 62 KB; new rows: optional lazy JS (events +
// fb-social) 25 KB, each locale chunk 24 KB; FB files 60 → 100 (platform cap 500).
// Phase 2b integration (lead decision, 2026-10-09; 04 §9): the overlays' and the event screen's CSS
// moved into their lazy chunks (first-load CSS 71 → 42 KB) and the dead O3 win overlay went; then
// every ceiling was set to the measured value of the largest build plus about 3 % headroom (the
// policy: the first load as small as practical and well within Meta's < 5 s load guideline on 4G;
// a budget is raised only by a lead decision recorded here and in 04 §9). New rows: the first load
// gzipped, the lazy CSS, social-flows under the optional lazy JS; the locale chunk cap is 28 KB
// (Devanagari and Thai take 3 bytes a character, E's request). The FB zip stays ≤ 1 MB (zip-fbig).
// Phase 2b review fixes (lead decision, 2026-10-09 final integration; 04 §9): the 47 review fixes
// (banner and ranking hardening, PERF-1's screen-out and per-element properties, lazy-CSS retry,
// relabelling on a language change, the dark victory, the FB safe zone, …) grew main JS 257.7 → 271.0
// KB and the lazy chunks (core JS 65.7 → 71.8 KB, CSS 27.4 → 30.3 KB). Cheap lazy reductions were
// tried first and found nothing to cut (no unused selector in the lazy stylesheets, no module
// duplicated between main and lazy chunks but the by-design engine fallback; moving the hub and
// group-result UIs to the optional chunk would save 4.8 KB of core lazy JS but needs a second overlay
// loader, not a cheap change). Ceilings = the measured maximum + about 3 %: main JS 266 → 279, first
// load 327 → 340 (2.7 %: kept below the sum of its rows' ceilings, so it still binds), + 1 locale 351 → 365, gzip 121.5 → 126.5, core lazy JS 68 → 74, lazy CSS 28.5 →
// 31.2, and the optional lazy JS 28.5 → 29.3 (within, but at 28.4 KB it had 0.1 KB left). The first load stays inside Meta's < 5 s on Slow 4G (STATUS-2b §4, measured).
// Phase 2c (2026-10-09): no ceiling moved. Phase 2c.1 (lead decision L7, 2026-10-10; STATUS-2c §10,
// 04 §9): the per-cat level points (the reducer's points, the in-progress slot fields, the HUD counter
// with its roll / chip / tight fallback, icon-points, the 2c.1 strings; net of the deleted per-win
// formula, perfect streak and streak chip) grew the FBIG main JS 278.2 → 280.6 KB. G1 and G2 had
// already shared the counter with the period pill and trimmed; a further cut needs a structural
// change (moving English strings out of the main bundle). Only the rows over budget moved, each to the
// measured maximum + about 3 %: main JS 279 → 289, first load 340 → 350 (2.6 %: below the sum of its
// rows' ceilings, so it still binds), + 1 locale 365 → 377 (2.7 %). CSS (43.45 / 43.5), gzip
// (126.1 / 126.5) and the optional lazy JS (29.1 / 29.3) are within and unchanged.
//
// Usage: tsx scripts/size-check.ts [distDir …] [--json]
//   No dirs → every existing one of dist/web, dist/fbig, dist/release-web and dist/release-fbig. A dir
//   whose name contains "fbig" also gets the FB file-count budget.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

export interface SizeBudget {
  readonly label: string;
  readonly pattern: RegExp;
  readonly maxBytes: number;
  /** Also count the files of this kind that index.html loads (JS: entry + modulepreload chunks; CSS: its stylesheet links). */
  readonly fromHtml?: 'js' | 'css';
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

/**
 * In matching order: a file is counted by the first budget it matches. Ceilings (2b integration,
 * 2026-10-09, re-set after the review fixes; main JS and the two first-load totals re-set at 2c.1,
 * 2026-10-10): the largest measured build (FBIG for JS) plus about 3 % (04 §9).
 */
export const BUDGETS: readonly SizeBudget[] = [
  { label: 'Main JS', pattern: /^assets\/index-[^/]*\.js$/, maxBytes: 289 * KB, fromHtml: 'js', firstLoad: true },
  // Only the stylesheet index.html links; the lazy chunks' stylesheets are the 'Lazy CSS' row.
  { label: 'CSS', pattern: /^$/, maxBytes: 43.5 * KB, fromHtml: 'css', firstLoad: true },
  // The latin-ext face (tr, pl) is fetched only when such glyphs appear (unicode-range, phase2b §6.6).
  { label: 'Font (lazy)', pattern: /-ext-[^/]*\.woff2$/, maxBytes: LISTED },
  { label: 'Font', pattern: /\.woff2$/, maxBytes: 17 * KB, firstLoad: true },
  { label: 'index.html', pattern: /^index\.html$/, maxBytes: 1 * KB, firstLoad: true },
  { label: 'Worker JS (lazy)', pattern: /^assets\/[^/]*worker[^/]*\.js$/, maxBytes: 18.5 * KB },
  { label: 'Locale chunk (each)', pattern: LOCALE_CHUNK, maxBytes: 28 * KB, perFile: true },
  { label: 'Lazy JS (optional)', pattern: /^assets\/(?:events|fb-social|social-flows)-[^/]*\.js$/, maxBytes: 29.3 * KB },
  { label: 'Lazy JS (core)', pattern: /^assets\/[^/]*\.js$/, maxBytes: 74 * KB },
  { label: 'Lazy CSS', pattern: /^assets\/[^/]*\.css$/, maxBytes: 31.2 * KB },
  { label: 'Event packs', pattern: /^assets\/[a-z][a-z-]*-\d{4}-[^/]*\.json$/, maxBytes: LISTED },
];

/** Everything index.html loads before the first screen, English (the firstLoad rows). */
export const FIRST_LOAD_MAX = 350 * KB;
/** The first load plus the largest non-English locale chunk (phase2b §11). */
export const FIRST_LOAD_LOCALE_MAX = 377 * KB;
/** The first load gzipped (woff2 as is): what players download from a compressing host. */
export const FIRST_LOAD_GZIP_MAX = 126.5 * KB;
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

/** Local files of `ext` that index.html loads (module entry and modulepreload links, or stylesheet links). */
function htmlRefs(html: string, ext: 'js' | 'css'): Set<string> {
  const refs = new Set<string>();
  const re = ext === 'js' ? /\b(?:src|href)\s*=\s*["']([^"']+\.js)["']/g : /\bhref\s*=\s*["']([^"']+\.css)["']/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const ref = m[1] ?? '';
    if (/^[a-z]+:\/\//i.test(ref) || ref.startsWith('//')) continue; // the FB SDK tag is not ours
    refs.add(ref.replace(/^\.?\//, ''));
  }
  return refs;
}

/** Gzip size of a first-load file (level 9); woff2 is already compressed and counts as it is. */
function gzipBytes(path: string, bytes: number): number {
  if (path.endsWith('.woff2')) return bytes;
  return gzipSync(readFileSync(path), { level: 9 }).length;
}

export function checkSizes(distDir: string, opts: { fb?: boolean } = {}): SizeReport {
  if (!existsSync(distDir)) throw new Error(`${distDir} does not exist: build it first`);
  const files = listFiles(distDir);
  const htmlPath = join(distDir, 'index.html');
  const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : '';
  const fromHtml = { js: htmlRefs(html, 'js'), css: htmlRefs(html, 'css') };
  const counted = new Set<string>();
  const rows: SizeRow[] = [];

  let first = 0;
  let firstGzip = 0;
  let largestLocale = 0;
  for (const b of BUDGETS) {
    let bytes = 0;
    let n = 0;
    for (const f of files) {
      const hit = b.pattern.test(f.path) || (b.fromHtml !== undefined && fromHtml[b.fromHtml].has(f.path) && !counted.has(f.path));
      if (!hit || counted.has(f.path)) continue;
      counted.add(f.path);
      n++;
      bytes = b.perFile ? Math.max(bytes, f.bytes) : bytes + f.bytes;
      if (b.firstLoad) firstGzip += gzipBytes(join(distDir, f.path), f.bytes);
    }
    if (b.firstLoad) first += bytes;
    if (b.pattern === LOCALE_CHUNK) largestLocale = bytes;
    const listed = b.maxBytes === LISTED || b.perFile;
    rows.push({ label: b.label, bytes, maxBytes: b.maxBytes, ok: bytes <= b.maxBytes, ...(listed ? { files: n } : {}) });
  }
  // The first-load totals go right after the last first-load row.
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
    { label: 'First load (gzip)', bytes: firstGzip, maxBytes: FIRST_LOAD_GZIP_MAX, ok: firstGzip <= FIRST_LOAD_GZIP_MAX },
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
