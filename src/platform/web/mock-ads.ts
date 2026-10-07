// Owner: platform
// Dev/e2e mock ads (04 §6.2): ?ads=ok|nofill|unsupported|close, a placeholder overlay for
// cfg.ads.mock.durationMs. Never bundled in production web or fbig builds.
import type { PlatformAds, PlatformTimers } from '../types';

export type MockAdMode = 'ok' | 'nofill' | 'unsupported' | 'close';

/** Parses `?ads=` from a query string; default 'ok'. */
export function readMockAdMode(search: string): MockAdMode {
  throw new Error('not implemented: readMockAdMode');
}

/**
 * ok: shows the placeholder, resolves {ok:true}; nofill: {ok:false,'no_fill'}; unsupported:
 * {ok:false,'unsupported'}; close: rewarded resolves {ok:false,'skipped'} (closed early).
 */
export function createMockAds(mode: MockAdMode, opts: { doc: Document; timers: PlatformTimers; durationMs?: number }): PlatformAds {
  throw new Error('not implemented: createMockAds');
}
