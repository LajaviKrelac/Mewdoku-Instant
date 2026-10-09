// Owner: B (Phase 2b)
// Cat counter and hearts pills (02 §5 S2), the heart break on MISTAKE (phase2b §2.9: shake, white
// zigzag crack, falling halves and shards, the empty outline fading in; reduced motion: a 150 ms
// swap), and the fish pill (phase2b §2.2, §2.5): a shared component on Home, in the game's pills row
// during the win flow only, and on the victory screen.
// Classes: .pills[data-compact] > .pill.pill--cats(.pill__icon .pill__count) .fish-pill? .pill.pill--hearts > .heart[data-full]
//          .fish-pill[data-plus][data-in-game] > .fish-pill__main(.fish-pill__icon .fish-pill__count > .fish-pill__n) .fish-pill__plus
//          .heart.heart--break > .heart__crack(.heart__shake > .heart__half--l|r .heart__zig) .heart__shard
// Keyframes and timing variables: src/styles/fx.css (break, roll, bump, rising label); layout:
// src/styles/screens.css (fish pill).
import { cfg } from '../../app/config';
import type { GameEvent } from '../../game/types';
import { formatNumber, onLocaleChanged, t, tn } from '../../i18n';
import { icon } from '../art/sprite';
import type { View } from '../dom';

export interface PillsProps {
  readonly catsPlaced: number;
  readonly n: number;
  readonly hearts: number;
  readonly maxHearts: number;
  readonly compact: boolean;
  /** Reduced motion (phase2b §2.9): the heart break becomes a 150 ms swap; no roll or rise. Default false. */
  readonly reducedMotion?: boolean;
}

export interface PillsView extends View<PillsProps> {
  /** MISTAKE → break the heart that was lost; REVIVED → refill animation. */
  playEvent(ev: GameEvent): void;
  /**
   * Win flow only (phase2b §2.2 t = 1 000): fades the fish pill in, centred between the cat counter
   * and the hearts (no "+"), showing `count`. A later call with a higher count is an arrival: the
   * number rolls up and the icon bumps (fx.win.counterBumpMs). Hidden during play.
   */
  showFish(count: number): void;
  /** Client rect of the fish pill's icon (the flight target), or null while it is hidden. */
  fishRect(): DOMRect | null;
  /** The "+3" / "+2" label that rises fx.win.plusLabelRisePx from the pill and fades (fx.win.plusLabelMs). */
  fishLabel(text: string): void;
}

// ─────────────────────────────── fish pill (phase2b §2.5) ───────────────────────────────

export interface FishPillProps {
  /** Wallet fish (formatted with i18n formatNumber); aria-label "128 fish" (tn('fish.count')). */
  readonly count: number;
  /** The "+" button that opens the shop (Home, victory); null = no "+" (in game). */
  readonly onPlus: (() => void) | null;
}

