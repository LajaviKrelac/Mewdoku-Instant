// Owner: A (Phase 2b; was ui-board); G3 (Phase 2d: three helpers, the new badges, the idle pulse)
// The helper row under the board (look-spec §1.11, §1.12): three white discs, kitty · bulb · mouse,
// each with its full-colour art (G2: tool-kitty, tool-bulb, tool-mouse) and a badge at its upper
// inline end that does not move with the pulse:
// - kitty and bulb: a red count badge while the stock is above 0; "Free" on the tutorial bulb; at 0 the
//   green "watch a video" badge when a rewarded video can refill it (ToolBarProps.videoRefill), else a
//   muted "0";
// - mouse: the video badge when a video can pay for it, else no badge (web). The mouse has no stock;
//   when it is not shown (tutorial, a mode without the kitty, cfg.mouse.enabled off) its button keeps
//   its slot with data-off: invisible, inert, out of the Tab order, so the kitty and the bulb never move.
// [data-pulse] on the helper the game suggests (GameView.pulse): the disc and its art scale 1 → 1.08
// with a warm glow on a 1.5 s cycle (hud.css; reduced motion: none). Disabled helpers never pulse.
// Phase 2d.1 (helpers-spec §4.5, §1.2): the whole control presses to 0.90 (:active, hud.css) and fires
// on release; a pointer release springs back via 1.04 (.tool--spring, 300 ms; not for a key press).
// [data-busy] on the row during a helper run (the mouse, the kitty's reveal, the hint): the tools are
// inert without the disabled fade.
// Classes: .tool-bar[data-busy] > button.tool.tool--paw|bulb|mouse[data-pulse][data-empty][data-free][data-off]
//            > .tool__disc > svg.tool__icon ; .tool__badge.tool__badge--count|--video|--free(.tool__badge--bump)
import { cfg } from '../../app/config';
import { formatNumber, onLocaleChanged, t } from '../../i18n';
import { icon } from '../art/sprite';
import type { View } from '../dom';

export interface ToolBarProps {
  readonly hints: number;
  readonly kitties: number;
  readonly bulbEnabled: boolean;
  readonly pawEnabled: boolean;
  /** Tutorial: the bulb is free, so its badge reads "Free" (02 §9.3). */
  readonly hintsFree: boolean;
  /** Phase 2d §1.12: the mouse helper; not shown = its slot stays, data-off. */
  readonly mouse: { readonly shown: boolean; readonly enabled: boolean };
  /** Phase 2d §1.11: a rewarded video can refill a helper (the video badge at 0, and on the mouse). */
  readonly videoRefill: boolean;
  /** Phase 2d §1.11: the helper that pulses now (GameView.pulse); null = none. */
  readonly pulse: 'paw' | 'bulb' | null;
  /** Phase 2d.1 §1.2: a helper run is on (input locked, status kitty or hint): inert, no disabled fade. Required since I-3. */
  readonly busy: boolean;
}

export interface ToolBarCallbacks {
  onBulb(): void;
  onPaw(): void;
  /** Phase 2d §1.12: the mouse button. */
  onMouse(): void;
}

export type ToolKind = 'paw' | 'bulb' | 'mouse';

export interface ToolBarView extends View<ToolBarProps> {
  /** Client rect of a tool button (coach target in tutorial step 5); null for a mouse that is not shown. */
  toolRect(tool: ToolKind): DOMRect | null;
}

interface ToolRefs {
  readonly btn: HTMLButtonElement;
  readonly badge: HTMLElement;
}

const ART = { paw: 'tool-kitty', bulb: 'tool-bulb', mouse: 'tool-mouse' } as const;

function tool(kind: ToolKind, onPress: () => void): ToolRefs {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `tool tool--${kind}`;
  const disc = document.createElement('span');
  disc.className = 'tool__disc';
  disc.appendChild(icon(ART[kind], { class: 'tool__icon' }));
  const badge = document.createElement('span');
  badge.className = 'tool__badge';
  badge.setAttribute('aria-hidden', 'true');
  btn.append(disc, badge);
  btn.addEventListener('click', (e) => {
    // A pointer release springs back (§4.5); a key press (detail 0) presses without it.
    if (e.detail > 0) {
      btn.classList.remove('tool--spring');
      void btn.offsetWidth;
      btn.classList.add('tool--spring');
    }
    onPress();
  });
  btn.addEventListener('animationend', (e) => {
    if (e.animationName === 'tool-spring') btn.classList.remove('tool--spring');
  });
  return { btn, badge };
}

/** The badge's look and text: a count, "Free", the video play mark, or none. */
type Badge = { readonly kind: 'count' | 'free' | 'video'; readonly text: string } | null;

