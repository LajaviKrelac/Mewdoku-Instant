// Owner: app
// visibilitychange + platform.onPause → pause the timer, mute, save now (02 §7.2, §15; 05 §4).
// FB onPause has no resume callback: the return is detected via visibilitychange / focus / pageshow,
// or the next pointerdown (the player is clearly back when they touch the game).
import type { PlatformAdapter } from '../platform/types';

export type HideReason = 'hidden' | 'fb_pause';

export interface VisibilityDeps {
  readonly doc: Document;
  readonly platform: Pick<PlatformAdapter, 'onPause'>;
  onHide(reason: HideReason): void;
  /** Called once when the page is back after one or more hides. */
  onShow(): void;
}

/** Returns the unsubscribe (platform.onPause cannot be removed; it is ignored after disposal). */
export function watchVisibility(deps: VisibilityDeps): () => void {
  const { doc } = deps;
  const win = doc.defaultView;
  const active = new Set<HideReason>();
  let disposed = false;

  const hide = (reason: HideReason): void => {
    if (disposed || active.has(reason)) return;
    active.add(reason);
    deps.onHide(reason);
  };
  const show = (): void => {
    if (disposed || active.size === 0) return;
    if (doc.visibilityState === 'hidden') return; // still hidden: a stray focus or pointer event
    active.clear();
    deps.onShow();
  };

  const onVisibility = (): void => {
    if (doc.visibilityState === 'hidden') hide('hidden');
    else show();
  };
  const onPageHide = (): void => hide('hidden');

  doc.addEventListener('visibilitychange', onVisibility);
  doc.addEventListener('pointerdown', show, true);
  win?.addEventListener('pagehide', onPageHide);
  win?.addEventListener('pageshow', show);
  win?.addEventListener('focus', show);
  deps.platform.onPause(() => hide('fb_pause'));
  if (doc.visibilityState === 'hidden') hide('hidden');

  return () => {
    disposed = true;
    doc.removeEventListener('visibilitychange', onVisibility);
    doc.removeEventListener('pointerdown', show, true);
    win?.removeEventListener('pagehide', onPageHide);
    win?.removeEventListener('pageshow', show);
    win?.removeEventListener('focus', show);
  };
}
