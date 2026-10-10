// Owner: G3 (Phase 2d)
// The game screen's top bar (look-spec §1.4, §1.13, §1.15): a white back disc at the inline start, two
// centred columns "Level / 96" and "Score / 0", and the gear disc with the red settings dot at the
// inline end. Home and the event screen keep their own bar (top-bar.ts).
// - Level column: the page's h1 (aria-label = the whole title). Label = splitTitle(title).name
//   ("Level", "Daily", "Lantern Walk"); value = the suffix without its separator ("96", "Tue 6 Oct",
//   "13"), then the Hard badge. A title with no suffix (zh "第96关") shows whole as the value.
// - Score column: the level points of this attempt (GameView.points) on the shared counter builder
//   (pills.ts buildCounter). Hidden when points is null (the tutorial); [data-final] at the win.
//   Phase 2d.1 (helpers-spec §2.5, D-2d1-4): while the game screen's star flight is on
//   (GameBarProps.starPoints) a higher total waits for its star: countTo() counts up from the number on
//   screen over fx.points.countMs, every frame round(from + (to − from)(1 − (1 − u)²)), no bump, no
//   colour change ([data-counting] on the number); a lower total (Retry, a new board) shows at once and
//   ends a count-up. The accessible name takes every new total at once. Without the star (the lazy fx
//   chunk not loaded yet, reduced motion) the number changes with the props, and POINTS rolls it as in
//   2d (playEvent; no chip, D-2d1-4).
// - Fit (critic C5): the pair is centred between the discs (hud.css); when it is wider than that span,
//   the values step to 0.86 × and 0.74 × (data-fit 1, 2), then the labels ellipsize. Checked a frame
//   after a render that can widen it, on resize and on a language change (fit()).
// - The FB safe zone: the game screen moves the physically-left disc out of the top-left 64 × 64 with
//   --fb-s / --fb-e (game-screen.ts); the columns re-centre between the discs on their own.
// Classes: header.top-bar.top-bar--game[data-fb-safe][data-fit]
//            > button.top-bar__btn--home.top-bar__btn--back
//              .top-bar__mid > h1.top-bar__text > .top-bar__name + .top-bar__val > .top-bar__suffix .badge--hard
//                              .points-pill[data-final] > .points-pill__name + .points-pill__val.top-bar__val > .points-pill__count > .points-pill__n[data-counting]
//              button.top-bar__btn--settings > .top-bar__dot
import { cfg } from '../../app/config';
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
  /**
   * Phase 2d.1 §2.5: the game screen flies a star to the Score for every POINTS, so a higher total
   * waits for countTo(). Optional (absent = false: the number follows the props at once).
   */
  readonly starPoints?: boolean;
}

export interface GameBarCallbacks {
  onBack(): void;
  onSettings(): void;
}

export interface GameBarView extends View<GameBarProps> {
  /** POINTS without the star (2d.1: the fallback): the number rolls from total − gained to total. No chip. */
  playEvent(ev: GameEvent): void;
  /** Re-checks the fit steps (resize, language change); reads layout, so it is called on a frame. */
  fit(): void;
  /** Phase 2d.1: the Score number's client rect (the star's target); null while hidden or detached. */
  scoreRect(): DOMRect | null;
  /** Phase 2d.1 §2.5: count up from the number on screen to `total` over fx.points.countMs (quadratic ease-out, every frame, no bump). Never lowers it. */
  countTo(total: number): void;
  /** Phase 2d.1: shows the props' total at once and ends a count-up (a star that will not land). */
  syncPoints(): void;
}

/** The count-up's value `elapsed` ms in (helpers-spec §2.5): round(from + (to − from) · (1 − (1 − u)²)), u = elapsed / ms. */
export function countValue(from: number, to: number, elapsed: number, ms: number): number {
  const u = ms > 0 ? Math.min(1, Math.max(0, elapsed / ms)) : 1;
  return Math.round(from + (to - from) * (1 - (1 - u) * (1 - u)));
}

/** The value without the title's separator (" · 13" → "13", " 96" → "96"). */
export function barValue(suffix: string): string {
  return suffix.replace(/^[\s·]+/, '');
}

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

  // ── the number on screen and the count-up (Phase 2d.1 §2.5) ──
  const win = el.ownerDocument.defaultView;
  /** The number on screen (−1 before the first render). */
  let shown = -1;
  let countRaf = 0;
  const stopCount = (): void => {
    if (countRaf) win?.cancelAnimationFrame(countRaf);
    countRaf = 0;
    score.numEl().removeAttribute('data-counting');
  };
  const showNow = (n: number): void => {
    stopCount();
    shown = n;
    score.show(n);
  };
  const countTo = (total: number): void => {
    if (score.el.hidden || !(total > shown)) return;
    if (!win?.requestAnimationFrame || current.reducedMotion) {
      showNow(total);
      return;
    }
    stopCount();
    const from = Math.max(0, shown);
    const ms = cfg.fx.points.countMs;
    // The landing frame is the count's frame 0 (measured: 0, 54, 104 … from the landing): the clock
    // starts at the call, and every later frame shows the value at its own timestamp (same origin).
    const t0 = win.performance.now();
    score.numEl().setAttribute('data-counting', '');
    shown = from;
    score.show(from);
    const frame = (ts: number): void => {
      const el = Math.max(0, ts - t0);
      const v = countValue(from, total, el, ms);
      shown = v;
      score.show(v);
      if (el >= ms) {
        countRaf = 0;
        score.numEl().removeAttribute('data-counting');
        return;
      }
      countRaf = win.requestAnimationFrame(frame);
    };
    countRaf = win.requestAnimationFrame(frame);
  };

  // ── fit (critic C5) ──
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
    if (pts !== null) {
      if (prev?.points !== pts) widen = true;
      // The name takes the total at once (2c.1, §2.5); it also relabels after a language change.
      score.setLabel(pts);
      // A higher total waits for its star (countTo); anything else shows at once.
      if (!prev || !(p.starPoints === true && pts > shown)) {
        if (pts !== shown || !prev) showNow(pts);
      }
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
      // The fallback (2d.1: the fx chunk not loaded): roll from total − gained to total. No sound of its own (D23).
      if (ev.type !== 'POINTS' || score.el.hidden || !(ev.gained > 0)) return;
      stopCount();
      shown = ev.total;
      score.setTotal(ev.total, ev.total - ev.gained);
    },
    fit,
    scoreRect: () => (el.isConnected && !score.el.hidden ? score.numEl().getBoundingClientRect() : null),
    countTo,
    syncPoints() {
      const pts = current.points;
      if (typeof pts === 'number' && pts >= 0 && !score.el.hidden) showNow(Math.floor(pts));
    },
    destroy() {
      offLocale();
      L.dispose();
      stopCount();
      if (fitQueued) win?.cancelAnimationFrame(fitRaf);
      score.destroy();
      el.parentNode?.removeChild(el);
    },
  };
}
