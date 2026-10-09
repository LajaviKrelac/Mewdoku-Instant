// Owner: E
// Catalogue and release checks (phase2b §6.7 step 6, §6.9). `npm run i18n:check` runs in `verify`;
// `npm run build:release` runs it with --release after the release-mode builds.
//   always:    i18n.releaseLocales ⊆ i18n.locales, includes 'en', no duplicates.
//   --release: every release locale other than 'en' has a line in docs/i18n/review-log.md, and the
//              release outputs (dist/release-web, dist/release-fbig) contain no locale chunk
//              (assets/locale-<id>-*.js) outside i18n.releaseLocales.
// F0 baseline: the checks above. E adds the catalogue rules (keys, placeholders, plural categories,
// max lengths) from tests/unit/i18n/catalogs.spec.ts and any further release rule.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cfg, type GameConfig } from '../src/app/config';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Problems with the locale lists themselves. */
export function checkLocaleLists(c: GameConfig = cfg): string[] {
  const out: string[] = [];
  const all = new Set<string>(c.i18n.locales);
  if (all.size !== c.i18n.locales.length) out.push('i18n.locales has duplicates');
  if (new Set(c.i18n.releaseLocales).size !== c.i18n.releaseLocales.length) out.push('i18n.releaseLocales has duplicates');
  if (!c.i18n.releaseLocales.includes('en')) out.push("i18n.releaseLocales must include 'en'");
  for (const id of c.i18n.releaseLocales) if (!all.has(id)) out.push(`release locale ${id} is not in i18n.locales`);
  if (!all.has(c.i18n.fallback)) out.push(`i18n.fallback ${c.i18n.fallback} is not in i18n.locales`);
  return out;
}

/** Release rules: review-log lines and no stray locale chunks in the release outputs. */
export function checkRelease(root: string = ROOT, c: GameConfig = cfg): string[] {
  const out: string[] = [];
  const release = new Set<string>(c.i18n.releaseLocales);
  const logPath = join(root, 'docs/i18n/review-log.md');
  const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
  for (const id of c.i18n.releaseLocales) {
    if (id !== 'en' && !new RegExp(`(^|[^A-Za-z-])${id.replace(/[-]/g, '\\-')}([^A-Za-z-]|$)`, 'm').test(log)) {
      out.push(`release locale ${id} has no line in docs/i18n/review-log.md`);
    }
  }
  for (const dir of ['dist/release-web', 'dist/release-fbig']) {
    const assets = join(root, dir, 'assets');
    if (!existsSync(assets)) continue;
    for (const f of readdirSync(assets)) {
      if (!f.startsWith('locale-') || !f.endsWith('.js')) continue;
      // Hashes may contain '-', so match the longest known id rather than parsing the name.
      const id = c.i18n.locales.filter((l) => f.startsWith(`locale-${l}-`)).sort((x, y) => y.length - x.length)[0];
      if (id === undefined || !release.has(id)) out.push(`${dir}/assets/${f}: locale ${id ?? '?'} is not in i18n.releaseLocales`);
    }
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const problems = [...checkLocaleLists(), ...(process.argv.includes('--release') ? checkRelease() : [])];
  for (const p of problems) console.error(`i18n-check: ${p}`);
  if (problems.length > 0) process.exit(1);
  console.log(`i18n-check: OK (${cfg.i18n.locales.length} locales, release: ${cfg.i18n.releaseLocales.join(', ')})`);
}
