// Owner: platform
// navigator.vibrate wrapper with feature detection (02 §16, 04 §6.2–6.3).
import type { PlatformAdapter } from '../types';

export type Haptics = PlatformAdapter['haptics'];

/** true when navigator.vibrate exists (false on iOS web). */
export function canVibrate(nav?: Navigator): boolean {
  throw new Error('not implemented: canVibrate');
}

/** pulse() → navigator.vibrate(pattern), swallowing errors; a no-op when unsupported. */
export function createVibrateHaptics(nav?: Navigator): Haptics {
  throw new Error('not implemented: createVibrateHaptics');
}

/** FB: platform haptics (performHapticFeedbackAsync) when given, else navigator.vibrate. */
export function createHaptics(opts: { platformPulse?: (() => void) | null; nav?: Navigator }): Haptics {
  throw new Error('not implemented: createHaptics');
}
