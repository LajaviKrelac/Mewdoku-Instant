// Owner: lead (preview link, 2026-10-11). The sample ranking server's stored state (localStorage
// ['mewdoku.preview.rank.v1']): the rows of server/src/store/rows.ts as plain JSON, and the two queued preview
// operations. The other players are computed, never stored (the server's computer players, D-2e-24). Small on purpose: preview/platform.ts queues operations with it at startup, while the server itself
// (preview/sample-server.ts, with the solution table) loads lazily on the ranking's first request.
import type { BracketRow, MemberRow, PlayerRow, RewardRow } from '../server/src/store/rows';

export const SAMPLE_STATE_KEY = 'mewdoku.preview.rank.v1';

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };
export type MPlayer = Mutable<PlayerRow> & { secret: string };
export type MMember = Mutable<MemberRow>;
export type MBracket = Mutable<BracketRow>;
export type MReward = Mutable<RewardRow>;
export interface MWin {
  readonly player_key: string;
  readonly puzzle_id: string;
  readonly win_id: string;
  readonly points: number;
  readonly at: number;
}
export interface MHeart {
  readonly bracket_id: string;
  readonly from_slot: number;
  readonly to_slot: number;
}

export interface SampleState {
  v: 1;
  players: Record<string, MPlayer>;
  brackets: Record<string, MBracket>;
  members: Record<string, MMember[]>;
  hearts: MHeart[];
  rewards: Record<string, MReward>;
  wins: MWin[];
  /** Applied at the next POST /v1/session (preview/platform.ts queues them before the reload). */
  pending: { returning: boolean; endDay: boolean };
}

export function emptyState(): SampleState {
  return { v: 1, players: {}, brackets: {}, members: {}, hearts: [], rewards: {}, wins: [], pending: { returning: false, endDay: false } };
}

export type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The stored state, or an empty one (a missing, unreadable or older copy starts afresh). */
export function loadState(storage: KV | null): SampleState {
  try {
    const raw = storage?.getItem(SAMPLE_STATE_KEY) ?? null;
    if (raw) {
      const v = JSON.parse(raw) as Partial<SampleState> | null;
      if (v && v.v === 1 && v.players && v.brackets && v.members && Array.isArray(v.hearts) && v.rewards && Array.isArray(v.wins) && v.pending) {
        // Migration 0003 (2026-10-12, D-2e-24): a state saved before computer rivals lacks the new bracket fields; its
        // brackets (with their old sample members) keep loading and show no computer players.
        for (const b of Object.values(v.brackets)) {
          b.rivals ??= null;
          b.final_rivals ??= null;
          b.final_real ??= null;
        }
        return v as SampleState;
      }
    }
  } catch {
    // a broken copy starts afresh
  }
  return emptyState();
}

export function saveState(storage: KV | null, st: SampleState): string | null {
  try {
    const raw = JSON.stringify(st);
    storage?.setItem(SAMPLE_STATE_KEY, raw);
    return storage ? raw : null;
  } catch {
    return null; // memory only for this page load
  }
}

export function readRaw(storage: KV | null): string | null {
  try {
    return storage?.getItem(SAMPLE_STATE_KEY) ?? null;
  } catch {
    return null;
  }
}

/**
 * Queues a preview operation for the next session without loading the whole server (preview/platform.ts). Returns the
 * state, which the page hands to the server when storage cannot keep it (a blocked localStorage).
 */
export function queueOperation(storage: KV | null, op: 'returning' | 'endDay' | 'reset'): SampleState {
  const st = op === 'reset' || op === 'returning' ? emptyState() : loadState(storage);
  if (op === 'returning') st.pending.returning = true;
  if (op === 'endDay') st.pending.endDay = true;
  saveState(storage, st);
  return st;
}

