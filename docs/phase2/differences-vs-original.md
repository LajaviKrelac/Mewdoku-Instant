# Mewdoku vs Meowdoku (Play Store): what is different

Status: Phase 2 review (2026-10-07); §1 status updated after the Phase 2b "parity" integration (2026-10-09, §1.0); Phase 2c "fish are lives" (2026-10-09): §1.0 rows 2, 5 and 8, §2.5–§2.8, §3.4 and §6 #1–#2 updated from the user's first-hand report; Phase 2c.1 "level points per cat" (2026-10-10, **built and integrated the same day**, [STATUS-2c §10](../phase2c/STATUS-2c.md)): §1.0 row 2, §2.6, §3.3, §3.4, §5.3 and §6 #1 updated from the user's second first-hand report · Owner: game design

> **Phase 2c (2026-10-09).** The user, who plays the Play Store app, reported four facts first-hand that override our research ([01](../phase1/01-game-deconstruction.md) "First-hand update"; source tag **user, first-hand, 2026-10-09**): **fish are the lives** (the app shows fish, not hearts); **the fish left when a level is passed are added to the leaderboard points**, which are ranked **per period** (a total that resets); **level points** grow when you make no mistakes (streak-like); and our **fish currency was an invention** (wallet, swaps, fish packs, the fish pill "+"), now removed. The build implements them per [fish-lives-spec](../phase2c/fish-lives-spec.md) ([STATUS-2c](../phase2c/STATUS-2c.md)). Where the user gave no number (period length, points values, which modes count), our values are `[DECISION: default, user may change]`.

