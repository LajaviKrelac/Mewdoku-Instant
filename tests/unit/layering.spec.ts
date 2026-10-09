// Owner: C. Import-direction rules (04 §2, CONTRACTS §2, phase2b CONTRACTS §3), enforced by scanning import specifiers:
// static imports / re-exports, side-effect imports, dynamic import(), new URL(…, import.meta.url)
// and import.meta.glob patterns. Also checks that engine/ and game/ stay pure (no DOM, timers,
// randomness or I/O globals) and that nothing in the app bundle imports engine/solver-oracle.ts.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(ROOT, 'src');
const SCRIPTS = join(ROOT, 'scripts');

type Layer = 'config' | 'i18n' | 'engine' | 'game' | 'platform' | 'ui' | 'audio' | 'workers' | 'app' | 'main' | 'data' | 'styles' | 'assets' | 'env';

interface Edge {
  readonly from: string; // path relative to the repo root, '/' separators
  readonly spec: string;
  readonly target: string | null; // resolved repo-relative path, '@platform', or null (bare / node:)
  readonly typeOnly: boolean;
  /** import(…) (also `typeof import(…)` in a type position): never part of the importer's chunk. */
  readonly dynamic?: boolean;
}

// ─────────────────────────────── scanning ───────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|mts)$/.test(name)) out.push(p);
  }
  return out;
}

const posix = (p: string): string => p.split(sep).join('/');

/**
 * Removes comments, and (when `blankStrings`) the contents of string literals, keeping line breaks.
 * Single/double-quoted strings end at a newline so a stray quote in a regex literal cannot swallow
 * the rest of the file.
 */
