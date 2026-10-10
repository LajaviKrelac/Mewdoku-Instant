# 01 · Game deconstruction: what we know about the original Meowdoku

Status: Phase 1 deliverable · Research date: 2026-10-06; first-hand updates from the user 2026-10-09 and 2026-10-10 · Owner: lead game designer / tech lead

This file records **observable design facts** about the original game: rules, UX flow, controls, progression, economy, monetization, look and feel (described in words) and numbers. It holds no code, art, audio or text from the original. Everything here was collected from public pages, press, reviews, store metadata and third-party write-ups (see [SOURCES.md](SOURCES.md)). See [06-legal-and-originality.md](06-legal-and-originality.md) for the clean-room rules this document follows.

## How to read this file

| Tag | Meaning |
|---|---|
| **confirmed** | Stated explicitly by a source about Meowdoku, or seen consistently in several independent Meowdoku sources, after the adversarial fact-check |
| **likely** | Strongly implied, stated by a single or weaker source, or confirmed only for one version of the game (see "Applies to") |
| **inferred** | Our own deduction, a genre convention, or a claim the fact-check could not support |

Confidence levels are the **fact-checked** levels. Where the fact-check downgraded or refuted a researcher's claim, the corrected level is used and refuted claims are listed in [§17](#17-refuted-or-dropped-claims).

"Applies to" column:

- **App**: the Oakever iOS/Android app. This is the original we are rebuilding.
- **Web-Y**: the "Meowdoku" web build on Yandex Games (app 537825). It is a close look-alike, but **its developer is unverified** and it uses a different engine from the app (§2).
- **Both**: evidence covers both.

Research limits: the shared web-search budget ran out mid-research, and WebFetch was blocked for most store, press and Meta domains. Most press and store claims are therefore based on search-engine summaries, plus first-hand reads of GitHub-hosted material. Every fact below should be treated as a snapshot as of 2026-10-06.

**Review pass (2026-10-06).** A second reviewer re-read the key GitHub sources first-hand: [leist], [hrafsa], [nanma80], [nanma80-req], [thebigjc], [memodoku], [tdk-gdd], [broadpass], [hasokon-bin], [hasokon-hoshi] and [fungiku]. Rows they support now carry "re-read 2026-10-06". Several tags were corrected:

- 3.9 and 6.4 were split into a confirmed part and a likely part;
- 12.4 (tuxedo) was downgraded to likely;
- [memodoku] was removed as a source for the red X (it does not describe it);
- 5.6 and 7.1.4 were upgraded with the macro's retry quote.

No new web searches were possible in this pass: the session's search budget was already used up. gamigion.com, felixbraberg.substack.com and pocketables.com are blocked to WebFetch. The heart and revive details, hint stock, monetization numbers and FB platform status therefore still rest on the original research summaries.

**First-hand update (2026-10-09).** The user plays the original on the Play Store and reported four facts first-hand. They **override the research above** wherever the two disagree, and every row they touch carries the source tag **"user, first-hand, 2026-10-09"** (implemented in Phase 2c, [fish-lives-spec](../phase2c/fish-lives-spec.md)):

- **F1. Fish are the lives.** The app shows fish everywhere, not hearts (5.11, 7.1.3; §17 and §18 entry 13).
- **F2. Kept fish become leaderboard points.** When a level is passed, the remaining lives (fish) are added to the leaderboard points, and the leaderboard ranks points per period: a total that resets (7.1.2, 10.12, 10.16).
- **F3. Level points reward clean play.** Separately, there are level points that get better when you make no mistakes, streak-like (10.17).
- **F4. No fish currency.** Fish are not spent on anything. Our Phase 2b build had invented a fish wallet, fish swaps for hints and kitties, and fish packs; the user asked for them to be removed (11.13).

The user did not give the period length, the reset time, the points numbers, or whether dailies and events count. Those are still unknown (§19), and our build uses defaults marked `[DECISION: default, user may change]`.

**First-hand update (2026-10-10).** The user reported the **exact level-points rule** of the Play Store app. It makes F3 exact and **replaces our Phase 2c reading of it** (a per-win formula with a streak of perfect wins across levels, "Perfect ×N"). Rows it touches carry the source tag **"user, first-hand, 2026-10-10"** (built in Phase 2c.1, 2026-10-10: [fish-lives-spec §3.1–§3.2, §10](../phase2c/fish-lives-spec.md), [STATUS-2c §10](../phase2c/STATUS-2c.md)):

- **F5. Level points are earned per cat, inside one level** (10.17, §8 note).
  - They belong to one level: every level, and every Retry attempt, **starts at 0**.
  - Each correct cat found adds **96 × (5 + s)**, where s counts the correct cats in a row since the level started or since the last mistake (s = 1 for the first): 576, 672, 768, 864, 960, 1 056, 1 152, 1 248, 1 344, 1 440, …
  - The running totals of an unbroken run are **576, 1 248, 2 016, 2 880, 3 840, 4 896, 6 048, 7 296, 8 640, 10 080** (verified by the user).
  - A mistake **does not remove points**; it resets the run, so the next correct cat adds 576 again.
  - Cats placed by a **hint** or by the **paw (kitty)** count exactly like the player's cats.
  - The points show as a **running total during play**, rising as each cat is found, and the **level's total is shown at the win**.
  - The weekly leaderboard is unaffected: the fish (lives) left at a win are the leaderboard points (F2).

The user did not say what removing a placed cat does, whether dailies, events and the tutorial score, how and where the running total is drawn, or whether a lifetime total exists (§19). The per-cat increments are multiples of 96, which contradicts a review's "points only in multiples of 5" (§18 entry 14).

**First-hand update (2026-10-10, user recording).** The user supplied **their own screen recording** (8 s, iPhone at 3×, a 402 × 874 CSS px viewport; the last seconds show the iOS control centre) and a screenshot of the original's **game screen** at Level 96 (10 × 10), and asked us to match its look, layout, palette and X marks ([phase2d/look-spec](../phase2d/look-spec.md) §0.1: measuring and colour sampling allowed by user decision; no tracing; our own art and copy). Rows it supports carry the source tag **"first-hand (user recording, 2026-10-10)"**; the numbers are in look-spec §1 and come from the measurement notes of that phase (colours from the PNG screenshot; the video decodes about gamma 0.84 darker). In short (rows 6.9, 8 note, 11.12, 12.12–12.21, §18 entry 13):

- The game screen, top to bottom: a back arrow and a gear with a red dot in white discs, "Level / 96" and "Score / 0" as two centred columns; a white pill of 10 pastel cat-head silhouettes and a white pill of 3 golden fish; a white strip of 3 rule cards with mini diagrams; the board card; three round helpers (a winking tuxedo cat, a bulb, a grey mouse) with red count badges "2" and a green "play" badge on the mouse; a 320 × 50 banner ad **during play**.
- The current **iOS** app also shows the lives as **fish** (3 golden fish), so the App Store screenshots with hearts are an older version (§18 entry 13).
- What the recording cannot show: a placed cat, a wrong X, a finished region, the win, other board sizes, other screens (§19).

---

## 1. Identity, publisher and market

