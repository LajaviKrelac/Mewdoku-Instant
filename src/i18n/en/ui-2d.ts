// Owner: G3 (Phase 2d)
// Phase 2d English strings (docs/phase2d/look-spec.md Appendix A): the game bar's Score column, the
// mouse (the third helper), the video badge's name, the level-start toast and the gear's dot.
// Our own copy (06 §3; D-2d-0 e): the start-toast lines are honest encouragement and never state a
// statistic; "Score" is the HUD label of the level points (never fish); "mouse" is a small animal,
// not the computer device (docs/i18n/glossary.md). Wired into ../en.ts.
// {count} of the mouse keys is formatNumber(cfg.mouse.cells) (3); {tool} is a tool's name
// (game.tool.kitty or game.tool.hint). Same conventions as en.ts: {name} placeholders, `.one` /
// `.other` plural pairs.
export const enUi2d = {
  // Phase 2e I-4 (lead): the keys only lazy chunks show moved verbatim to ./lazy.ts (enLazyUi2d); see src/i18n/en-first.ts.
  // ── The game bar (§1.4) ────────────────────────────────────────────────────
  'game.score': 'Score',
  // The combo bar under the game bar (user, 2026-10-12): {count} is the combo, 1, 2, 3 …
  'game.combo': 'Combo x{count}',
  // The gear's accessible name while its red dot shows (§1.15).
  'common.settings.new': 'Settings, something new',
  'game.tool.mouse.a11y': 'Mouse: crosses out {count} tiles that have no cat',
  // A kitty or bulb at 0 with the video badge ("Kitty: watch a video for more").
  'game.tool.video.a11y': '{tool}: watch a video for more',
  // The mouse action's one screen-reader line.
  'a11y.mouse.one': 'The mouse crossed out {count} tile.',
  'a11y.mouse.other': 'The mouse crossed out {count} tiles.',
  // When the O2 chunk cannot load (helper-flows.ts cardsReady, like kitty.unavailable).
  'mouse.unavailable': 'The mouse is hiding. Try again in a moment.',

  // ── The level-start toast (§1.14) ──────────────────────────────────────────
  'toast.start.level': 'You can solve this one!',
  'toast.start.hard': "A hard one. You've got this!",
  'toast.start.retry': 'Fresh start. You can do it!',
} as const;
