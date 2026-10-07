// Owner: foundation (ADDITIVE-SHARED: append new keys only; never rename or remove).
// GameConfig: every tunable (02 §3 plus values referenced in 02/03/04/05). Single source of truth.
// This module is a LEAF: it imports nothing, so every layer (engine scripts, game, platform, ui, app)
// may import it. Functions that depend on config should take `c: GameConfig = cfg` so tests can
// pass a variant built with mergeConfig().

/** Interstitial cooldown by player tenure (02 §13.2): the row with the largest fromDay ≤ tenure applies. */
export interface CooldownStep {
  readonly fromDay: number;
  readonly sec: number;
}

export interface GameConfig {
  readonly hearts: { readonly perAttempt: number };
  readonly input: {
    readonly doubleTapMs: number;
    /** dragStartPx = max(dragStartMinPx, dragStartCellFraction × cellPx) — use dragStartPx(). */
    readonly dragStartMinPx: number;
    readonly dragStartCellFraction: number;
    readonly cellLockAfterCatMs: number;
    /** Mark sound throttle while painting (02 §16, 04 §5.4). */
    readonly paintSoundThrottleMs: number;
  };
  readonly hints: { readonly startStock: number; readonly perRewardedAd: number };
  readonly kitty: { readonly startStock: number; readonly perRewardedAd: number; readonly revealMs: number };
  readonly revive: { readonly maxPerAttempt: number; readonly heartsRestored: number };
  readonly ads: {
    readonly enabled: boolean;
    readonly readyTimeoutMs: number;
    readonly showWatchdogMs: number;
    readonly interstitial: {
      readonly minCompletedLevels: number;
      readonly cooldownSec: readonly CooldownStep[];
      readonly sessionGraceSec: number;
      readonly triggers: readonly ('next_level' | 'retry' | 'daily_done')[];
    };
    readonly rewarded: { readonly resetsInterstitialClock: boolean };
    readonly banner: { readonly enabled: boolean };
    readonly unsupportedFallback: { readonly cooldownSec: number };
    /** Dev/e2e mock ad overlay length (04 §6.2). */
    readonly mock: { readonly durationMs: number };
    /** FB adapter: delays before re-loading an ad instance after consecutive load failures; after the
     *  last one it waits for the next preload()/show request (05 §6.2, no tight reload loop). */
    readonly reloadDelaysMs: readonly number[];
  };
  readonly daily: {
    readonly unlockAfterLevel: number;
    /** First month with a generated daily pack (03 §8.6). */
    readonly firstPackMonth: string;
  };
  readonly levels: {
    readonly shipped: number;
    readonly hardEvery: number;
    readonly hardFrom: number;
    readonly prefetchAhead: number;
    /** Levels per pack file; pack k holds levels k*packSize+1 … (k+1)*packSize (03 §9.3). */
    readonly packSize: number;
    /** Pack fetch retry delays before falling back to a substitute board (04 §8). */
    readonly fetchRetryDelaysMs: readonly number[];
  };
  readonly fx: {
    readonly boardEntryMs: number;
    readonly boardEntryStaggerMs: number;
    readonly winHappyDelayMs: number;
    readonly winOverlayDelayMs: number;
    readonly winButtonDelayMs: number;
    readonly failOverlayDelayMs: number;
    readonly failButtonDelayMs: number;
    readonly sadCatsMs: number;
    readonly catDropMs: number;
    readonly markDrawMs: number;
    readonly wrongShakeMs: number;
    readonly shakePx: number;
    readonly heartCrackMs: number;
    readonly regionFadeMs: number;
    /** Done regions are mixed this far toward --page (02 §17.4). */
    readonly regionFadeMix: number;
    readonly overlayFadeMs: number;
    /** Max fade length with reduced motion on (02 §17.5). */
    readonly reducedMotionFadeMs: number;
    readonly confettiMs: number;
    readonly confettiCount: number;
    readonly toastMs: number;
    readonly catBlinkMinMs: number;
    readonly catBlinkMaxMs: number;
  };
  readonly save: {
    readonly localDebounceMs: number;
    readonly cloudDebounceMs: number;
    readonly storageKey: string;
    readonly corruptKeyPrefix: string;
    readonly corruptKeep: number;
    /** FB player-data key (05 §7). */
    readonly cloudKey: string;
    /** setDataAsync NETWORK_FAILURE backoff (05 §7). */
    readonly cloudRetryDelaysMs: readonly number[];
    /** FB: getDataAsync wait at boot; on timeout the session keeps the local copy and skips cloud writes (05 §7). */
    readonly cloudLoadTimeoutMs: number;
  };
  readonly timer: { readonly tickMs: number };
  readonly hint: {
    /** p95 budget for main-thread getHintStep before moving to the worker (03 §6, §10). */
    readonly mainThreadBudgetMs: number;
  };
  readonly audio: {
    /** Master peak level in dBFS (02 §16). */
    readonly masterDb: number;
    readonly markPitchJitter: number;
  };
  /** navigator.vibrate patterns in ms (02 §16). */
  readonly haptics: {
    readonly mark: number;
    readonly cat: number;
    readonly mistake: readonly number[];
    readonly heartLast: number;
    readonly win: readonly number[];
    readonly kitty: number;
    readonly ui: number;
  };
  /** Responsive layout (02 §19) and board rendering (02 §17.4, §18). CSS px. */
  readonly layout: {
    readonly gutter: number;
    readonly colMax: number;
    readonly topBar: number;
    readonly pills: number;
    readonly chips: number;
    readonly tools: number;
    readonly toolsGap: number;
    readonly vGap: number;
    readonly vGapCount: number;
    readonly boardPad: number;
    readonly boardRadius: number;
    readonly compactHeight: number;
    readonly compactPills: number;
    readonly compactChips: number;
    readonly fbSafeZonePx: number;
    readonly rotateMaxHeight: number;
    readonly minViewportW: number;
    readonly minViewportH: number;
    readonly cellRadiusFraction: number;
    readonly insetSamePx: number;
    readonly insetDiffPx: number;
    readonly catScale: number;
    readonly markScale: number;
    readonly markStrokeFraction: number;
    readonly markOpacity: number;
    readonly wrongRingPx: number;
    readonly patternScale: number;
    readonly focusRingPx: number;
    readonly hintDim: number;
  };
  /** Offline generator and runtime substitute/endless generation (03 §4.5, §8.3). */
  readonly gen: {
    readonly maxAttempts: number;
    readonly repairMaxIter: number;
    /** Growth for 'mixed': eden when rng.int(edenOneIn) === 0 (25 %), else balanced. */
    readonly edenOneIn: number;
    readonly minRegionSize: number;
    readonly minRegionFromN: number;
    /** Levels ≤ this keep minRegion 1 (tutorial and levels ≤ 6). */
    readonly singleCellRegionsUpToLevel: number;
    readonly maxRegionFactor: number;
    /** Effort-sort noise: key = e × (noiseBase + rng.int(noiseSpan)) (03 §8.3). */
    readonly sortNoiseBase: number;
    readonly sortNoiseSpan: number;
    readonly version: string;
  };
  /** FBInstant.logEvent limits (05 §10, 02 §20). */
  readonly analytics: {
    readonly nameMin: number;
    readonly nameMax: number;
    readonly maxParams: number;
    readonly keyMin: number;
    readonly keyMax: number;
    readonly valueMaxLen: number;
  };
  /** Boot sequence caps (04 §5.1). [app addition] */
  readonly boot: {
    /** Longest wait for document.fonts.ready; the font never blocks boot on failure (04 §5.1). */
    readonly fontTimeoutMs: number;
    /** Longest wait for restore-rule validation at launch; slower checks run when the board is opened (02 §15). */
    readonly restoreTimeoutMs: number;
  };
  /** Loading indicator (lead decision, Phase 2 integration). [app addition] */
  readonly loading: {
    /** Opening a level or daily that takes longer than this (pack fetch, on-device generation) shows the indicator. */
    readonly indicatorDelayMs: number;
  };
}

