// Owner: platform
// navigator.vibrate wrapper with feature detection (02 §16, 04 §6.2–6.3).
import type { PlatformAdapter } from '../types';

export type Haptics = PlatformAdapter['haptics'];

const NO_HAPTICS: Haptics = Object.freeze({ pulse(): void {} });

function defaultNavigator(): Navigator | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator;
}

/** true when navigator.vibrate exists (false on iOS web). */
export function canVibrate(nav?: Navigator): boolean {
  const n = nav ?? defaultNavigator();
  return n !== undefined && typeof n.vibrate === 'function';
}

/** pulse() → navigator.vibrate(pattern), swallowing errors; a no-op when unsupported. */
export function createVibrateHaptics(nav?: Navigator): Haptics {
  const n = nav ?? defaultNavigator();
  if (n === undefined || !canVibrate(n)) return NO_HAPTICS;
  return {
    pulse(pattern) {
      try {
        // Chrome ignores vibrate() before the first user gesture; some WebViews throw. Never fatal.
        n.vibrate(typeof pattern === 'number' ? pattern : Array.from(pattern));
      } catch {
        /* ignore */
      }
    },
  };
}

/** FB: platform haptics (performHapticFeedbackAsync) when given, else navigator.vibrate. */
export function createHaptics(opts: { platformPulse?: (() => void) | null; nav?: Navigator }): Haptics {
  const platformPulse = opts.platformPulse;
  if (!platformPulse) return createVibrateHaptics(opts.nav);
  return {
    // Platform haptics are a single "tap"; the pattern only matters for navigator.vibrate.
    pulse() {
      try {
        platformPulse();
      } catch {
        /* ignore */
      }
    },
  };
}
