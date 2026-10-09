// Owner: C
// The post-win orchestration (phase2b §2.2, §2.6, §2.7) on the session clock: rewards already saved
// at t = 0 (critical save, same as the win), then glow (t = 300), the in-game fish pill (1 000), three
// fish (1 200 …, B's flyFish; each pop plays 'fish_pop' through FlyFishOptions.onPop), arrivals and
// labels, the game screen's scrim (4 200, fx.win.scrimAtMs: GameScreen.showScrim), the ranking panel
// (4 500, fx.winOverlayDelayMs), and on its tap the victory screen, at once: it fades in over the
// panel while the panel fades out (rank.panelOutMs), and the session closes the panel once the
// victory is opaque (UX-4: the dimmed screen never drops back to the bare board between the two).
// Home and Gear are inactive until the panel opens: the session ignores them while
// blocking() is true and renders them aria-disabled (GameView.chromeLocked, via onBlockingChange).
// Esc does nothing.
// Teardown cancels every timer and WAAPI animation and empties the fish layer. A hidden page keeps
// the schedule: on return every missed step runs once, in order, jumped to its end state. Variants:
// tutorial (no panel; victory at fx.win.tutorialVictoryAtMs), replay (no fish; victory at
// replayVictoryAtMs), restored full board (victory at once, no glow, no second award).
// C-internal module: the B calls it makes are fixed (GameScreen.glow/showFishPill/fishLabel/fishRect/
// showScrim, flyFish, ensureFxLayer). Every B call is guarded: a failing effect never stops the flow.
import type { Sfx } from '../audio/sfx';
import type { CellIndex } from '../engine/types';
import { tn, t } from '../i18n';
import { ensureFxLayer, fishSizePx, flyFish, type FlyFishOptions, type FxHandle } from '../ui/fx/fish-flight';
import type { GameScreen } from '../ui/screens/game-screen';
import type { Clock, TimerId } from './clock';
import { cfg, type GameConfig } from './config';

export type WinFlowVariant = 'level' | 'daily' | 'event' | 'tutorial' | 'tutorial_replay' | 'restored';

export interface WinFlowInput {
  readonly variant: WinFlowVariant;
  readonly screen: GameScreen;
  /** Cat cells in row order (glow) and the three fish sources (fishSourceRows → solution cells). */
  readonly catCells: readonly CellIndex[];
  readonly fishSources: readonly CellIndex[];
  /** Wallet before this win, the base fish (3, or 0) and the bonus (+2 or 0). */
  readonly fishBefore: number;
  readonly fishBase: number;
  readonly fishBonus: number;
  readonly reducedMotion: boolean;
  /** Board slot in CSS px (fish size); null = derive from the first source cell's rect. */
  readonly slotPx?: number | null;
}

/** B's fx functions (a test seam; defaults are the real ui/fx modules). */
export interface WinFlowFx {
  flyFish(layer: HTMLElement, from: readonly DOMRect[], to: DOMRect, opts: FlyFishOptions): FxHandle;
  ensureFxLayer(root: HTMLElement): HTMLElement;
  fishSizePx(slotPx: number): number;
}

export interface WinFlowDeps {
  readonly clock: Clock;
  readonly sfx: Pick<Sfx, 'play'>;
  readonly haptics: (pattern: number | readonly number[]) => void;
  /** Screen-reader line ("You caught 3 fish. You have 128."). */
  readonly announce?: (message: string) => void;
  /** The app root (the fish layer goes there); null in tests without a DOM. */
  readonly root: () => HTMLElement | null;
  readonly fx?: Partial<WinFlowFx>;
  readonly config?: GameConfig;
  /** t = 4 500 (reduced: 1 200): open the ranking panel (ranking-flow supplies the props). */
  openRanking(opts: { readonly tapMinMs: number }): void;
  /** Open the victory screen (at the panel's tap, as a crossfade over it, or on schedule for the variants without a panel). */
  openVictory(): void;
  /** blocking() changed (the session re-renders the top bar's Home and Gear as aria-disabled or not). */
  onBlockingChange?(blocking: boolean): void;
  /** A guarded effect threw (reported, never rethrown). */
  onError?(error: unknown): void;
}

