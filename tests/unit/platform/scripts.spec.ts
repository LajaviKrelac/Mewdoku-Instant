// Owner: platform
// Build tooling: size-check budgets (04 §9), zip-fbig rules (04 §10, 05 §5), upload-fbig request
// shape (05 §12) against a fake fetch (it never touches the network).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { checkSizes, FB_MAX_FILES, FIRST_LOAD_MAX } from '../../../scripts/size-check';
import { uploadBundle } from '../../../scripts/upload-fbig';
import { zipFbig } from '../../../scripts/zip-fbig';

const dirs: string[] = [];
function tempDir(name: string): string {
  const d = mkdtempSync(join(tmpdir(), `mewdoku-${name}-`));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function writeTree(root: string, files: Record<string, string | number>): void {
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
    'index.html': HTML,
    'fbapp-config.json': '{"instant_games":{}}',
    'assets/index-abc.js': sizes.main ?? 100_000,
    'assets/shared-def.js': sizes.shared ?? 10_000,
    'assets/engine.worker-123.js': sizes.worker ?? 20_000,
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
    expect(row('Worker JS (lazy)')?.bytes).toBe(20_000);
    expect(row('Lazy JS chunks')?.bytes).toBe(18_000);
    expect(row('Lazy (packs, other)')?.bytes).toBe(18_000 + '{"instant_games":{}}'.length);
    expect(r.rows.map((x) => x.label)).toEqual([
      'Main JS',
      'CSS',
      'Font',
      'index.html',
      'First-load total',
      'Worker JS (lazy)',
      'Lazy JS chunks',
      'Lazy (packs, other)',
    ]);
    expect(r.ok).toBe(true);
    expect(r.maxFiles).toBeUndefined();
  });

  it('fails when the first-load total or the lazy chunks are over budget', () => {
    const d = tempDir('web');
    fakeBuild(d, { main: 155_000, css: 35_000, font: 24_000 }); // each row ok, the sum over 220 KB
    const r = checkSizes(d, { fb: false });
    expect(r.rows.find((x) => x.label === 'Main JS')?.ok).toBe(true);
    expect(r.rows.find((x) => x.label === 'First-load total')?.ok).toBe(false);
    expect(r.ok).toBe(false);
    const lazy = tempDir('web');
    fakeBuild(lazy, { lazy: 46_000 });
    expect(checkSizes(lazy, { fb: false }).ok).toBe(false);
  });

  it('fails when a budget is exceeded', () => {
    const d = tempDir('web');
    fakeBuild(d, { main: 175_000 });
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

  it('refuses more than 500 files or more than 1 MB', () => {
    const many = tempDir('fbig');
    fakeBuild(many);
    for (let i = 0; i < 500; i++) writeTree(many, { [`a/${i}.json`]: 1 });
    expect(() => zipFbig({ distDir: many, outDir: tempDir('zip'), sha: 'x', quiet: true })).toThrow(/platform cap of 500/);
    const big = tempDir('fbig');
    fakeBuild(big, { main: 1_100_000 });
    expect(() => zipFbig({ distDir: big, outDir: tempDir('zip'), sha: 'x', quiet: true })).toThrow(/raw bytes/);
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

  it('refuses to run without credentials', async () => {
    const d = tempDir('zip');
    const zip = join(d, 'x-fbig-1-a.zip');
    writeFileSync(zip, 'PK');
    await expect(uploadBundle(zip, 'c', { env: {} })).rejects.toThrow(/FB_APP_ID/);
    await expect(uploadBundle(zip, 'c', { env: { FB_APP_ID: '1' } })).rejects.toThrow(/FB_UPLOAD_TOKEN/);
  });
});
