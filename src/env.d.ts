// Owner: D (Phase 2b; F0 added the 2b env keys); G3 (Phase 2c: VITE_FB_LEADERBOARDS doc); lead (Phase 2e L0: the ranking
// server and per-helper rewarded keys, spec §7.3). Build-time globals and env keys (04 §6.1). Empty = off, never a broken build.
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
  /**
   * Phase 2e (spec §7.3, §2.2, D-2e-20): the ranking server's API base, e.g. `https://rank.<domain>` (e2e:
   * `http://127.0.0.1:8787`). vite.config.ts passes it through trimmed, without a trailing slash, and drops a
   * value that is not an http(s) URL (scripts/ladder-env.ts). Missing → no ladder: every surface shows the
   * personal records, as before 2e.
   */
  readonly VITE_LADDER_URL?: string;
  /**
   * Phase 2e (spec §2.11, §7.3, D-2e-5): overrides `cfg.ladder.web` in dev, e2e and staging builds ('anon': an
   * anonymous device credential, pool `web`). vite.config.ts passes only 'off' or 'anon', and never in a release
   * build (web-prod never calls the ranking server; there `cfg.ladder.web` decides). Missing → `cfg.ladder.web`.
   */
  readonly VITE_LADDER_WEB?: 'off' | 'anon';
  /**
   * Phase 2e (spec §3.4): FB rewarded placement IDs per helper and for the ranking reward's ×2. Each one that is
   * empty or missing falls back to VITE_FB_PLACEMENT_REWARDED (a build with the shared ID only behaves as
   * before 2e). fbBuildTag() reports which were given, as flags only, never the values.
   */
  readonly VITE_FB_PLACEMENT_REWARDED_HINT?: string;
  readonly VITE_FB_PLACEMENT_REWARDED_KITTY?: string;
  readonly VITE_FB_PLACEMENT_REWARDED_MOUSE?: string;
  readonly VITE_FB_PLACEMENT_REWARDED_REVIVE?: string;
  readonly VITE_FB_PLACEMENT_REWARDED_RANK_DOUBLE?: string;
}
