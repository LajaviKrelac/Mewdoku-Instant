-- Leaderboard update (the Meowdoku-style leaderboard): each row shows "Online now", "Playing now" or "2m ago".
-- active_at: the member's last activity in this bracket (server ms; 0 on rows from before this migration, which
-- then fall back to scored_at); playing: the last presence ping said "in a puzzle" (0/1). Written only into my
-- own row of my running bracket (POST /v1/presence, a sign-in, a counted win). Expand-only: the old code ignores
-- both columns.
ALTER TABLE members ADD COLUMN active_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN playing INTEGER NOT NULL DEFAULT 0;
