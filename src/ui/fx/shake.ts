// Owner: B (Phase 2b; was ui-board)
// WAAPI board shake: ±cfg.fx.shakePx, 3 decaying cycles, cfg.fx.wrongShakeMs (02 §17.5).
import { cfg } from '../../app/config';

/** Horizontal offsets for 3 decaying cycles: +1, −1, +⅔, −⅔, +⅓, −⅓ of the amplitude, then rest. */
export function shakeOffsets(px: number): number[] {
  const out = [0];
  for (const k of [1, 2 / 3, 1 / 3]) out.push(px * k, -px * k);
  out.push(0);
  return out;
}

/** Starts the shake; null when reduced motion is on or WAAPI is unavailable. */
export function shake(el: HTMLElement, opts?: { reducedMotion?: boolean; px?: number; durationMs?: number }): Animation | null {
  if (opts?.reducedMotion || typeof el.animate !== 'function') return null;
  const px = opts?.px ?? cfg.fx.shakePx;
  const duration = opts?.durationMs ?? cfg.fx.wrongShakeMs;
  const frames = shakeOffsets(px).map((x) => ({ transform: `translate3d(${x.toFixed(2)}px,0,0)` }));
  try {
    return el.animate(frames, { duration, easing: 'linear' });
  } catch {
    return null;
  }
}
