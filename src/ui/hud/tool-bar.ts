// Owner: A (Phase 2b; was ui-board)
// Bulb and Paw tool buttons with count badges (02 §5 S2, §9).
// Classes: .tool-bar > .tool.tool--bulb|paw[data-empty][data-free] > .tool__icon .tool__badge
import { t } from '../../i18n';
import { icon } from '../art/sprite';
import type { View } from '../dom';

export interface ToolBarProps {
  readonly hints: number;
  readonly kitties: number;
  readonly bulbEnabled: boolean;
  readonly pawEnabled: boolean;
  /** Tutorial: the bulb is free, so its badge reads "Free" (02 §9.3). */
  readonly hintsFree: boolean;
}

export interface ToolBarCallbacks {
  onBulb(): void;
  onPaw(): void;
}

export interface ToolBarView extends View<ToolBarProps> {
  /** Client rect of a tool button (coach target in tutorial step 5). */
  toolRect(tool: 'bulb' | 'paw'): DOMRect | null;
}

interface ToolRefs {
  readonly btn: HTMLButtonElement;
  readonly badge: HTMLElement;
}

function tool(kind: 'bulb' | 'paw', onPress: () => void): ToolRefs {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `tool tool--${kind}`;
  const badge = document.createElement('span');
  badge.className = 'tool__badge';
  badge.setAttribute('aria-hidden', 'true');
  btn.append(icon(kind === 'bulb' ? 'icon-bulb' : 'icon-paw', { class: 'tool__icon' }), badge);
  btn.addEventListener('click', onPress);
  return { btn, badge };
}

export function createToolBar(props: ToolBarProps, cb: ToolBarCallbacks): ToolBarView {
  const el = document.createElement('div');
  el.className = 'tool-bar';
  const bulb = tool('bulb', () => cb.onBulb());
  const paw = tool('paw', () => cb.onPaw());
  el.append(bulb.btn, paw.btn);

  let prev: ToolBarProps | null = null;
  const render = (p: ToolBarProps): void => {
    if (prev && prev.hints === p.hints && prev.kitties === p.kitties && prev.bulbEnabled === p.bulbEnabled && prev.pawEnabled === p.pawEnabled && prev.hintsFree === p.hintsFree) return;
    const bump = (r: ToolRefs, before: number | undefined, now: number): void => {
      if (before !== undefined && now > before) {
        r.badge.classList.remove('tool__badge--bump');
        void r.badge.offsetWidth;
        r.badge.classList.add('tool__badge--bump');
      }
    };
    bump(bulb, prev?.hints, p.hints);
    bump(paw, prev?.kitties, p.kitties);
    prev = p;
    const hintText = p.hintsFree ? t('game.tool.free') : String(p.hints);
    if (bulb.badge.textContent !== hintText) bulb.badge.textContent = hintText;
    if (paw.badge.textContent !== String(p.kitties)) paw.badge.textContent = String(p.kitties);
    bulb.btn.toggleAttribute('data-free', p.hintsFree);
    bulb.btn.toggleAttribute('data-empty', !p.hintsFree && p.hints <= 0);
    paw.btn.toggleAttribute('data-empty', p.kitties <= 0);
    bulb.btn.setAttribute('aria-label', p.hintsFree ? `${t('game.tool.hint')}, ${t('game.tool.free')}` : t('game.tool.hint.a11y', { count: p.hints }));
    paw.btn.setAttribute('aria-label', t('game.tool.kitty.a11y', { count: p.kitties }));
    bulb.btn.disabled = !p.bulbEnabled;
    paw.btn.disabled = !p.pawEnabled;
  };
  render(props);

  return {
    el,
    update: render,
    toolRect: (k) => (k === 'bulb' ? bulb.btn : paw.btn).getBoundingClientRect(),
    destroy() {
      el.parentNode?.removeChild(el);
    },
  };
}
