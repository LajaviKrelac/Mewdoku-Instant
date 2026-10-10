# Phase 2e research: Meowdoku's five requested features (the original app)

Date: 2026-10-10 · Researcher: subagent (read-only research, no code) · Feeds: Phase 2e (the user's request of 2026-10-11: leaderboards, video ads, in-app purchases, daily streak, daily challenge, "same as in Meowdoku")

## 0. Method, access limits and clean-room notes

- **Read first:** 01 (§5–§11, §15–§19, the first-hand updates), SOURCES.md, phase2/differences-vs-original.md (§2.4–§2.8, §5, §6), phase2b/parity-spec.md (§3–§5, research rows only), `scratchpad/2d/research.md`, `scratchpad/2d1/hint-stills.md` and `mouse-cat.md`.
- **Never opened:** any source in 06 §4. Fan walkthrough and level-answer domains were blocked in the searches. Where one still showed up in a result list (meowdoku.org, levelsolve.com, meowdokuonline.net, meowdoku.im), it was **not** used. A GitHub repo that describes itself as an AI copy of the game (`xhw0715/meowdokuonline`) showed up in one result list. It is the same kind of source as the §4 Telegram copy, so it was neither opened nor used. Its claim of a "top 30" ranking is ignored.
- **Access in this session:** WebFetch fails for every domain (DNS `ENOTFOUND`: substack, sett.ai, apps.apple.com). A direct `curl` to apps.apple.com is refused by the egress proxy (`CONNECT tunnel failed, 403`). It was tried once and not retried. WebSearch refuses reddit.com and threads.net. So, as in Phases 1 and 2d, **every web fact here comes from search-engine summaries** of the cited pages. Quoted fragments are the summariser's rendering, kept short and paraphrased. None of this wording may go into our product (06 §3).
- **Name pollution.** Many look-alike apps use the same name and have streaks, calendars and 7-day rewards (see §8). Only facts tied to Oakever's app (App Store id 6761760135, Play package `com.oakever.meowdoku`) are listed as facts.
- **Confidence:**
  - **confirmed** = official store text or editorial, the user's own first-hand report or recording, or several independent reports that agree.
  - **likely** = a single good source, or several user reports with some disagreement.
  - **unknown** = not found. Our own deductions are marked *(inference)*.
- **First-hand facts** from earlier phases keep their tags: "user, first-hand, 2026-10-09/10" and "user recording(s), 2026-10-10" (01).

---

## 1. Leaderboard

| # | Fact | Conf. | Source |
|---|---|---|---|
| L1 | **The ranking is a daily competition among about 50 players.** A Japanese Q&A describes the "daily ranking" as 50 people competing every day for 24 hours. Several App Store reviews call it the "daily ranking" ("I often come first in the daily ranking"). Phase 2d already had "the period appears to be daily" (2d research X.1). | likely (daily, 24 h) / likely (≈ 50, one Q&A plus a review summary) | [chie-heart]; [as-rev-gb]; [as-jp-rev]; 2d research X.1 |
| L2 | **When the 24 h start is unclear.** Japanese reviews say the ranking window seems to start at the player's own login or first play that day, so other players' records are no use as a reference. Another review asks whether there are fixed start and end hours. No fixed reset hour was found. | likely (a per-player window, several JP reviews) / unknown (exact rule) | [appreview-jp] |
| L3 | **What it ranks: the fish (lives) kept at each win, added up over the period.** This is the user's first-hand F2. It is corroborated by an App Store review ("first place with 74 fish, the second at 48, then third after one short game"). A Japanese review says the ranking basis changed overnight from **cats** (up to 10 per level) to **"bones"** (only 3 per level), so you must keep playing to stay on top. That matches 3 lives per level *(inference: "bones" is that reviewer's word for the fish icon)*. The store copy's older promise of global leaderboards for "fastest completion times" no longer describes it. | confirmed (fish kept → points; user F2 plus reviews) / likely (it once counted cats) | user, first-hand, 2026-10-09 (01 §10.16); [unstar]; [appreview-jp]; [as] |
| L4 | **Shown after every win.** An Android solver auto-dismisses a "Scoreboard" after each solve. A macro closes "the leaderboard" about 8 s after the last cat. A Japanese review complains that the ranking appears after **every** clear and gets in the way. | confirmed | [hrafsa], [leist] (01 §7.1.2); [appreview-jp] |
| L5 | **Rows carry a heart counter (likes).** The ranking display shows a heart with a number next to players. Most show 0 or 1, some show 4 or 9. Tapping one's own heart made it 1. One player received 49 hearts, and another reached 150 when in first place. Hearts seem to arrive after very fast solves, and a message says another player gave you a heart. What hearts do, if anything, is unknown. | likely (exists; one Q&A thread plus a review summary) / unknown (function) | [chie-heart]; [appreview-jp] |
| L6 | **Rank rewards: first place pays 2 kitties + 2 hints, and a rewarded ad offers to double that to 4 + 4.** Reviewers say the doubling often fails (about 70 % of the time for one, 5–6 times out of 25 "high scores" for another). The developer apologised for a bug that stopped ranking rewards from doubling after the ad. Reviewers also call it winning "group challenges" (2 cats, 4 after an ad), which is probably the same 50-player ranking *(inference)*. A forum tip names **"top 3" of the daily leaderboard** as a way to earn rewards. A Japanese review says first place pays **no more than the "weekly reward"**. Rewards for 2nd–3rd place, if any, are unknown. | confirmed (1st place = 2 + 2, ad doubles; several reviews plus a developer reply) / likely (top 3 are paid) / unknown (2nd and 3rd amounts) | [as-rev-gb]; [as-rev]; [as-ipad]; [worldsapps-disc]; [as-jp-rev]; 01 §6.9, differences §2.5 |
| L7 | **Players think the rivals are bots.** Reviewers say the others always stay just behind you, that NPCs below follow closely, that ranks don't move while you are away, and that it updates even in airplane mode (one JP review instead says you cannot join in airplane mode). App Store and AppBrain reviews call it "fake". The developer calls it "additional content" and passes on requests to switch it off. | likely (player claims) / unknown (truth) | [as-rev-hr]; [unstar]; [appreview-jp]; [as-jp-rev]; [appbrain] |
| L8 | **Added in a late-July 2026 update, without notice.** JP reviews dated 27 and 30 July mention the newly added ranking. Reviewers ask for an opt-out, and the developer says it will pass this on. One review says the win "trumpet cat" vanished when the ranking arrived and later came back on Android. No ranking history is viewable. | likely | [as-jp-rev]; [appreview-jp]; [as-ipad] |
| L9 | **Friends or global tabs: none found.** The store text promises "global leaderboards" and says the game avoids social features. No friends board, tabs, weekly or all-time view, or Game Center board was found. The Android app has a logged-in player (01 §7.1.5). | likely (no tabs found) / unknown (UI) | [as]; [leist] |
| L10 | **In-play social lines.** If a player takes a while, a JP review says comments scroll by in the style of video-site comments (e.g. that fast players solved this level in 350 s). These are probably the level tickers of 01 §12.28 *(inference)*. A JP review also says normal stages used to show the clear time at the end and no longer do. | likely | [appreview-jp]; [applion-and] |

