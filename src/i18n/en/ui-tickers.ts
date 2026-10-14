// UI batch (2026-10-13): messages — the level-start tickers' richer lines (first load: src/app/tickers.ts names them).
// Our own copy (06 §3; D-2d-0 e): the user's example sentences are another game's and are never used. A line is at
// most 60 characters (it slides across the screen once, never cut). Only ticker.odds.* states a statistic about other
// players, and only as an ESTIMATE from the board's own difficulty (spec §0.4 H-2a, src/game/level-odds.ts): rounded
// and worded "about". Every other number is the player's own (their records, the lost attempt) or the board's.
// {pct} = a whole percentage; ticker.odds.tries' {count} may be a half ("2.5"); {placed} / {n} = cats placed / the
// board size; {level} = a level number.
export const enUiTickers = {
  // Line 1 on a Hard level or a tough board: what to expect (estimates, H-2a).
  'ticker.odds.firstTry': 'About {pct}% of players crack this board on their first go',
  'ticker.odds.tries.one': 'On average, players take about {count} try here. No rush!',
  'ticker.odds.tries.other': 'On average, players take about {count} tries here. No rush!',
  // Line 1 after a Retry: the estimate, or how the lost attempt went (this player's own numbers).
  'ticker.odds.retry': 'About {pct}% of players solve it on the next try. Your turn!',
  'ticker.retry.found': "Last try: {placed} of {n} cats placed. Let's top that!",
  'ticker.retry.close.one': 'Just {count} cat short last time. So close!',
  'ticker.retry.close.other': 'Just {count} cats short last time. So close!',
  'ticker.retry.again': 'You know this board better with every try',
  // A Hard level (line 1), and the Hard levels behind the player (line 1 on Hard, else line 2).
  'ticker.hard.first': 'Your first Hard level! Take your time, think it through',
  'ticker.hard.beaten.one': "You've beaten {count} Hard level so far. Impressive!",
  'ticker.hard.beaten.other': "You've beaten {count} Hard levels so far. Impressive!",
  // Line 2: the player's own records.
  'ticker.flawless.one': '{count} level solved without a single mistake. Sharp!',
  'ticker.flawless.other': '{count} levels solved without a single mistake. Sharp!',
  'ticker.streak.one': '{count} day in a row with a solved puzzle. Lovely!',
  'ticker.streak.other': '{count} days in a row with a solved puzzle. Lovely!',
  'ticker.dailies.one': "You've solved {count} daily puzzle so far",
  'ticker.dailies.other': "You've solved {count} daily puzzles so far",
  'ticker.milestone': "Level {level}! Look how far you've come",
} as const;
