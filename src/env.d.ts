// Owner: D (Phase 2b; F0 added the 2b env keys); G3 (Phase 2c: VITE_FB_LEADERBOARDS doc). Build-time globals and env keys (04 §6.1).
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
  /** phase2b §3.2: FB banner placement ID. Empty → no banner (capabilities().banner false). */
  readonly VITE_FB_PLACEMENT_BANNER?: string;
  /**
   * phase2b §5.4, phase2c §4.9: JSON map BoardKey → FB dashboard leaderboard name or id, e.g.
   * {"period_points":"fish_week_v1","event_lantern_walk_2026":"…"}. paw_points is retired and
   * daily_fastest is read only with rank.dailyBoard (docs/phase2b/fb-dashboard.md §1, §3).
   * Empty or missing → every board is unsupported (personal records).
   */
  readonly VITE_FB_LEADERBOARDS?: string;
}
