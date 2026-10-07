// Owner: ui-shell
// O10 rotate notice (02 §19): shown on a landscape phone whose height is < layout.rotateMaxHeight.
// Self-managing: listens to resize / visualViewport and toggles itself.
//
// Classes: .rotate-notice > .rotate-notice__art .rotate-notice__title .rotate-notice__body
import { cfg } from '../../app/config';
import { t } from '../../i18n';
import { h, s } from '../dom';

/** Landscape (w > h) and h < layout.rotateMaxHeight. */
export function shouldShowRotateNotice(width: number, height: number): boolean {
  return width > height && height < cfg.layout.rotateMaxHeight;
}

/** Our own little drawing: a phone turning upright, with a curved arrow. */
function rotateArt(): SVGSVGElement {
  return s(
    'svg',
    { class: 'rotate-notice__art', viewBox: '0 0 64 64', 'aria-hidden': 'true', focusable: 'false' },
    s('rect', { x: 22, y: 10, width: 22, height: 40, rx: 5, fill: 'var(--card)', stroke: 'currentColor', 'stroke-width': 3 }),
    s('circle', { cx: 33, cy: 44, r: 2, fill: 'currentColor' }),
    s('path', { d: 'M10 34a22 22 0 0 1 8-20', fill: 'none', stroke: 'var(--accent)', 'stroke-width': 3, 'stroke-linecap': 'round' }),
    s('path', { d: 'M13 11l5 3-3 5', fill: 'none', stroke: 'var(--accent)', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  );
}

export function mountRotateNotice(host: HTMLElement, win: Window = window): { readonly el: HTMLElement; destroy(): void } {
  const el = h(
    'div',
    { class: 'rotate-notice', role: 'alert', hidden: true },
    rotateArt(),
    h('p', { class: 'rotate-notice__title' }, t('rotate.title')),
    h('p', { class: 'rotate-notice__body' }, t('rotate.body')),
  );
  host.appendChild(el);

  const check = (): void => {
    const vv = win.visualViewport;
    const w = vv?.width ?? win.innerWidth;
    const hgt = vv?.height ?? win.innerHeight;
    el.hidden = !shouldShowRotateNotice(w, hgt);
  };
  check();
  win.addEventListener('resize', check);
  win.addEventListener('orientationchange', check);
  win.visualViewport?.addEventListener('resize', check);

  return {
    el,
    destroy() {
      win.removeEventListener('resize', check);
      win.removeEventListener('orientationchange', check);
      win.visualViewport?.removeEventListener('resize', check);
      el.remove();
    },
  };
}
