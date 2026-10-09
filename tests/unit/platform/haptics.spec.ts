// Owner: D (Phase 2b; was platform)
// shared/haptics: navigator.vibrate feature detection, error swallowing, platform preference.
import { describe, expect, it } from 'vitest';
import { canVibrate, createHaptics, createVibrateHaptics } from '../../../src/platform/shared/haptics';

function fakeNav(impl?: (p: number | number[]) => boolean): Navigator {
  return (impl ? { vibrate: impl } : {}) as unknown as Navigator;
}

describe('haptics', () => {
  it('detects navigator.vibrate', () => {
    expect(canVibrate(fakeNav(() => true))).toBe(true);
    expect(canVibrate(fakeNav())).toBe(false);
  });

  it('forwards numbers and patterns to navigator.vibrate (copying readonly arrays)', () => {
    const seen: (number | number[])[] = [];
    const h = createVibrateHaptics(fakeNav((p) => (seen.push(p), true)));
    const pattern: readonly number[] = Object.freeze([20, 30, 20]);
    h.pulse(6);
    h.pulse(pattern);
    expect(seen).toEqual([6, [20, 30, 20]]);
    expect(seen[1]).not.toBe(pattern);
  });

  it('is a silent no-op without vibrate, and swallows errors', () => {
    expect(() => createVibrateHaptics(fakeNav()).pulse(10)).not.toThrow();
    const throwing = createVibrateHaptics(
      fakeNav(() => {
        throw new Error('not allowed');
      }),
    );
    expect(() => throwing.pulse([1, 2])).not.toThrow();
  });

  it('prefers platform haptics when given, else vibrate', () => {
    let platform = 0;
    const vib: unknown[] = [];
    const nav = fakeNav((p) => (vib.push(p), true));
    createHaptics({ platformPulse: () => platform++, nav }).pulse([1, 2, 3]);
    expect([platform, vib]).toEqual([1, []]);
    createHaptics({ platformPulse: null, nav }).pulse(4);
    expect(vib).toEqual([4]);
    expect(() =>
      createHaptics({
        platformPulse: () => {
          throw new Error('x');
        },
      }).pulse(1),
    ).not.toThrow();
  });
});
