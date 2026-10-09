// Owner: D (Phase 2b; was platform)
// FB player data (05 §7, 04 §7.1/§7.3): getDataAsync(['save']) + local mirror on load; every write
// mirrored locally at once; setDataAsync debounced cfg.save.cloudDebounceMs; flushDataAsync only for
// 'flush'; NETWORK_FAILURE retried with backoff; PENDING_REQUEST coalesced.
//
// Policies (ours):
// - One writer at a time. Writes requested while one is in flight are coalesced: only the newest
//   document is sent next. A flush always follows the setDataAsync of the newest document.
// - 'debounced' opens a window of cloudDebounceMs at the first unsent change; later changes join it
//   (the window is not pushed back), so a steady stream of moves still reaches the cloud.
// - Cloud writes start only once this session's save has merged the cloud copy: overwriting a copy we
//   never merged could lose another device's progress. If the boot read fails or takes longer than
//   cloudLoadTimeoutMs, the session starts from the mirror alone (or defaults) with cloud writes off.
//   The read then goes on in the background (cloudLateRetryDelaysMs, the last delay repeating). When
//   it arrives it is handed to the app (onExternalSave, source 'cloud'), which merges it into the live
//   save, and only then do cloud writes start (05 §7 "the cloud merge follows"). A copy that arrives
//   before anyone subscribed waits for the first subscriber; until then cloud writes stay off.
// - Unmerged marker (PLAT-1): a session that runs without the cloud merge flags its mirror. The next
//   load that does read the cloud returns `localUnmerged`, so the app takes the 04 §7.3 newest-wins
//   fields (stock, settings, ads, inProgress, ext) from the cloud instead of from the mirror's fresher
//   updatedAt. The flag is cleared by the first save made after the cloud copy was merged.
// - Per-player mirror (PLAT-2), when `scoped` is given: player p's mirror lives under
//   `${storageKey}:${encodeURIComponent(p)}`, so another FB account on the same device never sees it,
//   and every account keeps its own copy (even without cloud save). With no player ID (getID() null)
//   the unscoped key is a cache only: it is never merged with a cloud copy, and a session that starts
//   from it never merges a late cloud copy into it (so it never writes to the cloud either).
//   An unscoped mirror (an earlier build or an ID-less session) is never adopted by a player, because
//   we cannot tell whose it is; dropping it is the safe choice (the cloud copy holds the player's data,
//   and no build with an unscoped FB mirror was ever released).
import { cfg, type GameConfig } from '../../app/config';
import type { SaveData } from '../../game/types';
import { sleep, within } from '../shared/timers';
import type { ExternalSave, PlatformStorage, PlatformTimers, RawSave } from '../types';
import type { LocalFlag, LocalStore } from '../web/local-storage';
import { fbErrorCode, fbErrorText } from './fb-errors';
import type { FBInstantSDK } from './fbinstant';

/** One local mirror and its "not merged with the cloud" marker. */
export interface FbMirror {
  readonly local: LocalStore;
  /** Persisted marker (PLAT-1). Default: in memory only. */
  readonly unmerged?: LocalFlag;
}

export interface FbStorageDeps {
  /** The mirror. With `scoped`, the unscoped cache used only while the player ID is unknown. */
  local: LocalStore;
  /** Marker for `local`. Default: in memory only. */
  unmerged?: LocalFlag;
  /**
   * Per-player mirrors (PLAT-2): load() asks for the player ID and uses mirrorFor(id). Without it,
   * `local` is the player's own mirror (single-account setups and tests).
   */
  scoped?: { playerId(): string | null; mirrorFor(playerId: string): FbMirror };
  timers: PlatformTimers;
  /** Cloud save supported (capabilities().cloudSave, known after init). Default: true. */
  cloudEnabled?: () => boolean;
  config?: GameConfig;
  /** Diagnostics sink (never receives save contents; dev and test builds only). Default: console.warn in dev. */
  log?: (msg: string) => void;
}

/** Errors worth retrying; anything else (INVALID_PARAM, CLIENT_UNSUPPORTED_OPERATION, …) is logged and dropped. */
const RETRY_CODES = new Set(['NETWORK_FAILURE', 'PENDING_REQUEST']);

type Attempt = 'ok' | 'drop' | 'fail';
type CloudRead = { kind: 'ok'; value: unknown | null; corrupt: boolean } | { kind: 'drop' } | { kind: 'fail' };

function memoryFlag(): LocalFlag {
  let on = false;
  return { get: () => on, set: (v) => void (on = v) };
}

