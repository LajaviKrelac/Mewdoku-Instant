// Owner: U (Phase 2b review fixes, A11Y-I18N-1)
// Static UI text that follows the language. A view built its labels (titles, row labels, button
// labels, aria-labels) once with t() at creation, so after Settings → Language they stayed in the old
// language until a reload: cached overlays (Settings, a previously opened Shop) and the screen under
// the dialog. Each binding here remembers how to compute its text; apply() re-reads them all from the
// active catalogue (writing only what changed), and watch() does that on every locale change. Views
// call apply() at the top of their render() (so open() / update() always relabel) and watch() once,
// so a view that is open during the switch relabels itself whether or not the app re-renders it.
import { onLocaleChanged } from '../i18n';
import { setText } from './dom';

export type TextFn = () => string;

export interface LocaleText {
  /** Sets `node`'s text from `fn()` now and on every apply(); returns `node`. */
  text<N extends Node>(node: N, fn: TextFn): N;
  /** Sets the attribute `name` of `el` from `fn()` now and on every apply(); returns `el`. */
  attr<E extends Element>(el: E, name: string, fn: TextFn): E;
  /** A button's visible label (its .btn__label span) from `fn()`; returns `btn`. */
  label<E extends HTMLElement>(btn: E, fn: TextFn): E;
  /** Any other re-render step (rich text). Runs now and on every apply(). */
  run(fn: () => void): void;
  /** Re-applies every binding from the active catalogue. */
  apply(): void;
  /** On every locale change: apply(), then `after` (a view re-rendering its dynamic text). Once per view. */
  watch(after?: () => void): void;
  /** Stops watching (the view's destroy()). */
  dispose(): void;
}

export function createLocaleText(): LocaleText {
  const steps: (() => void)[] = [];
  let off: (() => void) | null = null;
  const add = (fn: () => void): void => {
    steps.push(fn);
    fn();
  };
  const api: LocaleText = {
    text(node, fn) {
      add(() => setText(node, fn()));
      return node;
    },
    attr(el, name, fn) {
      add(() => {
        const v = fn();
        if (el.getAttribute(name) !== v) el.setAttribute(name, v);
      });
      return el;
    },
    label(btn, fn) {
      add(() => {
        const span = btn.querySelector('.btn__label');
        if (span) setText(span, fn());
      });
      return btn;
    },
    run(fn) {
      add(fn);
    },
    apply() {
      for (const s of steps) s();
    },
    watch(after) {
      off?.();
      off = onLocaleChanged(() => {
        api.apply();
        after?.();
      });
    },
    dispose() {
      off?.();
      off = null;
    },
  };
  return api;
}
