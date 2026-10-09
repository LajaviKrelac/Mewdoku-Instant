// Owner: B (fixes: R, 2b review)
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
// PERF-1 (2b review): the outgoing half can start on its own (startScreenOut), at the tap, before the
// incoming screen is built: the tap answers in the next frame while a 12×12 board is still being made.
// playScreenTransition then joins that half instead of restarting it (the incoming delay counts from
// when the outgoing half began). The outgoing screen's own CSS animations (Home's idle mascot loops)
// are paused when its half starts, so they stop restyling the page during the swap.
// PAR-6: the outgoing layer may be a reused element (the victory screen, which the router keeps
// showing while it fades); releaseScreenOut() takes the transition's marks and fills off it again.
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

/** How long the outgoing half alone takes. */
export function screenOutMs(reduced: boolean, c: GameConfig = cfg): number {
  return reduced ? c.fx.screenReducedMs : c.fx.screenOutMs;
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

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Outgoing halves that are running, by element. */
interface OutHalf {
  readonly at: number;
  readonly reduced: boolean;
  readonly anims: Animation[];
  readonly paused: Animation[];
}
const outHalves = new WeakMap<HTMLElement, OutHalf>();

/**
 * Pauses the CSS animations running inside the outgoing screen (Home's breathing, tail and blink
 * loops): they keep restyling on the main thread otherwise (PERF-1). Call it before the incoming
 * screen is in the document, while style is clean, so reading the animations costs nothing.
 */
function pauseInner(el: HTMLElement): Animation[] {
  const get = (el as HTMLElement & { getAnimations?: (o?: { subtree?: boolean }) => Animation[] }).getAnimations;
  if (typeof get !== 'function') return [];
  const out: Animation[] = [];
  try {
    for (const a of get.call(el, { subtree: true })) {
      if ((a.effect as KeyframeEffect | null)?.target === el) continue; // not the transition itself
      if (a.playState !== 'running') continue;
      a.pause();
      out.push(a);
    }
  } catch {
    // no matter: the loops only cost frames
  }
  return out;
}

/**
 * Starts the outgoing half now (PERF-1): `oldEl` turns inert and aria-hidden, its inner animations
 * pause, and it fades (and for 'to_game' scales) out. Returns whether anything animates (false
 * without WAAPI: there is no fade to wait for). A second call for the same element changes nothing.
 */
export function startScreenOut(oldEl: HTMLElement, kind: ScreenTransitionKind, reduced: boolean, c: GameConfig = cfg): boolean {
  const known = outHalves.get(oldEl);
  if (known) return known.anims.length > 0;
  const f = c.fx;
  const paused = pauseInner(oldEl);
  oldEl.setAttribute('inert', '');
  (oldEl as HTMLElement & { inert?: boolean }).inert = true;
  oldEl.setAttribute('aria-hidden', 'true');
  oldEl.classList.add('is-leaving');
  const anims: Animation[] = [];
  const add = (a: Animation | null): void => {
    if (a) anims.push(a);
  };
  if (reduced) add(run(oldEl, [{ opacity: 1 }, { opacity: 0 }], { duration: f.screenReducedMs, easing: 'linear', fill: 'forwards' }));
  else if (kind === 'to_game') {
    add(
      run(oldEl, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `scale(${OUT_SCALE})` }], {
        duration: f.screenOutMs,
        easing: 'ease-in',
        fill: 'forwards',
      }),
    );
  } else add(run(oldEl, [{ opacity: 1 }, { opacity: 0 }], { duration: f.screenOutMs, easing: 'ease-in', fill: 'forwards' }));
  outHalves.set(oldEl, { at: now(), reduced, anims, paused });
  return anims.length > 0;
}

/**
 * Undoes startScreenOut on an element that stays in the document (the victory screen used as the
 * outgoing layer, PAR-6): cancels the fade's fill, resumes nothing (the caller hides the element),
 * and removes is-leaving, aria-hidden and inert.
 */
export function releaseScreenOut(el: HTMLElement): void {
  const half = outHalves.get(el);
  outHalves.delete(el);
  for (const a of half?.anims ?? []) {
    try {
      a.cancel();
    } catch {
      // gone
    }
  }
  el.classList.remove('is-leaving');
  el.removeAttribute('aria-hidden');
  el.removeAttribute('inert');
  (el as HTMLElement & { inert?: boolean }).inert = false;
}

/** Whether `el`'s outgoing half has been started (and not released). */
export function screenOutStarted(el: HTMLElement): boolean {
  return outHalves.has(el);
}

/**
 * Animates `oldEl` out and `newEl` in (both already in the document; `oldEl` null on the first
 * screen, or when the outgoing layer is already gone). Resolves when both animations end; never
 * rejects. The caller removes `oldEl` afterwards. An outgoing half started earlier by startScreenOut
 * is joined, not restarted: the incoming delay and the total time count from its start.
 */
export function playScreenTransition(
  oldEl: HTMLElement | null,
  newEl: HTMLElement,
  kind: ScreenTransitionKind,
  reduced: boolean,
  c: GameConfig = cfg,
): Promise<void> {
  const f = c.fx;
  let elapsed = 0;
  let joined = false;
  const anims: Animation[] = [];
  if (oldEl) {
    const early = outHalves.get(oldEl);
    if (early) {
      joined = true;
      elapsed = Math.max(0, now() - early.at);
    } else startScreenOut(oldEl, kind, reduced, c);
    anims.push(...(outHalves.get(oldEl)?.anims ?? []));
  }
  const inDelay = kind === 'to_game' && !reduced && oldEl ? Math.max(0, f.screenInDelayMs - elapsed) : 0;
  newEl.classList.add('is-entering');
  const add = (a: Animation | null): void => {
    if (a) anims.push(a);
  };

  if (reduced) {
    add(run(newEl, [{ opacity: 0 }, { opacity: 1 }], { duration: f.screenReducedMs, easing: 'linear', fill: 'backwards' }));
  } else if (kind === 'to_game') {
    add(
      run(newEl, [{ opacity: 0, transform: `translateY(${f.screenSlidePx}px)` }, { opacity: 1, transform: 'none' }], {
        duration: f.screenInMs,
        delay: inDelay,
        easing: 'cubic-bezier(0.22, 0.8, 0.3, 1)',
        fill: 'backwards',
      }),
    );
  } else {
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
  // A joined outgoing half has run for `elapsed` ms: what is left of it, or the incoming half.
  const inMs = reduced ? f.screenReducedMs : kind === 'to_game' ? inDelay + f.screenInMs : f.screenBackInMs;
  const totalMs = joined ? Math.max(screenOutMs(reduced, c) - elapsed, inMs) : transitionMs(kind, reduced, oldEl !== null, c);
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      finish();
      resolve();
    }, Math.max(0, totalMs));
  });
}
