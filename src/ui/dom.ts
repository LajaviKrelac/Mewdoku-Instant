// Owner: read-only (Phase 2b; was foundation). DOM helpers (04 §3) and the component contracts every ui/ module implements.
// No framework: components are plain functions returning a handle (View / OverlayView).

// ─────────────────────────────── Component contracts ───────────────────────────────

/** A mounted component. The caller appends `el` where it wants it and later calls destroy(). */
export interface View<P> {
  readonly el: HTMLElement;
  /** Re-renders from new props. Implementations diff cheaply; calling with equal props is fine. */
  update(props: P): void;
  /** Removes listeners/timers and detaches `el`. */
  destroy(): void;
}

/**
 * A lazily created overlay (04 §5.3). The router appends `el` to the overlay host once, then
 * toggles it with open()/close(). For modal overlays the router traps focus inside `el`, makes the
 * background `inert` and restores focus on close. Overlays never close themselves: buttons call
 * prop callbacks, and the app decides (via the router) what to close.
 */
export interface OverlayView<P> {
  readonly el: HTMLElement;
  /** true: focus trap + inert background. false (coach): the board stays interactive. */
  readonly modal: boolean;
  /** Shows with fresh props (resets internal state such as delayed-button timers). */
  open(props: P): void;
  /** Updates props while open (e.g. busy flags, countdowns). */
  update(props: P): void;
  /** Hides immediately (the fade-out is CSS). */
  close(): void;
  /** Esc / scrim tap. Calls the matching prop callback and returns true, or returns false to ignore. */
  dismiss(): boolean;
  destroy(): void;
}

export type Disposer = () => void;

/** Collects cleanup functions; dispose() runs them in reverse order, once. */
export function createDisposer(): { add(fn: Disposer): void; dispose(): void } {
  const fns: Disposer[] = [];
  return {
    add: (fn) => void fns.push(fn),
    dispose() {
      while (fns.length) fns.pop()?.();
    },
  };
}

// ─────────────────────────────── h() and friends ───────────────────────────────

export type DomChild = Node | string | number | boolean | null | undefined | readonly DomChild[];
export type ClassValue = string | readonly (string | false | null | undefined)[] | Readonly<Record<string, boolean>>;
export type Handlers = { readonly [K in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[K]) => void };
type AttrValue = string | number | boolean | null | undefined;

export interface HAttrs {
  class?: ClassValue;
  /** CSS text, or properties; keys starting with `--` set custom properties. */
  style?: string | Readonly<Record<string, string | number | null | undefined>>;
  dataset?: Readonly<Record<string, AttrValue>>;
  on?: Handlers;
  /** Plain attributes: true → present (""), false/null/undefined → absent. Use aria-*, role, etc. */
  [attr: string]: unknown;
}

const RESERVED = new Set(['class', 'style', 'dataset', 'on']);
export const SVG_NS = 'http://www.w3.org/2000/svg';

/** Creates an HTML element: h('button', { class: 'pill', 'aria-label': x, on: { click } }, 'Text'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: HAttrs | null,
  ...children: DomChild[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) applyAttrs(el, attrs);
  append(el, children);
  return el;
}

/** Creates an SVG element in the SVG namespace. */
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: HAttrs | null,
  ...children: DomChild[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) applyAttrs(el, attrs);
  append(el, children);
  return el;
}

/** Appends children, flattening arrays and skipping null/undefined/booleans. */
export function append(parent: Node, children: readonly DomChild[]): void {
  for (const c of children) {
    if (c === null || c === undefined || typeof c === 'boolean') continue;
    if (Array.isArray(c)) append(parent, c as readonly DomChild[]);
    else if (typeof c === 'string' || typeof c === 'number') parent.appendChild(document.createTextNode(String(c)));
    else parent.appendChild(c as Node);
  }
}

