// Owner: G1 (Phase 2e)
// The ranking flow's side of the client record (docs/phase2e/spec.md §2.3, §2.6, §2.9): sending the queue
// (aged wins, the server's verdicts, the fish waiting), the cached bracket WITHOUT rows and the counter's
// "before" value, the claim ledger, the ×2 bookkeeping, the claim repair, the result cards, and Settings →
// Delete. Split from game/ladder.ts (G1 resume, spec §7.9 budget): only the lazy ladder flow uses these, so
// they ship in its chunk; game/ladder.ts keeps what the first load needs (the record's default, queueing a
// win in the same critical save as WON, and the save's validation and merge).
// Honesty (spec §0.4): nothing here creates a row, a rank or a count; the cache keeps the server's own
// numbers only. PURE: the device clock is passed in.
import { cfg, type GameConfig } from '../app/config';
import { BRACKET_ID_RE, REWARD_ID_RE, type BracketView, type ClaimView, type ResultView, type WinResult } from '../shared/rank-api';
import { capList, emptyLadder, parseClaimEntry, pendingMaxOf } from './ladder';
import type { LadderCurrent, LadderPendingWin, LadderRecord } from './types';

// ─────────────────────────────── the queue (spec §2.9) ───────────────────────────────

/** How many queued wins enqueueWin would drop for `w` (ladder_submit {result: 'dropped'}). */
export function droppedBy(rec: LadderRecord, w: LadderPendingWin, c: GameConfig = cfg): number {
  if (rec.pending.some((p) => p.winId === w.winId || p.puzzleId === w.puzzleId)) return 0;
  return Math.max(0, rec.pending.length + 1 - pendingMaxOf(c));
}

/** A queued win is too old (ladder.pendingMaxAgeMs; a queuedAt in the future counts as fresh). */
export function isAged(w: LadderPendingWin, deviceNow: number, c: GameConfig = cfg): boolean {
  return deviceNow - w.queuedAt > c.ladder.pendingMaxAgeMs;
}

/** The queue without its aged entries (dropped, spec §2.9). */
export function pruneAged(rec: LadderRecord, deviceNow: number, c: GameConfig = cfg): LadderRecord {
  const kept = rec.pending.filter((w) => !isAged(w, deviceNow, c));
  return kept.length === rec.pending.length ? rec : { ...rec, pending: kept };
}

/** The wins to send now, oldest first (aged ones left out; the caller drops them with pruneAged). */
export function sendable(rec: LadderRecord, deviceNow: number, c: GameConfig = cfg): LadderPendingWin[] {
  return rec.pending.filter((w) => !isAged(w, deviceNow, c));
}

/**
 * The server's verdicts (spec §2.3): every win the server answered for — accepted, flagged, duplicate,
 * already counted or rejected — leaves the queue; wins without an answer stay.
 */
export function applyVerdicts(rec: LadderRecord, results: readonly WinResult[]): LadderRecord {
  if (results.length === 0) return rec;
  const answered = new Set(results.map((r) => r.winId));
  const kept = rec.pending.filter((w) => !answered.has(w.winId));
  return kept.length === rec.pending.length ? rec : { ...rec, pending: kept };
}

/** Fish waiting in the queue ("+2 waiting" on my row; never promised to count, H-4). */
export function waitingFish(rec: LadderRecord): number {
  let n = 0;
  for (const w of rec.pending) n += w.fish;
  return n;
}

// ─────────────────────────────── the cached bracket (spec §2.3, §7.1) ───────────────────────────────

/**
 * My bracket from a server view, WITHOUT rows (the cloud save never holds other players' names); null
 * when I am in no bracket (state 'none') or the view carries no end time.
 */
export function currentFrom(view: BracketView, deviceNow: number): LadderCurrent | null {
  if (view.state === 'none' || view.bracketId === null || view.endsAt === null) return null;
  return {
    bracketId: view.bracketId,
    endsAt: view.endsAt,
    serverOffsetMs: Math.round(view.serverTime - deviceNow),
    fetchedAt: deviceNow,
    points: view.me?.points ?? 0,
    rank: view.me?.rank ?? null,
    members: view.members,
    maxMembers: view.maxMembers,
  };
}

/** The server clock as the cache measured it (device clock + the offset of the last answer). */
export function serverNowOf(cur: LadderCurrent, deviceNow: number): number {
  return deviceNow + cur.serverOffsetMs;
}

/** The cached bracket is still running (its endsAt, on the server clock, is in the future). */
export function isRunning(cur: LadderCurrent | null, deviceNow: number): cur is LadderCurrent {
  return cur !== null && cur.endsAt > serverNowOf(cur, deviceNow);
}

