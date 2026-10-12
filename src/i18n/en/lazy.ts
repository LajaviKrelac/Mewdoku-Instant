// Owner: lead (Phase 2e I-4, the first load); the copy belongs to the owners of the files named below.
// The English strings that only the LAZY chunks show (the overlays, the ranking views, the event screen, Settings,
// How to play, the shop, the fx labels …), moved here VERBATIM (same keys, same values, same comments) from the
// per-owner files under ./ so the first load carries only what the first screens need (spec §7.9, I-4: "English 2e
// strings only lazy screens use … lazy-load them"; the same rule was applied to every phase's strings). Which keys
// these are is computed, not chosen: scripts/i18n-split.ts walks the first load's static imports, and the guard test
// tests/unit/i18n/first-load-strings.spec.ts fails when a first-load file names a key from here, or when a lazy chunk
// that shows one does not import ../en-lazy.ts (which registers this table). Owners keep editing their copy here;
// a key moves back into its owner's file when a first-load file starts to use it.
// Same conventions as ../en.ts: {name} placeholders, `.one` / `.other` plural pairs; a key lives in exactly one file.
/** The lazy keys of ./core.ts (enCore). */
export const enLazyCore = {
  // ── Common controls ────────────────────────────────────────────────────────
  'common.ok': 'OK',
  'common.done': 'Done',
  'common.leaderboard': 'Leaderboard',
  'common.notNow': 'Not now',
  'common.locked': 'Locked',
  'common.on': 'On',
  'common.off': 'Off',
  'hint.apply': 'Apply',
  'hint.close': 'Close hint',

  // ── Rewarded prompt (O2, 02 §5 / §13.3) ────────────────────────────────────
  'rewarded.title.hint': 'Out of hints',
  'rewarded.title.kitty': 'Out of kitties',
  'rewarded.video.hint': 'Watch a short video for 1 hint?',
  'rewarded.video.kitty': 'Watch a short video for 1 kitty?',
  'rewarded.watch': 'Watch video',
  'rewarded.free.hint': "Here's a free hint.",
  'rewarded.free.kitty': "Here's a free kitty.",
  'rewarded.take': 'Take it',
  'rewarded.countdown.hint': 'Next free hint in {time}',
  'rewarded.countdown.kitty': 'Next free kitty in {time}',
  'win.levelComplete': 'Level {level} complete',
  'win.next': 'Next: Level {level}',
  'win.tutorial.title': "You're ready!",
  'win.tutorial.body': 'Time to solve one on your own.',
  'win.tutorial.play': 'Play Level {level}',

  // ── Fail overlay (O4) ──────────────────────────────────────────────────────
  'fail.title': 'Out of fish',
  'fail.body': 'Every wrong tile stays marked, so you know more than before.',
  'fail.continue': 'Continue',
  'fail.continue.bonus': '+1',
  'fail.continue.a11y.video': 'Watch a video to continue with one more fish',
  'fail.continue.a11y.free': 'Continue with one more fish',
  'fail.retry': 'Retry level',

  // ── Settings (O5, 02 §14) and About ────────────────────────────────────────
  'settings.title': 'Settings',
  'settings.vibration': 'Vibration',
  'settings.patterns.note': 'Adds a small symbol to every colour and outlines the crosses.',
  'settings.reduceMotion.system': 'System',
  'settings.reduceMotion.on': 'On',
  'settings.reduceMotion.off': 'Off',
  'settings.howToPlay': 'How to play',
  'settings.about': 'About & credits',
  'about.title': 'About & credits',
  'about.version': 'Version {version}',
  'about.font': 'Headings use the Fredoka typeface by the Fredoka Project Authors, under the SIL Open Font License 1.1.',
  'about.fontLicence': 'Font licence',
  'about.privacy': 'Privacy policy',
  'about.privacySoon': 'Our privacy policy will be linked here.',

  // ── How to play (O6) ───────────────────────────────────────────────────────
  'howto.title': 'How to play',
  'howto.rule.colours': 'Every colour hides *exactly one cat*.',
  'howto.rule.lines': 'Every row and every column holds *one cat* too.',
  'howto.rule.space': 'Cats like their space: two cats *never touch, not even at the corners*.',
  'howto.controls': 'Tap a tile to cross it out. Double-tap to place a cat. Swipe across tiles to cross out several at once.',
  'howto.hearts': 'Your fish are your lives. A cat on the wrong tile costs a fish. Lose all three and you can try the level again.',
  'howto.helpers': 'Stuck? The bulb explains one step. The kitty finds a cat for you. The mouse crosses out a few tiles that have no cat.',
  'howto.skip': 'I know how to play',
  'howto.replay': 'Replay tutorial',

  // ── Daily result (O7, 02 §12) ──────────────────────────────────────────────
  'daily.title': 'Daily puzzle · {date}',
  'daily.solvedIn': 'Solved in {time}',
  'daily.stats': 'Mistakes {mistakes} · Hints {hints}',
  'daily.next': 'Next puzzle in {time}',
  'daily.done': 'Done',
  'a11y.illustration.win': 'A black-and-white cat leaping with a fish',
  'a11y.illustration.fail': 'A black-and-white cat hiding its eyes',

  // ── Group A fixes (appended) ───────────────────────────────────────────────
  /** O7 when the next daily is already playable (solved after midnight, or left open past it). */
  'daily.ready': 'A new puzzle is ready',
  /** About credit: the product name comes from 'app.name' (one source of truth, LEGAL-1). */
  'about.madeBy': 'Puzzles, pictures, sounds and words made by the {name} team.',

  // ── Group C fixes (appended) ───────────────────────────────────────────────
  /** Screen-reader line naming the tile a hint points at (A11Y-7); the card's sentence says "here". */
  'a11y.hintAt': 'Highlighted tile: row {row}, column {col}.',
  'a11y.hintAtColor': 'Highlighted tile: row {row}, column {col}, {color}.',
  /** How to play: keyboard controls (02 §6.3), shown where a keyboard or mouse is present. */
  'howto.keys': 'Keyboard: arrow keys move, Space crosses out, Enter places a cat, H for a hint, K for the kitty.',
  /** Fail Continue: the accessible name contains the visible label "Continue +1" (WCAG 2.5.3). */
  'fail.continue.a11y.videoLabel': 'Continue +1 fish, after a short video',
  'fail.continue.a11y.freeLabel': 'Continue +1 fish',
  /** About: the one piece of third-party code in the bundle (Vite's module preload helper, MIT). */
  'about.code': 'Includes a loader helper from Vite, © 2019-present VoidZero Inc. and Vite contributors, MIT License.',
  'about.codeLicence': 'MIT licence',
} as const;

