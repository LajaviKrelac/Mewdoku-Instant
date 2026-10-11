-- Owner: G4 (Phase 2e). The ranking server's schema (spec §1.10), SQLite / D1 dialect. Applied by
-- `wrangler d1 migrations apply` and by the Node driver (src/store/drivers/node-sqlite.ts) in the same
-- order. Migrations are expand → deploy → contract: a column is added, used, and dropped only later.
-- Every hot-path, sweep and stats statement reads by key or index range (an EXPLAIN QUERY PLAN test
-- keeps it so); critic C-18 added the range indexes on received_at, win_id, seen_at, expires_at, ends_at.

CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);

CREATE TABLE players (
  key TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  pool TEXT NOT NULL,
  trust TEXT NOT NULL,
  secret_hash TEXT,
  nickname TEXT NOT NULL,
  nick_adj INTEGER,
  nick_noun INTEGER,
  nick_num INTEGER,
  avatar INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  listed INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL,
  nick_changed_at INTEGER,
  max_level INTEGER NOT NULL DEFAULT 0,
  budget_ms INTEGER NOT NULL,
  budget_at INTEGER NOT NULL,
  cur_bracket TEXT,
  cur_ends_at INTEGER,
  flag_count INTEGER NOT NULL DEFAULT 0,
  client_version TEXT
);
CREATE INDEX players_seen ON players (seen_at);

CREATE TABLE brackets (
  id TEXT PRIMARY KEY,
  pool TEXT NOT NULL,
  mode TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  join_until INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  members INTEGER NOT NULL DEFAULT 0,      -- capacity count (hidden rows included), self-correcting
  next_slot INTEGER NOT NULL DEFAULT 0,    -- only grows (slots are never reused, §1.5, critic C-10)
  max_members INTEGER NOT NULL,
  finalized_at INTEGER,
  final_members INTEGER                    -- visible members ranked at finalisation (critic C-19)
);
CREATE INDEX brackets_open ON brackets (pool, join_until) WHERE finalized_at IS NULL;
CREATE INDEX brackets_due ON brackets (ends_at) WHERE finalized_at IS NULL;
CREATE INDEX brackets_ended ON brackets (ends_at);

CREATE TABLE members (
  bracket_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  player_key TEXT NOT NULL,
  nickname TEXT NOT NULL,
  avatar INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  hearts INTEGER NOT NULL DEFAULT 0,
  hearts_seen INTEGER NOT NULL DEFAULT 0,
  hearts_self INTEGER NOT NULL DEFAULT 0,
  scored_at INTEGER NOT NULL,
  joined_at INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,       -- bit set: 1 suspended, 2 not listed; visible when 0 (critic C-11)
  final_rank INTEGER,
  PRIMARY KEY (bracket_id, slot)
) WITHOUT ROWID;
CREATE UNIQUE INDEX members_player ON members (player_key, bracket_id);

CREATE TABLE wins (
  player_key TEXT NOT NULL,
  puzzle_id TEXT NOT NULL,
  win_id TEXT NOT NULL,
  bracket_id TEXT,
  points INTEGER NOT NULL,
  fish INTEGER NOT NULL,
  solve_ms INTEGER NOT NULL,
  n INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  played_at_client INTEGER,
  client_version TEXT,
  PRIMARY KEY (player_key, puzzle_id)
) WITHOUT ROWID;
CREATE UNIQUE INDEX wins_id ON wins (player_key, win_id);
CREATE INDEX wins_received ON wins (received_at);

CREATE TABLE hearts (
  bracket_id TEXT NOT NULL,
  from_slot INTEGER NOT NULL,
  to_slot INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (bracket_id, from_slot, to_slot)
) WITHOUT ROWID;

CREATE TABLE rewards (
  id TEXT PRIMARY KEY,                     -- bracket_id || ':' || slot (deterministic → idempotent create)
  player_key TEXT NOT NULL,
  bracket_id TEXT NOT NULL,
  place INTEGER NOT NULL,
  hints INTEGER NOT NULL,
  kitties INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  claimed_at INTEGER,
  doubled INTEGER,
  voided INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX rewards_player ON rewards (player_key, created_at);
CREATE INDEX rewards_expiry ON rewards (expires_at);

CREATE TABLE flags (
  id TEXT PRIMARY KEY,
  player_key TEXT NOT NULL,
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX flags_open ON flags (at) WHERE resolved_at IS NULL;
CREATE INDEX flags_player ON flags (player_key, at);
CREATE INDEX flags_at ON flags (at);

CREATE TABLE seen_nonces (h TEXT PRIMARY KEY, expires_at INTEGER NOT NULL) WITHOUT ROWID;
CREATE INDEX seen_nonces_expiry ON seen_nonces (expires_at);

CREATE TABLE ip_quota (day TEXT NOT NULL, ip_hash TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, ip_hash)) WITHOUT ROWID;

CREATE TABLE tombstones (player_key TEXT PRIMARY KEY, suspended_until INTEGER NOT NULL) WITHOUT ROWID;
CREATE INDEX tombstones_until ON tombstones (suspended_until);

CREATE TABLE admin_log (id TEXT PRIMARY KEY, at INTEGER NOT NULL, action TEXT NOT NULL, target TEXT, detail TEXT);
CREATE INDEX admin_log_at ON admin_log (at);

CREATE TABLE stats_daily (day TEXT NOT NULL, name TEXT NOT NULL, v INTEGER NOT NULL, PRIMARY KEY (day, name)) WITHOUT ROWID;
