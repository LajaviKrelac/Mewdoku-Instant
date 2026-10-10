// Owner: B (Phase 2b); G2 (Phase 2c; Phase 2c.1: the level-points counter); G3 (Phase 2d: the heads pill)
// The pills row of the game screen (02 §5 S2; look-spec §1.5–§1.6): the HEADS pill and the LIVES pill.
// Phase 2d: the heads pill replaces the cat counter. It holds one flat cat head (cat-head-flat) per
// region colour on the board, in palette order HEAD_ORDER (around the colour wheel from green), each
// the region colour at 50 % opacity on the white pill until that colour's cat is found; then the head
// turns to the full colour and pops (REGION_DONE; reduced motion: the colour changes in place). A cat
// taken back (the region no longer done) fades the head back to the tint; restores, Retry and a new
// board set the heads without motion. The level points moved to the game bar's Score column
// (game-bar.ts, on this file's counter builder); the 2c.1 tight fallback and the compact sizes are gone.
// Phase 2c (docs/phase2c/fish-lives-spec.md §1, §2): the lives are fish. Each life slot holds our
// icon-fish and the icon-fish-empty outline; a MISTAKE plays our fish loss (wriggle, flip out belly-up,
// three droplets, the empty outline fading in; reduced motion: a 150 ms swap), a REVIVED pops the
// restored fish back with a small splash. In the win flow the fish still in the pill lift off one by
// one (departLife) and fly to the PERIOD COUNTER (this period's leaderboard points), which shows in the
// heads pill's place (look-spec §1.13) while the heads fade out; it counts up per arrival with a roll
// and a bump, and a "+N" chip rises inside the pill. A new board brings the heads back.
// The same period pill (icon-trophy + the period total, not a button) sits on Home (createPeriodPill).
// Identifiers keep "hearts" where they cross into G1 or are stored (PillsProps.hearts / maxHearts,
// spec §0.5): hearts = lives = fish.
// Phase 2d.1 (G3, helpers-spec §2.7, §6.5, D-2d1-5, D-2d1-17): a found colour's head is no longer the
// full-colour silhouette: the silhouette gives way to our cat face (the board's Tux, cat-idle) with a
// small dot in the colour's 50 % tint at its lower inline end, popping 0.56 → 1.20 at 83 ms → 1.0 at
// fx.headFoundMs; the heads follow the hue ring HEAD_ORDER from a per-board start (headOrderFor).
// Classes: .pills > .pill.pill--heads[data-out] > span.head[data-color][data-done] > svg.head__shape (+ while done: svg.head__face + span.head__dot)
//            .period-pill[data-in-game]
//            .pill.pill--lives[data-last] > .life[data-full][data-departed]
//          .life > svg.life__empty (icon-fish-empty) svg.life__full (icon-fish)
//                  (+ during a loss: .life--lose > svg.life__lost (the falling fish) svg.life__splash > circle.life__drop)
//                  (+ on a revive: .life--pop > svg.life__splash)
//          .period-pill > .period-pill__icon .period-pill__count > .period-pill__n ; .period-pill__label > .period-pill__chip
// Keyframes and the CSS-only constants of the fish loss and the head pop: src/styles/fx.css
// (--t-life-loss from fx.lifeLossMs, --t-life-hurt from fx.lifeLossPillMs, --head-ms from
// fx.headFoundMs); layout: hud.css (row, heads, lives), screens.css (period pill).
import { cfg, type PeriodKind } from '../../app/config';
import type { GameEvent } from '../../game/types';
import { formatNumber, onLocaleChanged, t } from '../../i18n';
import { headOrderFor } from '../art/palette';
import { icon } from '../art/sprite';
import type { View } from '../dom';
import { periodPillLabel } from '../period-text';

