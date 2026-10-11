// Owner: lead (Phase 2e I-4, the first load). The lazy English strings at run time: importing this module adds
// ./en/lazy.ts (the keys only lazy chunks show) to the English table of src/i18n/index.ts. Every lazy entry whose
// views show such a key imports it statically (the overlay, ladder, events and social chunks, the ladder boot, the fx
// chunk …), so the table is complete before any of those views exists; Rolldown puts it in one shared chunk
// (assets/en-lazy-*.js, vite.config.ts). tests/unit/i18n/first-load-strings.spec.ts checks every lazy entry.
// The first load never imports it (that would undo the split).
import { registerEnglish } from './index';
import { enLazyTable } from './en/lazy';

registerEnglish(enLazyTable);

/** The table this module registered (for tests). */
export const enLazy = enLazyTable;