| # | Fact | Conf. | Applies to | Sources |
|---|---|---|---|---|
| 1.1 | Google Play title: "Meowdoku: Brain Puzzle Games", package `com.oakever.meowdoku`. App Store title: "Meowdoku!", id `6761760135`. Titles are localized (e.g. ES "Meowdoku: Puzles lógicos", KR "Meowdoku: 두뇌 퍼즐 게임"), so the package and id are the stable identifiers. | confirmed | App | [gp], [as], [gamerscroll], [cww-0724], [leist] |
| 1.2 | Publisher: OAKEVER GAMES PTE. LTD. (Singapore). | confirmed | App | [as], [toyfer], [cww-0724] |
| 1.3 | Oakever is reported to be the overseas publishing arm of Beijing Learnings (乐信圣文). The portfolio includes Tile Explorer, Sudoku, Amaze GO!, Vita Mahjong and others, plus a sister cat-logic game, MeowTrail (`com.oakever.akari`, a Light Up variant). | likely | App | [woshipm], [mobidictum], [forbes-ar], [apkcombo-meowtrail] |
| 1.4 | Official site oakevergames.com; support support@oakevergames.com; ToS `/tos.html`; privacy `/pp.html`. | likely | App | [as], [oakever] |
| 1.5 | Release timing: Google Play release date 2026-04-24/25. iOS first listed around 19 May 2026. Breakout week was 15 June 2026 (+3962 % weekly installs). Sources disagree (4 May, 19 May, 26 May, "June 2026"). | likely | App | [appgoblin-new], [gamewith], [mwm], [braberg], [hasokon-hoshi] |
| 1.6 | Chart performance: #3 in Korean Google Play games on 2026-06-25 (1M+ installs, ~77k ratings). 10M+ installs, 4.77 rating, ~167k ratings by 2026-07-24. #2–3 in US iOS free on 2026-09-04. Reported #1 free on App Store Japan around 18–19 Sep 2026. | likely | App | [cww-0625], [cww-0724], [cww-0731], [gamerscroll], [hasokon-hoshi] |
| 1.7 | Ratings snapshots: Google Play 4.7 with ~418k reviews, 10M+ downloads, rated "Everyone", "Contains ads · In-app purchases". App Store 4.8 with ~293k US ratings, 13+, 62 languages. | likely | App | [gp], [as], [industry] |
| 1.8 | Industry estimates: ~2M+ DAU by July, ~$200k/day ad revenue against ~$500k/day user-acquisition spend, >80 % of revenue from interstitials, ~10k AI-generated ad creatives in 30 days, >70 % of US players female. These figures are third-party estimates with essentially **one upstream origin** (Braberg/Gamigion, relayed by Sett.ai and others). Do not design around them. | likely | App | [gam-ads], [gam-dau], [sett], [baijing], [appgrowing] |
| 1.9 | Updates ship about weekly. Android v1.17.0 (2026-09-12, 242 MB), v1.18.0 (2026-09-18, 309 MB), v1.19.1 (~2026-09-30, 294 MB). A Google Play update was also seen on 2026-09-28. | likely | App | [apkpure], [mwm], [soft112] |
| 1.10 | Industry press reports that Oakever faces cloning accusations: it lost a copyright case to Hungry Studio (Block Blast) and is fighting another from Avia Games (MobileGamer.biz, 2026-09-21). The article was read only through an aggregator summary. | confirmed (headline) / likely (details) | Publisher | [mobilegamer], [aggregator] |

Rebuild relevance: the 240–390 MB install size points to a native engine plus heavy art and ad SDKs. Our HTML5 Instant Game must not follow that asset approach (see [05](05-fbig-platform.md)). The publisher's ongoing IP disputes raise the stakes for the clean-room and naming questions (see [06](06-legal-and-originality.md)).

## 2. Which "Meowdoku"? Product family and contamination map

| Product | What it is | How we treat it |
|---|---|---|
| **Oakever app** (iOS/Android) | The original. It is reported to be built with Godot + Spine. That claim comes only from an extracted-asset catalog, which we have **not** opened (inferred). | Primary target for "as is". |
| **Yandex "Meowdoku" web build** (yandex.com/games/app/meowdoku-537825, build 2026.08.08.001) | A single-canvas PixiJS + Spine web game, portrait only. It shares the hearts, rule chips, tuxedo cats and tap-hand tutorial with the app, but has **no** home menu, daily mode, fish rewards or post-win leaderboard. Its developer is unverified (likely a close copy or port). | The richest UX evidence comes from a third-party teardown of this build. We use only **player-observable behaviours** from it and never values its author read from the bundle ([nicdoku]). |
| Playgama "Meowdoku" by DRA (`meowdoku-fd95-1`); Playgama "Meowdoku Cat Puzzle" | Third-party web clones. One is described as classic Sudoku with cat icons. No "XdendunGames" port was found; XdendunGames does publish other games on Playhop/Yandex. | Genre reference only. |
| Other Yandex entries (541580 "Meowdoku Cat Puzzle", 538534, 537763) | Clones. 541580 has fixed pre-placed starting cats. | Excluded. |
| Fan web sites (meowdokugame.com/.io, meowdoku.org/.app/.games/.run, meowdokuonline.net, playmeowdoku.com, meowdokuweb.com, yocox.github.io/meowdoku) | Independent clones and SEO walkthrough sites. Their features include fish-cracker lives, Easy–Extreme size selectors, a Check button, timers, placement counters, "EZ X's" and streaks. | **Not** evidence about the original. Their level walkthroughs may transcribe Oakever's levels, so they must never be used as a level source (see 06). |
| Store copycats (`com.dodo.mewodoku`, `com.grove42.meowdoku`, iOS id6763880105, DogDoku, Catdoku, MiawDoku 2024) | Copycats. Some sell themselves on "no ads" and cat-skin collections. | Show how others differentiate. Not parity requirements. |
| Name collisions: kayleenasser/Meowdoku (2022 Unity cat-themed number Sudoku); "Meowdoku" inside Offline Games (`com.JindoBlu.OfflineGames`, long-press placement and auto-X); meowdoku.bisks.net (killer sudoku) | Unrelated games with the same name. | Filter out of any search. |

Sources: [yandex], [nicdoku], [playgama-dra], [playgama-cp], [yandex-541580], [similarlabs], [kayleen], [cross-sums], [nyandoku], [playbook]. The authorship and engine difference is a fact-check finding, rated likely.

## 3. Core rules

| # | Fact | Conf. | Applies to | Sources |
|---|---|---|---|---|
| 3.1 | The board is an N×N grid split into N colored regions. The goal is to place N cats. | confirmed | Both | [as], [as-story], [nanma80-req], [thebigjc] |
| 3.2 | Exactly one cat per colored region. The store copy calls this rule "Exclusive Territory". | confirmed | Both | [as], [gp], [as-story] |
| 3.3 | Exactly one cat per row and per column. Cats may not touch, **including diagonally**. The store copy calls this "The Aloof Rule". | confirmed | Both | [as], [as-story], [ac] |
| 3.4 | Pitch: "the rigorous reasoning of Sudoku with the thrilling deduction of Minesweeper". Store copy also says "Guessing won't save you". | confirmed | App | [as], [game-solver] |
| 3.5 | Every level has exactly one solution, and every placement is checked against it. This is implied by "guess right / guess wrong, lose a heart", by "reveal a cat or a red X", and by wrong cats never staying on the board (see §5). | likely | Both | [as], [pocket], [nicdoku], [nanma80-req] |
| 3.6 | Levels are designed to be solvable by logic alone. Store copy and a fan guide both say so. One solver author's README lists seven deduction rules, the last being "assume and refute", and includes a "nested staircase" sample board that needs the most advanced reasoning (re-read 2026-10-06). So at least some real boards need a one-step trial. | likely | App | [as], [playbook], [thebigjc] |
| 3.7 | The rules are the same puzzle as LinkedIn Queens and 1-star Star Battle (one per row, column and region, no touching). | likely | Genre | [meowdokugame-vs-queens], [whayeveoo], [cspuz] |
| 3.8 | Math: a no-touch placement with one cat per row and column exists only for N = 1 or N ≥ 4. For N = 4…12 there are 2, 14, 90, 646, 5 242, 47 622, 479 306, 5 296 790 and 63 779 034 such placements (OEIS A002464). So **4×4 is the smallest board**, and 4×4 is trivial. | confirmed (our computation) | Math | [oeis], `engine-prototype/lab/count_kings.mjs` |
| 3.9 | The rules are shown as three "rule chips" above the board. App Store screenshots highlight a different chip in each shot ("Each shot highlights a different rule chip at the top", [broadpass], re-read 2026-10-06). That they are visible in **every** level is seen only in the web build. | confirmed (screenshots) / likely (always visible) | Both | [broadpass], [nicdoku] |

## 4. Controls

