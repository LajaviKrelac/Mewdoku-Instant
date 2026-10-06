# Phase 1: Deconstructing Meowdoku (working title "Mewdoku")

Date: 2026-10-06 · Status: complete and reviewed (implementer and evidence review, same day; see "Review pass" below), waiting for the user's answers to the open questions below

The project has four phases:

1. Deconstruct the original down to source-code level.
2. Rebuild it as is.
3. Add something of our own (the user decides what, after Phase 2 is running).
4. Publish on Facebook Instant Games (FBIG).

This folder is the **Phase 1 deliverable**. It is a clean-room breakdown of the original game, followed by an implementable spec, engine design, architecture and platform plan. Phase 2 can start coding directly from it.

## Documents

| File | What it holds | Who it is for |
|---|---|---|
| [01-game-deconstruction.md](01-game-deconstruction.md) | Everything known about the original: rules, controls, hearts, hints, screens, progression, economy, monetization, look and feel, audio. Every fact has a confidence tag and sources. It also covers the product family (Oakever app vs Yandex web build vs clones), genre conventions, refuted claims and contradictions. | Design, everyone |
| [02-rebuild-spec.md](02-rebuild-spec.md) | The functional spec for Phase 2: tunables, screens with ASCII wireframes, gestures, state machines, mistake model, hints and kitty, win and lose flows, progression ramp, daily puzzle, ads, settings, persistence, audio, visuals, accessibility, layout, analytics, Phase 3 hooks, acceptance criteria. Unknowns are resolved as **[DECISION]**. | Design, engineering |
| [03-puzzle-engine.md](03-puzzle-engine.md) | Formal rules; solver (counts solutions up to 2); generator (placement → region growth → uniqueness repair → filters); 6-level human-technique grader that also drives hints; seeded PRNG; offline level-pack pipeline; data format; performance targets; test plan. Includes measured numbers. | Engineering |
| [04-architecture.md](04-architecture.md) | TS strict + Vite + DOM/CSS/SVG, with no engine. Full source tree file by file, core types, store and reducer, rendering, input, workers, audio, the PlatformAdapter (Web / FBInstant, chosen at build time), save schema and merge, bundle budget, npm scripts, test strategy. | Engineering |
| [05-fbig-platform.md](05-fbig-platform.md) | FBIG status as of 2026-10-06 (SDK 8.0, the NEZP privacy model, ads, data, payments), lifecycle plan, bundle and `fbapp-config.json`, local testing, CI upload, Phase 4 submission checklist, uncertain or deprecated items with source dates. | Engineering, publishing |
| [06-legal-and-originality.md](06-legal-and-originality.md) | Clean-room process, what we must not copy, sources to avoid, original asset plan, and the naming and trademark risk of "Mewdoku" vs "Meowdoku" with options (no decision made). | Everyone, especially before Phase 4 |
| [SOURCES.md](SOURCES.md) | Every source URL, grouped by research angle, with its access status | Reference |
| [engine-prototype/](engine-prototype/) | Our own working JS prototype of the solver, generator, grader and PRNG, plus the benchmark and cross-check scripts behind the numbers in 03. Run with `node engine-prototype/lab/daily.mjs`. | Engineering (port to TS in Phase 2) |

## Executive summary

**The game.** *Meowdoku* (Oakever Games; Android `com.oakever.meowdoku`, iOS `id6761760135`) is a 2026 top-chart puzzle hit: 10M+ installs, #1–3 in several stores. The board is an N×N grid with N coloured regions, and the player places N cats so that each row, column and colour has exactly one cat and no two cats touch, even diagonally. This is the LinkedIn Queens / 1-star Star Battle puzzle with a cute cat skin.

**What makes it Meowdoku and not just Queens** (confirmed or likely):

