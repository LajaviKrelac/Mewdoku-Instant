// Owner: C (Phase 2b). Phase 2c (G1): the fish that fly are the LIVES kept (docs/phase2c/fish-lives-spec.md
// §2.1–§2.5): each full life lifts off the lives pill and flies to this period's points counter.
// The post-win orchestration on the session clock: rewards already saved at t = 0 (critical save,
// same as the win: level points (phase2c.1: the level's total), period points, progress, event
// record), then glow (t = 300), the PERIOD COUNTER (1 000, this period's total before the win),
// fish k lifting off life slot N − 1 − k at L(k) = 1 200 + 150 k (GameScreen.departLife: the slot
// shows empty at once; B's flyFish pops it at scale 1 and plays 'fish_pop' through onPop), arrivals
// at A(k) = 2 250 + 150 k (counter
// + pointsPerFish, 'fish_plink', 8 ms haptic), "+G" and the a11y line at A(N − 1), a safety net at
// A(N − 1) + counterBumpMs, the scrim at panelAt(N) − scrimLeadMs and the ranking panel (the period
// board) at panelAt(N) = min(fx.winOverlayDelayMs, A(N − 1) + panelAfterLastMs): 4 200 / 4 350 /
// 4 500 ms for 1 / 2 / 3 fish. No flight (a win that adds no leaderboard points): no counter, panel
// at 1 200 (the glow has settled). On the panel's tap the victory screen opens at once (UX-4
// crossfade, closed by the session). Home and Gear are inactive until the panel opens: the session
// ignores them while blocking() is true and renders them aria-disabled (GameView.chromeLocked).
// Teardown cancels every timer and WAAPI animation and empties the fish layer. A hidden page keeps
// the schedule: on return every missed step runs once, in order, jumped to its end state (departLife
// is idempotent and is applied by those steps too, so the right slots come back empty).
// Variants: tutorial and its replay (no counter, no flight, no panel; victory at
// fx.win.replayVictoryAtMs), restored full board (victory at once, no glow, nothing granted twice).
// C-internal module: the B calls it makes are fixed (GameScreen.glow/lifeSlots/departLife/
// showPeriodCounter/periodRect/periodLabel/showScrim, flyFish, ensureFxLayer). Every B call is
// guarded: a failing effect never stops the flow.
import type { Sfx } from '../audio/sfx';
import type { CellIndex } from '../engine/types';
import { t } from '../i18n';
import { ensureFxLayer, fishSizeFromRect, flyFish, type FlyFishOptions, type FxHandle } from '../ui/fx/fish-flight';
import type { Clock, TimerId } from './clock';
import { cfg, type GameConfig, type PeriodKind } from './config';
import { fishKeptText } from '../ui/period-text';

export type WinFlowVariant = 'level' | 'daily' | 'event' | 'tutorial' | 'tutorial_replay' | 'restored';

/** The GameScreen members the flow drives (phase2c §7.4; GameScreen satisfies it). */
export interface WinScreen {
  /** t = 300: ui/fx/glow.ts playGlow on these cat cells. */
  glow(cells: readonly CellIndex[]): FxHandle;
  /** Full life slots in departure order (highest slot first) with their icon's client rect; [] while hidden. */
  lifeSlots(): readonly { readonly slot: number; readonly rect: DOMRect }[];
  /** The life in `slot` leaves for the flight: it shows empty at once, no loss animation. Idempotent. */
  departLife(slot: number): void;
  /** The period counter: fades in at the first call; a higher total later rolls + bumps. */
  showPeriodCounter(total: number): void;
  /** Client rect of the counter's icon (flight target), null while hidden. */
  periodRect(): DOMRect | null;
  /** The rising "+N" chip at the counter. */
  periodLabel(text: string): void;
  /** The dark scrim before the ranking panel (optional, phase2b B addition). */
  showScrim?(): void;
}

export interface WinFlowInput {
  readonly variant: WinFlowVariant;
  readonly screen: WinScreen;
  /** Cat cells in row order (glow). */
  readonly catCells: readonly CellIndex[];
  /**
   * N: the fish (lives) kept that fly to the counter, state.hearts at WON. 0 when the win adds no
   * leaderboard points (not counted, mode outside period.modes, tutorial): no counter, no flight.
   */
  readonly kept: number;
  /** period.pointsPerFish: what one arrival adds to the counter. */
  readonly perFish: number;
  /** This period's leaderboard points before the win (0 after a rollover). */
  readonly periodBefore: number;
  readonly periodKind: PeriodKind;
  readonly reducedMotion: boolean;
}

/** B's fx functions (a test seam; defaults are the real ui/fx modules). */
export interface WinFlowFx {
  flyFish(layer: HTMLElement, from: readonly DOMRect[], to: DOMRect, opts: FlyFishOptions): FxHandle;
  ensureFxLayer(root: HTMLElement): HTMLElement;
}

