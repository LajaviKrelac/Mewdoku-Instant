-- UI batch (2026-10-13, profile): a frame and a background around each player's picture, shown to everyone in the
-- ranking. frame / bg: 0 … FRAME_COUNT − 1 / BACKGROUND_COUNT − 1 (src/shared/rank-api.ts); 0 is the plain look every
-- player had before (no frame, the coat's own disc), so every existing row looks exactly as it did. players holds my
-- choice (PUT /v1/me/profile, no cooldown); members copies it when I join a bracket (the one INSERT in writeWins) and
-- follows a change in my OPEN brackets only, like the name and the avatar. Expand-only: the old code ignores all four
-- columns. Deploy order: migrate (db:migrate:staging), then deploy.
ALTER TABLE players ADD COLUMN frame INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN bg INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN frame INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN bg INTEGER NOT NULL DEFAULT 0;