export function stripSource(src: string, blankStrings: boolean): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i] as string;
    const next = src[i + 1];
    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, '');
      i = stop;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== ch) {
        if (src[j] === '\\') j++;
        else if (src[j] === '\n' && ch !== '`') break;
        j++;
      }
      const body = src.slice(i + 1, Math.min(j, src.length));
      out += ch + (blankStrings ? body.replace(/[^\n]/g, ' ') : body) + (src[j] === ch ? ch : '');
      i = src[j] === ch ? j + 1 : j;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function resolveSpec(fromAbs: string, spec: string): string | null {
  if (spec === '@platform') return '@platform';
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromAbs), spec.replace(/\?.*$/, ''));
  for (const cand of [base, `${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return posix(relative(ROOT, cand));
  }
  return posix(relative(ROOT, base)); // globs and not-yet-generated files: keep the path for layering
}

export function scanImports(fileAbs: string): Edge[] {
  const code = stripSource(readFileSync(fileAbs, 'utf8'), false);
  const from = posix(relative(ROOT, fileAbs));
  const edges: Edge[] = [];
  const add = (spec: string, typeOnly: boolean, dynamic = false): void => {
    edges.push({ from, spec, target: resolveSpec(fileAbs, spec), typeOnly, dynamic });
  };
  const staticRe = /^[ \t]*(import|export)\s+(type\s+)?(?:[^;'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
  for (let m = staticRe.exec(code); m; m = staticRe.exec(code)) {
    const kw = m[1] as string;
    const head = m[0];
    if (kw === 'export' && !/\sfrom\s/.test(head)) continue; // `export const x = '…'`
    add(m[3] as string, !!m[2]);
  }
  for (const re of [/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g, /new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g]) {
    for (let m = re.exec(code); m; m = re.exec(code)) add(m[1] as string, false, true);
  }
  const globRe = /import\.meta\.glob(?:<[^>]*>)?\(\s*(\[[^\]]*\]|['"][^'"]+['"])/g;
  for (let m = globRe.exec(code); m; m = globRe.exec(code)) {
    for (const s of (m[1] as string).match(/['"][^'"]+['"]/g) ?? []) add(s.slice(1, -1).replace(/^!/, ''), false);
  }
  return edges;
}

function layerOf(repoPath: string): Layer | null {
  if (!repoPath.startsWith('src/')) return null;
  const p = repoPath.slice(4);
  if (p === 'app/config.ts') return 'config';
  if (p === 'main.ts') return 'main';
  if (p === 'env.d.ts') return 'env';
  const top = p.split('/')[0] as string;
  const map: Record<string, Layer> = {
    i18n: 'i18n',
    engine: 'engine',
    game: 'game',
    platform: 'platform',
    ui: 'ui',
    audio: 'audio',
    workers: 'workers',
    app: 'app',
    data: 'data',
    styles: 'styles',
    assets: 'assets',
  };
  return map[top] ?? null;
}

// ─────────────────────────────── rules (CONTRACTS §2) ───────────────────────────────

const ORACLE = 'src/engine/solver-oracle.ts';

/** null = allowed, otherwise the reason. */
/** Build-generated modules (phase2b F0, lead): only i18n/ may import the locale loader map. */
const VIRTUAL_MODULES: Readonly<Record<string, Layer>> = { 'virtual:mewdoku-locales': 'i18n' };

function checkSrcEdge(e: Edge): string | null {
  const from = layerOf(e.from) as Layer;
  if (e.target === null) {
    const owner = VIRTUAL_MODULES[e.spec];
    if (owner !== undefined) return from === owner ? null : `${e.spec} is imported only by ${owner}/`;
    return e.typeOnly ? null : 'no runtime dependencies in src/ (bare or node: import)';
  }
  if (e.target === ORACLE) return 'engine/solver-oracle.ts is for tests only';
  if (e.target === '@platform') return from === 'main' ? null : "only main.ts imports '@platform'";
  const to = layerOf(e.target);
  if (to === null) return 'import outside src/';
  const isGameTypes = e.target === 'src/game/types.ts';
  switch (from) {
    case 'config':
    case 'env':
      return 'leaf module: imports nothing';
    case 'i18n':
      // phase2b F0 (lead): i18n may read app/config.ts (locale lists, rtl, timeouts); still a leaf otherwise.
      return ['i18n', 'config'].includes(to) ? null : 'i18n/ imports only i18n/ and app/config.ts';
    case 'engine':
      return to === 'engine' ? null : 'engine/ imports only engine/';
    case 'game':
      if (['engine', 'game', 'config', 'data'].includes(to)) return null;
      // phase2b F0 (lead): EventDef.nameKey is an I18nKey, so game/ may import i18n TYPES (no values).
      return to === 'i18n' && e.typeOnly ? null : 'game/ imports only engine/, game/, app/config.ts, data/ (and i18n types)';
    case 'platform':
      if (['platform', 'config', 'i18n'].includes(to)) return null;
      return isGameTypes && e.typeOnly ? null : 'platform/ imports platform/, app/config.ts, i18n/ and game/types.ts (types only)';
    case 'ui':
    case 'audio':
      if (['ui', 'audio', 'i18n', 'config', 'engine', 'game', 'styles', 'assets'].includes(to)) return null;
      return to === 'platform' && e.typeOnly ? null : 'ui/ and audio/ get props and callbacks: no platform values, no app/ (but config)';
    case 'workers':
      return ['engine', 'workers', 'config'].includes(to) ? null : 'workers/ import only engine/, workers/, app/config.ts';
    case 'app':
    case 'main':
      return null;
    default:
      return `unexpected importer layer ${from}`;
  }
}

function checkScriptEdge(e: Edge): string | null {
  if (e.target === null) return null; // node: builtins and dev dependencies are fine in tooling
  if (e.target === '@platform') return 'scripts never import the platform';
  if (e.target.startsWith('scripts/')) return null;
  const ok =
    e.target.startsWith('src/engine/') ||
    e.target.startsWith('src/game/') ||
    e.target === 'src/app/config.ts' ||
    e.target === 'src/ui/art/palette.ts' ||
    // phase2b F0 (lead): i18n-check reads the catalogues; palette-check and verify-levels read the event data.
    e.target.startsWith('src/i18n/') ||
    e.target.startsWith('src/data/');
  if (e.target === ORACLE) return null; // verify-levels may cross-check with the oracle
  return ok ? null : 'scripts import src/engine, src/game, src/i18n, src/data, src/app/config.ts, src/ui/art/palette.ts';
}

const srcFiles = walk(SRC);
const scriptFiles = walk(SCRIPTS);

describe('layering (04 §2)', () => {
  it('the scanner sees the expected edges', () => {
    const edges = srcFiles.flatMap(scanImports);
    const has = (from: string, target: string): boolean => edges.some((e) => e.from === from && e.target === target);
    expect(has('src/main.ts', '@platform')).toBe(true);
    expect(has('src/app/boot.ts', 'src/app/session.ts')).toBe(true);
    expect(edges.some((e) => e.from === 'src/workers/engine-client.ts' && e.spec === './engine.worker.ts' && !e.typeOnly)).toBe(true);
    expect(edges.some((e) => e.from === 'src/app/session.ts' && e.typeOnly)).toBe(true);
    expect(srcFiles.length).toBeGreaterThan(50);
  });

  it('src/ follows the import-direction table', () => {
    const violations = srcFiles
      .flatMap(scanImports)
      .map((e) => ({ e, why: checkSrcEdge(e) }))
      .filter((v) => v.why !== null)
      .map(({ e, why }) => `${e.from} → ${e.spec}${e.typeOnly ? ' (type)' : ''}: ${why}`);
    expect(violations).toEqual([]);
  });

  it('scripts/ import only the shared pure modules', () => {
    const violations = scriptFiles
      .flatMap(scanImports)
      .map((e) => ({ e, why: checkScriptEdge(e) }))
      .filter((v) => v.why !== null)
      .map(({ e, why }) => `${e.from} → ${e.spec}: ${why}`);
    expect(violations).toEqual([]);
  });

  it('engine/ and game/ stay pure: no DOM, timers, randomness or I/O globals', () => {
    const banned: [RegExp, string][] = [
      [/\bMath\.random\b/, 'Math.random (use engine/rng)'],
      [/\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/, 'timers (inject a clock)'],
      [/\b(document|window|navigator|localStorage|sessionStorage)\s*\./, 'DOM / browser globals'],
      [/\bDate\.now\s*\(/, 'Date.now (pass the time in)'],
      [/\bperformance\.now\s*\(/, 'performance.now (pass the time in)'],
      [/\bfetch\s*\(/, 'fetch (inject the I/O)'],
      [/\bnew\s+Worker\s*\(/, 'Worker (app/workers only)'],
    ];
    const pure = srcFiles.filter((f) => /^src\/(engine|game)\//.test(posix(relative(ROOT, f))));
    expect(pure.length).toBeGreaterThan(10);
    const violations: string[] = [];
    for (const f of pure) {
      const code = stripSource(readFileSync(f, 'utf8'), true);
      for (const [re, what] of banned) if (re.test(code)) violations.push(`${posix(relative(ROOT, f))}: ${what}`);
    }
    expect(violations).toEqual([]);
  });

  it('lazy chunk entries are never imported statically from src/ (CONTRACTS-2b §2, §5.5)', () => {
    // One dynamic import each; a static value import would pull the chunk into the importer's bundle.
    const LAZY = ['src/app/overlay-chunk.ts', 'src/app/events-chunk.ts', 'src/app/social-flows.ts', 'src/platform/fb/fb-social.ts', 'src/audio/sfx.ts'];
    const bad = srcFiles
      .flatMap(scanImports)
      .filter((e) => e.target !== null && LAZY.includes(e.target) && !e.dynamic && !e.typeOnly && !LAZY.includes(e.from))
      .map((e) => `${e.from} → ${e.spec}`);
    expect(bad).toEqual([]);
  });

  it('the checker itself flags the forbidden directions', () => {
    const edge = (from: string, target: string | null, typeOnly = false): Edge => ({ from, spec: target ?? 'x', target, typeOnly });
    expect(checkSrcEdge(edge('src/engine/hint.ts', 'src/game/types.ts', true))).not.toBeNull();
    expect(checkSrcEdge(edge('src/game/reducer.ts', 'src/app/store.ts'))).not.toBeNull();
    // Lead decision: game/level-assets.ts wires the shipped data files (pack-000 import, ?url globs).
    expect(checkSrcEdge(edge('src/game/level-assets.ts', 'src/data/levels/pack-000.json'))).toBeNull();
    expect(checkSrcEdge(edge('src/ui/board/board-view.ts', 'src/data/levels/pack-000.json'))).not.toBeNull();
    expect(checkSrcEdge(edge('src/engine/codec.ts', 'src/data/levels/pack-000.json'))).not.toBeNull();
    expect(checkSrcEdge(edge('src/game/reducer.ts', 'src/platform/types.ts', true))).not.toBeNull();
    expect(checkSrcEdge(edge('src/platform/web/index.ts', 'src/game/save.ts'))).not.toBeNull();
    expect(checkSrcEdge(edge('src/platform/web/index.ts', 'src/game/types.ts', true))).toBeNull();
    expect(checkSrcEdge(edge('src/ui/board/board-view.ts', 'src/platform/web/index.ts'))).not.toBeNull();
    expect(checkSrcEdge(edge('src/ui/board/board-view.ts', 'src/app/store.ts', true))).not.toBeNull();
    expect(checkSrcEdge(edge('src/ui/board/board-view.ts', 'src/app/config.ts'))).toBeNull();
    expect(checkSrcEdge(edge('src/workers/rpc.ts', 'src/ui/dom.ts'))).not.toBeNull();
    expect(checkSrcEdge(edge('src/app/session.ts', ORACLE))).not.toBeNull();
    expect(checkSrcEdge(edge('src/app/boot.ts', '@platform'))).not.toBeNull();
    expect(checkSrcEdge(edge('src/app/config.ts', 'src/i18n/index.ts'))).not.toBeNull();
    // phase2b F0 widenings (lead): game → i18n types only; i18n → app/config.ts; the locale loader map.
    expect(checkSrcEdge(edge('src/game/events.ts', 'src/i18n/index.ts', true))).toBeNull();
    expect(checkSrcEdge(edge('src/game/events.ts', 'src/i18n/index.ts'))).not.toBeNull();
    expect(checkSrcEdge(edge('src/i18n/index.ts', 'src/app/config.ts'))).toBeNull();
    expect(checkSrcEdge(edge('src/i18n/index.ts', 'src/app/store.ts'))).not.toBeNull();
    expect(checkSrcEdge({ from: 'src/i18n/build-locales.ts', spec: 'virtual:mewdoku-locales', target: null, typeOnly: false })).toBeNull();
    expect(checkSrcEdge({ from: 'src/app/boot.ts', spec: 'virtual:mewdoku-locales', target: null, typeOnly: false })).not.toBeNull();
    expect(checkSrcEdge(edge('src/app/boot.ts', null))).not.toBeNull();
    expect(stripSource("const a = '/*'; // x\nconst b = 1; /* y */", true)).toBe("const a = '  '; \nconst b = 1; ");
  });
});
