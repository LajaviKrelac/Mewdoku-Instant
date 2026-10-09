// Owner: read-only (Phase 2b; was engine)
// 03 §11.3 determinism golden: generate() output for 20 fixed specs (N = 5–12) must stay
// byte-identical. An intentional generator change bumps cfg.gen.version and regenerates the file:
//   UPDATE_GOLDEN=1 npx vitest run --project unit tests/unit/engine/golden.spec.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cfg } from '../../../src/app/config';
import { generate } from '../../../src/engine/generator';
import type { GenResult, GenSpec } from '../../../src/engine/types';
import { GOLDEN_SPECS } from './golden-specs';

interface GoldenFile {
  generator: string;
  note: string;
  cases: { spec: GenSpec; result: GenResult }[];
}

const FILE = fileURLToPath(new URL('../../golden/gen-v1.json', import.meta.url));

function produce(): GoldenFile {
  return {
    generator: cfg.gen.version,
    note: 'engine/generator.ts generate(spec) outputs (03 §11.3). Regenerate only with a generator version bump.',
    cases: GOLDEN_SPECS.map((spec) => ({ spec, result: generate(spec) })),
  };
}

describe('generator golden (tests/golden/gen-v1.json)', () => {
  if (process.env.UPDATE_GOLDEN === '1') {
    it('rewrites the golden file', () => {
      const g = produce();
      // One case per line: small diffs when a case changes.
      const cases = g.cases.map((c) => `  ${JSON.stringify(c)}`).join(',\n');
      const head = `{\n "generator": ${JSON.stringify(g.generator)},\n "note": ${JSON.stringify(g.note)},\n`;
      writeFileSync(FILE, `${head} "cases": [\n${cases}\n ]\n}\n`);
      expect(existsSync(FILE)).toBe(true);
    }, 120_000);
    return;
  }

  const golden = JSON.parse(readFileSync(FILE, 'utf8')) as GoldenFile;

  it('was produced by the current generator version', () => {
    // A version bump (cfg.gen.version) must come with a regenerated golden file.
    expect(golden.generator).toBe(cfg.gen.version);
  });

  it('covers the 20 fixed specs, N = 5–12, every case accepted', () => {
    expect(golden.cases.map((c) => c.spec)).toEqual(JSON.parse(JSON.stringify(GOLDEN_SPECS)));
    expect(golden.cases).toHaveLength(20);
    const sizes = new Set(golden.cases.map((c) => (c.result.ok ? c.result.record.n : 0)));
    for (let n = 5; n <= 12; n++) expect(sizes.has(n)).toBe(true);
    for (const c of golden.cases) expect(c.result.ok).toBe(true);
  });

  it.each(GOLDEN_SPECS.map((spec, i) => [i, spec.seed, spec] as const))(
    'case %i (%s) regenerates byte-identically',
    (i, _seed, spec) => {
      const want = golden.cases[i]?.result;
      expect(JSON.stringify(generate(spec))).toBe(JSON.stringify(want));
    },
    60_000,
  );
});
