// Owner: app
// Lazy chunk import that survives a failed download (04 §8, §9). Chromium keeps a failed dynamic
// import() in its module map: importing the same URL again rejects at once, with no new request, so
// "a later call retries" never recovers. After a failure the chunk is therefore imported again from
// its URL plus a cache-busting query (`?retry=N`), after chunks.retryDelaysMs. Every attempt has a
// deadline (chunks.timeoutMs), so a stalled download cannot hang the caller.
// The URL comes from the error message (Chromium, Firefox); when it has none (Safari), the plain
// import is retried. Limits: a chunk whose own static imports failed still fails, since those keep
// their URLs, and so may Safari; callers then degrade (engine-client asks the worker, which has its
// own module graph; the router reports 'overlay:failed' and the app toasts, staying playable).
import { cfg, type GameConfig } from '../app/config';

export interface ChunkOptions {
  readonly config?: GameConfig;
  /** Test seams. */
  readonly importUrl?: (url: string) => Promise<unknown>;
  readonly sleep?: (ms: number) => Promise<void>;
}

let busts = 0;

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

/** `load()` (a static-specifier dynamic import), retried with a cache-busting URL after a failure. */
export async function loadChunk<T>(load: () => Promise<T>, opts: ChunkOptions = {}): Promise<T> {
  const { retryDelaysMs, timeoutMs } = (opts.config ?? cfg).chunks;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const importUrl = opts.importUrl ?? ((u: string): Promise<unknown> => import(/* @vite-ignore */ u));
  let url: string | null = null;
  for (let i = 0; ; i++) {
    try {
      return await deadline((url ? importUrl(`${url}?retry=${++busts}`) : load()) as Promise<T>, timeoutMs);
    } catch (err) {
      if (i >= retryDelaysMs.length) throw err;
      url ??= failedChunkUrl(err);
      await sleep(retryDelaysMs[i] ?? 0);
    }
  }
}
