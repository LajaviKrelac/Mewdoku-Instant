// Owner: G4 (Phase 2e). The win pipeline (spec §1.9.3, cheapest first): one verdict per submitted win, in
// order, carrying the player's state (level baseline, budget, the bracket's win count) from win to win.
// PURE: the handler reads what it needs once (the stored wins of these ids, the member's win count) and
// the store writes only the accepted wins, each guarded so a race can never double-count (§1.9.6).
import { parsePuzzleId, type PuzzleRef, type WinReason, type WinSubmission, type WinVerdict } from '../contract';
import { isKingPermutationString, type ContentLookup } from '../content/lookup';
import { budgetAt, dailyWindowOk, eventWindowOk, fishProblem, speedProblem, winCost, type FlagKind } from './anticheat';
import type { ServerConfig } from './config';

export interface PlayerWinState {
  readonly listed: boolean;
  readonly maxLevel: number;
  readonly budgetMs: number;
  readonly budgetAt: number;
}

/** A counted win already in the `wins` table (only accepted wins are stored). */
export interface StoredWin {
  readonly puzzleId: string;
  readonly winId: string;
  readonly points: number;
}

export interface Flag {
  readonly kind: FlagKind;
  readonly detail: string;
}

export interface WinDecision {
  readonly win: WinSubmission;
  readonly ref: PuzzleRef | null;
  readonly verdict: WinVerdict;
  readonly reason?: WinReason;
  /** Points this win adds (0 unless accepted; a duplicate repeats the stored points but adds none). */
  readonly points: number;
  /** True: write it (accepted or accepted_flagged). */
  readonly write: boolean;
  readonly flags: readonly Flag[];
  /** The board size (cats.length). */
  readonly n: number;
}

export interface EvaluateInput {
  readonly player: PlayerWinState;
  readonly wins: readonly WinSubmission[];
  readonly stored: readonly StoredWin[];
  /** The member's wins in the bracket these wins would land in (0 when a new bracket will be joined). */
  readonly memberWins: number;
  readonly now: number;
  readonly cfg: ServerConfig;
  readonly content: ContentLookup;
}

export interface EvaluateResult {
  readonly decisions: readonly WinDecision[];
  /** The player's level baseline and budget after the accepted wins (written once per request). */
  readonly player: PlayerWinState;
  /** Unknown content versions seen (logged only; never a key, critic C-7). */
  readonly unknownVersions: readonly string[];
}

const SOFT_FLAG_REASONS: readonly WinReason[] = ['unverified', 'soft_fast', 'level_jump'];