export interface PillsProps {
  readonly catsPlaced: number;
  readonly n: number;
  /** Lives left (hearts = lives = fish, Phase 2c §0.5). */
  readonly hearts: number;
  /** Lives at the start of an attempt (3; an event may set another number). */
  readonly maxHearts: number;
  /** Reduced motion (§1.3): the fish loss becomes a 150 ms swap; no pop, roll or rise. Default false. */
  readonly reducedMotion?: boolean;
  /** Phase 2d §1.6: palette index per region label (BoardModel.colors). */
  readonly colors: ArrayLike<number>;
  /** Phase 2d §1.6: the regions whose cat is found (BoardModel.regionsDone, bit per region label). */
  readonly regionsDone: number;
  /** Phase 2d §1.6: the board's identity (BoardModel.puzzleId); a new one sets the heads without motion. */
  readonly boardId: string;
  /**
   * Phase 2d.1 §6.5: the id the heads ring starts from (headOrderFor); null = no rotation (the
   * tutorial). Optional (absent: boardId).
   */
  readonly ringId?: string | null;
}

/** A full life slot and its icon's client rect (the win flight's source, §2.3). */
export interface LifeSlotRect {
  readonly slot: number;
  readonly rect: DOMRect;
}

export interface PillsView extends View<PillsProps> {
  /**
   * MISTAKE → the fish loss of slot `heartsLeft` (§1.3); REVIVED → the restored fish pops back (§1.4).
   * Phase 2d: REGION_DONE → that colour's head pops (look-spec §1.6).
   */
  playEvent(ev: GameEvent): void;
  /** Full life slots in departure order (highest slot first), with their icon's client rect; [] while hidden. */
  lifeSlots(): readonly LifeSlotRect[];
  /** The life in `slot` leaves for the win flight: it shows empty at once, no loss animation. Idempotent. */
  departLife(slot: number): void;
  /**
   * Win flow: shows the period counter (fade in at the first call), later calls with a higher total
   * roll + bump. Phase 2d: it shows in the heads pill's place while the heads fade out.
   */
  showPeriodCounter(total: number): void;
  /** Client rect of the counter's icon (flight target), null while hidden. */
  periodRect(): DOMRect | null;
  /** The rising "+N" chip at the counter. */
  periodLabel(text: string): void;
}

// ─────────────────────────────── counters (§2.1, §2.8; 2c.1 §10.2; 2d §1.13) ───────────────────────────────

export interface PeriodPillProps {
  /** This period's leaderboard points (fish kept), 0 after a rollover. */
  readonly total: number;
  readonly kind: PeriodKind;
}

type Timers = Set<ReturnType<typeof setTimeout>>;

function later(timers: Timers, ms: number, fn: () => void): void {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
}

function restart(el: Element, cls: string, ms: number, timers: Timers): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
  later(timers, ms, () => el.classList.remove(cls));
}

/**
 * The motion of one counter, from config: [roll (and bump) ms, chip ms, chip rise px, reduced chip
 * fade-in ms, reduced chip fade-out ms]. A tuple, not an object: its keys would stay in the main
 * bundle (budget, §10.9).
 */
export type CounterMotion = readonly [rollMs: number, chipMs: number, risePx: number, reducedInMs: number, reducedOutMs: number];

/** What makes a counter a period pill or the level-points (Score) counter. */
export interface CounterSpec {
  /** The block class: 'period-pill' or 'points-pill' (every part is `${cls}__…`). */
  readonly cls: 'period-pill' | 'points-pill';
  /** The pill's icon; null for the game bar's Score column (look-spec §1.13: no icon). */
  readonly icon: 'icon-trophy' | null;
  /** The counter's accessible name for a total (role="img"). */
  label(total: number): string;
  motion(): CounterMotion;
  reduced(): boolean;
  /**
   * Phase 2d: where the rising chip goes. Default: the counter itself (anchored to its top edge,
   * screens.css). The Score column passes the number's own box, so the chip sits at the number's
   * inline end (hud.css), and clamps it in `placed`.
   */
  readonly chipHost?: (count: HTMLElement, el: HTMLElement) => HTMLElement;
  /** Phase 2d: called right after a chip is in the document (the Score column keeps it clear of the gear). */
  placed?(chip: HTMLElement): void;
}