| # | Fact | Conf. | Applies to | Sources |
|---|---|---|---|---|
| 4.1 | **Double-tap a tile to place a cat.** The exact quote "a quick double tap drops a cat" reached us only through an APK blog, so the wording is *likely*. The behaviour is confirmed: a GDD that checked the publisher's store description on 2026-09-28 says it "confirms row/column/region logic, no touching, double-tap and three mistake chances" ([tdk-gdd], read first-hand in the review pass, 2026-10-06). Press and an Android automation script agree. | confirmed | Both | [tdk-gdd], [as], [pocket], [leist] |
| 4.2 | A double-tap is a **two-tap cycle**: the first tap draws an X, and the second tap turns it into a cat. An Android automation for `com.oakever.meowdoku` uses "the game's two tap cycle, cross first and cat second", with a configured "pause between the two taps on the same cell" of 150 ms (re-read 2026-10-06). That macro setting is consistent with a timed double-tap, but it does **not** show whether a *slow* second tap on an X also places a cat (an untimed cycle) or clears the X. In the web build, a single tap commits the X immediately without waiting for a possible second tap. | likely | Both | [leist], [nicdoku] |
| 4.3 | A single tap on an empty tile marks an X (rule-out note). X marks are free and unchecked. | likely | Both | [pocket], [nicdoku], [note-fighting] |
| 4.4 | Tapping an existing X clears it. The teardown author also once saw repeated taps on an X fail to clear it, which they attributed to an input-lock bug. | likely | Web-Y | [nicdoku] |
| 4.5 | A single tap on a placed cat does nothing. A double-tap on a placed cat removes it, and the cat counter goes down. | likely | Web-Y | [nicdoku], [nicdoku-fix] |
| 4.6 | **Drag-to-mark**: swiping across tiles paints X marks. The first tile decides the mode: starting on an empty tile marks, starting on an X erases. Cats and locked tiles are skipped. The tutorial teaches the no-touch rule by having the player swipe across three tiles. | likely (Web-Y only; no app source mentions drag) | Web-Y | [nicdoku] |
| 4.7 | **No auto-X** in normal play: placing a cat does not cross out its row, column, region or neighbours. Auto-exclusion appears only inside the tutorial. There is no auto-X setting. | likely | Web-Y | [nicdoku] |
| 4.8 | **No undo** button, and no tool row besides Hint in the web build. The app also has the "kitty" tool (§6). | likely | Web-Y | [nicdoku], [as-story] |
| 4.9 | Pre-placed locked "given" cats: tapping one only pulses the tile. No Oakever-app source shows givens. Fan sites claim level 1 starts with one cat placed. | inferred (app) / likely (Web-Y) | Web-Y | [nicdoku], [levelsolve] |
| 4.10 | No pencil, memo or hypothesis mode beyond X marks. A fan tool, "memodoku", exists so players can "try unlimited hypotheses without watching long ads". | likely | App | [memodoku], [teruteru] |
| 4.11 | Japanese reviewers report that many of their mistakes are accidental mis-taps, not logic errors. | likely | App | [sarusaru], [adamhsu], [penguin] |

Rebuild note: a timed double-tap matters because a wrong cat costs a heart. If X → cat were a plain tap cycle, clearing an X would risk dropping a cat. See [02 §6](02-rebuild-spec.md#6-interactions) for our exact gesture definition. We deliberately do **not** reuse any timing constants from the teardown.

## 5. Mistakes, hearts and failure

> **2026-10-09 (user, first-hand):** on the Play Store app the lives are **fish**, not hearts (5.11). "Hearts" in rows 5.1–5.9 is the research's word for the same three lives; read it as "lives (fish)" for the app.

| # | Fact | Conf. | Applies to | Sources |
|---|---|---|---|---|
| 5.1 | **3 hearts** (mistake allowance) per level. The store description gives "three mistake chances" (via [tdk-gdd]), and App Store screenshots show a hearts system ([broadpass]). **Note 2026-10-09:** the count (3) stands; on the Play Store app those three lives are drawn as fish (5.11; user, first-hand, 2026-10-09). | confirmed | Both | [as], [tdk-gdd], [ac], [broadpass], [tdk-review], user (first-hand, 2026-10-09) |
| 5.2 | A wrong cat placement costs one heart immediately. | confirmed | Both | [as], [ac], [nicdoku] |
| 5.3 | "Wrong" means **not in the stored solution**, even if the cell breaks no visible rule. The cat is never shown. The tile becomes a **red X** that stays as revealed information. An iPhone screenshot solver distinguishes "white/red Xs" ([nanma80-req], re-read 2026-10-06). That a wrong cat is never shown and that the check is against the solution, not the visible rules, comes from the web-build teardown and a press summary. | likely | Both | [pocket], [nicdoku], [nanma80-req] |
| 5.4 | Consequence: every cat on the board is always correct, so the original never needs to highlight cat-vs-cat conflicts. | likely (deduction) | Both | [nicdoku] |
| 5.5 | Wrong-cat feedback in the web build: the heart dims, the tile turns into a crimson X, a broken-heart effect plays, the board shakes, all placed cats look sad for a few seconds, and an error sound and vibration play. | likely | Web-Y | [nicdoku] |
| 5.6 | At 0 hearts the attempt is lost. Android Central says you have to start the level over, and an Android macro presses "the retry button" on defeat and solves the level again. A revive offer may come first (5.7). | confirmed (attempt ends; retry exists) | Both | [ac], [leist] |
| 5.7 | App: a **rewarded-ad revive** is offered after losing all hearts. The analyst source is single-origin, and a "How to revive" video corroborates it weakly. How many hearts a revive restores, and how often it is offered, are unknown. **Note 2026-10-09:** on the Play Store app a revive gives back fish (the lives are fish, 5.11; user, first-hand, 2026-10-09); how many is still unknown. | likely | App | [gam-tenure], [yt-revive], user (first-hand, 2026-10-09) |
| 5.8 | Web build: the "Try Again" screen (crying cat over a dark overlay) offers **Retry only**. Retry plays an interstitial, then restarts the same level from scratch with 3 hearts. There is no continue-with-ad, no menu and no hint offer. | likely | Web-Y | [nicdoku] |
| 5.9 | Hearts are per level. There is no cross-level lives pool or energy meter, and the store copy promises "no energy meters". A claim of 15-minute heart recharge came from unrelated games and was dropped. | likely | App | [as], [ac] |
| 5.10 | Whether Retry gives the same board: the web build restarts the same level. Not documented for the app. | likely (Web-Y) | Web-Y | [nicdoku] |
| 5.11 | **On the Play Store app the lives are fish.** The game shows fish everywhere, not hearts; there are 3 per level, and a wrong cat costs one. The hearts in App Store screenshots ([broadpass], 5.1) are either the iOS build or an older version (§18 entry 13). Our parity target is the Play Store app, so our lives are fish. What an empty life looks like and how the loss is animated are unknown (§19). | confirmed | App (Android) | user (first-hand, 2026-10-09) |

## 6. Hints and boosters

| # | Fact | Conf. | Applies to | Sources |
|---|---|---|---|---|
| 6.1 | The app has **two helpers**: a **lightbulb hint** and a **"kitty" button** that "pinpoint[s] exactly where you'll find a cat" (Apple editorial story). | confirmed | App | [as-story] |
| 6.2 | Hints are limited. They are earned back by watching ads or through an "in-game reward system", whose mechanics are unknown. | confirmed | App | [ac], [ac-yahoo] |
| 6.3 | The kitty booster is also limited ("ran out of hints or free cats"; rewarded ads unlock "boosters" from level 1). | likely | App | [unstar], [gam-ads] |
| 6.4 | The hint **teaches**: it lights up one cell that can be determined next and gives a **one-line reason**. A Japanese design doc calls this "the point Meowdoku is most praised for" (re-read 2026-10-06). That the reason **names the region by its colour**, and that it highlights whole rows, columns or regions, is seen only in the web build. | confirmed (one step + one-line reason) / likely (colour naming, Web-Y) | Both | [hasokon-bin], [chie-1], [chie-3], [nicdoku] |
| 6.5 | Hint UI (web build): the board dims, relevant cells get an outline, the X's the hint would place are previewed, and an **Apply** button commits them. The app can auto-place semi-transparent X's from a hint ("ヒントによる自動バツ"). | likely | Both | [nicdoku], [chie-1] |
| 6.6 | Hint stock (web build): **5 free hints** at start. The count carries across levels and shows as a badge on the round lamp button. At 0, a rewarded video grants +1 hint. If no ad is available, the game shows an "ads unavailable" message. | likely | Web-Y | [nicdoku] |
| 6.7 | Starting stock, refill rules and kitty-booster details for the app are **unknown**. Developer review replies mention requests for "options to buy hints/cats". | likely (reply exists) | App | [as-ipad] |
| 6.8 | A Japanese reviewer says the game never teaches intermediate techniques, so players who won't spend on hints drop off. | likely | App | [sarusaru] |
| 6.9 | **Three helpers** on the game screen, left to right: a **winking tuxedo-cat face** (the kitty), a **lightbulb** (the hint), each with a red count badge ("2" and "2" in the recording), and a **grey mouse face** with a green rounded "play" badge (watch a video). The suggested helper **pulses** with a warm glow on a 1.5 s cycle: the bulb on a board with marks, the cat helper on an untouched board (screenshot). What the mouse does is not visible; one forum post says it crosses out 3 random cells that cannot hold a cat (likely, single source; it looks like a staged rollout). Research (search summaries) rates "the kitty places a cat" likely and says daily-ranking top places pay 2 hints + 2 kitties. | confirmed (three buttons, badges, pulse) / likely (mouse function) | App (iOS) | first-hand (user recording, 2026-10-10); research 2026-10-10 (worldsapps, GameWith, App Store reviews) |

## 7. Screens and flow

### 7.1 App (Oakever iOS/Android): partially known

| # | Fact | Conf. | Sources |
|---|---|---|---|
| 7.1.1 | A main menu with an **orange level button** that starts the current level. | likely | [leist] |
| 7.1.2 | After a win: a **"3-golden-fish" animation**, then a **Leaderboard / scoreboard modal**, then a victory screen with a next-level button. An ADB solver builds in "post-solve delays for 3-golden-fish animations" and auto-dismisses the "Scoreboard" and "Victory" screens. A macro "waits eight seconds after the last cat, closes the leaderboard, and presses the next level button" (both re-read 2026-10-06). The fish animation's length and the button colour are not stated first-hand. **2026-10-09 (user, first-hand):** the post-win fish are the **lives kept**: the fish left when the level is passed are added to the leaderboard points (10.16). "Three" fish is the perfect case (no mistake); fewer lives left means fewer fish. | likely (sequence) / confirmed (what the fish are) | [hrafsa], [leist], user (first-hand, 2026-10-09) |
| 7.1.3 | "Fish" are the **lives** (5.11), and after a win the fish left go to the leaderboard points (10.16). They are not a currency: nothing is bought with them (11.13). This overturns the research's "fish is not lives" ([hrafsa]'s solver only saw the post-win fish; §17). | confirmed | user (first-hand, 2026-10-09); [hrafsa] |
| 7.1.4 | On defeat, a retry button is shown ("On defeat the retry button is pressed", [leist]). A revive offer is also likely (5.7). | confirmed (retry) / likely (revive) | [leist], [gam-tenure] |
| 7.1.5 | The player is "logged in". The Android app has Facebook login, probably for the leaderboard or account. | likely | [leist], [revanced] |
| 7.1.6 | A Daily Puzzles mode exists (§10). | confirmed | [as] |