export interface WinFlow {
  start(input: WinFlowInput): void;
  /** Whether a flow is running (from start until the victory screen opens). */
  running(): boolean;
  /** Home and Gear stay inactive until the ranking panel (or, without a panel, the victory) opens. */
  blocking(): boolean;
  /** The panel accepted a tap (≥ its tap gate after it opened): the victory screen. */
  continueFromRanking(): void;
  /** The page came back: every missed step runs now, in order, with its animation at the end state. */
  catchUp(): void;
  /** Teardown: cancel every timer and animation, empty the fish layer. Rewards are already saved. */
  cancel(): void;
}

interface Step {
  readonly at: number;
  readonly name: string;
  readonly run: (late: boolean) => void;
}

/** A step this much behind its time runs with its animation jumped to the end (§2.2 hidden page). */
const LATE_MS = 250;

/** Timeline steps of one flow, in time order (pure: unit-tested by name and time). */
export function winTimeline(input: Pick<WinFlowInput, 'variant' | 'reducedMotion' | 'fishBase' | 'fishBonus'>, c: GameConfig = cfg): { at: number; name: string }[] {
  const w = c.fx.win;
  const out: { at: number; name: string }[] = [];
  const { variant } = input;
  if (variant === 'restored') return [{ at: 0, name: 'victory' }];
  const reduced = input.reducedMotion;
  const happy = c.fx.winHappyDelayMs;
  out.push({ at: happy, name: 'glow' });
  const fish = input.fishBase > 0;
  if (fish) {
    if (reduced) {
      out.push({ at: happy, name: 'pill_total' });
      out.push({ at: happy, name: 'plus_label' });
      for (let k = 0; k < 3; k++) out.push({ at: arrivalAt(k, c), name: `plink_${k}` });
    } else {
      out.push({ at: w.fishPillInAtMs, name: 'pill_in' });
      out.push({ at: w.fishAtMs, name: 'flight' });
      for (let k = 0; k < 3; k++) out.push({ at: w.fishAtMs + k * w.fishStaggerMs, name: `pop_${k}` });
      // Arrivals: B's flight reports them (onArrive); these steps count a fish only when no flight runs.
      for (let k = 0; k < 3; k++) out.push({ at: arrivalAt(k, c), name: `arrive_${k}` });
      const lastArrival = arrivalAt(2, c);
      out.push({ at: lastArrival, name: 'plus_label' });
      if (input.fishBonus > 0) out.push({ at: w.bonusLabelAtMs, name: 'bonus' });
      // Safety net: a fish B's flight never delivered is counted here, before the scrim.
      out.push({ at: Math.max(lastArrival, w.bonusLabelAtMs) + w.counterBumpMs, name: 'settle_fish' });
    }
  }
  if (variant === 'tutorial') out.push({ at: reduced ? w.reduced.rankingAtMs : w.tutorialVictoryAtMs, name: 'victory' });
  else if (variant === 'tutorial_replay') out.push({ at: w.replayVictoryAtMs, name: 'victory' });
  else {
    // §2.2 t = 4 200: the scrim fades in so the panel opens on it (the reduced timeline, §2.7, has
    // none: the panel fades in with its own scrim at 1 200).
    if (!reduced) out.push({ at: w.scrimAtMs, name: 'scrim' });
    out.push({ at: reduced ? w.reduced.rankingAtMs : c.fx.winOverlayDelayMs, name: 'ranking' });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** A frame or two of slack for the victory's first style pass (UX-4). */
const CROSSFADE_SLACK_MS = 50;

/**
 * UX-4: how long after the victory opens (at the panel's tap) the ranking panel closes — once the
 * victory's fade-in (fx.overlayFadeMs; reduced: fx.screenReducedMs) and the panel's fade-out
 * (rank.panelOutMs) are both over, plus CROSSFADE_SLACK_MS.
 */
export function victoryCrossfadeMs(reduced: boolean, c: GameConfig = cfg): number {
  return Math.max(c.rank.panelOutMs, reduced ? c.fx.screenReducedMs : c.fx.overlayFadeMs) + CROSSFADE_SLACK_MS;
}

/** When fish k reaches the pill (§2.2: 2 250 / 2 400 / 2 550). */
export function arrivalAt(k: number, c: GameConfig = cfg): number {
  const w = c.fx.win;
  return w.fishAtMs + k * w.fishStaggerMs + w.fishHoldMs + w.fishFlightMs;
}

export function createWinFlow(deps: WinFlowDeps): WinFlow {
  const c = deps.config ?? cfg;
  const { clock } = deps;
  const fx: WinFlowFx = {
    flyFish: deps.fx?.flyFish ?? ((layer, from, to, opts) => flyFish(layer, from, to, opts, c)),
    ensureFxLayer: deps.fx?.ensureFxLayer ?? ensureFxLayer,
    fishSizePx: deps.fx?.fishSizePx ?? ((slot) => fishSizePx(slot, c)),
  };

  let gen = 0;
  let steps: Step[] = [];
  let next = 0;
  let t0 = 0;
  let timer: TimerId | null = null;
  let active = false;
  let blockingUi = false;
  let awaitingTap = false;
  const handles: FxHandle[] = [];
  /** The running flow's step functions by name (continueFromRanking adds the victory step). */
  let runs: Record<string, (late: boolean) => void> = {};

  const guard = (fn: () => void): void => {
    try {
      fn();
    } catch (error) {
      deps.onError?.(error);
    }
  };

  function finishHandles(): void {
    for (const h of handles) guard(() => h.finish());
  }

  function setBlocking(on: boolean): void {
    if (blockingUi === on) return;
    blockingUi = on;
    guard(() => deps.onBlockingChange?.(on));
  }

  function clearTimer(): void {
    clock.clearTimeout(timer);
    timer = null;
  }

  function schedule(): void {
    clearTimer();
    const step = steps[next];
    if (!step || !active) return;
    const mine = gen;
    const wait = Math.max(0, t0 + step.at - clock.perf());
    timer = clock.setTimeout(() => {
      timer = null;
      if (mine === gen) runDue();
    }, wait);
  }

  /** Runs every step whose time has come, in order; each exactly once. */
  function runDue(): void {
    const mine = gen;
    const now = clock.perf();
    while (active && mine === gen && next < steps.length) {
      const step = steps[next] as Step;
      if (t0 + step.at > now) break;
      next++;
      const late = now - (t0 + step.at) > LATE_MS;
      if (late) finishHandles();
      guard(() => step.run(late));
    }
    if (mine === gen) schedule();
  }

  function stop(): void {
    gen++;
    clearTimer();
    active = false;
    setBlocking(false);
    awaitingTap = false;
    for (const h of handles.splice(0)) guard(() => h.cancel());
    steps = [];
    next = 0;
    runs = {};
  }

  const flow: WinFlow = {
    start(input) {
      stop();
      active = true;
      setBlocking(true);
      t0 = clock.perf();
      const { screen } = input;
      const base = input.fishBase;
      const bonus = input.fishBonus;
      const total = input.fishBefore + base + bonus;
      const arrived = new Set<number>();
      let flying = false;
      const pop = (k: number): void => guard(() => deps.sfx.play('fish_pop', { index: k }));
      const sounds = (k: number): void => {
        guard(() => deps.sfx.play('fish_plink', { index: k }));
        guard(() => deps.haptics(c.haptics.fish));
      };
      const arrive = (k: number): void => {
        if (arrived.has(k) || k < 0 || k >= 3) return;
        arrived.add(k);
        guard(() => screen.showFishPill(input.fishBefore + Math.min(base, arrived.size)));
        sounds(k);
      };
      const announce = (): void => {
        if (base + bonus > 0) guard(() => deps.announce?.(tn('a11y.fishEarned', base + bonus, { total })));
      };

      const run: Record<string, (late: boolean) => void> = {
        glow: () => {
          if (input.catCells.length > 0) handles.push(screen.glow(input.catCells));
        },
        pill_in: () => screen.showFishPill(input.fishBefore),
        pill_total: () => screen.showFishPill(total),
        flight: (late) => {
          const to = screen.fishRect();
          const from: DOMRect[] = [];
          for (const cell of input.fishSources) {
            const r = screen.cellRect(cell);
            if (r) from.push(r);
          }
          const root = deps.root();
          if (late || !to || from.length === 0 || !root) return; // the arrivals are settled by settle_fish
          const slot = input.slotPx ?? from[0]?.width ?? 0;
          const h = fx.flyFish(fx.ensureFxLayer(root), from, to, {
            sizePx: fx.fishSizePx(slot),
            reduced: false,
            onArrive: (i) => arrive(i),
            // §2.2: each fish's "bloop" sounds when B's flight pops it (no pop, no sound: a skipped or
            // finished flight stays silent).
            onPop: (i) => pop(i),
          });
          handles.push(h);
          flying = true;
        },
        plus_label: () => {
          if (input.reducedMotion) {
            // §2.7: no flight; the count already shows the total; the label fades in and out.
            guard(() => screen.fishLabel(t('fish.plus', { count: base + bonus })));
          } else {
            for (let k = 0; k < 3; k++) arrive(k);
            guard(() => screen.fishLabel(t('fish.plus', { count: base })));
          }
          announce();
        },
        bonus: () => {
          guard(() => screen.fishLabel(t('fish.plus', { count: bonus })));
          guard(() => screen.showFishPill(total));
        },
        settle_fish: () => {
          for (let k = 0; k < 3; k++) arrive(k);
          guard(() => screen.showFishPill(total));
        },
        scrim: () => guard(() => screen.showScrim?.()),
        ranking: () => {
          setBlocking(false);
          awaitingTap = true;
          deps.openRanking({ tapMinMs: input.reducedMotion ? c.fx.win.reduced.tapMinMs : c.rank.panelTapMinMs });
        },
        victory: () => {
          setBlocking(false);
          active = false;
          deps.openVictory();
        },
      };
      for (let k = 0; k < 3; k++) {
        // Without a flight (no rects or root) the flow keeps the pops on its own schedule.
        run[`pop_${k}`] = (late) => {
          if (!late && !flying) pop(k);
        };
        run[`arrive_${k}`] = (late) => {
          if (!flying || late) arrive(k);
        };
        run[`plink_${k}`] = () => sounds(k);
      }
      runs = run;
      steps = winTimeline(input, c).map((s) => ({ at: s.at, name: s.name, run: run[s.name] ?? (() => undefined) }));
      next = 0;
      runDue();
    },
    running: () => active,
    blocking: () => active && blockingUi,
    continueFromRanking() {
      if (!awaitingTap || !active) return;
      awaitingTap = false;
      // §2.2 "tap": the panel fades out over rank.panelOutMs (B's .is-leaving) while the victory fades
      // in over it — a crossfade (UX-4; it used to wait for the panel's fade, so the bare board showed
      // for ~150 ms in between). A step on the flow's clock, due now.
      const victory = runs['victory'] ?? (() => undefined);
      steps = steps.slice(0, next).concat({ at: Math.max(0, clock.perf() - t0), name: 'victory', run: victory });
      runDue();
    },
    catchUp() {
      if (!active) return;
      finishHandles();
      runDue();
    },
    cancel: stop,
  };
  return flow;
}
