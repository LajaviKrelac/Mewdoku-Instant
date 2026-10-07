// Owner: platform
// FBInstant.logEvent with name/param sanitising to the 05 §10 limits (cfg.analytics).
import type { AnalyticsParams, PlatformAdapter } from '../types';
import type { FBInstantSDK } from './fbinstant';

/** 2–40 chars of [A-Za-z0-9 _-]; null when nothing valid remains. */
export function sanitizeEventName(name: string): string | null {
  throw new Error('not implemented: sanitizeEventName');
}

/** ≤ 25 params, keys 2–40 chars, values < 100 chars (strings truncated). */
export function sanitizeParams(params: AnalyticsParams | undefined): AnalyticsParams {
  throw new Error('not implemented: sanitizeParams');
}

export function createFbAnalytics(sdk: FBInstantSDK): PlatformAdapter['analytics'] {
  throw new Error('not implemented: createFbAnalytics');
}
