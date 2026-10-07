// Owner: ui-shell
// S0 web splash (02 §5): wordmark, sleeping cat, progress bar. FBIG uses Facebook's own loader.
//
// Classes: .screen.screen--boot > .boot__wordmark .boot__art .boot__progress(.boot__bar .boot__fill)
//          .boot__pct .boot__label
import { t } from '../../i18n';
import { illustration } from '../art/illustrations';
import { h, setText } from '../dom';

export interface BootScreen {
  readonly el: HTMLElement;
  /** 0..100. */
  setProgress(pct: number): void;
  destroy(): void;
}

export function createBootScreen(): BootScreen {
  const fill = h('div', { class: 'boot__fill' });
  const pct = h('span', { class: 'boot__pct', 'aria-hidden': 'true' });
  const bar = h(
    'div',
    {
      class: 'boot__progress',
      role: 'progressbar',
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': 0,
      'aria-label': t('boot.loading'),
    },
    h('div', { class: 'boot__bar' }, fill),
    pct,
  );
  const el = h(
    'div',
    { class: 'screen screen--boot', 'aria-busy': 'true' },
    h('div', { class: 'boot__center' },
      h('h1', { class: 'boot__wordmark' }, t('app.name')),
      h('div', { class: 'boot__art' }, illustration('boot', { label: t('a11y.illustration.boot') })),
      bar,
      h('p', { class: 'boot__label' }, t('boot.loading')),
    ),
  );

  const setProgress = (value: number): void => {
    const v = Math.round(Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)));
    fill.style.transform = `scaleX(${v / 100})`;
    bar.setAttribute('aria-valuenow', String(v));
    setText(pct, t('boot.progress', { pct: v }));
    el.setAttribute('aria-busy', String(v < 100));
  };
  setProgress(0);

  return {
    el,
    setProgress,
    destroy() {
      el.remove();
    },
  };
}
