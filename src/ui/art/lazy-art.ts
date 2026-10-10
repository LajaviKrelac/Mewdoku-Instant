// Owner: G2 (Phase 2d.1)
// The Phase 2d.1 drawings that only the lazy chunks use (helpers-spec §1.4, §2.4, §2.5, Appendix C), each
// drawn by us as SVG from the spec's words, never from a frame of the original (D-2d1-0; provenance-G2.md):
// - the board mouse's parts (board-mouse, -eyes, -lids, -grin): our tool-mouse face split so the board can
//   move the eyes and the mouth: the head, the bead eyes (they shift for a glance), a lid pair in the
//   head's grey with a closed-eye line (scaled down for a blink, part way for the grin's narrowed eyes) and
//   an open, grinning mouth (teeth, tongue);
// - fx-star4: a four-point star with concave sides and a round soft core (the points star, G3);
// - fx-shard, fx-shard-2, fx-shard-3: three chunky crystal bits, each a lit face in currentColor (the
//   tile's colour), a shaded face (the same colour under 18 % black, i.e. × 0.82) and a small highlight.
// They are not in the first-load sprite (they cost the first screen nothing): mountLazyArt() adds them to
// the sprite once, called by the board's mouse chunk (board/board-mouse.ts, prefetched at idle after a
// board entry) and by the lazy fx chunk (G3's fx/celebrate.ts; requests-G2 H2), like art/accessories.ts.
import { CAT } from './cat-parts';
import { EYES, MOUSE, MOUSE_BOX, mouseEyes, mouseHead, sym } from './helper-art';
import { SPRITE_ID } from './sprite';

/**
 * The lids: the head's grey over each eye from its top (y 48.6) down, with the closed eye's line along
 * the bottom; the board scales this part from the top edge (scaleY 0 = eyes open).
 */
function mouseLids(): string {
  return (
    EYES.map(([x]) => `<path d="M${x - 7} 48.6h14v6.6q-7 4.4-14 0Z" fill="${MOUSE.head}"/>`).join('') +
    `<path d="M29.5 55.6q6.5 3.6 13 0M57.5 55.6q6.5 3.6 13 0" fill="none" stroke="${MOUSE.eye}" stroke-width="1.6" stroke-linecap="round"/>`
  );
}

/** The grin: an open mouth below the nose (dark inside, a pink tongue, the two teeth at its top edge). */
function mouseGrin(): string {
  return (
    `<path d="M39.5 72.6q10.5-2.4 21 0Q58.4 87 50 87T39.5 72.6Z" fill="${MOUSE.mouth}"/>` +
    `<ellipse cx="50" cy="82.6" rx="6.2" ry="3.6" fill="${CAT.blush}"/>` +
    `<path d="M45.8 72.3h3.8v5.2a1 1 0 0 1-1 1h-1.8a1 1 0 0 1-1-1Zm4.6 0h3.8v5.2a1 1 0 0 1-1 1h-1.8a1 1 0 0 1-1-1Z" fill="#fff"/>` +
    `<ellipse cx="50" cy="67.4" rx="4.8" ry="3.4" fill="${CAT.nose}"/>`
  );
}

/** A four-point star with concave sides and a round soft core (24 grid); the core reads --star-core. */
function star4(): string {
  return (
    `<path d="M12 .8C12.9 8.4 15.6 11.1 23.2 12 15.6 12.9 12.9 15.6 12 23.2 11.1 15.6 8.4 12.9.8 12 8.4 11.1 11.1 8.4 12 .8Z" fill="currentColor"/>` +
    `<circle cx="12" cy="12" r="4.2" style="fill:var(--star-core,#FFFD79)" opacity=".7"/><circle cx="12" cy="12" r="2.6" style="fill:var(--star-core,#FFFD79)"/>`
  );
}

/** One crystal chunk: its outline (lit face, currentColor), the shaded face (black at .18 over it), a highlight. */
function shard(outline: string, shade: string, hi: string): string {
  return `<path d="${outline}" fill="currentColor"/><path d="${shade}" fill="#000" opacity=".18"/><path d="${hi}" fill="#fff" opacity=".45"/>`;
}

/** The lazily mounted symbols' markup. */
export function lazyArtSymbols(): string {
  return [
    sym('board-mouse', MOUSE_BOX, mouseHead()),
    sym('board-mouse-eyes', MOUSE_BOX, mouseEyes()),
    sym('board-mouse-lids', MOUSE_BOX, mouseLids()),
    sym('board-mouse-grin', MOUSE_BOX, mouseGrin()),
    sym('fx-star4', '0 0 24 24', star4()),
    sym('fx-shard', '0 0 24 24', shard('M7 3.4 16.6 2.2c2 0 3.4 1.2 3.8 3.1l1.4 8.2c.3 1.8-.5 3.4-2.1 4.2l-8 4.3c-1.6.8-3.4.5-4.6-.8L3.2 16.6C2 15.3 1.8 13.5 2.6 12L5 5.4c.4-1.1 1-1.8 2-2Z', 'M21.8 13.5c.3 1.8-.5 3.4-2.1 4.2l-8 4.3c-1.6.8-3.4.5-4.6-.8l5.2-6.4Z', 'M7.6 5.6 15 4.4l-2.6 3.4-5.6 1.2Z')),
    sym('fx-shard-2', '0 0 24 24', shard('M11 2.4c1.1-.6 2.3-.5 3.2.3l6.6 6.2c1 .9 1.2 2.3.6 3.5l-4.8 8.4c-.6 1.1-1.8 1.7-3 1.5L5.8 21c-1.4-.2-2.4-1.3-2.5-2.7L2.6 9.6c-.1-1.2.5-2.3 1.5-2.9Z', 'M21.4 12.4l-4.8 8.4c-.6 1.1-1.8 1.7-3 1.5L5.8 21l7.4-7.6Z', 'M5.6 8.4 11.6 4.6l1.4 2.6-6.2 3.4Z')),
    sym('fx-shard-3', '0 0 24 24', shard('M5.2 5.8C6 4.4 7.6 3.8 9.1 4.2l9.6 2.9c1.6.5 2.6 2 2.4 3.7l-.9 7.1c-.2 1.7-1.6 2.9-3.3 2.9H6.5c-1.6 0-3-1.2-3.2-2.8l-.8-6.4c-.1-.8.1-1.5.5-2.2Z', 'M21.1 10.8l-.9 7.1c-.2 1.7-1.6 2.9-3.3 2.9H9.2l3.4-8.6Z', 'M6.4 7.4 13.4 7.8l-3 2.6-4.6.4Z')),
  ].join('');
}

/**
 * Adds the lazy symbols to the sprite once (idempotent; a no-op before the sprite is mounted or outside a
 * document). Every <use> that already points at one of them draws as soon as it exists.
 */
export function mountLazyArt(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): void {
  const sprite = doc?.getElementById(SPRITE_ID);
  if (!doc || !sprite || doc.getElementById('fx-star4')) return;
  const holder = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  holder.innerHTML = lazyArtSymbols();
  sprite.append(...Array.from(holder.childNodes));
}
