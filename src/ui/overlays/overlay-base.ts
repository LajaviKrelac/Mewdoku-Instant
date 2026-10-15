// Owner: B (Phase 2b; was ui-shell)
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
// D-2e-25 review (2026-10-14): createBandGuard, the short tap guard after a screen's banner band changed on show (review
// round 3, 2026-10-15: first(band, true) for a view that rebuilds a screen on show in place; review round 4, 2026-10-15:
// that view takes over the guard time the old one had left, first(band, true, carryMs) read with bandGuardLeft).
import { cfg, type GameConfig } from '../../app/config';
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

// ─────────────────────────────── band-change guard ───────────────────────────────

/**
 * D-2e-25 review (2026-10-14, N4, review #5): how long the controls of a screen on show ignore taps after its banner
 * band changed: ads.banner.bandChangeGuardMs with ads.banner.collapseWhenEmpty, else 0 (no guard).
 */
export function bandGuardMs(c: Pick<GameConfig, 'ads'> = cfg): number {
  return c.ads.banner.collapseWhenEmpty ? Math.max(0, c.ads.banner.bandChangeGuardMs) : 0;
}

export interface BandGuard {
  /**
   * A first render (a mount, an open): the band shown; releases a guard still on (a reopened overlay). `inPlace`
   * (D-2e-25 review round 3, R3-1): the view rebuilds a screen on show in place, with the band in view: it is on show at
   * once, so a change even in this render's own task arms the guard. `carryMs` (round 4, R4-5; with `inPlace` only): the
   * guard time still running on the view this one replaces (bandGuardLeft of its root): taps keep being ignored for it
   * (at most ms()).
   */
  first(band: boolean, inPlace?: boolean, carryMs?: number): void;
  /** A later render: when its band differs from the one shown and the screen is on show, taps are ignored for a while. */
  band(band: boolean): void;
  /** Taps are being ignored now (root[data-band-guard]). */
  active(): boolean;
  /** D-2e-25 review round 4 (R4-5): how long taps are still ignored for (ms; 0 when the guard is off). */
  left(): number;
  /** Close, destroy: the guard is released and the band forgotten (the next render is a first one again). */
  stop(): void;
}

/** D-2e-25 review round 4 (R4-5): the band guard created on each root (bandGuardLeft). */
const guards = new WeakMap<object, BandGuard>();

/**
 * D-2e-25 review round 4 (2026-10-15, R4-5): the guard time still running on the band guard of `root` (a screen view's
 * el), in ms; 0 when it has none or it is off. app/shell.ts reads it from the Home or event view it is about to rebuild in
 * place, before the swap destroys it, and passes it to the new view (HomeView / EventScreenView.guardMs).
 */
export function bandGuardLeft(root: object | null | undefined): number {
  if (!root) return 0;
  return guards.get(root)?.left() ?? 0;
}

/**
 * D-2e-25 review (2026-10-14, N4, review #5): a banner band is decided when a screen shows, but on the same mount it may
 * go away (an empty banner answer gives it back), and the column then moves by ads.banner.reservePx: a tap aimed at
 * Daily lands on Play, the event screen's Home on Top list. So when the band of a screen ALREADY ON SHOW changes (Home,
 * the event screen, the victory, the streak screen), every click inside `root` is swallowed in the capture phase for
 * `ms()` (bandGuardMs(): ads.banner.bandChangeGuardMs, 0 = none, only with collapseWhenEmpty); root carries
 * data-band-guard meanwhile. Not on the first render: the band a view was built or opened with, and any change before
 * that render's next task (the same task: nothing painted yet, as when the shell renders Home again with the band it
 * just decided) never arm it. Another change while it is on re-arms it for the full time. It leaves aria-disabled alone
 * on purpose: setGated() / isGated() belong to the other rules (the victory's buttonDelayMs, the streak's Continue, a
 * teaser card), which it can therefore never release early, and the column does not flash dimmed (.btn[aria-disabled]).
 * stop() clears both timers (close, destroy), so nothing stays guarded. D-2e-25 review round 3 (2026-10-15, R3-1): a view
 * that rebuilds a screen on show in place (app/shell.ts: Home over Home, the event screen over itself) is built with the
 * band in view and is on show from its first render (first(band, true)): a change from then on is one the player sees.
 * Round 4 (2026-10-15, R4-5): such a view also takes over the guard time the view it replaces had left (first(band, true,
 * carryMs)): the rebuild threw it away, so a tap meant for the old column landed on the moved one.
 */
