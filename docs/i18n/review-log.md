# Translation review log

Status: living log · Started: 2026-10-09 · Owner: workstream E (localization) · Process: [phase2b §6.7](../phase2b/parity-spec.md)

A locale ships in **release builds** (`npm run build:release`: the FB production zip and the public web deploy) only when it is listed in `cfg.i18n.releaseLocales` (`src/app/config.ts`, default `['en']`) **and** has an approval row in the table below. `npm run i18n:check -- --release` enforces both, and also fails when a release build contains a locale chunk outside the list. Dev, e2e and web preview builds always carry all 17 locales.

## How to approve a locale

1. A native speaker reviews the catalogue `src/i18n/locales/<id>.ts` against the English (`src/i18n/en.ts` and `src/i18n/en/*.ts`), using the per-key notes in `src/i18n/meta.ts` and the [glossary](glossary.md).
2. They check the in-game screenshots: `I18N_SHOTS=1 npx playwright test tests/e2e/i18n.spec.ts` writes Home, game and Settings at 320 and 390 px to `docs/i18n/screenshots/` (German, Russian, Arabic, Thai, Japanese and the pseudo-locale). For other locales, run the e2e build with the browser language set to the locale, or use Settings → Language.
3. Fixes go into the catalogue; `npm run i18n:check` must stay green.
4. Add a row to **Approvals** (locale id, reviewer, date, the commit of the reviewed catalogue), then ask the lead to add the id to `cfg.i18n.releaseLocales`.

Approval does not block Phase 2b. The user decides when a locale joins the release list (phase2b §0.8).

## Approvals

| Locale | Reviewer | Date | Catalogue commit |
|---|---|---|---|

*(none yet: every non-English catalogue is an unreviewed AI draft)*

## Drafts awaiting review

All drafts were written on 2026-10-09 by Claude (AI) from our English copy, `meta.ts` and the glossary only (provenance: [`docs/phase2b/provenance-E.md`](../phase2b/provenance-E.md)). `docs/i18n/drafted-from.json` records the English each key had at that time, so `i18n:check` warns when an English string changes after its translation.

| Locale | Language | Draft | Points a reviewer should check first |
|---|---|---|---|
| `es` | Spanish (neutral Latin American) | 2026-10-09 | "Reto del día" for the daily puzzle; *Durazno* for Apricot; `unit.kind.colors` is "zonas de color" so that "Esas {targetKind}" agrees in gender |
| `pt-BR` | Portuguese (Brazil; also serves pt-PT) | 2026-10-09 | *Banana* (Lemon) and *Limão* (Lime) because Brazilian limão is green; "casa" for a tile |
| `fr` | French | 2026-10-09 | "tu"; narrow no-break spaces before ! ? and no-break spaces before : and %; "minou" for the kitty booster |
| `de` | German | 2026-10-09 | "du"; "Level", "Shop", "Event" kept as loanwords; "Laternenlauf" for Lantern Walk |
| `it` | Italian | 2026-10-09 | "indizio" for hint, "micio" for kitty; "zone di colore" so that "Queste {targetKind}" agrees |
| `id` | Indonesian | 2026-10-09 | "meong" for the kitty booster; "Level", "Event", Lemon, Mint and Lavender kept as loanwords |
| `tr` | Turkish | 2026-10-09 | "Bölüm" for level; "pisi" for kitty; no case suffix is attached to a placeholder (vowel harmony unknown), so some sentences use colons |
| `pl` | Polish | 2026-10-09 | one / few / many forms; no gendered past tense addressed to the player; placeholders kept in the nominative with colons or brackets |
| `ru` | Russian | 2026-10-09 | "вы" imperatives; one / few / many forms; colour names in «guillemets»; colon constructions keep placeholders nominative |
| `vi` | Vietnamese | 2026-10-09 | "Màn" for level; "Tặng" (gift) as the short "Free" badge |
| `th` | Thai | 2026-10-09 | classifiers (ตัว, ข้อ, ดวง); "เหมียว" for kitty; no polite particles |
| `ja` | Japanese | 2026-10-09 | です/ます sentences, plain labels; "N行目 / N列目"; kana for cat words; "ニャイス！" pun |
| `ko` | Korean | 2026-10-09 | 해요체; only invariant particles after placeholders; "냥이" for kitty; "냥벽해요!" pun |
| `zh-Hans` | Chinese, Simplified (also serves zh-TW / zh-HK until zh-Hant) | 2026-10-09 | "第{level}关"; "猫咪" for kitty; "喵不可言！" pun |
| `hi` | Hindi | 2026-10-09 | everyday Hindi with loanwords (लेवल, कॉलम); `unit.kind.*` are oblique plurals; "किटी" for kitty; some long sentences were shortened to keep the chunk ≤ 24 KB |
| `ar` | Arabic (Modern Standard, RTL) | 2026-10-09 | all six plural forms; zero/one/two forms leave out the number; masculine singular imperative; "قُطيطة" for kitty; Latin digits by design |

