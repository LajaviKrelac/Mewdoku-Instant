// Owner: C (Phase 2b; was app)
// Helper and ad flows of the session, exactly in the 04 §5.7 order (02 §9, §10.2, §13):
//   stock check → O2 → rewarded ad or free fallback → (+1 stock, saves.now) → engine → debit +
//   saves.now → dispatch. Interstitials: pacing gate → ad → lastAdAt; the transition always goes on.
// Phase 2c (G1, docs/phase2c/fish-lives-spec.md §5.4): O2 is back to the Phase 2 card (Watch video /
// Not now, free, countdown): fish are lives, so there is no "Swap 15 fish" and no wallet.
// No Ads (phase2b §8.3) turns interstitials off; rewarded ads stay (opt-in).
// A flow that needs a lazily loaded card (O1, O2) first checks router.overlaysReady(): when the chunk
// cannot be loaded it toasts and charges nothing, so the game stays playable (04 §8).
// Phase 2d (G1, docs/phase2d/look-spec.md §1.12, D-2d-12): the mouse helper. No stock: every use is
// O2 ('mouse') → one rewarded video, or the free fallback (sharing the hint / kitty cooldown, with
// its countdown) → pickMouseCells (seeded per attempt and use) → MOUSE → mouse_used.
// Phase 2d.1 (G1, docs/phase2d/helpers-spec.md §1.2, §1.5): the mouse visits its tiles one by one, so
// onMouse keeps the board and the tools locked (runBusy) for mouseRunMs(cells, reduced motion) after
// the dispatch; ending the session or leaving the board ends the run (alive() false). The per-attempt
// use count is readable (mouseUses) for the pulse rule (§4.6).
import type { RewardedVariant } from '../ui/overlays/rewarded-prompt';
import { interstitialGate, type InterstitialTrigger } from '../game/ad-pacing';
import { fallbackAvailable, fallbackReadyAt, grant, recordAdShown, recordFallbackGrant, spend } from '../game/economy';
import { getMode } from '../game/modes';
import { hasMouseCandidate, mouseRunMs, mouseSeed, pickMouseCells } from '../game/mouse';
import { canRevive } from '../game/reducer';
import { encodeCells } from '../game/save';
import { tutorialAllowsTool } from '../game/tutorial';
import type { Action, GameState, SaveData } from '../game/types';
import type { HintStep, PuzzleId } from '../engine/types';
import type { Capabilities, RewardedPlacement } from '../platform/types';
import type { EngineClient } from '../workers/engine-client';
import { t } from '../i18n';
import type { AdFlow } from './ad-flow';
import type { Clock } from './clock';
import type { GameConfig } from './config';
import type { AnalyticsEvent, AppBus } from './events';
import type { Router } from './router';
import type { SaveScheduler } from './saves';
import { levelParam } from './session-effects';
import type { SessionMeta } from './store';

/** The rewarded placements the helper flows serve (02 §13.3). */
export type HelperPlacement = Exclude<RewardedPlacement, 'group_double'>;
import { asTutorialStep } from './views';

/** What the helper flows need from the session. */
export interface HelperHost {
  readonly config: GameConfig;
  readonly clock: Clock;
  readonly bus: AppBus;
  readonly router: Router;
  readonly adFlow: AdFlow;
  readonly engine: EngineClient;
  readonly saves: SaveScheduler;
  readonly sessionStartedAt: number;
  capabilities(): Capabilities;
  game(): GameState | null;
  meta(): SessionMeta | null;
  save(): SaveData;
  updateSave(fn: (s: SaveData) => SaveData): void;
  dispatch(a: Action): void;
  /** Runs a flow with the board locked; `alive()` turns false when the session restarts or ends. */
  runBusy(fn: (alive: () => boolean) => Promise<void>): Promise<void>;
  busy(): boolean;
  toast(message: string): void;
  log(e: AnalyticsEvent): void;
  /** Dispatches HINT_OPEN and opens O1 (sound, announcement, analytics). */
  openHint(step: HintStep, charged: boolean): void;
  /** After KITTY: schedules KITTY_DONE in kitty.revealMs (unless the kitty's cat won). */
  afterKitty(): void;
  /** Phase 2d.1 §1.5: reduced motion is on (the mouse run then lasts fx.reducedMotionFadeMs). */
  reducedMotion(): boolean;
}