/** A counter: an optional icon and a number that can roll up, plus the rising chip. */
export interface Counter {
  readonly el: HTMLElement;
  /**
   * Shows `next` and re-reads the accessible name and the number's format (so it also relabels after
   * a language change). With `rollFrom` (and no reduced motion) the number rolls up from `rollFrom`
   * and the counter bumps.
   */
  setTotal(next: number, rollFrom?: number): void;
  /** The current total (−1 before the first set). */
  total(): number;
  /** Phase 2d.1: the accessible name (and total()) only; the number on screen stays (the Score's star, §2.5). */
  setLabel(total: number): void;
  /** Phase 2d.1: the number on screen only (the Score's count-up frames, §2.5); no roll, no bump. */
  show(n: number): void;
  /** Phase 2d.1: the number's element (`.${cls}__n`; [data-counting] during the Score's count-up). */
  numEl(): HTMLElement;
  /** The rising chip ("+3", "+576"); a newer chip replaces a running one. */
  chip(text: string): void;
  /** Client rect of the pill's icon (or of its number without one); null while hidden or detached. */
  iconRect(): DOMRect | null;
  destroy(): void;
}

/**
 * The shared counter builder (2c.1 §10.9): the period pill (Home, the win flow) and, from Phase 2d,
 * the game bar's Score column use the same roll, bump and chip code.
 */
export function buildCounter(spec: CounterSpec): Counter {
  const { cls } = spec;
  const timers: Timers = new Set();
  const el = document.createElement('div');
  el.className = cls;
  // Not a button (§2.8 [DECISION]; §10.2): an image of the total, read on demand, never a live region.
  el.setAttribute('role', 'img');
  const mark = spec.icon ? icon(spec.icon, { class: `${cls}__icon` }) : null;
  const countBox = document.createElement('span');
  countBox.className = `${cls}__count num`;
  countBox.setAttribute('aria-hidden', 'true');
  let numEl = document.createElement('span');
  numEl.className = `${cls}__n`;
  countBox.appendChild(numEl);
  if (mark) el.append(mark);
  el.append(countBox);
  const chipParent = spec.chipHost ? spec.chipHost(countBox, el) : el;

  let total = -1;
  let chipEl: HTMLElement | null = null;

  const setTotal = (next: number, rollFrom?: number): void => {
    const text = formatNumber(next);
    total = next;
    el.setAttribute('aria-label', spec.label(Math.max(0, next)));
    if (rollFrom === undefined || !(next > rollFrom) || spec.reduced()) {
      if (numEl.textContent !== text) numEl.textContent = text;
      return;
    }
    // The number roll (§2.2 "counter + pointsPerFish (roll + bump)"; §10.2 the per-cat roll): the old
    // number slides out upward, the new one slides in from below; the counter bumps. A newer roll
    // first settles a running one (the outgoing number goes, the incoming one rests), so the box never
    // holds more than two numbers.
    for (const gone of Array.from(countBox.querySelectorAll('.is-out'))) gone.remove();
    const old = numEl;
    old.classList.remove('is-in');
    old.classList.add('is-out');
    // The props may already show `next` (the session updates the store before it plays the events).
    old.textContent = formatNumber(rollFrom);
    numEl = document.createElement('span');
    numEl.className = `${cls}__n is-in`;
    numEl.textContent = text;
    countBox.appendChild(numEl);
    const fresh = numEl;
    const [rollMs] = spec.motion();
    el.style.setProperty('--bump-ms', `${rollMs}ms`);
    later(timers, rollMs, () => {
      old.remove();
      fresh.classList.remove('is-in');
    });
    restart(el, `${cls}--bump`, rollMs, timers);
  };

  return {
    el,
    setTotal,
    total: () => total,
    setLabel(next) {
      total = next;
      el.setAttribute('aria-label', spec.label(Math.max(0, next)));
    },
    show(n) {
      for (const gone of Array.from(countBox.querySelectorAll('.is-out'))) gone.remove();
      numEl.classList.remove('is-in');
      const text = formatNumber(n);
      if (numEl.textContent !== text) numEl.textContent = text;
    },
    numEl: () => numEl,
    chip(text) {
      const [, chipMs, risePx, inMs, outMs] = spec.motion();
      const rm = spec.reduced();
      chipEl?.remove();
      const span = document.createElement('span');
      span.className = `${cls}__label`;
      span.setAttribute('aria-hidden', 'true');
      const b = document.createElement('b');
      b.className = `${cls}__chip num`;
      b.textContent = text;
      span.appendChild(b);
      span.toggleAttribute('data-reduced', rm);
      const ms = rm ? inMs + outMs : chipMs;
      span.style.setProperty('--label-ms', `${ms}ms`);
      span.style.setProperty('--label-rise', `${-risePx}px`);
      chipParent.appendChild(span);
      chipEl = span;
      spec.placed?.(span);
      // Reduced motion (§2.4, §10.2): fade in and out in place, on WAAPI (the global reduced-motion
      // CSS rule would cut a CSS animation to 1 ms).
      if (rm && typeof span.animate === 'function') {
        try {
          span.animate([{ opacity: 0 }, { opacity: 1, offset: inMs / ms }, { opacity: 0 }], { duration: ms, easing: 'linear', fill: 'both' });
        } catch {
          // the chip simply shows until it is removed
        }
      }
      later(timers, ms, () => {
        span.remove();
        if (chipEl === span) chipEl = null;
      });
    },
    iconRect: () => (el.isConnected && !el.hidden ? (mark ?? countBox).getBoundingClientRect() : null),
    destroy() {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      el.parentNode?.removeChild(el);
    },
  };
}

