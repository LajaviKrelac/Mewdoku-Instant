// Owner: lead (Phase 2b: frozen after F0; changes go through the lead. Never rename or remove a key).
// GameConfig: every tunable (02 §3 plus values referenced in 02/03/04/05). Single source of truth.
// This module is a LEAF: it imports nothing, so every layer (engine scripts, game, platform, ui, app)
// may import it. Functions that depend on config should take `c: GameConfig = cfg` so tests can
// pass a variant built with mergeConfig().

// Phase 2b (docs/phase2b/parity-spec.md §10): F0 added every new key below with the spec's values.
// After F0 this file is frozen for workstreams A–E: value changes go through the lead.

/** The 17 locales of phase2b §6.2 (BCP 47 ids; FB `ll_CC` codes are mapped onto them by i18n/locale.ts, §6.3). */
export type LocaleId =
  | 'en' | 'es' | 'pt-BR' | 'fr' | 'de' | 'it' | 'id' | 'tr' | 'pl'
  | 'ru' | 'vi' | 'th' | 'ja' | 'ko' | 'zh-Hans' | 'hi' | 'ar';
/** FB in-app product ids (phase2b §8.3): our own, lowercase. Prices live in the FB dashboard. */
export type ProductId = 'remove_ads' | 'hints_15' | 'kitties_8' | 'fish_250' | 'fish_900';
/** Interstitial triggers (02 §13.2 + phase2b §3.2 `event_next`). Mirrors platform InterstitialPlacement. */
export type InterstitialTrigger = 'next_level' | 'retry' | 'daily_done' | 'event_next';
/** Rewarded placements (02 §13.3 + phase2b §5.6 `group_double`). Mirrors platform RewardedPlacement. */
export type RewardedPlacementId = 'hint' | 'kitty' | 'revive' | 'group_double';
/** Screens that may carry an FB banner (phase2b §3.2). Never the game screen. */
export type BannerScreen = 'home' | 'victory' | 'event';

