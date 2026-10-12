// Owner: D (Phase 2b; was platform)
// Build tooling: size-check budgets (04 §9), zip-fbig rules (04 §10, 05 §5), upload-fbig request
// shape (05 §12) against a fake fetch (it never touches the network); Phase 2e L0: the guarded server verify step.
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { BUDGETS, checkSizes, FB_MAX_FILES, FIRST_LOAD_GZIP_MAX, FIRST_LOAD_LOCALE_MAX, FIRST_LOAD_MAX } from '../../../scripts/size-check';
import { latestZip, uploadBundle } from '../../../scripts/upload-fbig';
import { SERVER_VERIFY_CMD, serverVerifyStep } from '../../../scripts/verify-server';
import { BUDGET_ZIP_BYTES, fbIdWarnings, localeChunkIds, zipFbig } from '../../../scripts/zip-fbig';

const dirs: string[] = [];
function tempDir(name: string): string {
  const d = mkdtempSync(join(tmpdir(), `mewdoku-${name}-`));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function writeTree(root: string, files: Record<string, string | number | Uint8Array>): void {
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, typeof content === 'number' ? 'x'.repeat(content) : content);
  }
}

const HTML = `<!doctype html><html><head>
<script src="https://connect.facebook.net/en_US/fbinstant.8.0.js"></script>
<script type="module" crossorigin src="./assets/index-abc.js"></script>
<link rel="modulepreload" crossorigin href="./assets/shared-def.js">
<link rel="stylesheet" href="./assets/index-abc.css"></head><body><div id="app"></div></body></html>`;

function fakeBuild(root: string, sizes: Partial<Record<string, number>> = {}): void {
  writeTree(root, {
    // sizes.html pads index.html to that many bytes with a trailing comment.
    'index.html': sizes.html ? HTML + `<!--${'p'.repeat(Math.max(0, sizes.html - HTML.length - 7))}-->` : HTML,
    'fbapp-config.json': '{"instant_games":{}}',
    'assets/index-abc.js': sizes.main ?? 100_000,
    'assets/shared-def.js': sizes.shared ?? 10_000,
    'assets/engine.worker-123.js': sizes.worker ?? 17_000,
    'assets/overlay-chunk-77.js': sizes.lazy ?? 18_000,
    'assets/index-abc.css': sizes.css ?? 15_000,
    'assets/display-latin-9.woff2': sizes.font ?? 16_468,
    'assets/pack-001-aa.json': 14_000,
    'assets/2026-10-bb.json': 4_000,
  });
}

