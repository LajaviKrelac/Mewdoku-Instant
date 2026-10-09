// Owner: C (Phase 2b; was app). Lazy chunk loading that survives a failed download (RP-2, 04 §8): Chromium caches a
// failed import() of a URL, so the retry must use a cache-busting URL taken from the error; every
// attempt has a deadline; the result is the first successful attempt.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeConfig } from '../../../src/app/config';
import { deadline, failedChunkUrl, failedCssUrl, loadChunk, resetChunkCssState } from '../../../src/workers/lazy-chunk';

const URL_ = 'http://127.0.0.1:4173/assets/overlay-chunk-UKl5S4pE.js';
const chromiumError = (): TypeError => new TypeError(`Failed to fetch dynamically imported module: ${URL_}`);
const config = mergeConfig({ chunks: { retryDelaysMs: [500, 1500], timeoutMs: 8000 } });

afterEach(() => {
  vi.useRealTimers();
  resetChunkCssState();
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

// ROB-1 (2b review): the chunk's own stylesheet (cssCodeSplit). Vite's preload helper marks the CSS
// URL as seen before it loads; when it fails it rejects with "Unable to preload CSS for <url>", and a
// plain retry would skip the stylesheet and resolve the chunk unstyled.
const CSS_URL = 'http://127.0.0.1:4173/assets/overlay-chunk-DaHI9uei.css';
const cssError = (u = CSS_URL): Error => new Error(`Unable to preload CSS for ${u}`);

describe('failedCssUrl (ROB-1)', () => {
  it('reads the stylesheet URL from the preload helper error, without a query', () => {
    expect(failedCssUrl(cssError())).toBe(CSS_URL);
    expect(failedCssUrl(cssError(`${CSS_URL}?retry=4`))).toBe(CSS_URL);
    expect(failedChunkUrl(cssError())).toBeNull(); // not mistaken for a JS chunk URL
  });

  it('is null for every other error', () => {
    expect(failedCssUrl(chromiumError())).toBeNull();
    expect(failedCssUrl(new TypeError('Importing a module script failed.'))).toBeNull();
    expect(failedCssUrl(undefined)).toBeNull();
  });
});

describe('loadChunk: a failed chunk stylesheet (ROB-1)', () => {
  it('re-fetches the stylesheet with a cache-busting URL, waits for it, then imports the chunk again', async () => {
    const order: string[] = [];
    const mod = { ok: 4 };
    let calls = 0;
    const p = loadChunk(
      () => {
        calls++;
        order.push(`load:${calls}`);
        return calls === 1 ? Promise.reject(cssError()) : Promise.resolve(mod);
      },
      {
        config,
        sleep: async (ms) => void order.push(`sleep:${ms}`),
        importUrl: () => Promise.reject(new Error('unexpected')),
        reloadCss: async (url, busted, timeoutMs) => {
          order.push(`css:${url === CSS_URL}:${/\?retry=\d+$/.test(busted)}:${busted.startsWith(CSS_URL)}:${timeoutMs}`);
        },
      },
    );
    await expect(p).resolves.toBe(mod);
    // Before the fix the second load() resolved at once with the stylesheet skipped (unstyled UI).
    expect(order).toEqual(['load:1', 'sleep:500', 'css:true:true:true:8000', 'load:2']);
  });

  it('a stylesheet that keeps failing rejects (the degrade paths run) instead of resolving unstyled', async () => {
    let calls = 0;
    const busted: string[] = [];
    const p = loadChunk(
      () => {
        calls++;
        return calls === 1 ? Promise.reject(cssError()) : Promise.resolve({ unstyled: true });
      },
      {
        config,
        sleep: async () => undefined,
        reloadCss: async (_url, b) => {
          busted.push(b);
          throw cssError(b);
        },
      },
    );
    await expect(p).rejects.toThrow(/Unable to preload CSS for .*overlay-chunk-DaHI9uei\.css\?retry=\d+/);
    expect(calls).toBe(1); // the chunk is never resolved without its styles
    expect(busted).toHaveLength(2);
    expect(busted[0]).not.toBe(busted[1]); // never a URL that already failed
  });

  it('after the stylesheet came back, a failing JS chunk still takes the cache-busted JS retry', async () => {
    const urls: string[] = [];
    let calls = 0;
    const mod = { ok: 5 };
    const p = loadChunk(
      () => {
        calls++;
        return Promise.reject(calls === 1 ? cssError() : chromiumError());
      },
      {
        config: mergeConfig({ chunks: { retryDelaysMs: [10, 10, 10], timeoutMs: 8000 } }),
        sleep: async () => undefined,
        reloadCss: async () => undefined,
        importUrl: async (u) => (urls.push(u), mod),
      },
    );
    await expect(p).resolves.toBe(mod);
    expect(calls).toBe(2);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/overlay-chunk-UKl5S4pE\.js\?retry=\d+$/);
  });
});

describe('loadChunk: two loaders of one chunk share its stylesheet re-fetch (ROB-1)', () => {
  it('a loader that names the stylesheet waits for the re-fetch another loader started; one busted request in all', async () => {
    const reloads: string[] = [];
    let release: () => void = () => undefined;
    const reloadCss = (_u: string, b: string): Promise<void> => {
      reloads.push(b);
      return new Promise<void>((r) => (release = r));
    };
    // Loader A (event-flow's prefetch): the helper reports the stylesheet failed.
    let aCalls = 0;
    const a = loadChunk(() => (++aCalls === 1 ? Promise.reject(cssError()) : Promise.resolve('A')), { config, sleep: async () => undefined, reloadCss });
    await Promise.resolve();
    await Promise.resolve();
    // Loader B (the router's event screen) imports the same chunk now: the helper skips the CSS it has
    // seen, so B's import resolves at once — B must not resolve before the stylesheet is back.
    let bDone = false;
    const b = loadChunk(() => Promise.resolve('B'), { config, sleep: async () => undefined, reloadCss, css: /overlay-chunk-[\w-]+\.css/ }).then((v) => {
      bDone = true;
      return v;
    });
    for (let k = 0; k < 6; k++) await Promise.resolve();
    expect(bDone).toBe(false);
    expect(reloads).toHaveLength(1);
    release();
    await expect(b).resolves.toBe('B');
    await expect(a).resolves.toBe('A');
    expect(reloads).toHaveLength(1); // shared: not one re-fetch per loader
  });

  it('a loader of another chunk (a different stylesheet pattern) is not held up', async () => {
    const p = loadChunk(() => Promise.reject(cssError()), {
      config,
      sleep: () => new Promise<void>(() => undefined), // A stays in its backoff
      reloadCss: async () => undefined,
    });
    void p.catch(() => undefined);
    await Promise.resolve();
    await expect(loadChunk(() => Promise.resolve('other'), { config, css: /events-chunk-[\w-]+\.css/ })).resolves.toBe('other');
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
