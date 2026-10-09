// Owner: B
// Solved-board glow (phase2b §2.2 t = 300): each cat cell's `.cell__glow` node (A builds it in
// board-cells.ts and styles its look in board.css: a radial gradient of --glow, fx.win.glowScale ×
// slot) fades 0 → 1 over fx.win.glowInMs, then settles to glowSettleOpacity over glowSettleMs,
// staggered glowStaggerMs in row order. Reduced motion (§2.7): a static glowSettleOpacity glow
// fading in over fx.win.reduced.glowInMs.
// Opacity only (A owns the node's size and centring transform). The end state is written as an inline
// opacity before the animation starts, so it holds after the animation ends, without WAAPI (jsdom,
// old engines) and after finish(). The schedule's end is a timer, so `done` never waits on WAAPI.
import { cfg, type GameConfig } from '../../app/config';
import type { CellIndex } from '../../engine/types';
import type { FxHandle } from './fish-flight';

/** The `.cell__glow` node of cell `i` on `board`, or null. */
export function glowNode(board: HTMLElement, i: CellIndex): HTMLElement | null {
  return board.querySelector<HTMLElement>(`.cell[data-i="${i}"] .cell__glow`);
}

/** Plays the glow on `cells` (the cat cells, in row order) of the board element `board` (`.board`). */
export function playGlow(board: HTMLElement, cells: readonly CellIndex[], reduced: boolean, c: GameConfig = cfg): FxHandle {
  const W = c.fx.win;
  const settle = W.glowSettleOpacity;
  const nodes = cells.map((i) => glowNode(board, i)).filter((n): n is HTMLElement => n !== null);
  const anims: Animation[] = [];
  let resolveDone: () => void = () => undefined;
  const done = new Promise<void>((r) => {
    resolveDone = r;
  });

  const inMs = reduced ? W.reduced.glowInMs : W.glowInMs;
  const total = reduced ? inMs : (nodes.length - 1) * W.glowStaggerMs + W.glowInMs + W.glowSettleMs;
  board.classList.add('is-glowing');
  nodes.forEach((node, k) => {
    node.style.opacity = String(settle);
    if (typeof node.animate !== 'function') return;
    const frames: Keyframe[] = reduced
      ? [{ opacity: 0 }, { opacity: settle }]
      : [
          { opacity: 0, easing: 'ease-out' },
          { opacity: 1, offset: W.glowInMs / (W.glowInMs + W.glowSettleMs), easing: 'ease-in-out' },
          { opacity: settle },
        ];
    try {
      anims.push(
        node.animate(frames, {
          duration: reduced ? inMs : W.glowInMs + W.glowSettleMs,
          delay: reduced ? 0 : k * W.glowStaggerMs,
          fill: 'backwards',
        }),
      );
    } catch {
      // no WAAPI: the inline end state shows at once
    }
  });

  let ended = false;
  const stop = (): void => {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    resolveDone();
  };
  const timer = setTimeout(stop, Math.max(0, total));

  return {
    done,
    cancel() {
      for (const a of anims) a.cancel();
      anims.length = 0;
      for (const node of nodes) node.style.removeProperty('opacity');
      board.classList.remove('is-glowing');
      stop();
    },
    finish() {
      for (const a of anims) {
        try {
          a.finish();
        } catch {
          a.cancel();
        }
      }
      anims.length = 0;
      stop();
    },
  };
}