/** The lazy keys of ./ui-2b.ts (enUi2b). */
export const enLazyUi2b = {
  // ── Settings rows (§6.8, §8.5) and How to play (§7) ────────────────────────
  'settings.language': 'Language',
  'settings.language.auto': 'Automatic',
  'settings.shop': 'Shop',
  'settings.removeAds': 'Remove ads',
  // Review PAR-5: the Feedback row (shown only when config support.feedbackUrl is set).
  'settings.feedback': 'Send feedback',
  'howto.a11y': 'Colours hard to tell apart? Turn on colour patterns in Settings.',

  // ── Victory screen (§2.5) ──────────────────────────────────────────────────
  'victory.next': 'Level {level}',
  'victory.eventReward': 'Event reward: {reward}',

  // ── Ranking panel and hub (§2.4, §5.5) ─────────────────────────────────────
  'rank.title.daily': "Today's fastest",
  'rank.title.event': '{event}: top players',
  'rank.tap': 'Tap to keep going',
  'rank.you': 'You',
  'rank.yourRank': 'Your rank: #{rank}',
  'rank.yourScore': 'Your score: {score}',
  'rank.seeTop': 'See top players',
  'rank.loading': 'Fetching the rankings…',
  'rank.unavailable': "Rankings couldn't load right now.",
  'rank.localOnly': "Rankings with other players aren't available in this version. Here are your own records.",
  'rank.noEntries': 'No one has posted a score here yet.',
  'rank.records.bestSize': 'Your best {n}×{n}',
  'rank.records.solved': 'Levels solved',
  'rank.records.total': 'Total points',
  'rank.hub': 'Rankings',
  'rank.entries.one': '{count} player',
  'rank.entries.other': '{count} players',
  'rank.records.thisPuzzle': 'This puzzle',
  'rank.tab.today': 'Today',
  'rank.tab.event': 'Event',
  'rank.tab.groups': 'Groups',

  // ── Group challenges (§5.6): never say "won" in participation mode ─────────
  'group.title': 'Group challenge',
  'group.start': 'Start a group challenge',
  'group.body.participation.one': 'Win {count} puzzle in this challenge within {hours} hours to earn {kitties} kitties.',
  'group.body.participation.other': 'Win {count} puzzles in this challenge within {hours} hours to earn {kitties} kitties.',
  'group.body.rank': 'Keep the most fish in {hours} hours. The winner gets {kitties} kitties.',
  'group.finished': 'Your group challenge has finished. Thanks for playing!',
  'group.endsIn': 'Ends in {time}',
  'group.won': 'You won your group challenge!',
  'group.place': 'You finished #{place} of {count}.',
  'group.take': 'Take {count}',
  'group.double': 'Watch a video for {count}',
  // Phase 2c §4.8: {count} is a hint phrase from event.reward.hints ("1 hint").
  'group.participation': 'Thanks for playing: +{count}',
  'group.wins': '{wins} / {needed} wins',

  // ── Shop (§8.5); product names are ours, never the dashboard's text ───────
  'shop.title': 'Shop',
  'shop.buy': 'Buy',
  'shop.owned': 'Owned',
  'shop.buy.a11y': 'Buy {name}, {price}',
  'shop.retry': 'Try again',
  'shop.loading': 'Getting the shop ready…',
  'shop.unavailable': "Purchases aren't available here.",
  'shop.product.remove_ads.name': 'No Ads',
  'shop.product.remove_ads.desc': 'No breaks between levels and no banners. Optional videos stay available.',
  'shop.product.hints_15.name': 'Bulb Bundle',
  'shop.product.hints_15.desc': '15 hints',
  'shop.product.kitties_8.name': 'Kitty Basket',
  'shop.product.kitties_8.desc': '8 kitties',

  // ── Event screen milestone track (§4.4, §7) ────────────────────────────────
  'event.track.title': 'Rewards',
  'event.track.node': '{at} solved: {reward}',
  'event.track.reached': '{at} solved: {reward}. Reached.',
} as const;

