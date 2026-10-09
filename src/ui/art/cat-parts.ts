// Owner: A (Phase 2b; was ui-board)
// Our ginger "loaf" cat (02 §17.3, 06 §5), drawn by hand on a 100-unit grid: a wide, soft loaf head,
// rounded ears, tabby stripes, cream muzzle, oval eyes, tiny pink nose, three whiskers per side.
// Shared by the sprite symbols (art/sprite.ts) and the larger poses (art/illustrations.ts).
import { CAT_COLORS, TOKENS } from './palette';

export const CAT = Object.freeze({
  fur: CAT_COLORS.fur,
  furDark: '#D9762E',
  muzzle: CAT_COLORS.muzzle,
  earIn: '#F8B9A0',
  nose: '#EE7F93',
  blush: '#FF8FA6',
  mouth: '#6B2B3F',
  ink: TOKENS.ink,
});

export type CatEyes = 'open' | 'happy' | 'sad' | 'round' | 'closed' | 'sleep' | 'wink';
export type CatMouth = 'smile' | 'open' | 'frown' | 'o' | 'sheepish';
export type CatEars = 'up' | 'droop';

/** How outlines are drawn: `fixed` = 2 CSS px at any size (board symbols); a number = user units. */
export type Stroke = 'fixed' | number;

function outline(stroke: Stroke, scale = 1): string {
  return stroke === 'fixed'
    ? `stroke="${CAT.ink}" stroke-width="${2 * scale}" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"`
    : `stroke="${CAT.ink}" stroke-width="${stroke * scale}" stroke-linejoin="round" stroke-linecap="round"`;
}

const EARS_UP = {
  l: 'M14 47 16.6 17.4Q17.6 9.6 24.4 13.2L45 29Z',
  r: 'M86 47 83.4 17.4Q82.4 9.6 75.6 13.2L55 29Z',
  li: 'M21 37.5 21.8 21.6Q22.4 18 25.6 20.2L37.6 30Z',
  ri: 'M79 37.5 78.2 21.6Q77.6 18 74.4 20.2L62.4 30Z',
};
const EARS_DROOP = {
  l: 'M12.5 52 4.8 27.8Q3.4 20.8 10.6 21.4L39 30.5Z',
  r: 'M87.5 52 95.2 27.8Q96.6 20.8 89.4 21.4L61 30.5Z',
  li: 'M16.5 42.5 10.6 28.4Q10 25.4 13.2 25.8L31.5 31.8Z',
  ri: 'M83.5 42.5 89.4 28.4Q90 25.4 86.8 25.8L68.5 31.8Z',
};

export const HEAD_PATH = 'M50 26.5C71 26.5 86.6 34 89.4 52.4 92 70.6 80.4 86.5 50 86.5 19.6 86.5 8 70.6 10.6 52.4 13.4 34 29 26.5 50 26.5Z';

export function catEars(kind: CatEars, stroke: Stroke): string {
  const e = kind === 'up' ? EARS_UP : EARS_DROOP;
  return (
    `<path d="${e.l}" fill="${CAT.fur}" ${outline(stroke)}/><path d="${e.r}" fill="${CAT.fur}" ${outline(stroke)}/>` +
    `<path d="${e.li}" fill="${CAT.earIn}"/><path d="${e.ri}" fill="${CAT.earIn}"/>`
  );
}

/** Head, stripes, cheeks, muzzle, nose, whiskers: everything except the ears, eyes and mouth. */
export function catFace(stroke: Stroke): string {
  const whisker = stroke === 'fixed' ? 'stroke-width="1" vector-effect="non-scaling-stroke"' : `stroke-width="${(stroke as number) * 0.45}"`;
  return (
    `<path d="${HEAD_PATH}" fill="${CAT.fur}" ${outline(stroke)}/>` +
    // tabby stripes on the forehead and cheeks
    `<g fill="none" stroke="${CAT.furDark}" stroke-linecap="round" stroke-width="3.6">` +
    `<path d="M50 29.5V37.5M41.2 30.6 43 36.4M58.8 30.6 57 36.4"/>` +
    `<path d="M13.6 57.5H19.6M13.2 63.2H18.8M86.4 57.5H80.4M86.8 63.2H81.2" stroke-width="3"/></g>` +
    `<ellipse cx="25.5" cy="67" rx="5.6" ry="3.4" fill="${CAT.blush}" opacity=".45"/>` +
    `<ellipse cx="74.5" cy="67" rx="5.6" ry="3.4" fill="${CAT.blush}" opacity=".45"/>` +
    `<path d="M50 61.5C55 61 64.4 62.4 64.6 69.6 64.8 76.6 57.6 80.4 50 80.4 42.4 80.4 35.2 76.6 35.4 69.6 35.6 62.4 45 61 50 61.5Z" fill="${CAT.muzzle}"/>` +
    `<g fill="none" stroke="${CAT.ink}" stroke-linecap="round" opacity=".55" ${whisker}>` +
    `<path d="M33.5 66.5 14 63M33.5 70 13 70.5M34 73.5 15 78M66.5 66.5 86 63M66.5 70 87 70.5M66 73.5 85 78"/></g>` +
    `<path d="M45.6 62.6Q50 60.6 54.4 62.6 53.6 66.2 50 67 46.4 66.2 45.6 62.6Z" fill="${CAT.nose}"/>`
  );
}

