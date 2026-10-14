-- UI batch (2026-10-13): victory — the daily percentile ("Faster than about 70% of today's solvers", spec §0.4 H-2a).
-- A rollup of accepted daily solve times: per daily puzzle and pool (fb, web and every dev pool apart, H-7), the
-- number of players whose first counted win of that daily landed in each 10-second bucket of solve time
-- (floor(solve_ms / dailyStats.bucketMs), capped at dailyStats.maxBucket). It holds no player key: a player's
-- deletion leaves an anonymous count. Written only in the wins batch, when a daily win row goes in with the verdict
-- 'accepted' (never a flagged one) for a player in good standing; read by primary-key range only (one puzzle and
-- pool); purged by the retention sweep after dailyStats.keepDays. Expand-only: the old code ignores the table.
CREATE TABLE daily_times (
  puzzle_id TEXT NOT NULL,
  pool TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (puzzle_id, pool, bucket)
) WITHOUT ROWID;
