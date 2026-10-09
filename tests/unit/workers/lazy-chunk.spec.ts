// Owner: C (Phase 2b; was app). Lazy chunk loading that survives a failed download (RP-2, 04 §8): Chromium caches a
// failed import() of a URL, so the retry must use a cache-busting URL taken from the error; every
// attempt has a deadline; the result is the first successful attempt.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeConfig } from '../../../src/app/config';
import { deadline, failedChunkUrl, loadChunk } from '../../../src/workers/lazy-chunk';

const URL_ = 'http://127.0.0.1:4173/assets/overlay-chunk-UKl5S4pE.js';
const chromiumError = (): TypeError => new TypeError(`Failed to fetch dynamically imported module: ${URL_}`);
const config = mergeConfig({ chunks: { retryDelaysMs: [500, 1500], timeoutMs: 8000 } });

afterEach(() => {
  vi.useRealTimers();
});

describe('failedChunkUrl', () => {
  it('reads the module URL from Chromium and Firefox import errors', () => {
    expect(failedChunkUrl(chromiumError())).toBe(URL_);
    expect(failedChunkUrl(new TypeError(`error loading dynamically imported module: ${URL_}`))).toBe(URL_);
    expect(failedChunkUrl(new TypeError(`Failed to fetch dynamically imported module: ${URL_}?retry=3`))).toBe(URL_);
  });

  it('is null when the error has no URL (Safari)', () => {
    expect(failedChunkUrl(new TypeError('Importing a module script failed.'))).toBeNull();
    expect(failedChunkUrl(undefined)).toBeNull();
  });
});

describe('loadChunk', () => {
  it('returns the first load when it succeeds (no retry, no busting)', async () => {
    const importUrl = vi.fn();
    const mod = { ok: 1 };
    await expect(loadChunk(() => Promise.resolve(mod), { config, importUrl })).resolves.toBe(mod);
    expect(importUrl).not.toHaveBeenCalled();
  });

  it('after a failure re-imports the URL with a fresh cache-busting query, after the backoff', async () => {
    const slept: number[] = [];
    const urls: string[] = [];
    let calls = 0;
    const mod = { ok: 2 };
    const p = loadChunk(
      () => {
        calls++;
        return Promise.reject(chromiumError()); // the cached failure: same specifier, same error
      },
      {
        config,
        sleep: async (ms) => void slept.push(ms),
        importUrl: async (u) => {
          urls.push(u);
          if (urls.length === 1) throw new TypeError(`Failed to fetch dynamically imported module: ${u}`);
          return mod;
        },
      },
    );
    await expect(p).resolves.toBe(mod);
    expect(calls).toBe(1); // the plain specifier is never retried once the URL is known
    expect(slept).toEqual([500, 1500]);
    expect(urls).toHaveLength(2);
    for (const u of urls) expect(u).toMatch(new RegExp(`^${URL_.replace(/[.?]/g, '\\$&')}\\?retry=\\d+$`));
    expect(urls[0]).not.toBe(urls[1]); // never a URL that already failed
  });

  it('without a URL (Safari) retries the plain import, and rejects with the last error after the retries', async () => {
    let calls = 0;
    const p = loadChunk(
      () => {
        calls++;
        return Promise.reject(new TypeError(`Importing a module script failed. (${calls})`));
      },
      { config, sleep: async () => undefined, importUrl: () => Promise.reject(new Error('unexpected')) },
    );
    await expect(p).rejects.toThrow('Importing a module script failed. (3)');
    expect(calls).toBe(3);
  });

  it('a stalled attempt times out and the next attempt can succeed', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const mod = { ok: 3 };
    const p = loadChunk(() => (++calls === 1 ? new Promise<never>(() => undefined) : Promise.resolve(mod)), { config });
    await vi.advanceTimersByTimeAsync(8000 + 500);
    await expect(p).resolves.toBe(mod);
    expect(calls).toBe(2);
  });
});

describe('deadline', () => {
  it('passes results and errors through, and rejects (calling onExpire) when too late', async () => {
    vi.useFakeTimers();
    await expect(deadline(Promise.resolve(1), 100)).resolves.toBe(1);
    await expect(deadline(Promise.reject(new Error('x')), 100)).rejects.toThrow('x');
    const expired = vi.fn();
    const late = deadline(new Promise<never>(() => undefined), 100, expired);
    const check = expect(late).rejects.toThrow('timed out after 100 ms');
    await vi.advanceTimersByTimeAsync(100);
    await check;
    expect(expired).toHaveBeenCalledTimes(1);
    const never = new Promise<number>(() => undefined);
    expect(deadline(never, 0)).toBe(never); // 0 = no limit
  });
});