## Phase 2c redraft: fish are lives (2026-10-09, workstream G2)

The 16 catalogues were redrafted on 2026-10-09 by Claude (AI) for [`docs/phase2c/fish-lives-spec.md`](../phase2c/fish-lives-spec.md) Appendix A, again from our own English copy, `meta.ts` and the [glossary](glossary.md) only. Every change below is an **unreviewed AI draft**; an approval row above covers a catalogue only if its commit includes these keys.

- **Changed in place (A.1):** the lives copy now says fish, never hearts: `game.hearts.a11y`, `howto.hearts`, `fail.title`, `fail.continue.a11y.*`, `a11y.mistake.*`, `a11y.lost`, `a11y.revived`; the group copy no longer pays fish: `group.body.rank`, `group.participation`.
- **New (A.2), in a block headed "Phase 2c" at the end of each catalogue:** `period.total.*`, `period.pill.*`, `rank.title.period.*`, `rank.tab.period.*`, `rank.records.best.*`, `rank.sub.period.*`, `rank.records.streak`, `rank.records.streakBest` (G2 addition: "4 (best 9)"), `a11y.fishKept.*`, `victory.streak`, `victory.streak.a11y.*`, `howto.points.*`.
- **Removed (A.3):** the fish currency copy: `victory.bonus.*`, `shop.swap*`, `shop.product.fish_*`, `rewarded.swap`, `event.reward.fish.*`, `a11y.fishEarned.*`, `shop.notEnough`, and the paw-points title `rank.title.points`. (`rank.points` "{points} points" stays until I-3 for the retired board's score format.)

Points a reviewer should check first:

| Locale | Check |
|---|---|
| all | The fish word is the glossary's (a life and a ranking point, never money or "golden"); no heart word remains in the lives copy (a unit test enforces this per locale); "This week" means the current UTC week, not the last 7 days |
| `it` | `rank.title.period.week` "Classifica settimanale" is 22 characters, over the soft limit of 20 (the only `i18n:check` warning); it fits the panel title at 320 px in the e2e screenshots, but a shorter title is welcome; `rank.tab.period.week` is "Settimana" to fit the tab |
| `pl`, `ru`, `ar`, `hi` | `{total}`, `{best}` and `{points}` use label + colon constructions ("Ten tydzień: {total}", «Очки: +{points}»); check they read naturally next to the plural fish forms |
| `ru` | `period.total.week` «За неделю: {total}» and the pill «{count} рыбки за эту неделю» (few/many forms) |
| `tr` | no case suffix follows `{total}` or `{count}` (colons instead); `howto.points.*` says "00:00 UTC itibarıyla yeniden başlar": check it reads naturally |
| `ar` | all six plural forms of `period.pill.*`, `rank.sub.period.*`, `a11y.fishKept.*`, `victory.streak.a11y.*`; zero/one/two forms leave the number out |
| `th`, `ja`, `ko`, `zh-Hans` | classifiers for fish (ตัว, 匹, 마리, 条) in every fish count; `victory.streak` is a short chip ("Perfect ×4") |
| `de`, `fr`, `es`, `pt-BR`, `id`, `vi` | the perfect-streak chip and the How to play sentence about the 00:00 UTC reset |

## Known limits of the drafts

- Event names, product names and praise words are our own and were translated for meaning and tone, not literally; reviewers may propose better local names (they must stay our own, never another game's).
- Templates with `{hours}` or `{kitties}` outside plural keys use constructions that read correctly for any number (for example Russian «котиков: {kitties}»). Arabic "خلال {hours} ساعة" is correct for the configured 72 hours (11–99 take the singular); a reviewer should confirm it if `groups.durationH` changes.
- The English-only date parts (`date.*`) are not translated: other locales format dates with `Intl.DateTimeFormat` and Latin digits (phase2b §6.4).
