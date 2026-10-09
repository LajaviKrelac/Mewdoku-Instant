// Owner: C
// Group challenges (phase2b §5.6; FB only, flag groupChallenges, off until §14 G2): start a challenge
// (GroupProvider.create, groups.durationH), add each win's points to save.groups[id] in a challenge's
// context and post the total, and on the first launch after endsAt resolve the reward — participation
// mode (default): wins ≥ groups.minWinsForReward → 2 kitties, or 4 with the `group_double` video (not
// 2 + 4), copy says "finished", never "won"; rank mode: standings or fall back to participation. One
// claim per challenge. C-internal module (F0 stub).
import type { GroupProvider } from '../platform/types';
import type { Clock } from './clock';
import type { GameConfig } from './config';
import type { AppState, Store } from './store';

export interface GroupFlowDeps {
  readonly groups: GroupProvider | undefined;
  readonly store: Store<AppState>;
  readonly clock: Clock;
  readonly config?: GameConfig;
}

export interface GroupFlow {
  /** Rankings hub → "Start a group challenge". Never rejects. */
  start(title: string): Promise<boolean>;
  /** After a counted win: add points in the current challenge's context and post the total. */
  onWin(points: number): Promise<void>;
  /** Launch: the first ended, unclaimed challenge's result to show (group_result), or null. */
  pendingResult(): Promise<{ readonly id: string } | null>;
}

export function createGroupFlow(deps: GroupFlowDeps): GroupFlow {
  void deps;
  throw new Error('not implemented: createGroupFlow (C, phase2b §5.6)');
}
