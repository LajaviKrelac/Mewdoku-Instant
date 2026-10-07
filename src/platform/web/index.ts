// Owner: platform
// Web adapter (04 §6.2): local storage, mock ads in dev/e2e (unsupported in production → free
// fallback), no-op analytics, navigator.vibrate haptics.
import type { PlatformAdapter, PlatformTimers } from '../types';

export interface WebPlatformOptions {
  /** location.search, for ?ads= (dev/e2e only). */
  readonly search?: string;
  /** Mock ads on: import.meta.env.DEV || __E2E__ by default. */
  readonly mockAds?: boolean;
  readonly storage?: Storage | null;
  readonly nav?: Navigator;
  readonly doc?: Document;
  readonly timers?: PlatformTimers;
}

/** Testable factory. */
export function createWebPlatform(opts?: WebPlatformOptions): PlatformAdapter {
  throw new Error('not implemented: createWebPlatform');
}

/** Entry used by main.ts through the '@platform' alias. */
export function createPlatform(): PlatformAdapter {
  return createWebPlatform();
}
