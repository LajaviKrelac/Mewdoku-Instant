// Owner: D (Phase 2b); G3 (Phase 2c: period_points accepted, docs/phase2c/fish-lives-spec.md §4.1)
// Capability probes for the phase2b FB features (§3.2, §5.4, §5.6, §8.4). Main bundle: these few
// checks let capabilities() be final right after init() without loading the lazy `fb-social` chunk.
// fb-ranking.ts, fb-groups.ts and fb-payments.ts re-export them (their F0 export sites).
//
// Rule for every feature: the API name is listed by getSupportedAPIs() AND the function exists at
// runtime. The exact getSupportedAPIs strings below are our reading of the SDK's "namespace.method"
// convention (05 §2: 'player.setDataAsync'); the 2b ones are [uncertain] until §14 G1–G5. A wrong
// string only keeps that feature in its fallback state (personal records, no banner, no Buy).
import type { BoardKey } from '../types';
import type { FBInstantSDK } from './fbinstant';

/** getSupportedAPIs() names behind the phase2b features. [uncertain] except where noted in fbinstant.d.ts. */
export const FB_2B_API = {
  bannerLoad: 'loadBannerAdAsync',
  bannerHide: 'hideBannerAdAsync',
  classicLeaderboard: 'getLeaderboardAsync',
  nezpSetScore: 'globalLeaderboards.setScoreAsync',
  nezpTop: 'globalLeaderboards.getTopEntriesAsync',
  overlayCreate: 'overlayViews.createOverlayViewWithXMLString',
  tournamentCreate: 'tournament.createAsync',
  tournamentPost: 'tournament.postScoreAsync',
  tournamentCurrent: 'getTournamentAsync',
  purchase: 'payments.purchaseAsync',
} as const;