/** The lazy keys of ./ui-2c.ts (enUi2c). */
export const enLazyUi2c = {
  // The victory's points row: the level's total ("7,296 points", §10.3).
  'points.count.one': '{count} point',
  'points.count.other': '{count} points',
  // How to play: a note with icon-points after the period note.
  'howto.levelPoints':
    'Every cat you find earns points, and each cat you find in a row without a mistake earns more than the one before. A mistake never takes points away, but the next cat starts the count again. Cats placed by a hint or the kitty count too.',
} as const;

/** The lazy keys of ./ui-2d.ts (enUi2d). */
export const enLazyUi2d = {
  // ── The helpers (§1.11, §1.12) ─────────────────────────────────────────────
  'game.tool.mouse': 'Mouse',

  // ── O2 for the mouse (§1.12) ───────────────────────────────────────────────
  'rewarded.title.mouse': 'Call the mouse?',
  'rewarded.video.mouse': 'Watch a short video and the mouse crosses out {count} tiles that have no cat.',
  'rewarded.free.mouse': 'The mouse is free this time.',
  'rewarded.countdown.mouse': 'The mouse is back in {time}',
} as const;

/** The lazy keys of ./ui-2d1.ts (enUi2d1). */
export const enLazyUi2d1 = {
  // ── The completion label (§4.3) ────────────────────────────────────────────
  // A short cheer under the last changed tile of a finished row, column or colour (≤ 8 characters).
  'fx.done': 'Done!',
} as const;

