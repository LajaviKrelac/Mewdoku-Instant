// Owner: B (Phase 2b); G2 (Phase 2c)
// Phase 2b English strings for B's screens and overlays (phase2b Appendix A; owners may refine the
// wording until the M1 copy freeze). Our own copy (06 §3): never the original's words; the paw
// booster stays "kitty" (§0.5); fish are "fish", never "golden fish". Wired into ../en.ts.
// Phase 2c (G2 owns this file): the fish-currency keys went (fish-lives-spec Appendix A.3); at
// integration step I-3 the paw-points board's `rank.points` and `rank.records.thisLevel` went too.
// Same conventions as en.ts: {name} placeholders, `.one` / `.other` plural pairs.
export const enUi2b = {
  // ── Settings rows (§6.8, §8.5) and How to play (§7) ────────────────────────
  'settings.language': 'Language',
  'settings.language.auto': 'Automatic',
  'settings.shop': 'Shop',
  'settings.removeAds': 'Remove ads',
  // Review PAR-5: the Feedback row (shown only when config support.feedbackUrl is set).
  'settings.feedback': 'Send feedback',
  // Review ROB-2: the toast when a language picked in Settings could not load (the app shows it).
  'toast.languageUnavailable': "That language couldn't load. Try again in a moment.",
  'howto.a11y': 'Colours hard to tell apart? Turn on colour patterns in Settings.',

  // ── Fish (§2.2, §2.5, §7) ──────────────────────────────────────────────────
  // Phase 2c: a fish is a life and a leaderboard point ("42 fish"), never a currency.
  'fish.count.one': '{count} fish',
  'fish.count.other': '{count} fish',
  'fish.plus': '+{count}',

  // ── Victory screen (§2.5) ──────────────────────────────────────────────────
  'victory.next': 'Level {level}',
  'victory.points': '+{points} points',
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
  'shop.thanks': 'Thank you! Your items are in.',
  'shop.error': "We couldn't finish that purchase. Please try again.",
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
