// Owner: G3 (Phase 2d)
// The game screen's top bar (look-spec §1.4, §1.13, §1.15): a white back disc at the inline start, two
// centred columns "Level / 96" and "Score / 0", and the gear disc with the red settings dot at the
// inline end. Home and the event screen keep their own bar (top-bar.ts).
// - Level column: the page's h1 (aria-label = the whole title). Label = splitTitle(title).name
//   ("Level", "Daily", "Lantern Walk"); value = the suffix without its separator ("96", "Tue 6 Oct",
//   "13"), then the Hard badge. A title with no suffix (zh "第96关") shows whole as the value.
// - Score column: the level points of this attempt (GameView.points) on the shared counter builder
//   (pills.ts buildCounter): a POINTS event rolls and bumps the number and raises "+576" at the
//   number's inline end, kept clear of the gear (critic C9). Hidden when points is null (the
//   tutorial); [data-final] at the win.
// - Fit (critic C5): the pair is centred between the discs (hud.css); when it is wider than that span,
//   the values step to 0.86 × and 0.74 × (data-fit 1, 2), then the labels ellipsize. Checked a frame
//   after a render that can widen it, on resize and on a language change (fit()).
// - The FB safe zone: the game screen moves the physically-left disc out of the top-left 64 × 64 with
//   --fb-s / --fb-e (game-screen.ts); the columns re-centre between the discs on their own.
// Classes: header.top-bar.top-bar--game[data-fb-safe][data-fit]
//            > button.top-bar__btn--home.top-bar__btn--back
//              .top-bar__mid > h1.top-bar__text > .top-bar__name + .top-bar__val > .top-bar__suffix .badge--hard
//                              .points-pill[data-final] > .points-pill__name + .points-pill__val.top-bar__val > .points-pill__count > .points-pill__n ; .points-pill__label > .points-pill__chip
//              button.top-bar__btn--settings > .top-bar__dot
import type { GameEvent } from '../../game/types';
import { formatNumber, onLocaleChanged, t } from '../../i18n';
import type { View } from '../dom';
import { createLocaleText } from '../locale-text';
import { buildCounter, pointsMotion, wrapCount } from './pills';
import { iconButton, setSettingsDot, splitTitle } from './top-bar';

export interface GameBarProps {
  /** Localized title ("Level 37", "Daily · Tue 6 Oct", "Lantern Walk · 13"). */
  readonly title: string;
  readonly hard: boolean;
  /** false during the first-run tutorial (02 §4.2): the back disc hides. */
  readonly showBack: boolean;
  readonly fbSafeZone: boolean;
  /** §1.15: the gear's red dot. */
  readonly settingsDot: boolean;
  /** §1.13: level points of this attempt; null hides the Score column (the Level column then centres alone). */
  readonly points: number | null;
  /** §1.13: the board is complete (catsPlaced ≥ n): the number turns --accent-text until the board changes. */
  readonly final: boolean;
  readonly reducedMotion: boolean;
}

export interface GameBarCallbacks {
  onBack(): void;
  onSettings(): void;
}

export interface GameBarView extends View<GameBarProps> {
  /** POINTS → the Score number rolls from total − gained to total, bumps and raises "+gained". */
  playEvent(ev: GameEvent): void;
  /** Re-checks the fit steps (resize, language change); reads layout, so it is called on a frame. */
  fit(): void;
}

/** The value without the title's separator (" · 13" → "13", " 96" → "96"). */
export function barValue(suffix: string): string {
  return suffix.replace(/^[\s·]+/, '');
}

/** Clearance kept between the "+N" chip and the gear disc (critic C9), px. */
const GEAR_CLEAR = 4;

