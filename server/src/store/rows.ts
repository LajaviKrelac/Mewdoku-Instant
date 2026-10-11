// Owner: G4 (Phase 2e). Row shapes of migrations/0001_init.sql as SqlStore reads them.
import type { Trust } from '../contract';

export interface PlayerRow {
  readonly key: string;
  readonly code: string;
  readonly pool: string;
  readonly trust: Trust;
  readonly secret_hash: string | null;
  readonly nickname: string;
  readonly nick_adj: number | null;
  readonly nick_noun: number | null;
  readonly nick_num: number | null;
  readonly avatar: number;
  readonly status: 'ok' | 'suspended';
  readonly listed: number;
  readonly created_at: number;
  readonly seen_at: number;
  readonly nick_changed_at: number | null;
  readonly max_level: number;
  readonly budget_ms: number;
  readonly budget_at: number;
  readonly cur_bracket: string | null;
  readonly cur_ends_at: number | null;
  readonly flag_count: number;
  readonly client_version: string | null;
}

export interface BracketRow {
  readonly id: string;
  readonly pool: string;
  readonly mode: 'rolling' | 'utc_day';
  readonly opened_at: number;
  readonly join_until: number;
  readonly ends_at: number;
  readonly members: number;
  readonly next_slot: number;
  readonly max_members: number;
  readonly finalized_at: number | null;
  readonly final_members: number | null;
}

export interface MemberRow {
  readonly bracket_id: string;
  readonly slot: number;
  readonly player_key: string;
  readonly nickname: string;
  readonly avatar: number;
  readonly points: number;
  readonly wins: number;
  readonly hearts: number;
  readonly hearts_seen: number;
  readonly hearts_self: number;
  readonly scored_at: number;
  readonly joined_at: number;
  readonly hidden: number;
  readonly final_rank: number | null;
}

export interface RewardRow {
  readonly id: string;
  readonly player_key: string;
  readonly bracket_id: string;
  readonly place: number;
  readonly hints: number;
  readonly kitties: number;
  readonly created_at: number;
  readonly expires_at: number;
  readonly claimed_at: number | null;
  readonly doubled: number | null;
  readonly voided: number;
}

export interface ResultRow {
  readonly bracket_id: string;
  readonly slot: number;
  readonly points: number;
  readonly final_rank: number;
  readonly ends_at: number;
  readonly final_members: number;
  readonly reward_id: string | null;
  readonly place: number | null;
  readonly hints: number | null;
  readonly kitties: number | null;
  readonly expires_at: number | null;
  readonly claimed_at: number | null;
  readonly doubled: number | null;
  readonly voided: number | null;
}

export interface FlagRow {
  readonly id: string;
  readonly player_key: string;
  readonly at: number;
  readonly kind: string;
  readonly detail: string;
  readonly resolved_at: number | null;
}
