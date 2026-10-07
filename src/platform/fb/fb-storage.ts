// Owner: platform
// FB player data (05 §7, 04 §7.1/§7.3): getDataAsync(['save']) + local mirror on load; every write
// mirrored locally at once; setDataAsync debounced cfg.save.cloudDebounceMs; flushDataAsync only for
// 'flush'; NETWORK_FAILURE retried with backoff; PENDING_REQUEST coalesced.
//
// Policies (ours):
// - One writer at a time. Writes requested while one is in flight are coalesced: only the newest
//   document is sent next. A flush always follows the setDataAsync of the newest document.
// - 'debounced' opens a window of cloudDebounceMs at the first unsent change; later changes join it
//   (the window is not pushed back), so a steady stream of moves still reaches the cloud.
// - If the cloud copy could not be read at load (error or cloudLoadTimeoutMs), this session never
//   writes to the cloud: overwriting a copy we never merged could lose another device's progress.
//   The local mirror still keeps every write, and the next session merges as usual.
import { cfg, type GameConfig } from '../../app/config';
import type { SaveDataV1 } from '../../game/types';
import { sleep } from '../shared/timers';
import type { PlatformStorage, PlatformTimers, RawSave } from '../types';
import type { LocalStore } from '../web/local-storage';
import { fbErrorCode, fbErrorText } from './fb-errors';
import type { FBInstantSDK } from './fbinstant';

export interface FbStorageDeps {
  local: LocalStore;
  timers: PlatformTimers;
  /** Cloud save supported (capabilities().cloudSave, known after init). Default: true. */
  cloudEnabled?: () => boolean;
  config?: GameConfig;
  /** Diagnostics sink (never receives save contents). Default: console.warn in dev. */
  log?: (msg: string) => void;
}

/** Errors worth retrying; anything else (INVALID_PARAM, CLIENT_UNSUPPORTED_OPERATION, …) is logged and dropped. */
const RETRY_CODES = new Set(['NETWORK_FAILURE', 'PENDING_REQUEST']);

type Attempt = 'ok' | 'drop' | 'fail';

export function createFbStorage(sdk: FBInstantSDK, deps: FbStorageDeps): PlatformStorage {
  const c = deps.config ?? cfg;
  const { local, timers } = deps;
  const key = c.save.cloudKey;
  const cloudEnabled = deps.cloudEnabled ?? (() => true);
  const log =
    deps.log ??
    ((msg: string) => {
      if (import.meta.env.DEV && import.meta.env.MODE !== 'test') console.warn(`[fb-storage] ${msg}`);
    });

  /** true once getDataAsync succeeded this session (cloud writes are allowed only then). */
  let cloudReadOk = false;
  let pending: SaveDataV1 | null = null;
  let wantFlush = false;
  let debounce: number | null = null;
  let pump: Promise<void> | null = null;

  const cloudWritable = (): boolean => cloudReadOk && cloudEnabled();

  const cancelDebounce = (): void => {
    if (debounce !== null) timers.clearTimeout(debounce);
    debounce = null;
  };

  /** Retries NETWORK_FAILURE / PENDING_REQUEST / unknown errors with cfg.save.cloudRetryDelaysMs;
   *  `onRetry` runs after each backoff, right before the next try. */
  const attempt = async (what: string, call: () => Promise<void>, onRetry?: () => void): Promise<Attempt> => {
    const delays = c.save.cloudRetryDelaysMs;
    for (let i = 0; ; i++) {
      try {
        await call();
        return 'ok';
      } catch (err) {
        const code = fbErrorCode(err);
        if (code !== null && !RETRY_CODES.has(code)) {
          log(`${what} dropped (${fbErrorText(err)}); the local copy is kept`);
          return 'drop';
        }
        const delay = delays[i];
        if (delay === undefined) {
          log(`${what} failed after ${i + 1} tries (${fbErrorText(err)}); will retry on the next save`);
          return 'fail';
        }
        await sleep(timers, delay);
        onRetry?.();
      }
    }
  };

  /** The single writer: newest document first, then a flush if one was asked for. */
  const run = async (): Promise<void> => {
    await Promise.resolve(); // always async, so `pump` is assigned before this can finish
    try {
      for (;;) {
        if (pending) {
          let doc: SaveDataV1 = pending;
          pending = null;
          const r = await attempt(
            'setDataAsync',
            () => sdk.player.setDataAsync({ [key]: doc }),
            () => {
              // Coalesce: a newer document that arrived while we wait replaces the one being retried.
              if (pending) {
                doc = pending;
                pending = null;
              }
            },
          );
          if (r === 'fail') {
            if (!pending) pending = doc; // keep it dirty for the next save()
            return;
          }
          continue; // pick up anything that arrived meanwhile before flushing
        }
        if (wantFlush) {
          wantFlush = false;
          const r = await attempt('flushDataAsync', () => sdk.player.flushDataAsync());
          if (r === 'fail') {
            wantFlush = true;
            return;
          }
          continue;
        }
        return;
      }
    } finally {
      pump = null; // runs in the same tick as the loop exit: no window where a request is lost
    }
  };

  const kick = (): Promise<void> => {
    if (!pump) pump = run();
    return pump;
  };

  const loadCloud = async (): Promise<{ value: unknown | null; corrupt: boolean } | null> => {
    let data: Record<string, unknown> | undefined;
    const r = await attempt('getDataAsync', async () => {
      data = await sdk.player.getDataAsync([key]);
    });
    if (r !== 'ok') return null;
    const raw = data?.[key];
    if (raw === undefined || raw === null) return { value: null, corrupt: false };
    if (typeof raw !== 'string') return { value: raw, corrupt: false };
    try {
      return { value: JSON.parse(raw) as unknown, corrupt: false };
    } catch {
      return { value: null, corrupt: true };
    }
  };

  const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> =>
    new Promise((resolve) => {
      let done = false;
      const timer = timers.setTimeout(() => {
        if (!done) {
          done = true;
          resolve('timeout');
        }
      }, ms);
      void p.then((v) => {
        if (done) return;
        done = true;
        timers.clearTimeout(timer);
        resolve(v);
      });
    });

  return {
    async load(): Promise<RawSave> {
      const mirror = local.read();
      if (!cloudEnabled()) return { local: mirror.value, cloud: null, corrupt: mirror.corrupt };
      const cloud = await withTimeout(
        loadCloud().catch(() => null),
        c.save.cloudLoadTimeoutMs,
      );
      if (cloud === 'timeout' || cloud === null) {
        cloudReadOk = false;
        log(cloud === 'timeout' ? 'getDataAsync timed out; cloud writes are off this session' : 'cloud read failed; cloud writes are off this session');
        return { local: mirror.value, cloud: null, corrupt: mirror.corrupt };
      }
      cloudReadOk = true;
      return { local: mirror.value, cloud: cloud.value, corrupt: mirror.corrupt || cloud.corrupt };
    },

    async save(data, opts): Promise<void> {
      local.write(data); // the mirror is always written at once (05 §7: covers a kill before the cloud write)
      if (!cloudWritable()) return;
      pending = data;
      if (opts.cloud === 'debounced') {
        if (debounce === null) {
          debounce = timers.setTimeout(() => {
            debounce = null;
            void kick();
          }, c.save.cloudDebounceMs);
        }
        return;
      }
      cancelDebounce();
      if (opts.cloud === 'flush') wantFlush = true;
      await kick();
    },

    status: () => local.status(),

    onMemoryFallback(cb) {
      local.onMemory?.(cb);
    },
  };
}
