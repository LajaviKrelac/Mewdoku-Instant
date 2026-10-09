// Owner: B (Phase 2b); G2 (Phase 2c)
// The pills row of the game screen (02 §5 S2): the cat counter and the LIVES pill. Phase 2c
// (docs/phase2c/fish-lives-spec.md §1, §2): the lives are fish. Each life slot holds our icon-fish
// and the new icon-fish-empty outline; a MISTAKE plays our fish loss (wriggle, flip out belly-up,
// three droplets, the empty outline fading in; reduced motion: a 150 ms swap), a REVIVED pops the
// restored fish back with a small splash. In the win flow the fish still in the pill lift off one by
// one (departLife) and fly to the PERIOD COUNTER (this period's leaderboard points), which fades in
// centred in the row; it counts up per arrival with a roll and a bump, and a "+N" chip rises.
// The same period pill (icon-trophy + the period total, not a button) sits on Home (createPeriodPill).
// Identifiers keep "hearts" where they cross into G1 or are stored (PillsProps.hearts / maxHearts,
// spec §0.5): hearts = lives = fish.
// Classes: .pills[data-compact] > .pill.pill--cats(.pill__icon .pill__count) .period-pill[data-in-game]
//            .pill.pill--lives[data-last] > .life[data-full][data-departed]
//          .life > svg.life__empty (icon-fish-empty) svg.life__full (icon-fish)
//                  (+ during a loss: .life--lose > svg.life__lost (the falling fish) svg.life__splash > circle.life__drop)
//                  (+ on a revive: .life--pop > svg.life__splash)
//          .period-pill[data-in-game] > .period-pill__icon .period-pill__count > .period-pill__n ; .period-pill__label > .period-pill__chip
// Keyframes and the CSS-only constants of the fish loss: src/styles/fx.css (--t-life-loss from
// fx.lifeLossMs, --t-life-hurt from fx.lifeLossPillMs); layout: hud.css (lives), screens.css (period pill).
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
}

/** A full life slot and its icon's client rect (the win flight's source, §2.3). */
export interface LifeSlotRect {
  readonly slot: number;
  readonly rect: DOMRect;
}

export interface PillsView extends View<PillsProps> {
  /** MISTAKE → the fish loss of slot `heartsLeft` (§1.3); REVIVED → the restored fish pops back (§1.4). */
  playEvent(ev: GameEvent): void;
  /** Full life slots in departure order (highest slot first), with their icon's client rect; [] while hidden. */
  lifeSlots(): readonly LifeSlotRect[];
  /** The life in `slot` leaves for the win flight: it shows empty at once, no loss animation. Idempotent. */
  departLife(slot: number): void;
  /** Win flow: shows the period counter (fade in at the first call), later calls with a higher total roll + bump. */
  showPeriodCounter(total: number): void;
  /** Client rect of the counter's icon (flight target), null while hidden. */
  periodRect(): DOMRect | null;
  /** The rising "+N" chip at the counter. */
  periodLabel(text: string): void;
}

// ─────────────────────────────── period pill (§2.1, §2.8) ───────────────────────────────

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

/** The period pill plus the in-game behaviours (roll, bump, rising label), shared by both factories. */
interface PeriodPillInternal extends View<PeriodPillProps> {
  /** Sets the total; `roll` animates the number up and bumps the icon (an arrival). */
  setTotal(total: number, roll: boolean): void;
  /** The rising "+3" chip. */
  label(text: string): void;
  /** Client rect of the pill's trophy icon; null while hidden or detached. */
  iconRect(): DOMRect | null;
}