export function evaluateWins(input: EvaluateInput): EvaluateResult {
  const { cfg, content, now } = input;
  let maxLevel = input.player.maxLevel;
  let budget = budgetAt(input.player.budgetMs, input.player.budgetAt, now, cfg);
  let memberWins = input.memberWins;
  const byWinId = new Map<string, StoredWin>();
  const byPuzzle = new Set<string>();
  for (const s of input.stored) {
    byWinId.set(s.winId, s);
    byPuzzle.add(s.puzzleId);
  }
  const seenWinIds = new Map<string, WinDecision>();
  const unknownVersions = new Set<string>();
  const decisions: WinDecision[] = [];

  for (const win of input.wins) {
    const n = win.cats.length;
    const ref = parsePuzzleId(win.puzzleId);
    const base = { win, ref, n };
    const reject = (reason: WinReason, flags: Flag[] = []): WinDecision => ({ ...base, verdict: 'rejected', reason, points: 0, write: false, flags });

    // Idempotency first (§1.4): the same winId answers the original result again.
    const stored = byWinId.get(win.winId);
    if (stored) {
      decisions.push({ ...base, verdict: 'duplicate', points: stored.points, write: false, flags: [] });
      continue;
    }
    const earlier = seenWinIds.get(win.winId);
    if (earlier) {
      decisions.push({ ...base, verdict: 'duplicate', points: earlier.write ? earlier.points : 0, write: false, flags: [] });
      continue;
    }
    const decide = (): WinDecision => {
      if (!content.knowsVersion(win.contentVersion)) unknownVersions.add(win.contentVersion);
      // 2. Scored mode; listed.
      if (ref === null || !cfg.scoring.modes.includes(ref.mode)) return reject('not_scored');
      if (!input.player.listed) return reject('unlisted');
      const flags: Flag[] = [];
      const soft: WinReason[] = [];
      // 3. Fish.
      const ev = ref.mode === 'event' ? content.event(ref.eventId) : null;
      const fishMax = ev ? ev.lives : cfg.scoring.fishMax;
      const fish = fishProblem(win, fishMax, cfg);
      if (fish) return reject(fish, [{ kind: fish, detail: `${win.puzzleId} fish ${win.fish} mistakes ${win.mistakes} revives ${win.revives} max ${fishMax}` }]);
      // 4. Solution (lookup by id over every kept version and source; C-7).
      const sol = content.check(ref, win.cats);
      if (sol.kind === 'unknown') return reject('bad_puzzle_id');
      if (sol.kind === 'mismatch') return reject('bad_solution', [{ kind: 'bad_solution', detail: `${win.puzzleId} ${win.source} ${win.contentVersion}` }]);
      if (sol.kind === 'beyond') {
        if (!isKingPermutationString(win.cats)) return reject('bad_solution', [{ kind: 'bad_solution', detail: `${win.puzzleId} not a king permutation` }]);
        if (cfg.antiCheat.unknownPuzzle === 'reject') return reject('bad_puzzle_id');
        // Audit A-S2: past the table a win must have a size the schedule shows there (the table's tail), and a
        // level counts only for a player who climbed within maxLevelJump of it (a baseline, carried through this
        // request), so a first win can never be a made-up id past the table.
        const [lo, hi] = content.tailSizes(ref.mode === 'daily' ? 'daily' : 'level');
        if (n < lo || n > hi) return reject('bad_solution', [{ kind: 'bad_solution', detail: `${win.puzzleId} size ${n} outside ${lo}–${hi} past the table` }]);
        if (ref.mode === 'level' && (maxLevel <= 0 || ref.level > maxLevel + cfg.antiCheat.maxLevelJump)) {
          return reject('bad_puzzle_id', [{ kind: 'unverified', detail: `${win.puzzleId} past the table without a baseline (L${maxLevel})` }]);
        }
        soft.push('unverified');
        flags.push({ kind: 'unverified', detail: win.puzzleId });
      }
      // 5. Time against the size floors.
      const speed = speedProblem(n, win.solveMs, cfg);
      if (speed === 'too_fast') return reject('too_fast', [...flags, { kind: 'too_fast', detail: `${win.puzzleId} n ${n} ${win.solveMs} ms` }]);
      if (speed === 'soft_fast') {
        soft.push('soft_fast');
        flags.push({ kind: 'soft_fast', detail: `${win.puzzleId} n ${n} ${win.solveMs} ms` });
      }
      // 6. Dates and windows.
      if (ref.mode === 'daily' && !dailyWindowOk(ref.date, now, cfg)) return reject('stale_date');
      if (ev && !eventWindowOk(ev, now, cfg)) return reject('event_closed');
      // 7. Dedupe by (player, puzzle).
      if (byPuzzle.has(win.puzzleId)) return { ...base, verdict: 'already_counted', points: 0, write: false, flags: [] };
      // 8. Level order (critic C-13: a jump is accepted, flagged and re-baselined).
      if (ref.mode === 'level') {
        if (ref.level <= maxLevel) return { ...base, verdict: 'already_counted', points: 0, write: false, flags: [] };
        if (maxLevel > 0 && ref.level > maxLevel + cfg.antiCheat.maxLevelJump) {
          soft.push('level_jump');
          flags.push({ kind: 'level_jump', detail: `L${maxLevel} → L${ref.level}` });
        }
      }
      // 9. The bracket cap.
      if (memberWins >= cfg.antiCheat.maxWinsPerWindow) return reject('window_cap', [...flags, { kind: 'window_cap', detail: `${memberWins} wins` }]);
      if (memberWins + 1 === cfg.antiCheat.flagWinsPerWindow) flags.push({ kind: 'wins_flag', detail: `${memberWins + 1} wins in one bracket` });
      // 10. The play-time budget.
      const cost = winCost(n, win.solveMs, cfg);
      if (cost > budget) return reject('budget', [...flags, { kind: 'budget', detail: `cost ${cost} > ${Math.round(budget)} ms` }]);
      // Accepted: update the carried state.
      budget -= cost;
      memberWins++;
      byPuzzle.add(win.puzzleId);
      if (ref.mode === 'level') maxLevel = ref.level;
      const points = win.fish * cfg.scoring.pointsPerFish;
      const reason = SOFT_FLAG_REASONS.find((r) => soft.includes(r));
      return reason
        ? { ...base, verdict: 'accepted_flagged', reason, points, write: true, flags }
        : { ...base, verdict: 'accepted', points, write: true, flags };
    };
    const d = decide();
    seenWinIds.set(win.winId, d);
    decisions.push(d);
  }
  return {
    decisions,
    player: { listed: input.player.listed, maxLevel, budgetMs: Math.round(budget), budgetAt: now },
    unknownVersions: [...unknownVersions],
  };
}
