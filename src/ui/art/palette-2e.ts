// Owner: G2 (Phase 2e)
// The ranking art's colours (spec Appendix C), ours: the medals, the 12 avatar coats and their background
// discs, the name tag's collar. Lazy only (art/ladder-art.ts and scripts/palette-check.ts import it; the
// first load never does, so these tables cost the first screen nothing). Where a colour already exists it is
// taken from TOKENS, CAT_COLORS or PALETTE, so the look stays one theme. scripts/palette-check.ts checks the
// pairs that carry meaning (the rank number on each medal face, the given heart) and reports the rest.
import { CAT_COLORS, mixHex, PALETTE, TOKENS } from './palette';

export interface MedalColors {
  /** The disc's outer ring, its inner face (the UI draws the rank number on it), the paw emboss on the face. */
  readonly rim: string;
  readonly face: string;
  readonly emboss: string;
  /** The ribbon's two strips (front, back). */
  readonly ribbon: string;
  readonly ribbonBack: string;
}

/** Gold, silver and bronze (1st, 2nd, 3rd) with an orange, a sky and a lagoon ribbon (places differ by more than colour: the number). */
export const MEDAL_COLORS: readonly MedalColors[] = Object.freeze([
  { rim: TOKENS['gold-deep'], face: TOKENS.gold, emboss: '#F3B32F', ribbon: TOKENS.accent, ribbonBack: TOKENS['accent-deep'] },
  { rim: '#9DA6B4', face: '#D9DFE7', emboss: '#C9D0DA', ribbon: PALETTE[6] as string, ribbonBack: '#4B98C4' },
  { rim: '#A9612C', face: '#DE9A5E', emboss: '#CE8A50', ribbon: PALETTE[5] as string, ribbonBack: '#33908D' },
]);

/** The ink of the rank number the UI draws on a medal face (palette-check: ≥ 4.5:1 on every face). */
export const MEDAL_NUMBER_INK = TOKENS['ink-deep'];

export type CoatKind = 'tabby' | 'plain' | 'calico' | 'tuxedo' | 'siamese' | 'tortie' | 'patched';

export interface AvatarCoat {
  readonly name: string;
  readonly kind: CoatKind;
  /** Fur, the head's edge, the markings (stripes, patches, points), the lighter muzzle ('' = none). */
  readonly coat: string;
  readonly edge: string;
  readonly mark: string;
  readonly muzzle: string;
  /** A second patch colour (calico's orange, tortoiseshell's orange); '' = none. */
  readonly mark2: string;
  /** The mouth line: light on dark fur or a dark mask, ink otherwise. */
  readonly line: string;
  /** The background disc: this palette colour mixed with white (AVATAR_DISC_MIX). */
  readonly disc: number;
}

const INK = CAT_COLORS.outline;
const LIGHT = CAT_COLORS.line;
const WHITE = CAT_COLORS.mask;
const GINGER = '#EC9548';
const PALE_EDGE = '#C6B6B0';

/**
 * Our 12 coats in avatar id order (spec Appendix C; append-only like AVATAR_COUNT): ginger, grey tabby, black,
 * white, calico, tuxedo, cream, siamese points, brown tabby, blue-grey, tortoiseshell, white with grey patches.
 * Each sits on its own disc tint (a different palette colour each), so neighbours differ at 24–32 px.
 */
export const AVATAR_COATS: readonly AvatarCoat[] = Object.freeze([
  { name: 'ginger', kind: 'tabby', coat: GINGER, edge: '#BF6526', mark: '#C9682A', muzzle: '#FBDDBE', mark2: '', line: INK, disc: 6 },
  { name: 'grey tabby', kind: 'tabby', coat: '#A9A5AE', edge: '#706B77', mark: '#6B6670', muzzle: '#E4E1E7', mark2: '', line: INK, disc: 1 },
  { name: 'black', kind: 'plain', coat: CAT_COLORS.fur, edge: INK, mark: '', muzzle: '', mark2: '', line: LIGHT, disc: 3 },
  { name: 'white', kind: 'plain', coat: WHITE, edge: PALE_EDGE, mark: '', muzzle: '', mark2: '', line: INK, disc: 7 },
  { name: 'calico', kind: 'calico', coat: WHITE, edge: PALE_EDGE, mark: '#3A3237', muzzle: '', mark2: GINGER, line: INK, disc: 5 },
  { name: 'tuxedo', kind: 'tuxedo', coat: CAT_COLORS.fur, edge: INK, mark: WHITE, muzzle: '', mark2: '', line: INK, disc: 2 },
  { name: 'cream', kind: 'tabby', coat: '#F5DFBA', edge: '#C8A574', mark: '#E3C08F', muzzle: '#FDF4E6', mark2: '', line: INK, disc: 8 },
  { name: 'siamese points', kind: 'siamese', coat: '#F4E9D8', edge: '#BBA286', mark: '#5C4337', muzzle: '', mark2: '', line: LIGHT, disc: 10 },
  { name: 'brown tabby', kind: 'tabby', coat: '#A3713F', edge: '#673F21', mark: '#5B381D', muzzle: '#E2C39E', mark2: '', line: INK, disc: 11 },
  { name: 'blue-grey', kind: 'plain', coat: '#7F8CA2', edge: '#556078', mark: '', muzzle: '#AEB8C8', mark2: '', line: INK, disc: 0 },
  { name: 'tortoiseshell', kind: 'tortie', coat: '#3B302D', edge: INK, mark: '', muzzle: '', mark2: '#D07A38', line: LIGHT, disc: 4 },
  { name: 'white with grey patches', kind: 'patched', coat: WHITE, edge: PALE_EDGE, mark: '#8E8995', muzzle: '', mark2: '', line: INK, disc: 9 },
]);

/** How far each avatar's disc colour is mixed toward white (a soft tint of its palette colour). */
export const AVATAR_DISC_MIX = 0.58;

/** The background disc colour of an avatar (its palette colour mixed toward white). */
export function avatarDisc(coat: AvatarCoat): string {
  return mixHex(PALETTE[coat.disc] as string, '#FFFFFF', AVATAR_DISC_MIX);
}

/** The name tag's collar (Appendix C: a collar with a round tag and a bell): the band and its stitching. */
export const TAG_COLORS = Object.freeze({ collar: PALETTE[0] as string, collarDeep: '#B2575A', stitch: '#F6D8D3' });
