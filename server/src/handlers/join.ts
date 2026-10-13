// Leaderboard update (user: "when user logs in it auto joins event by default"). A session that asks for it
// (`join: true`) puts a listed player who is in no running bracket into one at once, with 0 fish, so the
// leaderboard and its countdown are there from the first screen. It is the same guarded batch as a win's join
// (writeWins with no wins and `joinEmpty`): one running bracket per player, capacity, the join window, one open
// bracket per pool and the wins token all hold, and a lost race leaves no trace (spec §1.5, critic C-9).
import { bracketTimes } from '../core/brackets';
import { newBracketId, newRowId } from '../core/ids';
import { newRivalsTag } from '../core/rivals';
import { rivalsForPool, type Services } from '../services';
import type { BracketTarget, PlayerRow } from '../store/sql-store';

/** Joins and creates tried per sign-in (each lost race re-reads the player and looks again). */
const JOIN_TRIES = 6;

const running = (p: PlayerRow, now: number): boolean => p.cur_bracket !== null && (p.cur_ends_at ?? 0) > now;

/**
 * The player after the join: `joined` when this call added the row. A player who is not listed, suspended, or
 * already in a running bracket is returned as is; so is one whose join could not be placed (the next win joins).
 */
export async function joinOnSession(s: Services, player: PlayerRow, now: number): Promise<{ player: PlayerRow; joined: boolean }> {
  if (!s.cfg.bracket.joinOnSession || player.listed !== 1 || player.status !== 'ok') return { player, joined: false };
  let p = player;
  for (let tries = 0; tries < JOIN_TRIES && !running(p, now); tries++) {
    let target: BracketTarget;
    const open = await s.store.findOpenBracket(p.pool, now);
    if (open !== null) target = { kind: 'join', bracketId: open };
    else {
      const t = bracketTimes(s.cfg.bracket.periodMode, now, s.cfg);
      target = {
        kind: 'create',
        bracket: {
          id: newBracketId(now, s.rng),
          pool: p.pool,
          mode: s.cfg.bracket.periodMode,
          openedAt: t.openedAt,
          joinUntil: t.joinUntil,
          endsAt: t.endsAt,
          maxMembers: s.cfg.bracket.maxMembers,
          // 2026-10-13 (merge of the computer rivals and the leaderboard update): a bracket a sign-in opens gets its
          // computer rivals exactly like one a win opens (wins.ts), so the ranking shown at sign-in is filled too.
          rivals: rivalsForPool(s, p.pool) ? newRivalsTag(s.cfg.rivals.strength, s.rng, s.words) : null,
        },
      };
    }
    const r = await s.store.writeWins({
      playerKey: p.key,
      nickname: p.nickname,
      avatar: p.avatar,
      now,
      target,
      wins: [],
      // Unchanged: a join moves no level baseline, budget or flag.
      player: { maxLevel: p.max_level, budgetMs: p.budget_ms, budgetAt: p.budget_at },
      flags: [],
      cas: { expect: p.wtok, next: newRowId(now, s.rng) },
      joinEmpty: true,
    });
    const fresh = await s.store.getPlayer(p.key);
    if (fresh === null) return { player: p, joined: false }; // deleted meanwhile
    p = fresh;
    if (r.applied) {
      s.metrics.count('join', target.kind === 'create' ? 'session_new_bracket' : 'session');
      return { player: p, joined: true };
    }
    // Lost: the bracket filled, another bracket of the pool opened first, or a request of mine moved the token.
    if (p.listed !== 1 || p.status !== 'ok') break;
  }
  return { player: p, joined: false };
}
