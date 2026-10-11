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
  // Phase 2e I-4 (lead): the keys only lazy chunks show moved verbatim to ./lazy.ts (enLazyUi2e); see src/i18n/en-first.ts.

  // ── The ranking: the post-win panel and the sheet (§2.4, §2.5) ─────────────
  // {count} = the fish this win added; {total} = my points in my current ranking (a number).
  'ladder.sub.one': '+{count} fish · Your total: {total}',
  'ladder.sub.other': '+{count} fish · Your total: {total}',
  // The victory's kept-fish row and the in-game counter while the ranking is active (G3, beyond Appendix A).
  'ladder.total': 'Your total: {total}',
  'ladder.pill.one': '{count} fish in the daily ranking',
  'ladder.pill.other': '{count} fish in the daily ranking',
  'ladder.claimed': 'Collected!',

  // ── Win flow, how to play ──────────────────────────────────────────────────
  'a11y.fishKept.ladder.one': 'You kept {count} fish. Your ranking total: {total}.',
  'a11y.fishKept.ladder.other': 'You kept {count} fish. Your ranking total: {total}.',
  'streak.best': 'Best streak',
} as const;