export interface HelperFlows {
  onBulb(): Promise<void>;
  onPaw(): Promise<void>;
  /**
   * Phase 2d §1.12: O2 → rewarded video (or the free fallback) → pickMouseCells → MOUSE. Nothing
   * happens when the mouse is off (cfg.mouse.enabled, the mode, the tutorial) or no tile is left to
   * cross out; nothing is dispatched when the player declines or the video fails.
   */
  onMouse(): Promise<void>;
  /** Phase 2d: a new attempt began (a new board or a Retry): the mouse's use counter (its seed) restarts. */
  newAttempt(): void;
  /** Phase 2d.1 §4.6: uses of the mouse in this attempt (the pulse stops once a helper was used). */
  mouseUses(): number;
  /** 'hint', 'kitty' and 'mouse' ask through O2 first; for 'revive' the O4 button is the prompt. */
  /** hint, kitty, revive and (phase 2d) mouse (02 §13.3). group_double has its own flow (group-flow.ts, phase2b §5.6). */
  rewardedOrFallback(p: HelperPlacement): Promise<boolean>;
  /** O4 Continue offer (02 §10.2): 'video', 'free' or hidden. */
  continueOffer(): 'video' | 'free' | null;
  /** Pacing gate, then the interstitial when allowed. Never throws; the caller continues afterwards. */
  interstitial(trigger: InterstitialTrigger): Promise<void>;
  /** Free-reopen cache (02 §9.1): cleared by board changes, Retry, Revive and leaving the game. */
  clearHintCache(): void;
}

interface HintCache {
  readonly puzzleId: PuzzleId;
  readonly key: string;
  readonly step: HintStep;
}

