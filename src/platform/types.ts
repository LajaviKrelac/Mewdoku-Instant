// Owner: D (Phase 2b; F0 fixed the 2b contract: additive only, ask the lead to change a shape).
// Owner: G3 (Phase 2c): RankEntry.boardRank (additive), band docs generalised to the period board,
// payments catalogue vs retired ids (docs/phase2c/fish-lives-spec.md §4.5, §5.3, §7.4).
// Platform adapter contract (04 §4.4, §6; phase2b §3.5, §5.4, §5.6, §8.4). Depends only on game/ types.
import type { BoardKey, ProductId, SaveData } from '../game/types';

export type { BoardKey, ProductId } from '../game/types';

export type PlatformId = 'web' | 'fbig';

export interface Capabilities {
  interstitial: boolean;
  rewarded: boolean;
  banner: boolean;
  cloudSave: boolean;
  /** = ranking.caps().global (phase2b §5.4); drives the Home trophy (views.ts showTrophy). */
  leaderboards: boolean;
  share: boolean;
  /** FB: getPlatform() !== 'IOS' and payments.purchaseAsync supported (phase2b §8.4). The Buy section also needs payments.ready(). */
  payments: boolean;
  /** FB overlay views exist (overlayViews.createOverlayViewWithXMLString), phase2b §5.4. */
  overlayViews: boolean;
  /** FB tournaments usable for group challenges (phase2b §5.6); still behind flag groupChallenges. */
  groups: boolean;
  /** Platform haptics OR navigator.vibrate. false → Settings hides "Vibration" (02 §14). */
  haptics: boolean;
}

/** A banner has no preload, so it is not an AdKind (phase2b §3.5): see PlatformAds.banner. */
export type AdKind = 'interstitial' | 'rewarded';
/** phase2b §3.2 adds `event_next` (lead-approved F0 widening). */
export type InterstitialPlacement = 'next_level' | 'retry' | 'daily_done' | 'event_next';
/** phase2b §5.6 adds `group_double` (lead-approved F0 widening). */
export type RewardedPlacement = 'hint' | 'kitty' | 'revive' | 'group_double';
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
  save(data: SaveData, opts: { cloud: 'debounced' | 'now' | 'flush' }): Promise<void>;
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
  /**
   * FB banner (phase2b §3.2, §3.5). Present only when the adapter can both show AND hide a banner
   * (loadBannerAdAsync + hideBannerAdAsync supported, VITE_FB_PLACEMENT_BANNER set); capabilities().banner
   * mirrors it. `show` loads and shows in one call (Meta's API); a call inside Meta's 45 s window answers
   * { ok: false, reason: 'rate_limited' }. `unsupported` latches the banner off for the session. Never rejects.
   * The app (banner-flow.ts) owns where and when: never on the game screen.
   */
  banner?: {
    show(position: 'bottom'): Promise<AdResult>;
    hide(): Promise<void>;
  };
}

// ─────────────────────────── Rankings (phase2b §5.4) ───────────────────────────

/** A leaderboard row as game code sees it: never a name or photo (those live only in overlay views, §5.7). */
export interface RankEntry {
  /** The rank shown: the board's own rank, or on a band read (top(…, keep)) the 1-based position inside the band. */
  readonly rank: number;
  readonly score: number;
  /** false whenever the API cannot tell (NEZP entries carry session ids only). */
  readonly isMe: boolean;
  /**
   * [2c, additive; phase2c §4.5] The board's own rank of this entry, set on band reads (top(…, keep))
   * and absent otherwise. Classic: the entry's getRank(); NEZP: its 1-based position in the API's
   * ordered list (getRank() when the API offers one). With it, "my rank inside the band" is exact at
   * any depth: `mine.rank − (band[0].boardRank − 1)` (the entries above the band are not counted).
   */
  readonly boardRank?: number;
}

export interface RankingCaps {
  /** Which leaderboard API the probe found (§5.4: classic, then NEZP, else none). */
  readonly api: 'classic' | 'nezp' | 'none';
  /** Top entries readable. */
  readonly global: boolean;
  /** My own rank readable (classic getPlayerEntryAsync); false on NEZP. */
  readonly myRank: boolean;
  /** Overlay views exist. */
  readonly overlay: boolean;
  /** = cfg.rank.overlayPlacement === 'rect' && overlay (§14 G3). */
  readonly overlayInRect: boolean;
}

/** What the overlay list shows. [F0 addition: formatScore, rows are formatted by the app, see CONTRACTS-2b §4.4] */
export interface RankListView {
  /** Already localised by the caller. */
  readonly title: string;
  readonly scoreFormat: 'points' | 'time' | 'event';
  readonly highlightMe: boolean;
  /** Rows to fetch and show (≤ rank.topCount). */
  readonly count: number;
  /**
   * Turns a raw board score into its display text ("1 240", "3:08", "13 of 21"). Supplied by the app
   * (game/scoring.ts decode + i18n formatting): platform/ may not import game/ values (CONTRACTS §2).
   */
  readonly formatScore: (score: number) => string;
  /**
   * Which entries the list may show (additive, 2b integration; generalised in 2c): a BAND of a board
   * that holds several bands, best first. daily_fastest keeps the shown day's entries (phase2b §5.3),
   * period_points the shown period's (phase2c §4.5): each is one board whose score carries the day or
   * period index in its high digits. Supplied by the app (it decodes scores); absent = every entry.
   * A filtered list shows fewer rows, never padded ones. The band is read past the entries above it
   * (later days, clocks ahead), and its rows are numbered by their position inside it (review FB2B-4;
   * see RankingProvider.top). My pinned row (classic) carries my rank inside the band.
   */
  readonly keep?: (score: number) => boolean;
  /**
   * [additive, review FB2B-7] The score text of MY row (isMe) when it differs from formatScore: the
   * entry of the solve just made shows my exact time, as the panel does ("Solved in 0:03"), not the
   * board's rounded-up second. Absent = formatScore for every row.
   */
  readonly formatMine?: (score: number) => string;
}

