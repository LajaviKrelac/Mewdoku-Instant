# SOURCES: every source used in Phase 1

Research date: 2026-10-06. The sources are grouped by research angle, and a source used by more than one angle is listed under the first angle that used it.

How each source was accessed:

- Most non-GitHub pages could **not** be fetched directly, either because WebFetch was blocked by egress or because the search budget ran out. Those are known only from search-engine summaries and are marked *(summary)*.
- GitHub and npm sources were read first-hand unless marked otherwise.
- Sources marked **[!] do not open** are contaminated for clean-room purposes (see [06 §4](06-legal-and-originality.md#4-sources-to-avoid-do-not-open-do-not-use)).

## Review pass (2026-10-06): sources re-read first-hand

The review pass made **no new web searches**, because the session's WebSearch budget was already used up. It re-fetched these already-cited sources directly, and the docs now mark the rows they support with "re-read 2026-10-06":

| Source | What it confirmed |
|---|---|
| https://github.com/LeistDev/Meowdoku-macros | "two tap cycle, cross first and cat second"; 150 ms "pause between the two taps on the same cell" (a macro setting); "orange level button of the main menu"; "On defeat the retry button is pressed"; "waits eight seconds after the last cat, closes the leaderboard, and presses the next level button"; "installed and logged in" |
| https://github.com/hrafsa/meowdoku-solver | "post-solve delays for 3-golden-fish animations"; Scoreboard modal ("Papan Peringkat") and Victory screens; grid detection for N = 6–10 |
| https://github.com/nanma80/meowdoku-solver and https://github.com/nanma80/meowdoku-solver/blob/HEAD/REQUIREMENTS.md | "white/red Xs"; "Level 351" (8×8) and "Level 428"; tests on "real clean 8×8/12×12 and marked 8×8/10×10 screenshots" |
| https://raw.githubusercontent.com/thebigjc/meowdoku/HEAD/README.md | Seven deduction rules ending in "assume and refute"; a "nested staircase" sample board; 5×5–12×12 |
| https://github.com/chell-uoxou/memodoku | Only "long ads" and "unlimited memos without ads". It does **not** describe red X's, so it was removed as a source for 01 §5.3. |
| https://github.com/TDKhoa2712/ASOL-Game-02/blob/c9d25c2091daf9b458649e25acf18e8855368f9f/GDD/README.md | "Checked on 2026-09-28": the publisher's description confirms row/column/region logic, no touching, **double-tap** and **three mistake chances** |
| https://raw.githubusercontent.com/george-babyfig/oneshotgame/84a0d802b8d58ca46ccc20a5b46675411873a2a9/docs/product/store-art-notes/broad-pass.json (entry at about character 100 000) | The Meowdoku! (6761760135) screenshot entry: rule chip highlighted per shot, tap-hand pointer, hearts shown, captions, palette, "glowing cats" |
| https://github.com/ke-iwata/hasokon-home/blob/82ec421648102c06f075798b78de040ef0082aba/docs/features/game-binary-puzzle.md | Hint "lights up one determinable cell and gives a one-line reason … Meowdoku's most-praised point" |
| https://github.com/ke-iwata/hasokon-home/blob/82ec421648102c06f075798b78de040ef0082aba/docs/features/game-hoshioki-puzzle.md | #1 free game on App Store Japan as of 2026-09-18; has daily puzzles |
| https://github.com/mjohnson139/expo-sudoku/blob/ec703e27fed7d6bafe04a1b857f57419cc62b62a/docs/fungiku-plan.md | "the look Meowdoku uses: rounded tiles with a gap between them, no grid, no region strokes, no frame" |
| https://github.com/facebook/meta-instant-games-unity-plugin/commits/main | Five commits, 2026-04-13 → **2026-06-02** (none newer) |
| Meta `fbapp-config.json` (Unity template and NEZP sample), `PurchasePlatform.cs`, `API_REFERENCE.md` | As cited in 05; unchanged |
| https://github.com/playgama/bridge/blob/main/src/platform-bridges/FacebookPlatformBridge.ts and https://registry.npmjs.org/@playgama/bridge | `fbinstant.8.0.js`; `globalLeaderboards.*`; banner with position; `getLocale` before start; 2.3.0 (2026-09-30) is still the latest |
| https://raw.githubusercontent.com/DefinitelyTyped/DefinitelyTyped/master/types/facebook-instant-games/index.d.ts | `showAsync` "resolves when user finished watching the ad, and rejects if it failed to present or was closed during the ad"; `setDataAsync` resolving "does not necessarily mean … persisted"; flush is "expensive"; 1 MB; `logEvent` keys must be 2–40 chars; locale only accurate after `startGameAsync` |
| Defold and Cocos 4.0 FB docs | Load "less than 5 seconds"; Android progress stuck at 0 unless init is early; 500-file cap; no server-side logic; Standby → star → Production; embed test URL |

**Blocked in the review pass** (not retried): www.gamigion.com, felixbraberg.substack.com, pocketables.com.

## A. Store listings, catalogs, industry press

**Official listings and pages**

- App Store, Meowdoku! (id6761760135): https://apps.apple.com/us/app/meowdoku/id6761760135 *(summary)*
- App Store reviews (iPhone): https://apps.apple.com/us/app/meowdoku/id6761760135?see-all=reviews&platform=iphone *(summary)*
- App Store reviews (iPad): https://apps.apple.com/us/app/meowdoku/id6761760135?see-all=reviews&platform=ipad *(summary)*
- App Store reviews (UA, Russian): https://apps.apple.com/ua/app/meowdoku/id6761760135?l=ru&see-all=reviews&platform=watch *(summary)*
- App Store, Mac / es-MX: https://apps.apple.com/us/app/meowdoku/id6761760135?l=es-MX&platform=mac *(summary)*
- App Store editorial story: https://apps.apple.com/nz/iphone/story/id6795412703 *(summary)*
- Google Play, com.oakever.meowdoku: https://play.google.com/store/apps/details?id=com.oakever.meowdoku&hl=en_US *(summary)*
- Google Play PC store: https://play.google.com/pc-store/games/details?id=com.oakever.meowdoku&hl=en *(summary)*
- Google Play event cards (content unknown):
  - https://play.google.com/store/apps/eventdetails/4828337312145009026
  - https://play.google.com/store/apps/eventdetails/4830866025916736675
  - https://play.google.com/store/apps/eventdetails/4830251190652173388
  - https://play.google.com/store/apps/eventdetails/4829249458360717373
- Oakever website: https://oakevergames.com/games *(summary)*

**Catalogs, metadata and APK mirrors** (metadata only; nothing downloaded)

- BlueStacks: https://www.bluestacks.com/apps/puzzle/meowdoku-brain-puzzle-games-on-pc.html
- BlueStacks campaign: https://www.bluestacks.com/campaign/com.oakever.meowdoku/ms/
- MuMu: https://www.mumuplayer.com/games/meowdoku-on-pc.html
- mwm.ai: https://mwm.ai/apps/meowdoku/6761760135
- GameWith DB: https://gamewith.jp/gamedb/17237
- FoxData: https://foxdata.com/en/app-marketing-analytics/6761760135/as/US/meowdoku/
- AppFollow (FR): https://apps.appfollow.io/ios/meowdoku/6761760135?country=fr
- app-ranking.net: https://www.app-ranking.net/id/6761760135
- APKPure: https://apkpure.net/meowdoku-brain-puzzle-games/com.oakever.meowdoku/download and https://apkpure.com/meowdoku-brain-puzzle-games/com.oakever.meowdoku/download
- gamekillerapp: https://gamekillerapp.com/games/meowdoku
- soft112: https://meowdoku-ios.soft112.com/
- gamedog: https://m.gamedog.cn/android/4021858.html
- forpc.sourceforge: https://forpc.sourceforge.io/Meowdoku-For-PC/
- Uptodown: https://meowdoku.ru.uptodown.com/android
- APKCombo, MeowTrail: https://apkcombo.com/meowtrail/com.oakever.akari/
- velog (APK blog paraphrasing the store): https://velog.io/@apkloveapk/meowdoku-brain-puzzle-games

**Industry and trade press** (business figures share one upstream origin, see 01 §1.8)

- Gamigion, "$200K a day fully from ads": https://www.gamigion.com/meowdoku-makes-200k-a-day-fully-from-ads/
- Gamigion, ads by tenure: https://www.gamigion.com/meowdoku-segments-users-ad-experience-by-tenure/
- Gamigion, 2M DAU: https://www.gamigion.com/meowdoku-reaches-2-million-dau-in-under-60-days/
- Felix Braberg Substack (same author as Gamigion): https://felixbraberg.substack.com/p/meowdoku-segments-users-ad-experience
- Sett.ai: https://www.sett.ai/content/meowdoku-2m-dau-pure-ad-revenue/
- woshipm: https://www.woshipm.com/share/6431038.html
- Baijing: https://www.baijing.cn/article/56287
- Mobidictum on Learnings: https://mobidictum.com/analysis-chinese-publisher-learnings/
- Forbes Argentina: https://www.forbesargentina.com/lifestyle/el-fenomeno-meowdoku-rompecabezas-gatos-convirtio-exito-global-n92213
- AppGrowing: https://appgrowing.net/blog/en/how-meowdoku-turns-puzzle-rules-into-ad-creative-hooks/
- industry.co.id: https://www.industry.co.id/read/155587/meowdoku-game-puzzle-sudoku-kucing-yang-viral-di-play-store-cara-main-dan-tips-menang
- MobileGamer.biz, Oakever cloning accusations (2026-09-21): https://mobilegamer.biz/vita-mahjong-amaze-go-and-meowdoku-maker-oakever-games-fights-cloning-accusations/

**Web ports, clones and copycats** (not the original)

- Yandex 537825: https://yandex.com/games/app/meowdoku-537825
- Yandex 541580: https://yandex.ru/games/app/meowdoku-cat-puzzle-541580
- Yandex 538534: https://yandex.com/games/app/cats-and-logic-2-538534
- Yandex 537763: https://yandex.com/games/app/cat-sudoku-brain-meowdoku-537763
- Playgama (DRA): https://playgama.com/game/meowdoku-fd95-1
- Playgama "Cat Sudoku": https://playgama.com/game/cat-sudoku-brain-meowdoku
- Playgama "Meowdoku Cat Puzzle": https://playgama.com/game/meowdoku-cat-puzzle
- Fan sites:
  - https://similarlabs.com/p/meowdokugame
  - https://cloudxlab.com/assessment/playlist-intro/3859/meowdoku-a-relaxing-logic-puzzle-for-cat-lovers
  - https://peerlist.io/stephanie88hub/project/meowdoku-online
  - https://www.producthunt.com/products/meowdoku-online
  - https://peerpush.com/p/meowdoku
  - https://www.meowdoku.org/
  - https://meowdoku.app/
  - https://meowdokugame.io/how-to-play/
- Copycat store apps:
  - https://play.google.com/store/apps/details?id=com.dodo.mewodoku
  - https://play.google.com/store/apps/details?id=com.grove42.meowdoku&hl=en_US
  - https://apps.apple.com/us/app/meowdoku-sudoku-cat-puzzle/id6763880105
  - https://www.appbrain.com/app/dogdoku-no-ads-meowdoku/com.dogdoku.jackma.android
  - https://play.google.com/store/apps/details?id=com.games.cat.puzzle.memowdoku&hl=en-US

## B. Reviews, press, social, fan guides

**Press reviews**

- Android Central, "one BIG problem": https://www.androidcentral.com/apps-software/meowdoku-is-sudoku-but-with-cats-and-it-is-highly-addictive-but-it-has-one-big-problem *(summary)*
- Yahoo Tech republication: https://tech.yahoo.com/gaming/articles/meowdoku-sudoku-cats-highly-addictive-090000526.html *(summary)*
- Pocketables (colour-blind review): https://pocketables.com/2026/06/meowdoku-beat-me-in-the-most-annoying-way.html and https://pocketables.com/?p=135592 *(summary)*
- androidworld.nl: https://androidworld.nl/apps/meowdoku-is-sudoku-met-katten-en-een-flinke-dosis-dopamine/ *(summary)*
- GameFoliage: https://gamefoliage.com/2026/06/10/meowdoku/ *(summary)*
- teruteru2: https://www.teruteru2.com/2026/06/10/meowdoku-review/ *(summary)*

**User reviews and aggregators**

- WorldsApps reviews: https://worldsapps.com/reviews-meowdoku
- WorldsApps discussion: https://worldsapps.com/discussion-meowdoku
- unstar: https://unstar.app/app/6761760135?platform=ios&country=en-US
- appshunter: https://appshunter.io/ios/app/meowdoku/id6761760135/reviews
- appreview.jp: https://appreview.jp/app/397538e00a1df6086ddfc4c5483cf980
- irecommend: https://irecommend.ru/content/milaya-razvivayushchaya-igra
- GameCompass: https://www.gamecompass.co/games/meowdoku

**Japanese blogs and Q&A** *(summary)*

- sarusarugame: https://sarusarugame.blog/meowdoku-review/
- penguingames: https://penguingames.hatenablog.com/entry/2026/09/06/151721
- adamhsu: https://www.adamhsu.com/meowdoku-review-tips/
- note.com: https://note.com/fighting_dq4/n/nef9a97ca1764
- Yahoo Chiebukuro Q&A:
  - https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q14329792509
  - https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q13330247133
  - https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q13329319948
  - https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q11329093941

**Social and video** (titles only)

- X post: https://x.com/anze4fgo/status/2079545955129692579
- YouTube:
  - revive: https://www.youtube.com/watch?v=xfVbb7V_xe4
  - hints: https://www.youtube.com/watch?v=RuhzyOyMJ1A
  - leaderboard: https://www.youtube.com/watch?v=84vIO4ARuwY
  - daily: https://www.youtube.com/shorts/VTDQSRiYcjw
  - L160: https://www.youtube.com/watch?v=36x2z3ur4VU
  - L170: https://www.youtube.com/watch?v=ylXRgrPE97A
  - L180: https://www.youtube.com/watch?v=TDBcarUqn8I
  - walkthroughs: https://www.youtube.com/watch?v=u4i4tGYlj8o and https://www.youtube.com/watch?v=e5otiT0soog
  - playlist: https://www.youtube.com/playlist?list=PLb7PYpXaA0Ig
- TikTok: https://www.tiktok.com/discover/meowdoku-hardest-level

**Fan guides, solvers and walkthrough sites** ([!] never use as a level source)

- https://game-solver.com/meowdoku/
- https://meowdokuonline.net/meowdoku-levels/
- https://levelsolve.com/meowdoku/
- https://levelsolve.com/blog/how-to-beat-hard-meowdoku-levels/
- https://www.meowdoku.org/levels
- https://www.meowdoku.org/level/1
- https://www.meowdoku.org/level/150
- https://meowdoku.games/levels/hard-118
- https://meowdoku.run/daily
- https://meowdoku.app/wiki/how-to-play-meowdoku
- https://meowsolver.com/meowdoku-solver
- https://pekuo-games.com/meowdoku/
- https://dlegames.org/blog/meowdoku-rules
- https://meowdokugame.io/meowdoku-vs-queens/
- https://www.capermint.com/blog/game-like-meowdoku-brain-puzzle/

**Dropped** (unrelated sources behind a refuted heart-recharge claim)

- https://app.sensortower.com/api/ios/apps/1579122980?country=US
- https://community.aarp.org/t5/Games-Talk/FAQ-Crosswordling/m-p/2656099

## C. UX and gameplay (mostly GitHub, read first-hand)

**Meowdoku-specific evidence**

- UX teardown of the Yandex build (**[!] mixed: contains `[code]` values from the bundle; implementers do not open**): https://github.com/daymartin99/nicdoku/blob/23220a7dd3e91e39cc6b835a78b2e6c7ba75428a/docs/reference/meowdoku-ux.md
- nicdoku fix plan: https://github.com/daymartin99/nicdoku/blob/23220a7dd3e91e39cc6b835a78b2e6c7ba75428a/docs/review/fix-plan.md
- Android macro for com.oakever.meowdoku: https://github.com/LeistDev/Meowdoku-macros
- Android ADB solver: https://github.com/hrafsa/meowdoku-solver, plus `src/App.tsx` (https://github.com/hrafsa/meowdoku-solver/blob/HEAD/src/App.tsx) and `src/lib/visionEngine.ts` (https://github.com/hrafsa/meowdoku-solver/blob/HEAD/src/lib/visionEngine.ts)
- iPhone screenshot solver: https://github.com/nanma80/meowdoku-solver and https://github.com/nanma80/meowdoku-solver/blob/HEAD/REQUIREMENTS.md
- Solver: https://github.com/relan2049/meowdoku-solver
- Explainer: https://github.com/thebigjc/meowdoku
- App Store screenshot analysis: https://github.com/george-babyfig/oneshotgame/blob/84a0d802b8d58ca46ccc20a5b46675411873a2a9/docs/product/store-art-notes/broad-pass.json
- Vietnamese GDD (store text checked 2026-09-28):
  - https://github.com/TDKhoa2712/ASOL-Game-02/blob/c9d25c2091daf9b458649e25acf18e8855368f9f/GDD/README.md
  - https://github.com/TDKhoa2712/ASOL-Game-02/blob/c9d25c2091daf9b458649e25acf18e8855368f9f/GDD/09-ra-soat-thiet-ke.md
- Japanese design docs:
  - https://github.com/ke-iwata/hasokon-home/blob/82ec421648102c06f075798b78de040ef0082aba/docs/features/game-binary-puzzle.md
  - https://github.com/ke-iwata/hasokon-home/blob/82ec421648102c06f075798b78de040ef0082aba/docs/features/game-hoshioki-puzzle.md
- Fungiku plan ("the look Meowdoku uses"): https://github.com/mjohnson139/expo-sudoku/blob/ec703e27fed7d6bafe04a1b857f57419cc62b62a/docs/fungiku-plan.md
- memodoku: https://github.com/chell-uoxou/memodoku and https://raw.githubusercontent.com/chell-uoxou/memodoku/main/README.md
- ReVanced patch list (metadata only, [!] do not use the patches): https://github.com/Jman-Github/ReVanced-Patch-Bundles/blob/HEAD/patch-bundles/freethekitties-patch-bundles/freethekitties-latest-patches-list.json
- AppGoblin reports:
  - https://github.com/appgoblin-dev/appgoblin/blob/HEAD/frontend/src/routes/reports/ad-user-acquisition-2026-june/new_advertisers.json
  - https://github.com/appgoblin-dev/appgoblin/blob/HEAD/frontend/src/routes/reports/ad-user-acquisition-2026-june/impact_growth.json
  - https://github.com/appgoblin-dev/appgoblin/blob/HEAD/frontend/src/routes/reports/ad-user-acquisition-2026-august/reach.json
- Chart snapshots:
  - https://github.com/cww0808/Google_Game_ranking_analysis_system/blob/main/reports/2026-06-25.md
  - https://github.com/cww0808/Google_Game_ranking_analysis_system/blob/main/reports/2026-07-24_0700.md
  - https://github.com/cww0808/Google_Game_ranking_analysis_system/blob/main/reports/2026-07-31_2014.md
  - https://github.com/tempest1033/GamerScroll/blob/main/snapshots/rankings/2026-09-04_ios_us_free.csv
  - https://github.com/ananttheant/Miniclip-Store-Rankings/blob/main/data/itunes.json
  - https://github.com/lrhehe/casual-games-daily/blob/HEAD/data/featured.json
- News aggregator archive: https://github.com/Trafalgardi/game-news-aggregator/blob/HEAD/public/archive/2026-09-22.json
- Legal entity: https://github.com/toyfer/meowdoku-solution-method
- XdendunGames on Playhop: https://github.com/dixonSolutions/potatoetomatoe3/blob/HEAD/static/games/playhop-color-puzzle-jam-531359/online/metadata.json
- Fan Playbook (SEO; refuted claims): https://github.com/Meowdoku-Playbook/.github
- SudoKitty (complaints not found in repo): https://github.com/Mixa-Bosu/SudoKitty
- German fan guide (README 404): https://github.com/heistermeister/meowdoku-guide
- Templated guide data: https://github.com/wyong32/meowdoku/blob/main/data/levels.json

**Clones and name collisions** (genre reference only)

- https://github.com/whayeveoo-eng/meowdoku
- https://github.com/NanbuShirou/MeowDoku_android and https://github.com/NanbuShirou/MeowDoku_android/releases/tag/v1.3.0
- https://github.com/cormort/meowdoku
- https://github.com/kelvinlamkiwan/zoo-queens
- https://github.com/kkan64973-sys/terinyan
- https://github.com/TruncatedPi/FrankieDoku
- https://github.com/eve8080/pigdoku
- https://github.com/jwk000/ai-meowdoku
- https://github.com/pat-mw/meowdoku
- https://github.com/asyncawaitpromise/meowdoku and https://github.com/asyncawaitpromise/meowdoku/issues/20
- https://github.com/yocox/meowdoku, https://github.com/yocox/meowdoku/issues?q=is%3Aissue and https://raw.githubusercontent.com/yocox/meowdoku/main/README.md
- https://github.com/LexSong/meowdoku-extension
- https://github.com/masato-masa/nyandoku
- https://github.com/stephanieraymos/meow/blob/e3058fc82f7b016eb0f9d7e5a5e668f86d686473/Meowdoku/Engine/LevelCatalog.swift
- https://github.com/thecoder-co/cross-sums-bot ("Meowdoku" in Offline Games)
- https://github.com/kayleenasser/Meowdoku (unrelated 2022 Sudoku)
- https://github.com/search?q=meowdoku&type=repositories (94 repos)

**[!] Do not open** (listed for completeness only; see 06 §4)

- https://github.com/yizong-boop/meowdoku-site (extracted original assets)
- https://github.com/nasirul786/meowdoku and https://raw.githubusercontent.com/nasirul786/meowdoku/main/README.md (AI-copied)
- https://github.com/enaayahagenticai-tech/meowdoku-clone ("exact clone")
- https://github.com/TDKhoa2712/ASOL-Game-02/blob/c9d25c2091daf9b458649e25acf18e8855368f9f/docs/superpowers/specs/technical_comparison_and_optimization_guide.md (decompilation-based)

**Genre conventions** (LinkedIn Queens, Star Battle)

- LinkedIn Help a6269510: https://www.linkedin.com/help/linkedin/answer/a6269510 (second-hand)
- LinkedIn Queens: https://www.linkedin.com/games/queens/ and https://www.linkedin.com/games/
- Queens solver README: https://github.com/BenMagowan/Chrome_Extensions/blob/57a965ac8593a6285814fcbf22389d90531f6fcc/Queens_Solver/README.md
- Queens mockup: https://github.com/daniel-jones-dev/queens-puzzle/blob/b6cf58640d2622e724f17a5d36c43fc8945a5a78/web/mockups/play.html
- Daily-puzzle product design: https://github.com/tylergleeson/game-prototypes/blob/3ee3e0dc4830ef0fc748caf22d3e9c048acf69fc/report/Appendix%20C%20%E2%80%94%20Daily-Puzzle%20Product%20Design.md
- https://github.com/mspiegel/queens-without-backtracking/blob/839794599d8e170d9b1beb76fe3b717c1a3b8cf4/docs/index.md
- https://github.com/zmxv/ccmq/blob/3bf86c44cc03f535e59c3dcd830163a0ee669295/ccmq.adoc
- Queens trainer: https://github.com/caterpillow/caterpillow.github.io/blob/1b1e6a1547da45ec1e1ffc72c234d5970ccbabe4/queens-trainer.html
- https://github.com/M1KUAPP/Turn/blob/b15470da566aa173e95ea22cbdaa27342b7ea7ad/docs/research/0016-game-design.md
- Star Battle planning doc: https://github.com/masonomara/star-battle/blob/4e2d60c08593e0080cad266c229e96decf05bab3/docs/specs/archive/00-initial-planning.md

**Accessibility**

- WCAG 1.4.1 (GitHub source): https://github.com/w3c/wcag/blob/main/understanding/20/use-of-color.html
- WCAG 1.4.1 (w3.org): https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
- WCAG 1.4.11: https://github.com/w3c/wcag/blob/main/understanding/21/non-text-contrast.html
- Paul Tol palettes: https://github.com/Descanonge/tol_colors and https://personal.sron.nl/~pault/ (not fetched)
- colorblindr: https://github.com/clauswilke/colorblindr
- Okabe-Ito: https://jfly.uni-koeln.de/color/ (not fetched)

## D. Puzzle theory and algorithms

- samimsu Queens clone:
  - https://github.com/samimsu/queens-game-linkedin
  - SMT solver: https://github.com/samimsu/queens-game-linkedin/blob/main/src/utils/solveQueensSMT.ts
  - Backtracking solver: https://github.com/samimsu/queens-game-linkedin/blob/main/src/utils/solveQueens.ts
  - https://github.com/samimsu/queens-game-linkedin/blob/main/scripts/solveAllCommunityLevels.ts
  - https://github.com/samimsu/queens-game-linkedin/blob/main/src/workers/solveQueensWorker.ts
  - https://github.com/samimsu/queens-game-linkedin/blob/main/package.json
  - https://github.com/samimsu/queens-game-linkedin/blob/main/src/utils/types.ts
  - https://github.com/samimsu/queens-game-linkedin/blob/main/scripts/findDuplicates.ts
  - https://github.com/samimsu/queens-game-linkedin/tree/main/src/utils/community-levels
- Hillel Wayne, Queens with SMT (not fetched): https://buttondown.com/hillelwayne/archive/solving-linkedin-queens-with-smt/
- cspuz:
  - Star Battle: https://github.com/semiexp/cspuz/blob/main/cspuz/puzzle/star_battle.py
  - https://github.com/semiexp/cspuz/blob/main/cspuz/solver.py
  - https://github.com/semiexp/cspuz/blob/main/cspuz/generator/core.py
  - https://github.com/semiexp/cspuz/blob/main/cspuz/generator/deterministic_random.py
- grilops:
  - https://github.com/obijywk/grilops/blob/master/examples/star_battle.py
  - https://github.com/obijywk/grilops/blob/master/grilops/grids.py
- nikoli-puzzle-solver: https://github.com/kevinychen/nikoli-puzzle-solver/blob/main/src/solvers/starbattle.ts
- OEIS A002464 (not fetched; counts reproduced locally): https://oeis.org/A002464
- Knuth, Dancing Links (not fetched): https://arxiv.org/abs/cs/0011047
- Krazydad Star Battle (not fetched): https://krazydad.com/starbattle/tutorial/tutorial_10x10.php and https://www.krazydad.com/starbattle/
- Wikipedia Star Battle (not fetched): https://en.wikipedia.org/wiki/Star_Battle
- **Our own measurements**, committed in this repo:
  - [engine-prototype/lab/](engine-prototype/lab/): `queens.mjs` (solver, generator, grader, PRNG), `count_kings.mjs`, `daily.mjs`, `bench_*.mjs`
  - [engine-prototype/checks/](engine-prototype/checks/): `xcheck.mjs` (independent brute force), `bias.mjs`, `pk.mjs`, `gradecheck.mjs`, `filters.mjs` (shape-filter acceptance), `tut.mjs` (tutorial board uniqueness)

## E. Facebook Instant Games platform

**Meta's own repositories (2026)**

- Unity plugin: https://github.com/facebook/meta-instant-games-unity-plugin
- README: https://github.com/facebook/meta-instant-games-unity-plugin/blob/main/README.md
- API reference: https://github.com/facebook/meta-instant-games-unity-plugin/blob/main/documentation/API_REFERENCE.md
- Bundle uploader: https://github.com/facebook/meta-instant-games-unity-plugin/blob/main/Assets/Meta.InstantGames/Editor/InstantGameBundleUploadWindow.cs
- WebGL template:
  - https://github.com/facebook/meta-instant-games-unity-plugin/blob/main/Assets/WebGLTemplates/FB/index.html
  - https://github.com/facebook/meta-instant-games-unity-plugin/blob/main/Assets/WebGLTemplates/FB/fbapp-config.json
  - https://github.com/facebook/meta-instant-games-unity-plugin/blob/main/Assets/WebGLTemplates/FB/ig_views/share.xml
- Utility classes:
  - https://github.com/facebook/meta-instant-games-unity-plugin/blob/main/Assets/Meta.InstantGames/Runtime/Plugins/UtilClasses/ConnectedPlayer.cs
  - https://github.com/facebook/meta-instant-games-unity-plugin/blob/main/Assets/Meta.InstantGames/Runtime/Plugins/UtilClasses/PurchasePlatform.cs
  - https://github.com/facebook/meta-instant-games-unity-plugin/blob/main/Assets/Meta.InstantGames/Runtime/Plugins/UtilClasses/Purchase.cs
  - https://github.com/facebook/meta-instant-games-unity-plugin/blob/main/Assets/Meta.InstantGames/Runtime/Plugins/UtilClasses/AdType.cs
  - https://github.com/facebook/meta-instant-games-unity-plugin/blob/main/Assets/Meta.InstantGames/Runtime/Plugins/UtilClasses/UpdateAction.cs
  - https://github.com/facebook/meta-instant-games-unity-plugin/blob/main/Assets/Meta.InstantGames/Runtime/Plugins/UtilClasses/ContextType.cs
- NEZP samples:
  - https://github.com/fbsamples/fbinstant-nezp-samples
  - https://github.com/fbsamples/fbinstant-nezp-samples/blob/main/nezp_sample_xmls_picker/index.html
  - https://github.com/fbsamples/fbinstant-nezp-samples/blob/main/nezp_sample_xmls_picker/fbapp-config.json
  - https://github.com/fbsamples/fbinstant-nezp-samples/blob/main/nezp_sample_xmls_picker/ig_views/leaderboard_list.xml
  - https://github.com/fbsamples/fbinstant-nezp-samples/blob/main/nezp_sample_xmls_picker/main.js

**SDK type definitions (7.1)**

- https://raw.githubusercontent.com/DefinitelyTyped/DefinitelyTyped/master/types/facebook-instant-games/index.d.ts
- https://github.com/DefinitelyTyped/DefinitelyTyped/pull/67927 (2024-01-09)
- https://github.com/DefinitelyTyped/DefinitelyTyped/pull/70163 (2024-08-07)
- https://github.com/DefinitelyTyped/DefinitelyTyped/commits/master/types/facebook-instant-games
- https://registry.npmjs.org/@types/facebook-instant-games and https://www.npmjs.com/package/@types/facebook-instant-games

**Third-party adapters**

- Playgama Bridge:
  - https://registry.npmjs.org/@playgama/bridge (2.3.0, 2026-09-30) and https://www.npmjs.com/package/@playgama/bridge
  - https://github.com/playgama/bridge/blob/main/src/platform-bridges/FacebookPlatformBridge.ts
  - https://github.com/playgama/bridge/commits/main/src/platform-bridges/FacebookPlatformBridge.ts
  - https://github.com/playgama/bridge/blob/main/src/platformDetectors.ts
  - Commits:
    - https://github.com/playgama/bridge/commit/e2d6069 (2025-04-17, SDK 8.0)
    - https://github.com/playgama/bridge/commit/792290e
    - https://github.com/playgama/bridge/commit/7513a13 (2025-05-30)
    - https://github.com/playgama/bridge/commit/e28b0f1 (2025-06-23)
    - https://github.com/playgama/bridge/commit/9cc93a6 (2025-08-15)
    - https://github.com/playgama/bridge/commit/b4ec522 (2026-03-06)
    - https://github.com/playgama/bridge/commit/0d4c3e0 (2026-03-11)
- https://registry.npmjs.org/@maoyugames/phaser-platform-facebook (2026-07-14)
- https://registry.npmjs.org/@cardsjd/fbinstantgame (0.1.12, 2026-05-27)
- https://github.com/lizzardchen/dog-crash/blob/1d97ef5e1ff8ef079e863dafa19e5d0bfc1c3152/assets/script/ADSDK/PlatformFacebook.ts
- https://github.com/slavshik/fb-instant-tools/blob/master/src/commands/upload.ts
- https://github.com/MichaelAScott43/Loudmouth-Spin-Lab/blob/main/scripts/upload-fb.js

**Engine documentation and templates**

- Cocos Creator:
  - https://github.com/cocos/cocos-docs/blob/master/versions/4.0/en/editor/publish/publish-fb-instant-games.md
  - https://github.com/cocos/cocos-docs/blob/master/versions/2.4/en/publish/publish-fb-instant-games.md
  - https://github.com/cocos/cocos-engine/blob/develop/templates/fb-instant-games/index-plugin.ejs
  - https://github.com/cocos/cocos-engine/blob/develop/templates/fb-instant-games/index.js.ejs
  - https://github.com/cocos/cocos-engine/blob/develop/templates/fb-instant-games/fbapp-config.json
- Defold:
  - https://github.com/defold/extension-fbinstant/blob/master/docs/index.md
  - https://github.com/defold/extension-fbinstant/blob/master/fbinstant/manifests/web/engine_template.html
  - https://github.com/defold/extension-fbinstant/commits/master
- GDevelop:
  - https://github.com/4ian/GDevelop/blob/master/newIDE/app/src/ExportAndShare/GenericExporters/FacebookInstantGamesExport.js
  - https://github.com/4ian/GDevelop/blob/master/GDJS/Runtime/FacebookInstantGames/index.html
  - https://github.com/4ian/GDevelop/blob/master/GDJS/Runtime/FacebookInstantGames/fbapp-config.json
  - https://github.com/4ian/GDevelop/blob/master/Extensions/FacebookInstantGames/JsExtension.js

**Official Meta documentation** (blocked during research; verify in Phase 4)

- https://developers.facebook.com/docs/games/instant-games/getting-started/quickstart
- https://developers.facebook.com/docs/games/instant-games/best-practices
- https://developers.facebook.com/docs/games/instant-games/test-publish-share
- https://developers.facebook.com/docs/games/instant-games/sdk/fbinstant7.1
- https://developers.facebook.com/docs/games/instant-games/bundle-config
- https://developers.facebook.com/docs/games/instant-games/changelog

## F. Meta-game and economy comparables (background; mostly not fetched)

- Queens clone (cloned at commit 86655f8, UI strings and settings only): https://github.com/samimsu/queens-game and https://queensgame.vercel.app/
- Sudoku.com: https://sudoku.com/ and https://play.google.com/store/apps/details?id=com.easybrain.sudoku.android
- Neko Atsume: https://play.google.com/store/apps/details?id=jp.co.hit_point.nekoatsume
- Cats & Soup: https://play.google.com/store/apps/details?id=com.hidea.cat
- Yandex Games ads SDK: https://yandex.com/dev/games/doc/en/sdk/sdk-adv