export function createHelperFlows(host: HelperHost): HelperFlows {
  const c = host.config;
  let hintCache: HintCache | null = null;

  const rewardedAvailable = (): boolean => c.ads.enabled && host.capabilities().rewarded;

  function stockChanged(): void {
    const { hints, kitties } = host.save().stock;
    host.bus.emit('stock', { hints, kitties });
  }

  /** O2 as a question (02 §13.3, phase2c §5.4): true = accept (never for the countdown variant), false = "Not now". */
  function askO2(placement: 'hint' | 'kitty' | 'mouse', variant: RewardedVariant): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      let off: () => void = () => undefined;
      const finish = (value: boolean): void => {
        if (done) return;
        done = true;
        off();
        host.router.close('rewarded');
        resolve(value);
      };
      host.router.open('rewarded', {
        placement,
        variant,
        nextFreeAt: fallbackReadyAt(host.save(), c),
        now: () => host.clock.now(),
        onAccept: () => finish(variant !== 'countdown'),
        onDecline: () => finish(false),
      });
      // Closed from elsewhere (screen change, closeAll): treat as "Not now".
      off = host.bus.on('overlay:close', ({ id }) => {
        if (id === 'rewarded') finish(false);
      });
    });
  }

  /** The O1/O2 chunk is (or gets) loaded; else `message` is toasted and nothing is charged. */
  async function cardsReady(alive: () => boolean, message: string): Promise<boolean> {
    if (await host.router.overlaysReady()) return alive();
    if (alive()) host.toast(message);
    return false;
  }

  /** The free grant (02 §13.3): cooldown stamped and saved, logged as result 'fallback'. */
  function grantFallback(p: RewardedPlacement): true {
    host.updateSave((s) => recordFallbackGrant(s, host.clock.now()));
    host.saves.touch();
    host.log({ name: 'ad_rewarded', params: { placement: p, result: 'fallback' } });
    host.bus.emit('ad', { kind: 'rewarded', placement: p, result: 'fallback' });
    return true;
  }

  /**
   * The rewarded / fallback part of a helper refill: true = the ad or the free grant succeeded (the
   * caller grants); false = nothing.
   */
  async function rewardedOrFallback(p: HelperPlacement): Promise<boolean> {
    const asks = p !== 'revive';
    const unavailable = p === 'hint' ? 'hint.unavailable' : p === 'mouse' ? 'mouse.unavailable' : 'kitty.unavailable';
    if (asks && !(await cardsReady(() => true, t(unavailable)))) return false;
    const ask = async (variant: RewardedVariant): Promise<boolean> => (asks ? askO2(p as 'hint' | 'kitty' | 'mouse', variant) : true);
    if (rewardedAvailable()) {
      if (!(await ask('video'))) return false;
      const r = await host.adFlow.rewarded(p);
      if (r.ok) {
        if (c.ads.rewarded.resetsInterstitialClock) {
          host.updateSave((s) => recordAdShown(s, host.clock.now()));
          host.saves.touch();
        }
        return true;
      }
      // The platform turned out not to support rewarded ads (FB CLIENT_UNSUPPORTED_OPERATION, which
      // also switches the capability off): the player already said yes, so the free grant applies
      // at once when it is available, instead of a "no video" dead end (PLAT-4).
      if (r.reason === 'unsupported' && fallbackAvailable(host.save(), host.clock.now(), c)) return grantFallback(p);
      host.toast(t('rewarded.noVideo'));
      return false;
    }
    if (fallbackAvailable(host.save(), host.clock.now(), c)) {
      if (!(await ask('free'))) return false;
      return grantFallback(p);
    }
    if (asks) await ask('countdown'); // the countdown card only informs: [OK] grants nothing
    return false;
  }

  /** Stock is empty: O2 → ad / free grant (+1, saved). True when the stock went up. */
  async function refill(p: 'hint' | 'kitty'): Promise<boolean> {
    if (!(await rewardedOrFallback(p))) return false;
    host.updateSave((s) => grant(s, p === 'hint' ? 'hints' : 'kitties', undefined, c));
    host.saves.now();
    stockChanged();
    return true;
  }

  function playable(): { game: GameState; meta: SessionMeta } | null {
    const game = host.game();
    const meta = host.meta();
    if (!game || !meta || game.status !== 'playing' || host.busy()) return null;
    if (host.router.stack().some((id) => id !== 'coach')) return null;
    return { game, meta };
  }

  async function onBulb(): Promise<void> {
    const cur = playable();
    if (!cur) return;
    const { game: s0, meta } = cur;
    const step = asTutorialStep(meta.tutorialStep);
    if (!getMode(meta.mode).chargesHelpers) {
      // Tutorial: free and uncharged (02 §9.3); only at the bulb step.
      if (step !== null && !tutorialAllowsTool(step, 'bulb')) return;
      await host.runBusy(async (alive) => {
        const cards = await host.router.overlaysReady();
        if (!alive()) return;
        let hint: HintStep;
        try {
          hint = await host.engine.getHint(s0.puzzle, s0.cells);
        } catch {
          if (alive()) host.toast(t('hint.unavailable'));
          return;
        }
        if (!alive() || host.game()?.cells !== s0.cells) return;
        if (cards) {
          host.openHint(hint, false);
          return;
        }
        // The card cannot load (offline first run). Step 5 accepts only the hint's Apply, so apply
        // the step directly instead of leaving the tutorial with no way forward.
        host.dispatch({ type: 'HINT_OPEN', step: hint, charged: false });
        host.dispatch({ type: 'HINT_APPLY', t: host.clock.now() });
      });
      return;
    }
    const key = encodeCells(s0.cells);
    if (hintCache && hintCache.puzzleId === s0.puzzle.id && hintCache.key === key) {
      host.openHint(hintCache.step, false);
      return;
    }
    await host.runBusy(async (alive) => {
      if (!(await cardsReady(alive, t('hint.unavailable')))) return; // never charge for a card that cannot open
      if (host.save().stock.hints <= 0) {
        if (!(await refill('hint')) || !alive()) return;
      }
      let hint: HintStep;
      try {
        hint = await host.engine.getHint(s0.puzzle, s0.cells);
      } catch {
        if (alive()) host.toast(t('hint.unavailable')); // nothing charged
        return;
      }
      const s1 = host.game();
      if (!alive() || !s1 || s1.status !== 'playing' || s1.cells !== s0.cells) return;
      host.updateSave((s) => spend(s, 'hints'));
      host.saves.now();
      stockChanged();
      hintCache = { puzzleId: s0.puzzle.id, key, step: hint };
      host.openHint(hint, true);
    });
  }

  async function onPaw(): Promise<void> {
    const cur = playable();
    if (!cur || !getMode(cur.meta.mode).kittyAllowed) return;
    const step = asTutorialStep(cur.meta.tutorialStep);
    if (step !== null && !tutorialAllowsTool(step, 'paw')) return;
    await host.runBusy(async (alive) => {
      if (host.save().stock.kitties <= 0) {
        if (!(await refill('kitty')) || !alive()) return;
      }
      const s1 = host.game();
      const meta = host.meta();
      if (!alive() || !s1 || !meta || s1.status !== 'playing') return;
      let cell: number;
      try {
        cell = await host.engine.pickKittyCell(s1.puzzle, s1.cells);
      } catch {
        if (alive()) host.toast(t('kitty.unavailable')); // nothing charged
        return;
      }
      // TICK replaces the state object every second: compare the board, as onBulb does.
      const s2 = host.game();
      if (!alive() || !s2 || s2.status !== 'playing' || s2.cells !== s1.cells) return;
      host.updateSave((s) => spend(s, 'kitties'));
      host.saves.now();
      stockChanged();
      host.dispatch({ type: 'KITTY', cell, t: host.clock.now() });
      host.log({ name: 'kitty_used', params: { level: levelParam(meta) } });
      host.afterKitty();
    });
  }

  /** Uses of the mouse in this attempt: part of the seed, so a second use picks other cells. */
  let mouseUses = 0;

  async function onMouse(): Promise<void> {
    const cur = playable();
    if (!cur || !c.mouse.enabled || !getMode(cur.meta.mode).mouseAllowed) return;
    const step = asTutorialStep(cur.meta.tutorialStep);
    if (step !== null && !tutorialAllowsTool(step, 'mouse')) return;
    if (!hasMouseCandidate(cur.game)) return;
    await host.runBusy(async (alive) => {
      if (!(await rewardedOrFallback('mouse')) || !alive()) return;
      const s1 = host.game();
      const meta = host.meta();
      if (!s1 || !meta || s1.status !== 'playing') return;
      const cells = pickMouseCells(s1, c.mouse.cells, mouseSeed(s1.puzzle.id, mouseUses));
      mouseUses++;
      if (cells.length === 0) return;
      host.dispatch({ type: 'MOUSE', cells, t: host.clock.now() });
      host.log({ name: 'mouse_used', params: { mode: meta.mode, cells: cells.length } });
      // Phase 2d.1 §1.2: the board stays locked while the mouse visits its tiles (its X's are hidden
      // until it leaves each one); a session that ends or leaves the board ends the wait early.
      await lockFor(mouseRunMs(cells.length, host.reducedMotion(), c), alive);
    });
  }

  /** Waits `ms` on the session clock, or less once `alive()` turns false (checked every tick). */
  function lockFor(ms: number, alive: () => boolean): Promise<void> {
    return new Promise((resolve) => {
      const end = host.clock.perf() + ms;
      const step = (): void => {
        const left = end - host.clock.perf();
        if (!alive() || left <= 0) {
          resolve();
          return;
        }
        host.clock.setTimeout(step, Math.min(left, c.timer.tickMs));
      };
      step();
    });
  }

  function continueOffer(): 'video' | 'free' | null {
    const game = host.game();
    if (!game || !canRevive(game)) return null;
    if (rewardedAvailable()) return 'video';
    return fallbackAvailable(host.save(), host.clock.now(), c) ? 'free' : null;
  }

  async function interstitial(trigger: InterstitialTrigger): Promise<void> {
    const decision = interstitialGate(
      {
        trigger,
        now: host.clock.now(),
        sessionStartedAt: host.sessionStartedAt,
        save: host.save(),
        interstitialSupported: host.capabilities().interstitial,
        // (the save carries purchases.noAds: the gate answers 'no_ads')
      },
      c,
    );
    if (decision !== 'ok') {
      host.log({ name: 'ad_interstitial', params: { trigger, result: 'gated' } });
      return;
    }
    const r = await host.adFlow.interstitial(trigger);
    if (r.ok) {
      host.updateSave((s) => recordAdShown(s, host.clock.now()));
      host.saves.touch();
    }
  }

  return {
    onBulb,
    onPaw,
    onMouse,
    newAttempt: () => {
      mouseUses = 0;
    },
    mouseUses: () => mouseUses,
    rewardedOrFallback,
    continueOffer,
    interstitial,
    clearHintCache: () => {
      hintCache = null;
    },
  };
}
