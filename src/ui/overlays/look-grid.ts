// UI batch (2026-10-13): profile — one picker grid of the profile sheet (pictures, frames or backgrounds): a radio
// group of round 52 px buttons, each showing the player's picture as it would look with that choice (avatarBadge).
// Arrow keys move through every button, RTL-aware (A11Y-HUB-1), and pick an unlocked one; a locked one keeps
// focus without being picked (aria-disabled, never `disabled`, so it stays reachable), shows a lock and tells the
// sheet, which says what unlocks it. Roving tabindex: the picked button is the group's tab stop.
// Classes: [role=radiogroup].nickname__grid.<cls> > button.nickname__pic[role=radio][data-<key>](svg.nickname__pic-art .nickname__lock?)
import { icon } from '../art/sprite';
import { h } from '../dom';
import { arrowStep, inlineDir } from './overlay-base';

export interface LookGridView {
  readonly count: number;
  readonly selected: number;
  /** Per id: true when it may not be picked yet. */
  readonly locked: readonly boolean[];
  /** Redraws the buttons' art when it changes (the other two choices). */
  readonly artKey: string;
  art(id: number): SVGSVGElement;
  label(id: number): string;
  readonly disabled: boolean;
  /** This grid is the one showing: its chosen button takes the sheet's first focus. */
  readonly autofocus: boolean;
}

export interface LookGrid {
  readonly el: HTMLElement;
  render(v: LookGridView): void;
}

export function createLookGrid(cls: string, key: 'avatar' | 'frame' | 'bg', labelledBy: string, onPick: (id: number) => void, onLocked: (id: number) => void): LookGrid {
  const el = h('div', { class: `nickname__grid ${cls}`, role: 'radiogroup', 'aria-labelledby': labelledBy });
  let buttons: HTMLButtonElement[] = [];
  let view: LookGridView | null = null;
  let artKey = '';

  const press = (id: number): void => {
    if (!view || view.disabled) return;
    if (view.locked[id]) onLocked(id);
    else onPick(id);
  };

  el.addEventListener('keydown', (ev) => {
    const step = arrowStep(ev.key, inlineDir(el) === 'rtl');
    if (!step || !view || buttons.length === 0 || view.disabled) return;
    ev.preventDefault();
    const from = buttons.indexOf(ev.target as HTMLButtonElement);
    const next = ((from < 0 ? view.selected : from) + step + buttons.length) % buttons.length;
    buttons[next]?.focus();
    press(next);
  });

  return {
    el,
    render(v) {
      view = v;
      if (buttons.length !== v.count) {
        el.textContent = '';
        artKey = '';
        buttons = Array.from({ length: v.count }, (_, id) => {
          const b = h('button', { type: 'button', class: 'nickname__pic', role: 'radio', 'aria-checked': 'false', dataset: { [key]: String(id) } });
          b.addEventListener('click', () => press(id));
          el.appendChild(b);
          return b;
        });
      }
      const redraw = v.artKey !== artKey;
      artKey = v.artKey;
      buttons.forEach((b, id) => {
        const on = id === v.selected;
        const locked = v.locked[id] === true;
        if (redraw || b.hasAttribute('data-locked') !== locked) {
          b.textContent = '';
          b.appendChild(v.art(id));
          if (locked) b.appendChild(icon('icon-lock', { class: 'nickname__lock' }));
        }
        b.toggleAttribute('data-locked', locked);
        b.setAttribute('aria-checked', String(on));
        b.setAttribute('aria-label', v.label(id));
        if (locked) b.setAttribute('aria-disabled', 'true');
        else b.removeAttribute('aria-disabled');
        b.tabIndex = on ? 0 : -1;
        b.disabled = v.disabled;
        // The sheet opens on the chosen one (Save starts gated: nothing changed yet).
        b.toggleAttribute('data-autofocus', on && v.autofocus);
      });
    },
  };
}
