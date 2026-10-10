// Owner: G2 (Phase 2d.1)
// The cat-placed sequence on the board (helpers-spec §2.4, D-2d1-3; measured on the user's recording v2),
// for every correct cat (the kitty's, a hint's, the player's). t from CAT_PLACED:
//   0       the tile flashes: white rays from its centre (.cell__flash) over a strong lightening (its
//           .cell__wash), a pale yellow halo spills into the gaps (33 → 83 ms);
//   16      the cat appears at 0.30 × its resting size F (origin 50 % 80 %, near the chin) …
//   116–133 … peaks at 1.56 F (it overflows its tile: the cell is lifted above its neighbours) …
//   300     … and is held at 1.25 F; it winks from 350 to 780 (mood 'wink');
//   133–600 a soft white light lightens the neighbours (up to 25 %, peak 300); 133–733 six four-point
//           twinkles (white, pink, light cyan) within 1.5 T (.cell__light; requests-G2 H1);
//   200–366 the tile holds a pale tint (≈ 65 % toward white), back to its colour by 733;
//   816–950 the cat shrinks to 0.89 F, then recovers to F by settleMs (1 400); the idle loops resume.
// The motion lives in board.css (.cell.fx-cat); this module adds the transient nodes, the wink and the
// cleanup. cancel() ends it at once (CAT_REMOVED during the sequence, a props render). Reduced motion:
// nothing plays (the cat appears at F, 2b's reduced cat).
import { cfg, type GameConfig } from '../../app/config';
import { createFxTimers } from './board-fx';
import type { CellRefs } from './board-cells';

/** When the wink starts and ends (helpers-spec §2.4: ≈ 350 → ≈ 780 ms, inside the 1.25 F hold). */
export const WINK_FROM_MS = 350;
export const WINK_TO_MS = 780;

/**
 * The twinkles (ours, within 1.5 T of the tile centre): offset in tiles, size in tiles (3–7 px at
 * T = 39), colour, start (ms from CAT_PLACED; each twinkles for 360 ms, the last ends at 733).
 */
export const TWINKLES: readonly { readonly x: number; readonly y: number; readonly size: number; readonly tone: 'white' | 'pink' | 'cyan'; readonly at: number }[] = [
  { x: -1.15, y: -0.2, size: 0.18, tone: 'white', at: 133 },
  { x: -0.85, y: 0.95, size: 0.12, tone: 'pink', at: 180 },
  { x: 1.05, y: -0.95, size: 0.15, tone: 'cyan', at: 230 },
  { x: -0.35, y: -1.3, size: 0.09, tone: 'white', at: 280 },
  { x: 1.25, y: 0.55, size: 0.12, tone: 'pink', at: 330 },
  { x: 0.4, y: 1.2, size: 0.08, tone: 'cyan', at: 373 },
];

export interface CatSequence {
  /** Ends the sequence now: the classes, nodes and mood go; the tile shows its current state. */
  cancel(): void;
}

export interface CatSequenceDeps {
  /** Sets (or with null clears) this cell's own mood: 'idle' during the pop and settle (no blink lid, no breathing), 'wink' while it winks. */
  mood(m: 'idle' | 'wink' | null): void;
  /** Called once when the sequence has ended or was cancelled (the board forgets it). */
  ended(): void;
}

/** Starts the sequence on a cat cell (the board has already drawn the cat). */
export function playCatSequence(refs: CellRefs, deps: CatSequenceDeps, c: GameConfig = cfg): CatSequence {
  const doc = refs.el.ownerDocument;
  const timers = createFxTimers();
  const flash = doc.createElement('span');
  flash.className = 'cell__flash';
  flash.setAttribute('aria-hidden', 'true');
  // the white wash in its own layer: the rays and the halo on the flash itself keep their own opacity (audit B3)
  const wash = doc.createElement('i');
  wash.className = 'cell__wash';
  flash.appendChild(wash);
  const light = doc.createElement('span');
  light.className = 'cell__light';
  light.setAttribute('aria-hidden', 'true');
  for (const tw of TWINKLES) {
    const i = doc.createElement('i');
    i.dataset.tone = tw.tone;
    i.style.setProperty('--tx', String(tw.x));
    i.style.setProperty('--ty', String(tw.y));
    i.style.setProperty('--tz', String(tw.size));
    i.style.setProperty('--td', `${tw.at}ms`);
    light.appendChild(i);
  }
  // the flash sits on the tile, under the cat; the light spills over the neighbours (board.css)
  refs.el.insertBefore(flash, refs.svg);
  refs.el.insertBefore(light, refs.svg);
  refs.el.classList.add('fx-cat');
  deps.mood('idle');

  let over = false;
  const end = (): void => {
    if (over) return;
    over = true;
    timers.clear();
    refs.el.classList.remove('fx-cat');
    flash.remove();
    light.remove();
    deps.mood(null);
    deps.ended();
  };
  timers.later(WINK_FROM_MS, () => deps.mood('wink'));
  timers.later(WINK_TO_MS, () => deps.mood('idle'));
  timers.later(c.fx.catPlaced.settleMs + 40, end);
  return { cancel: end };
}
