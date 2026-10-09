// @vitest-environment jsdom
// Owner: app. 02 §16 UI click (lead decision): one delegated listener on the app root plays the 'ui'
// sound and the 4 ms haptic for enabled buttons outside the board; board cells and gated buttons
// stay silent. Boot wires it to sfx.play('ui') (muted by the Sound setting in the audio engine).
import { describe, expect, it, vi } from 'vitest';
import { attachUiClickFeedback, isUiButtonClick } from '../../../src/app/ui-sounds';

function setup() {
  document.body.innerHTML =
    '<div id="app"><button id="play">Play <span id="label">L5</span></button>' +
    '<div class="board"><button class="cell" id="cell"></button></div>' +
    '<button id="gated" aria-disabled="true">Next</button><button id="off" disabled>Off</button>' +
    '<div id="plain">text</div></div><button id="outside">x</button>';
  const root = document.getElementById('app') as HTMLElement;
  const log: string[] = [];
  // The sound runs through `defer` (default: after the next frame, PERF-1); here at once.
  const off = attachUiClickFeedback(root, { play: () => void log.push('ui'), haptic: () => void log.push('haptic') }, { defer: (fn) => fn() });
  const click = (id: string): void => void (document.getElementById(id) as HTMLElement).click();
  return { root, log, off, click };
}

describe('UI click feedback', () => {
  it('plays for buttons under the root, including clicks on their children', () => {
    const s = setup();
    s.click('play');
    s.click('label');
    expect(s.log).toEqual(['ui', 'haptic', 'ui', 'haptic']);
  });

  it('ignores board cells, gated or disabled buttons, non-buttons and anything outside the root', () => {
    const s = setup();
    for (const id of ['cell', 'gated', 'off', 'plain', 'outside']) s.click(id);
    expect(s.log).toEqual([]);
    expect(isUiButtonClick(s.root, null)).toBe(false);
  });

  it('detaches, and a throwing feedback never breaks the click', () => {
    const s = setup();
    s.off();
    s.click('play');
    expect(s.log).toEqual([]);
    const root = s.root;
    const off = attachUiClickFeedback(
      root,
      {
        play: () => {
          throw new Error('no audio');
        },
        haptic: () => undefined,
      },
      { defer: (fn) => fn() },
    );
    expect(() => s.click('play')).not.toThrow();
    off();
  });

  it('PERF-1: by default the sound waits for the next frame (then a task); the haptic pulse is at once', () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = '<div id="app"><button id="play">Play</button></div>';
      const root = document.getElementById('app') as HTMLElement;
      const frames: FrameRequestCallback[] = [];
      const win = root.ownerDocument.defaultView as Window;
      const raf = vi.spyOn(win, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb));
      const log: string[] = [];
      const off = attachUiClickFeedback(root, { play: () => void log.push('ui'), haptic: () => void log.push('haptic') });
      (document.getElementById('play') as HTMLElement).click();
      expect(log).toEqual(['haptic']);
      expect(frames).toHaveLength(1);
      frames.shift()?.(0);
      expect(log).toEqual(['haptic']); // not inside the frame's own callbacks
      vi.runAllTimers();
      expect(log).toEqual(['haptic', 'ui']);
      off();
      raf.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});
