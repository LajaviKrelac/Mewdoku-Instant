// Owner: B
// Phase 2b English strings for B's screens and overlays (phase2b Appendix A; owners may refine the
// wording until the M1 copy freeze). Our own copy (06 §3): never the original's words; the paw
// booster stays "kitty" (§0.5); fish are "fish", never "golden fish". Wired into ../en.ts.
// Same conventions as en.ts: {name} placeholders, `.one` / `.other` plural pairs.
export const enUi2b = {
  // ── Settings rows (§6.8, §8.5) and How to play (§7) ────────────────────────
  'settings.language': 'Language',
  'settings.language.auto': 'Automatic',
  'settings.shop': 'Shop',
  'settings.removeAds': 'Remove ads',
  'howto.a11y': 'Colours hard to tell apart? Turn on colour patterns in Settings.',

  // ── Fish (§2.2, §2.5, §7) ──────────────────────────────────────────────────
  'fish.count.one': '{count} fish',
  'fish.count.other': '{count} fish',
  'fish.plus': '+{count}',
  'a11y.fishEarned.one': 'You caught {count} fish. You have {total}.',
  'a11y.fishEarned.other': 'You caught {count} fish. You have {total}.',

  // ── Victory screen (§2.5) ──────────────────────────────────────────────────
  'victory.next': 'Level {level}',
  'victory.bonus.hard': 'Hard level bonus +{count}',
  'victory.bonus.daily': 'Daily bonus +{count}',
  'victory.points': '+{points} points',
  'victory.eventReward': 'Event reward: {reward}',

  // ── Ranking panel and hub (§2.4, §5.5) ─────────────────────────────────────
  'rank.title.points': 'Paw points',
  'rank.title.daily': "Today's fastest",
  'rank.title.event': '{event}: top players',
  'rank.tap': 'Tap to keep going',
  'rank.you': 'You',
  'rank.yourRank': 'Your rank: #{rank}',
  'rank.yourScore': 'Your score: {score}',
  'rank.seeTop': 'See top players',
  'rank.points': '{points} points',
  'rank.loading': 'Fetching the rankings…',
  'rank.unavailable': "Rankings couldn't load right now.",
  'rank.localOnly': "Rankings with other players aren't available in this version. Here are your own records.",
  'rank.noEntries': 'No one has posted a score here yet.',
  'rank.records.thisLevel': 'This level',
  'rank.records.bestSize': 'Your best {n}×{n}',
  'rank.records.solved': 'Levels solved',
  'rank.records.total': 'Total points',
  'rank.hub': 'Rankings',

  // ── Group challenges (§5.6): never say "won" in participation mode ─────────
  'group.title': 'Group challenge',
  'group.start': 'Start a group challenge',
  'group.body.participation.one': 'Win {count} puzzle in this challenge within {hours} hours to earn {kitties} kitties.',
  'group.body.participation.other': 'Win {count} puzzles in this challenge within {hours} hours to earn {kitties} kitties.',
  'group.body.rank': 'Earn the most paw points in {hours} hours. The winner gets {kitties} kitties.',
  'group.finished': 'Your group challenge has finished. Thanks for playing!',
  'group.endsIn': 'Ends in {time}',
  'group.won': 'You won your group challenge!',
  'group.place': 'You finished #{place} of {count}.',
  'group.take': 'Take {count}',
  'group.double': 'Watch a video for {count}',
  'group.participation': 'Thanks for playing: +{count} fish',

  // ── Shop (§8.5); product names are ours, never the dashboard's text ───────
  'shop.title': 'Shop',
  'shop.swap': 'Swap fish',
  'shop.buy': 'Buy',
  'shop.owned': 'Owned',
  'shop.swap.hint': '1 hint',
  'shop.swap.kitty': '1 kitty',
  'shop.swap.action': 'Swap',
  'shop.notEnough': 'Not enough fish yet.',
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
  'shop.product.fish_250.name': 'Fish Bucket',
  'shop.product.fish_250.desc': '250 fish',
  'shop.product.fish_900.name': 'Fish Crate',
  'shop.product.fish_900.desc': '900 fish',

  // ── Rewarded prompt O2 swap (§2.8) ─────────────────────────────────────────
  'rewarded.swap': 'Swap {count} fish',
} as const;
