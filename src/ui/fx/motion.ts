// Owner: ui-board
// Reduced-motion resolution: system preference + the Settings value (02 §14, §17.5, §18).
import type { ReduceMotionSetting } from '../../game/types';

/** matchMedia('(prefers-reduced-motion: reduce)'); false when unavailable. */
export function systemPrefersReducedMotion(win?: Window): boolean {
  throw new Error('not implemented: systemPrefersReducedMotion');
}

/** 'on' → true, 'off' → false, 'system' → systemPrefers. */
export function resolveReducedMotion(setting: ReduceMotionSetting, systemPrefers: boolean): boolean {
  throw new Error('not implemented: resolveReducedMotion');
}

/** Calls cb when the system preference changes. Returns the unsubscribe. */
export function watchSystemReducedMotion(cb: (prefers: boolean) => void, win?: Window): () => void {
  throw new Error('not implemented: watchSystemReducedMotion');
}

/** Sets data-motion="reduced" | "full" on the app root; CSS keys reduced-motion overrides off it. */
export function applyMotion(root: HTMLElement, reduced: boolean): void {
  throw new Error('not implemented: applyMotion');
}
