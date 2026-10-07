// Owner: foundation (platform workstream: additive only).
// Platform adapter contract (04 §4.4, §6). Depends only on game/ types.
import type { SaveDataV1 } from '../game/types';

export type PlatformId = 'web' | 'fbig';

export interface Capabilities {
  interstitial: boolean;
  rewarded: boolean;
  banner: boolean;
  cloudSave: boolean;
  leaderboards: boolean;
  share: boolean;
  payments: boolean;
  /** Platform haptics OR navigator.vibrate. false → Settings hides "Vibration" (02 §14). */
  haptics: boolean;
}

export type AdKind = 'interstitial' | 'rewarded';
export type InterstitialPlacement = 'next_level' | 'retry' | 'daily_done';
export type RewardedPlacement = 'hint' | 'kitty' | 'revive';
export type AdPlacement = InterstitialPlacement | RewardedPlacement;
export type AdFailReason = 'unsupported' | 'no_fill' | 'not_ready' | 'skipped' | 'rate_limited' | 'timeout' | 'error';
export type AdResult =
  | { ok: true } // interstitial shown / rewarded watched to the end
  | { ok: false; reason: AdFailReason };

/**
 * Raw save sources returned by storage.load(). [Foundation addition] 04 §4.4 returns one merged
 * `unknown`; merging needs game/save.ts (migrate + merge), which platform/ must not import (04 §2),
 * so the adapter returns both raw copies and the app runs migrate() on each, then merge().
 */
export interface RawSave {
  /** Parsed local mirror (localStorage), or null when absent / unparseable. */
  local: unknown | null;
  /** Parsed cloud copy (FB player data), or null when absent or unsupported (web). */
  cloud: unknown | null;
  /** true when a stored copy existed but could not be parsed (it was backed up, 04 §7.2). */
  corrupt: boolean;
  /**
   * [Platform addition, PLAT-1] FB: true when the local mirror holds changes from a session that
   * never merged the cloud copy (its cloud read failed or timed out). Its fresh updatedAt must not
   * win the 04 §7.3 newest-wins fields, so the app takes those from the cloud copy. Absent = false.
   */
  localUnmerged?: boolean;
}

/**
 * [Platform addition] A save copy that reached the adapter after load() (see onExternalSave).
 * 'cloud' (FB, PLAT-1): the cloud read that finished after save.cloudLoadTimeoutMs. The live save
 *   never merged it, so the 04 §7.3 newest-wins fields come from this copy; cloud writes start only
 *   after every listener has run.
 * 'tab' (web, RP-5): another tab of the game wrote the save ('storage' event): the plain 04 §7.3 merge.
 */
export interface ExternalSave {
  readonly source: 'cloud' | 'tab';
  /** Parsed copy (run migrate() on it), or null when empty or unreadable. */
  readonly value: unknown | null;
}

/** 'memory' = localStorage unavailable (private mode, quota); the app shows a one-time toast (04 §6.2). */
export type StorageStatus = 'ok' | 'memory';

export interface PlatformStorage {
  load(): Promise<RawSave>;
  /**
   * Writes the local mirror at once. cloud: 'debounced' = setDataAsync after save.cloudDebounceMs;
   * 'now' = setDataAsync at once (cancels the debounce); 'flush' = setDataAsync then flushDataAsync
   * (04 §7.1). Web: cloud is ignored. Never rejects: errors are retried or logged inside.
   */
  save(data: SaveDataV1, opts: { cloud: 'debounced' | 'now' | 'flush' }): Promise<void>;
  status(): StorageStatus;
  /**
   * [Platform addition] One-time warning hook (04 §6.2): `cb` runs once, the first time the local
   * store is (or becomes) memory-only — immediately when it already is. The app shows the
   * 'toast.storageMemory' toast from it. Optional so test doubles need not implement it.
   */
  onMemoryFallback?(cb: () => void): void;
  /**
   * [Platform addition, PLAT-1 / RP-5] Save copies that arrive after load(): the app merges each
   * into its live save (04 §7.3). It must not write back for a 'tab' copy (two tabs would echo each
   * other); for a 'cloud' copy it saves once, which sends the merged document to the cloud. A copy
   * that arrived before anyone subscribed is delivered at subscription. Returns an unsubscribe.
   */
  onExternalSave?(cb: (copy: ExternalSave) => void): () => void;
}

export interface PlatformAds {
  preload(kind: AdKind): void;
  isReady(kind: AdKind): boolean;
  /** Waits ≤ ads.readyTimeoutMs for readiness (→ 'timeout'), then shows with NO timeout. Never rejects. */
  showInterstitial(p: InterstitialPlacement): Promise<AdResult>;
  /** ok only when watched to completion. Never rejects. */
  showRewarded(p: RewardedPlacement): Promise<AdResult>;
}

export type AnalyticsParams = Record<string, string | number>;

export interface PlatformAdapter {
  readonly id: PlatformId;
  capabilities(): Capabilities; // final after init(), except that an ad kind can turn off later (FB: 'unsupported' result, PLAT-4)
  init(): Promise<void>; // FB: initializeAsync (call early)
  setLoadingProgress(pct: number): void; // FB: setLoadingProgress(0..100)
  start(): Promise<void>; // FB: startGameAsync
  getLocale(): string; // valid after start()
  getPlayerId(): string | null; // game-scoped ID or null
  onPause(cb: () => void): void;
  storage: PlatformStorage;
  ads: PlatformAds;
  analytics: { log(name: string, params?: AnalyticsParams): void };
  haptics: { pulse(pattern: number | readonly number[]): void };
  leaderboards?: {
    // Phase 4, optional capability
    submit(board: string, score: number, extra?: string): Promise<void>;
    show?(board: string): Promise<void>; // FB overlay view (05 §8)
  };
}

/** Both adapters export `createPlatform(): PlatformAdapter` from their index.ts (imported via '@platform'). */
export type CreatePlatform = () => PlatformAdapter;

/**
 * Minimal timer/clock surface the adapters need for debounces and readiness timeouts. [Foundation
 * addition] app/clock.ts `Clock` satisfies it structurally, so tests can pass a FakeClock.
 */
export interface PlatformTimers {
  now(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number | null | undefined): void;
}