describe('size-check', () => {
  it('sums each budget, counts modulepreload chunks as main JS, and passes a lean build', () => {
    const d = tempDir('web');
    fakeBuild(d);
    const r = checkSizes(d, { fb: false });
    const row = (label: string) => r.rows.find((x) => x.label === label);
    expect(row('Main JS')?.bytes).toBe(110_000);
    expect(row('CSS')?.bytes).toBe(15_000);
    expect(row('Font')?.bytes).toBe(16_468);
    // First load = what index.html pulls in before the first screen; the worker is lazy (04 §5.5).
    expect(row('First-load total')?.bytes).toBe(110_000 + 15_000 + 16_468 + HTML.length);
    expect(row('First-load total')?.maxBytes).toBe(FIRST_LOAD_MAX);
    expect(row('Worker JS (lazy)')?.bytes).toBe(17_000);
    expect(row('Lazy JS (core)')?.bytes).toBe(18_000);
    expect(row('Lazy (packs, other)')?.bytes).toBe(18_000 + '{"instant_games":{}}'.length);
    // 'x'-filled fakes gzip to almost nothing; the font (woff2) counts as it is.
    expect(row('First load (gzip)')?.bytes).toBeGreaterThan(16_468);
    expect(row('First load (gzip)')?.bytes).toBeLessThan(16_468 + 2_000);
    expect(r.rows.map((x) => x.label)).toEqual([
      'Main JS',
      'CSS',
      'Font (lazy)',
      'Font',
      'index.html',
      'First-load total',
      'First load + 1 locale',
      'First load (gzip)',
      'Worker JS (lazy)',
      'Locale chunk (each)',
      'Lazy JS (optional)',
      'Lazy JS (fx chunk)',
      'Lazy JS (board motion)',
      'Lazy JS (lazy art)',
      'Lazy JS (ladder)',
      'Lazy JS (ladder boot)',
      'Lazy JS (overlay chunk)',
      'Lazy JS (English)',
      'Lazy JS (core)',
      'Lazy CSS (fx chunk)',
      'Lazy CSS (board motion)',
      'Lazy CSS (ladder)',
      'Lazy CSS (overlay chunk)',
      'Lazy CSS',
      'Event packs',
      'Lazy (packs, other)',
    ]);
    expect(r.ok).toBe(true);
    expect(r.maxFiles).toBeUndefined();
  });

  it('has the recorded ceilings (measured + about 3 %: 2b lead decision 2026-10-09; main JS and the first-load totals re-set at 2c.1, L7; main JS, CSS, the first-load totals and the lazy CSS at 2d I-4; main JS, CSS, index.html, the first-load totals and the locale chunk at 2d.1 I-4; main JS, the first-load totals, the locale chunk, the ladder rows and the core lazy rows at 2e I-4, 04 §9)', () => {
    const max = (label: string) => BUDGETS.find((b) => b.label === label)?.maxBytes;
    expect([max('Main JS'), max('CSS'), max('Font'), max('index.html'), FIRST_LOAD_MAX, FIRST_LOAD_LOCALE_MAX, FIRST_LOAD_GZIP_MAX]).toEqual([
      360_000, 51_700, 17_000, 1_140, 427_000, 470_000, 158_000,
    ]);
    // The first-load total still binds: below the sum of its rows' ceilings.
    expect(FIRST_LOAD_MAX).toBeLessThan((max('Main JS') ?? 0) + (max('CSS') ?? 0) + (max('Font') ?? 0) + (max('index.html') ?? 0));
    // Phase 2e I-4: the core lazy rows hold only what the chunk rows leave (hint card, RPC, sounds, generator, grader;
    // the events chunk's stylesheet), the locale chunk carries the 2e copy.
    expect([max('Worker JS (lazy)'), max('Lazy JS (core)'), max('Lazy JS (optional)'), max('Lazy CSS'), max('Locale chunk (each)')]).toEqual([
      18_500, 23_300, 29_300, 7_200, 41_900,
    ]);
    // Phase 2d.1 I-4: the new lazy chunks' rows (the fx chunk's JS and CSS and the lazy art re-set at the final audit fixes).
    expect([max('Lazy JS (fx chunk)'), max('Lazy JS (board motion)'), max('Lazy JS (lazy art)'), max('Lazy CSS (fx chunk)'), max('Lazy CSS (board motion)')]).toEqual([
      15_300, 3_800, 4_400, 3_260, 6_400,
    ]);
    // Phase 2e: the ladder chunk (L0's placeholders, the spec's 26 / 4 KB estimates, re-set at I-4 to measured + about 3 %)
    // and the I-4 rows: the ladder boot chunk, the overlay chunk (JS, CSS) and the lazy English strings.
    expect([max('Lazy JS (ladder)'), max('Lazy CSS (ladder)')]).toEqual([30_500, 11_050]);
    expect([max('Lazy JS (ladder boot)'), max('Lazy JS (overlay chunk)'), max('Lazy JS (English)'), max('Lazy CSS (overlay chunk)')]).toEqual([
      36_400, 56_200, 13_600, 33_500, // the overlay chunk's CSS 32 → 33.5 at the audit fix round; ladder boot 34.9 → 36.4 (2026-10-12)
    ]);
    expect(FB_MAX_FILES).toBe(100);
  });

  it('counts only the stylesheet index.html links as first-load CSS; the chunks\' stylesheets are lazy', () => {
    const d = tempDir('web');
    fakeBuild(d);
    // (A 2-character hash: not the overlay chunk's own row, which needs Vite's 8-character hash; counted as lazy CSS.)
    writeTree(d, { 'assets/overlay-chunk-a1.css': 3_000, 'assets/events-chunk-b2.css': 3_500 });
    const r = checkSizes(d, { fb: false });
    const row = (label: string) => r.rows.find((x) => x.label === label);
    expect(row('CSS')?.bytes).toBe(15_000);
    expect(row('Lazy CSS')?.bytes).toBe(6_500);
    expect(row('Lazy CSS')?.ok).toBe(true);
    expect(row('First-load total')?.bytes).toBe(110_000 + 15_000 + 16_468 + HTML.length);
    writeTree(d, { 'assets/overlay-chunk-a1.css': 3_701 }); // + 3 500 = 7 201 > 7.2 KB (since 2e I-4)
    expect(checkSizes(d, { fb: false }).rows.find((x) => x.label === 'Lazy CSS')?.ok).toBe(false);
  });

  it('the first load gzipped has its own ceiling (incompressible bytes go over it while every raw row passes)', () => {
    const d = tempDir('web');
    fakeBuild(d);
    writeTree(d, { 'assets/index-abc.js': randomBytes(145_000) }); // incompressible: its gzip is over 158 KB with the rest (since 2e I-4)
    const r = checkSizes(d, { fb: false });
    const gz = r.rows.find((x) => x.label === 'First load (gzip)');
    expect(gz?.bytes).toBeGreaterThan(FIRST_LOAD_GZIP_MAX);
    expect(gz?.ok).toBe(false);
    expect(r.rows.filter((x) => x.label !== 'First load (gzip)').every((x) => x.ok)).toBe(true);
    expect(r.ok).toBe(false);
  });

  it('fails when the first-load total or the lazy chunks are over budget', () => {
    const d = tempDir('web');
    // shared-def.js (10 KB) is a modulepreload chunk, so main JS = its ceiling (360 KB since 2e I-4): each row
    // at its ceiling, the sum (427.44 KB) over the first-load total's 427 KB.
    const mainMax = BUDGETS.find((b) => b.label === 'Main JS')?.maxBytes ?? 0;
    const cssMax = BUDGETS.find((b) => b.label === 'CSS')?.maxBytes ?? 0;
    fakeBuild(d, { main: mainMax - 10_000, css: cssMax, font: 17_000, html: 1_140 });
    const r = checkSizes(d, { fb: false });
    expect(r.rows.find((x) => x.label === 'Main JS')?.ok).toBe(true);
    expect(r.rows.find((x) => x.label === 'CSS')?.ok).toBe(true);
    expect(r.rows.find((x) => x.label === 'First-load total')?.ok).toBe(false);
    expect(r.ok).toBe(false);
    const lazy = tempDir('web');
    fakeBuild(lazy, { lazy: 23_301 }); // the core lazy JS's ceiling (23.3 KB since 2e I-4) + 1 byte
    expect(checkSizes(lazy, { fb: false }).ok).toBe(false);
  });

  it('fails when a budget is exceeded', () => {
    const d = tempDir('web');
    const mainMax = BUDGETS.find((b) => b.label === 'Main JS')?.maxBytes ?? 0;
    fakeBuild(d, { main: mainMax - 10_000 + 1 }); // + the 10 KB modulepreload chunk = the ceiling + 1 byte (360.001 KB)
    const r = checkSizes(d, { fb: false });
    expect(r.ok).toBe(false);
    expect(r.rows.find((x) => x.label === 'Main JS')?.ok).toBe(false);
  });

  it('applies the FB file-count budget to fbig builds', () => {
    const d = tempDir('fbig');
    fakeBuild(d);
    for (let i = 0; i < FB_MAX_FILES; i++) writeTree(d, { [`assets/extra-${i}.json`]: 10 });
    const r = checkSizes(d, { fb: true });
    expect(r.maxFiles).toBe(FB_MAX_FILES);
    expect(r.fileCount).toBeGreaterThan(FB_MAX_FILES);
    expect(r.ok).toBe(false);
  });

  it('phase2b rows: each locale chunk ≤ 41.9 KB (28 until 2d.1 I-4, 29.3 until 2e I-4), the largest one added to the first load; optional lazy JS; lazy fonts and event packs listed', () => {
    const d = tempDir('web');
    fakeBuild(d);
    writeTree(d, {
      'assets/locale-de-aa.js': 20_000,
      'assets/locale-pt-BR-bb.js': 23_000,
      'assets/events-cc.js': 7_000,
      'assets/fb-social-dd.js': 9_000,
      'assets/social-flows-hh.js': 6_000,
      'assets/display-latin-ext-ee.woff2': 2_700,
      'assets/lantern-walk-2026-ff.json': 3_500,
    });
    const r = checkSizes(d, { fb: false });
    const row = (label: string) => r.rows.find((x) => x.label === label);
    expect(row('Locale chunk (each)')).toMatchObject({ bytes: 23_000, ok: true, files: 2 });
    const first = row('First-load total')?.bytes ?? 0;
    expect(first).toBe(110_000 + 15_000 + 16_468 + HTML.length); // the lazy latin-ext face is not first load
    expect(row('First load + 1 locale')?.bytes).toBe(first + 23_000);
    expect(row('Lazy JS (optional)')?.bytes).toBe(22_000);
    expect(row('Lazy JS (core)')?.bytes).toBe(18_000); // locale and optional chunks are not core
    expect(row('Font (lazy)')).toMatchObject({ bytes: 2_700, files: 1 });
    expect(row('Event packs')).toMatchObject({ bytes: 3_500, files: 1 });
    expect(r.ok).toBe(true);

    writeTree(d, { 'assets/locale-ar-gg.js': 41_901 });
    const over = checkSizes(d, { fb: false });
    expect(over.rows.find((x) => x.label === 'Locale chunk (each)')).toMatchObject({ bytes: 41_901, ok: false, files: 3 });
    expect(over.ok).toBe(false);
  });

  it('the optional lazy JS (events + fb-social + social-flows) has its own ceiling', () => {
    const d = tempDir('web');
    fakeBuild(d);
    writeTree(d, { 'assets/events-a.js': 9_000, 'assets/fb-social-b.js': 13_000, 'assets/social-flows-c.js': 7_300 }); // 29.3 KB: at the ceiling
    expect(checkSizes(d, { fb: false }).rows.find((x) => x.label === 'Lazy JS (optional)')?.ok).toBe(true);
    writeTree(d, { 'assets/social-flows-c.js': 7_301 }); // one byte over
    const r = checkSizes(d, { fb: false });
    expect(r.rows.find((x) => x.label === 'Lazy JS (optional)')?.ok).toBe(false);
  });

  it('Phase 2d.1 I-4: the fx chunk, the board\'s lazy motion and the lazy art have their own rows, JS and CSS, outside the core lazy rows', () => {
    const d = tempDir('web');
    fakeBuild(d);
    writeTree(d, {
      'assets/celebrate-a1.js': 15_300, // at the ceiling (re-set at the final audit fixes)
      'assets/celebrate-b2.css': 3_260,
      'assets/board-mouse-c3.js': 3_800,
      'assets/board-mouse-d4.css': 6_400,
      'assets/lazy-art-e5.js': 4_400,
      'assets/overlay-chunk-f6.css': 7_000,
    });
    const r = checkSizes(d, { fb: false });
    const row = (label: string) => r.rows.find((x) => x.label === label);
    expect(row('Lazy JS (fx chunk)')).toMatchObject({ bytes: 15_300, ok: true });
    expect(row('Lazy JS (board motion)')).toMatchObject({ bytes: 3_800, ok: true });
    expect(row('Lazy JS (lazy art)')).toMatchObject({ bytes: 4_400, ok: true });
    expect(row('Lazy CSS (fx chunk)')).toMatchObject({ bytes: 3_260, ok: true });
    expect(row('Lazy CSS (board motion)')).toMatchObject({ bytes: 6_400, ok: true });
    // not counted twice: the core rows hold only the rest
    expect(row('Lazy JS (core)')?.bytes).toBe(18_000);
    expect(row('Lazy CSS')?.bytes).toBe(7_000);
    expect(r.ok).toBe(true);
    for (const [file, bytes, label] of [
      ['assets/celebrate-a1.js', 15_301, 'Lazy JS (fx chunk)'],
      ['assets/board-mouse-c3.js', 3_801, 'Lazy JS (board motion)'],
      ['assets/lazy-art-e5.js', 4_401, 'Lazy JS (lazy art)'],
      ['assets/celebrate-b2.css', 3_261, 'Lazy CSS (fx chunk)'],
      ['assets/board-mouse-d4.css', 6_401, 'Lazy CSS (board motion)'],
    ] as const) {
      const o = tempDir('web');
      fakeBuild(o);
      writeTree(o, { [file]: bytes });
      const over = checkSizes(o, { fb: false });
      expect(over.rows.find((x) => x.label === label)?.ok, label).toBe(false);
      expect(over.ok).toBe(false);
    }
  });

  it('Phase 2e L0: the ladder chunk (assets/ladder-*.js, ladder-chunk-*.css) has its own rows, outside the core lazy rows', () => {
    const d = tempDir('web');
    fakeBuild(d);
    writeTree(d, {
      'assets/ladder-Ab3_x-9Z.js': 30_500, // at the ceiling (re-set at I-4)
      'assets/ladder-chunk-Qw7-e2Rt.css': 11_050,
      // Chunks named after other ladder-* modules are not the ladder chunk: they stay in the core lazy rows.
      'assets/ladder-flow-Zx81_aBc.js': 2_000,
      'assets/ladder-sheet-Pp0-q1Wr.css': 500,
      'assets/overlay-chunk-f6.css': 6_000,
    });
    const r = checkSizes(d, { fb: false });
    const row = (label: string) => r.rows.find((x) => x.label === label);
    expect(row('Lazy JS (ladder)')).toMatchObject({ bytes: 30_500, ok: true });
    expect(row('Lazy CSS (ladder)')).toMatchObject({ bytes: 11_050, ok: true });
    expect(row('Lazy JS (core)')?.bytes).toBe(18_000 + 2_000);
    expect(row('Lazy CSS')?.bytes).toBe(6_000 + 500);
    expect(r.ok).toBe(true);
    for (const [file, bytes, label] of [
      ['assets/ladder-Ab3_x-9Z.js', 30_501, 'Lazy JS (ladder)'],
      ['assets/ladder-chunk-Qw7-e2Rt.css', 11_051, 'Lazy CSS (ladder)'],
    ] as const) {
      const o = tempDir('web');
      fakeBuild(o);
      writeTree(o, { [file]: bytes });
      const over = checkSizes(o, { fb: false });
      expect(over.rows.find((x) => x.label === label)?.ok, label).toBe(false);
      expect(over.ok).toBe(false);
    }
  });

  it('Phase 2e I-4: the ladder boot chunk, the overlay chunk (JS, CSS) and the lazy English strings have their own rows, outside the core lazy rows', () => {
    const d = tempDir('web');
    fakeBuild(d);
    writeTree(d, {
      'assets/ladder-boot-Ab3_x-9Z.js': 36_400, // each at its ceiling
      'assets/overlay-chunk-Qw7-e2Rt.js': 56_200,
      'assets/en-lazy-hpVVNp3-.js': 13_600,
      'assets/overlay-chunk-CbqOliHw.css': 33_500,
      'assets/events-chunk-B7w1u0ro.css': 7_000,
    });
    const r = checkSizes(d, { fb: false });
    const row = (label: string) => r.rows.find((x) => x.label === label);
    expect(row('Lazy JS (ladder boot)')).toMatchObject({ bytes: 36_400, ok: true });
    expect(row('Lazy JS (overlay chunk)')).toMatchObject({ bytes: 56_200, ok: true });
    expect(row('Lazy JS (English)')).toMatchObject({ bytes: 13_600, ok: true });
    expect(row('Lazy CSS (overlay chunk)')).toMatchObject({ bytes: 33_500, ok: true });
    // not counted twice: the core rows hold only the rest (the fake's 2-character overlay-chunk-77.js, the events sheet)
    expect(row('Lazy JS (core)')?.bytes).toBe(18_000);
    expect(row('Lazy CSS')?.bytes).toBe(7_000);
    // the ladder boot chunk is not the ladder chunk
    expect(row('Lazy JS (ladder)')?.bytes).toBe(0);
    expect(r.ok).toBe(true);
    for (const [file, bytes, label] of [
      ['assets/ladder-boot-Ab3_x-9Z.js', 36_401, 'Lazy JS (ladder boot)'],
      ['assets/overlay-chunk-Qw7-e2Rt.js', 56_201, 'Lazy JS (overlay chunk)'],
      ['assets/en-lazy-hpVVNp3-.js', 13_601, 'Lazy JS (English)'],
      ['assets/overlay-chunk-CbqOliHw.css', 33_501, 'Lazy CSS (overlay chunk)'],
      ['assets/events-chunk-B7w1u0ro.css', 7_201, 'Lazy CSS'],
    ] as const) {
      const o = tempDir('web');
      fakeBuild(o);
      writeTree(o, { [file]: bytes });
      const over = checkSizes(o, { fb: false });
      expect(over.rows.find((x) => x.label === label)?.ok, label).toBe(false);
      expect(over.ok).toBe(false);
    }
  });

  it('a release-fbig dir gets the FB file budget too', () => {
    const root = tempDir('rel');
    const d = join(root, 'release-fbig');
    fakeBuild(d);
    expect(checkSizes(d).maxFiles).toBe(FB_MAX_FILES);
  });

  it('throws for a missing directory', () => {
    expect(() => checkSizes(join(tmpdir(), 'mewdoku-does-not-exist'))).toThrow(/build it first/);
  });
});

