// Owner: D (Phase 2b; was platform)
// Our own minimal ambient types for the FBInstant 8.0 subset we call (05 §2, §4–§10). Extend as needed.
// Written from the API surface listed in 05; no third-party typings are copied (06).

/** Error codes we branch on (05 §6.2, §7). The SDK may send others; treat unknown codes generically. */
export type FBErrorCode =
  | 'ADS_FREQUENT_LOAD'
  | 'ADS_NO_FILL'
  | 'ADS_NOT_LOADED'
  | 'ADS_TOO_MANY_INSTANCES'
  | 'CLIENT_UNSUPPORTED_OPERATION'
  | 'INVALID_OPERATION'
  | 'INVALID_PARAM'
  | 'NETWORK_FAILURE'
  | 'PENDING_REQUEST'
  | 'RATE_LIMITED'
  | 'USER_INPUT'
  // phase2b (leaderboards, tournaments, payments). LEADERBOARD_SCORE_NOT_IMPROVED is third-party only
  // (05 §14); PAYMENTS_NOT_INITIALIZED, TOURNAMENT_NOT_FOUND, DUPLICATE_POST per the 2026-10-08 search.
  | 'LEADERBOARD_NOT_FOUND'
  | 'LEADERBOARD_SCORE_NOT_IMPROVED'
  | 'PAYMENTS_NOT_INITIALIZED'
  | 'TOURNAMENT_NOT_FOUND'
  | 'DUPLICATE_POST';

export interface FBError {
  code: string; // e.g. ADS_NO_FILL, ADS_FREQUENT_LOAD, RATE_LIMITED, ADS_NOT_LOADED, CLIENT_UNSUPPORTED_OPERATION, NETWORK_FAILURE, PENDING_REQUEST, INVALID_PARAM
  message: string;
}

export interface FBAdInstance {
  getPlacementID(): string;
  loadAsync(): Promise<void>;
  /** Resolves when finished/closed (interstitial) or watched to the end (rewarded); rejects otherwise. */
  showAsync(): Promise<void>;
}

export interface FBPlayer {
  getID(): string | null;
  getDataAsync(keys: string[]): Promise<Record<string, unknown>>;
  /** Resolves when the write is scheduled (not necessarily persisted). Rejects while a flush is pending. */
  setDataAsync(data: Record<string, unknown>): Promise<void>;
  /** "Expensive": critical changes only (05 §7). */
  flushDataAsync(): Promise<void>;
}

export interface FBInstantSDK {
  initializeAsync(): Promise<void>;
  setLoadingProgress(percentage: number): void;
  startGameAsync(): Promise<void>;
  /** Accurate only after startGameAsync (05 §4). */
  getLocale(): string | null;
  getPlatform(): 'IOS' | 'ANDROID' | 'WEB' | 'MOBILE_WEB' | null;
  getSDKVersion(): string;
  /** API names such as 'getRewardedVideoAsync', 'player.setDataAsync', 'performHapticFeedbackAsync'. */
  getSupportedAPIs(): string[];
  onPause(cb: () => void): void;
  /** Parameter values are strings, each under 100 characters (05 §10). */
  logEvent(eventName: string, valueToSum?: number | null, parameters?: Record<string, string>): FBError | null;
  getInterstitialAdAsync(placementID: string): Promise<FBAdInstance>;
  getRewardedVideoAsync(placementID: string): Promise<FBAdInstance>;
  performHapticFeedbackAsync(): Promise<void>;
  readonly player: FBPlayer;

  // ───────────── phase2b additions: all optional, feature-detected (getSupportedAPIs + typeof) ─────────────
  // Tags: [05: confirmed] / [meta-plugin] = Meta's own Unity plugin API reference (read 2026-10-09) /
  // [meta-sample] = Meta's public NEZP sample code (read 2026-10-09) / [search: Meta docs] = 2026-10-08
  // search summaries / [uncertain] = not verified. Phase 4 verifies every non-[05: confirmed] item (§14).

  /** Loads AND shows a banner (no separate show) [search: Meta docs]; (placementID, position) [05: confirmed], [meta-plugin]. Position values [uncertain: G4]. */
  loadBannerAdAsync?(placementID: string, position?: string): Promise<void>;
  /** Removes the banner [meta-plugin]. */
  hideBannerAdAsync?(): Promise<void>;

  /** Classic leaderboards [search: Meta docs]; whether 8.0 still serves them is [uncertain: G1]. */
  getLeaderboardAsync?(name: string): Promise<FBLeaderboard>;
  /** NEZP leaderboards [05: likely], [search: Meta docs] (described there as the older way). */
  readonly globalLeaderboards?: FBGlobalLeaderboards;

  /** Overlay views [05: confirmed] (API), [meta-plugin], [meta-sample]. Placement, taps, closing: [uncertain: G3]. */
  readonly overlayViews?: FBOverlayViews;

  /** Tournaments [05: likely], [meta-plugin], [search: Meta docs]. */
  readonly tournament?: FBTournamentApi;
  /** The tournament of the current context [meta-plugin] (a top-level call). Rejects when there is none [uncertain]. */
  getTournamentAsync?(): Promise<FBTournament>;

  /** Payments [05: likely], [meta-plugin], [meta-sample]. Not on iOS [05: confirmed]. */
  readonly payments?: FBPayments;
}

// ── Leaderboards (phase2b §5.2) ──