/** A chip host that wraps the number's box (position: relative), so the chip sits at its inline end. */
export const wrapCount =
  (cls: string) =>
  (count: HTMLElement): HTMLElement => {
    const val = document.createElement('span');
    val.className = cls;
    count.replaceWith(val);
    val.appendChild(count);
    return val;
  };

const periodMotion = (): CounterMotion => {
  const W = cfg.fx.win;
  return [W.counterBumpMs, W.plusLabelMs, W.plusLabelRisePx, W.reduced.plusLabelInMs, W.reduced.plusLabelOutMs];
};

/** The level points' motion (2c.1 §10.2; the game bar's Score column, look-spec §1.13). */
export const pointsMotion = (): CounterMotion => {
  const P = cfg.fx.levelPoints;
  return [P.rollMs, P.plusMs, P.plusRisePx, P.reducedPlusInMs, P.reducedPlusOutMs];
};

/** The period pill (Home and the win flow's counter): icon-trophy and this period's total. */
function buildPeriodPill(props: PeriodPillProps, opts: { inGame: boolean; reduced: () => boolean }): Counter & View<PeriodPillProps> {
  let kind = props.kind;
  const c = buildCounter({
    cls: 'period-pill',
    icon: 'icon-trophy',
    label: (n) => periodPillLabel(kind, n),
    motion: periodMotion,
    reduced: opts.reduced,
    // Phase 2d (critic C10): in game the "+3" sits inside the pill at the total's inline end.
    chipHost: opts.inGame ? wrapCount('period-pill__val') : undefined,
  });
  c.el.toggleAttribute('data-in-game', opts.inGame);
  const render = (p: PeriodPillProps): void => {
    kind = p.kind;
    c.setTotal(p.total);
  };
  render(props);
  // The label and the number format follow the language (review A11Y-I18N-1).
  const offLocale = onLocaleChanged(() => c.setTotal(c.total()));
  return {
    ...c,
    update: render,
    destroy() {
      offLocale();
      c.destroy();
    },
  };
}

