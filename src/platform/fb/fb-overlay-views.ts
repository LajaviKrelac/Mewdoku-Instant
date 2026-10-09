// Owner: D
// FB overlay views (phase2b §5.2, §5.4): overlayViews.createOverlayViewWithXMLString(xml, css, data,
// onLoad, onError, basePath). The only place other players' names and photos appear (05 §3).
// Lazy `fb-social` chunk.
//
// How a view is put on screen follows Meta's public NEZP sample (read 2026-10-09): the call returns
// the view (we also accept a promise), the game appends `view.iframeElement` to its own DOM, onLoad
// fires once the iframe has loaded, then `showAsync()` shows it and `dismissAsync()` hides it; the
// game removes the iframe itself. `data` is a JSON string. Taps inside the view reach the game only
// as custom events (`onTapEvent` in the XML → overlayViews.setCustomEventHandler).
//
// Two presentations:
//   - in a rect (only when cfg.rank.overlayPlacement is 'rect', §14 G3): a fixed host box over the
//     caller's rect; the caller closes it (the ranking panel owns dismissal);
//   - full screen (the default until G3): a fixed full-viewport host with our own close button
//     outside the iframe (top right, clear of the FB safe zone), Esc, and the view's own close
//     control (RANK_LIST_CLOSE_EVENT), so the player can always get back to our panel.
// [uncertain: G3] whether this mounting model, rect placement, custom events and dismissal behave
// like this on facebook.com, Android and iOS. Every failure answers null, and the panel falls back.
import { cfg, type GameConfig } from '../../app/config';
import { t } from '../../i18n';
import type { PlatformTimers } from '../types';
import { overlayViewsSupported } from './fb-probe';
import type { FBInstantSDK, FBOverlayView } from './fbinstant';
import { RANK_LIST_CLOSE_EVENT } from './views/rank-list';

/** An open overlay: close() is idempotent; `closed` settles once it is gone (any reason). */
export interface OverlayHandle {
  close(): void;
  readonly closed: Promise<void>;
}

export interface FbOverlayViews {
  /** overlayViews.createOverlayViewWithXMLString exists. */
  supported(): boolean;
  /**
   * Creates and shows a view from our XML/CSS templates with `data` bound. With `rect` it is placed
   * inside it (only when placement in a rect works, G3). null when unsupported, on error or after
   * rank.fetchTimeoutMs. Never rejects.
   */
  show(xml: string, css: string, data: unknown, rect?: DOMRect): Promise<OverlayHandle | null>;
}

export interface FbOverlayViewsOptions {
  readonly timers: PlatformTimers;
  readonly config?: GameConfig;
  /** Where hosts are mounted. Default: the global document. */
  readonly doc?: Document;
}

/** data-testid of the host element (e2e). */
export const OVERLAY_HOST_TEST_ID = 'fb-overlay-host';
/** Above our screens, overlays and toasts; below FB's own chrome (which is outside our document). */
const HOST_Z = 2147483000;

interface Open {
  readonly view: FBOverlayView | null;
  readonly close: () => void;
}