1. **Double-tap to place a cat**, implemented as a tap cycle: the first tap draws an X, the second turns it into a cat.
2. **3 hearts per level**. Every placement is checked against the level's unique solution. A wrong cat is never shown; the cell becomes a red X and costs a heart.
3. A **teaching hint** that lights up the next determinable cell with a one-line reason (confirmed). Players praise this feature most. Naming the colour, previewing the X's and an Apply button are seen in the web build (likely). The app also has a **kitty** booster that reveals a cat.
4. A **linear, endless-feeling campaign** with mixed board sizes from 4×4 up to 12×12 (iPhone levels exist at least to #428), plus **daily puzzles** and **leaderboards**.
5. A minimal pastel look: rounded flat tiles with gaps, no grid lines, regions shown by colour only, animated tuxedo cat heads.
6. **Ad-funded**:
   - interstitials between levels and on retry, after a grace period, with a cooldown that shrinks with tenure (120/100/90 s);
   - rewarded ads for hints, boosters and revives;
   - iOS later added subscriptions.
   
   The ad load is the main player complaint (Android Central's "one BIG problem").

**Two products, one name.** The richest UX evidence comes from a third-party teardown of the **Yandex web build**. That build looks and plays like the app, but it has no home menu, daily mode or rewards, uses a different engine, and its developer is unverified. 01 keeps the two apart. Many other "Meowdoku" sites and repos are unrelated clones; they are filtered out and listed.

**What Phase 2 builds** (02–04):

- A faithful rebuild: tutorial (Level 1, 4×4), 1 000 pre-generated levels following a mixed size ramp, endless levels after that, a daily puzzle from level 20, 3 hearts, a solution-checked mistake model, a teaching hint (5 to start), a kitty booster (3 to start), one rewarded revive, and ad pacing that copies the original's defaults through a platform adapter.
- Everything is original: our ginger cat in SVG, our palette, synthesized sound, our copy, generated levels.
- Stack: TypeScript, Vite and plain DOM. First load is ≤ 220 KB with no runtime network calls except the FB SDK.
- The puzzle engine is **already prototyped and measured**:
  - uniqueness proofs take 6–82 µs at N = 5–12;
  - a valid unique 12×12 puzzle takes about 25–36 ms on average;
  - the grader solved every generated puzzle without nested guessing.

**Key risks**

| Risk | Detail |
|---|---|
| **Naming** | "Mewdoku" is one letter from "Meowdoku", and the publisher is in active IP disputes. Recommendation: keep it as the code name and choose a distinct public name before Phase 4 (06 §6). |
| **FBIG documentation** | Meta's docs could not be read during research. SDK 8.0, the NEZP privacy model, ads and payments are confirmed from Meta's own 2026 GitHub repos. Whether new apps are accepted, submission assets and ad eligibility must be verified before Phase 4 (05 §13). |
| **Research gaps** | Hint and kitty stock in the app, revive size, daily structure, leaderboard scope, the "golden fish" reward, the exact level ramp and whether the X→cat cycle is timed are unknown. They are resolved as reversible [DECISION]s in `GameConfig`. |

## Confidence legend

| Tag | Meaning |
|---|---|
| **confirmed** | Stated explicitly by a source about Meowdoku, or verified by our own code or measurement, after adversarial fact-checking |
| **likely** | Strongly implied, single or weaker source, or confirmed for only one version (the app or the Yandex web build) |
| **inferred** | Our deduction, a genre convention, or an unsupported claim |
| **[DECISION]** | Not known about the original; our explicit, reversible choice with a reason (02–04) |

## Key numbers at a glance

| Item | Original (confidence) | Phase 2 value |
|---|---|---|
| Board | N×N, N regions, N cats (confirmed) | N = 4…12 |
| Rules | 1 per row, column and colour; no touching, even diagonally (confirmed) | Same |
| Hearts | **3** per level (confirmed) | 3 |
| What counts as a mistake | Any cat not in the stored unique solution → red X (likely) | Same |
| Place a cat | Double-tap (confirmed); first tap draws X, second places the cat (likely); whether a slow second tap also places a cat is unknown | 300 ms double-tap window; a slow second tap clears the X [DECISION] |
| Revive at 0 hearts | Rewarded revive in the app (likely); Retry only in the web build (likely) | +1 heart, once per attempt, or Retry [DECISION] |
| Hints | Limited; refilled by ads or rewards (confirmed). 5 to start in the web build (likely) | 5, +1 per rewarded ad |
| Kitty booster | Exists (confirmed); stock unknown | 3, +1 per rewarded ad [DECISION] |
| Board sizes | 4×4 (level 1) to 12×12 (likely) | Ramp in 02 §11.2 |
| Level count | ≥ 428 (confirmed); 1 000+ reported (likely); "Endless levels" (store) | 1 000 shipped + endless generation |
| Daily puzzle | Exists (confirmed); unlock level about 21 (inferred) | From level 20; one per date |
| Interstitial cooldown | 120 / 100 / 90 s by tenure (days 0–2 / 2–7 / 7+) (likely, single origin) | Same defaults in config |
| Interstitial start | About level 10–12 (likely; reports conflict) | After 10 completed levels, plus 60 s session grace |
| iOS subscriptions | Premium $3.99/wk, $7.99/mo, $34.99/yr; Plus $6.99/wk, $14.99/mo, $69.99/yr (likely) | None (FBIG payments are not available on iOS) |
| Revenue estimate | About $200K/day from ads, >80 % from interstitials (likely, estimates) | — |
| Placements without regions, N = 4…12 | 2, 14, 90, 646, 5 242, 47 622, 479 306, 5 296 790, 63 779 034 (confirmed, computed; OEIS A002464) | — |
| Solver (uniqueness, limit 2) | — | 6–82 µs average for N = 5–12 (measured) |
| Generator (unique puzzle) | — | 0.3 ms (N = 5) to about 25–36 ms (N = 12) average (measured) |
| FBIG SDK | 8.0 (confirmed) | Pinned `fbinstant.8.0.js` |
| FBIG player data | 1 MB per player (confirmed) | Our save is under 40 KB |
| FBIG bundle | Zip, ≤ 500 files, no server code (likely) | About 45 files, ≤ 500 KB zip |
| FBIG load guideline | < 5 s (likely) | ≤ 220 KB first load, ≤ 2 s target |

## Open questions for the user

1. **Public name.** Keep "Mewdoku" only as the internal code name and pick a distinct public name before Phase 4? 06 §6.2 lists options without choosing one.
2. **Ad pacing.** Phase 2 copies the original's defaults: interstitial on next level, retry and daily done; none before 10 completed levels; 120/100/90 s cooldown. Keep these "as is", or go lighter from the start? Any change is a one-line config edit.
3. **Revive.** Is "Continue (+1 heart) via rewarded video", once per attempt, plus "Retry" acceptable? The alternative is Retry only, like the web build.
4. **Art direction.** Is our own **ginger loaf cat** (deliberately not a tuxedo cat), with a teal accent and dark X marks, OK?
5. **Facebook account.** Who owns the Meta developer account, the App ID, business verification, Monetization Manager placements and the privacy-policy URL?
6. **Launch language.** English only for Phase 2? The original ships about 62 languages.
7. **Scope check.** Are the daily puzzle without streaks or calendar and the level count (1 000 shipped + endless) fine for "as is"? Streaks and calendar are listed as Phase 3 hooks.

Phase 3 ("add something of our own") is intentionally **not designed**. Seams for it are listed in 02 §22, and we will ask you once Phase 2 is running.

## Review pass (2026-10-06)

A demanding review read every file with two lenses and fixed the documents in place.

**Implementer lens: gaps closed so Phase 2 needs no follow-up questions**

- **Ads.** `showAsync()` resolves only when an ad has finished (Meta's reference text), so the old "4 s timeout on load and show" would have cut off ads that were still playing. It is now a 4 s *readiness* timeout plus a 120 s safety watchdog (02 §13, 04 §6.3, 05 §6.2).
- **Analytics.** The `n` parameter broke FB's 2-character minimum for keys and is now `size` (02 §20).
- **Save schema.** It now has **two in-progress slots** (level and daily), so playing a level no longer discards a daily in progress. There are explicit restore rules (stale daily, failed validation, a full board, hearts = 0 → fail overlay), validation invariants, `defaults()`, and three save modes. A contradiction between 04 and 05 about flushing on pause is resolved: there is no flush on pause (02 §15, 04 §4.3 and §7, 05 §7).
- **State machine.** Added `KITTY_DONE`, `HINT_OPEN.charged`, `RuleFlags`, a full **status × action matrix**, and the tutorial input filter (04 §4.2). The timer `TICK` and the timed transitions are now specified (04 §5.2). New pseudocode fixes the order of stock debits, ads and actions for hint, kitty, revive and interstitials (04 §5.7).
- **Hints and kitty.** Specified the free-reopen cache, how Apply affects Marks and Wrong cells, the mistaken-mark order, `pickKittyCell`, and pigeonhole templates covering all six kind pairs (02 §9, 03 §6).
- **Grader.** The scan order and step granularity are now exact, so stored grades are reproducible. Added the k ≥ 2 rule and the proof behind the `k ≤ ⌊m/2⌋` bound, termination and complexity, and a balanced-growth termination fix (03 §4.3, §5.2).
- **Level pipeline.** The size schedule is now an exact four-step algorithm. The effort sort no longer moves hard or breather levels. There are new seeds for the schedule, sort, substitute and endless retry. Endless levels and substitute boards are specified (02 §11, 03 §7–8).
- **Tutorial.** The board now uses canonical labels and fixed colours. "Lilac", which was not in the palette, is now "Lavender". Each step has accepted inputs and an advance condition, keyboard users can complete it, and skip and replay semantics are defined (02 §11.5).
- **Daily puzzle.** Specified the unlock condition, the local date key, the weekday derived from the date string, Home card states and failure behaviour (02 §12).
- **Toolchain.** The `@platform` alias also needs tsconfig `paths` and a Vitest alias. Added `src/env.d.ts`, `src/game/ramp.ts` and the `jsdom` dev dependency (04 §1, §3, §6.1). Mock ads are enabled in e2e builds.

**Evidence lens: tags corrected**

- Re-read 11 GitHub sources first-hand (01 header).
- Confirmed from those reads: double-tap and three mistakes from the store description as checked on 2026-09-28; the retry button on defeat; the three golden fish and scoreboard; the rule-by-rule tutorial with a hand pointer in the store art; "rounded tiles with gaps, no grid, no strokes".
- Downgraded or split: the always-visible rule chips, the colour-naming hint, tuxedo colouring, "level boards are fixed", "no visible timer", the 3 s cloud debounce (our own value, not FB guidance) and interstitial muting.

**Gaps the review could not close.** The session's web-search budget was already used up, and gamigion.com, felixbraberg.substack.com, pocketables.com and Meta's docs are blocked. Still unverified:

- the app's revive size and limit;
- hint and kitty stock;
- the ad cadence numbers (single origin);
- the current monetization catalogue;
- whether Meta accepts **new** Instant Games apps in 2026.

Re-run targeted searches for these before Phase 4 (05 §13).

## Suggested Phase 2 milestones

| Milestone | Scope |
|---|---|
| **M1 · Engine + content** | Port `engine-prototype` to `src/engine` (TS), with unit and property tests; `level-schedule`, `gen-levels`, `gen-daily`, `verify-levels`; commit the packs |
| **M2 · Core loop** | Reducer and the gesture recogniser; board view, HUD, tutorial; win and lose flows; web adapter with mock ads |
| **M3 · Helpers and meta** | Hint engine and card, kitty, economy, ad gate, daily, Home, settings, persistence and resume |
| **M4 · Polish** | Audio synthesis, animations, palette validation, accessibility, layout matrix, Playwright suite, bundle budget |
| **M5 · FB adapter (Phase 4 prep)** | FBInstant adapter against the stub; `build:fbig` and `zip:fbig`; local embed test once an App ID exists |
