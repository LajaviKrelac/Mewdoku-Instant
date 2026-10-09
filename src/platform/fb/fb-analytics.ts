// Owner: D (Phase 2b; was platform)
// FBInstant.logEvent with name/param sanitising to the 05 §10 limits (cfg.analytics). The SDK's
// parameters are string-valued ([dt-types]: `{ [key: string]: string }`), so numbers are sent as
// their decimal text (PLAT-7); the app-facing contract (04 §4.4) still takes string | number.
import { cfg, type GameConfig } from '../../app/config';
import type { AnalyticsParams, PlatformAdapter } from '../types';
import type { FBInstantSDK } from './fbinstant';

const INVALID = /[^A-Za-z0-9 _-]/g;
const HAS_ALNUM = /[A-Za-z0-9]/;

/** Replaces disallowed characters with '_', trims, truncates to `max`; null when < `min` or no letter/digit. */
function sanitizeToken(raw: string, min: number, max: number): string | null {
  const s = raw.trim().replace(INVALID, '_').slice(0, max).trim();
  if (s.length < min || !HAS_ALNUM.test(s)) return null;
  return s;
}

/** 2–40 chars of [A-Za-z0-9 _-]; null when nothing valid remains. */
export function sanitizeEventName(name: string, c: GameConfig = cfg): string | null {
  return sanitizeToken(String(name), c.analytics.nameMin, c.analytics.nameMax);
}

/** ≤ 25 params, keys 2–40 chars, values < 100 chars (strings truncated). */
export function sanitizeParams(params: AnalyticsParams | undefined, c: GameConfig = cfg): AnalyticsParams {
  const out: AnalyticsParams = {};
  if (!params) return out;
  const a = c.analytics;
  let count = 0;
  for (const rawKey of Object.keys(params)) {
    if (count >= a.maxParams) break;
    const key = sanitizeToken(rawKey, a.keyMin, a.keyMax);
    if (key === null || Object.prototype.hasOwnProperty.call(out, key)) continue;
    const v = params[rawKey];
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) continue; // a JS number prints in ≤ 25 chars, well under the limit
      out[key] = v;
    } else if (typeof v === 'string') {
      out[key] = v.slice(0, a.valueMaxLen);
    } else {
      continue;
    }
    count++;
  }
  return out;
}

/** Sanitised params as the SDK wants them: string values (sanitizeParams already keeps each < 100 chars). */
export function toSdkParams(params: AnalyticsParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) out[k] = String(v);
  return out;
}

export function createFbAnalytics(
  sdk: FBInstantSDK,
  opts: { ready?: () => boolean; config?: GameConfig } = {},
): PlatformAdapter['analytics'] {
  const c = opts.config ?? cfg;
  return {
    log(name, params) {
      // logEvent is only valid after initializeAsync; earlier events are dropped (none are expected).
      if (opts.ready && !opts.ready()) return;
      const n = sanitizeEventName(name, c);
      if (n === null) return;
      const p = toSdkParams(sanitizeParams(params, c));
      try {
        const err = sdk.logEvent(n, undefined, Object.keys(p).length > 0 ? p : undefined);
        if (err && import.meta.env.DEV && import.meta.env.MODE !== 'test') console.debug('[fb] logEvent', n, err);
      } catch {
        /* analytics must never break the game */
      }
    },
  };
}
