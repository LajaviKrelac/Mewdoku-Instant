// Owner: B (Phase 2b); G2 (Phase 2c)
// Phase 2b English strings for B's screens and overlays (phase2b Appendix A; owners may refine the
// wording until the M1 copy freeze). Our own copy (06 §3): never the original's words; the paw
// booster stays "kitty" (§0.5); fish are "fish", never "golden fish". Wired into ../en.ts.
// Phase 2c (G2 owns this file): the fish-currency keys went (fish-lives-spec Appendix A.3); at
// integration step I-3 the paw-points board's `rank.points` and `rank.records.thisLevel` went too.
// Phase 2c.1 (fish-lives-spec §10.7): `victory.points` ("+120 points") went; the victory shows the
// level's total with `points.count` (en/ui-2c.ts).
// Same conventions as en.ts: {name} placeholders, `.one` / `.other` plural pairs.
export const enUi2b = {
  // Phase 2e I-4 (lead): the keys only lazy chunks show moved verbatim to ./lazy.ts (enLazyUi2b); see src/i18n/en-first.ts.
  // Review ROB-2: the toast when a language picked in Settings could not load (the app shows it).
  'toast.languageUnavailable': "That language couldn't load. Try again in a moment.",

  // ── Fish (§2.2, §2.5, §7) ──────────────────────────────────────────────────
  // Phase 2c: a fish is a life and a leaderboard point ("42 fish"), never a currency.
  'fish.count.one': '{count} fish',
  'fish.count.other': '{count} fish',
  'fish.plus': '+{count}',
  'shop.thanks': 'Thank you! Your items are in.',
  'shop.error': "We couldn't finish that purchase. Please try again.",
} as const;
