// Owner: G2 (Phase 2e)
// The worldwide ranking's art (spec §2.4–§2.8, Appendix C; CONTRACTS §9), each drawn by us as SVG from the
// spec's written words, never from any image of the original or of another game (D-2e-0; provenance-G2.md):
// - medal-1, medal-2, medal-3: round gold, silver and bronze medals (a rim, a face, a white highlight) on a short
//   V ribbon, a paw embossed on the face in a tone of its own colour; the UI draws the rank number on top
//   (never colour alone), centred on the face: MEDAL_FACE (50 % across, 53 % down);
// - avatar-0 … avatar-11: our pointed-ear cat head (cat-head-flat, the heads pill's silhouette family) in 12 coats
//   (palette-2e.ts AVATAR_COATS) on a round tinted disc, front view, the same eyes for all; drawn so each reads
//   at 28 px: big eyes, few markings, a different disc colour each;
// - icon-heart-line, icon-heart-fill: a plump rounded heart, as a 2-unit line (the icon set's stroke) and filled
//   in --cheer with a soft highlight (a cheer: never the lives' look, lives are fish); both the same size;
// - nick-tag: a collar (Coral, dashed stitching) with a round gold tag on a ring (a paw engraved) and a little
//   bell beside it; no bone;
// - icon-pencil, icon-shuffle, icon-info: edit, shuffle and info glyphs in the icon set's 2-unit round line
//   with the soft --icon-fill wash;
// - reward-chest, reward-chest-open: the wooden chest with the fish-shaped lock (chestArt below).
// Lazy only: the `ladder` chunk mounts them (mountLadderArt adds these symbols to the sprite once). Nothing in
// the main bundle may import this module (spec §7.9); the lazy-art chunk, which the board's motion and the
// win's fx load, stays as it was (its 4.4 KB row).
import { CAT_COLORS, CHEST_COLORS, TOKENS } from './palette';
import { AVATAR_COATS, avatarDisc, MEDAL_COLORS, TAG_COLORS, type AvatarCoat } from './palette-2e';
import { sym } from './helper-art';
import { HEAD_FLAT, PAW, SPRITE_ID, type AvatarIndex, type AvatarSymbol } from './sprite';

/** How many avatars we draw: AVATAR_COUNT of src/shared/rank-api.ts (ui/ imports shared/ for types only; a test keeps them equal). */
export const ART_AVATAR_COUNT = 12;

/**
 * The symbol of an avatar id. The client's validators drop a row with an id outside 0 … AVATAR_COUNT − 1
 * (spec §2.12), so an unknown id never reaches a view; this still never returns an id we did not draw.
 */
export function avatarSymbol(avatarId: number): AvatarSymbol {
  const i = Number.isInteger(avatarId) && avatarId >= 0 && avatarId < ART_AVATAR_COUNT ? avatarId : 0;
  return `avatar-${i as AvatarIndex}`;
}

/** Where the UI centres the rank number on a medal (fractions of the symbol's box): the face's centre. */
export const MEDAL_FACE = Object.freeze({ x: 0.5, y: 0.53, r: 0.29 });

/**
 * The heart's "like" motion (spec §2.8, §7.7: a pop on a given heart, none with reduced motion), for
 * Element.animate on the heart's <svg>: a quick swell and settle. The caller skips it with reduced motion.
 */
export const HEART_POP: readonly Keyframe[] = Object.freeze([
  { transform: 'scale(1)' },
  { transform: 'scale(1.32)', offset: 0.35 },
  { transform: 'scale(.92)', offset: 0.7 },
  { transform: 'scale(1)' },
]);
export const HEART_POP_MS = 320;

const MIRROR = 'transform="matrix(-1 0 0 1 100 0)"';
/** An element and its mirror image about the head's vertical axis (x = 50). */
const both = (el: string): string => `${el}<g ${MIRROR}>${el}</g>`;
const paint = (d: string, fill: string): string => `<path d="${d}" fill="${fill}"/>`;

