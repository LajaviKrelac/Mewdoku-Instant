// Owner: ui-board
// Cat counter and hearts pills (02 §5 S2), heart crack on MISTAKE (02 §17.5).
// Classes: .pills[data-compact] > .pill.pill--cats(.pill__icon .pill__count) .pill.pill--hearts > .heart[data-full]
import { cfg } from '../../app/config';
import type { GameEvent } from '../../game/types';
import { t } from '../../i18n';
import { icon } from '../art/sprite';
import type { View } from '../dom';

export interface PillsProps {
  readonly catsPlaced: number;
  readonly n: number;
  readonly hearts: number;
  readonly maxHearts: number;
  readonly compact: boolean;
}

export interface PillsView extends View<PillsProps> {
  /** MISTAKE → crack the heart that was lost; REVIVED → refill animation. */
  playEvent(ev: GameEvent): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Two halves of a full heart, clipped along the crack line, that fall apart (fx.css .heart__half). */
function crackedHeart(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'heart__crack');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const side of ['l', 'r']) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', `heart__half heart__half--${side}`);
    g.setAttribute('clip-path', `url(#clip-heart-${side})`);
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#icon-heart');
    use.setAttribute('width', '24');
    use.setAttribute('height', '24');
    g.appendChild(use);
    svg.appendChild(g);
  }
  return svg;
}

function restart(el: Element, cls: string, ms: number, timers: Set<ReturnType<typeof setTimeout>>): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
  const id = setTimeout(() => {
    timers.delete(id);
    el.classList.remove(cls);
  }, ms);
  timers.add(id);
}

export function createPills(props: PillsProps): PillsView {
  const el = document.createElement('div');
  el.className = 'pills';
  const cats = document.createElement('div');
  cats.className = 'pill pill--cats';
  cats.setAttribute('role', 'img');
  const count = document.createElement('span');
  count.className = 'pill__count';
  cats.append(icon('cat-idle', { class: 'pill__icon' }), count);
  const hearts = document.createElement('div');
  hearts.className = 'pill pill--hearts';
  hearts.setAttribute('role', 'img');
  el.append(cats, hearts);

  const timers = new Set<ReturnType<typeof setTimeout>>();
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

  return {
    el,
    update: render,
    playEvent(ev) {
      if (ev.type === 'MISTAKE') {
        const slot = heartEls[ev.heartsLeft];
        if (!slot) return;
        const old = slot.querySelector('.heart__crack');
        if (old) slot.removeChild(old);
        const crack = crackedHeart();
        slot.appendChild(crack);
        const id = setTimeout(() => {
          timers.delete(id);
          crack.parentNode?.removeChild(crack);
        }, cfg.fx.heartCrackMs + 80);
        timers.add(id);
        restart(hearts, 'pill--hurt', cfg.fx.heartCrackMs, timers);
      } else if (ev.type === 'REVIVED') {
        const full = heartEls.filter((h) => h.hasAttribute('data-full'));
        const slot = full[full.length - 1];
        if (slot) restart(slot, 'heart--pop', 520, timers);
      }
    },
    destroy() {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      el.parentNode?.removeChild(el);
    },
  };
}
