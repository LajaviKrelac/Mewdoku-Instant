// Owner: lead (Phase 2e I-4, the first load); the copy belongs to the owners of ./en/*.ts.
// The English strings of the FIRST LOAD (spec §7.9, I-4): every per-owner part under ./en/ minus the keys only lazy
// chunks show, which live in ./en/lazy.ts and reach the runtime through ./en-lazy.ts (a lazy chunk). src/i18n/index.ts
// bundles this table only; ./en.ts (the whole catalogue: types, tests, tools, translators) spreads both. Which key is
// where is computed by scripts/i18n-split.ts and guarded by tests/unit/i18n/first-load-strings.spec.ts.
import { enArt } from './en/art';
import { enCore } from './en/core';
import { enEvents } from './en/events';
import { enI18n } from './en/i18n';
import { enPlatform } from './en/platform';
import { enUi2b } from './en/ui-2b';
import { enUi2c } from './en/ui-2c';
import { enUi2d } from './en/ui-2d';
import { enUi2d1 } from './en/ui-2d1';
import { enUi2e } from './en/ui-2e';

/** The first-load English strings (the first screens, the board, the tutorial coach, the boot and error copy). */
export const enFirst = { ...enCore, ...enArt, ...enUi2b, ...enUi2c, ...enUi2d, ...enUi2d1, ...enUi2e, ...enEvents, ...enPlatform, ...enI18n } as const;

/** A key of the first-load table (the key lists below must be: first-load code indexes them). */
export type FirstKey = keyof typeof enFirst;

/** Ordered key lists for indexed strings. Appending a word means appending to its list too. */
export const COLOR_KEYS = [
  'color.0', 'color.1', 'color.2', 'color.3', 'color.4', 'color.5',
  'color.6', 'color.7', 'color.8', 'color.9', 'color.10', 'color.11',
] as const satisfies readonly FirstKey[];
export const GLYPH_KEYS = [
  'glyph.0', 'glyph.1', 'glyph.2', 'glyph.3', 'glyph.4', 'glyph.5',
  'glyph.6', 'glyph.7', 'glyph.8', 'glyph.9', 'glyph.10', 'glyph.11',
] as const satisfies readonly FirstKey[];
export const PRAISE_KEYS = [
  'win.praise.0', 'win.praise.1', 'win.praise.2', 'win.praise.3', 'win.praise.4', 'win.praise.5',
] as const satisfies readonly FirstKey[];
export const TUTORIAL_STEP_KEYS = [
  'tutorial.step1', 'tutorial.step2', 'tutorial.step3', 'tutorial.step4', 'tutorial.step5', 'tutorial.step6',
] as const satisfies readonly FirstKey[];
export const WEEKDAY_KEYS = [
  'date.weekday.0', 'date.weekday.1', 'date.weekday.2', 'date.weekday.3',
  'date.weekday.4', 'date.weekday.5', 'date.weekday.6',
] as const satisfies readonly FirstKey[];
export const MONTH_KEYS = [
  'date.month.0', 'date.month.1', 'date.month.2', 'date.month.3', 'date.month.4', 'date.month.5',
  'date.month.6', 'date.month.7', 'date.month.8', 'date.month.9', 'date.month.10', 'date.month.11',
] as const satisfies readonly FirstKey[];
