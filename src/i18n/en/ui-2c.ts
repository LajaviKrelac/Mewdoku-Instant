// Owner: G2 (Phase 2c)
// Phase 2c English strings (docs/phase2c/fish-lives-spec.md Appendix A.2): the leaderboard period
// (the fish kept at each win add up per UTC day, week or month) and the lives as fish. Phase 2c.1
// (§10.7): the level points per cat (the HUD counter, the victory total, the screen-reader line and the
// How to play note); the perfect streak's keys went (victory.streak*, rank.records.streak*).
// Our own copy (06 §3). "fish" is a life and a leaderboard point, never a currency word and never
// "golden fish"; "points" are always level points (docs/i18n/glossary.md). Wired into ../en.ts.
// `{kind}` keys exist for 'day', 'week' and 'month' (config PeriodKind); callers map the kind to the
// literal key with a switch (src/ui/period-text.ts), never with a template string.
// Same conventions as en.ts: {name} placeholders, `.one` / `.other` plural pairs.
export const enUi2c = {
  // ── The period total (§2.5, §2.7, §2.8) ────────────────────────────────────
  'period.total.day': 'Today: {total}',
  'period.total.week': 'This week: {total}',
  'period.total.month': 'This month: {total}',
  // The Home period pill's screen-reader label (§2.8).
  'period.pill.day.one': '{count} fish today',
  'period.pill.day.other': '{count} fish today',
  'period.pill.week.one': '{count} fish this week',
  'period.pill.week.other': '{count} fish this week',
  'period.pill.month.one': '{count} fish this month',
  'period.pill.month.other': '{count} fish this month',

  // ── Ranking panel and hub: the period board (§2.6, §4.6, §4.7) ─────────────
  'rank.title.period.day': 'Daily ranking',
  'rank.title.period.week': 'Weekly ranking',
  'rank.title.period.month': 'Monthly ranking',
  'rank.tab.period.day': 'Today',
  'rank.tab.period.week': 'This week',
  'rank.tab.period.month': 'This month',
  'rank.records.best.day': 'Your best day',
  'rank.records.best.week': 'Your best week',
  'rank.records.best.month': 'Your best month',
  // {total} is the whole period.total.{kind} text ("This week: 42").
  'rank.sub.period.one': '+{count} fish · {total}',
  'rank.sub.period.other': '+{count} fish · {total}',

  // ── Win flow and victory (§1.6, §2.7) ──────────────────────────────────────
  'a11y.fishKept.day.one': 'You kept {count} fish. Your total today: {total}.',
  'a11y.fishKept.day.other': 'You kept {count} fish. Your total today: {total}.',
  'a11y.fishKept.week.one': 'You kept {count} fish. Your total this week: {total}.',
  'a11y.fishKept.week.other': 'You kept {count} fish. Your total this week: {total}.',
  'a11y.fishKept.month.one': 'You kept {count} fish. Your total this month: {total}.',
  'a11y.fishKept.month.other': 'You kept {count} fish. Your total this month: {total}.',

  // ── How to play: the points note (§1.5) ────────────────────────────────────
  'howto.points.day':
    'The fish you keep when you solve a puzzle go to the daily ranking, which starts again every day at 00:00 UTC.',
  'howto.points.week':
    'The fish you keep when you solve a puzzle go to the weekly ranking, which starts again every Monday at 00:00 UTC.',
  'howto.points.month':
    'The fish you keep when you solve a puzzle go to the monthly ranking, which starts again on the 1st of every month at 00:00 UTC.',

  // ── Phase 2c.1: level points per cat (§10.7) ───────────────────────────────
  // "points" are always LEVEL points: earned per cat inside one level, 0 at every level and Retry.
  // The leaderboard's unit stays "fish". {count} is the number, already formatted ("2,016").
  // The HUD counter's screen-reader label (§10.2); never shown.
  'game.points.a11y': 'Level points: {count}',
  // Appended to a scoring cat's announcement: "Cat placed. 3 of 8. 2,016 points." (§10.4).
  'a11y.points.one': '{count} point.',
  'a11y.points.other': '{count} points.',
  // The victory's points row: the level's total ("7,296 points", §10.3).
  'points.count.one': '{count} point',
  'points.count.other': '{count} points',
  // How to play: a note with icon-points after the period note.
  'howto.levelPoints':
    'Every cat you find earns points, and each cat you find in a row without a mistake earns more than the one before. A mistake never takes points away, but the next cat starts the count again. Cats placed by a hint or the kitty count too.',
} as const;
