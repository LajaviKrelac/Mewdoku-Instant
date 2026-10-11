// Owner: lead (Phase 2e I-4). scripts/release-check.ts (docs/phase2e/spec.md §10.5 #1, §10.6 #3 and #6): no test data
// in any bundle; a release bundle has no e2e hooks, dev routes, e2e ids or staging / workers.dev / local URLs; and
// size-check / zip-fbig fail on either, against fake dist trees (no network, no build).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkBundle,
  fixtureNames,
  forbiddenReleaseHost,
  isPreviewDir,
  isReleaseDir,
  PREVIEW_MARKERS,
  previewProblems,
  releaseProblems,
  testDataProblems,
  TEST_DATA_MARKERS,
} from '../../../scripts/release-check';
import { zipFbig } from '../../../scripts/zip-fbig';

const dirs: string[] = [];
function tree(name: string, files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mewdoku-rc-'));
  dirs.push(root);
  const d = join(root, name);
  for (const [path, text] of Object.entries(files)) {
    const full = join(d, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const HTML = '<!doctype html><script type="module" src="./assets/index-abc.js"></script>';
const CLEAN_JS = 'const u="https://rank.example.com";fetch(`${u}/v1/health`);document.createElementNS("http://www.w3.org/2000/svg","svg");';
const base = (js: string): Record<string, string> => ({ 'index.html': HTML, 'fbapp-config.json': '{"instant_games":{}}', 'assets/index-abc.js': js });

describe('release-check (spec §10.5 #1, §10.6 #3, #6)', () => {
  it('a clean bundle passes, release or not', () => {
    expect(checkBundle(tree('release-fbig', base(CLEAN_JS)))).toEqual([]);
    expect(checkBundle(tree('web', base(CLEAN_JS)))).toEqual([]);
  });

  it('test data fails in EVERY bundle: the e2e secret, the dev admin key, the synthetic pool, fixture names, secret shapes', () => {
    expect(TEST_DATA_MARKERS).toEqual(expect.arrayContaining(['e2e-fb-app-secret', 'mewdoku-dev-admin-key', 'fb:synthetic']));
    expect(fixtureNames()).toEqual(expect.arrayContaining(['session.fb.json', 'bracket.full.json']));
    for (const bad of ['"e2e-fb-app-secret"', '"mewdoku-dev-admin-key-0123"', '"fb:synthetic"', '"session.fb.json"', 'import "./fbinstant-stub.js"']) {
      const p = checkBundle(tree('e2e', base(CLEAN_JS + bad)));
      expect(p.length, bad).toBeGreaterThan(0);
    }
    expect(testDataProblems([{ path: 'a.js', text: '-----BEGIN PRIVATE KEY-----' }])).toHaveLength(1);
    expect(testDataProblems([{ path: 'a.js', text: 'k="AKIAABCDEFGHIJKLMNOP"' }])).toHaveLength(1);
  });

  it('a release bundle refuses a ranking URL on staging, workers.dev or a local host (the staging database can never be what released players see)', () => {
    for (const url of ['https://mewdoku-rank-staging.example.workers.dev', 'https://rank.workers.dev', 'https://staging.rank.example.com', 'http://127.0.0.1:8787', 'http://localhost:8787', 'http://rank.local']) {
      const js = `const u=${JSON.stringify(url)};`;
      expect(releaseProblems([{ path: 'assets/index-abc.js', text: js }]).length, url).toBe(1);
      expect(checkBundle(tree('release-web', base(js))).length, url).toBeGreaterThan(0);
      // a non-release (e2e, preview) bundle may point at the local or staging server
      expect(checkBundle(tree('fbig', base(js))), url).toEqual([]);
    }
    expect(forbiddenReleaseHost('rank.mewdoku.example')).toBe(false);
    expect(forbiddenReleaseHost('www.w3.org')).toBe(false);
  });

  it('a release bundle refuses the e2e hooks, the dev-only routes and e2e placement / leaderboard ids', () => {
    for (const bad of ['window.__mewdoku=x', 'fetch(u+"/dev/clock")', 'fetch(u+"/dev/cron")', 'fetch(u+"/dev/config")', 'const p="e2e-interstitial"', 'const l={a:"e2e_event_snow_paws_2026"}']) {
      expect(checkBundle(tree('release-fbig', base(CLEAN_JS + bad))).length, bad).toBeGreaterThan(0);
    }
    expect(isReleaseDir('/x/dist/release-web')).toBe(true);
    expect(isReleaseDir('/x/dist/fbig-e2e')).toBe(false);
  });

  it('zip-fbig refuses a release zip with a staging ranking URL and any zip with test data; a preview zip may point at staging', () => {
    const staging = `const u="https://mewdoku-rank-staging.example.workers.dev";`;
    const rel = tree('release-fbig', base(staging));
    expect(() => zipFbig({ distDir: rel, outDir: join(dirname(rel), 'zip'), sha: 'x', quiet: true })).toThrow(/workers\.dev/);
    const prev = tree('fbig', base(staging));
    expect(() => zipFbig({ release: false, distDir: prev, outDir: join(dirname(prev), 'zip'), sha: 'x', quiet: true })).not.toThrow();
    const secret = tree('fbig', base(CLEAN_JS + '"e2e-fb-app-secret"'));
    expect(() => zipFbig({ release: false, distDir: secret, outDir: join(dirname(secret), 'zip'), sha: 'x', quiet: true })).toThrow(/test data/);
  });
});

describe('release-check: the preview link never reaches another build (lead, 2026-10-11; scripts/preview-mode.ts)', () => {
  const previewJs = [
    'const t="Preview ad · banner";',
    'const s="Preview purchase — nothing is charged";',
    'const n="Preview: sample players";',
    'fetch("https://sample-ranking.preview.invalid/v1/config");',
    'localStorage.getItem("mewdoku.preview.ui.v1");',
    'import("./sample-server-abc.js");',
    'el.className="mwp-ribbon";',
  ];

  it('every preview marker fails a web, FB, e2e or release dist', () => {
    expect(PREVIEW_MARKERS).toEqual(expect.arrayContaining(['Preview ad', 'Preview purchase', 'Preview: sample', 'preview.invalid', 'mewdoku.preview.', 'sample-server']));
    for (const name of ['web', 'fbig', 'e2e', 'fbig-e2e', 'release-web', 'release-fbig']) {
      for (const bad of previewJs) {
        const p = checkBundle(tree(name, base(CLEAN_JS + bad)));
        expect(p.some((x) => x.includes("the preview link's code")), `${name}: ${bad}`).toBe(true);
      }
    }
    expect(previewProblems([{ path: 'a.js', text: CLEAN_JS }])).toEqual([]);
  });

  it('a preview dist (dist/preview, dist/preview-e2e) may carry them; test data still fails there', () => {
    expect(isPreviewDir('dist/preview')).toBe(true);
    expect(isPreviewDir('dist/preview-e2e')).toBe(true);
    expect(isPreviewDir('dist/web')).toBe(false);
    expect(isReleaseDir('dist/preview')).toBe(false);
    expect(checkBundle(tree('preview', base(CLEAN_JS + previewJs.join(''))))).toEqual([]);
    expect(checkBundle(tree('preview-e2e', base(CLEAN_JS + previewJs.join('') + 'window.__mewdoku={};')))).toEqual([]);
    expect(checkBundle(tree('preview', base(CLEAN_JS + '"e2e-fb-app-secret"'))).length).toBeGreaterThan(0);
  });
});

