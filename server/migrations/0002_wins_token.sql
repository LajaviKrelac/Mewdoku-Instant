-- Fix lead (Phase 2e audit A-S3). One wins request of a player at a time, optimistically: every write batch of
-- POST /v1/wins is guarded by the token it read with the player (`wtok = ?`) and sets a new one, so a
-- concurrent request of the same player that read the same state writes nothing and is evaluated again
-- (the bracket cap and the play-time budget were read before the write and could be spent twice).
-- Expand-only: the old code ignores the column.
ALTER TABLE players ADD COLUMN wtok TEXT NOT NULL DEFAULT '';
