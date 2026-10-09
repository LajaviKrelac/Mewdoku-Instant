// Owner: D
// The lazy `fb-social` chunk (phase2b §11): rankings, overlay views, groups and payments. fb/index.ts
// loads it with ONE dynamic import after start(), without blocking the first route (vite.config.ts
// names the chunk assets/fb-social-*.js). Nothing in the main bundle may import these modules
// statically. F0: the barrel only.
export { createFbGroups, groupsSupported } from './fb-groups';
export { createFbOverlayViews } from './fb-overlay-views';
export { createFbPayments, paymentsSupported } from './fb-payments';
export { createFbRanking, parseLeaderboardMap, probeRankingApi } from './fb-ranking';
export { rankListTemplate } from './views/rank-list';