/** The left ear's patch: the ear itself, following the head's outline (head grid). */
const EAR = 'M36.6 28.2 21 7.6Q17 3 15.2 9.4L10.6 36.4Q24 34.4 36.6 28.2Z';
/** Calico's and the tortoiseshell's orange patch: the left ear and the forehead's left side. */
const EAR_BROW = 'M36.6 28.2 21 7.6Q17 3 15.2 9.4L10 39.5C8.6 41.8 7.6 44.2 6.9 46.6 15 50 25.4 47 30.6 40.4 34.4 35.8 39.4 32 36.6 28.2Z';

/** Markings drawn over the fur and under the head's outline, by coat kind (head grid, 100 units). */
function markings(c: AvatarCoat): string {
  switch (c.kind) {
    case 'tabby':
      return (
        `<g fill="none" stroke="${c.mark}" stroke-width="3.4" stroke-linecap="round"><path d="M50 30.6v9.4M42.4 31.6l1.8 7.6M57.6 31.6l-1.8 7.6"/>` +
        both('<path d="m5.4 57.6 9.4 1.6m-9 7 9-.8"/>') +
        '</g>'
      );
    case 'calico':
      return (
        paint(EAR_BROW, c.mark2) +
        paint('M63.4 28.2 79 7.6Q83 3 84.8 9.4L90 39.5c-2 3.5-6 5.9-10.4 5.1C72.4 43.4 66 38 63.4 28.2Z', c.mark) +
        `<ellipse cx="80" cy="76" rx="8.6" ry="6.2" fill="${c.mark2}"/>`
      );
    case 'tuxedo':
      // Tux's family: the white blaze sweeps up around the right eye (cat-parts MASK_PATH, re-drawn for this head)
      return paint('M50 40c-3 6-5 13-5.4 18.6-.6 5.4-3.2 7.8-7.6 8.8-6 1-9 5.6-8 11.2C31 86 40 93 50 93s19-7 21-14.4c1-4.6-1-8.6-4.4-10 5.8-2 11-6.6 11-13.6 0-7.4-4.6-11-10.6-11.8C61 42.4 55 40 50 40Z', c.mark);
    case 'siamese':
      return both(paint(EAR, c.mark)) + paint('M50 52c8.6 0 15.4 7.4 17 15.6 1.8 10.8-6 20.8-17 20.8S31.2 78.4 33 67.6C34.6 59.4 41.4 52 50 52Z', c.mark);
    case 'tortie':
      return (
        paint(EAR_BROW, c.mark2) +
        paint('M95.6 60c-.6 12-9.2 23-19.6 26.6-5-6-3.4-14.4 4.6-18.2 5.8-2.8 11-4.8 15-8.4Z', c.mark2) +
        paint('M50 39.6c3 6 4.4 12.4 3.6 20.8h-7.2c-.8-8.4.6-14.8 3.6-20.8Z', c.mark2)
      );
    case 'patched':
      return (
        paint('M63.4 28.2 79 7.6Q83 3 84.8 9.4L90 39.5c3.6 5.9 5.4 12.1 5.8 18.1C88 66.4 77.6 70.4 70 68.4c-8.4-2.2-12.4-10.4-12.4-20 0-9.6 2-16 5.8-20.2Z', c.mark) +
        `<ellipse cx="29" cy="37.6" rx="7.4" ry="5" fill="${c.mark}"/>`
      );
    case 'plain':
      return '';
  }
}