export function createGameBar(props: GameBarProps, cb: GameBarCallbacks): GameBarView {
  const el = document.createElement('header');
  el.className = 'top-bar top-bar--game';
  const L = createLocaleText();

  const back = L.attr(iconButton('home', 'icon-back', () => cb.onBack()), 'aria-label', () => t('common.back'));
  back.classList.add('top-bar__btn--back');
  const gear = iconButton('settings', 'icon-gear', () => cb.onSettings());

  // ── the Level column (the page's heading) ──
  const text = document.createElement('h1');
  text.className = 'top-bar__text';
  const nameEl = document.createElement('span');
  nameEl.className = 'top-bar__name';
  const valRow = document.createElement('span');
  valRow.className = 'top-bar__val';
  const suffixEl = document.createElement('span');
  suffixEl.className = 'top-bar__suffix num';
  const badge = L.text(document.createElement('span'), () => t('common.hard'));
  badge.className = 'badge badge--hard';
  valRow.append(suffixEl, badge);
  text.append(nameEl, valRow);

  // ── the Score column (§1.13) ──
  let current = props;
  const score = buildCounter({
    cls: 'points-pill',
    icon: null,
    label: (n) => t('game.points.a11y', { count: formatNumber(n) }),
    motion: pointsMotion,
    reduced: () => current.reducedMotion,
    // The number's box: .points-pill__val (the contract's name) and .top-bar__val (the value line's look).
    chipHost: wrapCount('points-pill__val top-bar__val'),
    placed: (chip) => clampChip(chip),
  });
  const scoreName = L.text(document.createElement('span'), () => t('game.score'));
  scoreName.className = 'points-pill__name';
  scoreName.setAttribute('aria-hidden', 'true');
  score.el.insertBefore(scoreName, score.el.firstChild);

  const mid = document.createElement('div');
  mid.className = 'top-bar__mid';
  mid.append(text, score.el);
  el.append(back, mid, gear);
  L.watch();

  /**
   * Critic C9: a chip whose inline end would pass the gear's inner edge − 4 px shifts toward the inline
   * start until it ends there (it may then overlap the number's last digits for its 700 ms).
   */
  const clampChip = (chip: HTMLElement): void => {
    const host = chip.parentElement;
    if (!chip.isConnected || !host || gear.hidden) return;
    const g = gear.getBoundingClientRect();
    if (g.width === 0) return;
    // Layout offsets, not client rects: the chip's own keyframes scale and move it.
    const left = host.getBoundingClientRect().left + chip.offsetLeft;
    const rtl = getComputedStyle(el).direction === 'rtl';
    const over = rtl ? g.right + GEAR_CLEAR - left : left + chip.offsetWidth - (g.left - GEAR_CLEAR);
    // --chip-dx is an inline offset (hud.css margin-inline-start): negative moves it toward the start.
    if (over > 0) chip.style.setProperty('--chip-dx', `${-over}px`);
  };

  // ── fit (critic C5) ──
  const win = el.ownerDocument.defaultView;
  let fitRaf = 0;
  let fitQueued = false;
  const measureFit = (): void => {
    fitQueued = false;
    const span = mid.clientWidth;
    if (!el.isConnected || span <= 0) return;
    el.removeAttribute('data-fit');
    const need = (): number => {
      let sum = 0;
      for (const [col, label, value] of [
        [text, nameEl, valRow],
        [score.el, scoreName, score.el.querySelector('.points-pill__val') as HTMLElement],
      ] as const) {
        if (col.hidden) continue;
        sum += Math.max(col.offsetWidth, label.scrollWidth, value.scrollWidth);
      }
      return sum;
    };
    for (let step = 1; step <= 2 && need() > span + 1; step++) el.dataset.fit = String(step);
  };
  const fit = (): void => {
    if (fitQueued || !win?.requestAnimationFrame) return;
    fitQueued = true;
    fitRaf = win.requestAnimationFrame(measureFit);
  };

  let prev: GameBarProps | null = null;
  const render = (p: GameBarProps): void => {
    current = p;
    el.toggleAttribute('data-fb-safe', p.fbSafeZone);
    // The platform's FB safe zone, for the overlays' rules (overlay-chunk.css :root[data-fb-safe]).
    el.ownerDocument.documentElement.toggleAttribute('data-fb-safe', p.fbSafeZone);
    let widen = false;
    if (!prev || prev.title !== p.title) {
      const parts = splitTitle(p.title);
      const value = barValue(parts.suffix);
      // A title without a suffix shows whole as the value (the heavy line), with no label.
      nameEl.textContent = value ? parts.name : '';
      nameEl.hidden = !value;
      suffixEl.textContent = value || p.title;
      text.setAttribute('aria-label', p.title);
      widen = true;
    }
    if (!prev || prev.hard !== p.hard) widen = true;
    badge.hidden = !p.hard;
    back.hidden = !p.showBack;
    setSettingsDot(gear, p.settingsDot);
    const pts = typeof p.points === 'number' && p.points >= 0 ? Math.floor(p.points) : null;
    if (score.el.hidden !== (pts === null)) widen = true;
    score.el.hidden = pts === null;
    // setTotal only writes a number that changed; it also relabels after a language change.
    if (pts !== null) {
      if (prev?.points !== pts) widen = true;
      score.setTotal(pts);
    }
    score.el.toggleAttribute('data-final', pts !== null && p.final);
    prev = p;
    if (widen) fit();
  };
  render(props);

  // The labels follow the language (A11Y-I18N-1); the title itself comes with the next props.
  const offLocale = onLocaleChanged(() => {
    const last = prev;
    if (!last) return;
    prev = null;
    render(last);
  });

  return {
    el,
    update: render,
    playEvent(ev) {
      // §1.13 (2c.1 §10.2): roll from total − gained to total, bump, "+576". No sound of its own (D23).
      if (ev.type !== 'POINTS' || score.el.hidden || !(ev.gained > 0)) return;
      score.setTotal(ev.total, ev.total - ev.gained);
      score.chip(t('fish.plus', { count: formatNumber(ev.gained) }));
    },
    fit,
    destroy() {
      offLocale();
      L.dispose();
      if (fitQueued) win?.cancelAnimationFrame(fitRaf);
      score.destroy();
      el.parentNode?.removeChild(el);
    },
  };
}
