// @vitest-environment jsdom
// Owner: app. Page visibility and FB onPause (02 §7.2, §15; 05 §4): hide once per reason; FB has no
// resume callback, so the return is detected by visibility, focus, pageshow or the next pointerdown.
import { describe, expect, it } from 'vitest';
import { watchVisibility } from '../../../src/app/visibility';

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

function setup() {
  setVisibility('visible');
  const calls: string[] = [];
  let pauseCb: (() => void) | null = null;
  const stop = watchVisibility({
    doc: document,
    platform: { onPause: (cb) => void (pauseCb = cb) },
    onHide: (r) => void calls.push(`hide:${r}`),
    onShow: () => void calls.push('show'),
  });
  return { calls, stop, fbPause: () => pauseCb?.() };
}

describe('watchVisibility', () => {
  it('hidden → onHide("hidden") once; visible → onShow', () => {
    const s = setup();
    setVisibility('hidden');
    window.dispatchEvent(new Event('pagehide'));
    setVisibility('visible');
    expect(s.calls).toEqual(['hide:hidden', 'show']);
    s.stop();
  });

  it('FB onPause has no resume: focus or a pointerdown brings the game back', () => {
    const s = setup();
    s.fbPause();
    s.fbPause();
    expect(s.calls).toEqual(['hide:fb_pause']);
    document.dispatchEvent(new Event('pointerdown'));
    expect(s.calls).toEqual(['hide:fb_pause', 'show']);
    s.fbPause();
    window.dispatchEvent(new Event('focus'));
    expect(s.calls).toEqual(['hide:fb_pause', 'show', 'hide:fb_pause', 'show']);
    s.stop();
  });

  it('no onShow without a hide, and nothing after disposal', () => {
    const s = setup();
    window.dispatchEvent(new Event('focus'));
    expect(s.calls).toEqual([]);
    s.stop();
    setVisibility('hidden');
    s.fbPause();
    expect(s.calls).toEqual([]);
  });
});
