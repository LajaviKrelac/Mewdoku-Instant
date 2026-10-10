// Owner: A (phase2b §1.7); G2 (Phase 2c: the fish are the lives, plus the empty-life outline;
// Phase 2d: redrawn, look-spec §1.5)
// Our fish (since Phase 2c the LIVES and the leaderboard points, fish-lives-spec §1), drawn by hand on
// a 24-unit grid from the written brief of look-spec §1.5 (never from a frame, D-2d-0 c): a plump
// round body with the head at the LEFT, facing left; a forked tail at the lower right; one eye dot;
// three small scale arcs; a highlight on the upper body; a darker lower-body shade; NO outline. Copy
// calls it "fish", never "golden fish" (phase2b §0.2). One markup source for the sprite's icon-fish
// symbol and the win pose's fish (illustrations.ts draws it larger). Colours come from the --fish
// tokens and --ink-deep (fallbacks for CSS-free contexts mirror TOKENS). Not mirrored in RTL.
import { TOKENS } from './palette';

const FILL = `style="fill:var(--fish,${TOKENS.fish})"`;
const DEEP = `var(--fish-deep,${TOKENS['fish-deep']})`;
const HI = `var(--fish-hi,${TOKENS['fish-hi']})`;

/** The plump body, head at the left: x 1.4–18.8, y 2.6–18.8. */
export const FISH_BODY = 'M1.4 10.6C1.4 6 5.3 2.6 10.2 2.6s8.6 3.4 8.6 7.8c0 4.6-3.9 8.2-8.8 8.2S1.4 15.2 1.4 10.6Z';

/** The forked tail at the lower right (two rounded lobes and a notch), behind the body. */
const FISH_TAIL = 'M16.6 13.5 23.1 15c.7.2.8 1.1.2 1.5l-2.9 2.1-.7 3.8c-.1.9-1 1-1.4.3l-4.5-6Z';

/** The fish's inner markup on the 24-unit grid (look-spec §1.5): no outline. */
export function fishMarkup(): string {
  return (
    `<path d="${FISH_TAIL}" ${FILL}/>` +
    `<path d="m20.4 18.6-.7 3.8c-.1.9-1 1-1.4.3l-4.5-6 1.8-1.5Z" style="fill:${DEEP}"/>` +
    `<path d="${FISH_BODY}" ${FILL}/>` +
    // the darker lower body
    `<path d="M1.8 13.2c1.3 3.3 4.5 5.4 8.2 5.4 3.9 0 7.1-2.2 8.3-5.5-2.4 2.1-5.4 3-8.4 2.9-3.2-.1-6-.9-8.1-2.8Z" style="fill:${DEEP}"/>` +
    // highlight on the upper body
    `<path d="M4.8 7c1.3-2.1 3.8-3.3 6.4-3.1-.9.5-1.8 1.1-2.4 2-1 .1-2.7.5-4 1.1Z" style="fill:${HI}"/>` +
    // three small scale arcs, toward the tail
    `<path d="M11.2 8.2q1.5 1.5 0 3m2.8-2.4q1.5 1.5 0 3m-1.4 1.4q1.5 1.5 0 3" fill="none" style="stroke:${DEEP}" stroke-width=".9" stroke-linecap="round"/>` +
    // the eye dot, near the head's front
    `<circle cx="5.7" cy="9.6" r="1.35" style="fill:var(--ink-deep,${TOKENS['ink-deep']})"/>`
  );
}

/** The empty-life wash (the --life-empty token; the fallback mirrors TOKENS for CSS-free contexts). */
const WASH = `var(--life-empty,${TOKENS['life-empty']})`;
const INK = `var(--ink,${TOKENS.ink})`;
/** The silhouette's width on the grid (head x 1.4 to the tail tip x 23.8) and its centre. */
const OUTLINE_SPAN = 22.4;
const FISH_CENTRE: readonly [number, number] = [12.6, 13];
/** Opacity of the empty outline's ink (look-spec §1.5: --ink at 40 %). */
export const FISH_OUTLINE_OPACITY = 0.4;

/**
 * A life that is gone (fish-lives-spec §1.2; look-spec §1.5): the same silhouette as fishMarkup (tail
 * and body) as ONE outline only, --ink at 40 % and `w` wide, around a pale --life-empty wash; no eye,
 * shade, scales or highlight, so it reads as "a fish that is gone", not as a second fish colour. The
 * single outline comes from painting both shapes' strokes at 2 × w inside one group at 40 % (so
 * overlaps never darken), then both fills on top, which cover the inner half of every stroke and the
 * seam where the tail meets the body. Scaled about the fish's centre so its outer edge matches the
 * full fish's: an empty life takes exactly the room of a full one.
 */
export function fishOutlineMarkup(w = 1.2): string {
  const shapes = [FISH_TAIL, FISH_BODY];
  const stroke = `style="stroke:${INK}" stroke-width="${(w * 2).toFixed(2)}" stroke-linejoin="round" fill="none"`;
  const f = OUTLINE_SPAN / (OUTLINE_SPAN + 2 * w);
  const [cx, cy] = FISH_CENTRE;
  const fit = `transform="translate(${cx} ${cy}) scale(${f.toFixed(4)}) translate(${-cx} ${-cy})"`;
  return (
    `<g ${fit}>` +
    `<g opacity="${FISH_OUTLINE_OPACITY}">${shapes.map((d) => `<path d="${d}" ${stroke}/>`).join('')}</g>` +
    `<g style="fill:${WASH}">${shapes.map((d) => `<path d="${d}"/>`).join('')}</g>` +
    `</g>`
  );
}
