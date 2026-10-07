// Owner: platform
// FBInstant adapter (04 §6.3, 05 §4): initializeAsync first, capabilities from getSupportedAPIs()
// (ads only with non-empty VITE_FB_PLACEMENT_* IDs), locale read after startGameAsync.
import type { PlatformAdapter, PlatformTimers } from '../types';
import type { FBInstantSDK } from './fbinstant';

export interface FbPlatformOptions {
  /** Defaults to window.FBInstant. */
  readonly sdk?: FBInstantSDK;
  /** Defaults to import.meta.env.VITE_FB_PLACEMENT_INTERSTITIAL / _REWARDED. */
  readonly placements?: { readonly interstitial: string; readonly rewarded: string };
  readonly storage?: Storage | null;
  readonly timers?: PlatformTimers;
}

/** Testable factory. */
export function createFbPlatform(opts?: FbPlatformOptions): PlatformAdapter {
  throw new Error('not implemented: createFbPlatform');
}

/** Entry used by main.ts through the '@platform' alias in the fbig build. */
export function createPlatform(): PlatformAdapter {
  return createFbPlatform();
}