export interface WinFlowDeps {
  readonly clock: Clock;
  readonly sfx: Pick<Sfx, 'play'>;
  readonly haptics: (pattern: number | readonly number[]) => void;
  /** Screen-reader line ("You kept 2 fish. Your total this week: 42."). */
  readonly announce?: (message: string) => void;
  /** The app root (the fish layer goes there); null in tests without a DOM. */
  readonly root: () => HTMLElement | null;
  readonly fx?: Partial<WinFlowFx>;
  readonly config?: GameConfig;
  /** t = panelAt(N) (reduced: 1 200): open the ranking panel (ranking-flow supplies the props). */
  openRanking(opts: { readonly tapMinMs: number }): void;
  /** Open the victory screen (at the panel's tap, as a crossfade over it, or on schedule for the variants without a panel). */
  openVictory(): void;
  /** blocking() changed (the session re-renders the top bar's Home and Gear as aria-disabled or not). */
  onBlockingChange?(blocking: boolean): void;
  /** Right after the scrim starts: the panel is next (PERF-3: router.reserveModal). */
  onScrim?(): void;
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

/** Whether a variant flies fish and opens the ranking panel (level, daily, event). */
const scored = (v: WinFlowVariant): boolean => v === 'level' || v === 'daily' || v === 'event';

/** N as the flow uses it: a whole number ≥ 0, and 0 for a variant without a flight. */
function flyingCount(input: Pick<WinFlowInput, 'variant' | 'kept'>): number {
  if (!scored(input.variant)) return 0;
  return Number.isFinite(input.kept) ? Math.max(0, Math.floor(input.kept)) : 0;
}

/** L(k): fish k lifts off its life slot (§2.2: 1 200 + 150 k). */
export function liftAt(k: number, c: GameConfig = cfg): number {
  const w = c.fx.win;
  return w.fishAtMs + k * w.fishStaggerMs;
}

/** A(k): fish k reaches the counter (§2.2: 2 250 + 150 k). */
export function arrivalAt(k: number, c: GameConfig = cfg): number {
  const w = c.fx.win;
  return liftAt(k, c) + w.fishHoldMs + w.fishFlightMs;
}

/**
 * panelAt(N) (§2.2): min(fx.winOverlayDelayMs, A(N − 1) + fx.win.panelAfterLastMs) for N ≥ 1, so
 * 4 200 / 4 350 / 4 500 ms for 1 / 2 / 3 fish (capped at 4 500); without a flight (N = 0) the panel
 * opens once the glow has settled: winHappyDelayMs + glowInMs + glowSettleMs = 1 200.
 */
export function panelAt(n: number, c: GameConfig = cfg): number {
  const w = c.fx.win;
  if (!(n >= 1)) return c.fx.winHappyDelayMs + w.glowInMs + w.glowSettleMs;
  return Math.min(c.fx.winOverlayDelayMs, arrivalAt(Math.floor(n) - 1, c) + w.panelAfterLastMs);
}

/** Timeline steps of one flow, in time order (pure: unit-tested by name and time). */
export function winTimeline(input: Pick<WinFlowInput, 'variant' | 'reducedMotion' | 'kept'>, c: GameConfig = cfg): { at: number; name: string }[] {
  const w = c.fx.win;
  const out: { at: number; name: string }[] = [];
  const { variant } = input;
  if (variant === 'restored') return [{ at: 0, name: 'victory' }];
  const reduced = input.reducedMotion;
  const happy = c.fx.winHappyDelayMs;
  out.push({ at: happy, name: 'glow' });
  const n = flyingCount(input);
  if (n > 0) {
    if (reduced) {
      // §2.4: the counter at once with the new total, the departing slots empty at once, "+G" fades.
      out.push({ at: happy, name: 'counter_total' });
      out.push({ at: happy, name: 'plus_label' });
      for (let k = 0; k < n; k++) out.push({ at: arrivalAt(k, c), name: `plink_${k}` });
    } else {
      out.push({ at: w.fishPillInAtMs, name: 'counter_in' });
      out.push({ at: w.fishAtMs, name: 'flight' });
      for (let k = 0; k < n; k++) out.push({ at: liftAt(k, c), name: `lift_${k}` });
      // Arrivals: B's flight reports them (onArrive); these steps count a fish only when no flight runs.
      for (let k = 0; k < n; k++) out.push({ at: arrivalAt(k, c), name: `arrive_${k}` });
      const lastArrival = arrivalAt(n - 1, c);
      out.push({ at: lastArrival, name: 'plus_label' });
      // Safety net: a fish the flight never delivered is counted here, before the scrim.
      out.push({ at: lastArrival + w.counterBumpMs, name: 'settle' });
    }
  }
  if (variant === 'tutorial' || variant === 'tutorial_replay') {
    // §2.5: the tutorial keeps no fish and flies none; both variants open the victory at 1 200.
    out.push({ at: w.replayVictoryAtMs, name: 'victory' });
  } else if (reduced) {
    // §2.4: no scrim of the screen's own; the panel fades in with its scrim at 1 200.
    out.push({ at: w.reduced.rankingAtMs, name: 'ranking' });
  } else {
    const panel = panelAt(n, c);
    out.push({ at: Math.max(happy, panel - w.scrimLeadMs), name: 'scrim' });
    out.push({ at: panel, name: 'ranking' });
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

export function createWinFlow(deps: WinFlowDeps): WinFlow {
  const c = deps.config ?? cfg;
  const { clock } = deps;
  const fx: WinFlowFx = {
    flyFish: deps.fx?.flyFish ?? ((layer, from, to, opts) => flyFish(layer, from, to, opts, c)),
    ensureFxLayer: deps.fx?.ensureFxLayer ?? ensureFxLayer,
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
      const n = flyingCount(input);
      const perFish = Math.max(0, Math.floor(Number.isFinite(input.perFish) ? input.perFish : 0));
      const before = Math.max(0, Math.floor(Number.isFinite(input.periodBefore) ? input.periodBefore : 0));
      const gained = n * perFish;
      const total = before + gained;
      /** Life slot of fish k: the last full one first (slot N − 1 − k), or as lifeSlots() listed them. */
      const slots: number[] = Array.from({ length: n }, (_, k) => n - 1 - k);
      const departed = new Set<number>();
      const arrived = new Set<number>();
      let flying = false;
      const depart = (k: number): void => {
        if (k < 0 || k >= n || departed.has(k)) return;
        departed.add(k);
        guard(() => screen.departLife(slots[k] as number));
      };
      const pop = (k: number): void => guard(() => deps.sfx.play('fish_pop', { index: k }));
      const sounds = (k: number): void => {
        guard(() => deps.sfx.play('fish_plink', { index: k }));
        guard(() => deps.haptics(c.haptics.fish));
      };
      const arrive = (k: number): void => {
        if (arrived.has(k) || k < 0 || k >= n) return;
        depart(k); // a fish that arrived has left its slot (idempotent)
        arrived.add(k);
        guard(() => screen.showPeriodCounter(before + arrived.size * perFish));
        sounds(k);
      };
      const announce = (): void => {
        if (gained > 0) guard(() => deps.announce?.(fishKeptText(input.periodKind, n, total)));
      };
      const departAll = (): void => {
        for (let k = 0; k < n; k++) depart(k);
      };

      const run: Record<string, (late: boolean) => void> = {
        glow: () => {
          if (input.catCells.length > 0) handles.push(screen.glow(input.catCells));
        },
        counter_in: () => screen.showPeriodCounter(before),
        counter_total: () => {
          // §2.4 reduced: the counter shows the new total at once and the departing slots turn empty.
          guard(() => screen.showPeriodCounter(total));
          departAll();
        },
        flight: (late) => {
          // §2.3 sources: the full life icons in departure order (the first N); target: the counter's icon.
          let listed: readonly { readonly slot: number; readonly rect: DOMRect }[] = [];
          guard(() => {
            listed = screen.lifeSlots();
          });
          listed.slice(0, n).forEach((s, k) => {
            if (Number.isInteger(s.slot)) slots[k] = s.slot;
          });
          const to = screen.periodRect();
          const from = listed.slice(0, n).map((s) => s.rect);
          const root = deps.root();
          // No rects or root, or a page that was hidden: the lift-off and arrival steps settle it.
          if (late || !to || from.length < n || n === 0 || !root) return;
          const h = fx.flyFish(fx.ensureFxLayer(root), from, to, {
            // §2.3: the flying fish starts at its life icon's size, clamped to fishMinPx…fishMaxPx.
            sizePx: fishSizeFromRect(from[0], c),
            startScale: 1,
            reduced: false,
            onArrive: (i) => arrive(i),
            // §2.2: fish i leaves its slot as the flight pops it over the slot ('fish_pop'); a skipped
            // or finished flight stays silent, and the lift-off steps empty the slots instead.
            onPop: (i) => {
              depart(i);
              pop(i);
            },
          });
          handles.push(h);
          flying = true;
        },
        plus_label: () => {
          if (!input.reducedMotion) for (let k = 0; k < n; k++) arrive(k);
          guard(() => screen.periodLabel(t('fish.plus', { count: gained })));
          announce();
        },
        settle: () => {
          for (let k = 0; k < n; k++) arrive(k);
          guard(() => screen.showPeriodCounter(total));
        },
        scrim: () => {
          guard(() => screen.showScrim?.());
          if (deps.onScrim) guard(() => deps.onScrim?.());
        },
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
      for (let k = 0; k < n; k++) {
        // Lift-off: the slot empties (idempotent; the flight's onPop did it already when it runs).
        // Without a flight (no rects or root) the flow plays the pop on its own schedule.
        run[`lift_${k}`] = (late) => {
          depart(k);
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
      // in over it — a crossfade (UX-4). A step on the flow's clock, due now.
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