/** One avatar: the tinted disc, then the head (scaled into the disc, ears inside it) with its coat. */
function avatar(c: AvatarCoat): string {
  const C = CAT_COLORS;
  const eye = (x: string, px: string, cx: string): string =>
    `<ellipse cx="${x}" cy="60" rx="9" ry="9.6" fill="${C.iris}" stroke="${C.outline}" stroke-width="1.6"/>` +
    `<ellipse cx="${px}" cy="60.8" rx="4.2" ry="6.8" fill="${C.pupil}"/><circle cx="${cx}" cy="56.4" r="2.6" fill="#fff"/>`;
  return (
    `<circle cx="50" cy="52" r="47" fill="${avatarDisc(c)}"/><g transform="matrix(.84 0 0 .84 8 11.4)">` +
    paint(HEAD_FLAT, c.coat) +
    markings(c) +
    (c.muzzle ? both(`<ellipse cx="41.6" cy="79.4" rx="9.8" ry="7.4" fill="${c.muzzle}"/>`) : '') +
    (c.kind === 'siamese' ? '' : both(paint('M18.6 13.4q1-2.6 3-.8L32 27q-9.4 2.8-16.8 8.8Z', C.earIn))) +
    `<path d="${HEAD_FLAT}" fill="none" stroke="${c.edge}" stroke-width="3" stroke-linejoin="round"/>` +
    eye('33', '33.4', '36') +
    eye('67', '67.4', '70') +
    paint('M45.8 70.2q4.2-1.8 8.4 0-.4 2.8-4.2 4.4-3.8-1.6-4.2-4.4Z', C.nose) +
    `<path d="M50 74.6v2.6m-4.6 1.4q2.4 2.6 4.6-1.2 2.2 3.8 4.6 1.2" fill="none" stroke="${c.line}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>`
  );
}

/** A medal (32 grid): the V ribbon behind, the rim, the face with its paw emboss and a highlight. */
function medal(place: number): string {
  const m = MEDAL_COLORS[place - 1] as (typeof MEDAL_COLORS)[number];
  return (
    paint('M18.6 0h6l-4.2 10h-6Z', m.ribbonBack) +
    paint('M7.4 0h6l4.2 10h-6Z', m.ribbon) +
    `<circle cx="16" cy="17" r="11.4" fill="${m.rim}"/><circle cx="16" cy="17" r="9.2" fill="${m.face}"/>` +
    `<g fill="${m.emboss}" transform="matrix(.56 0 0 .56 9.3 10.4)">${PAW}</g>` +
    `<path d="M9.2 14.2a7.6 7.6 0 0 1 4.6-4.4" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".75"/>`
  );
}

/** The heart (24 grid): plump, rounded lobes; the round line join rounds its bottom tip. */
const HEART = 'M12 20.2C7.3 17.1 3.4 13.7 3.4 9.4c0-3 2.2-5.2 4.9-5.2 1.6 0 2.9.8 3.7 2.1.8-1.3 2.1-2.1 3.7-2.1 2.7 0 4.9 2.2 4.9 5.2 0 4.3-3.9 7.7-8.6 10.8Z';
const LINE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const SOFT_FILL = 'style="fill:var(--icon-fill,none)"';

/**
 * The reward chest (spec Appendix C; ours, drawn from the spec's words): a small wooden chest with a fish-shaped
 * lock, closed and open with a glow (48 grid), for the ranking's result card and the day-7 victory row (the
 * `ladder` chunk is prefetched at every scored board's mount, so it is mounted by the win). A rounded lid over a
 * plank body (CHEST_COLORS), two gold straps with rivets, and a gold fish facing left (like our fish) as the lock,
 * its eye the keyhole; a soft ground shadow. Open: the lid tilted back (its darker inside), light rays, the dark
 * opening with a gold mound of light, a radial glow and three small sparkles.
 */