export function applyAttrs(el: Element, attrs: HAttrs): void {
  if (attrs.class !== undefined) el.setAttribute('class', classNames(attrs.class));
  if (attrs.style !== undefined) setStyle(el as HTMLElement | SVGElement, attrs.style);
  if (attrs.dataset) setData(el as HTMLElement | SVGElement, attrs.dataset);
  if (attrs.on) {
    for (const [type, fn] of Object.entries(attrs.on)) {
      if (typeof fn === 'function') el.addEventListener(type, fn as EventListener);
    }
  }
  for (const [name, value] of Object.entries(attrs)) {
    if (RESERVED.has(name)) continue;
    setAttr(el, name, value as AttrValue);
  }
}

export function setAttr(el: Element, name: string, value: AttrValue): void {
  if (value === false || value === null || value === undefined) el.removeAttribute(name);
  else el.setAttribute(name, value === true ? '' : String(value));
}

export function setData(el: HTMLElement | SVGElement, data: Readonly<Record<string, AttrValue>>): void {
  for (const [k, v] of Object.entries(data)) {
    if (v === false || v === null || v === undefined) delete el.dataset[k];
    else el.dataset[k] = v === true ? '' : String(v);
  }
}

export function setStyle(el: HTMLElement | SVGElement, style: HAttrs['style']): void {
  if (typeof style === 'string') {
    el.style.cssText = style;
    return;
  }
  for (const [k, v] of Object.entries(style ?? {})) {
    if (v === null || v === undefined) el.style.removeProperty(k);
    else if (k.startsWith('--') || k.includes('-')) el.style.setProperty(k, String(v));
    else el.style.setProperty(k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), String(v));
  }
}

/** Sets a CSS custom property (`name` with or without the leading `--`). */
export function cssVar(el: HTMLElement | SVGElement, name: string, value: string | number): void {
  el.style.setProperty(name.startsWith('--') ? name : `--${name}`, String(value));
}

export function classNames(v: ClassValue): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.filter(Boolean).join(' ');
  return Object.entries(v as Readonly<Record<string, boolean>>)
    .filter(([, on]) => on)
    .map(([c]) => c)
    .join(' ');
}

export function toggleClass(el: Element, cls: string, on?: boolean): void {
  el.classList.toggle(cls, on);
}

export function setText(el: Node, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/** Removes all children. */
export function clear(el: Node): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function $<E extends Element = HTMLElement>(sel: string, root: ParentNode = document): E | null {
  return root.querySelector<E>(sel);
}

export function $$<E extends Element = HTMLElement>(sel: string, root: ParentNode = document): E[] {
  return Array.from(root.querySelectorAll<E>(sel));
}

/** addEventListener that returns its own remover. */
export function listen<K extends keyof HTMLElementEventMap>(
  target: HTMLElement | Document | Window,
  type: K,
  fn: (ev: HTMLElementEventMap[K]) => void,
  opts?: AddEventListenerOptions,
): Disposer {
  const l = fn as EventListener;
  target.addEventListener(type, l, opts);
  return () => target.removeEventListener(type, l, opts);
}

/** Adds `cls`, then removes it on animationend (or after `fallbackMs`) to retrigger CSS keyframes. */
export function playClass(el: Element, cls: string, fallbackMs = 1000): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth; // restart the animation
  el.classList.add(cls);
  let done = false;
  const end = (): void => {
    if (done) return;
    done = true;
    el.classList.remove(cls);
    el.removeEventListener('animationend', end);
  };
  el.addEventListener('animationend', end);
  setTimeout(end, fallbackMs);
}

/** Detaches an element if attached. */
export function detach(el: Node | null | undefined): void {
  el?.parentNode?.removeChild(el);
}

/**
 * Audit B12 (helpers-spec §4.5): the 0.90 press while the pointer is down must show on touch too, where
 * :active does not hold during the touch (Chromium) or needs a touchstart listener (iOS WebKit). Mirrors
 * the press into [data-pressed] from pointerdown until pointerup / cancel / leave; the stylesheet presses
 * `:active` and `[data-pressed]` alike. Disabled controls (disabled or aria-disabled) do not press.
 */
export function trackPress(btn: HTMLElement): void {
  const off = (): void => btn.removeAttribute('data-pressed');
  btn.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || (btn as HTMLButtonElement).disabled || btn.getAttribute('aria-disabled') === 'true') return;
    btn.setAttribute('data-pressed', '');
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'] as const) btn.addEventListener(type, off);
}
