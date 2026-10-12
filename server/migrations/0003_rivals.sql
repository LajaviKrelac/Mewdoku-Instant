-- D-2e-24 (computer rivals, user decision U-e 2026-10-12). Expand-only: the old code ignores these columns.
-- Computer players are never rows: no members, players or rewards row exists for one (H-1). A bracket created
-- with them carries a secret tag; the server computes them on read (src/core/rivals.ts) and freezes them once,
-- at finalisation, in final_rivals.
-- brackets.final_members (0001) now means: every row ranked at finalisation, computer players included;
-- final_real holds the real visible members ranked then. No index, no backfill.
ALTER TABLE brackets ADD COLUMN rivals TEXT;         -- "r1:<seed12>:<strength>:<adjN>:<nounN>"; NULL = no computer players
ALTER TABLE brackets ADD COLUMN final_rivals TEXT;   -- JSON: the computer-player rows of the frozen standings
ALTER TABLE brackets ADD COLUMN final_real INTEGER;  -- real visible members ranked at finalisation (final_members now counts every ranked row)
