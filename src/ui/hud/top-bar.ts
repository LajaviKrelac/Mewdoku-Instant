// Owner: ui-board
// Top bar (02 §5): title + Hard badge, Home and Gear (and Trophy on Home if leaderboards exist) at
// the top RIGHT; the top-left 64×64 px stays empty in the FBIG build (FB safe zone, 02 §19).
// Classes: .top-bar[data-fb-safe] > .top-bar__lead .top-bar__title(.top-bar__text .badge--hard)
//          .top-bar__actions > .btn.btn--icon.top-bar__btn--trophy|home|settings
import { t } from '../../i18n';
import { icon, type IconSymbol } from '../art/sprite';
import type { View } from '../dom';

export interface TopBarProps {
  /** Localized title ("Level 37", "Daily · Tue 6 Oct"), or null on Home. */
  readonly title: string | null;
  readonly hard: boolean;
  readonly showHome: boolean;
  readonly showSettings: boolean;
  readonly showTrophy: boolean;
  readonly fbSafeZone: boolean;
}

export interface TopBarCallbacks {
  onHome(): void;
  onSettings(): void;
  onTrophy(): void;
}

function iconButton(name: string, sym: IconSymbol, label: string, onPress: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn btn--icon top-bar__btn top-bar__btn--${name}`;
  b.setAttribute('aria-label', label);
  b.appendChild(icon(sym, { class: 'btn__icon' }));
  b.addEventListener('click', onPress);
  return b;
}

export function createTopBar(props: TopBarProps, cb: TopBarCallbacks): View<TopBarProps> {
  const el = document.createElement('header');
  el.className = 'top-bar';
  const lead = document.createElement('div');
  lead.className = 'top-bar__lead';
  lead.setAttribute('aria-hidden', 'true');
  const title = document.createElement('div');
  title.className = 'top-bar__title';
  const text = document.createElement('h1');
  text.className = 'top-bar__text';
  const badge = document.createElement('span');
  badge.className = 'badge badge--hard';
  badge.textContent = t('common.hard');
  title.append(text, badge);
  const actions = document.createElement('div');
  actions.className = 'top-bar__actions';
  const trophy = iconButton('trophy', 'icon-trophy', t('common.leaderboard'), () => cb.onTrophy());
  const home = iconButton('home', 'icon-house', t('common.home'), () => cb.onHome());
  const gear = iconButton('settings', 'icon-gear', t('common.settings'), () => cb.onSettings());
  actions.append(trophy, home, gear);
  el.append(lead, title, actions);

  let cur: TopBarProps | null = null;
  const render = (p: TopBarProps): void => {
    if (cur && cur.title === p.title && cur.hard === p.hard && cur.showHome === p.showHome && cur.showSettings === p.showSettings && cur.showTrophy === p.showTrophy && cur.fbSafeZone === p.fbSafeZone) return;
    cur = p;
    el.toggleAttribute('data-fb-safe', p.fbSafeZone);
    title.hidden = p.title === null;
    if (text.textContent !== (p.title ?? '')) text.textContent = p.title ?? '';
    badge.hidden = !p.hard || p.title === null;
    trophy.hidden = !p.showTrophy;
    home.hidden = !p.showHome;
    gear.hidden = !p.showSettings;
  };
  render(props);

  return {
    el,
    update: render,
    destroy() {
      el.parentNode?.removeChild(el);
    },
  };
}