/**
 * The period pill (§2.8): icon-trophy and this period's total, role="img", aria-label
 * period.pill.<kind> ("42 fish this week"). Not a button. Home's top-bar lead slot (after the FB safe zone).
 */
export function createPeriodPill(props: PeriodPillProps): View<PeriodPillProps> {
  const p = buildPeriodPill(props, { inGame: false, reduced: () => false });
  return { el: p.el, update: p.update, destroy: p.destroy };
}

// ─────────────────────────────── the fish loss (§1.3, §1.4) ───────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A droplet burst on the life's 24-unit grid: `deg` is the direction from straight up (clockwise),
 * `fly` the distance in grid units. CSS-style constants (parity-spec §0.4), ours.
 * Loss (§1.3): three droplets at −50°, −10°, +35°, 12 px (9 units); revive (§1.4): two droplets,
 * 10 px (7.5 units).
 */
export const LOSS_DROPS: readonly number[] = [-50, -10, 35];
export const POP_DROPS: readonly number[] = [-40, 40];
/** Grid units per CSS px at the 2c slot (32 px for the 24-unit icon); kept for the droplets' reach. */
const UNITS_PER_PX = 24 / 32;
export const LOSS_DROP_FLY = Math.round(12 * UNITS_PER_PX * 10) / 10;
export const POP_DROP_FLY = Math.round(10 * UNITS_PER_PX * 10) / 10;
/** Droplet radius and outline on the 24 grid (§1.3). */
const DROP_R = 1.2;
const DROP_LINE = 0.6;
/** The droplets start at the slot centre, a little above the fish's middle (the body is at y 7–17). */
const DROP_FROM: readonly [number, number] = [12, 10];

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/** `.life__splash`: the droplets, each with its flight in --dx / --dy (fx.css life-drop / life-pop-drop). */
function splash(dirs: readonly number[], fly: number): SVGSVGElement {
  const svg = svgEl('svg', { class: 'life__splash', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
  for (const deg of dirs) {
    const rad = (deg * Math.PI) / 180;
    const c = svgEl('circle', { class: 'life__drop', cx: String(DROP_FROM[0]), cy: String(DROP_FROM[1]), r: String(DROP_R), 'stroke-width': String(DROP_LINE) });
    c.style.setProperty('--dx', `${(Math.sin(rad) * fly).toFixed(2)}px`);
    c.style.setProperty('--dy', `${(-Math.cos(rad) * fly).toFixed(2)}px`);
    svg.appendChild(c);
  }
  return svg;
}

/** Extra time before the loss's nodes are removed (after the last keyframe). */
const CLEANUP_MS = 80;
/** The revive's droplets (§1.4: 300 ms). */
export const POP_SPLASH_MS = 300;
/** The revive pop (§1.4: 520 ms, as the heart's). */
export const LIFE_POP_MS = 520;

// ─────────────────────────────── the heads (look-spec §1.5, §1.6) ───────────────────────────────

/**
 * Measured pill geometry in s-units (look-spec §1.5): the row's inner width (402 − 2 × 12), the
 * column gap, the fish pill's insets and fish pitch and width, the head width and gap, and the inset
 * the head group keeps at each end of the heads pill when it has to shrink.
 */
const ROW_W = 378;
const ROW_GAP = 11.3;
const FISH_INSETS = 21;
const FISH_W = 24.7;
const FISH_PITCH = 25.3;
const HEAD_W = 21.33;
const HEAD_GAP = 4;
const HEAD_END = 10.5;

/**
 * The heads' scale (≤ 1) so `heads` heads fit in the heads pill next to a fish pill of `fish` fish:
 * the pill's width minus 10.5 at each end over the group's natural width. 1 for 10 heads and 3 fish;
 * 12 heads: 0.83 (head 17.7). Independent of s, since every width scales with s.
 */
export function headScale(heads: number, fish: number): number {
  const fishPill = FISH_INSETS + FISH_W + Math.max(0, fish - 1) * FISH_PITCH;
  const room = ROW_W - ROW_GAP - fishPill - 2 * HEAD_END;
  const natural = heads * HEAD_W + Math.max(0, heads - 1) * HEAD_GAP;
  return natural > 0 ? Math.max(0.3, Math.min(1, room / natural)) : 1;
}

/**
 * The colours on the board in heads order: the hue ring HEAD_ORDER rotated to the board's own start
 * (palette.ts headOrderFor; helpers-spec §6.5), each once. `ringId` null: no rotation (the tutorial).
 */
export function headColors(colors: ArrayLike<number>, n: number, ringId: string | null = null): number[] {
  const present: number[] = [];
  for (let r = 0; r < n; r++) present.push(Number(colors[r] ?? r));
  return headOrderFor(present, ringId);
}

/** Phase 2d.1 §2.7: the found head's dot (8 s, 1 s white rim) sits at the head centre + (7.8, 6.6) s. */
export const HEAD_DOT: readonly [dx: number, dy: number, size: number] = [7.8, 6.6, 8];

// ─────────────────────────────── pills row ───────────────────────────────

export function createPills(props: PillsProps): PillsView {
  const el = document.createElement('div');
  el.className = 'pills';
  el.style.setProperty('--t-life-loss', `${cfg.fx.lifeLossMs}ms`);
  el.style.setProperty('--t-life-hurt', `${cfg.fx.lifeLossPillMs}ms`);
  el.style.setProperty('--t-life-pop', `${LIFE_POP_MS}ms`);
  el.style.setProperty('--t-pop-splash', `${POP_SPLASH_MS}ms`);
  el.style.setProperty('--fade-ms', `${cfg.fx.win.fishPillFadeMs}ms`);
  el.style.setProperty('--head-ms', `${cfg.fx.headFoundMs}ms`);
  const heads = document.createElement('div');
  heads.className = 'pill pill--heads';
  heads.setAttribute('role', 'img');
  const lives = document.createElement('div');
  lives.className = 'pill pill--lives';
  lives.setAttribute('role', 'img');

  let current = props;
  const reduced = (): boolean => current.reducedMotion === true;
  // The in-game period counter (§2.1): hidden during play; 2d (§1.13): in the heads pill's place.
  const period = buildPeriodPill({ total: 0, kind: cfg.period.kind }, { inGame: true, reduced });
  period.el.hidden = true;
  let periodShown = false;
  // DOM (and reading) order: heads, the period counter (same cell), lives (hud.css places them).
  el.append(heads, period.el, lives);

  const timers: Timers = new Set();
  let slots: HTMLElement[] = [];
  /** Slots whose fish left for the win flight (§2.2): they stay empty whatever `hearts` says. */
  const departed = new Set<number>();
  /** Head per palette index, in heads order; rebuilt when the board's colour set changes. */
  let headEls = new Map<number, HTMLElement>();
  let headsKey = '';
  let boardId: string | undefined;
  /** Palette index → region label of the current board (for REGION_DONE). */
  let colorOf: (region: number) => number = (r) => r;

  const ensureSlots = (max: number): void => {
    if (slots.length === max) return;
    while (lives.firstChild) lives.removeChild(lives.firstChild);
    slots = [];
    for (let k = 0; k < max; k++) {
      const slot = document.createElement('span');
      slot.className = 'life';
      slot.append(icon('icon-fish-empty', { class: 'life__empty' }), icon('icon-fish', { class: 'life__full' }));
      slots.push(slot);
      lives.appendChild(slot);
    }
  };

  /** Rebuilds the heads for a new colour set; returns true when it did (a new board: no motion). */
  const ensureHeads = (p: PillsProps): boolean => {
    const colors = p.colors;
    const order = headColors(colors, p.n, p.ringId === undefined ? p.boardId : p.ringId);
    colorOf = (r) => Number(colors[r] ?? r);
    const key = order.join(',');
    if (key === headsKey) return false;
    headsKey = key;
    while (heads.firstChild) heads.removeChild(heads.firstChild);
    headEls = new Map();
    for (const c of order) {
      const head = document.createElement('span');
      head.className = 'head';
      head.dataset.color = String(c);
      // The region colour itself (a token, not a literal); hud.css draws the silhouette and the dot at 50 %.
      head.style.color = `var(--r${c})`;
      head.appendChild(icon('cat-head-flat', { class: 'head__shape' }));
      headEls.set(c, head);
      heads.appendChild(head);
    }
    return true;
  };

  /** §2.7: the found state: our cat face and the tint dot replace the silhouette (built on first use). */
  const setFound = (head: HTMLElement, on: boolean): void => {
    head.toggleAttribute('data-done', on);
    const face = head.querySelector('.head__face');
    if (on && !face) {
      const dot = document.createElement('span');
      dot.className = 'head__dot';
      head.append(icon('cat-idle', { class: 'head__face' }), dot);
    } else if (!on && face) {
      face.remove();
      head.querySelector('.head__dot')?.remove();
    }
  };

  const isFull = (k: number, p: PillsProps): boolean => k < p.hearts && !departed.has(k);

  /** A new board (§1.13): the heads are back and the period counter hides again. */
  const resetPeriod = (): void => {
    periodShown = false;
    period.el.hidden = true;
    period.el.classList.remove('period-pill--in');
    heads.hidden = false;
    heads.removeAttribute('data-out');
  };

  const render = (p: PillsProps): void => {
    current = p;
    // A board that is not complete is not in a win: a new board (next level, retry) refills the slots
    // and brings the heads back.
    if (p.catsPlaced < p.n) {
      if (departed.size > 0) {
        for (const k of departed) slots[k]?.removeAttribute('data-departed');
        departed.clear();
      }
      if (periodShown) resetPeriod();
    }
    ensureSlots(Math.max(0, p.maxHearts));
    const fresh = ensureHeads(p) || p.boardId !== boardId;
    boardId = p.boardId;
    heads.style.setProperty('--hk', String(Math.round(headScale(headEls.size, Math.max(1, p.maxHearts)) * 1000) / 1000));
    // Found colours (§1.6): full colour; a head that lost its cat fades back to the tint (150 ms).
    const done = new Set<number>();
    const bits = p.regionsDone;
    for (let r = 0; r < p.n; r++) if (bits & (1 << r)) done.add(colorOf(r));
    for (const [c, head] of headEls) {
      const was = head.hasAttribute('data-done');
      const now = done.has(c);
      if (was === now) continue;
      setFound(head, now);
      // A cat taken back: the silhouette cross-fades back (150 ms, no pop).
      if (!now && !fresh && !reduced()) restart(head, 'head--out', cfg.fx.reducedMotionFadeMs, timers);
    }
    heads.setAttribute('aria-label', t('game.cats.a11y', { placed: p.catsPlaced, n: p.n }));
    slots.forEach((s, k) => s.toggleAttribute('data-full', isFull(k, p)));
    // "2 of 3 fish left" (game.hearts.a11y, §1.1).
    lives.setAttribute('aria-label', t('game.hearts.a11y', { hearts: p.hearts, max: p.maxHearts }));
    lives.toggleAttribute('data-last', p.hearts === 1);
  };
  render(props);

  /**
   * §1.3 fish loss: the full fish hides at once and a stand-in (.life__lost) wriggles, hops, falls
   * belly-up and fades while three droplets burst and the empty outline fades in (fx.css, one
   * --t-life-loss timeline). Reduced motion keeps the 150 ms full → empty swap (CSS transition) only.
   */
  const loseLife = (slot: HTMLElement): void => {
    for (const old of Array.from(slot.querySelectorAll('.life__lost, .life__splash'))) old.remove();
    slot.classList.remove('life--pop');
    if (reduced()) return;
    const lost = icon('icon-fish', { class: 'life__lost' });
    const drops = splash(LOSS_DROPS, LOSS_DROP_FLY);
    slot.append(lost, drops);
    restart(slot, 'life--lose', cfg.fx.lifeLossMs, timers);
    later(timers, cfg.fx.lifeLossMs + CLEANUP_MS, () => {
      lost.remove();
      drops.remove();
    });
  };

  /** §1.4: the restored fish pops back (scale 0.4 → 1.15 → 1) with two droplets; reduced motion: instant. */
  const popLife = (slot: HTMLElement): void => {
    for (const old of Array.from(slot.querySelectorAll('.life__lost, .life__splash'))) old.remove();
    slot.classList.remove('life--lose');
    if (reduced()) return;
    const drops = splash(POP_DROPS, POP_DROP_FLY);
    slot.appendChild(drops);
    restart(slot, 'life--pop', LIFE_POP_MS, timers);
    later(timers, Math.max(LIFE_POP_MS, POP_SPLASH_MS) + CLEANUP_MS, () => drops.remove());
  };

  const showPeriodCounter = (n: number): void => {
    if (!periodShown) {
      periodShown = true;
      period.setTotal(n);
      period.el.hidden = false;
      // §1.13: over the heads pill, whose heads fade out over the same fishPillFadeMs.
      if (reduced()) {
        heads.hidden = true;
      } else {
        restart(period.el, 'period-pill--in', cfg.fx.win.fishPillFadeMs, timers);
        heads.setAttribute('data-out', '');
        later(timers, cfg.fx.win.fishPillFadeMs, () => {
          if (periodShown) heads.hidden = true;
        });
      }
      return;
    }
    const before = period.total();
    period.setTotal(n, before >= 0 ? before : undefined);
  };
  const periodRect = (): DOMRect | null => (periodShown ? period.iconRect() : null);
  const periodLabel = (text: string): void => {
    if (periodShown) period.chip(text);
  };

  return {
    el,
    update: render,
    playEvent(ev) {
      if (ev.type === 'MISTAKE') {
        const slot = slots[ev.heartsLeft];
        if (!slot) return;
        loseLife(slot);
        if (!reduced()) restart(lives, 'pill--hurt', cfg.fx.lifeLossPillMs, timers);
      } else if (ev.type === 'REVIVED') {
        const full = slots.filter((s) => s.hasAttribute('data-full'));
        const slot = full[full.length - 1];
        if (slot) popLife(slot);
      } else if (ev.type === 'REGION_DONE') {
        // 2d.1 §2.7: the colour's head becomes the face + dot (the props may already say so) and pops.
        const head = headEls.get(colorOf(ev.region));
        if (!head) return;
        setFound(head, true);
        head.classList.remove('head--out');
        if (!reduced()) restart(head, 'head--pop', cfg.fx.headFoundMs, timers);
      }
    },
    lifeSlots() {
      if (!el.isConnected || el.hidden || lives.hidden) return [];
      const out: LifeSlotRect[] = [];
      for (let k = slots.length - 1; k >= 0; k--) {
        const s = slots[k] as HTMLElement;
        if (!s.hasAttribute('data-full')) continue;
        const full = s.querySelector('.life__full');
        if (full) out.push({ slot: k, rect: full.getBoundingClientRect() });
      }
      return out;
    },
    departLife(k) {
      const s = slots[k];
      if (!s || departed.has(k)) return;
      departed.add(k);
      // At once (§2.2: "no loss animation"): no transition, and any running loss or pop is dropped.
      s.setAttribute('data-departed', '');
      s.classList.remove('life--lose', 'life--pop');
      for (const old of Array.from(s.querySelectorAll('.life__lost, .life__splash'))) old.remove();
      s.removeAttribute('data-full');
    },
    showPeriodCounter,
    periodRect,
    periodLabel,
    destroy() {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      period.destroy();
      el.parentNode?.removeChild(el);
    },
  };
}
