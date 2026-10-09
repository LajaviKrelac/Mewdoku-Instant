// Owner: B (Phase 2b; was ui-board)
// Reduced-motion resolution: system preference + the Settings value (02 §14, §17.5, §18).
import type { ReduceMotionSetting } from '../../game/types';

const QUERY = '(prefers-reduced-motion: reduce)';

function media(win?: Window): MediaQueryList | null {
  const w = win ?? (typeof window !== 'undefined' ? window : undefined);
  if (!w || typeof w.matchMedia !== 'function') return null;
  try {
    return w.matchMedia(QUERY);
  } catch {
    return null;
  }
}

/** matchMedia('(prefers-reduced-motion: reduce)'); false when unavailable. */
export function systemPrefersReducedMotion(win?: Window): boolean {
  return media(win)?.matches === true;
}

/** 'on' → true, 'off' → false, 'system' → systemPrefers. */
export function resolveReducedMotion(setting: ReduceMotionSetting, systemPrefers: boolean): boolean {
  return setting === 'on' ? true : setting === 'off' ? false : systemPrefers;
}

/** Calls cb when the system preference changes. Returns the unsubscribe. */
export function watchSystemReducedMotion(cb: (prefers: boolean) => void, win?: Window): () => void {
  const mq = media(win);
  if (!mq) return () => undefined;
  const listener = (e: MediaQueryListEvent): void => cb(e.matches);
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }
  // Safari < 14 only has the deprecated addListener.
  const legacy = mq as MediaQueryList & {
    addListener?: (l: (e: MediaQueryListEvent) => void) => void;
    removeListener?: (l: (e: MediaQueryListEvent) => void) => void;
  };
  legacy.addListener?.(listener);
  return () => legacy.removeListener?.(listener);
}

/** Sets data-motion="reduced" | "full" on the app root; CSS keys reduced-motion overrides off it. */
export function applyMotion(root: HTMLElement, reduced: boolean): void {
  root.dataset.motion = reduced ? 'reduced' : 'full';
}
