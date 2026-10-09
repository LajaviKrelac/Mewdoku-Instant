// Owner: B (Phase 2b; was ui-shell)
// O10 rotate notice (02 §19): shown on a landscape PHONE whose height is < layout.rotateMaxHeight.
// A phone is a coarse (touch) primary pointer on a screen whose short side is < 600 px. Desktop
// windows (a 150-200 % zoomed browser, a squat window) never get it: they keep the portrait column
// and scroll (base.css, game-screen.ts). Sizes come from the visual viewport at page scale 1, so
// pinch-zoom does not trigger it. Self-managing: listens to resize / visualViewport and toggles itself.
//
// Classes: .rotate-notice > .rotate-notice__art .rotate-notice__title .rotate-notice__body
import { cfg } from '../../app/config';
import { t } from '../../i18n';
import { h, s } from '../dom';

/** Short side of a phone screen (CSS px): tablets and desktops are wider than this. */
const PHONE_MAX_SHORT_SIDE = 600;

/** Landscape (w > h) and h < layout.rotateMaxHeight, on a phone (`phone` defaults to true). */
export function shouldShowRotateNotice(width: number, height: number, phone = true): boolean {
  return phone && width > height && height < cfg.layout.rotateMaxHeight;
}

/**
 * Whether this window is a phone: a coarse primary pointer (touch) and a small screen. Unknown
 * capabilities (no matchMedia / screen) count as a phone, keeping the notice where it was before.
 */
export function isPhone(win: Window): boolean {
  const coarse = typeof win.matchMedia === 'function' ? win.matchMedia('(pointer: coarse)').matches : true;
  if (!coarse) return false;
  const sc = win.screen as Screen | undefined;
  const short = sc ? Math.min(sc.width || 0, sc.height || 0) : 0;
  return short === 0 || short < PHONE_MAX_SHORT_SIDE;
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
    const scale = vv && vv.scale > 0 ? vv.scale : 1;
    const w = vv ? vv.width * scale : win.innerWidth;
    const hgt = vv ? vv.height * scale : win.innerHeight;
    el.hidden = !shouldShowRotateNotice(w, hgt, isPhone(win));
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