describe('zip-fbig', () => {
  it('zips with index.html and fbapp-config.json at the root, deterministically', () => {
    const d = tempDir('fbig');
    const out = tempDir('zip');
    fakeBuild(d);
    const a = zipFbig({ distDir: d, outDir: out, name: 'mew', version: '1.2.3', sha: 'abc1234', quiet: true });
    expect(a.file).toBe(join(out, 'mew-fbig-1.2.3-abc1234.zip'));
    expect(a.fileCount).toBe(10);
    const bytes = readFileSync(a.file);
    expect(a.bytes).toBe(bytes.length);
    const entries = unzipSync(new Uint8Array(bytes));
    expect(Object.keys(entries)).toContain('index.html');
    expect(Object.keys(entries)).toContain('fbapp-config.json');
    expect(Object.keys(entries).every((k) => !k.startsWith('fbig/') && !k.startsWith('/'))).toBe(true);
    expect(new TextDecoder().decode(entries['index.html'])).toBe(HTML);
    const b = zipFbig({ distDir: d, outDir: out, name: 'mew', version: '1.2.3', sha: 'abc1234', quiet: true });
    expect(readFileSync(b.file).equals(bytes)).toBe(true);
  });

  it('refuses source maps and precompressed files', () => {
    const d = tempDir('fbig');
    fakeBuild(d);
    writeTree(d, { 'assets/index-abc.js.map': 10, 'assets/index-abc.js.br': 10 });
    expect(() => zipFbig({ distDir: d, outDir: tempDir('zip'), sha: 'x', quiet: true })).toThrow(/source maps/);
  });

  it('requires index.html and fbapp-config.json at the root', () => {
    const d = tempDir('fbig');
    writeTree(d, { 'sub/index.html': '<html></html>' });
    expect(() => zipFbig({ distDir: d, outDir: tempDir('zip'), sha: 'x', quiet: true })).toThrow(
      /missing index\.html.*missing fbapp-config\.json/,
    );
  });

  it('refuses more than 500 files or a zip over 1 MB (raw size alone is fine: it compresses)', () => {
    const many = tempDir('fbig');
    fakeBuild(many);
    for (let i = 0; i < 500; i++) writeTree(many, { [`a/${i}.json`]: 1 });
    expect(() => zipFbig({ distDir: many, outDir: tempDir('zip'), sha: 'x', quiet: true })).toThrow(/platform cap of 500/);
    const compressible = tempDir('fbig');
    fakeBuild(compressible, { main: 1_100_000 });
    expect(zipFbig({ distDir: compressible, outDir: tempDir('zip'), sha: 'x', quiet: true }).bytes).toBeLessThan(BUDGET_ZIP_BYTES);
    const big = tempDir('fbig');
    fakeBuild(big);
    writeFileSync(join(big, 'assets', 'noise.png'), randomBytes(1_050_000)); // stored, incompressible
    expect(() => zipFbig({ distDir: big, outDir: tempDir('zip'), sha: 'x', quiet: true })).toThrow(/the zip is \d+ bytes, over 1000000/);
  });

  it('phase2b: a release zip refuses locale chunks outside i18n.releaseLocales; --preview allows them and says so', () => {
    const d = tempDir('fbig');
    fakeBuild(d);
    writeTree(d, { 'assets/locale-de-Ab1.js': 100, 'assets/locale-pt-BR-x_9.js': 100 });
    expect(localeChunkIds(['assets/locale-de-Ab1.js', 'assets/locale-pt-BR-x_9.js', 'assets/index-a.js'])).toEqual(['de', 'pt-BR']);
    // A hash with a dash in it (seen in a real build: locale-th-BLfe0o-k.js) still names its locale.
    expect(localeChunkIds(['assets/locale-th-BLfe0o-k.js', 'assets/locale-zh-Hans-a-b.js'])).toEqual(['th', 'zh-Hans']);
    expect(() => zipFbig({ distDir: d, outDir: tempDir('zip'), sha: 'x', quiet: true })).toThrow(/outside i18n\.releaseLocales \(de, pt-BR\)/);
    expect(zipFbig({ distDir: d, outDir: tempDir('zip'), sha: 'x', quiet: true, releaseLocales: ['en', 'de', 'pt-BR'] }).fileCount).toBe(12);
    const preview = zipFbig({ distDir: d, outDir: tempDir('zip'), name: 'mew', version: '1', sha: 'x', quiet: true, release: false });
    expect(preview.file).toMatch(/mew-fbig-preview-1-x\.zip$/);
  });

  it('phase2b: refuses a build that carries the e2e test hooks', () => {
    const d = tempDir('fbig');
    fakeBuild(d);
    writeTree(d, { 'assets/index-abc.js': 'if(x)window.__mewdoku=createHooks();' });
    expect(() => zipFbig({ distDir: d, outDir: tempDir('zip'), sha: 'x', quiet: true, release: false })).toThrow(/e2e test hooks/);
  });

  it('a release zip warns about empty VITE_FB_* placement and leaderboard ids (from the build marker); a preview does not', () => {
    const d = tempDir('fbig');
    fakeBuild(d);
    writeTree(d, { 'assets/index-abc.js': 'const a="mewdoku-fb-ids:i1r0b0l1";' });
    const r = zipFbig({ distDir: d, outDir: tempDir('zip'), sha: 'x', quiet: true });
    expect(r.warnings).toEqual([
      'VITE_FB_PLACEMENT_REWARDED was empty in this build: no rewarded videos (the free fallback grant only) (fb-dashboard.md §1)',
      'VITE_FB_PLACEMENT_BANNER was empty in this build: no banners (fb-dashboard.md §1)',
    ]);
    expect(zipFbig({ distDir: d, outDir: tempDir('zip'), sha: 'x', quiet: true, release: false }).warnings).toEqual([]);
    writeTree(d, { 'assets/index-abc.js': 'const a="mewdoku-fb-ids:i1r1b1l1";' });
    expect(zipFbig({ distDir: d, outDir: tempDir('zip'), sha: 'x', quiet: true }).warnings).toEqual([]);
    expect(fbIdWarnings(['no marker here'])).toEqual([expect.stringMatching(/no VITE_FB_\* marker/)]);
    expect(fbIdWarnings(['x', '"mewdoku-fb-ids:i0r0b0l0"'])).toHaveLength(4);
  });

  it('phase2b: the default source is the release build (dist/release-fbig)', () => {
    expect(() => zipFbig({ distDir: join(tmpdir(), 'mewdoku-no-such-release'), sha: 'x', quiet: true })).toThrow(/npm run build:release/);
    expect(() => zipFbig({ distDir: join(tmpdir(), 'mewdoku-no-such-preview'), sha: 'x', quiet: true, release: false })).toThrow(/npm run build:fbig/);
  });
});