export function catEyes(kind: CatEyes, stroke: Stroke): string {
  const line = (d: string): string =>
    `<path d="${d}" fill="none" stroke="${CAT.ink}" stroke-linecap="round" ${stroke === 'fixed' ? 'stroke-width="2.2" vector-effect="non-scaling-stroke"' : `stroke-width="${(stroke as number) * 1.05}"`}/>`;
  switch (kind) {
    case 'open':
      return (
        `<ellipse cx="36" cy="54.5" rx="4.4" ry="5.6" fill="${CAT.ink}"/><ellipse cx="64" cy="54.5" rx="4.4" ry="5.6" fill="${CAT.ink}"/>` +
        `<circle cx="37.6" cy="52.4" r="1.6" fill="#fff"/><circle cx="65.6" cy="52.4" r="1.6" fill="#fff"/>`
      );
    case 'round':
      return (
        `<circle cx="36" cy="54" r="6" fill="${CAT.ink}"/><circle cx="64" cy="54" r="6" fill="${CAT.ink}"/>` +
        `<circle cx="38.2" cy="51.6" r="2.2" fill="#fff"/><circle cx="66.2" cy="51.6" r="2.2" fill="#fff"/>` +
        `<circle cx="34.2" cy="56.6" r="1" fill="#fff"/><circle cx="62.2" cy="56.6" r="1" fill="#fff"/>`
      );
    case 'happy':
      return line('M30.8 56.6Q36 49.4 41.2 56.6M58.8 56.6Q64 49.4 69.2 56.6');
    case 'sad': {
      // Heavy, droopy lids (outer corners low) under worried brows.
      const brow = stroke === 'fixed' ? 'stroke-width="1.6" vector-effect="non-scaling-stroke"' : `stroke-width="${(stroke as number) * 0.75}"`;
      return (
        `<path d="M30.6 54.8 41.2 52.2C41.6 57.4 39.2 60.6 36 60.6 32.8 60.6 30.4 58.2 30.6 54.8ZM69.4 54.8 58.8 52.2C58.4 57.4 60.8 60.6 64 60.6 67.2 60.6 69.6 58.2 69.4 54.8Z" fill="${CAT.ink}"/>` +
        `<circle cx="37.6" cy="56.2" r="1.3" fill="#fff"/><circle cx="65.6" cy="56.2" r="1.3" fill="#fff"/>` +
        `<path d="M30.4 47.6 39.6 44.6M69.6 47.6 60.4 44.6" fill="none" stroke="${CAT.ink}" stroke-linecap="round" ${brow}/>`
      );
    }
    case 'closed':
      return line('M31.2 55.4Q36 58.8 40.8 55.4M59.2 55.4Q64 58.8 68.8 55.4');
    case 'sleep':
      return line('M30.8 56.2Q36 60.6 41.2 56.2M58.8 56.2Q64 60.6 69.2 56.2');
    case 'wink':
      return (
        `<ellipse cx="36" cy="54.5" rx="4.4" ry="5.6" fill="${CAT.ink}"/><circle cx="37.6" cy="52.4" r="1.6" fill="#fff"/>` +
        line('M58.8 56.6Q64 49.4 69.2 56.6')
      );
  }
}

export function catMouth(kind: CatMouth, stroke: Stroke): string {
  const w = stroke === 'fixed' ? 'stroke-width="1.4" vector-effect="non-scaling-stroke"' : `stroke-width="${(stroke as number) * 0.7}"`;
  const line = (d: string): string => `<path d="${d}" fill="none" stroke="${CAT.ink}" stroke-linecap="round" stroke-linejoin="round" ${w}/>`;
  switch (kind) {
    case 'smile':
      return line('M50 67V69M45 68.6Q47.6 72.2 50 69 52.4 72.2 55 68.6');
    case 'open':
      return (
        `<path d="M44.4 68.4Q50 78.6 55.6 68.4 50 70.6 44.4 68.4Z" fill="${CAT.mouth}"/>` +
        `<ellipse cx="50" cy="73.4" rx="2.8" ry="1.9" fill="${CAT.nose}"/>` +
        line('M50 67V69.4')
      );
    case 'frown':
      return line('M50 67V69M45.4 72.4Q50 68.2 54.6 72.4');
    case 'o':
      return `<ellipse cx="50" cy="71.6" rx="2.6" ry="3.2" fill="${CAT.mouth}"/>`;
    case 'sheepish':
      return line('M50 67V69M45 70.4Q47.6 71.8 50 69.6 52.6 72.4 55.6 69.4');
  }
}

/** A complete head (ears, face, eyes, mouth) as SVG markup on the 100-unit grid. */
export function catHead(opts: { eyes: CatEyes; mouth: CatMouth; ears?: CatEars; stroke?: Stroke }): string {
  const stroke = opts.stroke ?? 'fixed';
  return catEars(opts.ears ?? 'up', stroke) + catFace(stroke) + catEyes(opts.eyes, stroke) + catMouth(opts.mouth, stroke);
}

/** Eyelids for the idle blink: fur patches over the open eyes plus closed-eye lines. */
export function catBlink(stroke: Stroke): string {
  return (
    `<ellipse cx="36" cy="54.5" rx="5.8" ry="6.9" fill="${CAT.fur}"/><ellipse cx="64" cy="54.5" rx="5.8" ry="6.9" fill="${CAT.fur}"/>` +
    catEyes('closed', stroke)
  );
}