### 7.2 Web build (Yandex): fully observed

```
platform consent / landing
        │
        ▼ first launch                         returning player
  interactive tutorial (4×4) ──► Level 1 … ◄──────────────────── lands directly on current level
        │
        ▼
  Level N ── win ──► celebration overlay ──► [Level N+1] ──► interstitial ──► Level N+1
     │
     └── 0 hearts ──► "Try Again" ──► [Retry] ──► interstitial ──► Level N (fresh, 3 hearts)
```

- There is no home menu, level select, map, daily mode, shop or pause screen. Progress saves automatically, and there is no branded splash. Confidence: likely. Source: [nicdoku].

## 8. HUD (in-level layout)

Web build, top to bottom (likely, [nicdoku]). The App Store screenshots confirm the rule chips and hearts for the app ([broadpass]).

1. Top bar: leaderboard trophy (left), "Level N" title (centre), settings gear (right).
2. Two pills: a cat icon with a "placed / N" counter, and 3 hearts.
3. A white strip of **3 rule chips** (one per color / per row & column / no touching).
4. The board card.
5. One round **Hint** button with a count badge. The app also has the kitty button ([as-story]).

The cats-remaining counter is also reported for the app in a Russian review ([irecommend], likely).

**2026-10-10 (user, first-hand):** on the Play Store app the level's **points are shown as a running total during play**, rising as each cat is found (10.17). Where in the HUD and how it is drawn is not reported. A complaint that the board "feels like a little mini browser instead of full screen" may be about a web clone (fact-check note).

**2026-10-10 (first-hand (user recording, 2026-10-10)):** the app's game screen (iOS, Level 96), top to bottom:

