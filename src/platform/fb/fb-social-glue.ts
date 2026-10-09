// Owner: D
// Main-bundle glue for the lazy `fb-social` chunk (phase2b §5.4, §5.6, §8.4, §11). The adapter's
// `ranking`, `groups` and `payments` are small facades defined here: their capabilities come from
// the cheap probes (fb-probe.ts), so capabilities() is final right after init(), and every call
// loads the chunk on demand (one dynamic import, memoised; a failed load is retried on the next
// call). fb/index.ts also preloads the chunk right after start() when any feature needs it, so it
// never blocks the first route and is normally there long before the first win.
//
// Only TYPE imports from the chunk's modules: a value import would pull them into the main bundle.
import { cfg, type GameConfig } from '../../app/config';
import { within } from '../shared/timers';
import type {
  BoardKey,
  GroupProvider,
  PaymentsProvider,
  PlatformTimers,
  RankingCaps,
  RankingProvider,
} from '../types';
import { groupsSupported, overlayViewsSupported, paymentsSupported, probeRankingApi, rankingCaps } from './fb-probe';
import type { FBInstantSDK } from './fbinstant';

/** The lazy chunk's exports (fb-social.ts). */
export type SocialModule = typeof import('./fb-social');

export interface SocialGlueOptions {
  /** The real SDK object; only read once `initialized()` is true. */
  readonly sdk: () => FBInstantSDK;
  /** getSupportedAPIs() as read by init(). */
  readonly apis: () => ReadonlySet<string>;
  readonly initialized: () => boolean;
  readonly boards: Partial<Record<BoardKey, string>>;
  readonly timers: PlatformTimers;
  /** () => import('./fb-social') in the app; tests may inject a failing or slow loader. */
  readonly load: () => Promise<SocialModule>;
  readonly config?: GameConfig;
  /** Where overlay views are mounted (tests). Default: the global document. */
  readonly doc?: Document;
}

interface Probe {
  readonly api: RankingCaps['api'];
  readonly overlay: boolean;
  readonly groups: boolean;
  readonly payments: boolean;
}

interface Real {
  readonly ranking: RankingProvider;
  readonly groups: GroupProvider | null;
  readonly payments: PaymentsProvider | null;
}

export interface SocialGlue {
  /** Always defined on FB (api 'none' answers 'unsupported' / null / [] without loading anything). */
  readonly ranking: RankingProvider;
  /** The facade when tournaments are supported, else undefined. */
  groups(): GroupProvider | undefined;
  /** The facade when payments are supported (not iOS), else undefined. */
  payments(): PaymentsProvider | undefined;
  overlayViews(): boolean;
  /** After start(): load the chunk in the background when any feature needs it. Never rejects. */
  preload(): void;
}

const NO_CAPS: RankingCaps = Object.freeze({ api: 'none', global: false, myRank: false, overlay: false, overlayInRect: false });

