// Owner: ui-shell
// Shared scaffolding for the overlays (02 §5 O1–O7, §18): a fixed full-screen root that holds a
// scrim and a panel with dialog semantics, `hidden` toggling (the fade-in is CSS), scrim taps routed
// to dismiss(), and guarded buttons that ignore presses while aria-disabled (delayed or busy).
// The focus trap and the inert background come from the router (CONTRACTS §4); the panel marks its
// preferred first focus with [data-autofocus].
//
// Classes (styled in src/styles/overlays.css):
//   .overlay[data-overlay=<id>]   fixed root ([hidden] → display:none)
//   .overlay__scrim  --clear | --soft | --dark
//   .overlay__panel  --sheet | --dialog | --stage
//   .overlay__head .overlay__title .overlay__body .overlay__actions .overlay__close .overlay__art
//   .btn  --primary | --secondary | --ghost | --icon | --block ; .btn__icon .btn__label .btn__badge
// Styles: src/styles/overlays.css (ui-board; adopted from the proposal in dev/shell-styles.ts).
// Visual check: /dev/shell-harness.html?view=<name>.
import { t } from '../../i18n';
import { icon, type SymbolId } from '../art/sprite';
import { h, type DomChild } from '../dom';

let uid = 0;

/** Document-unique id for aria-labelledby / aria-describedby. */
export function nextId(prefix: string): string {
  uid += 1;
  return `mw-${prefix}-${uid}`;
}

export type ScrimKind = 'clear' | 'soft' | 'dark';
export type PanelKind = 'sheet' | 'dialog' | 'stage';

export interface OverlayShellOptions {
  /** data-overlay value (the router's OverlayId). */
  readonly id: string;
  readonly scrim: ScrimKind;
  readonly panel: PanelKind;
  /** Scrim tap (usually the overlay's dismiss()). Omit to ignore taps on the scrim. */
  readonly onScrimTap?: () => void;
}

export interface OverlayShell {
  readonly el: HTMLElement;
  readonly panel: HTMLElement;
  readonly titleId: string;
  readonly descId: string;
  show(): void;
  hide(): void;
  isOpen(): boolean;
}

export function createOverlayShell(o: OverlayShellOptions): OverlayShell {
  const titleId = nextId(`${o.id}-title`);
  const descId = nextId(`${o.id}-desc`);
  const scrim = h('div', { class: ['overlay__scrim', `overlay__scrim--${o.scrim}`], 'aria-hidden': 'true' });
  if (o.onScrimTap) {
    const tap = o.onScrimTap;
    scrim.addEventListener('click', (ev) => {
      ev.preventDefault();
      tap();
    });
  }
  const panel = h('div', {
    class: ['overlay__panel', `overlay__panel--${o.panel}`],
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': titleId,
    'aria-describedby': descId,
    tabindex: '-1',
  });
  const el = h('div', { class: 'overlay', dataset: { overlay: o.id }, hidden: true }, scrim, panel);
  return {
    el,
    panel,
    titleId,
    descId,
    show() {
      el.hidden = false;
    },
    hide() {
      el.hidden = true;
    },
    isOpen: () => !el.hidden,
  };
}

// ─────────────────────────────── buttons ───────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'icon';

export interface ButtonSpec {
  readonly variant: ButtonVariant;
  readonly label?: string;
  readonly icon?: SymbolId;
  /** Accessible name when it differs from the visible label (icon buttons, badges). */
  readonly ariaLabel?: string;
  readonly className?: string;
  /** Full-width block button. */
  readonly block?: boolean;
  readonly autofocus?: boolean;
  /** Extra trailing content (badges, chevrons). */
  readonly trailing?: DomChild;
  onPress(): void;
}

export function makeButton(spec: ButtonSpec): HTMLButtonElement {
  const btn = h(
    'button',
    {
      type: 'button',
      class: ['btn', `btn--${spec.variant}`, spec.block ? 'btn--block' : null, spec.className ?? null],
      'aria-label': spec.ariaLabel,
      'data-autofocus': spec.autofocus === true,
    },
    spec.icon ? icon(spec.icon, { class: 'btn__icon' }) : null,
    spec.label !== undefined ? h('span', { class: 'btn__label' }, spec.label) : null,
    spec.trailing ?? null,
  );
  btn.addEventListener('click', (ev) => {
    if (isGated(btn)) {
      ev.preventDefault();
      return;
    }
    spec.onPress();
  });
  return btn;
}

/** aria-disabled (keeps the button focusable for keyboard users) plus a click guard. */
export function setGated(btn: HTMLElement, gated: boolean): void {
  if (gated) btn.setAttribute('aria-disabled', 'true');
  else btn.removeAttribute('aria-disabled');
}

export function isGated(btn: HTMLElement): boolean {
  return btn.getAttribute('aria-disabled') === 'true';
}

/** Kept on one line: a word followed by a "·" / "—" separator, and a hyphenated word ("double-tap"). */
const KEEP = '\\S+ [·—–](?= )|[^\\s-]+(?:-[^\\s-]+)+';

/**
 * Sets `el`'s text with `phrases` (a date such as "Wed 7 Oct"), hyphenated words and a word followed
 * by a "·" / "—" separator kept on one line: each is wrapped in a `.nowrap` span (UX-15).
 * `el.textContent` stays exactly `text`, so screen readers and tests see the plain sentence.
 */
export function setTextKeepTogether(el: HTMLElement, text: string, phrases: readonly string[] = []): void {
  const alts = phrases.filter((p) => p !== '').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp([...alts, KEEP].join('|'), 'g');
  el.textContent = '';
  let last = 0;
  for (const m of text.matchAll(re)) {
    el.append(text.slice(last, m.index), h('span', { class: 'nowrap' }, m[0]));
    last = (m.index ?? 0) + m[0].length;
  }
  el.append(text.slice(last));
}

/** Sets a button's visible label (the .btn__label span). */
export function setButtonLabel(btn: HTMLElement, label: string): void {
  const span = btn.querySelector('.btn__label');
  if (span && span.textContent !== label) span.textContent = label;
}

/** The × in a panel's corner. */
export function closeButton(onPress: () => void, label: string = t('common.close')): HTMLButtonElement {
  return makeButton({ variant: 'icon', icon: 'icon-close', ariaLabel: label, className: 'overlay__close', onPress });
}

/** A one-shot timer that can be restarted or cancelled (delayed buttons, countdowns). */
export interface Delay {
  start(ms: number, fn: () => void): void;
  cancel(): void;
}

export function createDelay(): Delay {
  let id: ReturnType<typeof setTimeout> | null = null;
  return {
    start(ms, fn) {
      if (id !== null) clearTimeout(id);
      id = null;
      if (ms <= 0) {
        fn();
        return;
      }
      id = setTimeout(() => {
        id = null;
        fn();
      }, ms);
    },
    cancel() {
      if (id !== null) clearTimeout(id);
      id = null;
    },
  };
}

/** A repeating ticker (live countdowns); start() replaces a running one. */
export interface Ticker {
  start(ms: number, fn: () => void): void;
  stop(): void;
}

export function createTicker(): Ticker {
  let id: ReturnType<typeof setInterval> | null = null;
  return {
    start(ms, fn) {
      if (id !== null) clearInterval(id);
      id = setInterval(fn, ms);
    },
    stop() {
      if (id !== null) clearInterval(id);
      id = null;
    },
  };
}