/** getSupportedAPIs() as a set; empty when the call throws (before init, or a broken SDK). */
export function supportedApis(sdk: FBInstantSDK): ReadonlySet<string> {
  try {
    const list = sdk.getSupportedAPIs();
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

const isFn = (v: unknown): v is (...args: never[]) => unknown => typeof v === 'function';

/** Reads `sdk[key]` without letting a throwing getter (a broken SDK) escape. */
function prop<K extends keyof FBInstantSDK>(sdk: FBInstantSDK, key: K): FBInstantSDK[K] | undefined {
  try {
    return sdk[key];
  } catch {
    return undefined;
  }
}

/** Banner: BOTH load and hide listed and callable (§3.2): without a working hide no banner may ever show. */
export function probeBanner(sdk: FBInstantSDK, apis: ReadonlySet<string> = supportedApis(sdk)): boolean {
  return (
    apis.has(FB_2B_API.bannerLoad) &&
    apis.has(FB_2B_API.bannerHide) &&
    isFn(prop(sdk, 'loadBannerAdAsync')) &&
    isFn(prop(sdk, 'hideBannerAdAsync'))
  );
}

/** Which leaderboard API this SDK serves (§5.4 probe order: classic, then NEZP, else none). */
export function probeRankingApi(sdk: FBInstantSDK, apis: ReadonlySet<string> = supportedApis(sdk)): 'classic' | 'nezp' | 'none' {
  if (apis.has(FB_2B_API.classicLeaderboard) && isFn(prop(sdk, 'getLeaderboardAsync'))) return 'classic';
  const g = prop(sdk, 'globalLeaderboards');
  if (apis.has(FB_2B_API.nezpSetScore) && apis.has(FB_2B_API.nezpTop) && g && isFn(g.setScoreAsync) && isFn(g.getTopEntriesAsync)) {
    return 'nezp';
  }
  return 'none';
}

/** overlayViews.createOverlayViewWithXMLString listed and callable (§5.4). */
export function overlayViewsSupported(sdk: FBInstantSDK, apis: ReadonlySet<string> = supportedApis(sdk)): boolean {
  const o = prop(sdk, 'overlayViews');
  return apis.has(FB_2B_API.overlayCreate) && !!o && isFn(o.createOverlayViewWithXMLString);
}

/** tournament.createAsync, tournament.postScoreAsync and getTournamentAsync all listed and callable (§5.6). */
export function groupsSupported(sdk: FBInstantSDK, apis: ReadonlySet<string> = supportedApis(sdk)): boolean {
  const t = prop(sdk, 'tournament');
  return (
    apis.has(FB_2B_API.tournamentCreate) &&
    apis.has(FB_2B_API.tournamentPost) &&
    apis.has(FB_2B_API.tournamentCurrent) &&
    !!t &&
    isFn(t.createAsync) &&
    isFn(t.postScoreAsync) &&
    isFn(prop(sdk, 'getTournamentAsync'))
  );
}

/**
 * The capabilities().payments rule (§8.4): getPlatform() !== 'IOS' (iOS is not eligible, 05: confirmed)
 * and payments.purchaseAsync listed and callable. Messenger.com cannot be told apart here: there
 * onReady never fires, so the Buy section never appears (§8.6). getPlatform() is null before init.
 */
export function paymentsSupported(sdk: FBInstantSDK, apis: ReadonlySet<string> = supportedApis(sdk)): boolean {
  let platform: string | null = null;
  try {
    platform = sdk.getPlatform();
  } catch {
    return false;
  }
  if (platform === null || platform === 'IOS') return false;
  const p = prop(sdk, 'payments');
  return apis.has(FB_2B_API.purchase) && !!p && isFn(p.purchaseAsync) && isFn(p.onReady);
}

/**
 * A BoardKey as the specs name them: period_points (phase2c §4.1, THE leaderboard), daily_fastest
 * (phase2b §5.3; read only with rank.dailyBoard), event_<id with - → _>, and the retired paw_points
 * (still a BoardKey so an old map parses; the app never submits or reads it).
 */
const BOARD_KEY = /^(period_points|paw_points|daily_fastest|event_[a-z0-9_]{3,40})$/;
/** Dashboard names / ids we accept as values: short, printable, no spaces. */
const BOARD_NAME = /^[A-Za-z0-9_.:-]{1,64}$/;

/**
 * VITE_FB_LEADERBOARDS → { BoardKey: dashboard name or id } (§5.4). Empty, invalid JSON, a non-object,
 * or entries with a bad key or value are dropped (a board without an id is 'unsupported', so a
 * forgotten board degrades to personal records and never throws). Never throws.
 */
export function parseLeaderboardMap(json: string | undefined): Partial<Record<BoardKey, string>> {
  const out: Partial<Record<BoardKey, string>> = {};
  if (typeof json !== 'string' || json.trim() === '') return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return out;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return out;
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!BOARD_KEY.test(key) || typeof value !== 'string') continue;
    const name = value.trim();
    if (BOARD_NAME.test(name)) out[key as BoardKey] = name;
  }
  return out;
}

/**
 * RankingCaps from the probe results (§5.4), shared by the main-bundle facade and the lazy provider.
 * `global` also needs at least one board id: without one every call is 'unsupported', so there is
 * nothing to read and the Home trophy stays hidden. `myRank` is the classic API only (NEZP entries
 * cannot identify "me"). `overlayInRect` waits for cfg.rank.overlayPlacement 'rect' (§14 G3).
 */
export function rankingCaps(
  api: 'classic' | 'nezp' | 'none',
  boards: Partial<Record<BoardKey, string>>,
  overlay: boolean,
  placement: 'fullscreen' | 'rect',
): { api: 'classic' | 'nezp' | 'none'; global: boolean; myRank: boolean; overlay: boolean; overlayInRect: boolean } {
  const global = api !== 'none' && Object.keys(boards).length > 0;
  return {
    api,
    global,
    myRank: global && api === 'classic',
    overlay,
    overlayInRect: overlay && placement === 'rect',
  };
}
