// Owner: platform
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
  | 'USER_INPUT';

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
  logEvent(eventName: string, valueToSum?: number | null, parameters?: Record<string, string | number>): FBError | null;
  getInterstitialAdAsync(placementID: string): Promise<FBAdInstance>;
  getRewardedVideoAsync(placementID: string): Promise<FBAdInstance>;
  performHapticFeedbackAsync(): Promise<void>;
  readonly player: FBPlayer;
}

declare global {
  interface Window {
    FBInstant?: FBInstantSDK;
  }
}
