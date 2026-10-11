// Owner: lead (Phase 2e I-4). The English catalogue is split: the first load bundles src/i18n/en-first.ts and a lazy
// chunk registers the rest (src/i18n/en-lazy.ts). A string that no loaded table has shows as its bare key and, in e2e
// builds, logs "i18n: no English string for '<key>'" (src/i18n/index.ts). Every test of a spec that calls
// watchStrings(test) fails when that line was logged on its page (tests/unit/i18n/first-load-strings.spec.ts is the
// static check; this one sees what the screens really asked for).
import { expect, type Page, test as base } from '@playwright/test';

export const MISSING_STRING = 'i18n: no English string';

export function watchStrings(t: typeof base): void {
  const seen = new WeakMap<Page, string[]>();
  t.beforeEach(({ page }) => {
    const list: string[] = [];
    seen.set(page, list);
    page.on('console', (m) => {
      if (m.type() === 'error' && m.text().startsWith(MISSING_STRING)) list.push(m.text());
    });
  });
  t.afterEach(({ page }) => {
    expect(seen.get(page) ?? [], 'English strings missing from the loaded tables').toEqual([]);
  });
}