/** A leaderboard player as 8.0 game code sees it: ids only, never a name or photo (05 §3). */
export interface FBLeaderboardPlayer {
  /** Classic: the game-scoped player ID [uncertain under 8.0]. */
  getID?(): string | null;
  /** NEZP: a session-scoped id that overlay views can resolve [search: Meta docs]. */
  getSessionID?(): string | null;
}

export interface FBLeaderboardEntry {
  getScore(): number;
  /** Classic entries carry a rank; NEZP entries may not [uncertain]. */
  getRank?(): number;
  getPlayer?(): FBLeaderboardPlayer | null;
}

/** Classic leaderboard (getLeaderboardAsync). A score is kept only when it beats the stored one (sort order from the dashboard). */
export interface FBLeaderboard {
  getName?(): string;
  setScoreAsync(score: number, extraData?: string): Promise<FBLeaderboardEntry | null>;
  getEntriesAsync(count: number, offset: number): Promise<FBLeaderboardEntry[]>;
  getPlayerEntryAsync(): Promise<FBLeaderboardEntry | null>;
  getEntryCountAsync?(): Promise<number>;
}

/** NEZP leaderboards, addressed by id; entries carry a session id and a score, no rank of "me". */
export interface FBGlobalLeaderboards {
  setScoreAsync(leaderboardID: string, score: number): Promise<unknown>;
  getScoreAsync?(leaderboardID: string): Promise<unknown>;
  getTopEntriesAsync(leaderboardID: string, limit?: number): Promise<FBLeaderboardEntry[]>;
  getTopFriendEntriesAsync?(leaderboardID: string, limit?: number): Promise<FBLeaderboardEntry[]>;
}

// ── Overlay views (phase2b §5.4) ──

/** One overlay view [meta-plugin]: the game mounts `iframeElement` itself [meta-sample]. */
export interface FBOverlayView {
  readonly id?: string;
  /** The iframe Meta renders the XML into; the game appends it to its own DOM [meta-sample]. */
  readonly iframeElement?: HTMLElement;
  showAsync(): Promise<void>;
  dismissAsync?(): Promise<void>;
  updateAsync?(data: string): Promise<void>;
  getStatus?(): unknown;
}

export interface FBOverlayViews {
  /**
   * (xml, css, data, onLoad, onError, basePath) [05: confirmed]. Meta's sample passes a stylesheet PATH as
   * `css` and the data as a JSON string, and gets the view back synchronously (we also accept a promise).
   */
  createOverlayViewWithXMLString(
    xml: string,
    css: string,
    data: string,
    onLoad: (view: FBOverlayView) => void,
    onError: (view: FBOverlayView | null, error: unknown) => void,
    basePath?: string,
  ): FBOverlayView | Promise<FBOverlayView>;
  /** One global handler for `onTapEvent` events: (eventName, overlayViewId) [meta-plugin], [meta-sample]. */
  setCustomEventHandler?(handler: (event: string, overlayViewId: string) => void): void;
}

// ── Tournaments (phase2b §5.6) ──

export interface FBTournament {
  getID(): string;
  getContextID?(): string | null;
  /** Unix SECONDS [uncertain]; null when the tournament has no end. */
  getEndTime?(): number | null;
  getTitle?(): string | null;
  getPayload?(): string | null;
}

export interface FBTournamentConfig {
  readonly title?: string;
  readonly sortOrder?: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
  readonly scoreFormat?: 'NUMERIC' | 'TIME';
  /** Unix seconds; FB's default is one week [search: Meta docs]. */
  readonly endTime?: number;
}

export interface FBTournamentApi {
  /** Opens FB's dialog; rejects INVALID_OPERATION when the player is already in a tournament [search: Meta docs]. */
  createAsync(payload: { initialScore: number; config: FBTournamentConfig; data?: Record<string, unknown> }): Promise<FBTournament>;
  /** Posts to the current context's tournament, no dialog. */
  postScoreAsync(score: number): Promise<void>;
  getTournamentsAsync?(): Promise<FBTournament[]>;
  shareAsync?(payload: { score: number; data?: Record<string, unknown> }): Promise<void>;
}

// ── Payments (phase2b §8.2) ──

export interface FBProduct {
  readonly productID: string;
  readonly title?: string;
  readonly description?: string;
  readonly imageURI?: string;
  /** Localised price string, shown as is. */
  readonly price: string;
  readonly priceCurrencyCode?: string;
  readonly priceAmount?: number;
}

export interface FBPurchase {
  readonly productID: string;
  readonly purchaseToken: string;
  readonly paymentID?: string;
  /** Unix seconds; Meta's plugin types it as a string [meta-plugin], [meta-sample]. */
  readonly purchaseTime?: string | number;
  readonly developerPayload?: string;
  readonly signedRequest?: string;
  readonly purchasePlatform?: string;
  /** 'charge' or 'refund' [05: likely]. */
  readonly paymentActionType?: string;
  readonly isConsumed?: boolean;
}

export interface FBPayments {
  /** cb once payments can be used; never on unsupported surfaces (Messenger.com) [search: Meta docs]. */
  onReady(cb: () => void): void;
  getCatalogAsync(): Promise<FBProduct[]>;
  /** Rejects before startGameAsync [05: confirmed]. */
  purchaseAsync(config: { productID: string; developerPayload?: string }): Promise<FBPurchase>;
  /** Unconsumed purchases. */
  getPurchasesAsync(): Promise<FBPurchase[]>;
  consumePurchaseAsync(purchaseToken: string): Promise<void>;
}

declare global {
  interface Window {
    FBInstant?: FBInstantSDK;
  }
}