1. Top bar: a **back arrow** in a white disc (left); two centred columns **"Level / 96"** and **"Score / 0"** (the level points live here, as "Score"); a **gear** in a white disc with a small **red dot** (right). No trophy, no Home button.
2. A white pill of **cat-head silhouettes**, one per region colour, each a 50 % tint of its colour, ordered around the colour wheel from green (not board order); a white pill of **3 golden fish** (the lives).
3. A white strip of **3 rule cards**, each a 3 × 3 mini diagram (tan tiles, brown boxed X's, a cat face) and a two-to-three-line rule text in a mauve-brown ink.
4. The board card (no shadow), stacked tightly under the header.
5. Three round helpers (6.9), then a **banner ad during play** (11.12).
6. A cream **level-start toast** with an orange border, sliding off to the left ("…ared this level!" and a flexed-arm emoji; its start is cut off) (12.20).

## 9. Tutorial / onboarding

| # | Fact | Conf. | Sources |
|---|---|---|---|
| 9.1 | First launch goes straight into an **interactive tutorial on a 4×4 board** of about 6 steps. Everything except the focus is dimmed, target cells get a bright outline, and an animated hand pointer guides the player. The app's store screenshots tell the same story: "first cat placed (rule 1 highlighted) → rule 2 → rule 3 → solved board with glowing cats", with a "tap-hand pointer icon" ([broadpass], re-read 2026-10-06). | likely (Web-Y detail) / confirmed (app screenshots: rule-by-rule tutorial with a hand pointer) | [nicdoku], [broadpass] |
| 9.2 | The tutorial teaches: double-tap to place, one per color, one per row and column, no touching (swipe to exclude), then the hint. | likely | [nicdoku] |
| 9.3 | Rule keywords are emphasised in an accent colour, and region names are printed in their own tile colour. | likely | [nicdoku] |
| 9.4 | Early levels act as a tutorial: one initial cat cascades into the rest. | likely | [androidworld] |

## 10. Progression, content, daily puzzle and leaderboards

| # | Fact | Conf. | Applies to | Sources |
|---|---|---|---|---|
| 10.1 | One **linear numbered level sequence**. No difficulty or stage select exists; Japanese reviewers ask for both. | likely | App | [teruteru], [x-anze] |
| 10.2 | Level 1 is 4×4, followed by 5×5. | likely | Web-Y | [nicdoku] |
| 10.3 | The app goes up to **12×12**: an iPhone screenshot solver tests on "real clean 8×8/12×12 and marked 8×8/10×10 screenshots" (re-read 2026-10-06), an Android macro scans for grids of any size, and several solvers support 5×5 to 12×12. Fan sites say 11×11. | likely | App | [nanma80], [leist], [relan], [thebigjc] |
| 10.4 | The campaign has **at least 428 levels**: real iPhone screenshot fixtures show "Level 351" (8×8) and "Level 428" (10×10). Japanese players report reaching levels 700–1 000+. App Store captions promise "Endless levels". | confirmed (≥428) / likely (1 000+) | App | [nanma80-req], [teruteru], [broadpass] |
| 10.5 | Board sizes are **mixed, not tied to level number**: L351 is 8×8 while L428 is 10×10, and consecutive levels can jump from 5×5 to 10×10. | likely | App | [nanma80-req], [sudokitty] |
| 10.6 | Difficulty ramps quickly. Intermediate techniques appear around levels 20–30 (single source), reviewers flag level 122 as a spike, and later levels get "super hard". | likely | App | [x-anze], [appshunter], [gp] |
| 10.7 | Fan guide grid ramp: levels 1–10 go 4×4→7×7, 11–20 7×7→8×8, 21–50 8×8→9×9, 51–100 9×9→10×10, 101–200 10×10→11×11, 201–300 11×11. Fan sources disagree with each other. | inferred | App | [meowdokuonline], [meowdoku-org], [levelsolve] |
| 10.8 | Labelled "Hard" levels exist; YouTube titles mark levels 160, 170 and 180 as hard. A **hard level every 10th** is our deduction. | inferred | App | [yt-160], [yt-170], [yt-180] |
| 10.9 | Some users say levels repeat after about 50. This is hard to reconcile with Levels 351 and 428 existing. It may point to a recycled finite bank. | inferred | App | [worldsapps], [sudokitty] |
| 10.10 | **Daily Puzzles**: a brand-new puzzle every day (store copy). The daily can be 12×12 (fixture "iphone-12x12-daily-0924"). Unlock level (a fan site says about 21), puzzles per day, calendar, streaks, rewards and reset time are all **unknown**. | confirmed (exists) / inferred (details) | App | [as], [nanma80], [hasokon-hoshi], [meowdokuonline] |
| 10.11 | **Global leaderboards** to "break your fastest completion times" (store copy). A solve time must therefore be measured, but nothing confirms a visible timer. | confirmed (promise) | App | [as], [mwm] |
| 10.12 | The app shows a post-win Leaderboard modal, and on the Play Store app it is a **points ranking per period** (10.16): the "points" users mention are real. The web build has a "Levels completed" leaderboard that needs sign-in (a different product, §18 entry 7). Users call the app's leaderboard fake or full of bots. | confirmed (App, points per period) / likely (web) | Both | user (first-hand, 2026-10-09); [hrafsa], [nicdoku], [as-rev], [teruteru] |
| 10.13 | Plays **offline**. Store copy: no energy meters, social grind or busywork. | confirmed | App | [as], [bluestacks] |
| 10.14 | No play time limit. No source says this outright. | inferred | App | — |
| 10.15 | Google Play ran LiveOps "event" cards for Oakever (ending around 8/12, 9/23 and 10/1). Their content is unknown, and they may belong to other Oakever titles. | inferred | App | [gp-events] |
| 10.16 | **The leaderboard ranks points per period.** It shows a points total that resets each period. When a level is passed, the **remaining lives (fish) are added** to the player's leaderboard points. The period's length and reset time, and whether dailies and events add their fish too, are unknown (§19). | confirmed | App (Android) | user (first-hand, 2026-10-09) |
| 10.17 | **Level points** exist separately from the leaderboard points, and they **get better when you make no mistakes** (streak-like). **2026-10-10, the exact rule (user, first-hand):** the points belong to **one level** and start at 0 with every level and every Retry. Each correct cat found adds **96 × (5 + s)**, s being the correct cats in a row since the level started or the last mistake: 576, 672, 768, 864, 960, 1 056, 1 152, 1 248, 1 344, 1 440; an unbroken run totals 576, 1 248, 2 016, 2 880, 3 840, 4 896, 6 048, 7 296, 8 640, 10 080 (verified by the user). A mistake removes nothing but resets the run (the next cat adds 576). Hint and kitty cats count like the player's. The total is shown **live during play** and **at the win**. ~~"Clean wins in a row are worth more"~~ was our 2026-10-09 reading and is wrong: the run counts cats inside one level, not wins. Unknown: what removing a cat does, whether dailies, events and the tutorial score, the HUD look (§19). | confirmed (rule and numbers) | App (Android) | user (first-hand, 2026-10-09; rule 2026-10-10) |

## 11. Economy and monetization

| # | Fact | Conf. | Applies to | Sources |
|---|---|---|---|---|
| 11.1 | The game launched **ad-only**, with no IAP and no paid ad-free option on Android. This was reported in June–July 2026. | likely | App | [gam-ads], [sett], [ac] |
| 11.2 | Ad formats: interstitials (said to be >80 % of revenue), rewarded video (revives and boosters, available from level 1) and banners. | likely | App | [gam-ads], [gam-tenure] |
| 11.3 | Interstitials appear **between levels and on restart, not during play**. Store copy: "Non-Intrusive Ads: zero interruptions to your gameplay". | likely | App | [as], [gam-tenure], [unstar] |
| 11.4 | Interstitial / fail-retry cooldown by tenure: **120 s on days 0–2, 100 s on days 2–7, 90 s from day 7**. Interstitials are muted by default. These numbers have a **single origin** (Gamigion = Braberg) and are probably remotely configured and A/B tested. | likely | App | [gam-tenure], [braberg] |
| 11.5 | Interstitial start: about level 10 by one account, level 12 by another. A player saw no ads for 60–100 levels of continuous play without hints, but saw ads after every level past about 60 after relaunching. Other reports say about 30 or about 50. These are contradictory, consistent with remote config. | likely (grace period exists) / inferred (exact level) | App | [gam-tenure], [x-anze], [teruteru], [worldsapps] |
| 11.6 | Web build: an interstitial **before every next level and every retry** (~12–16 s observed, behind the game's own spinner). Rewarded video for +1 hint after the free 5. | likely | Web-Y | [nicdoku] |
| 11.7 | iOS added subscriptions later: **Meowdoku Premium** at $3.99/wk, $7.99/mo or $34.99/yr, and **Premium Plus** at $6.99/wk, $14.99/mo or $69.99/yr (JP: ¥600/¥1 300/¥6 000 and ¥1 100/¥2 500/¥11 000). **What each tier includes is unknown.** | likely | App (iOS) | [as], [app-ranking] |
| 11.8 | Android now also lists in-app purchases (AppGoblin: ad_supported=true, in_app_purchases=true). Its catalogue is unknown. | likely | App (Android) | [gp], [appgoblin-new] |
| 11.9 | The developer replies to reviews that it is "considering" remove-ads and "buy hints/cats" options. It says ads come from third-party networks and fund a small team. | likely | App | [as-ipad] |
| 11.10 | Android Central's "one BIG problem" is the **ad load**: "mandatory ads, one after almost every single level". The article was read only through search summaries. | likely | App | [ac], [ac-yahoo] |
| 11.11 | User complaints: long, unskippable ads (some "longer than the levels"), ads that need several screens to close, scam or shopping banners, redirects, and the game's own ads calling it "ad-free" ("complete lies"). | likely | App | [as-rev], [appshunter], [unstar], [teruteru] |
| 11.12 | iOS screenshots used by a solver contain ad content, which weakly suggests **banners during play**. **2026-10-10 (first-hand, user recording):** a standard **320 × 50 banner is shown at the bottom during play**, centred, 23 pt under the helper buttons; reviews describe a permanent bottom banner too. | confirmed | App | [nanma80-req]; first-hand (user recording, 2026-10-10) |
| 11.13 | **Fish are not a currency.** They are lives (5.11) and, after a win, leaderboard points (10.16); nothing is bought with them. The fish wallet, the fish swaps for hints and kitties and the fish packs of our Phase 2b build were our own invention (parity-spec §2.8, §8.3), and the user asked for them to be removed. | confirmed | App (Android) | user (first-hand, 2026-10-09) |

## 12. Look and feel (described in words)

| # | Fact | Conf. | Applies to | Sources |
|---|---|---|---|---|
| 12.1 | Board: **rounded, flat colour tiles with gaps between them**. No grid lines, no region border strokes, no frame. Regions are shown by **colour alone**. A developer's design plan records "the look Meowdoku uses: rounded tiles with a gap between them, no grid, no region strokes, no frame" ([fungiku], re-read 2026-10-06). The white rounded card on a cream page comes from the web build and the store screenshots' cream background. | confirmed (tiles, gaps, no strokes) / likely (card on cream page) | Both | [fungiku], [broadpass], [nanma80], [nicdoku] |
| 12.2 | Tiles are fairly saturated pastels (pink, yellow, blue, lilac, mint, teal, caramel, peach and others). The page, panels and text are muted. | confirmed (character) | Both | [broadpass], [thebigjc] |
| 12.3 | About 11 region colours in the web build. The app's 12×12 boards need at least 12. | likely | Both | [nicdoku], [nanma80] |
| 12.4 | Cat piece: a cute **tuxedo cat head** (black fur, white face), animated. In the web build, all placed cats share moods: idle blink, sad after a mistake, happy on a win. The review pass (2026-10-06) could **not** re-find the word "tuxedo" in the readable GitHub sources: [nanma80-req] only says "reproducing the game's cat artwork is unnecessary", and the colouring rests on the web-build teardown and the original research notes. | likely (tuxedo colouring) / likely (moods, Web-Y) | Both | [nicdoku], [nanma80-req], [thebigjc] |
| 12.5 | Large illustrated cats on the win screen (a celebrating cat) and the fail screen (a crying cat). | likely | Web-Y | [nicdoku] |
| 12.6 | X mark: a thick, round-capped **white** X for player marks and a **red/crimson** X for revealed wrong cells. White is weakest on yellow tiles. | likely | Both | [nanma80-req], [nicdoku] |
| 12.7 | UI chrome: rounded heavy sans-serif type, white pill counters, rounded cards with soft shadows, orange pill buttons, dark full-screen overlays for win and fail. | likely | Web-Y | [nicdoku], [broadpass] |
| 12.8 | Cleared colours fade into the background once their cat is found. This reportedly arrived in a recent update and is known from review mentions. | likely | App | [woshipm], review mentions |
| 12.9 | App Store screenshots: portrait, flat cream background, bottom captions in bold rounded white text on a sky-blue band decorated with cat ears and paw prints. Captions include "Find the cats", "Endless levels" and a "Test your IQ" claim. Tiles are pastel pink, yellow, blue and lilac. The solved board shows "glowing cats". Tone: "cute, calm, minimal". (The `broad-pass.json` entry was re-read first-hand on 2026-10-06.) | confirmed | App | [broadpass] |
| 12.10 | Store copy: "minimalist aesthetic and satisfying tactile feedback, takes just seconds to learn". | confirmed | App | [as] |
| 12.11 | Portrait-only. | likely | Both | [nicdoku], [broadpass] |
| 12.12 | **Region palette of a 10 × 10 board** (sampled from the user's PNG screenshot): green `#AED994`, teal `#48B5B2`, sky `#6BBCE7`, grey-blue `#A7BFD7`, purple `#9778D6`, magenta-pink `#EB85B7`, pink `#FAB4D0`, salmon `#D57374`, orange `#FFAA6D`, mustard `#E4BB49`: darker and more saturated than our 2b palette (mean L* 71.8, C* 40.3). Colours beyond these 10 (11 × 11, 12 × 12) are not seen. Page `#F7F2EF`, cards white, all text a mauve-brown `#935A5A`; the back arrow and the gear in their white discs a lighter `#996767`. | confirmed | App (iOS) | first-hand (user recording, 2026-10-10) |
| 12.13 | **X mark**: pure white, no outline and no shadow; two bars about 19.7 % of the tile thick, the X about 61.5 % of the tile wide, bar ends rounded squares. | confirmed | App (iOS) | first-hand (user recording, 2026-10-10) |
| 12.14 | **Board geometry (10 × 10)**: the card is 97 % of the screen width with no shadow and a small radius (about 3 % of its width); tiles 35 pt with a 3 pt gap (8.6 % of the tile) and an 11 % corner radius; flat tiles. | confirmed | App (iOS) | first-hand (user recording, 2026-10-10) |
| 12.15 | **Type**: a rounded geometric face with a single-storey "a"; labels about weight 500, numbers about 800, rule text about 600. | likely (weights estimated) | App (iOS) | first-hand (user recording, 2026-10-10) |
| 12.16 | **Cat-heads pill**: one flat cat-head silhouette per region colour in a 50 % white tint of that colour, in a fixed hue order. What a head does when its colour's cat is found is not visible (no cat placed). Research: the row is the "cats still to place" tracker (likely). | confirmed (look) / unknown (found state) | App (iOS) | first-hand (user recording, 2026-10-10); [irecommend] |
| 12.17 | **Rule cards**: a white strip holding three pale beige cards, each with a 3 × 3 diagram (tan tiles, brown boxes with white X's, a tuxedo cat face) beside a short rule text. | confirmed | App (iOS) | first-hand (user recording, 2026-10-10) |
| 12.18 | **Shadows**: warm orange soft shadows on the round buttons only; the pills, the rule strip and the board card have none (the heads pill a very faint one). | confirmed | App (iOS) | first-hand (user recording, 2026-10-10) |
| 12.19 | **Helper pulse**: scale 1 → 1.08 with an orange glow, 0.48 s up, a short hold, 0.50 s down, 0.47 s rest (1.50 s period), repeating; the badge does not move. | confirmed | App (iOS) | first-hand (user recording, 2026-10-10) |
| 12.20 | **Level-start toast**: a cream pill with an orange border and an emoji, laid over the top of the HUD, drifting off to the left at a constant ≈ 100 pt/s; its entry, full text and trigger are not visible. | confirmed (look, exit) / unknown (trigger, text) | App (iOS) | first-hand (user recording, 2026-10-10) |
| 12.21 | **Red dot** on the settings gear (11 pt, up-right of the gear). What it signals is not known. | confirmed (look) / unknown (meaning) | App (iOS) | first-hand (user recording, 2026-10-10) |

## 13. Audio and haptics

| # | Fact | Conf. | Applies to | Sources |
|---|---|---|---|---|
| 13.1 | Short sound effects for: placing an X, removing an X, placing a cat, a wrong cat, a region or cats cleared, level win, level fail, hint use, button clicks and board entry. Drags add extra blips. | likely | Web-Y | [nicdoku] |
| 13.2 | Light vibration on X, a slightly stronger one on a cat, and multi-pulse patterns on error and win. | likely | Web-Y | [nicdoku] |
| 13.3 | No background music in the web build. The app may have BGM (unverified; the only source is contaminated and was not opened). | likely (web) / inferred (app) | Both | [nicdoku] |

## 14. Settings and accessibility

| # | Fact | Conf. | Applies to | Sources |
|---|---|---|---|---|
| 14.1 | The settings modal has a **Sound toggle only** (plus Done). There is no music, haptics, language, auto-X or reset option. | likely | Web-Y | [nicdoku] |
| 14.2 | The app's settings include Feedback (the developer tells users to go to "Settings → Feedback"). The full list is unknown. | likely | App | [as-ipad] |
| 14.3 | **No colour-blind support**: no alternate palette, no patterns, and colour-only regions. A colour-blind reviewer could not pass some higher levels (orange/yellow, pink/light-blue and green/yellow pairs look the same). | confirmed | App | [pocket] |
| 14.4 | No dark mode. This complaint is attributed to a clone author but was not found in that repo. | inferred | App | [sudokitty] |
| 14.5 | Colour-only regions do not meet WCAG 1.4.1 (Use of Color). | inferred (our assessment) | Both | [wcag-141] |

## 15. Player sentiment

**Praise** (likely): pure, fair logic with no guessing; learns in seconds but has depth; cute looks paired with serious logic; calming yet challenging; works offline; addictive ("dopamine"); the teaching hint. Sources: [gamefoliage], [androidworld], [teruteru], [irecommend], [ac], [hasokon-bin].

**Complaints** (likely unless noted):

| Complaint | Sources |
|---|---|
| Ad load and length; "zero interruptions" called misleading | [ac], [as-rev], [unstar], [teruteru] |
| Only 3 hearts is stressful; mis-taps cost hearts | [sarusaru], [penguin] |
| Colour confusion; no colour-blind mode | [pocket] |
| Hints too scarce; intermediate techniques never explained | [sarusaru] |
| Leaderboard seems fake or full of bots | [as-rev], [teruteru] |
| Levels repeat (claimed after about 50) (inferred) | [worldsapps] |
| Forced waits; Retry restarts the whole board; no undo or auto-X (opinions from the web teardown) (inferred) | [nicdoku] |
| No difficulty or stage select | [teruteru] |

## 16. Genre conventions and clone features (NOT confirmed for Meowdoku)

These are listed so Phase 2 does not import them by accident, and so Phase 3 has a menu of options. All are **inferred** for Meowdoku.

| Convention / feature | Where seen | Notes |
|---|---|---|
| 3-state tap cycle: empty → X → piece → empty | LinkedIn Queens ([benmagowan], [queens-mockup]) | Meowdoku instead uses a timed double-tap, and cats are solution-checked |
| Live conflict highlighting (red striped cells) with no lives | Queens trainers ([caterpillow]) | Meowdoku rejects wrong cats instead |
| Optional settings: Auto-place X's, Auto-check, Show clock; Undo, Clear (with confirmation) | LinkedIn Queens ([queens-help] via [tyler-appendix]), [samimsu] | Auto-X marks the row, column, region and 8 neighbours |
| Timer and a results card with the solve time; "Flawless" badge | Queens ([tyler-appendix]) | — |
| One daily puzzle at midnight PT, streaks, streak freezes, share string | Queens ([tyler-appendix]) | — |
| Difficulty selector by size (Easy 5×5 … Extreme 10×10), Check button, placement counter, visible timer, undo | Fan web clones ([similarlabs], [meowdoku-org], [meowdokuonline]) | — |
| "Fish crackers" lives | Fan sites and clones ([playbook]) | The original uses hearts |
| "EZ X's" / Smart Marks auto-crossing | [asyncawait-20], [whayeveoo] | — |
| Zen mode with no lives | SchroDoku/FrankieDoku ([frankiedoku]) | — |
| Long-press to place; X/C/H keyboard shortcuts | [cormort], [cross-sums] | — |
| Hold-and-drag continuous marks | [nanbu] | Also seen in the Yandex web build (§4.6) |
| Fixed pre-placed starting cats as a core mechanic | Yandex 541580 ([yandex-541580]) | — |
| Cat skins and collections (classic, origami, neon); "no ads" positioning | Store copycats ([copycat-dodo], [copycat-ios]) | Differentiation ideas for Phase 3 |
| Monthly daily-challenge calendar with trophies; 0/3 mistakes with ad "second chance"; stats screen | Sudoku.com (background knowledge) | Not verified this session |
| Screen-reader labels naming colour and coordinates | LinkedIn Queens DOM ([benmagowan]) | Good accessibility practice |

## 17. Refuted or dropped claims

| Claim | Verdict | Why |
|---|---|---|
| Lives are "fish crackers" or "fish" | **Confirmed for the Play Store app (user, first-hand, 2026-10-09)** (was: refuted) | The original verdict: App Store screenshots and store text show hearts, Android shows a post-win "3-fish collection", and the fish-lives sources were fan or clone designs ([playbook], [cormort]). The user, who plays the Play Store app, reports that the lives are fish everywhere and that the post-win fish are the lives kept (5.11, 7.1.3). The App Store hearts are the iOS build or an older version (§18 entry 13). "Fish crackers" stays unconfirmed: the user said fish. |
| "250 campaign levels", 4×4–11×11 | **Refuted** (count and maximum) | iPhone Levels 351 and 428 exist, and 12×12 boards exist. "250" is just the size of a fan guide's catalogue. |
| Hearts recharge every 15 min | **Dropped** | The source cited other apps (a Sensor Tower entry and an AARP Crosswordling FAQ). |
| 5 000+ or 15 000+ levels | **Dropped** | These belong to clones or an unsupported summary. |
| "Ten cats per level" as a standard (Android Central) | Not a rule | That was simply the board size the reviewer was on. Sizes vary from 4 to 12. |
| Open Sans font and 16/6/8 px measurements | **Dropped** for the original | They were measured on a DOM-based fan web clone ([nyandoku]). |
| Sudoku.com-style "watch ad for +1 heart" as the Meowdoku baseline | Not supported | The web build offers Retry only. The app offers a revive of unknown size. |

## 18. Contradictions log

1. **Release dates**: iOS "19 May" conflicts with "US top 10 in mid-May", and other sources give 4 May, 26 May or "June". Explanation: soft launch or database first-seen dates. The Google Play release on 2026-04-24 is the most reliable date.
2. **Ad start level**: about 10, about 12, about 30, about 50, or none for 60–100 levels in continuous play. Most likely remote config plus A/B tests plus a time-based cooldown.
3. **"Zero interruptions"** in store copy versus the ad-load complaints and the iOS banner evidence.
4. **Max board size**: 11×11 (fan sites; 11-colour web palette) versus 12×12 (app fixtures and macro). Web and app may differ.
5. **Level count**: "Endless levels", ≥428, 700–1 000+ reported, "repeats after 50" and "250". A finite recycled bank labelled "endless" fits most of these.
6. **Fail flow**: Retry only (web) versus rewarded revive (app).
7. **Meta-game**: the web build has no menu, daily mode, fish or post-win leaderboard. The app has all of them. These are treated as **different products**.
8. **Engine and authorship**: PixiJS (web) versus reportedly Godot (app). The web build may not be by Oakever.
9. **Givens**: shown in the web build, unconfirmed in the app.
10. **Tap on an X**: clears it, but the teardown author once saw it fail to clear (likely a bug).
11. **Brief versus research**: the project brief names Yandex 537825 "Meowdoku Cat Puzzle" and a Playgama port by "XdendunGames". Research found 537825 titled "Meowdoku", "Meowdoku Cat Puzzle" at 541580, and a Playgama port by "DRA".
12. **Single-origin corroboration**: Gamigion and felixbraberg.substack.com are the same author, so the ad-cadence numbers have one origin.
13. **Lives: hearts or fish** (added 2026-10-09). App Store screenshots ([broadpass]) and store text show hearts; the user, playing the Play Store app, sees fish everywhere (user, first-hand, 2026-10-09). Explanation: the iOS build differs from Android, or the screenshots show an older version. Our parity target is the Play Store app, so the first-hand report wins (5.11). **2026-10-10 (first-hand (user recording, 2026-10-10)):** the current iOS app shows 3 golden fish as the lives too, so the App Store screenshots show an older version.
14. **Points in multiples of 5, or of 96** (added 2026-10-10). An iOS user review (AppFollow, cited in [differences-vs-original](../phase2/differences-vs-original.md) §2.6) says points come only in multiples of 5. The user's first-hand level-points rule on the Play Store app gives 576, 672, 768 … per cat (multiples of 96; totals such as 1 248 or 7 296 are not multiples of 5) (10.17). Explanations: the review means another number (the leaderboard points, an iOS build or an older version), or it is wrong. The first-hand report wins for level points.

## 19. Unknowns that matter for the rebuild

These are carried into [02](02-rebuild-spec.md) as `[DECISION]`s:

- Hint and kitty starting stock, refill amounts and the "in-game reward system" (app).
- Whether the app's X → cat cycle is **timed** (a quick double tap) or untimed, i.e. what a slow second tap on an X does (4.2).
- Whether the kitty button **places** the cat or only highlights it. (2026-10-10 research, search summaries: **places**, likely; our kitty places one.)
- How many hearts (fish) a revive restores, and how many revives are allowed.
- ~~What the post-win golden fish are: a currency, a rating or a cosmetic.~~ **Resolved 2026-10-09 (user, first-hand):** they are the lives kept; they go to the leaderboard points (7.1.3, 10.16).
- Daily puzzle structure: count, size, unlock, streaks, calendar, reset time.
- ~~Leaderboard scope (per level, per daily, levels-completed, points).~~ **Resolved 2026-10-09 (user, first-hand):** points per period, a total that resets (10.16).
- **New (2026-10-09):** the leaderboard **period's length and reset time** (our default: UTC weeks from Monday 00:00 UTC).
- **New:** the **points numbers**: how many leaderboard points a kept fish is worth (our default: 1), ~~the level points per level, and how the no-mistake streak raises them~~ **level points resolved 2026-10-10 (user, first-hand):** 96 × (5 + s) per correct cat inside one level, s reset by a mistake (10.17).
- **New (2026-10-10):** around the level-points rule: what **removing a placed cat** does (ours: nothing, and a cat put back scores nothing); whether **dailies, events and the tutorial** score (ours: dailies and events do, the tutorial does not); whether a **lifetime points total** or a best score exists; and how and where the running total is drawn during play and at the win (ours is our own design).
- **New:** whether **dailies and events** add their kept fish to the leaderboard and ~~move the streak~~ score level points (2026-10-10 wording; our default: both do; the tutorial does neither).
- **New:** what an **empty life** looks like, and the look and timing of the **fish-loss and win-fish animations** (ours are drawn and timed by us, [provenance](../provenance.md) §9).
- The exact size and difficulty schedule per level number; whether boards are fixed or generated.
- Settings in the app (haptics? music?), BGM, language list.
- What Premium and Premium Plus include.
- **New (2026-10-10, user recording):** what the **mouse** helper does and whether it has a stock or a limit (ours: 3 X's on cells without a cat, one video per use); what a **head** of the heads pill looks like once its colour has a cat (ours: full colour); the **colours beyond 10** for 11 × 11 and 12 × 12 (ours: Mint and Cocoa); the tile and gap rules for other board sizes (ours: the same ratios); which helper **pulses** when (ours: the cat on an untouched board, then the bulb); the **level-start toast**'s trigger and text (ours: our own line at every new level and Retry); what the gear's **red dot** means (ours: something unseen in Settings); whether the banner is always present during play and what hides it.

<!-- References -->
[as]: https://apps.apple.com/us/app/meowdoku/id6761760135
[as-rev]: https://apps.apple.com/us/app/meowdoku/id6761760135?see-all=reviews&platform=iphone
[as-ipad]: https://apps.apple.com/us/app/meowdoku/id6761760135?see-all=reviews&platform=ipad
[as-story]: https://apps.apple.com/nz/iphone/story/id6795412703
[gp]: https://play.google.com/store/apps/details?id=com.oakever.meowdoku&hl=en_US
[gp-events]: https://play.google.com/store/apps/eventdetails/4828337312145009026
[oakever]: https://oakevergames.com/games
[ac]: https://www.androidcentral.com/apps-software/meowdoku-is-sudoku-but-with-cats-and-it-is-highly-addictive-but-it-has-one-big-problem
[ac-yahoo]: https://tech.yahoo.com/gaming/articles/meowdoku-sudoku-cats-highly-addictive-090000526.html
[pocket]: https://pocketables.com/2026/06/meowdoku-beat-me-in-the-most-annoying-way.html
[gam-ads]: https://www.gamigion.com/meowdoku-makes-200k-a-day-fully-from-ads/
[gam-tenure]: https://www.gamigion.com/meowdoku-segments-users-ad-experience-by-tenure/
[gam-dau]: https://www.gamigion.com/meowdoku-reaches-2-million-dau-in-under-60-days/
[braberg]: https://felixbraberg.substack.com/p/meowdoku-segments-users-ad-experience
[sett]: https://www.sett.ai/content/meowdoku-2m-dau-pure-ad-revenue/
[woshipm]: https://www.woshipm.com/share/6431038.html
[baijing]: https://www.baijing.cn/article/56287
[mobidictum]: https://mobidictum.com/analysis-chinese-publisher-learnings/
[forbes-ar]: https://www.forbesargentina.com/lifestyle/el-fenomeno-meowdoku-rompecabezas-gatos-convirtio-exito-global-n92213
[androidworld]: https://androidworld.nl/apps/meowdoku-is-sudoku-met-katten-en-een-flinke-dosis-dopamine/
[appgrowing]: https://appgrowing.net/blog/en/how-meowdoku-turns-puzzle-rules-into-ad-creative-hooks/
[gamewith]: https://gamewith.jp/gamedb/17237
[mwm]: https://mwm.ai/apps/meowdoku/6761760135
[worldsapps]: https://worldsapps.com/reviews-meowdoku
[unstar]: https://unstar.app/app/6761760135?platform=ios&country=en-US
[appshunter]: https://appshunter.io/ios/app/meowdoku/id6761760135/reviews
[x-anze]: https://x.com/anze4fgo/status/2079545955129692579
[teruteru]: https://www.teruteru2.com/2026/06/10/meowdoku-review/
[sarusaru]: https://sarusarugame.blog/meowdoku-review/
[adamhsu]: https://www.adamhsu.com/meowdoku-review-tips/
[penguin]: https://penguingames.hatenablog.com/entry/2026/09/06/151721
[irecommend]: https://irecommend.ru/content/milaya-razvivayushchaya-igra
[gamefoliage]: https://gamefoliage.com/2026/06/10/meowdoku/
[note-fighting]: https://note.com/fighting_dq4/n/nef9a97ca1764
[chie-1]: https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q14329792509
[chie-3]: https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q11329093941
[yt-revive]: https://www.youtube.com/watch?v=xfVbb7V_xe4
[yt-160]: https://www.youtube.com/watch?v=36x2z3ur4VU
[yt-170]: https://www.youtube.com/watch?v=ylXRgrPE97A
[yt-180]: https://www.youtube.com/watch?v=TDBcarUqn8I
[industry]: https://www.industry.co.id/read/155587/meowdoku-game-puzzle-sudoku-kucing-yang-viral-di-play-store-cara-main-dan-tips-menang
[bluestacks]: https://www.bluestacks.com/apps/puzzle/meowdoku-brain-puzzle-games-on-pc.html
[game-solver]: https://game-solver.com/meowdoku/
[apkpure]: https://apkpure.net/meowdoku-brain-puzzle-games/com.oakever.meowdoku/download
[soft112]: https://meowdoku-ios.soft112.com/
[app-ranking]: https://www.app-ranking.net/id/6761760135
[apkcombo-meowtrail]: https://apkcombo.com/meowtrail/com.oakever.akari/
[mobilegamer]: https://mobilegamer.biz/vita-mahjong-amaze-go-and-meowdoku-maker-oakever-games-fights-cloning-accusations/
[aggregator]: https://github.com/Trafalgardi/game-news-aggregator/blob/HEAD/public/archive/2026-09-22.json
[nicdoku]: https://github.com/daymartin99/nicdoku/blob/23220a7dd3e91e39cc6b835a78b2e6c7ba75428a/docs/reference/meowdoku-ux.md
[nicdoku-fix]: https://github.com/daymartin99/nicdoku/blob/23220a7dd3e91e39cc6b835a78b2e6c7ba75428a/docs/review/fix-plan.md
[leist]: https://github.com/LeistDev/Meowdoku-macros
[hrafsa]: https://github.com/hrafsa/meowdoku-solver
[nanma80]: https://github.com/nanma80/meowdoku-solver
[nanma80-req]: https://github.com/nanma80/meowdoku-solver/blob/HEAD/REQUIREMENTS.md
[relan]: https://github.com/relan2049/meowdoku-solver
[thebigjc]: https://github.com/thebigjc/meowdoku
[broadpass]: https://github.com/george-babyfig/oneshotgame/blob/84a0d802b8d58ca46ccc20a5b46675411873a2a9/docs/product/store-art-notes/broad-pass.json
[tdk-gdd]: https://github.com/TDKhoa2712/ASOL-Game-02/blob/c9d25c2091daf9b458649e25acf18e8855368f9f/GDD/README.md
[tdk-review]: https://github.com/TDKhoa2712/ASOL-Game-02/blob/c9d25c2091daf9b458649e25acf18e8855368f9f/GDD/09-ra-soat-thiet-ke.md
[hasokon-bin]: https://github.com/ke-iwata/hasokon-home/blob/82ec421648102c06f075798b78de040ef0082aba/docs/features/game-binary-puzzle.md
[hasokon-hoshi]: https://github.com/ke-iwata/hasokon-home/blob/82ec421648102c06f075798b78de040ef0082aba/docs/features/game-hoshioki-puzzle.md
[fungiku]: https://github.com/mjohnson139/expo-sudoku/blob/ec703e27fed7d6bafe04a1b857f57419cc62b62a/docs/fungiku-plan.md
[memodoku]: https://github.com/chell-uoxou/memodoku
[revanced]: https://github.com/Jman-Github/ReVanced-Patch-Bundles/blob/HEAD/patch-bundles/freethekitties-patch-bundles/freethekitties-latest-patches-list.json
[appgoblin-new]: https://github.com/appgoblin-dev/appgoblin/blob/HEAD/frontend/src/routes/reports/ad-user-acquisition-2026-june/new_advertisers.json
[cww-0625]: https://github.com/cww0808/Google_Game_ranking_analysis_system/blob/main/reports/2026-06-25.md
[cww-0724]: https://github.com/cww0808/Google_Game_ranking_analysis_system/blob/main/reports/2026-07-24_0700.md
[cww-0731]: https://github.com/cww0808/Google_Game_ranking_analysis_system/blob/main/reports/2026-07-31_2014.md
[gamerscroll]: https://github.com/tempest1033/GamerScroll/blob/main/snapshots/rankings/2026-09-04_ios_us_free.csv
[toyfer]: https://github.com/toyfer/meowdoku-solution-method
[playbook]: https://github.com/Meowdoku-Playbook/.github
[sudokitty]: https://github.com/Mixa-Bosu/SudoKitty
[nyandoku]: https://github.com/masato-masa/nyandoku
[meowdokuonline]: https://meowdokuonline.net/meowdoku-levels/
[meowdoku-org]: https://www.meowdoku.org/levels
[levelsolve]: https://levelsolve.com/meowdoku/
[meowdokugame-vs-queens]: https://meowdokugame.io/meowdoku-vs-queens/
[yandex]: https://yandex.com/games/app/meowdoku-537825
[yandex-541580]: https://yandex.ru/games/app/meowdoku-cat-puzzle-541580
[playgama-dra]: https://playgama.com/game/meowdoku-fd95-1
[playgama-cp]: https://playgama.com/game/meowdoku-cat-puzzle
[similarlabs]: https://similarlabs.com/p/meowdokugame
[kayleen]: https://github.com/kayleenasser/Meowdoku
[cross-sums]: https://github.com/thecoder-co/cross-sums-bot
[asyncawait-20]: https://github.com/asyncawaitpromise/meowdoku/issues/20
[whayeveoo]: https://github.com/whayeveoo-eng/meowdoku
[nanbu]: https://github.com/NanbuShirou/MeowDoku_android
[cormort]: https://github.com/cormort/meowdoku
[frankiedoku]: https://github.com/TruncatedPi/FrankieDoku
[copycat-dodo]: https://play.google.com/store/apps/details?id=com.dodo.mewodoku
[copycat-ios]: https://apps.apple.com/us/app/meowdoku-sudoku-cat-puzzle/id6763880105
[benmagowan]: https://github.com/BenMagowan/Chrome_Extensions/blob/57a965ac8593a6285814fcbf22389d90531f6fcc/Queens_Solver/README.md
[queens-mockup]: https://github.com/daniel-jones-dev/queens-puzzle/blob/b6cf58640d2622e724f17a5d36c43fc8945a5a78/web/mockups/play.html
[queens-help]: https://www.linkedin.com/help/linkedin/answer/a6269510
[tyler-appendix]: https://github.com/tylergleeson/game-prototypes/blob/3ee3e0dc4830ef0fc748caf22d3e9c048acf69fc/report/Appendix%20C%20%E2%80%94%20Daily-Puzzle%20Product%20Design.md
[caterpillow]: https://github.com/caterpillow/caterpillow.github.io/blob/1b1e6a1547da45ec1e1ffc72c234d5970ccbabe4/queens-trainer.html
[samimsu]: https://github.com/samimsu/queens-game-linkedin
[cspuz]: https://github.com/semiexp/cspuz/blob/main/cspuz/puzzle/star_battle.py
[oeis]: https://oeis.org/A002464
[wcag-141]: https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
