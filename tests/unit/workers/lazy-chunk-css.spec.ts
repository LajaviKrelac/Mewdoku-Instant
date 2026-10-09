// @vitest-environment jsdom
// Owner: R (2b review fixes). ROB-1: the default stylesheet re-fetch of loadChunk — the failed <link>
// that Vite's preload helper left behind goes, a cache-busted one is added and awaited.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reloadStylesheet } from '../../../src/workers/lazy-chunk';

const URL_ = 'http://127.0.0.1:4173/assets/events-chunk-Bq1.css';

afterEach(() => {
  document.head.innerHTML = '';
  vi.useRealTimers();
});

const links = (): HTMLLinkElement[] => Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));

describe('reloadStylesheet (ROB-1)', () => {
  it('removes the failed link, appends the busted one and resolves on its load', async () => {
    const failed = document.createElement('link');
    failed.rel = 'stylesheet';
    failed.href = URL_; // the helper's link: no usable sheet after its error
    const other = document.createElement('link');
    other.rel = 'stylesheet';
    other.href = 'http://127.0.0.1:4173/assets/index-A1.css';
    document.head.append(other, failed);
    const p = reloadStylesheet(URL_, `${URL_}?retry=3`, 5000);
    expect(links().map((l) => l.href)).toEqual(['http://127.0.0.1:4173/assets/index-A1.css', `${URL_}?retry=3`]);
    const fresh = links()[1] as HTMLLinkElement;
    expect(fresh.crossOrigin).toBe('');
    fresh.dispatchEvent(new Event('load'));
    await expect(p).resolves.toBeUndefined();
  });

  it('rejects (and drops its link) when the busted request fails too, or never answers', async () => {
    const p = reloadStylesheet(URL_, `${URL_}?retry=4`, 5000);
    (links()[0] as HTMLLinkElement).dispatchEvent(new Event('error'));
    await expect(p).rejects.toThrow(`Unable to preload CSS for ${URL_}?retry=4`);
    expect(links()).toHaveLength(0);
    vi.useFakeTimers();
    const q = reloadStylesheet(URL_, `${URL_}?retry=5`, 1000);
    const check = expect(q).rejects.toThrow('timed out after 1000 ms');
    await vi.advanceTimersByTimeAsync(1000);
    await check;
    expect(links()).toHaveLength(0);
  });
});
