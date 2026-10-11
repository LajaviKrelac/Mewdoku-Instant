// Owner: lead (preview link, 2026-10-11). The preview menu: a small "Preview" tab hanging from the top edge (the
// empty strip between Home's chip and gear, and above the game screen's Level / Score row, so it never covers the
// board or a control), which opens a card with the shortcuts. Each shortcut reloads the page with ?preview=<op>;
// preview/platform.ts applies it before the game loads (after the old page's last save), so every one starts clean.
// Own markup and styles (preview/preview.css, classes mwp-*); outside the game's #app root, so the game's click
// sounds, focus handling and overlays never see it.
import { S } from './strings';

export type PreviewOp = 'new' | 'returning' | 'outOfHelpers' | 'endDay' | 'reset';
export const PREVIEW_OPS: readonly PreviewOp[] = ['new', 'returning', 'outOfHelpers', 'endDay', 'reset'];

export interface RibbonOptions {
  /** The scenario the page is in now (the menu's "Now:" line). */
  readonly current: string;
  /** "Built 2026-10-11 12:05 UTC · c32c14d · v0.1.0", or null. */
  readonly build: string | null;
  /** The menu starts open (the first visit). */
  readonly open: boolean;
  onToggle(open: boolean): void;
  onAction(op: PreviewOp): void;
}

export interface Ribbon {
  readonly el: HTMLElement;
  setOpen(open: boolean): void;
  destroy(): void;
}

export function mountRibbon(doc: Document, o: RibbonOptions): Ribbon {
  const el = doc.createElement('div');
  el.className = 'mwp-ribbon';
  el.setAttribute('data-preview-ui', 'ribbon');

  const tab = doc.createElement('button');
  tab.type = 'button';
  tab.className = 'mwp-ribbon__tab';
  tab.setAttribute('aria-controls', 'mwp-menu');
  const tabText = doc.createElement('span');
  tabText.textContent = S.tab;
  const chev = doc.createElement('span');
  chev.className = 'mwp-ribbon__chev';
  chev.setAttribute('aria-hidden', 'true');
  tab.append(tabText, chev);

  const scrim = doc.createElement('div');
  scrim.className = 'mwp-ribbon__scrim';

  const menu = doc.createElement('section');
  menu.id = 'mwp-menu';
  menu.className = 'mwp-menu';
  menu.setAttribute('aria-label', S.title);
  const title = doc.createElement('h2');
  title.className = 'mwp-menu__title';
  title.textContent = S.title;
  const intro = doc.createElement('p');
  intro.className = 'mwp-menu__intro';
  intro.textContent = S.intro;
  const now = doc.createElement('p');
  now.className = 'mwp-menu__now';
  const nowLabel = doc.createElement('span');
  nowLabel.textContent = `${S.now} `;
  const nowValue = doc.createElement('strong');
  nowValue.textContent = o.current;
  now.append(nowLabel, nowValue);
  const list = doc.createElement('ul');
  list.className = 'mwp-menu__list';
  const buttons: HTMLButtonElement[] = [];
  for (const op of PREVIEW_OPS) {
    const li = doc.createElement('li');
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'mwp-menu__op';
    b.setAttribute('data-op', op);
    const name = doc.createElement('span');
    name.className = 'mwp-menu__name';
    name.textContent = S.scenario[op];
    const help = doc.createElement('span');
    help.className = 'mwp-menu__help';
    help.textContent = S.help[op];
    b.append(name, help);
    b.addEventListener('click', () => {
      for (const x of buttons) x.disabled = true;
      name.textContent = `${S.scenario[op]} · ${S.working}`;
      o.onAction(op);
    });
    buttons.push(b);
    li.append(b);
    list.append(li);
  }
  const foot = doc.createElement('div');
  foot.className = 'mwp-menu__foot';
  const built = doc.createElement('p');
  built.className = 'mwp-menu__built';
  built.textContent = o.build ?? '';
  built.hidden = o.build === null;
  const hide = doc.createElement('button');
  hide.type = 'button';
  hide.className = 'mwp-btn mwp-btn--ghost mwp-menu__hide';
  hide.textContent = S.hide;
  foot.append(built, hide);
  menu.append(title, intro, now, list, foot);
  el.append(tab, scrim, menu);

  let open = false;
  const setOpen = (v: boolean): void => {
    open = v;
    el.setAttribute('data-open', v ? '1' : '0');
    menu.hidden = !v;
    scrim.hidden = !v;
    tab.setAttribute('aria-expanded', v ? 'true' : 'false');
    tab.setAttribute('aria-label', v ? S.tabClose : S.tabOpen);
    chev.textContent = v ? '▴' : '▾';
  };
  const toggle = (v: boolean): void => {
    setOpen(v);
    o.onToggle(v);
  };
  tab.addEventListener('click', () => toggle(!open));
  hide.addEventListener('click', () => {
    toggle(false);
    tab.focus();
  });
  scrim.addEventListener('click', () => toggle(false));
  const onKey = (e: KeyboardEvent): void => {
    if (open && e.key === 'Escape') {
      e.stopPropagation();
      toggle(false);
      tab.focus();
    }
  };
  el.addEventListener('keydown', onKey);
  setOpen(o.open);
  (doc.body ?? doc.documentElement).appendChild(el);
  return {
    el,
    setOpen,
    destroy() {
      el.removeEventListener('keydown', onKey);
      el.remove();
    },
  };
}
