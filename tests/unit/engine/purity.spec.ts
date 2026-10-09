// Owner: read-only (Phase 2b; was engine)
// 04 §2 / 03 §7: engine/ is pure and deterministic. A static scan of src/engine/*.ts for imports
// outside engine/, DOM and timer globals, wall clocks, Math.random and floating-point generator
// weights. (tests/unit/layering.spec.ts checks the import graph of the whole app.)
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DIR = fileURLToPath(new URL('../../../src/engine/', import.meta.url));
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.ts'));

/** Source without comments, so JSDoc may mention what the code must not use. */
function code(file: string): string {
  return readFileSync(DIR + file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FORBIDDEN: readonly [string, RegExp][] = [
  ['Math.random', /Math\.random/],
  ['Date', /\bDate\b/],
  ['performance', /\bperformance\b/],
  ['timers', /\b(setTimeout|setInterval|requestAnimationFrame|queueMicrotask)\b/],
  ['DOM globals', /\b(window|document|navigator|localStorage|sessionStorage|HTMLElement)\b/],
  ['console', /\bconsole\./],
  ['async I/O', /\b(fetch|XMLHttpRequest|Worker|postMessage)\b/],
];

/** Files on the generator path (03 §7: integer arithmetic only, no floating-point weights). */
const GENERATOR_PATH = ['rng.ts', 'generator.ts', 'solver.ts', 'filters.ts', 'codec.ts', 'grader.ts', 'techniques.ts', 'pigeonhole.ts', 'masks.ts', 'bits.ts', 'geometry.ts'];

describe('engine purity', () => {
  it('has the expected modules', () => {
    for (const f of ['bits.ts', 'rng.ts', 'geometry.ts', 'codec.ts', 'solver.ts', 'solver-oracle.ts', 'generator.ts', 'filters.ts', 'techniques.ts', 'grader.ts', 'hint.ts', 'colors.ts', 'types.ts']) {
      expect(FILES).toContain(f);
    }
  });

  it.each(FILES)('%s imports only engine modules and uses no impure globals', (file) => {
    const src = code(file);
    for (const m of src.matchAll(/\bfrom\s+'([^']+)'/g)) expect(m[1]).toMatch(/^\.\/[a-z0-9-]+$/);
    expect(src).not.toMatch(/\bimport\(/);
    for (const [label, re] of FORBIDDEN) {
      if (re.test(src)) throw new Error(`${file} uses ${label}`);
    }
  });

  it.each(GENERATOR_PATH)('%s uses no floating-point weights (Math.pow/exp/log/sqrt)', (file) => {
    expect(code(file)).not.toMatch(/Math\.(pow|exp|log|sqrt|sin|cos)\b|\*\*/);
  });

  it('nothing in engine/ except the oracle file imports solver-oracle', () => {
    for (const f of FILES) if (f !== 'solver-oracle.ts') expect(code(f)).not.toMatch(/solver-oracle/);
  });
});
