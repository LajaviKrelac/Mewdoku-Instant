// Owner: A (Phase 2b; was ui-board)
// Larger poses of our ginger loaf cat (02 §17.3): home mascot (idle), boot (sleeping), win (party
// hat), fail (small bandage), daily (happy), tutorial. Never a trumpet cat or a crying cat (06 §3).
// Drawn on a 200-unit grid around the same head as the board symbols (art/cat-parts.ts).
// The home and boot poses and the shared body parts live in mascot.ts (main bundle); this module is
// only used by the lazy overlays (04 §9).
import { CAT } from './cat-parts';
import { basePose, head, INK, mascotMarkup, ol, poseSvg, tube } from './mascot';
import { PALETTE, TOKENS } from './palette';

export type IllustrationKind = 'home' | 'boot' | 'win' | 'fail' | 'daily' | 'tutorial';

function partyHat(): string {
  // Cone between the ears (head grid), tilted to the right, lemon with teal bands and a pompom.
  const at = (f: number, side: 'l' | 'r'): string => {
    const x = side === 'l' ? 36 + 18 * f : 64 - 10 * f;
    return `${x.toFixed(1)} ${(30 - 38 * f).toFixed(1)}`;
  };
  const band = (a: number, b: number): string => `<path d="M${at(a, 'l')}L${at(b, 'l')}L${at(b, 'r')}L${at(a, 'r')}Z" fill="${TOKENS.accent}"/>`;
  return (
    `<path d="M${at(0, 'l')}L${at(1, 'l')}L${at(0, 'r')}Z" fill="${PALETTE[2]}"/>` +
    band(0.16, 0.32) +
    band(0.52, 0.66) +
    `<path d="M${at(0, 'l')}L${at(1, 'l')}L${at(0, 'r')}Z" fill="none" ${ol(2.8)}/>` +
    `<circle cx="54" cy="-9" r="5.6" fill="#FF8FA6" ${ol(2.4)}/>` +
    `<path d="M33 30.5Q50 34.5 67 29.5" fill="none" ${ol(2.6)}/>`
  );
}

function bandage(): string {
  // A small sticking plaster across the top-right of the forehead (head grid).
  return (
    `<g transform="rotate(-24 66 36)">` +
    `<rect x="52" y="31" width="28" height="10" rx="5" fill="#FFE2BF" ${ol(2.2)}/>` +
    `<rect x="61.5" y="31" width="9" height="10" fill="#F6C99B"/>` +
    `<rect x="52" y="31" width="28" height="10" rx="5" fill="none" ${ol(2.2)}/>` +
    `<circle cx="64.5" cy="34.4" r=".9" fill="${INK}" opacity=".45"/><circle cx="67.5" cy="37.4" r=".9" fill="${INK}" opacity=".45"/>` +
    '</g>'
  );
}

function confettiBits(): string {
  const bits: [number, number, number, number, 'r' | 'c'][] = [
    [26, 40, 0, 1, 'r'], [174, 36, 5, -1, 'r'], [18, 92, 6, 1, 'c'], [186, 88, 8, 1, 'c'], [40, 14, 3, -1, 'c'],
    [158, 12, 7, 1, 'r'], [12, 132, 4, -1, 'r'], [190, 124, 0, 1, 'r'], [64, 6, 10, 1, 'r'], [138, 4, 2, -1, 'c'],
  ];
  return bits
    .map(([x, y, ci, dir, kind], k) => {
      const c = PALETTE[ci] ?? TOKENS.accent;
      return kind === 'c'
        ? `<circle class="illus__bit" cx="${x}" cy="${y}" r="4" fill="${c}" style="--k:${k}"/>`
        : `<rect class="illus__bit" x="${x - 4}" y="${y - 2.5}" width="8" height="5" rx="1.2" fill="${c}" transform="rotate(${dir * (20 + k * 9)} ${x} ${y})" style="--k:${k}"/>`;
    })
    .join('');
}

function sparkles(points: readonly [number, number, number][]): string {
  return points
    .map(
      ([x, y, s], k) =>
        `<path class="illus__spark" style="--k:${k}" d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z" fill="#FFD45C" stroke="#E9A92B" stroke-width="1.2" stroke-linejoin="round"/>`,
    )
    .join('');
}

function calendar(): string {
  return (
    `<g transform="rotate(10 166 150)">` +
    `<rect x="140" y="122" width="50" height="52" rx="9" fill="#fff" ${ol(3)}/>` +
    `<path d="M140 140V131a9 9 0 0 1 9-9h32a9 9 0 0 1 9 9v9Z" fill="${TOKENS.accent}" ${ol(3)}/>` +
    `<path d="M153 116v12M177 116v12" ${ol(3.4)}/>` +
    `<path d="M154 157l7 7 13-14" fill="none" stroke="${TOKENS.accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
    '</g>'
  );
}

function raisedPaw(): string {
  return (
    `<g class="illus__wave">` +
    tube('M136 146C148 132 156 118 158 104', 19) +
    `<ellipse cx="159" cy="94" rx="15.5" ry="14.5" fill="${CAT.muzzle}" ${ol(3)}/>` +
    `<g fill="${CAT.nose}"><ellipse cx="159" cy="98" rx="5.4" ry="4.2"/><circle cx="151.6" cy="89.6" r="2.6"/><circle cx="159" cy="86.6" r="2.6"/><circle cx="166.4" cy="89.6" r="2.6"/></g>` +
    '</g>'
  );
}

const sweatDrop = `<path d="M44 52C44 52 51 61 51 65.5A7 7 0 0 1 37 65.5C37 61 44 52 44 52Z" fill="#A9DAF2" ${ol(2.6)}/><path d="M41 64.5a3.2 3.2 0 0 0 2.2 3" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`;

function markup(kind: IllustrationKind): string {
  const base = basePose;
  switch (kind) {
    case 'home':
    case 'boot':
      return mascotMarkup(kind);
    case 'win':
      return `<g class="illus__confetti">${confettiBits()}</g>` + base(head({ eyes: 'happy', mouth: 'open', extra: partyHat(), ty: 16 }));
    case 'fail':
      return base(head({ eyes: 'sad', mouth: 'sheepish', ears: 'droop', extra: bandage() }), sweatDrop);
    case 'daily':
      return base(head({ eyes: 'happy', mouth: 'open' }), calendar() + sparkles([[30, 54, 9], [176, 50, 7], [22, 112, 6]]));
    case 'tutorial':
      return base(head({ eyes: 'open', mouth: 'open', blink: true, rot: 6 }), raisedPaw());
  }
}

/** A fresh inline SVG; decorative (aria-hidden) unless `label` is given. */
export function illustration(kind: IllustrationKind, opts?: { label?: string; class?: string }): SVGSVGElement {
  return poseSvg(kind, markup(kind), kind === 'win' ? '0 -6 200 198' : '0 0 200 192', opts);
}
