// Owner: B (Phase 2b); G2 (Phase 2c; Phase 2c.1: the level-points counter)
// The pills row of the game screen (02 §5 S2): the cat counter and the LIVES pill. Phase 2c
// (docs/phase2c/fish-lives-spec.md §1, §2): the lives are fish. Each life slot holds our icon-fish
// and the new icon-fish-empty outline; a MISTAKE plays our fish loss (wriggle, flip out belly-up,
// three droplets, the empty outline fading in; reduced motion: a 150 ms swap), a REVIVED pops the
// restored fish back with a small splash. In the win flow the fish still in the pill lift off one by
// one (departLife) and fly to the PERIOD COUNTER (this period's leaderboard points); it counts up per
// arrival with a roll and a bump, and a "+N" chip rises.
// Phase 2c.1 (§10.2–§10.3): the row is a three-column grid (1fr auto 1fr). Column 2 holds the LEVEL
// POINTS counter (icon-points + the running total of this attempt, hidden when PillsProps.points is
// null or absent), exactly centred; a POINTS event rolls it from total − gained to total, bumps the
// icon and raises a "+576" chip (one at a time). At the win (catsPlaced ≥ n) it gets data-final. The
// period counter now appears in column 1, in the cat counter's cell, while the cat counter fades out;
// a new board brings the cat counter back. When the row still overflows (OS text scaling, a long
// count, more lives) .pills[data-tight] drops the counter's icon (1), then steps its digits down (2).
// The period counter and the points counter are one builder (buildCounter): the same roll, bump and
// chip code (bundle budget, §10.9).
// The same period pill (icon-trophy + the period total, not a button) sits on Home (createPeriodPill).
// Identifiers keep "hearts" where they cross into G1 or are stored (PillsProps.hearts / maxHearts,
// spec §0.5): hearts = lives = fish.
// Classes: .pills[data-compact][data-tight] > .pill.pill--cats(.pill__icon .pill__count)[data-out]
//            .period-pill[data-in-game] .points-pill[data-final]
//            .pill.pill--lives[data-last] > .life[data-full][data-departed]
//          .life > svg.life__empty (icon-fish-empty) svg.life__full (icon-fish)
//                  (+ during a loss: .life--lose > svg.life__lost (the falling fish) svg.life__splash > circle.life__drop)
//                  (+ on a revive: .life--pop > svg.life__splash)
//          .period-pill > .period-pill__icon .period-pill__count > .period-pill__n ; .period-pill__label > .period-pill__chip
//          .points-pill > .points-pill__icon .points-pill__count > .points-pill__n ; .points-pill__label > .points-pill__chip
// Keyframes and the CSS-only constants of the fish loss: src/styles/fx.css (--t-life-loss from
// fx.lifeLossMs, --t-life-hurt from fx.lifeLossPillMs); layout: hud.css (row, lives, points counter),
// screens.css (period pill).
import { cfg, type PeriodKind } from '../../app/config';
import type { GameEvent } from '../../game/types';
import { formatNumber, onLocaleChanged, t } from '../../i18n';
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
  readonly compact: boolean;
  /** Reduced motion (§1.3): the fish loss becomes a 150 ms swap; no roll or rise. Default false. */
  readonly reducedMotion?: boolean;
  /**
   * Phase 2c.1 §10.2: level points of this attempt, set WITHOUT animation (first render, restore,
   * Retry, a new board, a language change); only playEvent(POINTS) animates. null or absent hides the
   * counter (the tutorial, a mode outside levelPoints.modes). Required since 2c.1 I-3.
   */
  readonly points: number | null;
}

/** A full life slot and its icon's client rect (the win flight's source, §2.3). */
export interface LifeSlotRect {
  readonly slot: number;
  readonly rect: DOMRect;
}

