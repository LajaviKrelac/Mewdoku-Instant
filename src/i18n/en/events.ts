// Owner: C (Phase 2b); G2 (Phase 2c: milestone rewards are hints and kitties only, the fish keys went)
// Phase 2b English strings for limited-time events (phase2b §4.3, §4.4, Appendix A). Our own names
// and taglines (06 §3; never the original's event names). Owners may refine until the M1 copy freeze.
// Wired into ../en.ts. EventDef.nameKey / taglineKey point here.
export const enEvents = {
  'event.lantern.name': 'Lantern Walk',
  'event.lantern.tagline': 'Light the way, one cat at a time.',
  'event.snow.name': 'Snow Paws',
  'event.snow.tagline': 'Cosy puzzles for chilly nights.',
  'event.yarn.name': 'Yarn Hearts',
  'event.yarn.tagline': 'Tangled threads, tidy cats.',
  'event.card.endsIn': 'Ends in {time}',
  'event.card.startsIn': 'Starts in {time}',
  'event.card.endsSoon': 'Ends soon!',
  'event.card.progress': '{solved} / {total} solved',
  'event.card.locked': 'Opens after level {level}',
  'event.card.done': 'All solved!',
  'event.play': 'Play puzzle {index}',
  'event.back': 'Back to event',
  'event.topList': 'Top list',
  'event.title.game': '{event} · {index}',
  'event.results.local': 'Your results: {solved} of {total}, total {time}',
  'event.reward.hints.one': '{count} hint',
  'event.reward.hints.other': '{count} hints',
  'event.reward.kitties.one': '{count} kitty',
  'event.reward.kitties.other': '{count} kitties',
} as const;
