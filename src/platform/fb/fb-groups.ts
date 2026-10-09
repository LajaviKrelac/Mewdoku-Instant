// Owner: D
// GroupProvider over FB tournaments (phase2b §5.2, §5.6): createAsync({initialScore: 0, config:
// {title, sortOrder: 'HIGHER_IS_BETTER', scoreFormat: 'NUMERIC', endTime}}), getTournamentAsync(),
// postScoreAsync(total). No standings API was found (§5.2), so `standings` stays absent unless §14 G2
// finds one. Behind flag groupChallenges (off). Lazy `fb-social` chunk.
//
// Deadlines: current() and post() have rank.fetchTimeoutMs; create() has none, because it waits on
// FB's own dialog (like a rewarded video, a player may take as long as they like).
// [uncertain: §14 G2] the createAsync payload shape (Meta's plugin passes score, config and data;
// we send the 7.1 shape {initialScore, config}), endTime in unix seconds, getTournamentAsync()
// rejecting outside a tournament context, and whether rewards tied to tournaments are allowed.
import { cfg, type GameConfig } from '../../app/config';
import { within } from '../shared/timers';
import type { GroupProvider, PlatformTimers } from '../types';
import type { FBInstantSDK, FBTournament } from './fbinstant';
import { groupsSupported as probeGroups } from './fb-probe';

export interface FbGroupsOptions {
  readonly timers: PlatformTimers;
  readonly config?: GameConfig;
}

/** tournament.createAsync, getTournamentAsync and postScoreAsync all exist. */
export function groupsSupported(sdk: FBInstantSDK): boolean {
  return probeGroups(sdk);
}

/** A tournament's id, or null. */
function idOf(tour: FBTournament | null | undefined): string | null {
  try {
    const id = tour?.getID();
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/** A tournament's end time in ms, or null (FB reports unix seconds). */
function endOf(tour: FBTournament): number | null {
  try {
    const s = tour.getEndTime?.();
    return typeof s === 'number' && Number.isFinite(s) && s > 0 ? Math.round(s * 1000) : null;
  } catch {
    return null;
  }
}

export function createFbGroups(sdk: FBInstantSDK, opts: FbGroupsOptions): GroupProvider {
  const c = opts.config ?? cfg;
  const timers = opts.timers;
  const deadline = c.rank.fetchTimeoutMs;

  return {
    async create(endTimeMs, title) {
      try {
        const api = sdk.tournament;
        if (!api || !Number.isFinite(endTimeMs)) return null;
        const tour = await api.createAsync({
          initialScore: 0,
          config: {
            title,
            sortOrder: 'HIGHER_IS_BETTER', // every score we post is higher-is-better (§5.2)
            scoreFormat: 'NUMERIC',
            endTime: Math.floor(endTimeMs / 1000),
          },
        });
        const id = idOf(tour);
        return id ? { id } : null;
      } catch {
        return null; // cancelled (USER_INPUT), already in a tournament (INVALID_OPERATION), or an error
      }
    },

    async current() {
      try {
        if (typeof sdk.getTournamentAsync !== 'function') return null;
        const tour = await within(timers, sdk.getTournamentAsync(), deadline, () => null);
        const id = idOf(tour);
        const end = tour ? endOf(tour) : null;
        // Without an end time there is no reward window to track: treat it as no challenge.
        return id && end !== null ? { id, endTimeMs: end } : null;
      } catch {
        return null; // not in a tournament's context (TOURNAMENT_NOT_FOUND / INVALID_OPERATION) or an error
      }
    },

    async post(score) {
      try {
        const api = sdk.tournament;
        if (!api || !Number.isFinite(score) || score < 0) return false;
        const done = api.postScoreAsync(Math.floor(score)).then(() => true);
        return await within(timers, done, deadline, () => false);
      } catch {
        return false; // DUPLICATE_POST, TOURNAMENT_NOT_FOUND, NETWORK_FAILURE …: not retried (§5.6)
      }
    },
  };
}
