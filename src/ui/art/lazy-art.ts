// Owner: G2 (Phase 2d.1)
// The Phase 2d.1 drawings that only the lazy chunks use (helpers-spec §1.4, §2.4, §2.5, Appendix C), each
// drawn by us as SVG from the spec's words, never from a frame of the original (D-2d1-0; provenance-G2.md):
// - the board mouse's parts (board-mouse, -eyes, -lids, -grin): our tool-mouse face split so the board can
//   move the eyes and the mouth: the head, the bead eyes (they shift for a glance), a lid pair in the
//   head's grey with a closed-eye line (scaled down for a blink, part way for the grin's narrowed eyes) and
//   an open, grinning mouth (teeth, tongue);
// - fx-star4: a plump four-point star with concave sides, a lemon body, gold tips and a round soft core
//   (the points star, G3; audit B5);
// - fx-shard, fx-shard-2, fx-shard-3: three chunky crystal bits, each a lit face in currentColor (the
//   tile's colour), a shaded face (the same colour under 18 % black, i.e. × 0.82) and a small highlight;
// - (integration I-4, moved from helper-art.ts) the tickers' art: art-paw-cap, a ticker pill's
//   inline-start end as a paw (four toe beans in an arc along the outer edge, each in its own scallop of
//   the outline, a large main pad; the pill's fill and border, --toast-fill and --toast-line, follow the
//   scallops); art-bolt, a chunky zig-zag lightning bolt, yellow with an orange shade; art-star, a plump
//   five-point star with rounded tips, gold with a soft highlight (the tickers' end icons).
// They are not in the first-load sprite (they cost the first screen nothing): mountLazyArt() adds them to
// the sprite once, called by the board's mouse chunk (board/board-mouse.ts, prefetched at idle after a
// board entry) and by the lazy fx chunk (G3's fx/celebrate.ts; requests-G2 H2), like art/accessories.ts.
import { CAT } from './cat-parts';
import { EYES, MOUSE, MOUSE_BOX, mouseEyes, mouseHead, sym } from './helper-art';
import { TOKENS } from './palette';
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

/** The star's outline (24 grid): four points with gently concave sides, plump arms (audit B5). */
const STAR4 = 'M12 .8C13.6 7.4 16.6 10.4 23.2 12 16.6 13.6 13.6 16.6 12 23.2 10.4 16.6 7.4 13.6.8 12 7.4 10.4 10.4 7.4 12 .8Z';
/** The same outline scaled by k about the centre (12, 12). */
const star4At = (k: number, fill: string, extra = ''): string =>
  `<path d="${STAR4}" transform="matrix(${k} 0 0 ${k} ${Math.round(12 * (1 - k) * 100) / 100} ${Math.round(12 * (1 - k) * 100) / 100})" ${fill}${extra}/>`;

/**
 * A plump four-point star with concave sides and a round soft core (24 grid). Audit B5 (helpers-spec §2.5,
 * measured: a lemon body #FFFD78 with #EBD969–#FFF674 6 px out along an arm): the body is --star-core, a
 * lighter lemon ring toward the tips, and currentColor (gold) only on the outer fifth of each point.
 */
function star4(): string {
  return (
    `<path d="${STAR4}" fill="currentColor"/>` +
    star4At(0.82, 'fill="#FFF35C"') +
    star4At(0.64, 'style="fill:var(--star-core,#FFFD79)"') +
    `<circle cx="12" cy="12" r="4.2" style="fill:var(--star-core,#FFFD79)" opacity=".7"/><circle cx="12" cy="12" r="2.6" fill="#FFFFE6"/>`
  );
}

/** One crystal chunk: its outline (lit face, currentColor), the shaded face (black at .18 over it), a highlight. */
function shard(outline: string, shade: string, hi: string): string {
  return `<path d="${outline}" fill="currentColor"/><path d="${shade}" fill="#000" opacity=".18"/><path d="${hi}" fill="#fff" opacity=".45"/>`;
}

/**
 * The paw cap (28.4 × 33.5 in s units, the pill 29.3 tall from y 0, overhanging 2.1 above and below; audit B8,
 * measured on still-a: the toe beans ≈ 7.8 px across form the pill's outer edge and overhang it ≈ 2 px): four
 * toe beans (r 3.5) in an arc, each in a scallop of the outline (outer radius 5.4: the first and last 2.1
 * past the pill, the middle two on the outer edge), the pill's fill behind them up to the box's end, the
 * 1.2 border along the union of the scallops and the pill's top and bottom (y 0–1.2, 28.1–29.3, as the CSS
 * body's border it meets), and a large main pad. Our drawing, from those words and numbers.
 */
function pawCap(): string {
  const scallops: readonly (readonly [number, number])[] = [
    [9.5, 3.3],
    [5.4, 10.87],
    [5.4, 18.43],
    [9.5, 26],
  ];
  // the border: every shape stroked 2.4 wide, then the same shapes filled over the inner half
  const shapes = (paint: string): string =>
    scallops.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.2" ${paint}/>`).join('') + `<rect x="8" y="1.2" width="21" height="26.9" ${paint}/>`;
  return (
    `<defs><radialGradient id="paw-pad" cx=".5" cy=".5" r=".5"><stop offset=".5" stop-color="#FFD4A5"/><stop offset="1" stop-color="#FFE1B5" stop-opacity="0"/></radialGradient></defs>` +
    shapes('fill="none" style="stroke:var(--toast-line)" stroke-width="2.4"') +
    shapes('style="fill:var(--toast-fill)"') +
    scallops.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5" fill="#FFCD9B"/>`).join('') +
    `<ellipse cx="19.4" cy="14.65" rx="7" ry="8.6" fill="url(#paw-pad)"/>`
  );
}

/** A plump five-point star (24 grid): rounded tips from a round-joined stroke of its own colour. */
function star5(): string {
  const pts: string[] = [];
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 4.6 : 9.4;
    const a = ((-90 + k * 36) * Math.PI) / 180;
    pts.push(`${(12 + r * Math.cos(a)).toFixed(1)} ${(13 + r * Math.sin(a)).toFixed(1)}`);
  }
  return (
    `<path d="M${pts.join('L')}Z" fill="${TOKENS.gold}" stroke="${TOKENS.gold}" stroke-width="3" stroke-linejoin="round"/>` +
    `<path d="M12 5.6 13.3 9.4 9.6 10Z" fill="#FFE9A6"/><ellipse cx="9.4" cy="11.6" rx="1.6" ry="1" transform="rotate(-30 9.4 11.6)" fill="#fff" opacity=".7"/>` +
    `<path d="M16.3 18.8 12 16.5 7.7 18.8l.9-4.6" fill="none" stroke="${TOKENS.fish}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>`
  );
}

/** The tickers' art (moved here from helper-art.ts at I-4: only the lazy fx chunk's tickers draw it). */
function tickerArt(): string[] {
  return [
    sym('art-paw-cap', '0 -2.1 28.4 33.5', pawCap()),
    sym(
      'art-bolt',
      '0 0 24 24',
      `<path d="M14.8 1.2 4.6 13.4h6.3L8.4 22.8 19.6 9.4h-6.4Z" fill="${TOKENS.gold}" stroke="${TOKENS.gold}" stroke-width="1.4" stroke-linejoin="round"/>` +
        `<path d="M13.2 9.4h6.4L8.4 22.8l2.5-9.4Z" fill="${TOKENS.fish}"/><path d="M13.4 4 7.6 11.5h1.1Z" fill="#FFE9A6"/>`,
    ),
    sym('art-star', '0 0 24 24', star5()),
  ];
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
    ...tickerArt(),
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