## 2. Video ads

### 2.1 Banner

| # | Fact | Conf. | Source |
|---|---|---|---|
| B1 | **A 320 × 50 banner sits at the bottom during play**, centred, under the helper buttons. Reviews describe a permanent bottom banner too. | confirmed | user recording, 2026-10-10 (01 §11.12); [unstar]; [as-rev] |
| B2 | **Banners start at level 10** (Braberg's analysis, re-found this session). | likely (single origin) | [braberg]; [gam-tenure] |
| B3 | **Hidden while the hint overlay is open**, and a fresh creative loads on close. In two level-start stills (Level 114, 8 s apart) **no banner** showed. | confirmed (seen) / unknown (rule) | user recordings, 2026-10-10 (2d.1 hint-stills §11) |
| B4 | **Content complaints:** shopping or scam banners, a flashing ad that looked like part of the game, and redirects without a tap (a JP review names SHEIN). | likely | [as-rev]; [appreview-jp]; [apps-island] |
| B5 | Banners on other screens (home, win, ranking): **not found**. | unknown | — |

### 2.2 Interstitial

| # | Fact | Conf. | Source |
|---|---|---|---|
| I1 | **Between levels, after a win and after a loss, from level 10** (Braberg). Cooldown by tenure: **120 s on days 0–2, 100 s on days 2–7, 90 s from day 7**, muted by default. These numbers have one origin and are probably remote-configured. | likely (single origin) | [braberg]; [gam-tenure]; [sett] |
| I2 | **Player reports of the start disagree:** level 11 (JP review); about level 30–40 (US reviews, and a developer reply repeating the reviewer's "after level 30"); about 50 (JP); none until 60–100 levels if the app stays open and no hints are used, then after every level past ~60 once relaunched (X post); ad-free for about a week after install (US review). Consistent with remote config, A/B tests and a time cooldown. | confirmed (a grace period exists) / unknown (exact level) | [appreview-jp]; [as-rev]; [as-ipad]; [x-anze]; 01 §11.5 |
| I3 | **After that, after (almost) every level.** "One after almost every single level" (Android Central). Many reviews say the same. | confirmed | [ac]; [as-rev]; [unstar]; [appshunter] |
| I4 | **On Restart / Retry too:** "an ad when you restart", "every restart locked behind an ad". One JP review says about every second retry. The developer says ads can appear before or after a level, including after a player **declines the revive**. | likely | [as-rev]; [appreview-jp]; [as-ipad] |
| I5 | **Skippability:** some skip after about 5 s; others are long, unskippable, or take several screens to close. Killing the app after a clear skips the ad (JP tip). The developer says most should become skippable after several seconds. | likely | [as-rev]; [appreview-jp]; [as-ipad] |
| I6 | Store copy still promises "Non-Intrusive Ads: zero interruptions to your gameplay". None show **during** play. | confirmed | [as]; [gp] |

### 2.3 Rewarded video

| # | Fact | Conf. | Source |
|---|---|---|---|
| R1 | **At 0 stock, a helper shows a green "play" badge and is refilled by video.** The kitty and the bulb switch from a red count to the video badge at 0. Reviews and a JP review site say items used up are refilled by watching ads. How many per video is unknown (Web-Y gave +1, a different product). | confirmed (badge, refill by ad) / unknown (amount, prompt) | user recordings, 2026-10-10 (01 §6.14); [apps-island]; [ac]; [as-rev] |
| R2 | **Mouse: always a video** (no stock count; 3 X's per use). | confirmed (one use) | user recordings, 2026-10-10 (01 §6.10) |
| R3 | **Revive after losing all lives:** when lives run out you get a revive for an ad, or a restart (which also shows an ad). YouTube titles exist for "How to revive after losing all hearts" and "Fix revive not working after watching an ad". A JP review says you must watch an ad to get more cats (lives). Fish restored and revives per level: unknown. | confirmed (offered for an ad) / unknown (size, limit) | [as-rev]; [yt-revive]; [yt-revive-fix]; [appreview-jp]; 01 §5.7 |
| R4 | **Doubling the ranking reward** (L6). | confirmed | [as-rev-gb]; [as-ipad] |
| R5 | Braberg: rewarded ads for revives and extra boosters **from level 1**. | likely (single origin) | [braberg] |

## 3. In-app purchases

| # | Fact | Conf. | Source |
|---|---|---|---|
| P1 | **iOS sells only subscriptions**, six SKUs: **Premium** $3.99/wk, $7.99/mo, $34.99/yr and **Premium Plus** $6.99/wk, $14.99/mo, $69.99/yr. JP: ¥600 / ¥1,300 / ¥6,000 and ¥1,100 / ¥2,500 / ¥11,000. UK the same tiers in pounds. **No consumable (hint, kitty or mouse pack) and no one-off "Remove Ads" is listed.** | confirmed (list) | [as]; [as-gb-ipad]; [as-jp]; 01 §11.7 |
| P2 | **What Premium and Premium Plus include: not found.** GameCompass reads the tiers as pressure to pay for an ad-free experience or content (a secondary opinion). | unknown | [gamecompass] |
| P3 | **iOS subscriptions arrived after launch:** an applion snapshot of 2026-06-20 and an older FoxData snapshot show "no in-app purchases". | likely | [applion-ios]; [foxdata] |
| P4 | **Android:** the Play listing says "Contains ads · In-app purchases" (applion: IAP "yes", 2026-09-28). The catalogue is **not visible** in any source. Android Central (about Sep 2026) says there is no premium ad-free version on Android. | confirmed (flag) / unknown (catalogue) | [gp]; [applion-and]; [ac] |
| P5 | **Buying helpers:** the developer replied that it is passing requests for "an IAP to remove ads and options to buy hints/cats" to its product team. A later reply says the game "offers an optional ad removal feature", which contradicts reviewers who say nothing can be bought. **No evidence that the original sells hints, kitties or mice, during play or anywhere.** | likely (requests and replies) / unknown (any helper purchase exists) | [as-ipad]; [as-rev] |
| P6 | Fish are not sold (they are lives and ranking points). | confirmed | user, first-hand, 2026-10-09 (01 §11.13) |

## 4. Daily streak

| # | Fact | Conf. | Source |
|---|---|---|---|
| S1 | **A 7-day streak exists, at least as players describe it.** A WorldsApps forum tip says to play at least one game every day to get a **7-day streak**, or to place in the **top 3 of the daily leaderboard**, as ways to earn more (the post does not name the reward). A JP review mentions a **"weekly reward"** that pays as much as first place in the ranking *(inference: the 7-day streak reward; 2 kitties + 2 hints if it equals L6)*. | likely (single forum post plus a single review) / unknown (reward contents) | [worldsapps-disc]; [as-jp-rev] |
| S2 | **What counts as a day:** "at least one game daily" per the forum tip. Whether that means any level, the daily puzzle or just opening the app is **unknown**. | unknown | [worldsapps-disc] |
| S3 | Display, reset on a missed day, streak freeze or repair (for example by ad), and reset time: **no source for Oakever's app.** The detailed streak features found online (calendars, "missing a day never resets", share cards) all belong to look-alike apps (§8). | unknown | — |

## 5. Daily challenge

| # | Fact | Conf. | Source |
|---|---|---|---|
| D1 | **A new "Daily Puzzle" every day** (store copy, App Store and Play). YouTube walkthrough titles call it "Daily Challenge" with a date (17 and 18 June 2026), so it existed by mid-June. | confirmed | [as]; [gp]; [yt-dc-17]; [yt-dc-18] |
| D2 | **Unlocks after passing level 21** (Apple's editorial story: pass level 21 to get a new challenge every day). A fan site's "about 21" agrees (01 §10.10). | confirmed (iOS editorial) | [as-story] |
| D3 | **One puzzle per day** ("1日1問", a JP review); a reviewer likes doing one daily a day. | likely | [gamefoliage]; [applion-and] |
| D4 | **12 × 12 boards appear in the dailies, and apparently only there.** An iPhone solver fixture is named "12x12-daily-0924". A blogger at level 410 asks whether 12 × 12 is only for dailies. Android and iOS reviewers ask for 12 × 12 boards outside the daily. Other daily sizes: unknown. | likely | [nanma80] (01 §10.10); [note-riko]; [applion-and]; [as-jp-rev] |
| D5 | **Time:** the store text pairs dailies with "fastest completion times on the global leaderboards". A JP review says the clear time used to show after **normal** stages and no longer does. Whether the daily shows a timer or a time on its result: unknown. | likely (time was shown once) / unknown (daily) | [as]; [appreview-jp]; [applion-and] |
| D6 | **Reset:** a YouTube tips video promises how to "get the new daily challenge early", which suggests a reset tied to the device clock or local date *(inference)*. The reset hour is unknown. | unknown | [yt-tips] |
| D7 | **Rewards, trophies, calendar or archive, past days, a daily-only leaderboard, lives and helpers inside the daily: none found** for Oakever's app. A reviewer mentions a "daily puzzle percentage" they do not understand (unclear). | unknown | [as-rev] |
| D8 | Whether the daily feeds the 50-player ranking (L3) and the level points (01 §10.17): unknown. | unknown | 01 §19 |

## 6. Contradictions and cautions

1. **Ranking basis:** store copy says fastest times, the user and reviews say fish kept, and one JP review says it was once cats. Take the user's report, which is the current Play app (L3).
2. **Ranking period:** the user said only "per period" (01 §10.16). Reviews and Q&A say daily, 24 h, about 50 players. Our build's default (UTC weeks) does **not** match this evidence.
3. **Ad start:** level 10 (Braberg), 11, 30–40, 50, or 60–100, or one week. This is a remote-config pattern, so record a fresh install.
4. **Remove ads:** the developer says it exists, reviewers and Android Central say no, and iOS lists only Premium subscriptions. Possibly Premium is the "optional ad removal" *(inference)*.
5. **Airplane mode:** the ranking updates offline (one review) versus you can't join offline (another).
6. **Group challenge vs daily ranking:** the same reward numbers (2 → 4) are used for both. Probably one feature under two names *(inference)*.

## 7. What only the user's own recordings can settle

Each item is a short recording or a few screenshots on the Play app (Android), plus iOS where noted.

**Leaderboard**
1. How to open it besides the post-win popup: a Home button, a trophy? Is it ever on the game screen?
2. One full post-win sequence (fish → ranking → victory), with timings and every element of the ranking panel:
   - rank and row count (is it really 50?);
   - per row: avatar, name, flag, points icon and number, heart count;
   - my own row's highlight;
   - scrolling;
   - a countdown or "ends in";
   - the title.
3. Points added per win: 1–3 fish? Does a level with a revive, a retry, the daily or a hard level add more?
4. What happens when the 24 h ends: a result screen, rank rewards for places 1, 2, 3 and beyond, the claim button, the "×2 by video" offer. Is the window per player (from first play) or fixed? Note the clock time of each.
5. What tapping a heart does: give a like, limits, any reward.

**Ads**
1. A **fresh install**, levels 1–15 and later: the first banner, the first interstitial, and when each appears (after Next? before the level?).
2. Ten consecutive levels with a stopwatch: the interstitial count, any time cooldown, and whether a fast win skips it.
3. A loss: the revive offer (what it shows, fish restored, how many per level), declining it, Retry (ad or not), a second loss.
4. The banner on Home, victory, ranking, daily and settings screens; when it hides (hint overlay, win sequence, revive dialog); its delay at level start.
5. Each helper at 0: the prompt or the video at once, the amount granted per video (hint, kitty), and an ad-unavailable case (airplane mode).

**IAP**
1. Android: any shop, Premium or "remove ads" entry and its screen, with product names, prices and contents.
2. iOS: the Premium / Premium Plus paywall text (what each tier removes or grants), and where the paywall pops up.
3. What appears when a helper is at 0 during play: is a purchase ever offered there? (This is the user's feature 3. No public evidence says the original sells helpers.)

**Daily streak**
1. Where a streak is shown (Home, daily screen, a popup on launch); its look and counter; the day 1–7 rewards and the "weekly reward".
2. What counts: one level, the daily, or a login. What a missed day does (reset, freeze, repair by ad). The reset time.

**Daily challenge**
1. The entry point and its locked state before level 21.
2. The daily screen: one puzzle or several; a calendar of past days; playing a missed day; trophies, badges or monthly art; a countdown to the next.
3. The daily board size and label (how often 12 × 12), lives and helpers inside it, Retry behaviour, a timer during play.
4. The result screen: time, percentile ("daily puzzle percentage"?), reward, ranking. Does the 50-player ranking total rise after a daily win?
5. The reset: the screen just before and after local midnight (and, if possible, after UTC midnight).

## 8. Seen but not evidence (look-alikes and fan sites)

These describe **other** apps and must not be built as "the original's":

- **Meowlodoku** (`com.kago.meowlodoku`): a 7-day reward cycle of hints and "Meow Finders"; missing a day never resets progress; videos double daily gifts.
- **"Meowdoku: Cat Logic Puzzle"** (`com.dodo.mewodoku`): one daily, the same for everyone, your own time and streak, a share card, a personal record not a global board, no ads.
- **"Meowdoku: Cat Sudoku"** (`com.grove42.meowdoku`): a Daily Challenge "to keep your streak going".
- **"Cat Sudoku: Brain Meowdoku"** (id6783326146): daily challenges with tasks, rewards and a streak.
- **"Meowdoku: Sudoku Cat Puzzle"** (id6763880105): a paw-print calendar, daily streaks, Game Center achievements, "ad-free".
- **"Meow Sudoku: Cat Puzzle Games"** (id6781143433): Remove Ads IAPs at $4.99 and $19.99.
- Fan web clones and SEO sites (meowdoku.fun, .gg, .online, .site, .pro, .us, .co, .xyz, .ai; playmeowdoku.com/daily; whiskerdoku; brainplay; alldle; 8crowns): UTC or Eastern-time dailies, local-browser streaks, difficulty labels.
- The capermint.com development blog's "10 × 10–12 × 12 reserved for daily" is a speculative design table.

## References

[as]: https://apps.apple.com/us/app/meowdoku/id6761760135
[as-jp]: https://apps.apple.com/jp/app/meowdoku/id6761760135
[as-gb-ipad]: https://apps.apple.com/gb/app/meowdoku/id6761760135?platform=ipad
[as-rev]: https://apps.apple.com/us/app/meowdoku/id6761760135?see-all=reviews&platform=iphone
[as-rev-gb]: https://apps.apple.com/gb/app/meowdoku/id6761760135?see-all=reviews&platform=iphone
[as-rev-hr]: https://apps.apple.com/hr/app/6761760135?see-all=reviews&platform=iphone
[as-ipad]: https://apps.apple.com/us/app/meowdoku/id6761760135?see-all=reviews&platform=ipad
[as-jp-rev]: https://apps.apple.com/jp/app/meowdoku/id6761760135?see-all=reviews&platform=ipad
[as-story]: https://apps.apple.com/nz/iphone/story/id6795412703
[gp]: https://play.google.com/store/apps/details?id=com.oakever.meowdoku&hl=en_US
[unstar]: https://unstar.app/app/6761760135?platform=ios&country=en-US
[appshunter]: https://appshunter.io/ios/app/meowdoku/id6761760135/reviews
[appbrain]: https://www.appbrain.com/app/meowdoku-brain-puzzle-games/com.oakever.meowdoku
[worldsapps-disc]: https://worldsapps.com/discussion-meowdoku
[chie-heart]: https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q14331408414
[appreview-jp]: https://appreview.jp/app/397538e00a1df6086ddfc4c5483cf980
[applion-and]: https://applion.jp/Meowdoku/android-com.oakever.meowdoku/
[applion-ios]: https://applion.jp/Meowdoku!/iphone-6761760135/
[apps-island]: https://apps-island.com/meowdoku
[gamefoliage]: https://gamefoliage.com/2026/06/10/meowdoku/
[note-riko]: https://note.com/tender_6101/n/n2148f7fb8d7a
[braberg]: https://felixbraberg.substack.com/p/meowdoku-segments-users-ad-experience
[gam-tenure]: https://www.gamigion.com/meowdoku-segments-users-ad-experience-by-tenure/
[sett]: https://www.sett.ai/content/meowdoku-2m-dau-pure-ad-revenue/
[ac]: https://www.androidcentral.com/apps-software/meowdoku-is-sudoku-but-with-cats-and-it-is-highly-addictive-but-it-has-one-big-problem
[x-anze]: https://x.com/anze4fgo/status/2079545955129692579
[gamecompass]: https://www.gamecompass.co/games/meowdoku
[foxdata]: https://foxdata.com/en/app-marketing-analytics/6761760135/as/US/meowdoku/
[yt-dc-17]: https://www.youtube.com/watch?v=wRoOGRO0n3c
[yt-dc-18]: https://www.youtube.com/watch?v=hWCjw1UCIU0
[yt-tips]: https://www.youtube.com/watch?v=R9CVpGGEi7s
[yt-revive]: https://www.youtube.com/watch?v=xfVbb7V_xe4
[yt-revive-fix]: https://www.youtube.com/watch?v=5XQhueSDtY0
[hrafsa]: https://github.com/hrafsa/meowdoku-solver
[leist]: https://github.com/LeistDev/Meowdoku-macros
[nanma80]: https://github.com/nanma80/meowdoku-solver

[hrafsa], [leist] and [nanma80] were read in Phase 1 (01). They are not §4 sources, and they were not reopened in this session.