export function createBandGuard(root: HTMLElement, ms: () => number = () => bandGuardMs()): BandGuard {
  /** The band on show; null before the first render. */
  let shown: boolean | null = null;
  /** The first render's task is over (a change now is one the player may see). */
  let onShow = false;
  let settle: ReturnType<typeof setTimeout> | null = null;
  let hold: ReturnType<typeof setTimeout> | null = null;
  /** Round 4 (R4-5): Date.now() when the guard on ends (read while `hold` is set). */
  let until = 0;
  const release = (): void => {
    if (hold !== null) clearTimeout(hold);
    hold = null;
    root.removeAttribute('data-band-guard');
  };
  /** Taps are ignored for `wait` ms from now (a guard still on is replaced). */
  const arm = (wait: number): void => {
    release();
    root.setAttribute('data-band-guard', '');
    until = Date.now() + wait;
    hold = setTimeout(release, wait);
  };
  const forget = (): void => {
    if (settle !== null) clearTimeout(settle);
    settle = null;
    onShow = false;
    shown = null;
  };
  root.addEventListener(
    'click',
    (ev) => {
      if (hold === null) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
    },
    true,
  );
  const guard: BandGuard = {
    first(band, inPlace = false, carryMs = 0) {
      release();
      forget();
      shown = band;
      if (inPlace) {
        onShow = true;
        // Round 4 (R4-5): the old view's guard time left goes on here (never longer than a full guard; 0 ms: none).
        const wait = Math.min(carryMs, ms());
        if (wait > 0) arm(wait);
        return;
      }
      settle = setTimeout(() => {
        settle = null;
        onShow = true;
      }, 0);
    },
    band(band) {
      if (shown === null) return guard.first(band);
      if (band === shown) return;
      shown = band;
      const wait = ms();
      if (!onShow || !(wait > 0)) return;
      arm(wait);
    },
    active: () => hold !== null,
    left: () => (hold === null ? 0 : Math.max(0, Math.min(ms(), until - Date.now()))),
    stop() {
      release();
      forget();
    },
  };
  guards.set(root, guard);
  return guard;
}

/** Kept on one line: a word followed by a "·" / "—" separator, and a hyphenated word ("double-tap"). */
const KEEP = '\\S+ [·—–](?= )|[^\\s-]+(?:-[^\\s-]+)+';

/**
 * Sets `el`'s text with `phrases` (a date such as "Wed 7 Oct"), hyphenated words and a word followed
 * by a "·" / "—" separator kept on one line: each is wrapped in a `.nowrap` span (UX-15).
 * `el.textContent` stays exactly `text`, so screen readers and tests see the plain sentence.
 */
export function setTextKeepTogether(el: HTMLElement, text: string, phrases: readonly string[] = []): void {
  el.textContent = '';
  el.append(...keepTogetherNodes(text, phrases));
}

/** The nodes setTextKeepTogether() appends: plain text with `.nowrap` spans around the kept phrases. */
export function keepTogetherNodes(text: string, phrases: readonly string[] = []): (Node | string)[] {
  const alts = phrases.filter((p) => p !== '').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp([...alts, KEEP].join('|'), 'g');
  const out: (Node | string)[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    out.push(text.slice(last, m.index), h('span', { class: 'nowrap' }, m[0]));
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(text.slice(last));
  return out.filter((n) => n !== '');
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

// ─────────────────────────────── keyboard ───────────────────────────────

/**
 * The index step of an arrow key in a one-dimensional group (radio groups, tabs). Horizontal keys
 * follow the visual order: in a right-to-left layout the first option sits on the right, so
 * ArrowRight steps back (review A11Y-HUB-1). 0 for any other key.
 */
export function arrowStep(key: string, rtl: boolean): number {
  if (key === 'ArrowDown') return 1;
  if (key === 'ArrowUp') return -1;
  if (key === 'ArrowRight') return rtl ? -1 : 1;
  if (key === 'ArrowLeft') return rtl ? 1 : -1;
  return 0;
}

/** The inline direction of `el` (computed; 'ltr' without a window). */
export function inlineDir(el: Element): 'ltr' | 'rtl' {
  const view = el.ownerDocument.defaultView;
  try {
    return view && view.getComputedStyle(el).direction === 'rtl' ? 'rtl' : 'ltr';
  } catch {
    return 'ltr';
  }
}
