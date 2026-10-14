// Owner: E (the aggregator and the Phase 2 keys below; never rename or remove a key).
// Every user-facing string (02 §21). All copy is our own (06 §3): never paste or paraphrase the
// original's store text, tutorial lines, hint sentences, praise words or rule-chip wording.
// Placeholders are {name}; t() type-checks them. Plurals use the `.one` / `.other` suffix pair.
//
// Phase 2b (phase2b §6.7, §12.1 F0 item 7): new keys live in per-owner files under ./en/ and are
// spread into `en` below, so the workstreams never edit the same file:
//   en/art.ts (A) · en/ui-2b.ts (B) · en/events.ts (C) · en/platform.ts (D) · en/i18n.ts (E).
// Phase 2c (fish-lives-spec §1.5, Appendix A): G2 owns every file here; the 2c keys are in en/ui-2c.ts.
// Phase 2d (look-spec Appendix A): G3 owns every file here; the 2d keys are in en/ui-2d.ts.
// Phase 2d.1 (helpers-spec Appendix A): G3; the 2d.1 keys are in en/ui-2d1.ts.
// Phase 2e (phase2e spec Appendix A): G3; the 2e keys (ranking, name, Buy rows, streak) are in en/ui-2e.ts.
// UI batch (2026-10-13), messages: the level-start tickers' richer lines are in en/ui-tickers.ts (first load).
// The lives are fish: the 2b "heart" values changed (same keys, A.1), the fish-currency keys went (A.3).
// A key must exist in exactly one file (tests/unit/sanity.spec.ts checks it).
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
import { enUiTickers } from './en/ui-tickers';
import { enFirst } from './en-first';
import {
  enLazyCore,
  enLazyEvents,
  enLazyI18n,
  enLazyPlatform,
  enLazyTable,
  enLazyUi2b,
  enLazyUi2c,
  enLazyUi2d,
  enLazyUi2d1,
  enLazyUi2e,
} from './en/lazy';

// Phase 2e I-4 (lead, the first load): the Phase 2 keys (enCore) moved to ./en/core.ts, and the keys only lazy chunks
// show moved VERBATIM to ./en/lazy.ts (computed by scripts/i18n-split.ts). At run time src/i18n/index.ts bundles only
// ./en-first.ts and a lazy chunk registers the rest (./en-lazy.ts); THIS module is the whole catalogue for the types,
// the tests, the tools and the translators' brief, and the game bundle imports only its types.

/** The English catalogue: the Phase 2 keys plus every owner's file, first-load and lazy parts. */
export const en = { ...enFirst, ...enLazyTable } as const;

/** The per-owner parts of `en`, for the disjointness check (sanity.spec.ts): every key is in exactly one of them. */
export const EN_PARTS = {
  enCore, enArt, enUi2b, enUi2c, enUi2d, enUi2d1, enUi2e, enEvents, enPlatform, enI18n, enUiTickers,
  enLazyCore, enLazyUi2b, enLazyUi2c, enLazyUi2d, enLazyUi2d1, enLazyUi2e, enLazyEvents, enLazyPlatform, enLazyI18n,
} as const;

export type En = typeof en;
export type I18nKey = keyof En;
/** A full catalogue for another locale has every key (values are plain strings). */
export type Catalog = { readonly [K in I18nKey]: string };

/** Keys B such that both `${B}.one` and `${B}.other` exist (the bases tn() accepts). */
export type PluralBase = {
  [K in I18nKey]: K extends `${infer B}.one` ? (`${B}.other` extends I18nKey ? B : never) : never;
}[I18nKey];

/**
 * The plural forms other languages add to a base (phase2b §6.4): `${base}.zero|two|few|many`. English
 * has only `.one` / `.other`; a locale catalogue adds the categories Intl.PluralRules uses for it.
 */
export type PluralExtraKey = `${PluralBase}.${'zero' | 'two' | 'few' | 'many'}`;

/** Ordered key lists for indexed strings (first-load keys; defined in ./en-first.ts). */
export { COLOR_KEYS, GLYPH_KEYS, MONTH_KEYS, PRAISE_KEYS, TUTORIAL_STEP_KEYS, WEEKDAY_KEYS } from './en-first';
