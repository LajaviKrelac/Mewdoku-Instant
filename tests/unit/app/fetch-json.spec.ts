// Owner: app. Pack / daily-month fetch with a per-request timeout (RP-1, 04 §8): a request that never
// answers is aborted and rejects, so the levels repo's retry → substitute path runs.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../../../src/app/config';
import { fetchJsonWithTimeout } from '../../../src/app/fetch-json';
import { availableAssets, createAssetLoaders } from '../../../src/game/level-assets';
import { createLevelsRepo } from '../../../src/game/levels-repo';
import { rec5 } from '../game/fixtures';

afterEach(() => {
  vi.useRealTimers();
});

/** A fetch that answers only when its signal aborts (then rejects like the browser does). */
function hangingFetch(seen: { signal: AbortSignal | null }): typeof fetch {
  return (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal ?? null;
      seen.signal = signal;
      signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
    });
}

describe('fetchJsonWithTimeout', () => {
  it('aborts a request that has not answered after the timeout, and rejects', async () => {
    vi.useFakeTimers();
    const seen: { signal: AbortSignal | null } = { signal: null };
    const p = fetchJsonWithTimeout('pack-003.json', 5000, hangingFetch(seen));
    const check = expect(p).rejects.toThrow(/abort/i);
    await vi.advanceTimersByTimeAsync(4999);
    expect(seen.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await check;
    expect(seen.signal?.aborted).toBe(true);
  });

  it('parses a timely answer and clears its timer', async () => {
    vi.useFakeTimers();
    const ok = (async () => new Response(JSON.stringify({ v: 1 }), { status: 200 })) as unknown as typeof fetch;
    await expect(fetchJsonWithTimeout('x.json', 5000, ok)).resolves.toEqual({ v: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('an HTTP error rejects (retried by the repo)', async () => {
    const notFound = (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
    await expect(fetchJsonWithTimeout('x.json', 5000, notFound)).rejects.toThrow('HTTP 404 for x.json');
  });
});

describe('the levels repo over fetchJsonWithTimeout: a pack or month that never answers (RP-1)', () => {
  function repoOverHangingNetwork() {
    const seen = { signal: null as AbortSignal | null, requests: 0 };
    const net: typeof fetch = (input, init) => {
      seen.requests++;
      return hangingFetch(seen)(input, init);
    };
    const fallbacks: string[] = [];
    const repo = createLevelsRepo({
      ...createAssetLoaders((url) => fetchJsonWithTimeout(url, cfg.levels.fetchTimeoutMs, net)),
      generate: async () => ({ ok: true, record: rec5(), attempts: 1, grade: { grade: 1, counts: [0, 0, 0, 0, 0, 0], pigeonMaxK: 0, effort: 7 } }),
      delay: (ms) => new Promise<void>((r) => setTimeout(r, ms)),
      onFallback: (where) => void fallbacks.push(where),
    });
    return { repo, seen, fallbacks };
  }
  const total = 3 * cfg.levels.fetchTimeoutMs + cfg.levels.fetchRetryDelaysMs.reduce((a, b) => a + b, 0);

  it('each attempt is aborted after levels.fetchTimeoutMs; after the 04 §8 retries a substitute board is played', async () => {
    const level = (availableAssets().packs[0] ?? 1) * cfg.levels.packSize + 1;
    vi.useFakeTimers();
    const { repo, seen, fallbacks } = repoOverHangingNetwork();
    const got = repo.getLevel(level);
    await vi.advanceTimersByTimeAsync(total);
    await expect(got).resolves.toMatchObject({ source: 'substitute' });
    expect(seen.requests).toBe(3);
    expect(fallbacks).toEqual(['pack_fetch']);
    void repo.ensurePackFor(level); // the in-flight load was settled and forgotten: the network is asked again
    expect(seen.requests).toBe(4);
  });

  it('a daily month that never answers: the daily is generated from its seed', async () => {
    const day = `${availableAssets().months[0] ?? '2026-10'}-07`;
    vi.useFakeTimers();
    const { repo, seen, fallbacks } = repoOverHangingNetwork();
    const got = repo.getDaily(day);
    await vi.advanceTimersByTimeAsync(total);
    await expect(got).resolves.toMatchObject({ source: 'generated' });
    expect(seen.requests).toBe(3);
    expect(fallbacks).toEqual(['daily_fetch']);
  });
});
