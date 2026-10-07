// Owner: foundation. Build-time globals and env keys (04 §6.1).
/// <reference types="vite/client" />

/** 'fbig' in the FBIG build, 'web' otherwise. Replaced at build time. */
declare const __PLATFORM__: 'web' | 'fbig';
/** true in the e2e build (and when MEWDOKU_E2E=1): enables window.__mewdoku test hooks (04 §11). */
declare const __E2E__: boolean;
/** package.json version, shown in About (02 §14). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** FB Monetization Manager placement IDs. Empty → that ad capability is false (02 §13.3, 05 §6.2). */
  readonly VITE_FB_PLACEMENT_INTERSTITIAL?: string;
  readonly VITE_FB_PLACEMENT_REWARDED?: string;
}
