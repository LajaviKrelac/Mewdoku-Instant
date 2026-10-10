// Owner: G3 (Phase 2d.1)
// Phase 2d.1 English strings (docs/phase2d/helpers-spec.md Appendix A): the completion label, its
// screen-reader line and the level-start tickers' new lines. Our own copy (06 §3; D-2d-0 e): the
// original's exclamation word and its ticker sentences are never used; a ticker line never states a
// statistic we cannot back, only the player's own numbers, the board's size, a true fact or a tip
// (helpers-spec §5.4). Wired into ../en.ts. The reused ticker lines are toast.start.* (en/ui-2d.ts)
// and period.pill.* (en/ui-2c.ts).
// {unit} = unitName() ("row 1", "column 9", "Violet"); {time} = formatClock ("4:12"); {count} is
// already formatted for the locale.
export const enUi2d1 = {
  // ── The completion label (§4.3) ────────────────────────────────────────────
  // A short cheer under the last changed tile of a finished row, column or colour (≤ 8 characters).
  'fx.done': 'Done!',
  'a11y.unitDone': '{unit} complete.',

  // ── The level-start tickers (§5.4) ─────────────────────────────────────────
  'ticker.best': 'Your best time here: {time}',
  'ticker.cats.one': '{count} cat is hiding here',
  'ticker.cats.other': '{count} cats are hiding here',
  'ticker.solved.one': "You've solved {count} level",
  'ticker.solved.other': "You've solved {count} levels",
  'ticker.points.one': '{count} level point so far',
  'ticker.points.other': '{count} level points so far',
  'ticker.daily': "Today's daily puzzle is waiting",
  'ticker.unique': 'Every puzzle has exactly one answer',
  'ticker.tip.cat': 'Tip: double-tap a tile to place a cat',
  'ticker.tip.drag': 'Tip: drag across tiles to cross out many',
} as const;