describe('upload-fbig', () => {
  function fakeFetch(responses: Response[]) {
    const seen: { url: string; init: RequestInit | undefined }[] = [];
    const fn = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), init });
      const r = responses.shift();
      if (!r) throw new Error('unexpected request');
      return r;
    }) as typeof fetch;
    return { fn, seen };
  }

  it('mints an app token, then posts the bundle with type=BUNDLE', async () => {
    const d = tempDir('zip');
    const zip = join(d, 'mew-fbig-1.0.0-abc.zip');
    writeFileSync(zip, 'PK-fake');
    const { fn, seen } = fakeFetch([
      new Response(JSON.stringify({ access_token: 'app|tok' }), { status: 200 }),
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    ]);
    await uploadBundle(zip, '1.0.0 abc', { env: { FB_APP_ID: '123', FB_APP_SECRET: 's3cret' }, fetch: fn });
    expect(seen[0]?.url).toContain('https://graph.facebook.com/oauth/access_token?');
    expect(seen[0]?.url).toContain('client_id=123');
    expect(seen[0]?.url).toContain('grant_type=client_credentials');
    expect(seen[1]?.url).toBe('https://graph-video.facebook.com/123/assets');
    const form = seen[1]?.init?.body as FormData;
    expect(form.get('type')).toBe('BUNDLE');
    expect(form.get('access_token')).toBe('app|tok');
    expect(form.get('comment')).toBe('1.0.0 abc');
    expect((form.get('asset') as File).name).toBe('mew-fbig-1.0.0-abc.zip');
    // Meta answers 500 "Invalid file. Expected … application/octet-stream" to application/zip (live upload, 2026-10-11).
    expect((form.get('asset') as File).type).toBe('application/octet-stream');
  });

  it('uses FB_UPLOAD_TOKEN directly and reports failures', async () => {
    const d = tempDir('zip');
    const zip = join(d, 'x-fbig-1-a.zip');
    writeFileSync(zip, 'PK');
    const { fn, seen } = fakeFetch([new Response('{"error":{"message":"bad"}}', { status: 400 })]);
    await expect(uploadBundle(zip, 'c', { env: { FB_APP_ID: '1', FB_UPLOAD_TOKEN: 't' }, fetch: fn })).rejects.toThrow(
      /upload failed \(400\)/,
    );
    expect(seen).toHaveLength(1);
  });

  it('picks the newest release zip by default, never a preview zip (phase2b)', () => {
    const d = tempDir('zip');
    writeFileSync(join(d, 'mew-fbig-1.0.0-aaa.zip'), 'PK');
    writeFileSync(join(d, 'mew-fbig-preview-1.0.1-bbb.zip'), 'PK');
    expect(latestZip(d)).toBe(join(d, 'mew-fbig-1.0.0-aaa.zip'));
    expect(latestZip(d, { preview: true })).toBe(join(d, 'mew-fbig-preview-1.0.1-bbb.zip'));
    expect(latestZip(join(d, 'none'))).toBeNull();
  });

  it('refuses to run without credentials', async () => {
    const d = tempDir('zip');
    const zip = join(d, 'x-fbig-1-a.zip');
    writeFileSync(zip, 'PK');
    await expect(uploadBundle(zip, 'c', { env: {} })).rejects.toThrow(/FB_APP_ID/);
    await expect(uploadBundle(zip, 'c', { env: { FB_APP_ID: '1' } })).rejects.toThrow(/FB_UPLOAD_TOKEN/);
  });
});

describe('verify-server (Phase 2e L0: the root verify runs the server\'s, guarded)', () => {
  const at =
    (...present: string[]) =>
    (p: string): boolean =>
      present.some((q) => p.replace(/\\/g, '/').endsWith(q));

  it('skips with a note before server/ exists, so the root verify stays green', () => {
    expect(serverVerifyStep('/repo', at()).kind).toBe('skip');
  });

  it('says what to run when server/node_modules is missing', () => {
    const step = serverVerifyStep('/repo', at('server/package.json'));
    expect(step.kind).toBe('skip');
    const message = step.kind === 'skip' ? step.message : '';
    expect(message).toContain('npm --prefix server ci');
    expect(message).toContain(SERVER_VERIFY_CMD);
  });

  it('runs npm --prefix server run verify once both exist', () => {
    expect(serverVerifyStep('/repo', at('server/package.json', 'server/node_modules'))).toEqual({ kind: 'run' });
    expect(SERVER_VERIFY_CMD).toBe('npm --prefix server run verify');
  });

  it('is the last step of the root verify', () => {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '../../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts.verify).toMatch(/&& npm run verify:server$/);
    expect(pkg.scripts['verify:server']).toBe('tsx scripts/verify-server.ts');
  });
});
