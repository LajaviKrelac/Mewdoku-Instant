// Owner: B
// Screen transitions (phase2b §2.9), played by C's router.replaceScreen:
//   'to_game'   (Home → game, victory → next game, event → game): outgoing fades 1 → 0 and scales
//               1 → 0.98 over fx.screenOutMs; after fx.screenInDelayMs the incoming slides up
//               fx.screenSlidePx → 0 and fades in over fx.screenInMs (ease-out); the board entry overlaps.
//   'from_game' (game → Home, game → event): outgoing fades out over fx.screenOutMs; incoming fades
//               in over fx.screenBackInMs; the Home mascot pops in (0.92 → 1, MASCOT_POP_MS).
//   reduced:    a crossfade of fx.screenReducedMs.
// During a transition the outgoing screen is inert and aria-hidden; focus moves to the incoming
// screen at its start (the router does that). WAAPI on opacity and transform only, so the global
// reduced-motion CSS rule (fx.css) does not cut them short: the reduced crossfade is its own branch.
// The promise is settled by a timer (never by Animation.finished), so it always resolves, also
// without WAAPI (then at once: there is nothing to wait for).
import { cfg, type GameConfig } from '../../app/config';

export type ScreenTransitionKind = 'to_game' | 'from_game';

/** The Home mascot's pop-in when coming back from a game (§2.9 table row 2). CSS-style constant (§0.4). */
export const MASCOT_POP_MS = 260;
const MASCOT_POP_FROM = 0.92;
/** The outgoing screen's scale when entering a game (§2.9). */
const OUT_SCALE = 0.98;

/** How long playScreenTransition takes (the promise resolves after this many ms). */
export function transitionMs(kind: ScreenTransitionKind, reduced: boolean, hasOld = true, c: GameConfig = cfg): number {
  const f = c.fx;
  if (reduced) return f.screenReducedMs;
  if (kind === 'to_game') return Math.max(hasOld ? f.screenOutMs : 0, f.screenInDelayMs + f.screenInMs);
  return Math.max(hasOld ? f.screenOutMs : 0, f.screenBackInMs);
}

function run(el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation | null {
  const h = el as HTMLElement;
  if (typeof h.animate !== 'function') return null;
  try {
    return h.animate(frames, opts);
  } catch {
    return null;
  }
}

/**
 * Animates `oldEl` out and `newEl` in (both already in the document; `oldEl` null on the first
 * screen). Resolves when both animations end; never rejects. The caller removes `oldEl` afterwards.
 */
export function playScreenTransition(
  oldEl: HTMLElement | null,
  newEl: HTMLElement,
  kind: ScreenTransitionKind,
  reduced: boolean,
  c: GameConfig = cfg,
): Promise<void> {
  const f = c.fx;
  if (oldEl) {
    oldEl.setAttribute('inert', '');
    (oldEl as HTMLElement & { inert?: boolean }).inert = true;
    oldEl.setAttribute('aria-hidden', 'true');
    oldEl.classList.add('is-leaving');
  }
  newEl.classList.add('is-entering');
  const anims: Animation[] = [];
  const add = (a: Animation | null): void => {
    if (a) anims.push(a);
  };

  if (reduced) {
    if (oldEl) add(run(oldEl, [{ opacity: 1 }, { opacity: 0 }], { duration: f.screenReducedMs, easing: 'linear', fill: 'forwards' }));
    add(run(newEl, [{ opacity: 0 }, { opacity: 1 }], { duration: f.screenReducedMs, easing: 'linear', fill: 'backwards' }));
  } else if (kind === 'to_game') {
    if (oldEl) {
      add(
        run(oldEl, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `scale(${OUT_SCALE})` }], {
          duration: f.screenOutMs,
          easing: 'ease-in',
          fill: 'forwards',
        }),
      );
    }
    add(
      run(newEl, [{ opacity: 0, transform: `translateY(${f.screenSlidePx}px)` }, { opacity: 1, transform: 'none' }], {
        duration: f.screenInMs,
        delay: oldEl ? f.screenInDelayMs : 0,
        easing: 'cubic-bezier(0.22, 0.8, 0.3, 1)',
        fill: 'backwards',
      }),
    );
  } else {
    if (oldEl) add(run(oldEl, [{ opacity: 1 }, { opacity: 0 }], { duration: f.screenOutMs, easing: 'ease-in', fill: 'forwards' }));
    add(run(newEl, [{ opacity: 0 }, { opacity: 1 }], { duration: f.screenBackInMs, easing: 'ease-out', fill: 'backwards' }));
    const mascot = newEl.querySelector('.home__mascot');
    if (mascot) {
      // Decorative and not awaited: the screen is usable when it has faded in.
      run(mascot, [{ transform: `scale(${MASCOT_POP_FROM})` }, { transform: 'none' }], {
        duration: MASCOT_POP_MS,
        easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)',
        fill: 'backwards',
      });
    }
  }

  const finish = (): void => {
    newEl.classList.remove('is-entering');
    // The incoming screen keeps no transform or opacity override (fill: backwards ends with the animation).
  };
  if (anims.length === 0) {
    finish();
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      finish();
      resolve();
    }, transitionMs(kind, reduced, oldEl !== null, c));
  });
}