> **Phase 2c.1 (2026-10-10).** The user then reported the **exact level-points rule** first-hand ([01](../phase1/01-game-deconstruction.md) "First-hand update (2026-10-10)", row 10.17; source tag **user, first-hand, 2026-10-10**): level points belong to **one level** and start at 0 with every level and every Retry; each correct cat found adds **96 × (5 + s)** (s = correct cats in a row since the start or the last mistake: 576, 672, 768, …; an unbroken run totals 576, 1 248, 2 016, 2 880, 3 840, 4 896, 6 048, 7 296, 8 640, 10 080); a mistake removes nothing but resets the run; hint and kitty cats count like the player's; the total is shown **during play** and **at the win**. Our Phase 2c formula (10 × n, × 2 Hard, plus a bonus for perfect wins in a row, "Perfect ×N") was our reading of the earlier "streak-like" report and is replaced. The rows below say what the **built** Phase 2c did and what Phase 2c.1 changed ([fish-lives-spec §3.1–§3.2, §10](../phase2c/fish-lives-spec.md)). **2c.1 is built** (STATUS-2c §10, 2026-10-10): these rows are now parity for the rule and the numbers; the HUD counter's look and the victory row are our own design (the original's look is not reported).

This document compares our rebuild (working tree of 2026-10-07) with **"Meowdoku: Brain Puzzle Games"** by Oakever Games (`com.oakever.meowdoku`) as found on **Google Play**.

**How to read this**

- **Inputs.** The comparison uses two profiles compiled on 2026-10-07.
  - *Ours* was read from the code, the config and the level data. Every claim about our build is confirmed.
  - *The original's* combines Phase 1 research ([01](../phase1/01-game-deconstruction.md), [SOURCES](../phase1/SOURCES.md)) with about 70 new web searches. Store, press and catalogue pages could be read only through search summaries; GitHub was the only source read first-hand. We downloaded no code, art, audio or level data from the original, and opened no source listed in [06 §4](../phase1/06-legal-and-originality.md).
- **Verification pass (2026-10-07).** A second reviewer re-checked every row on both sides.
  - *Ours:* re-read against the current working tree (`src/app/config.ts`, the CSS, the overlays, the level and daily packs). Wrong numbers were corrected.
  - *The original's:* the two Android tools were re-read first-hand: the [hrafsa] solver's README and source, and the [leist] macro's README. Store, event and review claims were searched again.
  - Claims that could not be found again were **downgraded to *inferred*** and marked "not re-found". These are: the event "premium pass", the event top 100, the sound and "intense effects" quotes, the breaking heart on Play, and banners "from level 10".
  - The headline (§1) now ranks only verified differences. Unverified ones are listed separately below it.
- **Confidence labels** apply to the original only: *confirmed* · *likely* · *inferred* · *unknown*. A claim about the original is never stated more strongly than its label.
- **Which version of the original.** When versions disagree, the **Play Store app** wins. Rows that rest only on iOS evidence or on the Yandex web build ("Web-Y") say so. Where the Play app's behaviour was unknown, our spec followed Web-Y (02 §0), so some rows note "we match Web-Y; Play differs or is unknown".
- **Tags:**
  - **[gap]**: the original has it and we don't.
  - **[extra]**: we have it and the original doesn't.
  - **[different-by-design]**: a deliberate difference, made for originality, because of a platform constraint (FB Instant Games or the web), or by a spec decision.
  - **[unknown]**: the original's behaviour is not established.
  - *parity*: no material difference.
- **Screenshots.** The `app-*` images in `docs/phase2/screenshots/` were re-captured at 06:36–06:42 UTC. That is after the 05:55 CSS pass, so they show the current teal `#17806F` and the solid win and fail card. Some images are older and predate that pass: `board-*`, `shell-*` and `app-fbig-*`, taken 01:09–02:12 UTC. `base.css` and `board.css` changed again at 06:39–06:42, so re-capture before any pixel-level comparison.

---

## 1. Headline: the biggest differences a player would notice

### 1.0 Status after Phase 2b (2026-10-09)

Phase 2b ([parity-spec](../phase2b/parity-spec.md)) set out to close all eight headline differences below, following the original wherever its behaviour is known, except where a platform rule, the clean-room rules or an unknown forbid it ([parity-spec §0.7](../phase2b/parity-spec.md)). The rows below describe the integrated build; the original's side is unchanged from this document's 2026-10-07 research (nothing was re-sampled, R6). "Closed" means a player meets the same kind of thing at the same moment; what is still ours (art, words, values) is listed with its reason.

| # | Headline | Status | What the build does now | What remains different, and why |
|---|---|---|---|---|
| 1 | Cat and colour identity | **Closed** | One theme, the Classic look: "Tux", our own black-and-white tuxedo-style cat (4 moods, 6 poses, idle loops), orange buttons and titles, white X marks, even gutters, an off-white page. The ginger cat, teal tokens, dark X and region-aware gaps are gone | Tux is drawn by us with its own signature marks (a notched ear, an asymmetric blaze) and its own poses; every colour and size is our own value (legality, R1/R6). A thin tinted edge under the white X (WCAG 1.4.11; accessibility minimum). The trade-dress risk of the combination is accepted by the user and gated by G-LEGAL (§4) |
| 2 | Win flow | **Closed** (Phase 2c: corrected to the user's report) | Glow at 0.3 s → this week's points counter fades in at 1.0 s → **the lives still left (1–3 fish) lift off the lives pill and fly to the counter** (from 1.2 s, 150 ms apart; each life turns empty as its fish leaves) → "+N" → scrim → ranking panel at 4.2 / 4.35 / 4.5 s for 1 / 2 / 3 fish → tap → victory screen with the level points, a "Perfect ×N" streak chip after a no-mistake win, the fish kept and this week's total, and the wide orange "Level N". No currency: fish are only lives and leaderboard points. **Phase 2c.1 (specified 2026-10-10, not built):** the level-points counter stays in the pills row through the win flow showing the level's total, the period counter appears in the cat counter's place, and the victory shows the level's total ("7,296 points") with no streak chip | Our own fish art and words ("fish", never "golden fish"), timings fitted to the reported wait times rather than measured, our own victory layout (the original's is unknown), ~~our points numbers `[DECISION: default]`~~ (2c.1: the level-points numbers are the user's) |
| 3 | Ad load | **Partly closed** | FBIG: interstitials at the original's reported 120 / 100 / 90 s cadence after 10 completed levels (unchanged); banners now on Home, the victory and the event screen from 10 completed levels, with a 58 px reserve, when the SDK reports both banner APIs; a "No Ads" purchase | Banners never during play (Meta's guidance), and the production web build has no ads at all (no ad network: a free hint, kitty or revive every 10 minutes instead). Banner placement rules await G4 on developers.facebook.com |
| 4 | Limited-time events | **Closed** | Three of our own events (Lantern Walk, Snow Paws, Yarn Hearts; 21 puzzles each, milestones with rewards), a Home card (teaser, active, locked, done), an event screen, an event mode with its own board, and an event top list (FB board; personal results on the web) | Our own names, themes and art (legality; G8 clears the names); the contents (puzzle count, milestones, no paid pass) are our choice because the original's are unknown |
| 5 | Rankings and identity | **Partly closed** | Phase 2c: **one points leaderboard per period** (UTC weeks from Monday 00:00 UTC `[DECISION: default]`): every counted win adds the fish kept; the post-win panel always shows it ("Weekly ranking", "+2 fish · This week: 42"), Home shows this week's total, and the hub's first tab is "This week" (the 2b paw-points board is retired and "today's fastest" is off by default; event boards stay). Also a rankings hub behind the Home trophy, FB leaderboards through a probe (classic, NEZP or none) and overlay views, "Your rank" / "Your score", and an honest personal-records fallback at every step; group challenges implemented and tested | Other players' names appear only inside FB overlay views, never on the web (platform: the web has no shared backend). Group challenges stay behind a flag until G2 (no standings API found; reward policy unverified). Every FB SDK detail is unverified until G1/G3 ([fb-dashboard](../phase2b/fb-dashboard.md)). No login beyond the FB identity |
| 6 | Language | **Partly closed** | 17 locales (English plus 16 AI-drafted catalogues), resolved from `FBInstant.getLocale()` or `navigator.languages`, a Settings override, Intl plural rules, Latin digits, Arabic right to left with an LTR board | Release builds ship English only until a native reviewer approves each locale (`i18n.releaseLocales`; a process gate, not code). 17 against the iOS app's 62 locales (the Android list is unknown; more can follow in Phase 3) |
| 7 | Accessibility | **Kept by design** (user decision) | Colour patterns, Reduce motion, screen-reader labels and full keyboard play still work, now also on every new screen; the defaults look like the original (patterns off, even gutters, white X) | These remain our extras: the user chose to keep them (headline 7) |
| 8 | Purchases | **Partly closed** | FBIG on facebook.com and Android: a shop (Settings → Shop) with **three** products (No Ads kept as a save entitlement, a hint pack, a kitty pack), the purchase / consume / boot-restore order, and paid grants that survive a save merge. Phase 2c removed the fish packs and every fish swap (fish are not a currency); a retired fish pack still in a ledger or unconsumed is compensated in hints and kitties | No purchases on iOS, Messenger.com or the web (no shop there at all), and no subscriptions (platform). The payment details await G5 |

The unverified rows further down moved too: the **motion** gap is mostly closed (a board-entry wave with its own soft cue, screen transitions, board-cat breathing and ear flicks, the win flow; Phase 2c replaced the heart break with our own **fish loss**), and group rewards added a small **helper economy** beside the starting stocks (Phase 2c removed the fish swaps). **Board sizes** of the campaign are unchanged and still unknown on the original's side.

After the Phase 2b code review (2026-10-09; STATUS-2b §11) three smaller rows moved: the **daily** is 12×12 every second Sunday from 2026-10-18 (§2 "Daily"), **Settings** can show a Feedback link (web; FBIG once Meta's link rules are checked) and a Language row (§2 "Settings"), and the victory screen is **dark** like the original's overlays (parity-spec §2.5).

### 1.1 The Phase 2 headline (2026-10-07, for reference)

The list is ranked by how much a player would notice each difference. It includes only differences where both sides are verified: our side in the code, the original's at *likely* or better.

1. **[different-by-design] Cat and colour identity, on every screen.**
   - *Ours:* a ginger tabby, teal buttons, dark-ink X marks, and region-aware gaps (3 px inside a region, 7 px between regions).
   - *The original (likely):* a dark-furred cat, probably a tuxedo. The Android solver finds placed cats by their dark pixels. It also has orange buttons and titles (Android tools), white X marks (iOS and Web-Y evidence), and even white gutters.
   - Both games put the board on an off-white page.
2. **[gap] Win flow.**
   - *The original (likely, Android tools):* after the last cat comes a three-golden-fish collection; a solver waits 4.5 s for it. Then a dimmed full-screen leaderboard appears, then a victory screen with an orange "Level N" button. An Android macro waits about 8 s after the last cat before it closes the leaderboard.
   - *Ours:* one overlay with a cat hop, 40 confetti pieces and Next enabled at 1.8 s. There is no reward and no ranking.
3. **[different-by-design] Ad load.**
   - *The original:* Android Central (June–July) saw an interstitial after almost every level (*likely*). Banners are reported from a single origin; the level they start at is not re-found.
   - *Ours, production web build:* no ads at all. Instead, one free hint, kitty or revive every 10 minutes.
   - *Ours, FBIG build:* the reported 120 / 100 / 90 s interstitial cooldown, starting after 10 completed levels. No banners.
4. **[gap] Limited-time events.**
   - *The original (confirmed):* Google Play ran at least three themed event cards for it in summer 2026.
     - Long Live Meow (World Cat Day, stained glass) ended 8/12.
     - Meow Cup (a stadium theme, with a leaderboard) has unknown dates.
     - Moonlit Meows (harvest moon) ended 10/1.
   - A review mentions an event ranking list (*likely*, probably iOS). A paid "premium pass" was not re-found (*inferred*).
   - *Ours:* no events or seasonal skins.
5. **[gap] Rankings and identity.**
   - *The original:* a post-win leaderboard (*likely*, Android tools), an event leaderboard (the Meow Cup card), and "group challenges" that pay out kitties (*likely*, one iOS review). An Android macro expects the player to be logged in (*likely*).
   - *Ours:* no leaderboard and no login. The spec defers both to Phase 4 (02 §4.1, 05 §8).
6. **[gap] Language.**
   - *The original (likely):* a localized UI. An Android solver reads the Indonesian strings for the leaderboard and "tap to continue", and the App Store lists 62 locales.
   - *Ours:* English only.
7. **[extra] Accessibility.**
   - *Ours:* optional colour-pattern glyphs, Reduce motion, screen-reader labels and full keyboard play.
   - *The original (confirmed):* regions differ by colour alone. A colour-blind Android reviewer could not tell some regions apart, even with Android's colour-correction settings.
8. **[different-by-design] No purchases.**
   - *The original (likely):* the Play listing shows "In-app purchases", and iOS sells Premium and Premium Plus subscriptions. The Android catalogue is unknown.
   - *Ours:* no in-app purchases, subscription or remove-ads option (02 §13.1; FBIG payments are not available on iOS, 05 §9).

**Possible differences, not yet verified** (the original's side is *inferred* or *unknown*; settle them with §6 before acting):

- **[unknown] Board sizes.**
  - *Ours:* 247 of our 1,000 campaign levels are 11×11 or 12×12. At 12×12 on a 360 px phone that gives 25 px slots, with tiles of about 18–22 px.
  - *The original:* the evidence is mixed.
    - One Android solver detects only 5×5 or 6×6 up to 10×10 boards.
    - An Android macro is built for 4×4 to 12×12.
    - iOS fixtures show L351 at 8×8, L428 at 10×10, and a 12×12 daily.
  - Our campaign *may* feel larger and denser.
- **[unknown] Motion and "life".**
  - *The original:* the board animates in (*likely*: a macro's notes blame a still-animating board for misreads). Its cat is reportedly animated with Spine, which is unverified. Animated screen transitions are *inferred*.
  - *Ours:* cats blink, drop in and hop. Mood faces swap without a tween, screens swap instantly, and the board entry lasts 250 ms.
- **[unknown] Helper economy.**
  - *Ours:* 5 hints and 3 kitties at the start. Our kitty places a correct cat, and a revive gives +1 heart once per attempt.
  - *The original:* unknown starting stocks, kitty behaviour (place or highlight) and revive size. One non-ad refill is reported (*likely*, one iOS review): winning a group challenge gives 2 kitties, or 4 after an ad.

---

## 2. Content differences

The *Conf.* column gives our confidence about the original.

### 2.1 Core rules and mistake model

| Aspect | Original (Play Store) | Ours | Type | Impact | Conf. |
|---|---|---|---|---|---|
| Rules | N×N board; one cat per colour, row and column; cats never touch, diagonals included; "solvable without guessing" | Same rules, 4×4 to 12×12, a unique solution per level, our own chip wording | parity | — | confirmed |
| Wrong cat | Checked against the stored solution; the cell becomes a locked red X; every cat on the board is correct | Same model (02 §8) | parity | — | likely (iOS + Web-Y; not seen on Android) |
| Lives | 3 per level, one lost per wrong cat; no energy. On Play the lives are **fish** (user, first-hand, 2026-10-09); a breaking-heart effect is seen only on Web-Y | Phase 2c: 3 fish per attempt; no lives pool | parity | — | confirmed |
| Losing | At 0 lives, a defeat screen with Retry; a rewarded revive is reported | At 0 fish ("Out of fish"): Continue +1 fish (once per attempt, and only when a rewarded ad or the web's free grant is available), Retry, Home | parity (revive size **[unknown]**) | low | confirmed (Retry, Android macro), likely (revive) |
| Time | No time limit; solve time is measured for leaderboards | No limit; time is recorded but shown only on the daily result | parity | low | likely |

### 2.2 Controls and input

| Aspect | Original (Play Store) | Ours | Type | Impact | Conf. |
|---|---|---|---|---|---|
| Tap | Marks an X; marks are free and never checked | Same (instant toggle) | parity | — | likely |
| Double-tap | Places a cat (a two-tap cycle: X first, then cat, per an Android macro) | Same model; the second tap must come within 300 ms | parity | — | confirmed (double-tap), likely (X-then-cat cycle) |
| Swipe to mark | Not verified on Play (Web-Y has it) | A swipe paints or erases X marks | **[unknown]** | med | unknown |
| Remove a cat | Not verified on Play (Web-Y: double-tap) | Double-tap removes it, no penalty | **[unknown]** | low | unknown |
| Undo | None reported; Japanese complaints about mis-taps suggest there is none | None | parity (probable) | — | unknown |
| Auto-X | Only as part of a hint (faint X marks, per a Japanese Q&A, platform not stated); no auto-X in normal play is seen only on Web-Y | Only from an applied hint | parity (probable) | — | likely (hint X), unknown (normal play on Play) |
| Keyboard and mouse | Not applicable (mobile app) | Arrow keys, Space, Enter, H and K; the mouse works like touch | **[extra]** (web/desktop platform) | low | n/a |

### 2.3 Progression, level count and board-size ramp

| Aspect | Original (Play Store) | Ours | Type | Impact | Conf. |
|---|---|---|---|---|---|
| Structure | One numbered sequence started from an orange level button; no level or difficulty select | Same, started from a teal Level button | parity | — | likely |
| Level count | At least 428 seen (iOS); players report 700 to 1,000+; store art promises "endless"; whether the bank is finite or recycled is unknown | 1,000 shipped levels, then endless boards generated on the device | **[unknown]** | low | likely |
| Size mix | Mixed sizes up to 12×12; L351 is 8×8 and L428 is 10×10 (iOS fixtures); a 12×12 daily (iOS fixture). Android tools disagree: one solver detects only 5–6 up to 10, while a macro is built for 4×4 to 12×12 | A 4×4 tutorial, then mixed 5×5 to 12×12. The campaign has 249 levels at 8×8, 245 at 9×9, 221 at 10×10, 168 at 11×11 and 79 at 12×12; the first 11×11 is L104 and the first 12×12 is L310 | **[unknown]**: ours may skew larger | med | likely (range), inferred (Android mix) |
| Hard levels | YouTube titles flag levels 160, 170 and 180 as hard. An Android solver taps a victory-screen element labelled "Kelas Master" ("Master class"); its meaning is unverified | Every 10th level from level 30 is Hard, with a purple badge (98 levels) | **[unknown]** (the pattern may match) | low | inferred |
| Early levels | AndroidWorld: the first cats are usually easy to place and set off a chain reaction through the rest of the board | Level 1 is the tutorial; levels 2 to 20 are 5×5 to 8×8 | parity (probable) | low | likely |

### 2.4 Modes

| Aspect | Original (Play Store) | Ours | Type | Impact | Conf. |
|---|---|---|---|---|---|
| Daily | A new puzzle every day, separate from the campaign; can be 12×12 (iOS). Store copy pairs dailies with global fastest-time leaderboards; a daily-specific ranking was not re-found. Unlock level (fan claim: about 21), reset time and streaks are unknown | Unlocks after level 20; size by weekday from 8×8 to 11×11, and **every second Sunday from 2026-10-18 a 12×12** (Phase 2b review PAR-1); the victory screen with the solve time and the next-puzzle countdown; a `daily_fastest` ranking on FBIG (personal records on the web); no streak or archive | *parity* (12×12 every other Sunday; the FBIG daily ranking, Phase 2b), **[unknown]** (unlock, reset) | med | confirmed (exists), likely (12×12, leaderboard promise) |
| Limited-time events | At least three themed Google Play event cards in summer 2026: Long Live Meow (World Cat Day, ended 8/12), Meow Cup (stadium theme, with a leaderboard; dates unknown) and Moonlit Meows (harvest moon, ended 10/1). The card texts describe the same placement rules in a seasonal setting. In-event rewards and mechanics are unknown | None (the Home card slot is empty) | **[gap]** | high | confirmed (cards exist), likely (same puzzle, reskinned) |
| Other modes | None reported (no endless, zen, PvP or time attack) | None; the campaign continues endlessly | parity | — | unknown (absence) |

The Google Play event card that ended on 9/23 ("Meowdoku Mode") belongs to *Block Crush!* by Wonderful Studio, so it is **not** a gap (*likely*; this corrects Phase 1 §10.15).

### 2.5 Helpers (hints, kitty, revive, hearts)

| Aspect | Original (Play Store) | Ours | Type | Impact | Conf. |
|---|---|---|---|---|---|
| Hint | A lightbulb lights one cell that can be deduced next, with a one-line reason, and can preview faint X marks. Hints are limited and refilled by ads or an "in-game reward system" | A lightbulb dims the board, previews ghost Xs or a ghost cat, and Apply commits the step. 5 at the start; +1 per rewarded ad (web: free fallback). The Apply flow follows Web-Y | **[unknown]** (stock, non-ad refill) | med | confirmed (exists), likely (details) |
| Kitty | A "kitty" button pinpoints where a cat is; it is limited; whether it places the cat or only highlights it is unknown | The paw places one correct cat; 3 at the start | **[unknown]** | med | confirmed (exists, Apple editorial), unknown (behaviour) |
| Lives | **3 fish per level**; the game shows fish everywhere, not hearts (user, first-hand, 2026-10-09; App Store screenshots show hearts: iOS or an older version) | Phase 2c: 3 fish in the lives pill (our own fish icon and empty outline); a wrong cat costs one with our fish-loss animation | parity | high | confirmed |
| Losing | At 0 lives the attempt is lost; retry exists, a revive is likely offered first (01 5.6–5.7) | "Out of fish": Continue (+1 fish, after a video or free), Retry, Home | parity | med | confirmed (retry), likely (revive) |
| Revive | Rewarded video from level 1; how many fish it restores and how often it is offered are unknown | Once per attempt, +1 fish, the board is kept | **[unknown]** (size) | low | likely (single origin) |
| Stocks and refills | Starting counts and refill per ad are undocumented. One iOS review: winning a "group challenge" gives 2 kitties, or 4 after an ad | 5 hints and 3 kitties; +1 per ad; on web, one free grant per 10 minutes shared by all three helpers | **[unknown]** | med | unknown (stocks), likely (group-challenge kitties, one review) |

### 2.6 Meta and economy

| Aspect | Original (Play Store) | Ours | Type | Impact | Conf. |
|---|---|---|---|---|---|
| Post-win reward | The fish after a win are the **lives kept**; they are added to the leaderboard points (user, first-hand, 2026-10-09). An Android solver waits 4.5 s for the fish animation | Phase 2c: the kept fish fly from the lives pill to this period's counter and are added to the period total; no currency (2b's fish wallet, swaps and packs are gone) | parity (our own art, timings and numbers `[DECISION]`) | high | confirmed |
| Points and rankings | **Leaderboard points per period** (a total that resets), fed by the fish left at each win; separately, **level points** that grow when you make no mistakes, streak-like (user, first-hand, 2026-10-09). **Level points exactly (user, first-hand, 2026-10-10):** per level, from 0 (also on Retry); each correct cat adds 96 × (5 + s), s = cats in a row since the start or the last mistake (576, 672, 768, …; totals 576 … 10 080 for 1–10 cats); a mistake removes nothing but resets the run; hint and kitty cats count; shown live and at the win. A review says points come only in multiples of 5: contradicted for level points ([01](../phase1/01-game-deconstruction.md) §18 entry 14) | Phase 2c (built): period points = fish kept × 1 per counted win (level, daily, event), UTC weeks; level points = 10 × n (× 2 on Hard) + 10 × the perfect streak (capped at 10), shown only on the victory. **Phase 2c.1 (specified, not built):** level points follow the user's rule exactly (`levelPoints.firstIncrement` 576, `step` 96), a HUD counter shows the running total with a "+N" per cat, the victory shows the level's total; the cross-level streak is gone. Ours (`[DECISION]`): a removed cat changes nothing and a cat put back scores nothing; dailies and events score the same way, the tutorial does not | **[gap]** until 2c.1 is built, then parity for the rule and numbers (period numbers still ours, `[DECISION: default, user may change]`) | med | confirmed (rule and numbers), unknown (period) |
| Event pass | A "premium pass" with a paid track was reported with an event; it was **not re-found** in three searches | None | **[unknown]** | low | inferred |
| Streaks, collections, skins | A no-mistake streak raises the level points (user, first-hand, 2026-10-09); **2026-10-10:** that streak is the run of correct cats **inside one level**, not a run of wins (user, first-hand). Collections and skins not observed (they appear only in clones) | Phase 2c (built): a cross-level perfect streak of wins ("Perfect ×4" on the victory screen; current and best in the records). **Phase 2c.1 (specified):** only the per-level cat run of the level-points rule; the cross-level streak, its chip and its records row are removed. No collections or skins | **[gap]** until 2c.1 is built (our 2c streak is an invention), then parity | — | confirmed (streak), unknown (rest) |
| Energy | None; lives (fish) reset every level | None | parity | — | confirmed |

### 2.7 Social

| Aspect | Original (Play Store) | Ours | Type | Impact | Conf. |
|---|---|---|---|---|---|
| Leaderboards | A full-screen leaderboard after every win on Android that ranks **points per period** (a total that resets; the fish left at each win are added: user, first-hand, 2026-10-09); "fastest completion times" in the store copy; an event leaderboard (Meow Cup card); "group challenges" (one iOS review); players call the boards fake or full of bots. An "event top 100" was **not re-found** | Phase 2c: one FB board `period_points` read in this UTC week's band (my rank exact at any depth), shown after every scored win and as the hub's first tab; event boards on the event screen; personal period records on the web. Phase 4 creates the board in the dashboard | parity (period length ours, `[DECISION]`) | high | confirmed (period points), likely (post-win modal, groups), inferred (top 100) |
| Account | An Android macro requires a logged-in player. Facebook login rests only on a ReVanced patch list that 06 §4 forbids us to open; guest play is not documented | None on web; on FBIG, the FB player identity and cloud save | **[different-by-design]** (platform) | low | likely (logged in), inferred (Facebook, guest) |
| Sharing | None documented | None | parity (probable) | — | unknown |

### 2.8 Monetization

| Aspect | Original (Play Store) | Ours | Type | Impact | Conf. |
|---|---|---|---|---|---|
| Interstitials | Between levels after a win or a fail, never mid-board, after a grace period. Accounts of the start level conflict: about level 10, about level 12, or later (01 §11.5). Cooldown 120 / 100 / 90 s by tenure (single origin, re-found). Android Central (June–July) saw an ad after almost every level and no ad-free option | **FBIG:** on Next, Retry and Daily Done, after 10 completed levels and a 60 s session grace, with the same 120 / 100 / 90 s cooldown. **Production web:** none, because there is no ad network | **[different-by-design]** (platform) | high | likely |
| Banners | Reported as one of the ad formats; the level they start at (said to be about 10) was not re-found | Off | **[gap]** (by spec, 02 §13.1) | med | likely (exist, single origin), inferred (start level) |
| Rewarded | From level 1, for a revive or extra items | For hint and kitty when their stock is 0, and for the revive (Continue). The production web build has no ad network, so it gives one free grant every 10 minutes instead | parity on FBIG; **[different-by-design]** on web (platform: the free fallback) | med | likely |
| IAP and subscriptions | Play listing: "In-app purchases". iOS sells Premium (about $3.99/wk, $7.99/mo, $34.99/yr) and Premium Plus. An event pass is unverified (§2.6). The Android catalogue is unknown; fish are not sold (they are lives, user, first-hand, 2026-10-09) | Phase 2c, FBIG on facebook.com and Android only: three products (No Ads, a hint pack, a kitty pack), from Settings → Shop; no fish packs, no subscriptions | **[different-by-design]** (platform: no subscriptions; catalogue ours) | med | likely (iOS), unknown (Android) |

### 2.9 Onboarding and tutorial

| Aspect | Original (Play Store) | Ours | Type | Impact | Conf. |
|---|---|---|---|---|---|
| Tutorial | Store screenshots show it rule by rule, with a tap-hand pointer and the matching rule chip highlighted, ending on glowing cats. Whether that is one board or several is unknown (Web-Y: one 4×4 board, about 6 steps). A Japanese reviewer says intermediate techniques are never taught | One 4×4 board in 6 coach steps (dimmed board, gold ring, hand, chip highlight), including a swipe and a hint step; no hearts can be lost | parity (structure); **[unknown]** (number of boards) | low | confirmed (iOS store screenshots), presumed on Play |
| How to play, skip, replay | Not documented | A rules card with small illustrated boards; the tutorial can be skipped or replayed | **[extra]** / **[unknown]** | low | unknown |

### 2.10 Settings, localization and accessibility

| Aspect | Original (Play Store) | Ours | Type | Impact | Conf. |
|---|---|---|---|---|---|
| Settings | A Feedback entry (iOS); sound, music, haptics, language and reset are undocumented | Sound, Vibration, Colour patterns, Reduce motion, Language, Shop, How to play, About; a **Feedback** link when `support.feedbackUrl` is set (on FBIG only with `support.feedbackOnFbig`, off until Meta's external-link rules are checked; Phase 2b review PAR-5); no reset | *parity* (Feedback on the web, Language), **[different-by-design]** (no Feedback on FBIG yet: platform), **[unknown]** (the rest) | low | unknown |
| Localization | Localized Android UI (an Android solver reads Indonesian screen text); 62 locales listed on iOS | English only (a locale hook and about 230 catalogue keys exist) | **[gap]** (spec defers it, 02 §21) | high outside English markets | likely |
| Colour-blind support | None; Android's colour-correction settings did not help a colour-blind reviewer (Pocketables) | Optional pattern glyphs; the palette is checked by script (pairwise CIEDE2000 ≥ 10) | **[extra]** (an accessibility minimum, 02 §0) | med | confirmed |
| Other accessibility | Unknown | Screen-reader grid labels, keyboard play, Reduce motion, text that survives 200% zoom | **[extra]** / **[unknown]** | low | unknown |
| Orientation, offline, dark mode | Portrait; fully offline (store copy); no dark mode known | Portrait, with a rotate notice in landscape; loads over the web with no offline install; no dark mode | **[different-by-design]** (offline: platform) | low | likely |

---

## 3. Visual and animation differences

### 3.1 Art direction and character

| Aspect | Original (Play Store) | Ours | Type | Impact | Conf. |
|---|---|---|---|---|---|
| Overall style | Cute, calm and minimal: off-white or cream page, saturated pastel tiles, muted chrome. Orange appears on the main-menu level button, the victory "Level N" button and the leaderboard title (Android tools) | Cute, calm and minimal: warm paper page (`#FBF6EE`), white cards with soft shadows, teal accent `#17806F`, Fredoka headings, all art hand-coded SVG | **[different-by-design]** | high | confirmed (style), likely (orange) |
| Cat on the board | Cat head with dark (black) fur, probably a white face. An Android solver detects placed cats as dark pixels, which fits. It is reportedly Spine-animated (unverified) | Ginger tabby head at 82% of the cell, with four moods (idle, happy, sad, surprised) and blinking | **[different-by-design]** | high | likely |
| Full-body illustrations | Unknown on Play; Web-Y has a trumpet-playing win cat and a crying fail cat | Party-hat win cat, bandaged fail cat, sleeping boot cat, calendar cat for the daily, breathing Home mascot | **[different-by-design]** | med | unknown (Play) |
| Seasonal theming | Event themes from the Play cards: a stadium (Meow Cup), stained-glass royal cats (Long Live Meow), a harvest moon (Moonlit Meows). Whether they reskin the board, the background or only the event entry is unknown | None | **[gap]** (comes with events) | med | likely |

### 3.2 Board look

| Aspect | Original (Play Store) | Ours | Type | Impact | Conf. |
|---|---|---|---|---|---|
| Tiles | Rounded flat tiles separated by evenly spaced white gutters, on an off-white page; no grid lines or region borders. The white gutters suggest a white board area, as on Web-Y's white card | Rounded flat tiles on a white card with a shadow. Each tile is inset 1.5 px toward its own region and 3.5 px toward another region, so gaps are 3 px inside a region and 7 px between regions; no grid lines | **[different-by-design]** (region-aware gaps) | med | confirmed (tiles, gaps, no strokes), likely (even gutters, white board area) |
| Palette | Vivid and muted pastels, up to 12 colours | Our own 12 named colours (pairwise CIEDE2000 ≥ 10); each region gets the unused colour that differs most from its neighbours | **[different-by-design]** | med | confirmed (character), likely (12 colours) |
| Player's X | Thick white cross with round caps (hard to see on yellow) | Dark ink X at 70% opacity | **[different-by-design]** | med | likely (iOS + Web-Y) |
| Wrong cell | Red or crimson X | Crimson X with a 2 px ring | parity | — | likely |
| Completed region | Its colour fades or mutes (reportedly added in a 2026 update) | A 45% veil of the page colour plus a 1.07 scale pop | parity | — | likely |
| Solved board | The cats glow | The cats turn happy and hop; no glow | **[gap]** (small) | low | confirmed (iOS store art), presumed on Play |
| Dark-bordered board | An Android solver also handles a board with dark separator lines; context unknown | None | **[unknown]** | low | inferred |

### 3.3 Screens and layout

| Aspect | Original (Play Store) | Ours | Type | Impact | Conf. |
|---|---|---|---|---|---|
| Home | Main menu with a prominent orange button for the current level; where the Daily and Event entries sit is unknown | Wordmark, mascot, teal Level pill with a Hard badge, Daily card, and two pills for hint and kitty stock | **[unknown]** (layout), **[gap]** (event entry) | med | likely |
| Level screen | "Level N" title, lives (fish on Play, user first-hand 2026-10-09; hearts in iOS art), 3 rule chips, board, hint and kitty buttons below; a cats-remaining counter is reported; a banner may appear. **The level's points are shown as a running total during play** (user, first-hand, 2026-10-10; where and how is not reported) | Same order: title with Home and Gear, a counter and lives row (3 fish, Phase 2c), 3 chips, board, 2 round tool buttons; no banner. **Phase 2c.1 (specified):** a points counter centred in the pills row between the cat counter and the lives (our own design) | parity; **[gap]** (the running points) until 2c.1 is built | low | confirmed (fish, running points), likely (rest, mostly iOS) |
| Win | Fish animation (the lives kept going to the leaderboard points: user, first-hand, 2026-10-09), then a dimmed full-screen leaderboard (orange title, yellow "tap to continue" text), then a victory screen with a wide orange "Level N" button, then possibly an interstitial | Phases 2b–2c: the kept fish fly from the lives pill to the period counter, then the ranking panel ("Weekly ranking", orange title, "Tap to keep going"), then a dark victory screen (praise, our win cat, the kept fish and this week's total, "+N points" and "Perfect ×N", a wide orange "Level N" and Home). **Phase 2c.1 (specified):** the level's total ("7,296 points") above the kept-fish row, no "Perfect ×N"; the points counter stays visible through the win flow | parity (our own layout and art) | high | likely (Android tools), confirmed (what the fish are; the level total shown at the win, user, first-hand, 2026-10-10) |
| Fail | A defeat screen with Retry and a revive offer; its look is unknown | A card with "Out of fish" (Phase 2c), the bandaged cat, Continue "+1" with a fish, Retry and Home | **[unknown]** (look) | low | likely (flow) |
| Boot | Not documented (native app) | Web loading screen with the sleeping cat and a progress bar | **[different-by-design]** (platform) | low | unknown |

### 3.4 Animation by event

Original times are not measured; our times come from `GameConfig` and the CSS.

| Event | Original (Play Store) | Ours | Type |
|---|---|---|---|
| Board entry | The board animates in (*likely*). A macro's notes blame a still-animating board for misreads (it retries), and a solver waits 3 s after Next before reading the new board, which includes any load time. The style is unknown | Tiles fade in and scale from 0.9 to 1, 8 ms apart per row, finished within 250 ms; input unlocks at 250 ms | **[unknown]** (ours is probably shorter) |
| Tap X | No description (*unknown*) | Two strokes draw in over about 120 ms, with a soft tick and a 6 ms vibration | **[unknown]** |
| Swipe X | Swipe not verified on Play | Each painted cell gets the same draw-in | **[unknown]** |
| Clear X / remove cat | No description (*unknown*) | Instant; the cell clears with no fade | **[unknown]** |
| Cat placed | A positive sound and an animation were reported in an Android review; **not re-found** (*inferred*). The form is unknown. **The level's points rise by the cat's increment** (576, 672, …; user, first-hand, 2026-10-10); how the rise looks is not reported | The cat drops in with an overshoot (280 ms), the counter icon bumps, and a pop plus two chirps sound. **Phase 2c.1 (specified):** the points counter rolls to the new total (360 ms) and a "+N" chip rises 6 px and fades (700 ms); no extra sound (ours) | **[unknown]** (the look); the rise itself parity once 2c.1 is built |
| Mistake | The cell becomes a red X (*likely*, iOS solver + Web-Y); a life (a **fish** on Play: user, first-hand, 2026-10-09) is lost; how the loss looks is unknown. No points are lost, but the level-points run resets (user, first-hand, 2026-10-10; whether anything shows it is not reported). Web-Y adds a broken-heart effect, a shake, sad cats, a sound and a vibration; none is verified on Play | A red flash and a ±6 px board shake (300 ms); Phase 2c **fish loss** (ours, 700 ms): the fish wriggles, flips out belly-up and falls with three droplets while its empty outline fades in, and the pill shakes (400 ms); every cat looks sad for 1.5 s (unless it was the last fish), a thud, and a 30-40-30 vibration | **[unknown]** (the original's look) |
| Region complete | The colour fades or mutes (*likely*); any burst or sound is unknown | A 1.07 scale pop and a veil fade (400 ms), with a chime that rises one step per completed region | parity (chime **[unknown]**) |
| Level win | Glowing cats (iOS store art); a fish collection that a solver allows 4.5 s for, which is the **lives kept going to the leaderboard points** (user, first-hand, 2026-10-09); then the leaderboard (*likely*). A quote about "intense effects and sound" was **not re-found** (*inferred*) | Phase 2c: glow and happy cats at 300 ms; the period counter at 1.0 s; the 1–3 fish still in the lives pill lift off and fly to it from 1.2 s, each life emptying as it leaves, "+N" on the last arrival; scrim, then the ranking panel at 4.2–4.5 s; the victory screen after a tap. Phase 2c.1 (specified): the same times; the level-points counter stays lit with the level's total, and the period counter appears in the cat counter's place | parity (our own art and timings) |
| Level lose | No description (*unknown*); Web-Y shows a crying cat on a dark overlay | The final mistake plays its full effect and the cats stay sad. At 800 ms the overlay appears; the buttons unlock at 1.4 s; the cat stays still; no sound plays for the overlay | **[unknown]** |
| Revive | No description (*unknown*); it gives back a fish on Play (lives are fish) | The fish pops back in (520 ms, overshoot) with two droplets and the cats return to idle; no sound | **[unknown]** (the look) |
| Hint | One cell lights up, with faint X marks (*likely*); the motion is unknown | The board dims to 45% (180 ms), the focus cells get a teal ring and glow, ghost Xs pulse, a ghost cat bobs, and the sheet slides in (220 ms); a bell sounds, and a whoosh on Apply | **[unknown]** |
| Kitty | No description (*unknown*) | A surprised cat drops in with a burst of six gold stars (620 ms) and sparkle pings | **[unknown]** |
| Screen transitions | Android tools pause 2–3 s between the leaderboard, the victory screen and the next level. That shows load or transition time, not an animation (*inferred*); the style is unknown | Screens swap instantly. Only overlays animate: the scrim fades, sheets and dialogs slide or pop in (220 ms), and the win or fail card pops in (260 ms) | **[unknown]** (possible gap) |
| Idle and ambient | No reliable description; Spine animation is reported only by an asset catalogue we did not open; Web-Y cats blink | Each cat blinks every 3 to 7 s; the Home mascot breathes and blinks; the boot screen has floating Zs; nothing else moves on the game screen | **[unknown]** |
| Reduce motion | None known | All motion jumps to its end state | **[extra]** |

### 3.5 Audio and music

| Aspect | Original (Play Store) | Ours | Type | Impact | Conf. |
|---|---|---|---|---|---|
| Sound effects | A sound for each correct cat and a bigger one on a win were reported but **not re-found**. No cue is verified on Play; Web-Y has cues for X, cat, error, region, win, fail, hint, buttons and board entry | 14 cues synthesised at runtime with WebAudio (mark, unmark, cat, region ladder, mistake, last heart, win, hint open, hint apply, kitty, UI; Phase 2b: fish pop, fish plink and a **board-entry** swell, `board_in`, played with every board-entry wave, review PAR-8), master at −12 dBFS | **[unknown]** (we match Web-Y's board-entry cue) | low | inferred |
| Music | Unknown (Web-Y has none) | None | **[unknown]** | med | unknown |
| Silent moments | Unknown | No sound for revive or the fail overlay; a restored won or lost board enters silently (it has no entry wave) | **[unknown]** | low | unknown |
| Ads | Interstitials are reportedly muted by default (the ad's own sound; single origin) | Our sound is muted while any ad shows | n/a | — | likely |

### 3.6 Haptics

| Aspect | Original (Play Store) | Ours | Type | Impact | Conf. |
|---|---|---|---|---|---|
| Vibration | The store copy promises "satisfying tactile feedback"; patterns and any toggle are unknown | Mark 6 ms, cat 14, kitty 14, mistake 30-40-30, last heart 60, win 20-30-20-30-40, UI 4, with a toggle. None in iOS web browsers (no `navigator.vibrate`). On FBIG, when the platform haptics API exists, every pattern becomes one generic tap | **[different-by-design]** (platform limits), **[unknown]** (patterns) | low | confirmed (store promise), unknown (patterns) |

---

## 4. What must stay different

These differences exist because the original's **expression** is protectable and its publisher is reported to be in active IP disputes ([06 §1](../phase1/06-legal-and-originality.md)). Closing a gap must never undo any of them.

| Element | The original's expression (do not copy) | Ours (keep) | Reference |
|---|---|---|---|
| Public name | "Meowdoku"; "Mewdoku" is one letter away (high confusion risk, *inferred*) | "Mewdoku" stays an internal code name; pick a distinct public name before Phase 4 | 06 §6.1–6.2 |
| Cat character | Tuxedo or dark cat heads and their Spine animations | **Reversed by user decision 2026-10-08 ([phase2b §0.3](../phase2b/parity-spec.md))**: Tux, our own tuxedo-style cat with its own signature marks and poses (Phase 2: a ginger tabby "loaf"). The original's art and animations are still never used | 06 §3 (Art), §5, §7 |
| Illustrations | Trumpet-playing win cat; crying cat hugging a broken heart | Party hat, bandage and our other poses | 06 §3 (Art), §7 |
| Trade dress | The **combination** of tuxedo cat, cream page, orange pill buttons and white X marks on pastel tiles | **Reversed by user decision 2026-10-08 ([phase2b §0.3](../phase2b/parity-spec.md))**: the Classic look brings the combination back as the only look; the residual risk is accepted, and a lawyer's review with the final public name (G-LEGAL) gates any public release. (Phase 2: teal accent, dark X, region-aware gaps, and no orange titles or buttons) | 06 §3 (Trade dress), §7 |
| Copy | Store phrases, including the rule names "Exclusive Territory" and "The Aloof Rule"; tutorial lines; hint sentences; praise words; chip wording; UI strings | Every string comes from `src/i18n/en.ts` and is written by us | 06 §3 (Text), §7 |
| Level layouts | The original's levels as reproduced by fan, walkthrough and solver sites | Levels generated by our engine; never import or "match" the original's levels | 06 §3 (Level content), §4 |
| Audio | Sound files, sound names, jingles | Synthesised recipes only | 06 §3 (Audio) |
| Numbers | Hex colours, millisecond timings and thresholds read from code or a teardown | Our own `GameConfig` values. Only behaviour observed through play and described in words may inform tuning | 06 §2, §3 |
| Store art | Sky-blue caption band with cat-ear decorations; the "Test your IQ" claim | Our own caption style (Phase 4) | 06 §3 (Branding), §7 |
| Event and reward wrappers (if ever added) | The event names (Meow Cup, Long Live Meow, Moonlit Meows) and the "golden fish" presentation | Our own names and art. This applies 06 §3 by analogy (*inferred*) | 06 §3 (Art, Branding) |

Rules, hearts, a lightbulb hint, a reveal helper, rule chips, a "Level N" title, tap-to-mark with double-tap-to-place, and portrait layout count as generic or functional, so sharing them is allowed (06 §3).

---

## 5. Gaps worth closing to be truly "as is"

Effort is rough: **S** up to about 1 day, **M** a few days, **L** a week or more or a platform dependency. These are gaps only, not feature designs.

### 5.1 Close for "as is" (the original's behaviour is known well enough)

| Gap | Effort | Notes |
|---|---|---|
| Localize the UI into the main Play markets | M | The catalogue hook exists (about 230 keys). Long strings need layout checks. Spec 02 §21 put this in Phase 3 or 4, so changing it is a **scope decision for the user**. |
| Ranking after a win and on the daily (FBIG) | L | Already planned for **Phase 4** (02 §4.1, 05 §8). Depends on live FBIG APIs; the web build has no backend. What is ranked (time or points) is still unknown (§6). |
| A longer win moment: a solved-board glow before the overlay | S | Evidence is iOS store art (*confirmed* there, presumed on Play). Use our own look and timing. |
| ~~A 12×12 slot in the daily schedule~~ **Done (Phase 2b review PAR-1)** | S | Every second Sunday from 2026-10-18 is a 12×12 G4 daily (02 §12); only those 58 days of the packs were regenerated. |
| Banner ads (FBIG only) | S–M | Parity only, and it makes play worse. Banners are single-origin, and their start level (said to be about 10) was not re-found. **A product call.** |
| ~~A Feedback link in Settings~~ **Done on the web (Phase 2b review PAR-5)** | S | The row shows when `support.feedbackUrl` is set (empty by default). On FBIG it stays off (`support.feedbackOnFbig`) until Meta's rules on external links are checked. |

### 5.2 Close only once the unknown is resolved (see §6)

| Possible gap | Effort if confirmed |
|---|---|
| Starting hint and kitty stock, kitty behaviour (place or highlight), revive size | S (config values) |
| Board-size mix of the campaign (if the original stays at 10×10 or below for long stretches) | M (ramp change plus regenerating the packs) |
| Background music (if the app has it) | M (own synthesised or commissioned track, plus a toggle) |
| Mistake extras, fail-screen motion, cat idle motion, longer board entry | S–M each |
| Animated screen transitions (Home, game, next level), if the app has them (*inferred*: Android tools only show pauses) | S |
| A paid event pass, if one exists (reported once, not re-found) | L (Phase 3) |
| Swipe marking and cat removal: no work needed if Play matches Web-Y; if Play lacks them, keeping ours is still fine (an **[extra]**) | none |

### 5.3 Leave for Phase 3 (listed only, not designed)

- ~~Golden fish and any post-win reward~~: resolved and built in Phase 2c (the fish are the lives kept, added to the period's leaderboard points; user, first-hand, 2026-10-09).
- Limited-time events and seasonal skins: these need a LiveOps pipeline and content, and their in-event mechanics are unknown. L.
- In-app purchases and subscriptions: FBIG payments are not available on iOS (05 §9). L.
- ~~Points in multiples of 5~~ (contradicted for level points by the user's first-hand rule, multiples of 96: [01](../phase1/01-game-deconstruction.md) §18 entry 14; the per-cat rule is specified in Phase 2c.1), event rankings and group challenges: these depend on leaderboards. M–L.
- The dark-bordered board variant: its context is unknown.
- **Not gaps:** streaks, collections, skins, undo, an auto-X setting and dark mode have not been observed in the original either. They are already on the Phase 3 idea list (02 §22).

---

## 6. Unknowns that block a confident comparison

Most of these can be settled by **one 30–45 minute session with the Play Store app on Android**. Note what you see **in words**, with rough durations counted in seconds, in the same style as 01. Don't pass screenshots or recordings to implementers, and don't open any source in 06 §4 (06 §2).

| # | Unknown | What it blocks | How to resolve (Play app) |
|---|---|---|---|
| 1 | ~~What golden fish are for~~ **Resolved 2026-10-09 (user, first-hand):** they are the lives kept, added to the leaderboard points (Phase 2c). **Level-points numbers resolved 2026-10-10 (user, first-hand):** 96 × (5 + s) per correct cat inside one level (Phase 2c.1) | — | Still open: the period's length and reset time, and the leaderboard points per kept fish (note the total before and after a win, and the day it drops to 0); what removing a placed cat does to the level points; whether dailies and events score level points |
| 2 | ~~What the post-win leaderboard ranks~~ **Partly resolved 2026-10-09 (user, first-hand):** points per period, a total that resets. Still open: whether the daily and events add their fish, whether the daily has its own ranking, and how "group challenges" work | The period board's defaults (`period.modes`) | After a daily win, check whether the total rises; find the group-challenge entry and note its rules and rewards |
| 3 | Starting hint and kitty stock, refill per ad, any free refill (one review: 2 kitties per group-challenge win) | Helper economy | Check the counters on first launch and after watching one ad |
| 4 | Kitty behaviour | Helper parity | Tap the kitty on an ordinary level: does a cat appear, or is a tile only highlighted? |
| 5 | Revive: when it is offered, hearts restored, limit per level | Fail flow | Lose a level on purpose, then lose again after reviving |
| 6 | Swipe marking, removing a cat, undo, a visible timer | Controls | Swipe across empty tiles; double-tap a placed cat; look for undo and timer UI |
| 7 | Board size of the campaign by level | Ramp (§1, possible differences) | Note the N×N size of levels 1–30 and of any level you reach past 100 |
| 8 | Ad cadence now: when banners start, and how often interstitials show | Monetization parity | Count interstitials over 10 consecutive levels; note when a banner first appears |
| 9 | Settings content, music, haptic patterns | Settings, audio, haptics | Open Settings and list every toggle; listen in the menu and in a level; note the vibration on a mark, a cat, a mistake and a win |
| 10 | Animations: mistake extras, fail screen, idle cat, transitions | Animation table (§3.4) | Describe each in one line with an approximate duration |
| 11 | Daily: unlock level, reset time, puzzles per day, streak or calendar | Daily parity | Check the Daily entry on a fresh install; check again just after local midnight |
| 12 | Android IAP catalogue: Premium, remove ads, packs | Monetization | Open any shop or Premium screen and note the product names and prices |
| 13 | What happens inside an event: board skin only, or rule or goal changes; rewards; ranking size; whether a paid pass exists | Event scoping (Phase 3) | Play the next Google Play event when one runs; note its entry point and each screen |
| 14 | The "Master class" label and the dark-bordered board | Hard-level parity | Note when either appears (level number, daily or event) |

These matter less and cannot easily be settled by playing: whether the level bank is finite or recycled, whether the cat really uses Spine, and whether the leaderboard players are bots.

---

### Key sources for the original

Full lists: [01](../phase1/01-game-deconstruction.md), [SOURCES](../phase1/SOURCES.md).

**First-hand reads** (GitHub, text only; re-read in the 2026-10-07 verification pass):

- The Android ADB solver [hrafsa/meowdoku-solver][hrafsa], README and `src/` (win flow, golden fish, tile look, Indonesian UI). Its code shows:
  - board-size detection for 5–10 only (the README says 6–10);
  - placed cats detected as dark pixels;
  - a "dark-bordered board variant";
  - waits of 4.5 s for the fish and 3 s for the next board.
- The Android macro [LeistDev/Meowdoku-macros][leist], README:
  - the two-tap cycle and the orange main-menu button;
  - Retry on defeat and an 8 s wait before closing the leaderboard;
  - a logged-in player and support for 4×4–12×12 boards;
  - a note that the board can still be animating when it is read.

**Through search summaries** (re-searched 2026-10-07):

- Google Play event cards: [Meow Cup](https://play.google.com/store/apps/eventdetails/4829249458360717373) (stadium, leaderboard), [Long Live Meow](https://play.google.com/store/apps/eventdetails/4828337312145009026) (World Cat Day, ended 8/12) and [Moonlit Meows](https://play.google.com/store/apps/eventdetails/4830251190652173388) (harvest moon, ended 10/1). The [Block Crush! "Meowdoku Mode"](https://play.google.com/store/apps/eventdetails/4830866025916736675) card (Wonderful Studio, ended 9/23) is not Oakever's.
- Android reviews: [Android Central](https://www.androidcentral.com/apps-software/meowdoku-is-sudoku-but-with-cats-and-it-is-highly-addictive-but-it-has-one-big-problem), [AndroidWorld](https://androidworld.nl/apps/meowdoku-is-sudoku-met-katten-en-een-flinke-dosis-dopamine/) and [Pocketables](https://pocketables.com/2026/06/meowdoku-beat-me-in-the-most-annoying-way.html) (colour-blind, Android colour correction).
- Ad cadence: [Gamigion](https://www.gamigion.com/meowdoku-segments-users-ad-experience-by-tenure/) (120 / 100 / 90 s cooldowns re-found; the banner start level was not).
- iOS user reviews: [AppFollow](https://apps.appfollow.io/ios/meowdoku/6761760135?country=mo) (points in multiples of 5, an event ranking list, bots) and [App Store iPad reviews](https://apps.apple.com/us/app/meowdoku/id6761760135?see-all=reviews&platform=ipad) (group-challenge kitty rewards).
- Not re-found in this pass: the "premium pass", the "event top 100", the daily ranking "in groups", per-cat sound and "intense effects and sound", the breaking heart on Play, and banners "from level 10".

[hrafsa]: https://github.com/hrafsa/meowdoku-solver
[leist]: https://github.com/LeistDev/Meowdoku-macros
