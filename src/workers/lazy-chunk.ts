// Owner: C (Phase 2b; was app; fixes: R, 2b review)
// Lazy chunk import that survives a failed download (04 §8, §9). Chromium keeps a failed dynamic
// import() in its module map: importing the same URL again rejects at once, with no new request, so
// "a later call retries" never recovers. After a failure the chunk is therefore imported again from
// its URL plus a cache-busting query (`?retry=N`), after chunks.retryDelaysMs. Every attempt has a
// deadline (chunks.timeoutMs), so a stalled download cannot hang the caller.
// The URL comes from the error message (Chromium, Firefox); when it has none (Safari), the plain
// import is retried. Limits: a chunk whose own static imports failed still fails, since those keep
// their URLs, and so may Safari; callers then degrade (engine-client asks the worker, which has its
// own module graph; the router reports 'overlay:failed' and the app toasts, staying playable).
// ROB-1 (2b review): a chunk's own stylesheet (cssCodeSplit: the overlay and events chunks) is loaded
// by Vite's preload helper, which marks its URL as seen BEFORE it loads and rejects with "Unable to
// preload CSS for <url>" when it fails. A plain retry then skips the stylesheet and resolves the chunk
// with no styles (every overlay, or the event screen, unstyled for the session). So a CSS failure is
// retried here: the failed <link> goes, a fresh `<link rel=stylesheet href="<url>?retry=N">` is
// awaited (deadline chunks.timeoutMs), and only then is the chunk imported again (the helper skips the
// CSS it has seen; the JS comes as before). A stylesheet that still fails after the retries rejects,
// so the callers' degrade paths run instead of showing unstyled UI.
// Two loaders of one chunk (the events chunk: event-flow's prefetch and the router's event screen)
// share that work: a failed stylesheet is recorded per URL and re-fetched once for everyone, and a
// loader that names its chunk's stylesheet (ChunkOptions.css) waits for that re-fetch before it
// resolves — the preload helper skipped the stylesheet in its own import.
// Layering: workers/ imports only engine/, workers/ and app/config; the DOM calls are guarded.
import { cfg, type GameConfig } from '../app/config';

export interface ChunkOptions {
  readonly config?: GameConfig;
  /** Test seams. */
  readonly importUrl?: (url: string) => Promise<unknown>;
  readonly sleep?: (ms: number) => Promise<void>;
  /**
   * Re-fetches a chunk's stylesheet that failed (ROB-1): resolves once `bustedUrl` has loaded,
   * rejects when it fails or times out. Default: a fresh <link rel=stylesheet> in document.head.
   */
  readonly reloadCss?: (url: string, bustedUrl: string, timeoutMs: number) => Promise<void>;
  /**
   * This chunk's stylesheet URL pattern (e.g. /events-chunk-[\w-]+\.css/): a failure of it seen by
   * another loader of the same chunk is waited for (re-fetched) before this one resolves (ROB-1).
   */
  readonly css?: RegExp;
}

let busts = 0;
/** Chunk stylesheets the preload helper reported failed and that have not loaded since (ROB-1). */
const cssFailed = new Set<string>();
/** Their re-fetches in flight, shared by every loader. */
const cssRefetch = new Map<string, Promise<void>>();

function refetchCss(url: string, reloadCss: NonNullable<ChunkOptions['reloadCss']>, timeoutMs: number): Promise<void> {
  let p = cssRefetch.get(url);
  if (!p) {
    p = reloadCss(url, withQuery(url, `retry=${++busts}`), timeoutMs).then(
      () => {
        cssFailed.delete(url);
        cssRefetch.delete(url);
      },
      (e: unknown) => {
        cssRefetch.delete(url);
        throw e;
      },
    );
    cssRefetch.set(url, p);
  }
  return p;
}

/** Test seam: forget every recorded stylesheet failure. */
export function resetChunkCssState(): void {
  cssFailed.clear();
  cssRefetch.clear();
}

