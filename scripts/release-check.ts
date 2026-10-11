// Owner: lead (Phase 2e I-4; docs/phase2e/spec.md §10.5 #1, §10.6 #3 and #6). What a built bundle must never carry.
//   Every dist (§10.6 #3, §10.5 #1): no test data — the e2e FB signing secret, the dev server's admin key, the
//     synthetic load-test pool, the names of the test fixtures (the FB stub, the fake ranking server, G4's contract
//     fixture files) — and nothing shaped like a private key or a cloud access key.
//   A RELEASE dist (dist/release-web, dist/release-fbig; §10.6 #6, §10.5 #1): additionally no e2e test hooks
//     (window.__mewdoku), no call to the dev-only server routes (/dev/clock, /dev/cron, /dev/config), no e2e placement
//     or leaderboard ids (e2e-*, e2e_*), and no URL on a staging, workers.dev or local host — so a release build can
//     never talk to the staging database (its fb:synthetic load-test players and private testers) or a dev server.
//   Every dist but a preview one (lead, preview link 2026-10-11; scripts/preview-mode.ts): none of the preview build's
//     own code — its strings (preview/strings.ts PREVIEW_MARKERS: "Preview ad", "Preview purchase", "Preview: sample",
//     the sample server's reserved origin, its storage keys) and its module names (the sample server, the mock store) —
//     so the mock ads, the mock store and the sample ranking can never reach the web, FB or release builds.
// scripts/size-check.ts runs both checks on every dist it measures and zip-fbig.ts before it zips; a problem fails
// either (exit 1). Text files only (.js, .css, .html, .json, .webmanifest, .txt); fonts and images are skipped.
//   tsx scripts/release-check.ts [distDir …]      (default: every existing dist/*)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PREVIEW_MARKERS as PREVIEW_STRINGS } from '../preview/strings.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'server/test/contract/fixtures');

export interface BundleFile {
  /** posix, relative to the dist dir */
  readonly path: string;
  readonly text: string;
}

/** Test data that no bundle may contain (§10.6 #3, §10.5 #1): fixed markers. */
export const TEST_DATA_MARKERS: readonly string[] = [
  'e2e-fb-app-secret', // the e2e stub's FB signing secret (playwright.config.ts, tests/e2e/helpers/rank-players.ts)
  'mewdoku-dev-admin-key', // the dev server's ADMIN_KEY (server/dev/serve.ts)
  'fb:synthetic', // the load-test pool (server/scripts/load.ts)
  'fbinstant-stub', // tests/fixtures/fbinstant-stub.js
  'ladder-fake', // tests/fixtures/ladder-fake.ts
  'kitty-reference', // tests/fixtures/kitty-reference.ts
  'rank-players', // tests/e2e/helpers/rank-players.ts
];

/** The contract fixture file names (G4's server/test/contract/fixtures/*.json): no bundle names them. */
export function fixtureNames(dir = FIXTURES): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.endsWith('.json'));
}

/** Shaped like a secret: a PEM private key, an AWS access key id, a Stripe-style live key, a GitHub token. */
const SECRET_SHAPES: readonly RegExp[] = [
  /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}\b/,
  /\bgh[pousr]_[0-9A-Za-z]{30,}\b/,
];

/** Release-only markers: the e2e hooks and the dev-only server routes. */
export const RELEASE_MARKERS: readonly string[] = ['__mewdoku', '/dev/clock', '/dev/cron', '/dev/config'];

/**
 * The preview build's own code (preview/): its strings and storage keys (preview/strings.ts) and the names its lazy
 * module and stylesheet classes carry. Only a preview dist (dist/preview, dist/preview-e2e) may contain them.
 */
export const PREVIEW_MARKERS: readonly string[] = [...PREVIEW_STRINGS, 'sample-server', 'mwp-ribbon', '__PREVIEW_BUILD__'];

/** A preview dist: dist/preview, dist/preview-e2e (or any dir whose name starts with "preview"). */
export function isPreviewDir(distDir: string): boolean {
  return /^preview/.test(basename(resolve(distDir)));
}

/** Problems of every non-preview bundle: the preview build's code. */
export function previewProblems(files: readonly BundleFile[]): string[] {
  const out: string[] = [];
  for (const f of files) {
    for (const m of PREVIEW_MARKERS) if (f.text.includes(m)) out.push(`${f.path}: "${m}" (the preview link's code) outside a preview build`);
  }
  return out;
}

