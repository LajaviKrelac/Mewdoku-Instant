// Owner: A (Phase 2b); G3 (Phase 2d: the settings dot, shared helpers for the game bar)
// Top bar (02 §5): title + Hard badge, Home and Gear (and Trophy on Home if leaderboards exist) at
// the top RIGHT; the top-left 64×64 px stays empty in the FBIG build (FB safe zone, 02 §19).
// Phase 2b (F0, phase2b §2.5, §12.3): an optional `lead` slot right after the safe zone (at the
// inline start on web) for Home's lead pill (Phase 2c §2.8: the period pill). A styles it (hud.css).
// Classes: .top-bar[data-fb-safe] > .top-bar__lead .top-bar__slot? .top-bar__title(.top-bar__text .badge--hard)
//          .top-bar__actions > .btn.btn--icon.top-bar__btn--trophy|home|settings (> .top-bar__dot, Phase 2d)
// Review fixes: the title renders as a shrinking name plus a non-shrinking " · 13" / " · Fri 9 Oct"
// suffix (split at the last " · " of the localized title), so a long event name loses its end, never
// the puzzle number or the date (I18N-TEXT-2, UX-8); 2c.1 integration (N1): a title without " · " keeps
// its trailing level number the same way ("المستوى 310" next to the Hard badge at 320 px lost "310").
// The h1's text stays the whole title. The labels
// follow the language (A11Y-I18N-1). The bar mirrors fbSafeZone to <html data-fb-safe>, so overlays
// keep their controls out of the FB top-left safe zone too (UX-3, UX-9).
// Phase 2d (look-spec §1.4, §1.15, §2.2): the game screen has its own bar (game-bar.ts, which reuses
// splitTitle, iconButton and setSettingsDot); Home and the event screen keep this one, with the white
// round buttons (base.css .btn--icon) and the red dot on the gear (TopBarProps.settingsDot).
import { onLocaleChanged, t } from '../../i18n';
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
  /** Phase 2d §1.15: the gear's red dot (something in Settings not seen yet). Absent = false. */
  readonly settingsDot?: boolean;
}

export interface TopBarCallbacks {
  onHome(): void;
  onSettings(): void;
  onTrophy(): void;
}

/** A round icon button of a top bar (`.btn--icon`: the white disc of base.css; hud.css sizes the game bar's). */
export function iconButton(name: string, sym: IconSymbol, onPress: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn btn--icon top-bar__btn top-bar__btn--${name}`;
  b.appendChild(icon(sym, { class: 'btn__icon' }));
  b.addEventListener('click', onPress);
  return b;
}

/**
 * Phase 2d §1.15: the gear's red dot (something in Settings not seen yet) and the gear's name with it
 * ("Settings, something new"). The dot is decorative; the name carries it.
 */
export function setSettingsDot(gear: HTMLElement, on: boolean): void {
  let dot = gear.querySelector<HTMLElement>('.top-bar__dot');
  if (on && !dot) {
    dot = document.createElement('span');
    dot.className = 'top-bar__dot';
    dot.setAttribute('aria-hidden', 'true');
    gear.appendChild(dot);
  } else if (!on && dot) dot.remove();
  gear.setAttribute('aria-label', on ? t('common.settings.new') : t('common.settings'));
}

/** The separator of the titles that carry a suffix ("Lantern Walk · 13", "Daily · Tue 6 Oct"); every catalogue uses it. */
const SUFFIX_SEP = ' · ';

/** A trailing number after a space ("Level 310"), inside its placeholder's bidi isolates if any. */
const TRAILING_NUM = /\s[\u2066-\u2069]*\d+[\u2066-\u2069]*$/;

/**
 * Splits a title at its last " · ", else before a trailing level number: the name (may shrink) and
 * the suffix with its separator (never shrinks).
 */
export function splitTitle(title: string): { readonly name: string; readonly suffix: string } {
  const sep = title.lastIndexOf(SUFFIX_SEP);
  const at = sep > 0 ? sep : title.search(TRAILING_NUM);
  return at <= 0 ? { name: title, suffix: '' } : { name: title.slice(0, at), suffix: title.slice(at) };
}

/** Optional content slots (phase2b §12.3 A → B). */
export interface TopBarSlots {
  /** Placed after the FB safe zone (Home's period pill, Phase 2c §2.8). The caller owns and destroys it. */
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
  const gear = iconButton('settings', 'icon-gear', () => cb.onSettings());
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
    if (cur && cur.title === p.title && cur.hard === p.hard && cur.showHome === p.showHome && cur.showSettings === p.showSettings && cur.showTrophy === p.showTrophy && cur.fbSafeZone === p.fbSafeZone && cur.settingsDot === p.settingsDot) return;
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
    setSettingsDot(gear, p.settingsDot === true);
  };
  render(props);
  // The gear's name follows the language too (A11Y-I18N-1).
  const offLocale = onLocaleChanged(() => {
    if (cur) setSettingsDot(gear, cur.settingsDot === true);
  });

  return {
    el,
    update: render,
    destroy() {
      offLocale();
      L.dispose();
      el.parentNode?.removeChild(el);
    },
  };
}