export interface FishPillView extends View<FishPillProps> {
  /** Client rect of the pill's fish icon. */
  iconRect(): DOMRect | null;
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

/** The fish pill plus the in-game behaviours (roll, bump, rising label), shared by both factories. */
interface FishPillInternal extends FishPillView {
  /** Sets the count; `roll` animates the number up and bumps the icon (an arrival). */
  setCount(count: number, roll: boolean): void;
  /** The rising "+3" label. */
  label(text: string): void;
}

function buildFishPill(props: FishPillProps, opts: { inGame: boolean; reduced: () => boolean }): FishPillInternal {
  const timers: Timers = new Set();
  const el = document.createElement('div');
  el.className = 'fish-pill';
  el.toggleAttribute('data-in-game', opts.inGame);
  const main = document.createElement('span');
  main.className = 'fish-pill__main';
  main.setAttribute('role', 'img');
  const fishIcon = icon('icon-fish', { class: 'fish-pill__icon' });
  const countBox = document.createElement('span');
  countBox.className = 'fish-pill__count num';
  let numEl = document.createElement('span');
  numEl.className = 'fish-pill__n';
  countBox.appendChild(numEl);
  main.append(fishIcon, countBox);
  el.appendChild(main);

  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'fish-pill__plus';
  const relabelPlus = (): void => plus.setAttribute('aria-label', t('shop.title'));
  relabelPlus();
  plus.appendChild(icon('icon-plus', { class: 'fish-pill__plus-icon' }));
  let onPlus = props.onPlus;
  plus.addEventListener('click', () => onPlus?.());
  el.appendChild(plus);

  let count = -1;
  const label = (n: number): void => {
    // "1,240 fish": the plural follows the number, the text shows it formatted.
    main.setAttribute('aria-label', tn('fish.count', n, { count: formatNumber(n) }));
  };

  const setCount = (next: number, roll: boolean): void => {
    const text = formatNumber(next);
    const animate = roll && next > count && count >= 0 && !opts.reduced();
    count = next;
    label(next);
    if (!animate) {
      if (numEl.textContent !== text) numEl.textContent = text;
      return;
    }
    // Number roll (§2.2 "the pill count goes +1 each time"): the old number slides out upward, the
    // new one slides in from below; the icon bumps for fx.win.counterBumpMs.
    const old = numEl;
    old.classList.add('is-out');
    numEl = document.createElement('span');
    numEl.className = 'fish-pill__n is-in';
    numEl.textContent = text;
    countBox.appendChild(numEl);
    const fresh = numEl;
    later(timers, cfg.fx.win.counterBumpMs, () => {
      old.remove();
      fresh.classList.remove('is-in');
    });
    restart(el, 'fish-pill--bump', cfg.fx.win.counterBumpMs, timers);
  };

  const render = (p: FishPillProps): void => {
    onPlus = p.onPlus;
    plus.hidden = p.onPlus === null;
    el.toggleAttribute('data-plus', p.onPlus !== null);
    if (p.count !== count) setCount(p.count, false);
  };
  el.style.setProperty('--bump-ms', `${cfg.fx.win.counterBumpMs}ms`);
  render(props);
  // The labels and the number format follow the language (review A11Y-I18N-1).
  const offLocale = onLocaleChanged(() => {
    relabelPlus();
    if (count < 0) return;
    label(count);
    numEl.textContent = formatNumber(count);
  });

  return {
    el,
    update: render,
    setCount,
    label(text) {
      const W = cfg.fx.win;
      const rm = opts.reduced();
      // A small chip that pops out of the pill's centre and rises (an opaque chip, so it stays clean
      // when it passes over the top bar's title).
      const span = document.createElement('span');
      span.className = 'fish-pill__label';
      span.setAttribute('aria-hidden', 'true');
      const chip = document.createElement('b');
      chip.className = 'fish-pill__chip num';
      chip.textContent = text;
      span.appendChild(chip);
      span.toggleAttribute('data-reduced', rm);
      const ms = rm ? W.reduced.plusLabelInMs + W.reduced.plusLabelOutMs : W.plusLabelMs;
      span.style.setProperty('--label-ms', `${ms}ms`);
      span.style.setProperty('--label-rise', `${-W.plusLabelRisePx}px`);
      el.appendChild(span);
      // Reduced motion (§2.7): fade in and out in place, on WAAPI (the global reduced-motion CSS rule
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
    iconRect: () => (el.isConnected && !el.hidden ? fishIcon.getBoundingClientRect() : null),
    destroy() {
      offLocale();
      for (const id of timers) clearTimeout(id);
      timers.clear();
      el.parentNode?.removeChild(el);
    },
  };
}

/**
 * The white fish pill: icon-fish, the count and an optional "+" (phase2b §2.5). B → B shared
 * component, used by home-screen (in the top bar's lead slot, A's createTopBar `lead`), the game
 * pills row and the victory screen.
 */
export function createFishPill(props: FishPillProps): FishPillView {
  const p = buildFishPill(props, { inGame: false, reduced: () => false });
  return { el: p.el, update: p.update, iconRect: p.iconRect, destroy: p.destroy };
}

// ─────────────────────────────── heart break (phase2b §2.9) ───────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The crack line, on icon-heart's 24 grid; it follows the sprite's clip-heart-l/r split. */
const ZIGZAG = 'M12.3 5.6 10.8 7.6 13.4 11.4 10.6 15.2 11.9 19.2';
/**
 * The three shards (§2.9: small triangles in --heart that fly 18 px at ±(30–60)° and fade): the
 * direction is the angle from straight up, in degrees. CSS-style constants (§0.4).
 */
const SHARDS: readonly { readonly deg: number; readonly at: readonly [number, number] }[] = [
  { deg: -50, at: [11, 9] },
  { deg: 35, at: [13, 10.5] },
  { deg: 60, at: [12.4, 14] },
];
const SHARD_FLY = 18;

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/** The breaking heart (fx.css .heart__crack): halves clipped along the crack, the zigzag, three shards. */
function brokenHeart(): SVGSVGElement {
  const svg = svgEl('svg', { class: 'heart__crack', viewBox: '0 0 24 24', 'aria-hidden': 'true' });
  const shake = svgEl('g', { class: 'heart__shake' });
  // The whole heart covers the halves' clip seam until they part (220 ms); the crack draws over it.
  const whole = svgEl('g', { class: 'heart__whole' });
  whole.appendChild(svgEl('use', { href: '#icon-heart', width: '24', height: '24' }));
  for (const side of ['l', 'r']) {
    const g = svgEl('g', { class: `heart__half heart__half--${side}`, 'clip-path': `url(#clip-heart-${side})` });
    g.appendChild(svgEl('use', { href: '#icon-heart', width: '24', height: '24' }));
    shake.appendChild(g);
  }
  shake.append(whole, svgEl('path', { class: 'heart__zig', d: ZIGZAG, pathLength: '1' }));
  svg.appendChild(shake);
  for (const s of SHARDS) {
    const rad = (s.deg * Math.PI) / 180;
    const p = svgEl('path', {
      class: 'heart__shard',
      d: `M${s.at[0]} ${s.at[1] - 1.5}l1.4 2.4h-2.8z`,
    });
    p.style.setProperty('--dx', `${(Math.sin(rad) * SHARD_FLY).toFixed(1)}px`);
    p.style.setProperty('--dy', `${(-Math.cos(rad) * SHARD_FLY).toFixed(1)}px`);
    p.style.setProperty('--spin', `${Math.round(s.deg * 3)}deg`);
    svg.appendChild(p);
  }
  return svg;
}

// ─────────────────────────────── pills row ───────────────────────────────

export function createPills(props: PillsProps): PillsView {
  const el = document.createElement('div');
  el.className = 'pills';
  el.style.setProperty('--t-break', `${cfg.fx.heartBreakMs}ms`);
  const cats = document.createElement('div');
  cats.className = 'pill pill--cats';
  cats.setAttribute('role', 'img');
  const count = document.createElement('span');
  count.className = 'pill__count';
  cats.append(icon('cat-idle', { class: 'pill__icon' }), count);
  const hearts = document.createElement('div');
  hearts.className = 'pill pill--hearts';
  hearts.setAttribute('role', 'img');

  let current = props;
  const reduced = (): boolean => current.reducedMotion === true;
  // The in-game fish pill (phase2b §2.2): between the two pills, hidden during play.
  const fish = buildFishPill({ count: 0, onPlus: null }, { inGame: true, reduced });
  fish.el.hidden = true;
  let fishShown = false;
  el.append(cats, fish.el, hearts);

  const timers: Timers = new Set();
  let heartEls: HTMLElement[] = [];
  let prev: PillsProps | null = null;

  const ensureHearts = (max: number): void => {
    if (heartEls.length === max) return;
    while (hearts.firstChild) hearts.removeChild(hearts.firstChild);
    heartEls = [];
    for (let k = 0; k < max; k++) {
      const slot = document.createElement('span');
      slot.className = 'heart';
      slot.append(icon('icon-heart-empty', { class: 'heart__empty' }), icon('icon-heart', { class: 'heart__full' }));
      heartEls.push(slot);
      hearts.appendChild(slot);
    }
  };

  const render = (p: PillsProps): void => {
    current = p;
    ensureHearts(Math.max(0, p.maxHearts));
    el.toggleAttribute('data-compact', p.compact);
    const text = t('game.cats', { placed: p.catsPlaced, n: p.n });
    if (count.textContent !== text) count.textContent = text;
    cats.setAttribute('aria-label', t('game.cats.a11y', { placed: p.catsPlaced, n: p.n }));
    cats.toggleAttribute('data-complete', p.catsPlaced >= p.n && p.n > 0);
    if (prev && p.catsPlaced > prev.catsPlaced) restart(cats, 'pill--bump', 360, timers);
    heartEls.forEach((h, k) => h.toggleAttribute('data-full', k < p.hearts));
    hearts.setAttribute('aria-label', t('game.hearts.a11y', { hearts: p.hearts, max: p.maxHearts }));
    hearts.toggleAttribute('data-last', p.hearts === 1);
    prev = p;
  };
  render(props);

  /** §2.9 heart break; reduced motion keeps the 150 ms full → empty swap (CSS transition) only. */
  const breakHeart = (slot: HTMLElement): void => {
    slot.querySelector('.heart__crack')?.remove();
    if (reduced()) return;
    const crack = brokenHeart();
    slot.appendChild(crack);
    restart(slot, 'heart--break', cfg.fx.heartBreakMs, timers);
    later(timers, cfg.fx.heartBreakMs + 80, () => crack.parentNode?.removeChild(crack));
  };

  return {
    el,
    update: render,
    playEvent(ev) {
      if (ev.type === 'MISTAKE') {
        const slot = heartEls[ev.heartsLeft];
        if (!slot) return;
        breakHeart(slot);
        if (!reduced()) restart(hearts, 'pill--hurt', cfg.fx.heartCrackMs, timers);
      } else if (ev.type === 'REVIVED') {
        const full = heartEls.filter((h) => h.hasAttribute('data-full'));
        const slot = full[full.length - 1];
        if (slot) restart(slot, 'heart--pop', 520, timers);
      }
    },
    showFish(n) {
      if (!fishShown) {
        fishShown = true;
        fish.setCount(n, false);
        fish.el.style.setProperty('--fade-ms', `${cfg.fx.win.fishPillFadeMs}ms`);
        fish.el.hidden = false;
        restart(fish.el, 'fish-pill--in', cfg.fx.win.fishPillFadeMs, timers);
        return;
      }
      fish.setCount(n, true);
    },
    fishRect: () => (fishShown ? fish.iconRect() : null),
    fishLabel(text) {
      if (fishShown) fish.label(text);
    },
    destroy() {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      fish.destroy();
      el.parentNode?.removeChild(el);
    },
  };
}