/** e2e placement / leaderboard ids (the fbig-e2e build's VITE_FB_* values): e2e-interstitial, e2e_event_… */
const E2E_IDS = /["'`]e2e[-_][A-Za-z0-9_-]+["'`]/;

/** A URL on a host a release must never call: staging, *.workers.dev, or a local / loopback host (§10.6 #6). */
const URL_RE = /\bhttps?:\/\/([^\s"'`/?#)\\]+)/g;
export function forbiddenReleaseHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, '');
  return (
    h.endsWith('.workers.dev') ||
    h === 'workers.dev' ||
    h.includes('staging') ||
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    /^127\.\d+\.\d+\.\d+$/.test(h) ||
    h === '0.0.0.0' ||
    h === '[::1]'
  );
}

/** Problems of any bundle (every dist): test data and secret-shaped strings. */
export function testDataProblems(files: readonly BundleFile[], fixtures: readonly string[] = fixtureNames()): string[] {
  const out: string[] = [];
  for (const f of files) {
    for (const m of [...TEST_DATA_MARKERS, ...fixtures]) if (f.text.includes(m)) out.push(`${f.path}: test data "${m}"`);
    for (const re of SECRET_SHAPES) if (re.test(f.text)) out.push(`${f.path}: a secret-shaped string (${re.source.slice(0, 24)}…)`);
  }
  return out;
}

/** Problems of a RELEASE bundle on top of testDataProblems: e2e hooks, dev routes, e2e ids, staging / local hosts. */
export function releaseProblems(files: readonly BundleFile[]): string[] {
  const out: string[] = [];
  for (const f of files) {
    for (const m of RELEASE_MARKERS) if (f.text.includes(m)) out.push(`${f.path}: "${m}" (e2e hooks or a dev-only route) in a release build`);
    const id = E2E_IDS.exec(f.text);
    if (id) out.push(`${f.path}: an e2e placement / leaderboard id ${id[0]} in a release build`);
    const hosts = new Set<string>();
    for (const m of f.text.matchAll(URL_RE)) if (forbiddenReleaseHost(m[1] as string)) hosts.add(m[1] as string);
    for (const h of hosts) {
      out.push(`${f.path}: a URL on ${h} in a release build (VITE_LADDER_URL must be the production ranking origin, never staging, workers.dev or a local host)`);
    }
  }
  return out;
}

const TEXT = /\.(?:js|mjs|css|html|json|webmanifest|txt)$/i;

/** The text files of a dist dir (source maps left out: players never download them, and zip-fbig refuses them). */
export function bundleFiles(distDir: string): BundleFile[] {
  const out: BundleFile[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (TEXT.test(name)) out.push({ path: relative(distDir, full).split(sep).join('/'), text: readFileSync(full, 'utf8') });
    }
  };
  walk(distDir);
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** A release dist: dist/release-web, dist/release-fbig (or any dir whose name starts with "release"). */
export function isReleaseDir(distDir: string): boolean {
  return /^release/.test(basename(resolve(distDir)));
}

/**
 * Every problem of a dist dir: test data always, the release rules for a release dir (or `release: true`), and the
 * preview build's code anywhere but a preview dir (or `preview: true`).
 */
export function checkBundle(distDir: string, opts: { release?: boolean; preview?: boolean } = {}): string[] {
  const files = bundleFiles(distDir);
  const release = opts.release ?? isReleaseDir(distDir);
  const preview = opts.preview ?? isPreviewDir(distDir);
  return [...testDataProblems(files), ...(release ? releaseProblems(files) : []), ...(preview ? [] : previewProblems(files))];
}

export function main(argv: readonly string[]): void {
  const given = argv.filter((a) => !a.startsWith('--'));
  const dist = join(ROOT, 'dist');
  const dirs = given.length > 0 ? given.map((d) => resolve(d)) : existsSync(dist) ? readdirSync(dist).map((n) => join(dist, n)).filter((d) => statSync(d).isDirectory()) : [];
  if (dirs.length === 0) {
    console.error('release-check: no dist/* found; run a build first');
    process.exitCode = 1;
    return;
  }
  for (const d of dirs) {
    const problems = checkBundle(d);
    const name = relative(ROOT, d) || d;
    if (problems.length === 0) console.log(`release-check: ${name}: ok${isReleaseDir(d) ? ' (release rules)' : ''}${isPreviewDir(d) ? ' (preview build)' : ''}`);
    else {
      process.exitCode = 1;
      for (const p of problems) console.error(`release-check: ${name}: ${p}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
