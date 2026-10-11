// Owner: G1 (Phase 2e); lead (I-4: startLadder moved here from boot.ts)
// The ranking's app code as ONE lazy import (docs/phase2e/spec.md §2.12, §7.9: "ladder-flow + ladder-client +
// remote-config + the shared validators" in a core lazy chunk): boot loads it at step 8 only where the
// ranking origin is in use, so web-prod never downloads it and never sends a request. Not the `ladder` UI
// chunk (app/ladder-chunk.ts), whose views the flow loads on its own.
// Phase 2e I-4 (lead, the first load): boot's step 8 wiring (the client, the remote switches, the flow, the first
// sign-in after the tutorial) is startLadder below, so the first load carries only the gate and the import.
import { cfg } from './config';
import type { Clock } from './clock';
import type { AppBus } from './events';
import { createLadderClient, deviceCredential } from './ladder-client';
import { createLadderFlow, type LadderFlow, type LadderFlowDeps } from './ladder-flow';
import { createRemoteConfig, type RemoteConfig } from './remote-config';
import type { Router } from './router';
import type { SaveScheduler } from './saves';
import type { AppState, Store } from './store';
import type { PlatformAdapter } from '../platform/types';
import { loadChunk } from '../workers/lazy-chunk';
// Phase 2e I-4: the English strings only lazy chunks show (this module's flow toasts and the ladder views among them).
import '../i18n/en-lazy';

export { createLadderClient, deviceCredential } from './ladder-client';
export { createLadderFlow } from './ladder-flow';
export { createRemoteConfig } from './remote-config';

export interface StartLadderDeps {
  readonly baseUrl: string;
  readonly platform: PlatformAdapter;
  readonly win: (Window & typeof globalThis) | null;
  /** e2e builds only: the test pool of `?ladderPool=` (boot.ts e2eLadderPool), else null. */
  readonly devPool: string | null;
  readonly clock: Clock;
  readonly clientVersion: string;
  readonly contentVersion: string;
  readonly store: Store<AppState>;
  readonly saves: SaveScheduler;
  readonly router: Router;
  readonly bus: AppBus;
  watchDouble(): Promise<boolean>;
  /** The remote switches changed: banners re-evaluate (a banner already up is hidden when switched off). */
  switchesChanged(): void;
  records: LadderFlowDeps['records'];
  /** Hands the remote switches to boot (the e2e hooks and the session read them) as soon as they exist. */
  setRemote(r: RemoteConfig): void;
  /** Hands the flow to boot BEFORE the first sign-in starts (the session and the shell read it). */
  setFlow(f: LadderFlow): void;
}

/**
 * Boot step 8 (spec §2.2, §7.4): the remote switches first (no sign-in), then — once the tutorial is done — the
 * sign-in, the claim repair and the first flush. Never blocks the first screen; never rejects.
 */
export async function startLadder(d: StartLadderDeps): Promise<LadderFlow> {
  const { win, platform, clock, store, router, bus } = d;
  const storageOf = (): Storage | null => {
    try {
      return win?.localStorage ?? null;
    } catch {
      return null;
    }
  };
  const cryptoOf = (): Crypto | null => (typeof crypto !== 'undefined' ? crypto : null);
  const attempt = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  const client = createLadderClient({
    baseUrl: d.baseUrl,
    platformId: platform.id,
    identity: platform.identity ?? null,
    device: () => deviceCredential(storageOf(), cryptoOf()),
    clock,
    clientVersion: d.clientVersion,
    contentVersion: d.contentVersion,
    devPool: d.devPool,
  });
  const remote = createRemoteConfig({
    fetchConfig: () => client.config(),
    storage: storageOf(),
    clock,
    log: (e) => bus.emit('analytics', e),
    onChange: () => {
      d.switchesChanged();
      // The Buy rows (iapIos, iapInPlay) re-evaluate from their next render (never a purchase in flight).
      bus.emit('ladder:update', { reason: 'session' });
    },
  });
  d.setRemote(remote);
  await remote.start();
  const flow = createLadderFlow({
    client,
    store,
    saves: d.saves,
    router,
    bus,
    clock,
    platformId: platform.id,
    remoteOn: () => remote.ladderOn(),
    rewardedAvailable: () => cfg.ads.enabled && attempt(() => platform.capabilities().rewarded, false),
    watchDouble: d.watchDouble,
    loadChunk: () => loadChunk(() => import('./ladder-chunk'), { css: /ladder-chunk-[\w-]+\.css/ }).catch(() => null),
    storage: storageOf(),
    online: () => win?.navigator?.onLine ?? true,
    records: d.records,
    canOpenCard: () => router.screen() === 'home' && router.stack().length === 0 && store.get().save.tutorialDone,
  });
  d.setFlow(flow);
  const begin = (): void => {
    void flow.start().then(() => {
      if (router.screen() === 'home' && router.stack().length === 0) flow.homeMounted();
    });
  };
  if (store.get().save.tutorialDone) begin();
  else {
    // A first run signs in only after the tutorial (its win shows no ranking).
    const off = store.select(
      (st) => st.save.tutorialDone,
      (done) => {
        if (!done) return;
        off();
        begin();
      },
    );
  }
  bus.emit('ladder:update', { reason: 'session' });
  return flow;
}
