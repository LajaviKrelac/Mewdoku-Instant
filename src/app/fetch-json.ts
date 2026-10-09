// Owner: C (Phase 2b; was app)
// JSON fetch for the level packs and daily months (04 §8) with a per-request timeout: a request that
// has not finished after levels.fetchTimeoutMs is aborted and rejects, so the levels repo's retry →
// substitute (or generated daily) path runs instead of waiting forever. Boot passes it to
// createAssetLoaders; the repo's own deadline (LevelsRepoDeps.deadline) bounds any other loader.
import { cfg } from './config';

export function fetchJsonWithTimeout(
  url: string,
  timeoutMs: number = cfg.levels.fetchTimeoutMs,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<unknown> {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), timeoutMs);
  return fetchImpl(url, ctl ? { signal: ctl.signal } : undefined)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return r.json() as Promise<unknown>; // the body read is covered by the same abort
    })
    .finally(() => clearTimeout(timer));
}
