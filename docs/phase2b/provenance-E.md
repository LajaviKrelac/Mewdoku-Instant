# Provenance draft: workstream E (localization)

Status: draft for the lead to merge into [`docs/provenance.md`](../provenance.md) at integration (phase2b Appendix B) · Date: 2026-10-09 · Owner: E

Every row is our own work. No string, layout or name was taken from the original game or from any source listed in [06 §4](../phase1/06-legal-and-originality.md). The translation brief never named or described the original game, and no localized UI of any other game was consulted (06 §2 step 6).

## 1. Translations (AI drafts)

| Asset | Author / method | Inputs (the whole brief) | Date | Status |
|---|---|---|---|---|
| `src/i18n/locales/{es,pt-BR,fr,de,it,id,tr,pl,ru,vi,th,ja,ko,zh-Hans,hi,ar}.ts` (16 catalogues) | Claude (Anthropic), AI draft written directly as TypeScript catalogue files | Our English catalogue (`src/i18n/en.ts` + `src/i18n/en/*.ts`), the per-key notes and length limits (`src/i18n/meta.ts`), the glossary (`docs/i18n/glossary.md`) | 2026-10-09 | unreviewed draft; ships only in dev / e2e / preview builds until approved ([review log](../i18n/review-log.md)) |
| `docs/i18n/glossary.md` (term choices, colour and glyph names in 16 languages) | Claude, written before the catalogues as part of the same brief | as above | 2026-10-09 | draft, for the same native review |
| `src/i18n/en/i18n.ts` (`time.daysHours`, the endonym list `LOCALE_NAMES`) | E; endonyms are each language's own name (public facts) | — | 2026-10-08 (F0), 2026-10-09 | final |

**The brief, as given to the model** (one session, all 16 languages):

> Translate the English UI copy of a calm cat logic puzzle game (`src/i18n/en.ts`) into es (neutral Latin American), pt-BR, fr, de, it, id, tr, pl, ru, vi, th, ja, ko, zh-Hans, hi and ar. Use the per-key notes, placeholders and length limits in `src/i18n/meta.ts` and the terms in `docs/i18n/glossary.md`. Keep every `{placeholder}`; keep strings short where the layout is tight (chips 18, buttons 22, titles 28; check the longest German and Russian strings at 320 px); write warm, natural copy rather than literal translations; use the colour as a name in apposition; keep placeholders in a case-free position in languages with case; add the plural forms each language needs; use Latin digits; call the paw booster by one cute word for a small cat and the currency plain "fish". Do not reuse any other game's wording.

**Outputs:** the 16 files above, as committed. `docs/i18n/drafted-from.json` records the English source of every key at drafting time (written by `npx tsx scripts/i18n-check.ts --write-drafted-from`), so later English edits show up as "stale" warnings in `npm run i18n:check`.

**Revisions on 2026-10-09 (same author, same brief):** strings shortened after the length check and the 320 px screenshots (taglines, chips, praise words, German "Noch offen"); Hindi sentences shortened to keep its lazy chunk under the 24 KB budget; the English-only date parts and the `.one` forms of languages without a "one" category removed from the catalogues (Intl formats dates; those forms are never selected).

## 2. Code and checks (our own, no third-party code)

| File | What | Date |
|---|---|---|
| `src/i18n/index.ts`, `locale.ts`, `plural.ts`, `format.ts`, `meta.ts`, `build-locales.ts` | locale resolution and loading, Intl plural rules, Latin-digit number and date formatting, bidi isolation, the `xx-long` pseudo-locale (dev/e2e only), translator notes | 2026-10-09 |
| `src/styles/i18n.css` | RTL overrides (board and top bar stay LTR, mirrored chevrons, switches and spacing) | 2026-10-09 |
| `scripts/i18n-check.ts` | catalogue and release checks | 2026-10-09 |
| `tests/unit/i18n/*.spec.ts`, `tests/e2e/i18n.spec.ts` | tests | 2026-10-09 |

No fonts or images were added by E (the per-script font stacks and the latin-ext face belong to A, phase2b §6.6).
