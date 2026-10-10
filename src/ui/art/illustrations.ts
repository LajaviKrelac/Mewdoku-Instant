// Owner: A (Phase 2b; was ui-board)
// Tux's larger poses (phase2b §1.6), drawn by hand on a 200-unit grid around the board head
// (art/cat-parts.ts) from the written brief, no reference images:
//   win      mid-leap, both front paws holding one of our fish above the head, eyes ^ ^, three sparkles
//   fail     lying flat (a pancake), ears back, one paw over the eyes, two small sweat drops
//   daily    peeking over a calendar page, one paw on the page edge
//   tutorial sitting, one paw raised (the .illus__wave loop in fx.css)
// Never an instrument, a heart or tears (06 §3). The home and boot poses and the shared body parts
// live in mascot.ts (main bundle); this module is only used by the lazy overlays (04 §9).
import { CAT } from './cat-parts';
import { fishMarkup } from './fish';
import { basePose, head, ol, poseSvg, SHADOW, sockLeg, sockPaw, tail, tube, mascotMarkup, W } from './mascot';
import { TOKENS } from './palette';

export type IllustrationKind = 'home' | 'boot' | 'win' | 'fail' | 'daily' | 'tutorial';

/** Four-point sparkles in --gold with a deeper edge (each twinkles with .illus__spark). */
function sparkles(points: readonly (readonly [number, number, number])[]): string {
  return points
    .map(
      ([x, y, s], k) =>
        `<path class="illus__spark" style="--k:${k}" d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z" fill="${TOKENS.gold}" stroke="${TOKENS['fish-deep']}" stroke-width="1.4" stroke-linejoin="round"/>`,
    )
    .join('');
}

/** Our fish on the 200 grid: the icon's 24-grid art at `s`×, centred at (cx, cy), turned `rot`°. */
function bigFish(cx: number, cy: number, s: number, rot = 0): string {
  return `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s}) translate(-12.6 -13)">${fishMarkup()}</g>`;
}

function winMarkup(): string {
  // Arms go up behind the head's sides; the paws grip the fish above the head.
  const arms =
    tube('M72 140C54 122 49 92 64 47', 15) +
    tube('M128 140C146 122 151 92 136 47', 15);
  const body =
    `<path d="M74 128C64 148 70 170 92 179C114 186 133 174 133 153C133 141 129 133 123 128Z" fill="${CAT.fur}" ${ol()}/>` +
    `<path d="M101 134C111 134 119 141 119 151C119 161 111 168 101 172C91 168 83 161 83 151C83 141 91 134 101 134Z" fill="${CAT.mask}"/>`;
  const legs = tube('M86 170C80 178 72 184 63 187', 15) + tube('M120 168C127 176 136 181 146 184', 15);
  const swish = tail('M131 156C152 158 170 146 173 125C174.6 114 169 106 161 107', 'M161 107C155 107.6 151.6 112 152.6 117.6', 12);
  const fish = bigFish(100, 26, 3.6, -4);
  const paws = sockPaw(66, 37, 10.6, 9.2, -24) + sockPaw(134, 37, 10.6, 9.2, 24);
  const motion =
    `<path d="M70 192Q100 186 130 192" fill="none" stroke="${TOKENS['ink-2']}" stroke-width="3" stroke-linecap="round" opacity=".3"/>`;
  const happyHead = head({ eyes: 'happy', mouth: 'open', ears: 'happy', blush: true, scale: 1.12, ty: 40 });
  return (
    `<g class="illus__body">${swish}${legs}${arms}${body}${happyHead}${fish}${paws}</g>` +
    motion +
    sparkles([
      [24, 40, 10],
      [178, 64, 8],
      [30, 112, 7],
    ])
  );
}

/** A white mitten paw pointing left (toes leading), in its own frame, seen from the back: toe lines. */
function mitten(): string {
  return (
    `<path d="M12 -9C16.6 -9 19 -4.6 19 0C19 4.6 16.6 9 12 9H-5C-9.6 9.6 -13.4 8.4 -14.4 5.6C-18 5.8 -19.2 1.8 -16.8 0C-19.2 -1.6 -17.8 -5.6 -14.4 -5.4C-13 -8.2 -9.4 -9.4 -5.6 -8.8Z" fill="${CAT.mask}" ${ol(W / 1.3)}/>` +
    `<path d="M-14.4 -5.4Q-12 -4.2 -9.6 -4.2M-16.8 0Q-13.8 .2 -11 .4M-14.6 5.6Q-12 4.2 -9.6 4" fill="none" stroke="${CAT.ink}" stroke-width="1.3" stroke-linecap="round" opacity=".5"/>`
  );
}