export interface PillsView extends View<PillsProps> {
  /**
   * MISTAKE → the fish loss of slot `heartsLeft` (§1.3); REVIVED → the restored fish pops back (§1.4).
   * Phase 2c.1: POINTS → the counter rolls from total − gained to total, its icon bumps and a
   * "+gained" chip rises (ignored while the counter is hidden).
   */
  playEvent(ev: GameEvent): void;
  /** Full life slots in departure order (highest slot first), with their icon's client rect; [] while hidden. */
  lifeSlots(): readonly LifeSlotRect[];
  /** The life in `slot` leaves for the win flight: it shows empty at once, no loss animation. Idempotent. */
  departLife(slot: number): void;
  /**
   * Win flow: shows the period counter (fade in at the first call), later calls with a higher total
   * roll + bump. Phase 2c.1: it shows in the cat counter's cell (column 1) while the cat counter fades out.
   */
  showPeriodCounter(total: number): void;
  /** Client rect of the counter's icon (flight target), null while hidden. */
  periodRect(): DOMRect | null;
  /** The rising "+N" chip at the counter. */
  periodLabel(text: string): void;
}

// ─────────────────────────────── counters (§2.1, §2.8; 2c.1 §10.2) ───────────────────────────────

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
 * The motion of one counter, from config: [roll (and icon bump) ms, chip ms, chip rise px, reduced
 * chip fade-in ms, reduced chip fade-out ms]. A tuple, not an object: its keys would stay in the
 * main bundle (budget, §10.9).
 */
type CounterMotion = readonly [rollMs: number, chipMs: number, risePx: number, reducedInMs: number, reducedOutMs: number];

/** What makes a counter a period pill or the level-points pill. */
interface CounterSpec {
  /** The block class: 'period-pill' or 'points-pill' (every part is `${cls}__…`). */
  readonly cls: 'period-pill' | 'points-pill';
  readonly icon: 'icon-trophy' | 'icon-points';
  /** The pill's accessible name for a total (role="img"). */
  label(total: number): string;
  motion(): CounterMotion;
  reduced(): boolean;
}

/** A counter pill: an icon and a number that can roll up, plus the rising chip. */
interface Counter {
  readonly el: HTMLElement;
  /**
   * Shows `next` and re-reads the accessible name and the number's format (so it also relabels after
   * a language change). With `rollFrom` (and no reduced motion) the number rolls up from `rollFrom`
   * and the icon bumps.
   */
  setTotal(next: number, rollFrom?: number): void;
  /** The current total (−1 before the first set). */
  total(): number;
  /** The rising chip ("+3", "+576"); a newer chip replaces a running one. */
  chip(text: string): void;
  /** Client rect of the pill's icon; null while hidden or detached. */
  iconRect(): DOMRect | null;
  destroy(): void;
}

function buildCounter(spec: CounterSpec): Counter {
  const { cls } = spec;
  const timers: Timers = new Set();
  const el = document.createElement('div');
  el.className = cls;
  // Not a button (§2.8 [DECISION]; §10.2): an image of the total, read on demand, never a live region.
  el.setAttribute('role', 'img');
  const mark = icon(spec.icon, { class: `${cls}__icon` });
  const countBox = document.createElement('span');
  countBox.className = `${cls}__count num`;
  countBox.setAttribute('aria-hidden', 'true');
  let numEl = document.createElement('span');
  numEl.className = `${cls}__n`;
  countBox.appendChild(numEl);
  el.append(mark, countBox);

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
    // number slides out upward, the new one slides in from below; the icon bumps. A newer roll first
    // settles a running one (the outgoing number goes, the incoming one rests), so the box never
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
    chip(text) {
      const [, chipMs, risePx, inMs, outMs] = spec.motion();
      const rm = spec.reduced();
      chipEl?.remove();
      // A small opaque chip that pops out of the pill's top edge and rises (clean over the top bar).
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
      el.appendChild(span);
      chipEl = span;
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
    iconRect: () => (el.isConnected && !el.hidden ? mark.getBoundingClientRect() : null),
    destroy() {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      el.parentNode?.removeChild(el);
    },
  };
}