/** The lazy keys of ./ui-2e.ts (enUi2e). */
export const enLazyUi2e = {
  // ── Common ─────────────────────────────────────────────────────────────────
  'common.cancel': 'Cancel',
  'ladder.endsIn': 'Ends in {time}',
  'ladder.endsSoon': 'Ends in less than a minute',
  'ladder.ended': 'Final results',
  // The server's real count of visible players (H-2); never an estimate.
  'ladder.players.one': '{count} player',
  'ladder.players.other': '{count} players',
  // {count} = the number of paid places (rules.places.length).
  'ladder.rewards.line.one': 'First place wins hints and kitties.',
  'ladder.rewards.line.other': 'The top {count} win hints and kitties.',
  'ladder.rewards.min': 'Rewards need at least {count} players in this ranking.',
  // Audit B14: no "so far" (once the join window has closed nobody else can join; C-4: never suggest that others will).
  'ladder.alone': "You're the only player in this ranking.",
  'ladder.offline': "You're offline. We'll try to send your fish when you're back online.",
  'ladder.stale': 'Last updated {time}',
  'ladder.unavailable': "The ranking couldn't load right now. Here are your own records.",
  'ladder.optedOut': "You've turned rankings off in Settings. Here are your own records.",
  'ladder.paused': 'Your ranking is paused. Here are your own records.',
  'ladder.join': 'Join',
  'ladder.joinLine': 'Solve a puzzle to join the daily ranking.',
  // The Home chip: "#5" next to the trophy ({rank} formatted).
  'ladder.chip.rank': '#{rank}',
  'ladder.chip.a11y': 'Daily ranking: #{rank} of {count}, {fish}. Ends in {time}.',
  'ladder.chip.join.a11y': 'Daily ranking: solve a puzzle to join.',
  'ladder.chip.off.a11y': 'Daily ranking: off.',
  'ladder.you': 'You',
  // {fish} = "14 fish" (fish.count), {hearts} = "2 hearts" (ladder.hearts).
  'ladder.row.a11y': '#{rank}, {name}, {fish}, {hearts}',
  'ladder.row.me.a11y': '#{rank}, {name}, you, {fish}, {hearts}',
  'ladder.announce': 'You are #{rank} of {count} in the daily ranking.',
  'ladder.hearts.one': '{count} heart',
  'ladder.hearts.other': '{count} hearts',
  'ladder.heart.give.a11y': 'Give a heart to {name}, {hearts}',
  'ladder.heart.self.a11y': 'Give yourself a heart, {hearts}',
  'ladder.heart.received.one': '+{count} heart from another player',
  'ladder.heart.received.other': '+{count} hearts from other players',
  'ladder.heart.error': "Couldn't send the heart. Try again later.",
  'ladder.info': 'How it works',
  'ladder.info.fish': 'Every puzzle you solve adds the fish you kept, up to 3, to your total.',
  'ladder.info.window.rolling':
    'A ranking lasts {hours} hours from its first win and holds up to {count} players. Your first win after it ends puts you in a new one.',
  'ladder.info.window.utcDay': 'A new ranking starts every day at midnight UTC and holds up to {count} players.',
  'ladder.info.rewards.one': 'When a ranking ends, first place wins hints and kitties if at least {min} players took part.',
  'ladder.info.rewards.other': 'When a ranking ends, the top {count} win hints and kitties if at least {min} players took part.',
  'ladder.info.double': 'You can watch a video to double your reward.',
  'ladder.info.hearts': 'Tap a heart to cheer on a player. Hearts are just for fun.',
  'ladder.info.names': 'Other players see your ranking name and picture, never your Facebook name or photo.',
  'ladder.info.privacy': 'You can turn rankings off or delete your ranking data in Settings.',
  // The sheet without a server: the personal records card (+ the streak's best run).
  'ladder.records.title': 'Your records',

  // ── End of a ranking: the result card (§2.6) ───────────────────────────────
  'ladder.result.title': 'Ranking results',
  'ladder.result.place': 'You finished #{rank} of {count}.',
  // {reward} = "+1 hint and +1 kitty" (the victory's reward phrase).
  'ladder.result.reward': 'Your reward: {reward}',
  'ladder.result.none.one': 'Thanks for playing! First place wins hints and kitties.',
  'ladder.result.none.other': 'Thanks for playing! The top {count} win hints and kitties.',
  'ladder.result.tooFew': 'Not enough players took part for rewards this time.',
  'ladder.collect': 'Collect',
  'ladder.collectDouble': 'Collect ×2',
  'ladder.claim.error': "Couldn't collect right now. We'll keep your reward for a few days.",

  // ── Ranking name and picture (§2.7) ────────────────────────────────────────
  'nick.title': 'Your ranking name',
  'nick.picture': 'Picture',
  'nick.first': 'First word',
  'nick.second': 'Second word',
  'nick.number': 'Number',
  'nick.shuffle': 'Shuffle',
  'nick.save': 'Save',
  'nick.saved': 'Name saved.',
  'nick.rejected': "That name can't be used. Please pick another.",
  'nick.cooldown': 'You can change your name again in {time}.',
  'nick.error': "Couldn't save your name. Try again later.",
  'nick.offline': 'Connect to the internet to change your name.',
  'nick.fallback': 'Cat {num}',
  'nick.first.line': 'This is you in the ranking: {name}. You can change your name and picture in Settings.',
  'nick.avatar.a11y': 'Picture {index} of {count}',
  // The pencil on my row in the ranking sheet.
  'nick.edit.a11y': 'Change your ranking name and picture',

  // ── Settings (§2.7) ────────────────────────────────────────────────────────
  'settings.ladder.name': 'Ranking name',
  'settings.ladder.join': 'Show me in rankings',
  // {code} arrives formatted ("7KQ2-M9XD"); never translated.
  'settings.ladder.code': 'Player code {code}',
  'settings.ladder.offline': 'Connect to the internet to change this.',
  'settings.ladder.delete': 'Delete my ranking data',
  'settings.ladder.delete.confirm': 'Delete your ranking name, picture and results from our server? Your game progress stays.',
  'settings.ladder.delete.ok': 'Delete',
  'settings.ladder.deleted': 'Your ranking data was deleted.',
  'howto.ladder': 'The fish you keep when you solve a puzzle count for the daily ranking.',

  // ── The out-of-helpers card with Buy rows (§4.1; every purchase button says "Buy") ──
  'rewarded.body.buy.hint': 'Watch a short video for 1 hint, or buy a Bulb Bundle.',
  'rewarded.body.buy.kitty': 'Watch a short video for 1 kitty, or buy a Kitty Basket.',
  // {items} = shop.product.<id>.desc ("15 hints"); {price} = the store's price string, as given.
  'rewarded.buy.label': 'Buy {items} · {price}',
  'rewarded.buy.noAds.label': 'Buy No Ads · {price}',
  'rewarded.buy.noAds.note': 'Removes banners and full-screen ads. Videos for helpers stay.',
  'rewarded.buy.loading': 'Getting the price…',

  // ── The daily streak (§5.3; our own design, no urgency) ─────────────────────
  'streak.day': 'Day {day} of {total}',
  'streak.start': 'Solve a puzzle to start a streak.',
  'streak.new': 'A new streak starts today.',
  'streak.next': 'Solve a puzzle today for day {day}.',
  'streak.today': 'Today counts!',
  'streak.rewardDone': 'Streak reward collected!',
  'streak.a11y': 'Streak: day {day} of {total}. {status}',
  'streak.days.one': '{count} day',
  'streak.days.other': '{count} days',
  // Appendix A's 'victory.streak' renamed: that key was the retired 2c perfect streak (catalogs.spec, sanity.spec).
  'victory.streakDay': 'Streak: day {day} of {total}',
  'victory.streakReward': 'Streak reward: {reward}',
  // {days} = dayStreak.cycleDays.
  'howto.streak':
    'Solve at least one puzzle a day to build a streak. Every {days} days in a row earn a reward of hints and kitties. If you miss a day, the streak starts again from day 1.',

  // ── The daily (shown only when daily.reward is not zero, §6.1) ──────────────
  'victory.dailyReward': 'Daily reward: {reward}',

  // ── Leaderboard update (the podium leaderboard, auto-join, activity, the rank-up) ──
  // A row's status, from the server's own data for that one player (seenAt, playing); never a count or an estimate.
  'ladder.status.online': 'Online now',
  'ladder.status.playing': 'Playing now',
  // Last seen, short: {count} is a whole number of minutes / hours / days.
  'ladder.status.minutes': '{count}m ago',
  'ladder.status.hours': '{count}h ago',
  'ladder.status.days': '{count}d ago',
  // The card on Home when the sign-in joined a new ranking (no win in it yet).
  'ladder.session.title': 'New ranking',
  'ladder.session.body': 'Solve puzzles to collect fish and climb the ranking. See how high you can get before this ranking ends!',
  'ladder.session.ok': 'Got it',
  // The bubble after a win moved me up ({rank} formatted).
  'ladder.climb.first': "Wonderful! You're in first place!",
  'ladder.climb.up': 'Nice! You climbed to #{rank}!',
  // The info view when the sign-in joins (ladder.autoJoin): no "first win" rule any more.
  'ladder.info.window.rollingJoin':
    'A ranking lasts {hours} hours and holds up to {count} players. When it ends, you join a new one the next time you open the game.',
  'ladder.info.activity': 'Players in your ranking see when you were last active and whether you are playing a puzzle.',
} as const;

/** The lazy keys of ./events.ts (enEvents). */
export const enLazyEvents = {
  'event.play': 'Play puzzle {index}',
  'event.back': 'Back to event',
  'event.topList': 'Top list',
  'event.results.local': 'Your results: {solved} of {total}, total {time}',
  'event.reward.hints.one': '{count} hint',
  'event.reward.hints.other': '{count} hints',
  'event.reward.kitties.one': '{count} kitty',
  'event.reward.kitties.other': '{count} kitties',
} as const;

/** The lazy keys of ./platform.ts (enPlatform). */
export const enLazyPlatform = {

} as const;

/** The lazy keys of ./i18n.ts (enI18n). */
export const enLazyI18n = {

} as const;

/** Every lazy key, as one table (registered by ../en-lazy.ts). */
export const enLazyTable = { ...enLazyCore, ...enLazyUi2b, ...enLazyUi2c, ...enLazyUi2d, ...enLazyUi2d1, ...enLazyUi2e, ...enLazyEvents, ...enLazyPlatform, ...enLazyI18n } as const;