function failMarkup(): string {
  // Lying flat: a wide pancake body, back feet splayed at the ends, the chin on the floor.
  const body =
    `<path d="M24 182C10 182 8 166 22 159C44 148 72 145 100 145C128 145 156 148 178 159C192 166 190 182 176 182Z" fill="${CAT.fur}" ${ol()}/>` +
    `<path d="M152 156C166 159 176 165 180 173M48 156C34 159 24 165 20 173" fill="none" stroke="${CAT.sheen}" stroke-width="5" stroke-linecap="round"/>`;
  const flatTail = tail('M178 175C190 177 197 170 196 161', 'M196 161C195.6 157 193.6 154 190.6 152.6', 11);
  const backFeet =
    `<ellipse cx="17" cy="177" rx="11" ry="6.4" fill="${CAT.fur}" ${ol(3)}/>` +
    `<ellipse cx="170" cy="180" rx="10" ry="5.6" fill="${CAT.fur}" ${ol(3)}/>`;
  const otherPaw = sockPaw(48, 178, 12, 6.4);
  // the right arm comes up from the body beside the head; its paw lies over both eyes (head grid)
  const coverPaw =
    `<path d="M99 88C90 78 76 60 66 48" fill="none" stroke="${CAT.ink}" stroke-width="${(13 + (2 * W) / 1.3).toFixed(2)}" stroke-linecap="round"/>` +
    `<path d="M99 88C90 78 76 60 66 48" fill="none" stroke="${CAT.fur}" stroke-width="13" stroke-linecap="round"/>` +
    `<g transform="translate(51 52) rotate(-14) scale(1.2)">${mitten()}</g>`;
  const drop = (x: number, y: number, s: number): string =>
    `<path d="M${x} ${y}C${x} ${y} ${x + 6 * s} ${y + 8 * s} ${x + 6 * s} ${y + 12 * s}A${6 * s} ${6 * s} 0 0 1 ${x - 6 * s} ${y + 12 * s}C${x - 6 * s} ${y + 8 * s} ${x} ${y} ${x} ${y}Z" fill="#A9DAF2" ${ol(2.4)}/>` +
    `<path d="M${x - 2.6 * s} ${y + 11 * s}a${2.8 * s} ${2.8 * s} 0 0 0 ${1.8 * s} ${2.6 * s}" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`;
  const flatHead = head({ eyes: 'sad', mouth: 'sheepish', ears: 'back', ty: 64, extra: coverPaw });
  return `${SHADOW}<g class="illus__body">${flatTail}${backFeet}${body}${otherPaw}${flatHead}</g>${drop(160, 76, 1)}${drop(176, 100, 0.75)}`;
}

function dailyMarkup(): string {
  const page =
    `<g transform="rotate(-3 100 146)">` +
    `<rect x="36" y="104" width="128" height="80" rx="12" fill="#fff" ${ol()}/>` +
    `<path d="M36 126V116A12 12 0 0 1 48 104H152A12 12 0 0 1 164 116V126Z" fill="${TOKENS.accent}" ${ol()}/>` +
    `<path d="M66 98v14M134 98v14" ${ol(4.4)}/>` +
    `<g fill="${TOKENS['ink-3']}">${[0, 1, 2, 3, 4]
      .flatMap((c) => [0, 1].map((r) => `<rect x="${54 + c * 20}" y="${138 + r * 18}" width="11" height="9" rx="2.6"/>`))
      .join('')}</g>` +
    `<path d="M115 160l6 6 13-14" fill="none" stroke="${TOKENS.accent}" stroke-width="5.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    '</g>';
  const peekHead = head({ eyes: 'open', mouth: 'smile', ty: 18, blink: true });
  const paw = sockPaw(138, 103, 12, 8.6, -6);
  return (
    `${SHADOW}<g class="illus__body">${peekHead}${page}${paw}</g>` +
    sparkles([
      [28, 58, 9],
      [176, 50, 7],
      [20, 112, 6],
    ])
  );
}

function tutorialMarkup(): string {
  const raised =
    `<g class="illus__wave">` +
    tube('M128 142C142 130 150 114 152 100', 18) +
    `<ellipse cx="153" cy="90" rx="15" ry="14" fill="${CAT.mask}" ${ol(3)}/>` +
    `<g fill="${CAT.nose}"><ellipse cx="153" cy="94" rx="5.4" ry="4.2"/><circle cx="145.6" cy="85.6" r="2.6"/><circle cx="153" cy="82.6" r="2.6"/><circle cx="160.4" cy="85.6" r="2.6"/></g>` +
    '</g>';
  return basePose(head({ eyes: 'open', mouth: 'open', blink: true, rot: 6 }), raised, sockLeg(88));
}

function markup(kind: IllustrationKind): string {
  switch (kind) {
    case 'home':
    case 'boot':
      return mascotMarkup(kind);
    case 'win':
      return winMarkup();
    case 'fail':
      return failMarkup();
    case 'daily':
      return dailyMarkup();
    case 'tutorial':
      return tutorialMarkup();
  }
}

/** A fresh inline SVG; decorative (aria-hidden) unless `label` is given. */
export function illustration(kind: IllustrationKind, opts?: { label?: string; class?: string }): SVGSVGElement {
  return poseSvg(kind, markup(kind), kind === 'win' ? '0 -6 200 198' : '0 0 200 192', opts);
}