export function createSocialGlue(opts: SocialGlueOptions): SocialGlue {
  const c = opts.config ?? cfg;
  const timers = opts.timers;
  const deadline = c.rank.fetchTimeoutMs;

  let probed: Probe | null = null;
  /** Memoised after init: getPlatform() and the probes are read once. */
  const probe = (): Probe | null => {
    if (!opts.initialized()) return null;
    if (probed) return probed;
    const sdk = opts.sdk();
    const apis = opts.apis();
    probed = {
      api: probeRankingApi(sdk, apis),
      overlay: overlayViewsSupported(sdk, apis),
      groups: groupsSupported(sdk, apis),
      payments: paymentsSupported(sdk, apis),
    };
    return probed;
  };

  const caps = (): RankingCaps => {
    const p = probe();
    return p ? rankingCaps(p.api, opts.boards, p.overlay, c.rank.overlayPlacement) : NO_CAPS;
  };

  let real: Real | null = null;
  let loading: Promise<Real | null> | null = null;
  const paymentWaiters: (() => void)[] = [];

  /** Loads the chunk once (bounded by chunks.timeoutMs) and builds the real providers. null on failure. */
  const load = (): Promise<Real | null> => {
    if (real) return Promise.resolve(real);
    if (loading) return loading;
    const p = probe();
    if (!p) return Promise.resolve(null);
    const attempt = (async (): Promise<Real | null> => {
      const mod = await within(timers, opts.load(), c.chunks.timeoutMs, () => null);
      if (!mod) return null;
      const sdk = opts.sdk();
      const overlays = p.overlay ? mod.createFbOverlayViews(sdk, { timers, config: c, ...(opts.doc ? { doc: opts.doc } : {}) }) : null;
      const built: Real = {
        ranking: mod.createFbRanking(sdk, { boards: opts.boards, timers, overlays, config: c }),
        groups: p.groups ? mod.createFbGroups(sdk, { timers, config: c }) : null,
        payments: p.payments ? mod.createFbPayments(sdk, { timers, config: c }) : null,
      };
      real = built;
      if (built.payments) for (const cb of paymentWaiters.splice(0)) built.payments.onReady(cb);
      return built;
    })().catch(() => null);
    loading = attempt;
    void attempt.then((r) => {
      if (!r && loading === attempt) loading = null; // a later call tries again
    });
    return attempt;
  };

  /** Runs `fn` on the real providers within `ms` (the chunk load counts), else `fallback`. Never rejects. */
  const via = <T>(fn: (r: Real) => Promise<T>, fallback: T, ms: number = deadline): Promise<T> =>
    within(
      timers,
      load().then((r) => (r ? fn(r) : fallback)),
      ms,
      () => fallback,
    ).catch(() => fallback);

  const hasBoard = (board: BoardKey): boolean => caps().global && typeof opts.boards[board] === 'string';

  const ranking: RankingProvider = {
    caps,
    submit: (board, score) => (hasBoard(board) ? via((r) => r.ranking.submit(board, score), 'error' as const) : Promise.resolve('unsupported')),
    mine: (board) => (hasBoard(board) && caps().myRank ? via((r) => r.ranking.mine(board), null) : Promise.resolve(null)),
    top: (board, n, keep) => (hasBoard(board) ? via((r) => r.ranking.top(board, n, keep), []) : Promise.resolve([])),
    async showList(board, view, rect) {
      if (!hasBoard(board) || !caps().overlay) return null;
      // Only the chunk load is bounded here: the real call has its own deadline and closes a late view itself.
      const r = await within(timers, load(), deadline, () => null).catch(() => null);
      return r ? r.ranking.showList(board, view, rect) : null;
    },
    // FB2B-6: unknown until the chunk has answered for the board (then its LEADERBOARD_NOT_FOUND latch).
    supports: (board) => hasBoard(board) && real?.ranking.supports?.(board) !== false,
  };

  // No deadline on create(): it waits on FB's dialog. The chunk load inside is bounded by chunks.timeoutMs.
  const groups: GroupProvider = {
    create: (endTimeMs, title) => load().then((r) => (r?.groups ? r.groups.create(endTimeMs, title) : null)).catch(() => null),
    current: () => via((r) => (r.groups ? r.groups.current() : Promise.resolve(null)), null),
    post: (score) => via((r) => (r.groups ? r.groups.post(score) : Promise.resolve(false)), false),
  };

  const payments: PaymentsProvider = {
    ready: () => real?.payments?.ready() ?? false,
    onReady(cb) {
      if (real?.payments) real.payments.onReady(cb);
      else paymentWaiters.push(cb);
    },
    catalog: () => load().then((r) => (r?.payments ? r.payments.catalog() : [])).catch(() => []),
    // No deadline on purchase(): FB's payment dialog (ready() already implies the chunk is loaded).
    purchase: (id, payload) =>
      load()
        .then((r) => (r?.payments ? r.payments.purchase(id, payload) : ({ ok: false, reason: 'not_ready' } as const)))
        .catch(() => ({ ok: false, reason: 'error' }) as const),
    purchases: () => load().then((r) => (r?.payments ? r.payments.purchases() : null)).catch(() => null),
    consume: (token) => load().then((r) => (r?.payments ? r.payments.consume(token) : false)).catch(() => false),
  };

  return {
    ranking,
    groups: () => (probe()?.groups ? groups : undefined),
    payments: () => (probe()?.payments ? payments : undefined),
    overlayViews: () => probe()?.overlay ?? false,
    preload() {
      const p = probe();
      if (!p) return;
      if (caps().global || p.overlay || p.groups || p.payments) void load();
    },
  };
}
