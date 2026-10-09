// Owner: read-only (Phase 2b; was engine)
// 03 §11.3 cross-engine determinism: the generator, as BUILT for the browser (dist/e2e, minified),
// regenerates every golden spec of tests/unit/engine/golden-specs.ts byte-identically to the Node
// golden file tests/golden/gen-v1.json, both through the module worker (the production path for
// endless levels, missing daily months and substitute boards) and through the main-thread fallback
// chunk. Chromium only (the only browser preinstalled here); see docs/phase2/STATUS.md.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { E2EHooks } from '../../src/app/boot';
import type { GenResult, GenSpec } from '../../src/engine/types';
import { GOLDEN_SPECS } from '../unit/engine/golden-specs';

type TestWindow = Window & { __mewdoku?: E2EHooks };

interface GoldenFile {
  generator: string;
  cases: { spec: GenSpec; result: GenResult }[];
}

const golden = JSON.parse(readFileSync(new URL('../golden/gen-v1.json', import.meta.url), 'utf8')) as GoldenFile;

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => {
    const app = (window as TestWindow).__mewdoku?.app();
    return !!app && app.screen !== 'boot';
  });
});

test('the golden file covers every shared spec', () => {
  expect(golden.cases.map((c) => c.spec)).toEqual(JSON.parse(JSON.stringify(GOLDEN_SPECS)));
  expect(golden.cases.length).toBe(20);
});

for (const where of ['worker', 'main'] as const) {
  test(`Chromium (${where}) regenerates all ${GOLDEN_SPECS.length} golden specs byte-identically`, async ({ page }) => {
    test.setTimeout(120_000);
    const results = await page.evaluate(
      async ({ specs, where: w }) => {
        const hooks = (window as TestWindow).__mewdoku;
        if (!hooks) throw new Error('no e2e hooks');
        const out: string[] = [];
        for (const spec of specs) out.push(JSON.stringify(await hooks.generate(spec, w)));
        return out;
      },
      { specs: JSON.parse(JSON.stringify(GOLDEN_SPECS)) as GenSpec[], where },
    );
    // The worker path really ran in a module worker (no silent main-thread fallback).
    if (where === 'worker') expect(page.workers().map((w) => w.url()).some((u) => /engine\.worker/.test(u))).toBe(true);
    expect(results).toHaveLength(golden.cases.length);
    results.forEach((json, i) => {
      const want = golden.cases[i]?.result;
      expect(JSON.parse(json), `case ${i} (${GOLDEN_SPECS[i]?.seed})`).toEqual(want);
    });
  });
}