export function createFbOverlayViews(sdk: FBInstantSDK, opts: FbOverlayViewsOptions): FbOverlayViews {
  const c = opts.config ?? cfg;
  const timers = opts.timers;
  const docOf = (): Document | null => opts.doc ?? (typeof document === 'undefined' ? null : document);
  const open = new Set<Open>();
  let handlerSet = false;

  /** One global custom-event handler; a close event closes the view it came from (or, unknown id, the newest). */
  const ensureHandler = (): void => {
    if (handlerSet) return;
    handlerSet = true;
    try {
      sdk.overlayViews?.setCustomEventHandler?.((event, viewId) => {
        if (event !== RANK_LIST_CLOSE_EVENT) return;
        const list = Array.from(open);
        const hit = list.find((o) => o.view?.id !== undefined && o.view.id === viewId) ?? list[list.length - 1];
        hit?.close();
      });
    } catch {
      /* no custom events: our own close button and Esc still work */
    }
  };

  const supported = (): boolean => overlayViewsSupported(sdk);

  const show = (xml: string, css: string, data: unknown, rect?: DOMRect): Promise<OverlayHandle | null> => {
    const doc = docOf();
    const api = sdk.overlayViews;
    if (!doc || !api || !supported()) return Promise.resolve(null);
    ensureHandler();
    let payload: string;
    try {
      payload = JSON.stringify(data ?? {});
    } catch {
      return Promise.resolve(null);
    }

    return new Promise<OverlayHandle | null>((resolve) => {
      const fullScreen = !rect;
      const host = doc.createElement('div');
      host.setAttribute('data-testid', OVERLAY_HOST_TEST_ID);
      host.setAttribute('data-mode', fullScreen ? 'fullscreen' : 'rect');
      host.style.cssText = fullScreen
        ? `position:fixed;top:0;left:0;right:0;bottom:0;z-index:${HOST_Z};display:flex;flex-direction:column;background:#2A2430;`
        : `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;z-index:${HOST_Z};display:flex;flex-direction:column;`;
      const slot = doc.createElement('div');
      slot.style.cssText = 'flex:1;position:relative;min-height:0;';

      let view: FBOverlayView | null = null;
      let settled = false; // the show() promise has answered
      let closed = false;
      let resolveClosed: () => void = () => undefined;
      const closedP = new Promise<void>((r) => {
        resolveClosed = r;
      });
      const onKey = (e: KeyboardEvent): void => {
        if (e.key !== 'Escape' && e.key !== 'Esc') return;
        e.stopPropagation();
        e.preventDefault();
        close();
      };
      const entry: Open = {
        get view() {
          return view;
        },
        close: () => close(),
      };

      function close(): void {
        if (closed) return;
        closed = true;
        open.delete(entry);
        if (fullScreen) doc!.removeEventListener('keydown', onKey, true);
        const v = view;
        if (v?.dismissAsync) {
          try {
            void v.dismissAsync().catch(() => undefined);
          } catch {
            /* removing the host below takes the iframe away anyway */
          }
        }
        host.parentNode?.removeChild(host);
        resolveClosed();
      }

      const answer = (value: OverlayHandle | null): void => {
        if (settled) return;
        settled = true;
        timers.clearTimeout(timer);
        if (value === null) close();
        resolve(value);
      };
      const fail = (): void => answer(null);
      const timer = timers.setTimeout(fail, c.rank.fetchTimeoutMs);

      /** Puts the view's iframe into our host (idempotent); the sample mounts before onLoad fires. */
      const mount = (v: FBOverlayView): void => {
        view = v;
        const frame = v.iframeElement;
        if (!frame || frame.parentNode === slot) return;
        frame.style.position = 'absolute';
        frame.style.top = '0';
        frame.style.left = '0';
        frame.style.width = '100%';
        frame.style.height = '100%';
        frame.style.border = '0';
        slot.appendChild(frame);
      };

      const onLoad = (v: FBOverlayView): void => {
        if (settled || closed) {
          // Too late (timed out) or already closed: never leave a view behind.
          try {
            void v?.dismissAsync?.().catch(() => undefined);
          } catch {
            /* ignore */
          }
          return;
        }
        if (v) mount(v);
        const target = view;
        if (!target) return fail();
        let shown: Promise<void>;
        try {
          shown = Promise.resolve(target.showAsync());
        } catch {
          return fail();
        }
        shown.then(
          () => answer({ close, closed: closedP }),
          () => fail(),
        );
      };

      if (fullScreen) {
        const bar = doc.createElement('div');
        bar.style.cssText = 'display:flex;justify-content:flex-end;padding:8px 12px;';
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.textContent = t('common.close');
        btn.setAttribute('data-testid', 'fb-overlay-close');
        btn.style.cssText =
          'min-height:44px;padding:0 18px;border:0;border-radius:22px;background:#FFFFFF;color:#2F2A35;font:600 16px system-ui,-apple-system,sans-serif;';
        btn.addEventListener('click', () => close());
        bar.appendChild(btn);
        host.appendChild(bar);
        doc.addEventListener('keydown', onKey, true);
      }
      host.appendChild(slot);
      (doc.body ?? doc.documentElement).appendChild(host);
      open.add(entry);

      try {
        const made = api.createOverlayViewWithXMLString(xml, css, payload, onLoad, () => fail());
        Promise.resolve(made).then(
          (v) => {
            if (!v) return fail();
            if (closed) return void v.dismissAsync?.().catch(() => undefined);
            mount(v);
          },
          () => fail(),
        );
      } catch {
        fail();
      }
    });
  };

  return { supported, show };
}
