-- 2026-10-12, r2 (review fix). Preset r2 picks which computer rivals stay live by replaying the real joins at their
-- joined_at (core/table.ts liveRivals). "Delete my ranking data" removes the member row, and with it that time: the
-- replay then had to guess, and could swap a visible rival for one players had watched retire. deletePlayer now
-- appends the deleted member's "slot:joined_at" here, for r2 brackets only (no key, no name: only when that place
-- was taken), so a deletion never changes which rivals show. Written only on the delete path; read with the bracket
-- row (no extra statement). Expand-only: the old code ignores the column. NULL = no member deleted.
ALTER TABLE brackets ADD COLUMN deleted_joins TEXT;  -- "slot:joined_at,slot:joined_at,…" in deletion order
