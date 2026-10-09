// Owner: A (phase2b §1.7)
// Our fish (the soft currency, phase2b §2.8), drawn by hand on a 24-unit grid from the written brief:
// a plump fish facing right with a forked tail, a top fin, a belly band, a sheen arc and a big eye.
// Copy calls it "fish", never "golden fish" (phase2b §0.2). One markup source for the sprite's
// icon-fish symbol and the win pose's fish (illustrations.ts draws it at ×3.6). Colours come from the
// --fish tokens (fallbacks for CSS-free contexts mirror TOKENS).
import { TOKENS } from './palette';

const FILL = `style="fill:var(--fish,${TOKENS.fish})"`;
const DEEP = `var(--fish-deep,${TOKENS['fish-deep']})`;
const HI = `var(--fish-hi,${TOKENS['fish-hi']})`;
const INK = `var(--ink,${TOKENS.ink})`;

/** Body ellipse 16 × 10 centred at (13, 12): x 5–21, y 7–17. */
export const FISH_BODY = 'M13 7C17.8 7 21.2 9.4 21.6 12C21.2 14.6 17.8 17 13 17C8.4 17 5 14.4 5 12C5 9.6 8.4 7 13 7Z';

/** The fish's inner markup on the 24-unit grid; `w` is the outline width (1.4 at icon size). */
export function fishMarkup(w = 1.4): string {
  const ol = `style="stroke:${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
  return (
    // forked tail (two lobes meeting in a notch) and the top fin, behind the body
    `<path d="M6.4 12C4.8 10.2 3.4 8.5 1.6 7.2C2.2 9 2.6 10.6 3.4 12C2.6 13.4 2.2 15 1.6 16.8C3.4 15.5 4.8 13.8 6.4 12Z" style="fill:${DEEP}" ${ol}/>` +
    `<path d="M9.4 8C10.8 5.2 13.6 4.2 16.6 5.2C15.6 6.2 15.4 7.2 15.6 8.2Z" style="fill:${DEEP}" ${ol}/>` +
    `<path d="${FISH_BODY}" ${FILL} ${ol}/>` +
    // belly band, gill, sheen
    `<path d="M7.2 13.8C10.4 16.6 16.6 16.8 20.2 13.8C16.6 15.2 10.6 15.2 7.2 13.8Z" style="fill:${DEEP}" opacity=".4"/>` +
    `<path d="M15.2 9.2Q14.2 12 15.2 14.8" fill="none" style="stroke:${DEEP}" stroke-width="${(w * 0.65).toFixed(2)}" stroke-linecap="round"/>` +
    `<path d="M8.4 9.8Q10.6 8.1 13.4 8.3" fill="none" style="stroke:${HI}" stroke-width="${(w * 0.85).toFixed(2)}" stroke-linecap="round"/>` +
    // eye: white r 1.6 with an ink pupil r 0.9
    `<circle cx="17.8" cy="10.9" r="1.6" fill="#fff" ${ol.replace(`stroke-width="${w}"`, `stroke-width="${(w * 0.45).toFixed(2)}"`)}/>` +
    `<circle cx="18.1" cy="11" r=".9" style="fill:${INK}"/>`
  );
}
