// The combo bar (user, 2026-10-12; inspired by Goods Sort): a green bar hanging under the game bar's
// middle while a combo runs, "Combo x3" on it, its fill emptying linearly over what is left of the
// countdown (no clock is shown). Every view update re-syncs the fill to the game's own clock (the
// reducer's elapsedMs, one TICK a second), so a pause never lets it drift; while the game clock is
// stopped (`running` false) the fill holds still. Reduced motion: the fill steps once a second with
// the TICKs instead of gliding. Hidden with no combo.
// Classes: .combo-bar[data-count] > .combo-bar__fill + .combo-bar__text.num
import { formatNumber, onLocaleChanged, t } from '../../i18n';
import { h, setText, type View } from '../dom';

export interface ComboBarProps {
  /** The running combo (GameState.combo); 0 hides the bar. */
  readonly count: number;
  /** The whole countdown of this combo (GameState.comboWindowMs): the full bar. */
  readonly windowMs: number;
  /** What is left of it now (comboEndsMs − elapsedMs). */
  readonly leftMs: number;
  /** The game clock runs (the board is in play and the page is not paused). */
  readonly running: boolean;
  readonly reducedMotion: boolean;
}

/** The fill's share of the bar, 0 … 1. Pure (tests). */
export function comboFraction(leftMs: number, windowMs: number): number {
  if (!(windowMs > 0) || !Number.isFinite(leftMs)) return 0;
  return Math.min(1, Math.max(0, leftMs / windowMs));
}

export function createComboBar(props: ComboBarProps): View<ComboBarProps> {
  const fill = h('span', { class: 'combo-bar__fill' });
  const text = h('span', { class: 'combo-bar__text num' });
  // Decorative: each scoring cat's one announcement already says the new total (D22: one utterance).
  const el = h('div', { class: 'combo-bar', 'aria-hidden': 'true' }, fill, text);
  let anim: Animation | null = null;
  let cur = props;
  let shown = -1;

  const stop = (): void => {
    anim?.cancel();
    anim = null;
  };
  let synced: ComboBarProps | null = null;
  const render = (p: ComboBarProps): void => {
    cur = p;
    // Other view updates (a mark between two TICKs) carry the same, slightly old clock: keep gliding.
    if (synced && synced.count === p.count && synced.windowMs === p.windowMs && synced.leftMs === p.leftMs && synced.running === p.running && synced.reducedMotion === p.reducedMotion && shown !== -1) return;
    synced = p;
    const on = p.count > 0 && p.windowMs > 0;
    el.hidden = !on;
    if (!on) {
      stop();
      shown = -1;
      return;
    }
    if (shown !== p.count) {
      shown = p.count;
      el.dataset.count = String(p.count);
      setText(text, t('game.combo', { count: formatNumber(p.count) }));
    }
    const from = comboFraction(p.leftMs, p.windowMs);
    stop();
    fill.style.transform = `scaleX(${from})`;
    if (!p.running || p.reducedMotion || from <= 0 || typeof fill.animate !== 'function') return;
    anim = fill.animate([{ transform: `scaleX(${from})` }, { transform: 'scaleX(0)' }], { duration: Math.max(0, p.leftMs), easing: 'linear', fill: 'forwards' });
  };
  render(props);
  const offLocale = onLocaleChanged(() => {
    if (cur.count > 0) setText(text, t('game.combo', { count: formatNumber(cur.count) }));
  });

  return {
    el,
    update: render,
    destroy() {
      offLocale();
      stop();
      el.remove();
    },
  };
}
