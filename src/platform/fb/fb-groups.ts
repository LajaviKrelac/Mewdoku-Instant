// Owner: D
// GroupProvider over FB tournaments (phase2b §5.2, §5.6): createAsync({initialScore: 0, config:
// {title, sortOrder: 'HIGHER_IS_BETTER', scoreFormat: 'NUMERIC', endTime}}), getTournamentAsync(),
// postScoreAsync(total). No standings API was found (§5.2), so `standings` stays absent unless §14 G2
// finds one. Behind flag groupChallenges (off). Lazy `fb-social` chunk.
// F0 stub: signature final; body is D's.
import type { GameConfig } from '../../app/config';
import type { GroupProvider, PlatformTimers } from '../types';
import type { FBInstantSDK } from './fbinstant';

export interface FbGroupsOptions {
  readonly timers: PlatformTimers;
  readonly config?: GameConfig;
}

/** tournament.createAsync, getTournamentAsync and postScoreAsync all exist. */
export function groupsSupported(sdk: FBInstantSDK): boolean {
  void sdk;
  throw new Error('not implemented: groupsSupported (D, phase2b §5.6)');
}

export function createFbGroups(sdk: FBInstantSDK, opts: FbGroupsOptions): GroupProvider {
  void sdk;
  void opts;
  throw new Error('not implemented: createFbGroups (D, phase2b §5.6)');
}