function safeCall(cb: () => void): void {
  try {
    cb();
  } catch {
    /* a listener must never break storage */
  }
}

export function createFbStorage(sdk: FBInstantSDK, deps: FbStorageDeps): PlatformStorage {
  const c = deps.config ?? cfg;
  const { timers } = deps;
  const key = c.save.cloudKey;
  const cloudEnabled = deps.cloudEnabled ?? (() => true);
  const log =
    deps.log ??
    ((msg: string) => {
      if (import.meta.env.DEV && import.meta.env.MODE !== 'test') console.warn(`[fb-storage] ${msg}`);
    });

  /** The active mirror: `deps.local` until load() picks the player's own (PLAT-2). */
  let mirror: { local: LocalStore; unmerged: LocalFlag } = { local: deps.local, unmerged: deps.unmerged ?? memoryFlag() };
  /** true while the active mirror's unmerged marker is (believed to be) set. */
  let markerOn = false;
  /** true once this session's save merged the cloud copy (cloud writes are allowed only then). */
  let cloudReadOk = false;
  let pending: SaveData | null = null;
  let wantFlush = false;
  let debounce: number | null = null;
  let pump: Promise<void> | null = null;

  // Late cloud copy (PLAT-1).
  const externalCbs = new Set<(copy: ExternalSave) => void>();
  let lateCopy: { value: unknown | null } | null = null;
  let lateTimer: number | null = null;
  let lateTries = 0;

  // Memory-fallback warning (PLAT-3): only when neither the mirror nor the cloud keeps the save.
  const memoryCbs: (() => void)[] = [];
  let memoryArmedOn: LocalStore | null = null;
  /** true while load() runs: whether the cloud keeps the save is not known yet. */
  let loading = false;

  const cloudWritable = (): boolean => cloudReadOk && cloudEnabled();

  const cancelDebounce = (): void => {
    if (debounce !== null) timers.clearTimeout(debounce);
    debounce = null;
  };

  /** Retries NETWORK_FAILURE / PENDING_REQUEST / unknown errors after each of `delays`;
   *  `onRetry` runs after each backoff, right before the next try. */
  const attempt = async (
    what: string,
    call: () => Promise<void>,
    onRetry?: () => void,
    delays: readonly number[] = c.save.cloudRetryDelaysMs,
  ): Promise<Attempt> => {
    for (let i = 0; ; i++) {
      try {
        await call();
        return 'ok';
      } catch (err) {
        const code = fbErrorCode(err);
        if (code !== null && !RETRY_CODES.has(code)) {
          if (import.meta.env.DEV) log(`${what} dropped (${fbErrorText(err)}); the local copy is kept`);
          return 'drop';
        }
        const delay = delays[i];
        if (delay === undefined) {
          if (import.meta.env.DEV) log(`${what} failed after ${i + 1} tries (${fbErrorText(err)}); will retry later`);
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
          let doc: SaveData = pending;
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

  /** One cloud read: with the cloudRetryDelaysMs backoff at boot, a single try in the background. */
  const loadCloud = async (retry: boolean): Promise<CloudRead> => {
    let data: Record<string, unknown> | undefined;
    const r = await attempt(
      'getDataAsync',
      async () => {
        data = await sdk.player.getDataAsync([key]);
      },
      undefined,
      retry ? c.save.cloudRetryDelaysMs : [],
    );
    if (r !== 'ok') return { kind: r };
    const raw = data?.[key];
    if (raw === undefined || raw === null) return { kind: 'ok', value: null, corrupt: false };
    if (typeof raw !== 'string') return { kind: 'ok', value: raw, corrupt: false };
    try {
      return { kind: 'ok', value: JSON.parse(raw) as unknown, corrupt: false };
    } catch {
      return { kind: 'ok', value: null, corrupt: true };
    }
  };

  const setMarker = (on: boolean): void => {
    markerOn = on;
    mirror.unmerged.set(on);
  };

  /** Hands the late cloud copy to the app; cloud writes start once every listener has merged it. */
  const deliverLate = (value: unknown | null): void => {
    if (externalCbs.size === 0) {
      lateCopy = { value }; // waits for the first subscriber; cloud writes stay off until then
      return;
    }
    lateCopy = null;
    let merged = true;
    for (const cb of Array.from(externalCbs)) {
      try {
        cb({ source: 'cloud', value });
      } catch {
        merged = false; // a listener failed: the live save may not hold the cloud copy
      }
    }
    if (!merged) return; // cloud writes stay off; the next session merges as usual
    cloudReadOk = true;
    if (import.meta.env.DEV) log('the cloud copy arrived late and was merged; cloud writes are on');
  };

  const scheduleLate = (): void => {
    if (lateTimer !== null || cloudReadOk) return;
    const delays = c.save.cloudLateRetryDelaysMs;
    if (delays.length === 0) return;
    const delay = delays[Math.min(lateTries, delays.length - 1)] ?? 0;
    lateTries++;
    lateTimer = timers.setTimeout(() => {
      lateTimer = null;
      void loadCloud(false).then(onLate);
    }, delay);
  };

  function onLate(r: CloudRead): void {
    if (cloudReadOk || lateCopy) return;
    if (r.kind === 'ok') deliverLate(r.value);
    else if (r.kind === 'fail') scheduleLate();
    // 'drop' (INVALID_PARAM, CLIENT_UNSUPPORTED_OPERATION, …): another try will not help.
  }

  const checkMemory = (): void => {
    if (loading || memoryCbs.length === 0 || mirror.local.status() !== 'memory' || cloudWritable()) return;
    for (const cb of memoryCbs.splice(0)) safeCall(cb);
  };
  const armMemory = (): void => {
    if (memoryCbs.length === 0 || memoryArmedOn === mirror.local) return;
    memoryArmedOn = mirror.local;
    mirror.local.onMemory?.(checkMemory);
  };

  const playerId = (): string | null => {
    try {
      const id = deps.scoped?.playerId();
      return typeof id === 'string' && id !== '' ? id : null;
    } catch {
      return null;
    }
  };

  /** load() without the bookkeeping: picks the mirror, reads it and the cloud copy. */
  const loadOnce = async (): Promise<RawSave> => {
    // 1. Whose mirror (PLAT-2).
    let cacheOnly = false;
    if (deps.scoped) {
      const id = playerId();
      if (id !== null) {
        const m = deps.scoped.mirrorFor(id);
        mirror = { local: m.local, unmerged: m.unmerged ?? memoryFlag() };
      } else {
        cacheOnly = true; // the unscoped cache: never merged with a cloud copy
      }
    }
    armMemory();
    const own = mirror.local.read();
    if (!cloudEnabled()) return { local: own.value, cloud: null, corrupt: own.corrupt };

    // 2. The cloud copy, waited for at most cloudLoadTimeoutMs.
    const cloudP = loadCloud(true);
    const cloud = await within(timers, cloudP, c.save.cloudLoadTimeoutMs, () => 'timeout' as const);
    if (cloud !== 'timeout' && cloud.kind === 'ok') {
      cloudReadOk = true;
      markerOn = mirror.unmerged.get();
      const unmerged = !cacheOnly && own.value !== null && markerOn;
      return {
        local: cacheOnly ? null : own.value,
        cloud: cloud.value,
        corrupt: (!cacheOnly && own.corrupt) || cloud.corrupt,
        ...(unmerged ? { localUnmerged: true } : {}),
      };
    }

    // 3. No cloud copy yet: start from the mirror, flag it, and keep reading in the background.
    cloudReadOk = false;
    setMarker(true);
    if (import.meta.env.DEV) log(cloud === 'timeout' ? 'getDataAsync timed out; cloud writes wait for the late copy' : 'cloud read failed; cloud writes wait for a later read');
    // A save that starts from the ID-less cache may hold another account's data: never merge it with the cloud.
    const mergeable = !cacheOnly || own.value === null;
    if (mergeable) {
      if (cloud === 'timeout') void cloudP.then(onLate);
      else if (cloud.kind === 'fail') scheduleLate();
    }
    return { local: own.value, cloud: null, corrupt: own.corrupt };
  };

  return {
    async load(): Promise<RawSave> {
      loading = true;
      try {
        return await loadOnce();
      } finally {
        loading = false;
        checkMemory();
      }
    },

    async save(data, opts): Promise<void> {
      mirror.local.write(data); // the mirror is always written at once (05 §7: covers a kill before the cloud write)
      if (!cloudWritable()) return;
      if (markerOn) setMarker(false); // the mirror now holds a document merged with the cloud
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

    // PLAT-3: a memory-only mirror is harmless while the cloud keeps every write.
    status: () => (mirror.local.status() === 'memory' && !cloudWritable() ? 'memory' : 'ok'),

    onMemoryFallback(cb) {
      memoryCbs.push(cb);
      armMemory();
      checkMemory();
    },

    onExternalSave(cb) {
      externalCbs.add(cb);
      if (lateCopy) deliverLate(lateCopy.value);
      return () => {
        externalCbs.delete(cb);
      };
    },
  };
}