function chestArt(): string[] {
  const { gold } = TOKENS;
  const deep = TOKENS['gold-deep'];
  const W = CHEST_COLORS;
  const body =
    `<ellipse cx="24" cy="42.6" rx="18.6" ry="2.4" fill="${TOKENS.ink}" opacity=".16"/>` +
    `<rect x="6" y="21" width="36" height="20.6" rx="3.4" fill="${W.wood}"/>` +
    `<path d="M6 31.4h36M10 26.4h5m14 0h3m-20 9.8h4m14 0h6" stroke="${W.grain}" stroke-width="1.1" stroke-linecap="round"/>` +
    `<path d="M11 21h4v20.6h-4Zm22 0h4v20.6h-4Z" fill="${gold}"/>`;
  const lock = (y: number): string =>
    `<path d="m27.6 ${y} 4.4-3.4v6.8Z" fill="${deep}"/><ellipse cx="23.2" cy="${y}" rx="5.6" ry="4.4" fill="${gold}" stroke="${deep}" stroke-width="1.1"/>` +
    `<circle cx="20.8" cy="${y - 0.6}" r="1.2" fill="${W.inside}"/><path d="M20.8 ${y}v2" stroke="${W.inside}" stroke-width="1.1" stroke-linecap="round"/>`;
  const rivets = (y: number): string => `<path d="M13 ${y}h0m22 0h0" stroke="${deep}" stroke-width="1.6" stroke-linecap="round"/>`;
  const sparkle = (x: number, y: number, r: number): string =>
    `<path d="M0-1q.25.75 1 1-.75.25-1 1-.25-.75-1-1 .75-.25 1-1Z" transform="matrix(${r} 0 0 ${r} ${x} ${y})" fill="#fff"/>`;
  return [
    sym(
      'reward-chest',
      '0 0 48 48',
      body +
        `<path d="M6 22.6V16.4c0-5 4-8.8 9-8.8h18c5 0 9 3.8 9 8.8v6.2Z" fill="${W.lid}"/>` +
        `<path d="M11 10.4q1.6-1.8 4-2.4v14.6h-4Zm26 0q-1.6-1.8-4-2.4v14.6h4Z" fill="${gold}"/>` +
        `<path d="M10.8 13.6c1.4-2.2 3.4-3 6-3h14" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".4"/>` +
        `<path d="M6 21h36v2.6H6Z" fill="${W.grain}"/>` +
        rivets(17) + rivets(37.4) +
        lock(23.4),
    ),
    sym(
      'reward-chest-open',
      '0 0 48 48',
      `<defs><radialGradient id="chest-glow" cx=".5" cy=".5" r=".5"><stop offset=".2" stop-color="${TOKENS['fish-hi']}"/><stop offset=".55" stop-color="${gold}" stop-opacity=".55"/><stop offset="1" stop-color="${gold}" stop-opacity="0"/></radialGradient></defs>` +
        `<circle cx="24" cy="17" r="23" fill="url(#chest-glow)"/>` +
        `<path d="M7.4 19.4 9 9.4C9.5 6.6 11.6 5 14.6 5h18.8c3 0 5.1 1.6 5.6 4.4l1.6 10Z" fill="${W.lid}"/>` +
        `<path d="M10.6 19.4 11.8 11c.3-1.8 1.5-2.8 3.4-2.8h17.6c1.9 0 3.1 1 3.4 2.8l1.2 8.4Z" fill="${W.grain}"/>` +
        `<path d="M12.8 5.2h3.6l-1.2 14.2h-3.8Zm18.8 0h3.6l1.4 14.2h-3.8Z" fill="${gold}"/>` +
        `<path d="M14 21 9.6 3.6h7.6L20 21Zm8 0 .4-19h5.4L26 21Zm6 0 5.8-16.2 5.8 2.4L32 21Z" fill="${TOKENS['fish-hi']}" opacity=".5"/>` +
        `<path d="M6 19.2h36v4.4H6Z" fill="${W.inside}"/><path d="M8.6 21.6c3-4.6 9-6.8 15.4-6.8s12.4 2.2 15.4 6.8Z" fill="${gold}"/>` +
        `<path d="M14.6 19.4c2.4-1.8 5.8-2.8 9.4-2.8" fill="none" stroke="${TOKENS['fish-hi']}" stroke-width="1.8" stroke-linecap="round"/>` +
        body +
        rivets(37.4) +
        lock(27) +
        sparkle(9.4, 10, 2.6) + sparkle(39.4, 7.4, 2.2) + sparkle(30.6, 3.6, 1.6),
    ),
  ];
}

