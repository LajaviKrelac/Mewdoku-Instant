// Owner: ui-board
// WAAPI board shake: ±cfg.fx.shakePx, 3 decaying cycles, cfg.fx.wrongShakeMs (02 §17.5).

/** Starts the shake; null when reduced motion is on or WAAPI is unavailable. */
export function shake(el: HTMLElement, opts?: { reducedMotion?: boolean; px?: number; durationMs?: number }): Animation | null {
  throw new Error('not implemented: shake');
}