function buildPeriodPill(props: PeriodPillProps, opts: { inGame: boolean; reduced: () => boolean }): PeriodPillInternal {
  const timers: Timers = new Set();
  const el = document.createElement('div');
  el.className = 'period-pill';
  el.toggleAttribute('data-in-game', opts.inGame);
  // Not a button (§2.8 [DECISION]): an image of this period's total, read as "42 fish this week".
  el.setAttribute('role', 'img');
  const trophy = icon('icon-trophy', { class: 'period-pill__icon' });
  const countBox = document.createElement('span');
  countBox.className = 'period-pill__count num';
  countBox.setAttribute('aria-hidden', 'true');
  let numEl = document.createElement('span');
  numEl.className = 'period-pill__n';
  countBox.appendChild(numEl);
  el.append(trophy, countBox);

  let kind = props.kind;
  let total = -1;
  const relabel = (): void => el.setAttribute('aria-label', periodPillLabel(kind, Math.max(0, total)));

  const setTotal = (next: number, roll: boolean): void => {
    const text = formatNumber(next);
    const animate = roll && next > total && total >= 0 && !opts.reduced();
    total = next;
    relabel();
    if (!animate) {
      if (numEl.textContent !== text) numEl.textContent = text;
      return;
    }
    // The number roll (§2.2 "counter + pointsPerFish (roll + bump)"): the old number slides out
    // upward, the new one slides in from below; the trophy bumps for fx.win.counterBumpMs. Arrivals
    // come every fx.win.fishStaggerMs (150), faster than a roll: a new one first settles the running
    // roll (the outgoing number goes, the incoming one rests), so the box never holds more than two.
    for (const gone of Array.from(countBox.querySelectorAll('.is-out'))) gone.remove();
    const old = numEl;
    old.classList.remove('is-in');
    old.classList.add('is-out');
    numEl = document.createElement('span');
    numEl.className = 'period-pill__n is-in';
    numEl.textContent = text;
    countBox.appendChild(numEl);
    const fresh = numEl;
    later(timers, cfg.fx.win.counterBumpMs, () => {
      old.remove();
      fresh.classList.remove('is-in');
    });
    restart(el, 'period-pill--bump', cfg.fx.win.counterBumpMs, timers);
  };

  el.style.setProperty('--bump-ms', `${cfg.fx.win.counterBumpMs}ms`);
  const render = (p: PeriodPillProps): void => {
    kind = p.kind;
    if (p.total !== total) setTotal(p.total, false);
    else relabel();
  };
  render(props);
  // The label and the number format follow the language (review A11Y-I18N-1).
  const offLocale = onLocaleChanged(() => {
    if (total < 0) return;
    relabel();
    numEl.textContent = formatNumber(total);
  });

  return {
    el,
    update: render,
    setTotal,
    label(text) {
      const W = cfg.fx.win;
      const rm = opts.reduced();
      // A small opaque chip that pops out of the pill's top edge and rises (clean over the top bar).
      const span = document.createElement('span');
      span.className = 'period-pill__label';
      span.setAttribute('aria-hidden', 'true');
      const chip = document.createElement('b');
      chip.className = 'period-pill__chip num';
      chip.textContent = text;
      span.appendChild(chip);
      span.toggleAttribute('data-reduced', rm);
      const ms = rm ? W.reduced.plusLabelInMs + W.reduced.plusLabelOutMs : W.plusLabelMs;
      span.style.setProperty('--label-ms', `${ms}ms`);
      span.style.setProperty('--label-rise', `${-W.plusLabelRisePx}px`);
      el.appendChild(span);
      // Reduced motion (§2.4): fade in and out in place, on WAAPI (the global reduced-motion CSS rule
      // would cut a CSS animation to 1 ms).
      if (rm && typeof span.animate === 'function') {
        try {
          span.animate([{ opacity: 0 }, { opacity: 1, offset: W.reduced.plusLabelInMs / ms }, { opacity: 0 }], { duration: ms, easing: 'linear', fill: 'both' });
        } catch {
          // the label simply shows until it is removed
        }
      }
      later(timers, ms, () => span.remove());
    },
    iconRect: () => (el.isConnected && !el.hidden ? trophy.getBoundingClientRect() : null),
    destroy() {
      offLocale();
      for (const id of timers) clearTimeout(id);
      timers.clear();
      el.parentNode?.removeChild(el);
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

export function createPills(props: PillsProps): PillsView {
  const el = document.createElement('div');
  el.className = 'pills';
  el.style.setProperty('--t-life-loss', `${cfg.fx.lifeLossMs}ms`);
  el.style.setProperty('--t-life-hurt', `${cfg.fx.lifeLossPillMs}ms`);
  el.style.setProperty('--t-life-pop', `${LIFE_POP_MS}ms`);
  el.style.setProperty('--t-pop-splash', `${POP_SPLASH_MS}ms`);
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
  // The in-game period counter (§2.1): between the two pills, hidden during play.
  const period = buildPeriodPill({ total: 0, kind: cfg.period.kind }, { inGame: true, reduced });
  period.el.hidden = true;
  let periodShown = false;
  el.append(cats, period.el, lives);

  const timers: Timers = new Set();
  let slots: HTMLElement[] = [];
  /** Slots whose fish left for the win flight (§2.2): they stay empty whatever `hearts` says. */
  const departed = new Set<number>();
  let prev: PillsProps | null = null;

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

  const render = (p: PillsProps): void => {
    current = p;
    // A board that is not complete is not in a win: a new board (next level, retry) refills the slots.
    if (p.catsPlaced < p.n && departed.size > 0) {
      for (const k of departed) slots[k]?.removeAttribute('data-departed');
      departed.clear();
    }
    ensureSlots(Math.max(0, p.maxHearts));
    el.toggleAttribute('data-compact', p.compact);
    const text = t('game.cats', { placed: p.catsPlaced, n: p.n });
    if (count.textContent !== text) count.textContent = text;
    cats.setAttribute('aria-label', t('game.cats.a11y', { placed: p.catsPlaced, n: p.n }));
    cats.toggleAttribute('data-complete', p.catsPlaced >= p.n && p.n > 0);
    if (prev && p.catsPlaced > prev.catsPlaced) restart(cats, 'pill--bump', 360, timers);
    slots.forEach((s, k) => s.toggleAttribute('data-full', isFull(k, p)));
    // "2 of 3 fish left" (game.hearts.a11y, §1.1).
    lives.setAttribute('aria-label', t('game.hearts.a11y', { hearts: p.hearts, max: p.maxHearts }));
    lives.toggleAttribute('data-last', p.hearts === 1);
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
      period.setTotal(n, false);
      period.el.style.setProperty('--fade-ms', `${cfg.fx.win.fishPillFadeMs}ms`);
      period.el.hidden = false;
      if (!reduced()) restart(period.el, 'period-pill--in', cfg.fx.win.fishPillFadeMs, timers);
      return;
    }
    period.setTotal(n, true);
  };
  const periodRect = (): DOMRect | null => (periodShown ? period.iconRect() : null);
  const periodLabel = (text: string): void => {
    if (periodShown) period.label(text);
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
