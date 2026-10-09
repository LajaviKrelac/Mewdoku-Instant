// Owner: C
// Post-win ranking (phase2b §5.5): at WON compute the points (saved with the win), submit through
// platform.ranking (board by mode) when the limits allow (else rank.pending[board] = score, retried on
// the next win or boot), start mine + top at once so the panel is ready at 4.5 s (deadline
// rank.fetchTimeoutMs), and turn the result into the panel's RankingListState — rows ONLY from provider
// data, else the personal records. Emits 'rank:result' and the rank_panel analytics row. Also feeds the
// rankings hub. C-internal module (F0 stub); the RankingProvider (D) and RankingPanelProps (B) are fixed.
import type { BoardKey } from '../game/types';
import type { PlatformAdapter } from '../platform/types';
import type { RankingListState } from '../ui/overlays/ranking-panel';
import type { Clock } from './clock';
import type { GameConfig } from './config';
import type { AppBus, RankResult } from './events';

export interface RankingFlowDeps {
  readonly platform: PlatformAdapter;
  readonly clock: Clock;
  readonly bus: AppBus;
  readonly config?: GameConfig;
}

export interface RankingFlow {
  /** Submit (or queue) a board score; never rejects. */
  submit(board: BoardKey, score: number, solveMs: number): Promise<void>;
  /** Retry rank.pending (boot, next win). */
  flushPending(): Promise<void>;
  /** mine + top for a board within rank.fetchTimeoutMs; 'local' without a provider. Never rejects. */
  fetch(board: BoardKey): Promise<RankResult>;
  /** The list state for a fetched result (never padded). */
  listState(result: RankResult): RankingListState;
}

export function createRankingFlow(deps: RankingFlowDeps): RankingFlow {
  void deps;
  throw new Error('not implemented: createRankingFlow (C, phase2b §5.5)');
}