/**
 * The counter's "before" value (spec §2.3): my bracket's points from the last answer while its endsAt is
 * in the future, else 0. Never a rank and never a guess at other players.
 */
export function counterBefore(rec: LadderRecord, deviceNow: number): number {
  return isRunning(rec.current, deviceNow) ? rec.current.points : 0;
}

// ─────────────────────────────── claims and results (spec §2.6) ───────────────────────────────

/** "<rewardId>|<hints>|<kitties>" (save.ladder.claimed). */
export function claimEntry(claim: Pick<ClaimView, 'rewardId' | 'grant'>): string {
  return `${claim.rewardId}|${Math.max(0, Math.floor(claim.grant.hints))}|${Math.max(0, Math.floor(claim.grant.kitties))}`;
}

/** Whether the grant of `rewardId` is already applied on this device (the ledger). */
export function isClaimed(rec: LadderRecord, rewardId: string): boolean {
  return rec.claimed.some((e) => parseClaimEntry(e)?.rewardId === rewardId);
}

/** Records an applied grant once per reward id (newest ladder.claimedKept); the reward leaves doubleWatched. */
export function recordClaim(rec: LadderRecord, claim: Pick<ClaimView, 'rewardId' | 'grant'>, c: GameConfig = cfg): LadderRecord {
  const doubleWatched = rec.doubleWatched.filter((id) => id !== claim.rewardId);
  if (isClaimed(rec, claim.rewardId)) return doubleWatched.length === rec.doubleWatched.length ? rec : { ...rec, doubleWatched };
  const claimed = capList([...rec.claimed, claimEntry(claim)], c.ladder.claimedKept, (s) => parseClaimEntry(s) !== null);
  return { ...rec, claimed, doubleWatched };
}

/** The ×2 video was watched but the claim failed: the next attempt claims ×2 without a second video (L6). */
export function markDoubleWatched(rec: LadderRecord, rewardId: string, c: GameConfig = cfg): LadderRecord {
  if (rec.doubleWatched.includes(rewardId)) return rec;
  return { ...rec, doubleWatched: capList([...rec.doubleWatched, rewardId], c.ladder.doubleWatchedKept, (s) => REWARD_ID_RE.test(s)) };
}

/**
 * The repair (spec §1.6, §2.6 step 5): results whose claim exists on the server but whose reward id is not
 * in this device's ledger (the app died after the claim): their grant is applied once.
 */
export function claimsToRepair(rec: LadderRecord, results: readonly ResultView[]): ClaimView[] {
  const out: ClaimView[] = [];
  for (const r of results) {
    const claim = r.reward?.claim ?? null;
    if (claim && !isClaimed(rec, claim.rewardId) && !out.some((x) => x.rewardId === claim.rewardId)) out.push(claim);
  }
  return out;
}

/**
 * The result cards Home may open (spec §2.6), newest first: a result whose reward is waiting (unclaimed,
 * not expired on the server clock) until it is claimed; any other result once (until it was shown). With
 * ladder.resultCard 'rewardOnly' only paid places get a card.
 */
export function resultsToShow(rec: LadderRecord, results: readonly ResultView[], c: GameConfig = cfg, serverNow?: number): ResultView[] {
  const seen = new Set(rec.resultsSeen);
  const out = results.filter((r) => {
    const reward = r.reward;
    if (reward !== null) {
      // A paid place: waiting until claimed (here or on another device) or expired (then never shown).
      if (reward.claim !== null || isClaimed(rec, reward.rewardId)) return false;
      return serverNow === undefined || reward.expiresAt > serverNow;
    }
    if (c.ladder.resultCard === 'rewardOnly') return false;
    return !seen.has(r.bracketId);
  });
  return out.sort((a, b) => b.endedAt - a.endedAt);
}

/** The card of `bracketId` was shown (newest ladder.resultsSeenKept). */
export function markResultSeen(rec: LadderRecord, bracketId: string, c: GameConfig = cfg): LadderRecord {
  if (rec.resultsSeen.includes(bracketId)) return rec;
  return { ...rec, resultsSeen: capList([...rec.resultsSeen, bracketId], c.ladder.resultsSeenKept, (s) => BRACKET_ID_RE.test(s)) };
}

/**
 * Settings → Delete my ranking data (spec §2.7): the local ladder fields reset; the ledgers keep only what
 * prevents a double grant (`claimed` stays); the player becomes not listed.
 */
export function afterDelete(rec: LadderRecord, c: GameConfig = cfg): LadderRecord {
  return { ...emptyLadder(c), listed: false, claimed: rec.claimed, nickLineSeen: rec.nickLineSeen, noticeSeen: rec.noticeSeen };
}