export const cfg: GameConfig = deepFreeze({
  hearts: { perAttempt: 3 },
  input: {
    doubleTapMs: 300,
    dragStartMinPx: 8,
    dragStartCellFraction: 0.2,
    cellLockAfterCatMs: 300,
    paintSoundThrottleMs: 40,
  },
  hints: { startStock: 5, perRewardedAd: 1 },
  kitty: { startStock: 3, perRewardedAd: 1, revealMs: 600 },
  revive: { maxPerAttempt: 1, heartsRestored: 1 },
  ads: {
    enabled: true,
    readyTimeoutMs: 4000,
    showWatchdogMs: 120_000,
    interstitial: {
      minCompletedLevels: 10,
      cooldownSec: [
        { fromDay: 0, sec: 120 },
        { fromDay: 2, sec: 100 },
        { fromDay: 7, sec: 90 },
      ],
      sessionGraceSec: 60,
      triggers: ['next_level', 'retry', 'daily_done'],
    },
    rewarded: { resetsInterstitialClock: true },
    banner: { enabled: false },
    unsupportedFallback: { cooldownSec: 600 },
    mock: { durationMs: 1500 },
    reloadDelaysMs: [5000, 30_000, 120_000],
  },
  daily: { unlockAfterLevel: 20, firstPackMonth: '2026-10' },
  levels: {
    shipped: 1000,
    hardEvery: 10,
    hardFrom: 30,
    prefetchAhead: 20,
    packSize: 100,
    fetchRetryDelaysMs: [500, 2000],
  },
  fx: {
    boardEntryMs: 250,
    boardEntryStaggerMs: 8,
    winHappyDelayMs: 300,
    winOverlayDelayMs: 800,
    winButtonDelayMs: 1000,
    failOverlayDelayMs: 800,
    failButtonDelayMs: 600,
    sadCatsMs: 1500,
    catDropMs: 280,
    markDrawMs: 120,
    wrongShakeMs: 300,
    shakePx: 6,
    heartCrackMs: 400,
    regionFadeMs: 400,
    regionFadeMix: 0.45,
    overlayFadeMs: 200,
    reducedMotionFadeMs: 150,
    confettiMs: 1600,
    confettiCount: 40,
    toastMs: 2500,
    catBlinkMinMs: 3000,
    catBlinkMaxMs: 7000,
  },
  save: {
    localDebounceMs: 400,
    cloudDebounceMs: 3000,
    storageKey: 'mewdoku.save.v1',
    corruptKeyPrefix: 'mewdoku.save.corrupt.',
    corruptKeep: 2,
    cloudKey: 'save',
    cloudRetryDelaysMs: [1000, 3000, 10_000],
    cloudLoadTimeoutMs: 4000,
  },
  timer: { tickMs: 1000 },
  hint: { mainThreadBudgetMs: 30 },
  audio: { masterDb: -12, markPitchJitter: 0.03 },
  haptics: {
    mark: 6,
    cat: 14,
    mistake: [30, 40, 30],
    heartLast: 60,
    win: [20, 30, 20, 30, 40],
    kitty: 14,
    ui: 4,
  },
  layout: {
    gutter: 16,
    colMax: 480,
    topBar: 56,
    pills: 44,
    chips: 40,
    tools: 64,
    toolsGap: 16,
    vGap: 12,
    vGapCount: 4,
    boardPad: 12,
    boardRadius: 16,
    compactHeight: 640,
    compactPills: 36,
    compactChips: 36,
    fbSafeZonePx: 64,
    rotateMaxHeight: 480,
    minViewportW: 320,
    minViewportH: 568,
    cellRadiusFraction: 0.18,
    insetSamePx: 1.5,
    insetDiffPx: 3.5,
    catScale: 0.82,
    markScale: 0.52,
    markStrokeFraction: 0.1,
    markOpacity: 0.7,
    wrongRingPx: 2,
    patternScale: 0.22,
    focusRingPx: 3,
    hintDim: 0.55,
  },
  gen: {
    maxAttempts: 5000,
    repairMaxIter: 400,
    edenOneIn: 4,
    minRegionSize: 2,
    minRegionFromN: 6,
    singleCellRegionsUpToLevel: 6,
    maxRegionFactor: 2.5,
    sortNoiseBase: 90,
    sortNoiseSpan: 21,
    version: 'mewdoku-gen/1.0.0',
  },
  analytics: { nameMin: 2, nameMax: 40, maxParams: 25, keyMin: 2, keyMax: 40, valueMaxLen: 99 },
  boot: { fontTimeoutMs: 1500, restoreTimeoutMs: 1500 },
  loading: { indicatorDelayMs: 300 },
});

/** Drag threshold for a cell of `cellPx` CSS px: max(8, 0.2 × cellPx) (02 §3 input.dragStartPx). */
export function dragStartPx(cellPx: number, c: GameConfig = cfg): number {
  return Math.max(c.input.dragStartMinPx, c.input.dragStartCellFraction * cellPx);
}

/** Recursive partial, for config variants in tests. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Returns a new frozen config with `patch` deep-merged over `base` (arrays are replaced). */
export function mergeConfig(patch: DeepPartial<GameConfig>, base: GameConfig = cfg): GameConfig {
  return deepFreeze(mergeDeep(base, patch) as GameConfig);
}

function mergeDeep(base: unknown, patch: unknown): unknown {
  if (patch === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = mergeDeep(base[k], v);
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepFreeze<T>(o: T): T {
  if (typeof o === 'object' && o !== null && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