/** The ranking symbols' markup (and the reward chests). */
export function ladderArtSymbols(): string {
  const { gold } = TOKENS;
  const deep = TOKENS['gold-deep'];
  const cheer = `var(--cheer,${TOKENS.cheer})`;
  const T = TAG_COLORS;
  return [
    ...[1, 2, 3].map((p) => sym(`medal-${p}`, '0 0 32 32', medal(p))),
    ...chestArt(),
    ...AVATAR_COATS.map((c, i) => sym(`avatar-${i}`, '0 0 100 100', avatar(c))),
    sym('icon-heart-line', '0 0 24 24', `<path d="${HEART}" ${LINE} ${SOFT_FILL}/>`),
    sym(
      'icon-heart-fill',
      '0 0 24 24',
      `<path d="${HEART}" style="fill:${cheer};stroke:${cheer}" stroke-width="2" stroke-linejoin="round"/>` +
        `<path d="M6.2 9.2c.1-1.5 1-2.6 2.4-2.9" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`,
    ),
    sym(
      'nick-tag',
      '0 0 48 48',
      paint('M1.6 7.6Q24 18 46.4 7.6l.4 5Q24 22.6 1.2 12.6Z', T.collar) +
        paint('M1.2 12.6Q24 22.6 46.8 12.6l-.1 1.4Q24 24.2 1.3 14Z', T.collarDeep) +
        `<path d="M2.4 10Q24 20.2 45.6 10" fill="none" stroke="${T.stitch}" stroke-width=".9" stroke-dasharray="2 1.6"/>` +
        `<circle cx="24" cy="20.6" r="2.6" fill="none" stroke="${deep}" stroke-width="1.5"/>` +
        `<circle cx="24" cy="34.4" r="12.2" fill="${deep}"/><circle cx="24" cy="34.4" r="10.2" fill="${gold}"/>` +
        `<g fill="${deep}" opacity=".5" transform="matrix(.58 0 0 .58 17 27.6)">${PAW}</g>` +
        `<path d="M16.6 31a8 8 0 0 1 4.6-4.4" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".75"/>` +
        `<circle cx="38" cy="17.6" r="1.2" fill="none" stroke="${deep}" stroke-width="1"/>` +
        `<circle cx="38" cy="22.6" r="4.2" fill="${gold}" stroke="${deep}" stroke-width=".9"/>` +
        `<path d="M34.2 23.6h7.6" stroke="${deep}" stroke-width=".9"/><circle cx="38" cy="25.2" r=".95" fill="${deep}"/>` +
        `<circle cx="36.6" cy="20.8" r=".95" fill="#fff" opacity=".8"/>`,
    ),
    sym(
      'icon-pencil',
      '0 0 24 24',
      `<path d="M15.4 4.6a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L9.2 18.8 4.6 19.4l.6-4.6Z" ${LINE} ${SOFT_FILL}/><path d="m13.6 6.4 4 4M5.2 14.8l4 4" ${LINE}/>`,
    ),
    sym(
      'icon-shuffle',
      '0 0 24 24',
      `<path d="M3.6 7.4h2.8c4.6 0 6.6 9.2 11.2 9.2h2.6M3.6 16.6h2.8c1.6 0 2.8-1.1 3.8-2.6m3.6-4c1-1.5 2.2-2.6 3.8-2.6h2.6M17.6 4.6l2.8 2.8-2.8 2.8M17.6 13.8l2.8 2.8-2.8 2.8" ${LINE}/>`,
    ),
    sym(
      'icon-info',
      '0 0 24 24',
      `<circle cx="12" cy="12" r="8.6" ${LINE} ${SOFT_FILL}/><path d="M12 11v5.4" ${LINE} stroke-width="2.4"/><circle cx="12" cy="7.8" r="1.5" fill="currentColor"/>`,
    ),
  ].join('');
}

/**
 * Adds the ranking symbols and the reward chests to the sprite once; idempotent, a no-op before the sprite is
 * mounted or outside a document. A <use> that already points at one of them draws as soon as it exists.
 */
export function mountLadderArt(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): void {
  const sprite = doc?.getElementById(SPRITE_ID);
  if (!doc || !sprite || doc.getElementById('avatar-0')) return;
  const holder = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  holder.innerHTML = ladderArtSymbols();
  sprite.append(...Array.from(holder.childNodes));
}
