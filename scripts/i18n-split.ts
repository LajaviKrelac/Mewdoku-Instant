// Owner: lead (Phase 2e I-4, the first load). Which English strings the FIRST LOAD needs.
// The English catalogue is in two runtime tables since I-4: src/i18n/en-first.ts (bundled with the first load) and
// src/i18n/en-lazy.ts (a lazy chunk: every lazy entry that shows text imports it, so it is registered before any of its
// views exists). This module finds, by a static walk of the source (static imports only; dynamic import() is where a
// lazy chunk starts), the files of the first load (src/main.ts, both platform entries and the tutorial coach's chunk,
// which index.html preloads), and every catalogue key their code names: a quoted key, or every key under the prefix of
// a template literal (`shop.product.${id}.name`), or a key list of src/i18n/en-first.ts (COLOR_KEYS …). The guard test
// (tests/unit/i18n/first-load-strings.spec.ts) fails when a first-load file names a key that is only in en-lazy.ts, or
// when a lazy entry that shows such a key does not import en-lazy.ts.
//   tsx scripts/i18n-split.ts            the report (first-load files, keys by table, offenders)
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const posix = (p: string): string => relative(ROOT, p).split(sep).join('/');

/** The roots of the first load: the entry, both platform entries (the build picks one) and the preloaded coach chunk. */
export const FIRST_LOAD_ROOTS = ['src/main.ts', 'src/platform/web/index.ts', 'src/platform/fb/index.ts', 'src/app/coach-chunk.ts'] as const;
/** The catalogue modules themselves (their keys are not references). */
const CATALOGUE = /^src\/i18n\/(en|en-first|en-lazy|en\/[^/]+|locales\/[^/]+|meta)\.ts$/;

/** Strips comments (keeps strings) so commented-out code names nothing. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

function resolveSpec(from: string, spec: string): string | null {
  if (spec === '@platform') return null; // both platform entries are roots
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec);
  for (const f of [base, `${base}.ts`, `${base}/index.ts`]) if (existsSync(f) && /\.(ts|json)$/.test(f)) return f;
  return null;
}

/** Static imports and re-exports (not `import type`, not dynamic import()) of a file. */
export function staticImports(file: string): string[] {
  const src = stripComments(readFileSync(file, 'utf8'));
  const out: string[] = [];
  const re = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
  for (const m of src.matchAll(re)) {
    const next = resolveSpec(file, m[1] as string);
    if (next) out.push(next);
  }
  return out;
}

/** Targets of the dynamic import()s of a file (the lazy entries it starts). */
export function dynamicImports(file: string): string[] {
  const src = stripComments(readFileSync(file, 'utf8'));
  const out: string[] = [];
  for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const next = resolveSpec(file, m[1] as string);
    if (next) out.push(next);
  }
  return out;
}

/** Every file reachable from `roots` by static imports (absolute paths). */
export function staticGraph(roots: readonly string[], stop: ReadonlySet<string> = new Set()): Set<string> {
  const seen = new Set<string>();
  const walk = (f: string): void => {
    if (seen.has(f) || stop.has(f)) return;
    seen.add(f);
    if (f.endsWith('.json')) return;
    for (const n of staticImports(f)) walk(n);
  };
  for (const r of roots) walk(resolve(ROOT, r));
  return seen;
}

/** The first-load files. */
export function firstLoadFiles(): Set<string> {
  return staticGraph(FIRST_LOAD_ROOTS);
}

/** The keys a set of files names (quoted keys, template prefixes, key-list constants). */
export function keysNamedBy(files: Iterable<string>, allKeys: readonly string[]): Set<string> {
  const keys = new Set(allKeys);
  const named = new Set<string>();
  for (const f of files) {
    if (CATALOGUE.test(posix(f))) continue;
    const src = f.endsWith('.json') ? readFileSync(f, 'utf8') : stripComments(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/["'`]([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_-]+)+)["'`]/g)) {
      const k = m[1] as string;
      if (keys.has(k)) named.add(k);
      // a plural base: tn('ladder.players', n) names .one / .other (and the forms other languages add)
      for (const form of ['one', 'other']) if (keys.has(`${k}.${form}`)) named.add(`${k}.${form}`);
    }
    for (const m of src.matchAll(/`([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_-]*)*\.?)\$\{/g)) {
      const prefix = m[1] as string;
      if (prefix.length < 3 || !prefix.includes('.')) continue;
      for (const k of keys) if (k.startsWith(prefix)) named.add(k);
    }
  }
  return named;
}

/** The lazy entries of the app: every dynamic import() target reachable from the first load or from another entry. */
export function lazyEntries(first: ReadonlySet<string>): string[] {
  const entries = new Set<string>();
  const queue = [...first];
  const seen = new Set<string>(first);
  while (queue.length) {
    const f = queue.shift() as string;
    if (f.endsWith('.json')) continue;
    for (const d of dynamicImports(f)) {
      if (first.has(d) || entries.has(d)) continue;
      entries.add(d);
      for (const g of staticGraph([d], first)) {
        if (seen.has(g)) continue;
        seen.add(g);
        queue.push(g);
      }
    }
  }
  return [...entries].filter((e) => !/\/(locales\/|workers\/engine\.worker)/.test(e)).sort();
}

export interface SplitReport {
  readonly first: readonly string[];
  /** First-load keys that are only in the lazy table (must be none). */
  readonly firstNamesLazy: readonly string[];
  /** Lazy entries that name a lazy key but do not import src/i18n/en-lazy.ts (must be none). */
  readonly entriesWithoutLazy: readonly { entry: string; keys: readonly string[] }[];
}

export async function splitReport(): Promise<SplitReport> {
  const { enFirst } = await import(pathToFileURL(resolve(ROOT, 'src/i18n/en-first.ts')).href);
  const { enLazyTable } = await import(pathToFileURL(resolve(ROOT, 'src/i18n/en/lazy.ts')).href);
  const lazyKeys = Object.keys(enLazyTable as Record<string, string>);
  const all = [...Object.keys(enFirst as Record<string, string>), ...lazyKeys];
  const first = firstLoadFiles();
  const lazySet = new Set(lazyKeys);
  const firstNamesLazy = [...keysNamedBy(first, all)].filter((k) => lazySet.has(k)).sort();
  const enLazyFile = resolve(ROOT, 'src/i18n/en-lazy.ts');
  const entriesWithoutLazy: { entry: string; keys: string[] }[] = [];
  for (const entry of lazyEntries(first)) {
    const graph = staticGraph([entry], first);
    const keys = [...keysNamedBy(graph, all)].filter((k) => lazySet.has(k));
    if (keys.length > 0 && !graph.has(enLazyFile)) entriesWithoutLazy.push({ entry: posix(entry), keys: keys.sort().slice(0, 8) });
  }
  return { first: [...first].map(posix).sort(), firstNamesLazy, entriesWithoutLazy };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await splitReport();
  console.log(`first-load files: ${r.first.length}`);
  console.log(`first-load files naming a lazy-only key: ${r.firstNamesLazy.length ? r.firstNamesLazy.join(', ') : 'none'}`);
  for (const e of r.entriesWithoutLazy) console.log(`lazy entry without en-lazy.ts: ${e.entry} (${e.keys.join(', ')})`);
  if (r.firstNamesLazy.length || r.entriesWithoutLazy.length) process.exitCode = 1;
}
