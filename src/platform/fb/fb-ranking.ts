// Owner: D
// RankingProvider for FBIG (phase2b §5.2, §5.4). The probe, in order (exact getSupportedAPIs strings
// are [uncertain], so it also checks typeof at runtime):
//   1. getLeaderboardAsync → api 'classic' (mine = getPlayerEntryAsync, top = getEntriesAsync(n, 0));
//   2. globalLeaderboards.setScoreAsync + getTopEntriesAsync → api 'nezp' (myRank false, isMe false);
//   3. otherwise api 'none': every call answers 'unsupported' / null / [].
// Board ids come from VITE_FB_LEADERBOARDS (a JSON map BoardKey → dashboard name or id); a board
// without an id is 'unsupported'. Every call has the rank.fetchTimeoutMs deadline and never rejects.
// LEADERBOARD_SCORE_NOT_IMPROVED → 'not_improved'. Lazy `fb-social` chunk.
// F0 stub: signatures final; bodies are D's.
import type { GameConfig } from '../../app/config';
import type { BoardKey, PlatformTimers, RankingCaps, RankingProvider } from '../types';
import type { FbOverlayViews } from './fb-overlay-views';
import type { FBInstantSDK } from './fbinstant';

export interface FbRankingOptions {
  /** parseLeaderboardMap(import.meta.env.VITE_FB_LEADERBOARDS). */
  readonly boards: Partial<Record<BoardKey, string>>;
  readonly timers: PlatformTimers;
  /** null when overlay views are unsupported. */
  readonly overlays: FbOverlayViews | null;
  readonly config?: GameConfig;
}

/** Which leaderboard API this SDK serves (the §5.4 probe order). */
export function probeRankingApi(sdk: FBInstantSDK): RankingCaps['api'] {
  void sdk;
  throw new Error('not implemented: probeRankingApi (D, phase2b §5.4)');
}

/** VITE_FB_LEADERBOARDS → map; empty or invalid JSON → {} (every board unsupported). Never throws. */
export function parseLeaderboardMap(json: string | undefined): Partial<Record<BoardKey, string>> {
  void json;
  throw new Error('not implemented: parseLeaderboardMap (D, phase2b §5.4)');
}

export function createFbRanking(sdk: FBInstantSDK, opts: FbRankingOptions): RankingProvider {
  void sdk;
  void opts;
  throw new Error('not implemented: createFbRanking (D, phase2b §5.4)');
}
