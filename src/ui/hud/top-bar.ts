// Owner: A (Phase 2b)
// Top bar (02 §5): title + Hard badge, Home and Gear (and Trophy on Home if leaderboards exist) at
// the top RIGHT; the top-left 64×64 px stays empty in the FBIG build (FB safe zone, 02 §19).
// Phase 2b (F0, phase2b §2.5, §12.3): an optional `lead` slot right after the safe zone (at the
// inline start on web) where B puts the Home fish pill. A styles it (hud.css).
// Classes: .top-bar[data-fb-safe] > .top-bar__lead .top-bar__slot? .top-bar__title(.top-bar__text .badge--hard)
//          .top-bar__actions > .btn.btn--icon.top-bar__btn--trophy|home|settings
// Review fixes: the title renders as a shrinking name plus a non-shrinking " · 13" / " · Fri 9 Oct"
// suffix (split at the last " · " of the localized title), so a long event name loses its end, never
// the puzzle number or the date (I18N-TEXT-2, UX-8); the h1's text stays the whole title. The labels
// follow the language (A11Y-I18N-1). The bar mirrors fbSafeZone to <html data-fb-safe>, so overlays
// keep their controls out of the FB top-left safe zone too (UX-3, UX-9).
import { t } from '../../i18n';
import { icon, type IconSymbol } from '../art/sprite';
import type { View } from '../dom';
import { createLocaleText } from '../locale-text';

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

function iconButton(name: string, sym: IconSymbol, onPress: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn btn--icon top-bar__btn top-bar__btn--${name}`;
  b.appendChild(icon(sym, { class: 'btn__icon' }));
  b.addEventListener('click', onPress);
  return b;
}

/** The separator of the titles that carry a suffix ("Lantern Walk · 13", "Daily · Tue 6 Oct"); every catalogue uses it. */
const SUFFIX_SEP = ' · ';

/** Splits a title at its last " · ": the name (may shrink) and the suffix with its separator (never shrinks). */
export function splitTitle(title: string): { readonly name: string; readonly suffix: string } {
  const at = title.lastIndexOf(SUFFIX_SEP);
  return at <= 0 ? { name: title, suffix: '' } : { name: title.slice(0, at), suffix: title.slice(at) };
}

/** Optional content slots (phase2b §12.3 A → B). */
export interface TopBarSlots {
  /** Placed after the FB safe zone (the Home fish pill). The caller owns and destroys it. */
  readonly lead?: HTMLElement;
}

export function createTopBar(props: TopBarProps, cb: TopBarCallbacks, slots?: TopBarSlots): View<TopBarProps> {
  const el = document.createElement('header');
  el.className = 'top-bar';
  const lead = document.createElement('div');
  lead.className = 'top-bar__lead';
  lead.setAttribute('aria-hidden', 'true');
  const title = document.createElement('div');
  title.className = 'top-bar__title';
  const text = document.createElement('h1');
  text.className = 'top-bar__text';
  const nameEl = document.createElement('span');
  nameEl.className = 'top-bar__name';
  const suffixEl = document.createElement('span');
  suffixEl.className = 'top-bar__suffix';
  text.append(nameEl, suffixEl);
  const L = createLocaleText();
  const badge = L.text(document.createElement('span'), () => t('common.hard'));
  badge.className = 'badge badge--hard';
  title.append(text, badge);
  const actions = document.createElement('div');
  actions.className = 'top-bar__actions';
  const trophy = L.attr(iconButton('trophy', 'icon-trophy', () => cb.onTrophy()), 'aria-label', () => t('common.leaderboard'));
  const home = L.attr(iconButton('home', 'icon-house', () => cb.onHome()), 'aria-label', () => t('common.home'));
  const gear = L.attr(iconButton('settings', 'icon-gear', () => cb.onSettings()), 'aria-label', () => t('common.settings'));
  actions.append(trophy, home, gear);
  L.watch();
  el.append(lead, title, actions);
  if (slots?.lead) {
    const slot = document.createElement('div');
    slot.className = 'top-bar__slot';
    slot.appendChild(slots.lead);
    el.insertBefore(slot, title);
  }

  let cur: TopBarProps | null = null;
  const render = (p: TopBarProps): void => {
    if (cur && cur.title === p.title && cur.hard === p.hard && cur.showHome === p.showHome && cur.showSettings === p.showSettings && cur.showTrophy === p.showTrophy && cur.fbSafeZone === p.fbSafeZone) return;
    cur = p;
    el.toggleAttribute('data-fb-safe', p.fbSafeZone);
    // The platform's FB safe zone, for the overlays' rules (overlay-chunk.css :root[data-fb-safe]).
    el.ownerDocument.documentElement.toggleAttribute('data-fb-safe', p.fbSafeZone);
    title.hidden = p.title === null;
    if (text.textContent !== (p.title ?? '')) {
      const parts = splitTitle(p.title ?? '');
      nameEl.textContent = parts.name;
      suffixEl.textContent = parts.suffix;
      suffixEl.hidden = parts.suffix === '';
    }
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
      L.dispose();
      el.parentNode?.removeChild(el);
    },
  };
}