const periodMotion = (): CounterMotion => {
  const W = cfg.fx.win;
  return [W.counterBumpMs, W.plusLabelMs, W.plusLabelRisePx, W.reduced.plusLabelInMs, W.reduced.plusLabelOutMs];
};

const pointsMotion = (): CounterMotion => {
  const P = cfg.fx.levelPoints;
  return [P.rollMs, P.plusMs, P.plusRisePx, P.reducedPlusInMs, P.reducedPlusOutMs];
};

/** The period pill (Home and the win flow's counter): icon-trophy and this period's total. */
function buildPeriodPill(props: PeriodPillProps, opts: { inGame: boolean; reduced: () => boolean }): Counter & View<PeriodPillProps> {
  let kind = props.kind;
  const c = buildCounter({ cls: 'period-pill', icon: 'icon-trophy', label: (n) => periodPillLabel(kind, n), motion: periodMotion, reduced: opts.reduced });
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
/** Grid units per CSS px: the 28 px life slot draws its 24-unit icons at 114 % (hud.css .life .icon). */
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

// ─────────────────────────────── pills row ───────────────────────────────

/** Steps of the tight fallback (§10.2): 1 drops the points counter's icon, 2 also steps its digits down. */
export const TIGHT_STEPS = 2;

export function createPills(props: PillsProps): PillsView {
  const el = document.createElement('div');
  el.className = 'pills';
  el.style.setProperty('--t-life-loss', `${cfg.fx.lifeLossMs}ms`);
  el.style.setProperty('--t-life-hurt', `${cfg.fx.lifeLossPillMs}ms`);
  el.style.setProperty('--t-life-pop', `${LIFE_POP_MS}ms`);
  el.style.setProperty('--t-pop-splash', `${POP_SPLASH_MS}ms`);
  el.style.setProperty('--fade-ms', `${cfg.fx.win.fishPillFadeMs}ms`);
  const cats = document.createElement('div');
  cats.className = 'pill pill--cats';
  cats.setAttribute('role', 'img');
  const count = document.createElement('span');
  count.className = 'pill__count';
  cats.append(icon('cat-idle', { class: 'pill__icon' }), count);
  const lives = document.createElement('div');
  lives.className = 'pill pill--lives';
  lives.setAttribute('role', 'img');

  let current = props;
  const reduced = (): boolean => current.reducedMotion === true;
  // The in-game period counter (§2.1): hidden during play; 2c.1 (§10.3): in the cat counter's cell.
  const period = buildPeriodPill({ total: 0, kind: cfg.period.kind }, { inGame: true, reduced });
  period.el.hidden = true;
  let periodShown = false;
  // The level-points counter (2c.1 §10.2): the row's middle column; "Level points: 2,016".
  const points = buildCounter({
    cls: 'points-pill',
    icon: 'icon-points',
    label: (n) => t('game.points.a11y', { count: formatNumber(n) }),
    motion: pointsMotion,
    reduced,
  });
  points.el.hidden = true;
  // It shares the white pill's base rule (.pill: box, shadow, digits; hud.css) with its neighbours.
  points.el.classList.add('pill');
  // DOM (and reading) order: cats, the period counter (same cell), points, lives (hud.css places them).
  el.append(cats, period.el, points.el, lives);

  const timers: Timers = new Set();
  let slots: HTMLElement[] = [];
  /** Slots whose fish left for the win flight (§2.2): they stay empty whatever `hearts` says. */
  const departed = new Set<number>();
  let prev: PillsProps | null = null;

  // ── the tight fallback (§10.2): measured on the next frame after a change that can widen the row
  // (never a forced layout inside a render), and on resize. 1 px of slack for sub-pixel rounding.
  const win = el.ownerDocument.defaultView;
  let tightRaf = 0;
  let tightQueued = false;
  let tightFor = '';
  const measureTight = (): void => {
    tightQueued = false;
    if (!el.isConnected || el.clientWidth <= 0) return;
    el.removeAttribute('data-tight');
    for (let step = 1; step <= TIGHT_STEPS && el.scrollWidth > el.clientWidth + 1; step++) el.dataset.tight = String(step);
  };
  const scheduleTight = (): void => {
    if (tightQueued || !win?.requestAnimationFrame) return;
    tightQueued = true;
    tightRaf = win.requestAnimationFrame(measureTight);
  };
  win?.addEventListener('resize', scheduleTight);

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

  const isFull = (k: number, p: PillsProps): boolean => k < p.hearts && !departed.has(k);

  /** A new board (§10.3): the cat counter is back in column 1 and the period counter hides again. */
  const resetPeriod = (): void => {
    periodShown = false;
    period.el.hidden = true;
    period.el.classList.remove('period-pill--in');
    cats.hidden = false;
    cats.removeAttribute('data-out');
  };

  const render = (p: PillsProps): void => {
    current = p;
    // A board that is not complete is not in a win: a new board (next level, retry) refills the slots
    // and brings the cat counter back.
    if (p.catsPlaced < p.n) {
      if (departed.size > 0) {
        for (const k of departed) slots[k]?.removeAttribute('data-departed');
        departed.clear();
      }
      if (periodShown) resetPeriod();
    }
    ensureSlots(Math.max(0, p.maxHearts));
    el.toggleAttribute('data-compact', p.compact);
    const text = t('game.cats', { placed: p.catsPlaced, n: p.n });
    if (count.textContent !== text) count.textContent = text;
    cats.setAttribute('aria-label', t('game.cats.a11y', { placed: p.catsPlaced, n: p.n }));
    const complete = p.catsPlaced >= p.n && p.n > 0;
    cats.toggleAttribute('data-complete', complete);
    if (prev && p.catsPlaced > prev.catsPlaced) restart(cats, 'pill--bump', 360, timers);
    slots.forEach((s, k) => s.toggleAttribute('data-full', isFull(k, p)));
    // "2 of 3 fish left" (game.hearts.a11y, §1.1).
    lives.setAttribute('aria-label', t('game.hearts.a11y', { hearts: p.hearts, max: p.maxHearts }));
    lives.toggleAttribute('data-last', p.hearts === 1);
    // The level points (§10.2): set without animation (only POINTS animates); hidden when unscored.
    const pts = typeof p.points === 'number' && p.points >= 0 ? Math.floor(p.points) : null;
    points.el.hidden = pts === null;
    // setTotal only writes a number that changed; it also relabels after a language change.
    if (pts !== null) points.setTotal(pts);
    // The level's total is final at the win: it keeps the highlight until the board changes.
    points.el.toggleAttribute('data-final', pts !== null && complete);
    const key = `${text}|${pts === null ? '' : formatNumber(pts)}|${p.compact}|${p.maxHearts}|${periodShown}`;
    if (key !== tightFor) {
      tightFor = key;
      scheduleTight();
    }
    prev = p;
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
      // §10.3: in column 1, where the cat counter ("n / n") fades out over the same fishPillFadeMs.
      if (reduced()) {
        cats.hidden = true;
      } else {
        restart(period.el, 'period-pill--in', cfg.fx.win.fishPillFadeMs, timers);
        cats.setAttribute('data-out', '');
        later(timers, cfg.fx.win.fishPillFadeMs, () => {
          if (periodShown) cats.hidden = true;
        });
      }
      scheduleTight();
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
      } else if (ev.type === 'POINTS') {
        // §10.2: roll from total − gained to total, bump, "+576". No sound or vibration of its own (D23).
        if (points.el.hidden || !(ev.gained > 0)) return;
        points.setTotal(ev.total, ev.total - ev.gained);
        points.chip(t('fish.plus', { count: formatNumber(ev.gained) }));
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
      if (tightQueued) win?.cancelAnimationFrame(tightRaf);
      win?.removeEventListener('resize', scheduleTight);
      period.destroy();
      points.destroy();
      el.parentNode?.removeChild(el);
    },
  };
}