function setBadge(r: ToolRefs, b: Badge): void {
  r.badge.hidden = b === null;
  if (!b) return;
  for (const k of ['count', 'free', 'video'] as const) r.badge.classList.toggle(`tool__badge--${k}`, b.kind === k);
  if (b.kind === 'video') {
    if (!r.badge.querySelector('svg')) {
      r.badge.textContent = '';
      r.badge.appendChild(icon('icon-play', { class: 'tool__play' }));
    }
  } else if (r.badge.textContent !== b.text || r.badge.querySelector('svg')) r.badge.textContent = b.text;
}

export function createToolBar(props: ToolBarProps, cb: ToolBarCallbacks): ToolBarView {
  const el = document.createElement('div');
  el.className = 'tool-bar';
  const paw = tool('paw', () => cb.onPaw());
  const bulb = tool('bulb', () => cb.onBulb());
  const mouse = tool('mouse', () => cb.onMouse());
  // DOM (and Tab) order: kitty · bulb · mouse (look-spec §1.11, §1.18).
  el.append(paw.btn, bulb.btn, mouse.btn);

  let prev: ToolBarProps | null = null;
  const render = (p: ToolBarProps): void => {
    el.toggleAttribute('data-busy', p.busy);
    if (
      prev &&
      prev.hints === p.hints &&
      prev.kitties === p.kitties &&
      prev.bulbEnabled === p.bulbEnabled &&
      prev.pawEnabled === p.pawEnabled &&
      prev.hintsFree === p.hintsFree &&
      prev.videoRefill === p.videoRefill &&
      prev.pulse === p.pulse &&
      prev.mouse.shown === p.mouse.shown &&
      prev.mouse.enabled === p.mouse.enabled
    )
      return;
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
    const video = p.videoRefill;
    // Kitty and bulb (§1.11): the count; "Free" (tutorial bulb); at 0 the video badge or a muted 0.
    const stock = (r: ToolRefs, n: number, free: boolean, name: string, countName: string): void => {
      const empty = !free && n <= 0;
      setBadge(r, free ? { kind: 'free', text: t('game.tool.free') } : empty && video ? { kind: 'video', text: '' } : { kind: 'count', text: String(Math.max(0, n)) });
      r.btn.toggleAttribute('data-free', free);
      r.btn.toggleAttribute('data-empty', empty);
      r.btn.setAttribute('aria-label', free ? `${name}, ${t('game.tool.free')}` : empty && video ? t('game.tool.video.a11y', { tool: name }) : countName);
    };
    stock(paw, p.kitties, false, t('game.tool.kitty'), t('game.tool.kitty.a11y', { count: p.kitties }));
    stock(bulb, p.hints, p.hintsFree, t('game.tool.hint'), t('game.tool.hint.a11y', { count: p.hints }));
    // The mouse (§1.12): no stock; the video badge when a video pays for it, else none.
    const shown = p.mouse.shown;
    setBadge(mouse, video ? { kind: 'video', text: '' } : null);
    mouse.btn.toggleAttribute('data-off', !shown);
    mouse.btn.toggleAttribute('inert', !shown);
    if (shown) {
      mouse.btn.removeAttribute('aria-hidden');
      mouse.btn.removeAttribute('tabindex');
    } else {
      mouse.btn.setAttribute('aria-hidden', 'true');
      mouse.btn.tabIndex = -1;
    }
    mouse.btn.setAttribute('aria-label', t('game.tool.mouse.a11y', { count: formatNumber(cfg.mouse.cells) }));
    paw.btn.disabled = !p.pawEnabled;
    bulb.btn.disabled = !p.bulbEnabled;
    mouse.btn.disabled = !shown || !p.mouse.enabled;
    // The idle pulse (§1.11) only on an enabled helper.
    paw.btn.toggleAttribute('data-pulse', p.pulse === 'paw' && p.pawEnabled);
    bulb.btn.toggleAttribute('data-pulse', p.pulse === 'bulb' && p.bulbEnabled);
  };
  render(props);
  // The labels follow the language (review A11Y-I18N-1): re-render the last props without a bump.
  const offLocale = onLocaleChanged(() => {
    const last = prev;
    if (!last) return;
    prev = null;
    render(last);
  });

  return {
    el,
    update: render,
    toolRect: (k) => {
      const b = k === 'paw' ? paw.btn : k === 'bulb' ? bulb.btn : mouse.btn;
      return b.hasAttribute('data-off') ? null : b.getBoundingClientRect();
    },
    destroy() {
      offLocale();
      el.parentNode?.removeChild(el);
    },
  };
}