export interface RankingProvider {
  caps(): RankingCaps;
  /** 'unsupported' also when the board has no platform id (VITE_FB_LEADERBOARDS). 'not_improved' is not an error. Never rejects. */
  submit(board: BoardKey, score: number): Promise<'ok' | 'not_improved' | 'unsupported' | 'error'>;
  /** null unless caps().myRank, and on error or timeout (rank.fetchTimeoutMs). Never rejects. */
  mine(board: BoardKey): Promise<RankEntry | null>;
  /**
   * [] when unsupported, on error or timeout. Never fabricated: only rows the API returned. Never rejects.
   * [additive, review FB2B-4; generalised in 2c] `keep` selects a band (daily_fastest: the shown day,
   * phase2b §5.3; period_points: the shown period, phase2c §4.5): only the entries it accepts, best
   * first, read past the entries above that band (later time zones that already posted the next day's
   * daily, devices whose clocks run ahead), with `rank` = the 1-based position inside the band (every
   * better entry of the band was read, so it is the true rank in it) and `boardRank` = the board's own
   * rank of the entry (phase2c §4.5, so a caller can place my board rank inside the band exactly).
   * The read stops once `n` band entries are in, the band ends, or BAND_MAX_PAGES pages were read.
   */
  top(board: BoardKey, n: number, keep?: (score: number) => boolean): Promise<readonly RankEntry[]>;
  /**
   * [additive, review FB2B-6] false once this build knows the board cannot be served: no platform id,
   * or the platform said it does not exist (FB LEADERBOARD_NOT_FOUND: an id in VITE_FB_LEADERBOARDS
   * that the dashboard lacks). Absent = unknown (treated as supported).
   */
  supports?(board: BoardKey): boolean;
  /**
   * Overlay view with names and photos. With `rect` it is placed inside it (only when
   * caps().overlayInRect); without, FB presents it its own way. null when unsupported or on error.
   * [D addition, additive] `closed` settles when the view is gone for any reason (the player closed a
   * full-screen list with its close control or Esc, or close() ran), so the caller can restore focus.
   */
  showList(board: BoardKey, view: RankListView, rect?: DOMRect): Promise<{ close(): void; readonly closed?: Promise<void> } | null>;
}

// ─────────────────────────── Group challenges (phase2b §5.6) ───────────────────────────

export interface GroupProvider {
  /** tournament.createAsync (FB's dialog); null when the player cancels, is already in one, or on error. */
  create(endTimeMs: number, title: string): Promise<{ id: string } | null>;
  /** The tournament of the current context (getTournamentAsync), or null. */
  current(): Promise<{ id: string; endTimeMs: number } | null>;
  /** tournament.postScoreAsync(score); false on any error (not retried). */
  post(score: number): Promise<boolean>;
  /** Absent unless §14 G2 finds a standings API. */
  standings?(id: string): Promise<{ myRank: number; count: number; tiedFirst: boolean } | null>;
}

// ─────────────────────────── Payments (phase2b §8.2, §8.4) ───────────────────────────

/** A catalogue row: only what we show. Titles and descriptions come from our i18n (shop.product.<id>.*). */
export interface Product {
  readonly id: ProductId;
  /** Localised price string from the catalogue, shown as is. */
  readonly price: string;
  readonly currency: string;
}

/** An FB purchase (§8.2 fields we use). No price or payment ids go to analytics. */
export interface Purchase {
  readonly productId: ProductId;
  readonly purchaseToken: string;
  readonly paymentId: string;
  readonly purchaseTime: number;
  readonly developerPayload?: string;
}

export type PurchaseFailReason = 'cancelled' | 'not_ready' | 'unsupported' | 'error';

export interface PaymentsProvider {
  /** onReady fired. */
  ready(): boolean;
  /** cb at once if already ready; never called on iOS / Messenger.com (payments unsupported). */
  onReady(cb: () => void): void;
  /** The products on sale (phase2c §5.3: cfg.iap.catalog ids only; a retired product is never listed). */
  catalog(): Promise<readonly Product[]>;
  /** A product on sale (cfg.iap.catalog); a retired or unknown id answers 'error' without an SDK call. */
  purchase(id: ProductId, payload: string): Promise<{ ok: true; p: Purchase } | { ok: false; reason: PurchaseFailReason }>;
  /**
   * Unconsumed purchases; null on failure (the boot restore then changes nothing). Phase 2c §5.3: also
   * those of cfg.iap.retired ids (fish_250, fish_900), so the restore compensates and consumes them
   * instead of leaving them unconsumed forever.
   */
  purchases(): Promise<readonly Purchase[] | null>;
  consume(token: string): Promise<boolean>;
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
  /**
   * @deprecated Phase 1 placeholder, never implemented. Phase 2b uses `ranking` (phase2b §5.4).
   * Kept because types are additive only.
   */
  leaderboards?: {
    // Phase 4, optional capability
    submit(board: string, score: number, extra?: string): Promise<void>;
    show?(board: string): Promise<void>; // FB overlay view (05 §8)
  };
  /** FB leaderboards + overlay views (phase2b §5.4). Undefined on web: the panel shows personal records. */
  ranking?: RankingProvider;
  /** FB tournaments (phase2b §5.6). Undefined on web. */
  groups?: GroupProvider;
  /** FB payments (phase2b §8.4). Undefined on web: no payments code is bundled there. */
  payments?: PaymentsProvider;
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
