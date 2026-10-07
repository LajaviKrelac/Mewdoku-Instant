// Owner: ui-shell
// O1 hint card (02 §5, §9.1): bottom sheet with the explanation, [Apply] and [×]. The board's dimming
// and focus outline come from GameView.highlight. Renders the 02 §9.1 templates via i18n.
// The root holds a CLEAR full-screen scrim, so the dimmed board stays visible while a tap on it
// closes the card (HINT_CLOSE), as does × or Esc (dismiss()).
//
// Classes: .overlay[data-overlay=hint] > .overlay__scrim--clear + .overlay__panel--sheet.hint-card
//          .hint-card__icon .hint-card__text .hint-card__actions
import type { HintStep } from '../../engine/types';
import { t } from '../../i18n';
import { icon } from '../art/sprite';
import { h, setText, type OverlayView } from '../dom';
import { closeButton, createOverlayShell, makeButton } from './overlay-base';
import { hintText, type HintTextContext } from './hint-text';

export { hintText, unitKindPlural, unitListName, unitName, type HintTextContext } from './hint-text';

export interface HintCardProps extends HintTextContext {
  readonly step: HintStep;
  onApply(): void;
  /** ×, Esc or a tap on the dimmed area (HINT_CLOSE). */
  onClose(): void;
  /**
   * Optional: the board's client rect (GameScreen.boardRect). When the bottom sheet would cover it,
   * the sheet moves to the top of the screen, over the top bar and HUD (small or wide screens).
   */
  avoidRect?(): DOMRect | null;
}

/** Gap between a top-placed sheet and the screen edge (CSS px): none, the top sheet is flush. */
const TOP_MARGIN = 0;

/**
 * 'top' when the bottom sheet (`sheet`, measured at the bottom) overlaps `avoid` and the top slot
 * overlaps it less. The top sheet is flush with the screen edge and grows by the safe-area inset.
 */
export function sheetPlacement(sheet: { top: number; height: number }, avoid: { top: number; bottom: number } | null, safeTop = 0): 'bottom' | 'top' {
  if (!avoid) return 'bottom';
  const bottomOverlap = Math.max(0, avoid.bottom - sheet.top);
  if (bottomOverlap <= 0) return 'bottom';
  const topOverlap = Math.max(0, TOP_MARGIN + safeTop + sheet.height - avoid.top);
  return topOverlap < bottomOverlap ? 'top' : 'bottom';
}

export function createHintCard(): OverlayView<HintCardProps> {
  let props: HintCardProps | null = null;
  const close = (): boolean => {
    if (!props || !shell.isOpen()) return false;
    props.onClose();
    return true;
  };
  const shell = createOverlayShell({ id: 'hint', scrim: 'clear', panel: 'sheet', onScrimTap: () => void close() });
  shell.panel.classList.add('hint-card');

  const title = h('h2', { class: 'overlay__title visually-hidden', id: shell.titleId }, t('hint.title'));
  const text = h('p', { class: 'hint-card__text', id: shell.descId });
  const apply = makeButton({
    variant: 'primary',
    label: t('hint.apply'),
    autofocus: true,
    className: 'hint-card__apply',
    onPress: () => props?.onApply(),
  });
  const closeBtn = closeButton(() => void close(), t('hint.close'));
  shell.panel.append(
    h('div', { class: 'hint-card__row' }, icon('icon-bulb', { class: 'hint-card__icon' }), title, text),
    h('div', { class: 'overlay__actions hint-card__actions' }, apply, closeBtn),
  );

  /** Measures at the bottom, then flips to the top if that covers the board less. */
  const place = (): void => {
    if (!props || !shell.isOpen()) return;
    shell.el.dataset.placement = 'bottom';
    const avoid = props.avoidRect?.() ?? null;
    if (!avoid) return;
    const r = shell.panel.getBoundingClientRect();
    const safeTop = parseFloat(shell.el.ownerDocument.defaultView?.getComputedStyle(shell.el).getPropertyValue('--safe-top') ?? '') || 0;
    shell.el.dataset.placement = sheetPlacement(r, avoid, safeTop);
  };
  const win = (): Window | null => shell.el.ownerDocument.defaultView;

  const render = (p: HintCardProps): void => {
    props = p;
    setText(text, hintText(p.step, p));
    shell.panel.dataset.kind = p.step.kind;
    place();
  };

  return {
    el: shell.el,
    modal: true,
    open(p) {
      shell.show();
      render(p);
      win()?.addEventListener('resize', place);
    },
    update(p) {
      render(p);
    },
    close() {
      win()?.removeEventListener('resize', place);
      shell.hide();
    },
    dismiss: close,
    destroy() {
      win()?.removeEventListener('resize', place);
      props = null;
      shell.el.remove();
    },
  };
}
