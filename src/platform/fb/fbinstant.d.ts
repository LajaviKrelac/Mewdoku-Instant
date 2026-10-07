// Owner: platform
// Our own minimal ambient types for the FBInstant 8.0 subset we call (05 §2, §4–§10). Extend as needed.

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
  setDataAsync(data: Record<string, unknown>): Promise<void>;
  flushDataAsync(): Promise<void>;
}

export interface FBInstantSDK {
  initializeAsync(): Promise<void>;
  setLoadingProgress(percentage: number): void;
  startGameAsync(): Promise<void>;
  getLocale(): string | null;
  getPlatform(): 'IOS' | 'ANDROID' | 'WEB' | 'MOBILE_WEB' | null;
  getSDKVersion(): string;
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