/** Rejects when `p` has not settled within `ms` (after calling `onExpire`); ms ≤ 0 means no limit. */
export function deadline<T>(p: Promise<T>, ms: number, onExpire?: () => void): Promise<T> {
  if (!(ms > 0)) return p;
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => {
      onExpire?.();
      reject(new Error(`timed out after ${ms} ms`));
    }, ms);
    p.then(
      (v) => (clearTimeout(id), resolve(v)),
      (e: unknown) => (clearTimeout(id), reject(e)),
    );
  });
}

/** The chunk URL named by a failed import's error (Chromium, Firefox), else null. */
export function failedChunkUrl(err: unknown): string | null {
  return /\b(?:https?|file):\/\/[^\s'"<>]+?\.m?js\b/.exec(String((err as Error | null)?.message ?? err))?.[0] ?? null;
}

/** The stylesheet URL named by Vite's preload helper ("Unable to preload CSS for <url>"), else null. */
export function failedCssUrl(err: unknown): string | null {
  const m = /Unable to preload CSS for (\S+?\.css)(?:\?\S*)?(?=$|\s)/.exec(String((err as Error | null)?.message ?? err));
  return m?.[1] ?? null;
}

const withQuery = (url: string, q: string): string => `${url}${url.includes('?') ? '&' : '?'}${q}`;

/** The default reloadCss: drops the failed <link>(s) for `url`, adds `bustedUrl`, waits for it. */
export function reloadStylesheet(url: string, bustedUrl: string, timeoutMs: number): Promise<void> {
  const doc = typeof document === 'undefined' ? null : document;
  if (!doc?.head) return Promise.reject(new Error(`Unable to preload CSS for ${url}`));
  const base = url.split('?')[0] as string;
  for (const old of Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))) {
    if (old.href.split('?')[0] !== base) continue;
    let usable = false;
    try {
      usable = !!old.sheet && old.sheet.cssRules.length >= 0;
    } catch {
      usable = false; // a failed (or cross-origin) sheet: cssRules throws
    }
    if (!usable) old.remove();
  }
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.crossOrigin = ''; // as Vite's helper requests it
  link.href = bustedUrl;
  const loaded = new Promise<void>((resolve, reject) => {
    link.addEventListener('load', () => resolve());
    link.addEventListener('error', () => {
      link.remove();
      reject(new Error(`Unable to preload CSS for ${bustedUrl}`));
    });
  });
  doc.head.appendChild(link);
  return deadline(loaded, timeoutMs, () => link.remove());
}

/** `load()` (a static-specifier dynamic import), retried with a cache-busting URL after a failure. */
export async function loadChunk<T>(load: () => Promise<T>, opts: ChunkOptions = {}): Promise<T> {
  const { retryDelaysMs, timeoutMs } = (opts.config ?? cfg).chunks;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const importUrl = opts.importUrl ?? ((u: string): Promise<unknown> => import(/* @vite-ignore */ u));
  const reloadCss = opts.reloadCss ?? reloadStylesheet;
  let url: string | null = null;
  /** Stylesheets this load saw fail (its own), re-fetched before the chunk is imported again (ROB-1). */
  const own = new Set<string>();
  /** Failed stylesheets of this chunk still to load: its own, and any another loader saw (opts.css). */
  const pendingCss = (): string[] => [...cssFailed].filter((u) => own.has(u) || !!opts.css?.test(u));
  for (let i = 0; ; i++) {
    try {
      for (const css of pendingCss()) await refetchCss(css, reloadCss, timeoutMs);
      const m = await deadline((url ? importUrl(`${url}?retry=${++busts}`) : load()) as Promise<T>, timeoutMs);
      // A concurrent load of the same chunk may have seen its stylesheet fail meanwhile; the helper
      // skipped the stylesheet in this import, so it has to come before this load resolves.
      for (const css of pendingCss()) await refetchCss(css, reloadCss, timeoutMs);
      return m;
    } catch (err) {
      if (i >= retryDelaysMs.length) throw err;
      const css = failedCssUrl(err);
      if (css) {
        own.add(css);
        // A failed re-fetch keeps the URL recorded; the helper's own failure records it first.
        if (!cssRefetch.has(css)) cssFailed.add(css);
      } else url ??= failedChunkUrl(err);
      await sleep(retryDelaysMs[i] ?? 0);
    }
  }
}
