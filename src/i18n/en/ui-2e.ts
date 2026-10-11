// Owner: G3 (Phase 2e)
// Phase 2e English strings (docs/phase2e/spec.md Appendix A): the worldwide daily ranking ("ladder" in
// code; always "ranking" in copy, never "leaderboard"), its end-of-ranking card, the ranking name and
// picture, the Settings rows, the out-of-helpers card's Buy rows, the daily streak and the daily reward
// line. Our own copy (06 §3; D-2e-0): nothing here comes from the original or a look-alike app.
// Honesty (spec §0.4): no line claims a player count or a statistic except ladder.players.*, which only
// ever carries the server's real count; no line promises that queued fish will count (H-4) or that more
// players will join (C-4); no urgency ("you'll lose your streak!") anywhere (§5.1).
// Counts come from the server's rules (rules.places, rules.minMembers) and from dayStreak.cycleDays, never
// from a literal "3" or "7" in the copy (C-5): plural pairs pick "First place …" / "The top {count} …".
// Ranking names are our English words in every locale and are never translated (glossary).
// Keys beyond Appendix A (G3, for the UI the appendix describes): common.cancel, nick.edit.a11y,
// ladder.chip.rank, ladder.total, ladder.pill.*, ladder.records.title, streak.best, streak.days.*; nick.cooldown reads "again in {time}"
// ({time} = formatDuration, "5 h 12 min") so translators get the whole phrase.
// Wired into ../en.ts. Same conventions as en.ts: {name} placeholders, `.one` / `.other` plural pairs.
export const enUi2e = {
  // ── Common ─────────────────────────────────────────────────────────────────
  'common.cancel': 'Cancel',

  // ── The ranking: the post-win panel and the sheet (§2.4, §2.5) ─────────────
  // {count} = the fish this win added; {total} = my points in my current ranking (a number).
  'ladder.sub.one': '+{count} fish · Your total: {total}',
  'ladder.sub.other': '+{count} fish · Your total: {total}',
  // The victory's kept-fish row and the in-game counter while the ranking is active (G3, beyond Appendix A).
  'ladder.total': 'Your total: {total}',
  'ladder.pill.one': '{count} fish in the daily ranking',
  'ladder.pill.other': '{count} fish in the daily ranking',
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
  'ladder.alone': "You're the only player in this ranking so far.",
  'ladder.waiting': '+{count} waiting',
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
  'ladder.collectDouble.a11y': 'Watch a video to collect twice the reward',
  'ladder.claimed': 'Collected!',
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
  'settings.ladder.title': 'Worldwide ranking',
  'settings.ladder.name': 'Ranking name',
  'settings.ladder.join': 'Show me in rankings',
  // {code} arrives formatted ("7KQ2-M9XD"); never translated.
  'settings.ladder.code': 'Player code {code}',
  'settings.ladder.offline': 'Connect to the internet to change this.',
  'settings.ladder.delete': 'Delete my ranking data',
  'settings.ladder.delete.confirm': 'Delete your ranking name, picture and results from our server? Your game progress stays.',
  'settings.ladder.delete.ok': 'Delete',
  'settings.ladder.deleted': 'Your ranking data was deleted.',

  // ── Win flow, how to play ──────────────────────────────────────────────────
  'a11y.fishKept.ladder.one': 'You kept {count} fish. Your ranking total: {total}.',
  'a11y.fishKept.ladder.other': 'You kept {count} fish. Your ranking total: {total}.',
  'howto.ladder': 'The fish you keep when you solve a puzzle count for the daily ranking.',

  // ── The out-of-helpers card with Buy rows (§4.1; every purchase button says "Buy") ──
  'rewarded.body.buy.hint': 'Watch a short video for 1 hint, or buy a Bulb Bundle.',
  'rewarded.body.buy.kitty': 'Watch a short video for 1 kitty, or buy a Kitty Basket.',
  // {items} = shop.product.<id>.desc ("15 hints"); {price} = the store's price string, as given.
  'rewarded.buy.label': 'Buy {items} · {price}',
  'rewarded.buy.a11y': 'Buy {name}, {items}, {price}',
  'rewarded.buy.noAds.label': 'Buy No Ads · {price}',
  'rewarded.buy.noAds.note': 'Removes banners and full-screen ads. Videos for helpers stay.',
  'rewarded.buy.noAds.a11y': 'Buy No Ads, {price}. Removes banners and full-screen ads. Videos for helpers stay.',
  'rewarded.buy.loading': 'Getting the price…',

  // ── The daily streak (§5.3; our own design, no urgency) ─────────────────────
  'streak.day': 'Day {day} of {total}',
  'streak.start': 'Solve a puzzle to start a streak.',
  'streak.new': 'A new streak starts today.',
  'streak.next': 'Solve a puzzle today for day {day}.',
  'streak.today': 'Today counts!',
  'streak.rewardDone': 'Streak reward collected!',
  'streak.a11y': 'Streak: day {day} of {total}. {status}',
  'streak.best': 'Best streak',
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
} as const;