/** One IAP catalogue row (phase2b §8.3): what a purchase of `id` grants. */
export interface IapProductDef {
  readonly id: ProductId;
  /** The No Ads entitlement (purchases.noAds, §8.4). */
  readonly noAds?: boolean;
  readonly hints?: number;
  readonly kitties?: number;
  readonly fish?: number;
}

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
      /** Where an interstitial may show (02 §13.2). phase2b §3.2 adds `event_next` (lead-approved widening). */
      readonly triggers: readonly InterstitialTrigger[];
    };
    readonly rewarded: {
      readonly resetsInterstitialClock: boolean;
      /** Every rewarded placement in use (phase2b §3.2, §5.6: + `group_double`). */
      readonly placements: readonly RewardedPlacementId[];
    };
    /**
     * FB banners (phase2b §3.2). `enabled` is true from 2b, but a banner still needs the capability
     * (both loadBannerAdAsync and hideBannerAdAsync) and VITE_FB_PLACEMENT_BANNER. Never during play.
     */
    readonly banner: {
      readonly enabled: boolean;
      /** Banners only once progress.completed ≥ this [DECISION: default, user may change] (§3.2). */
      readonly fromCompletedLevels: number;
      /** The only screens that may show a banner [DECISION: default, user may change] (§3.2). */
      readonly screens: readonly BannerScreen[];
      /** loadBannerAdAsync position argument (§3.2; G4 verifies the values). */
      readonly position: 'bottom';
      /** Bottom band reserved on a banner screen: the 50 px banner + 8 px (plus safeBottom), §3.2. */
      readonly reservePx: number;
      /** Skip the banner on a screen when the last load was less than this ago (Meta's limit is 45 s), §3.2. */
      readonly minReloadSec: number;
      /** Primary buttons sit at least this far above the reserved band (§2.5, §3.2). */
      readonly buttonClearancePx: number;
    };
    readonly unsupportedFallback: { readonly cooldownSec: number };
    /** Dev/e2e mock ad overlay length (04 §6.2). */
    readonly mock: { readonly durationMs: number };
    /** FB adapter: delays before re-loading an ad instance after consecutive load failures; after the
     *  last one it waits for the next preload()/show request (05 §6.2, no tight reload loop). */
    readonly reloadDelaysMs: readonly number[];
    /**
     * FB adapter: an instance whose loadAsync() has not settled after this long is dropped and
     * counts as a failed load (reload backoff), so a load that never settles cannot block that ad
     * kind for the session (PLAT-6). Longer than readyTimeoutMs. [platform addition]
     */
    readonly loadTimeoutMs: number;
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
    /**
     * Per-attempt cap for a pack or daily-month request: one that has not answered by then counts as
     * a failed attempt (retry, then substitute / generated daily), so it can never hang (04 §8). [app addition]
     */
    readonly fetchTimeoutMs: number;
  };
  readonly fx: {
    /**
     * Board entry cap (phase2b §2.9): START is dispatched at entryEndMs(n) =
     * boardEntryWaveStartMs + (2n−2) × stagger + boardEntryTileMs, never later than this. Was 250.
     */
    readonly boardEntryMs: number;
    /**
     * Upper bound of the per-DIAGONAL tile stagger of the entry wave (phase2b §2.9): tile (r, c)
     * starts at boardEntryWaveStartMs + (r + c) × stagger, where
     * stagger = min(boardEntryStaggerMs, boardEntryWaveBudgetMs / (2n − 2)). (Phase 2: per row, 8.)
     */
    readonly boardEntryStaggerMs: number;
    /** Board card rise + fade at entry (phase2b §2.9). */
    readonly boardEntryCardMs: number;
    readonly boardEntryRisePx: number;
    /** First tile of the diagonal wave starts this long after the entry begins (§2.9). */
    readonly boardEntryWaveStartMs: number;
    /** One tile's scale-in (0.6 → 1.04 → 1; the scales are CSS-only constants), §2.9. */
    readonly boardEntryTileMs: number;
    /** The whole wave's stagger budget, spread over the 2n − 2 diagonals (§2.9). */
    readonly boardEntryWaveBudgetMs: number;
    /** Screen transitions (phase2b §2.9, router): outgoing fade (+ scale to 0.98 into a game). */
    readonly screenOutMs: number;
    /** Incoming slide-up + fade into a game screen, after screenInDelayMs (§2.9). */
    readonly screenInMs: number;
    readonly screenInDelayMs: number;
    readonly screenSlidePx: number;
    /**
     * Incoming fade when leaving a game (game → Home, game → event), §2.9 table row 2.
     * [F0 addition: the spec gives 200 ms in prose only]
     */
    readonly screenBackInMs: number;
    /** Reduced-motion crossfade for every screen transition and the victory screen (§2.7, §2.9). */
    readonly screenReducedMs: number;
    /** Heart break (phase2b §2.9): shake, crack, falling halves and shards. Replaces the 400 ms crack. */
    readonly heartBreakMs: number;
    /** Board-cat idle breathing (phase2b §2.9): scale 1 → 1 + catBreatheScale → 1, phase from cellNoise. */
    readonly catBreatheMs: number;
    readonly catBreatheScale: number;
    /** Board-cat ear flick: the cat-ear-flick overlay, every earFlickMinMs…earFlickMaxMs per cat (§2.9). */
    readonly earFlickMinMs: number;
    readonly earFlickMaxMs: number;
    readonly earFlickMs: number;
    /** Home mascot head tilt timer (A, mascot.ts), every Min…Max ms (phase2b §2.9). */
    readonly mascotHeadTiltMinMs: number;
    readonly mascotHeadTiltMaxMs: number;
    /** Victory screen sun rays: one full turn (phase2b §2.5); static with reduced motion. */
    readonly victoryRaysTurnMs: number;
    /** The post-win flow (phase2b §2.2, §2.3, §2.6, §2.7). t = 0 is the WON event. */
    readonly win: {
      /** Solved-board glow (§2.2): fade in, then settle to glowSettleOpacity; staggered in row order. */
      readonly glowInMs: number;
      readonly glowSettleMs: number;
      readonly glowStaggerMs: number;
      readonly glowSettleOpacity: number;
      /** `.cell__glow` size as a multiple of the slot (A styles it, §1.10). */
      readonly glowScale: number;
      /** In-game fish pill fades in (centred in the pills row) at this t, showing the pre-win count. */
      readonly fishPillInAtMs: number;
      readonly fishPillFadeMs: number;
      /** Fish k (0..2) pops at its source cat at fishAtMs + k × fishStaggerMs (§2.2). */
      readonly fishAtMs: number;
      readonly fishStaggerMs: number;
      readonly fishPopMs: number;
      /** Pause between the pop and the flight. */
      readonly fishHoldMs: number;
      readonly fishFlightMs: number;
      /** Flight path (§2.3): control point lifted by fishArcLift × |ST|, spread −/0/+ fishArcSpread per fish. */
      readonly fishArcLift: number;
      readonly fishArcSpread: number;
      /** The flight path is sampled at this many WAAPI keyframes (§2.3). [F0 addition: prose value] */
      readonly fishPathSamples: number;
      readonly fishEndScale: number;
      /** Fish element size: fishSizeFraction × slot, clamped to fishMinPx…fishMaxPx (§2.3). */
      readonly fishSizeFraction: number;
      readonly fishMinPx: number;
      readonly fishMaxPx: number;
      readonly fishTrailDots: number;
      readonly fishTrailMs: number;
      /** Pill icon bump on each arrival (§2.2). */
      readonly counterBumpMs: number;
      /** "+3" label above the pill: rise and fade. */
      readonly plusLabelMs: number;
      readonly plusLabelRisePx: number;
      /** Hard or daily bonus label "+2" (§2.8). */
      readonly bonusLabelAtMs: number;
      /** Scrim before the ranking panel (§2.2). */
      readonly scrimAtMs: number;
      readonly scrimFadeMs: number;
      /** First-run tutorial: no ranking; victory at this t (§2.6). */
      readonly tutorialVictoryAtMs: number;
      /** Tutorial replay: no fish, no ranking; victory at this t (§2.6). */
      readonly replayVictoryAtMs: number;
      /** Reduced-motion timeline (§2.7). */
      readonly reduced: {
        /** The ranking panel fades in at this t. */
        readonly rankingAtMs: number;
        /** The panel accepts a tap this long after it opened. */
        readonly tapMinMs: number;
        /** Static glow fade-in at t = winHappyDelayMs. [F0 addition: prose value, §2.7] */
        readonly glowInMs: number;
        /** "+3" label fade in, then out. [F0 addition: prose values, §2.7] */
        readonly plusLabelInMs: number;
        readonly plusLabelOutMs: number;
      };
    };
    readonly winHappyDelayMs: number;
    /** First post-win overlay: the ranking panel at 4.5 s (phase2b §2.2; was 800 for O3). */
    readonly winOverlayDelayMs: number;
    /** The victory screen's primary button turns active this long after it shows (phase2b §2.2; was 1000). */
    readonly winButtonDelayMs: number;
    readonly failOverlayDelayMs: number;
    readonly failButtonDelayMs: number;
    readonly sadCatsMs: number;
    readonly catDropMs: number;
    readonly markDrawMs: number;
    readonly wrongShakeMs: number;
    readonly shakePx: number;
    /** Phase 2 heart crack; kept in 2b for the falling halves of the heart break (phase2b §2.9). */
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
    /**
     * FB: after a failed or timed-out boot read, the cloud copy is read again in the background on
     * this schedule (the last delay repeats) until it arrives; the app then merges it and cloud
     * writes start (05 §7 "the cloud merge follows", PLAT-1). [platform addition]
     */
    readonly cloudLateRetryDelaysMs: readonly number[];
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
    /** Each arriving fish's "plink" is this many semitones above the previous one (phase2b §2.2). */
    readonly fishPlinkStepSemitones: number;
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
    /** One pulse per arriving fish (phase2b §2.2). */
    readonly fish: number;
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
    /** Tile corner radius as a fraction of the slot (phase2b §1.5: 0.2). */
    readonly cellRadiusFraction: number;
    /** @deprecated phase2b §1.8: region-aware insets are deleted; not read after 2b. Use insetPx / insetSmallPx. */
    readonly insetSamePx: number;
    /** @deprecated phase2b §1.8: region-aware insets are deleted; not read after 2b. Use insetPx / insetSmallPx. */
    readonly insetDiffPx: number;
    /** Even gutters (phase2b §1.5): every tile inset this much on all sides (a 4 px gutter) … */
    readonly insetPx: number;
    /** … or this much (a 3 px gutter) when the slot is below insetSmallBelowSlot. */
    readonly insetSmallPx: number;
    readonly insetSmallBelowSlot: number;
    /** Cat size as a fraction of the slot (phase2b §1.5: 0.84). */
    readonly catScale: number;
    /** X mark size: path a→100−a with a = (1 − markScale)/2 × 100 (phase2b §1.5: 0.54 → 23…77). */
    readonly markScale: number;
    /** White X stroke on the 100-unit box ÷ 100 (phase2b §1.5: 12 units). */
    readonly markStrokeFraction: number;
    /** X opacity: 1 = the white X (phase2b §1.5). The 0.7 dark-ink X is retired (§1.8). */
    readonly markOpacity: number;
    /** X edge underlay: extra stroke per side ÷ 100 (12 + 2 × 4 = 20 units), phase2b §1.5. */
    readonly markEdgeFraction: number;
    /** X edge colour: mixHex(tile, --ink, markEdgeMix) per palette index (ui/art/palette.ts xEdgeColor), §1.5. */
    readonly markEdgeMix: number;
    readonly wrongRingPx: number;
    readonly patternScale: number;
    readonly focusRingPx: number;
    readonly hintDim: number;
    /** Colour-pattern glyph opacity (--ink) on a tile, and on a faded (done) tile: both ≥ 3:1 (02 §18, palette-check). [ui addition] */
    readonly patternOpacity: number;
    readonly patternOpacityDone: number;
    /** Smallest drawn glyph box (CSS px): small slots scale the 22 % glyph up to this (11×11 / 12×12 on phones). [ui addition] */
    readonly patternMinPx: number;
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
    /**
     * Longest wait for the current level's pack at launch (04 §5.1 ensurePackFor). The fetch goes on
     * in the background and getLevel() waits for it behind the loading indicator (RP-1). [boot addition]
     */
    readonly packTimeoutMs: number;
    /** platform.init() / start() are retried once after this delay before boot gives up (PLAT-8). [boot addition] */
    readonly platformRetryDelayMs: number;
    /**
     * First run only: longest wait for the lazy overlay chunk (it holds the tutorial coach, O8), side
     * by side with the pack and font waits, so the first board shows with its coach (04 §9). [boot addition]
     */
    readonly overlayTimeoutMs: number;
  };
  /** Loading indicator (lead decision, Phase 2 integration). [app addition] */
  readonly loading: {
    /** Opening a level or daily that takes longer than this (pack fetch, on-device generation) shows the indicator. */
    readonly indicatorDelayMs: number;
    /** Last resort: a level or daily still not ready after this goes back Home with a toast (04 §8). [app addition] */
    readonly failSafeMs: number;
  };
  /** Lazy JS chunks (04 §9): a failed import is retried with a cache-busting URL (04 §8). [app addition] */
  readonly chunks: {
    /** Backoff before each retry; its length is the number of retries. */
    readonly retryDelaysMs: readonly number[];
    /** Per-attempt cap, so a stalled download cannot hang the caller. */
    readonly timeoutMs: number;
  };
  /** Engine worker (04 §5.5). [app addition] */
  readonly worker: {
    /** Deadline for the worker's start-up and for each call; on expiry the worker is dropped and work runs on the main thread. */
    readonly callTimeoutMs: number;
  };
  /** Fish, the soft currency (phase2b §2.8). Three fish per win; bonuses add a number, not more fish. */
  readonly fish: {
    readonly perWin: number;
    readonly hardBonus: number;
    readonly dailyBonus: number;
    /** First-run tutorial (the replay earns nothing). */
    readonly tutorial: number;
    /** Group challenge, rank mode: non-winners with wins ≥ 1 (phase2b §5.6). */
    readonly groupParticipation: number;
    /** Wallet cap. */
    readonly max: number;
  };
  /** Fish swaps [DECISION: default, user may change] (phase2b §2.8, §8.5). Revives are never for sale. */
  readonly shop: {
    readonly hintFish: number;
    readonly kittyFish: number;
  };
  /** Paw points per win (phase2b §5.3): every result is a multiple of 5. */
  readonly points: {
    /** Base = perSize × n. */
    readonly perSize: number;
    /** Hard level: base × hardMultiplier. */
    readonly hardMultiplier: number;
    /** 0 mistakes and 0 revives. */
    readonly flawless: number;
    /** 0 hints and 0 kitties. */
    readonly unaided: number;
    readonly daily: number;
    readonly event: number;
    /** points.total cap (scores stay < 2³¹). */
    readonly max: number;
  };
  /** Limited-time events (phase2b §4). Times use the device clock. */
  readonly events: {
    /** teaserEvent(): the next event within this many hours shows a "Starts in" card (§4.4). */
    readonly teaseHours: number;
    /** The card says "Ends soon!" in the last this-many hours (§4.6). */
    readonly cardEndsSoonHours: number;
  };
  /** Rankings (phase2b §2.4, §5). Never fabricate a player, rank, score or row. */
  readonly rank: {
    /** Deadline for every provider call, counted from WON (§2.2, §5.4). */
    readonly fetchTimeoutMs: number;
    /** Rows shown in the panel list. */
    readonly topCount: number;
    /** Entries fetched for the overlay list. */
    readonly fetchCount: number;
    readonly panelPopMs: number;
    readonly panelOutMs: number;
    /** The panel accepts a tap/Enter/Space/Esc this long after it opened (§2.2 t = 5 700). */
    readonly panelTapMinMs: number;
    /** "Tap to keep going" pulse (opacity .55 ↔ 1 is CSS-only). */
    readonly tapPulseMs: number;
    /** Client-side sanity limits (§5.3): at most one submission per interval; solves outside min…max are not submitted. */
    readonly submitMinIntervalMs: number;
    readonly minSolveMs: number;
    readonly maxSolveMs: number;
    /** daily_fastest dayIndex = whole days from this date to the daily's date key (§5.3). */
    readonly dailyEpoch: string;
    /** Board keys (§5.3): event boards are eventPrefix + the event id with '-' → '_'. */
    readonly boards: { readonly points: 'paw_points'; readonly daily: 'daily_fastest'; readonly eventPrefix: 'event_' };
    /** Where the FB overlay list goes: 'fullscreen' until §14 G3 shows a rect placement works. */
    readonly overlayPlacement: 'fullscreen' | 'rect';
    /** Without a provider (web) the panel still shows, with personal records (§2.4). */
    readonly showPanelWithoutProvider: boolean;
  };
  /** Group challenges (FB tournaments, phase2b §5.6), behind flag groupChallenges. */
  readonly groups: {
    readonly durationH: number;
    /** 'participation' (default; needs no standings API) or 'rank' (only if §14 G2 finds one). */
    readonly rewardMode: 'participation' | 'rank';
    readonly minWinsForReward: number;
    readonly rewardKitties: number;
    /** Total with the rewarded video (not rewardKitties + this). */
    readonly rewardKittiesWithAd: number;
    /** Rows shown (overlay view only). */
    readonly maxShown: number;
    /** save.groups entries kept (oldest endsAt dropped). */
    readonly keep: number;
  };
  /** FB payments (phase2b §8). */
  readonly iap: {
    /** The shop shows "Getting the shop ready…" this long before shop.unavailable (§8.4). */
    readonly readyTimeoutMs: number;
    readonly catalogCacheMs: number;
    /** purchases.tokens ledger length (newest kept). */
    readonly tokensKept: number;
    /** true: record, grant, save, then consume (§8.4). false: consume first (G5 fallback). */
    readonly grantBeforeConsume: boolean;
    /** 'consume': No Ads consumed and kept as purchases.noAds. 'keep': never consumed (G5 alternative). */
    readonly removeAdsMode: 'consume' | 'keep';
    readonly products: readonly IapProductDef[];
  };
  /** Localization (phase2b §6). */
  readonly i18n: {
    /** Every locale with a catalogue; dev, e2e and web preview builds bundle all of them (§6.7). */
    readonly locales: readonly LocaleId[];
    readonly fallback: LocaleId;
    /** Right-to-left locales (§6.5). */
    readonly rtl: readonly LocaleId[];
    /** After start(), the resolved locale's chunk may delay the first route this long (§6.3). */
    readonly localeTimeoutMs: number;
    /**
     * The locales a release build (`--mode release` / `release-fbig`) bundles [DECISION: default,
     * user may change] (§6.7). Always includes 'en'; a locale joins when the user approves it.
     */
    readonly releaseLocales: readonly LocaleId[];
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
      triggers: ['next_level', 'retry', 'daily_done', 'event_next'],
    },
    rewarded: { resetsInterstitialClock: true, placements: ['hint', 'kitty', 'revive', 'group_double'] },
    banner: {
      enabled: true,
      fromCompletedLevels: 10,
      screens: ['home', 'victory', 'event'],
      position: 'bottom',
      reservePx: 58,
      minReloadSec: 60,
      buttonClearancePx: 16,
    },
    unsupportedFallback: { cooldownSec: 600 },
    mock: { durationMs: 1500 },
    reloadDelaysMs: [5000, 30_000, 120_000],
    loadTimeoutMs: 12_000,
  },
  daily: { unlockAfterLevel: 20, firstPackMonth: '2026-10' },
  levels: {
    shipped: 1000,
    hardEvery: 10,
    hardFrom: 30,
    prefetchAhead: 20,
    packSize: 100,
    fetchRetryDelaysMs: [500, 2000],
    fetchTimeoutMs: 5000,
  },
  fx: {
    boardEntryMs: 700,
    boardEntryStaggerMs: 18,
    boardEntryCardMs: 250,
    boardEntryRisePx: 24,
    boardEntryWaveStartMs: 80,
    boardEntryTileMs: 220,
    boardEntryWaveBudgetMs: 400,
    screenOutMs: 160,
    screenInMs: 240,
    screenInDelayMs: 80,
    screenSlidePx: 16,
    screenBackInMs: 200,
    screenReducedMs: 120,
    heartBreakMs: 700,
    catBreatheMs: 2800,
    catBreatheScale: 0.02,
    earFlickMinMs: 8000,
    earFlickMaxMs: 14_000,
    earFlickMs: 160,
    mascotHeadTiltMinMs: 6000,
    mascotHeadTiltMaxMs: 10_000,
    victoryRaysTurnMs: 20_000,
    win: {
      glowInMs: 300,
      glowSettleMs: 600,
      glowStaggerMs: 40,
      glowSettleOpacity: 0.7,
      glowScale: 1.3,
      fishPillInAtMs: 1000,
      fishPillFadeMs: 200,
      fishAtMs: 1200,
      fishStaggerMs: 150,
      fishPopMs: 220,
      fishHoldMs: 250,
      fishFlightMs: 800,
      fishArcLift: 0.35,
      fishArcSpread: 0.1,
      fishPathSamples: 12,
      fishEndScale: 0.6,
      fishSizeFraction: 0.5,
      fishMinPx: 22,
      fishMaxPx: 36,
      fishTrailDots: 5,
      fishTrailMs: 300,
      counterBumpMs: 360,
      plusLabelMs: 700,
      plusLabelRisePx: 24,
      bonusLabelAtMs: 2900,
      scrimAtMs: 4200,
      scrimFadeMs: 300,
      tutorialVictoryAtMs: 3300,
      replayVictoryAtMs: 1200,
      reduced: { rankingAtMs: 1200, tapMinMs: 600, glowInMs: 150, plusLabelInMs: 150, plusLabelOutMs: 600 },
    },
    winHappyDelayMs: 300,
    winOverlayDelayMs: 4500,
    winButtonDelayMs: 600,
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
    cloudLateRetryDelaysMs: [5000, 15_000, 30_000, 60_000],
  },
  timer: { tickMs: 1000 },
  hint: { mainThreadBudgetMs: 30 },
  audio: { masterDb: -12, markPitchJitter: 0.03, fishPlinkStepSemitones: 2 },
  haptics: {
    mark: 6,
    cat: 14,
    mistake: [30, 40, 30],
    heartLast: 60,
    win: [20, 30, 20, 30, 40],
    kitty: 14,
    ui: 4,
    fish: 8,
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
    boardPad: 10,
    boardRadius: 18,
    compactHeight: 640,
    compactPills: 36,
    compactChips: 36,
    fbSafeZonePx: 64,
    rotateMaxHeight: 480,
    minViewportW: 320,
    minViewportH: 568,
    cellRadiusFraction: 0.2,
    insetSamePx: 1.5,
    insetDiffPx: 3.5,
    insetPx: 2,
    insetSmallPx: 1.5,
    insetSmallBelowSlot: 30,
    catScale: 0.84,
    markScale: 0.54,
    markStrokeFraction: 0.12,
    markOpacity: 1,
    markEdgeFraction: 0.04,
    markEdgeMix: 0.7,
    wrongRingPx: 2,
    patternScale: 0.22,
    focusRingPx: 3,
    hintDim: 0.55,
    patternOpacity: 0.85,
    patternOpacityDone: 0.65,
    patternMinPx: 7,
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
  boot: { fontTimeoutMs: 1500, restoreTimeoutMs: 1500, packTimeoutMs: 1500, platformRetryDelayMs: 1000, overlayTimeoutMs: 1500 },
  loading: { indicatorDelayMs: 300, failSafeMs: 25_000 },
  chunks: { retryDelaysMs: [500, 1500], timeoutMs: 8000 },
  worker: { callTimeoutMs: 10_000 },
  fish: { perWin: 3, hardBonus: 2, dailyBonus: 2, tutorial: 3, groupParticipation: 10, max: 999_999 },
  shop: { hintFish: 15, kittyFish: 30 },
  points: { perSize: 5, hardMultiplier: 2, flawless: 10, unaided: 10, daily: 15, event: 5, max: 2_000_000_000 },
  events: { teaseHours: 72, cardEndsSoonHours: 48 },
  rank: {
    fetchTimeoutMs: 3000,
    topCount: 10,
    fetchCount: 50,
    panelPopMs: 260,
    panelOutMs: 200,
    panelTapMinMs: 1200,
    tapPulseMs: 1400,
    submitMinIntervalMs: 10_000,
    minSolveMs: 3000,
    maxSolveMs: 86_400_000,
    dailyEpoch: '2026-01-01',
    boards: { points: 'paw_points', daily: 'daily_fastest', eventPrefix: 'event_' },
    overlayPlacement: 'fullscreen',
    showPanelWithoutProvider: true,
  },
  groups: {
    durationH: 72,
    rewardMode: 'participation',
    minWinsForReward: 3,
    rewardKitties: 2,
    rewardKittiesWithAd: 4,
    maxShown: 8,
    keep: 10,
  },
  iap: {
    readyTimeoutMs: 5000,
    catalogCacheMs: 600_000,
    tokensKept: 50,
    grantBeforeConsume: true,
    removeAdsMode: 'consume',
    products: [
      { id: 'remove_ads', noAds: true },
      { id: 'hints_15', hints: 15 },
      { id: 'kitties_8', kitties: 8 },
      { id: 'fish_250', fish: 250 },
      { id: 'fish_900', fish: 900 },
    ],
  },
  i18n: {
    locales: ['en', 'es', 'pt-BR', 'fr', 'de', 'it', 'id', 'tr', 'pl', 'ru', 'vi', 'th', 'ja', 'ko', 'zh-Hans', 'hi', 'ar'],
    fallback: 'en',
    rtl: ['ar'],
    localeTimeoutMs: 1200,
    releaseLocales: ['en'],
  },
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
