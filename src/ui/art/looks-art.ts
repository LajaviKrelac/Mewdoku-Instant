// UI batch (2026-10-13): profile — the avatar frames and backgrounds, drawn by us as SVG from our own written words
// (never from any image of another game), procedurally from small tables so the lazy `ladder` chunk stays small.
// Every symbol is a 100 grid around the avatar's disc (centre 50,52, radius 47; art/ladder-art.ts):
// - frame-1 … frame-7, a ring in the band r 41 … 48, drawn OVER the avatar (avatarBadge draws the avatar 86 % inside
//   a frame so its ears clear the ring): solid (denim, a highlight), double (two lagoon rings with white between),
//   beaded (orchid beads on a thin line), scalloped (an apricot ring with a wavy edge), studded (gold with four kinds
//   of gem), laurel (two leafy branches tied with a coral bow, open at the top), starry (violet with gold stars);
// - bg-1 … bg-7, a full disc drawn UNDER the avatar (whose own coat disc avatarBadge turns off): sunny (yellow with a
//   soft halo), mint (two greens), polka (rose with white dots), stripes (sky with light bands), night (navy, a
//   crescent moon between the ears, stars), sunburst (gold and apricot rays), rainbow (palette rings).
// Id 0 of each is the plain look (no symbol). Colours: palette-2e.ts LOOK_COLORS only. Lazy only: ladder-art.ts adds
// these to its symbols (mountLadderArt); the main bundle never imports this module.
import { LOOK_COLORS as K } from './palette-2e';
import { sym } from './helper-art';

const CX = 50;
const CY = 52;
const R = 47;
/** The frames' ring: its middle radius (the band is 41 … 48). */
const RM = 44.5;

/** One decimal (small markup). */
const f1 = (n: number): string => String(Math.round(n * 10) / 10);
const rad = (deg: number): number => (deg * Math.PI) / 180;
/** The point at `deg` (0 = right, 90 = down) and radius r around the disc's centre. */
const at = (deg: number, r: number): [string, string] => [f1(CX + r * Math.cos(rad(deg))), f1(CY + r * Math.sin(rad(deg)))];
const ring = (r: number, w: number, stroke: string, extra = ''): string =>
  `<circle cx="${CX}" cy="${CY}" r="${f1(r)}" fill="none" stroke="${stroke}" stroke-width="${f1(w)}"${extra}/>`;
const dot = (x: string, y: string, r: number, fill: string, extra = ''): string => `<circle cx="${x}" cy="${y}" r="${f1(r)}" fill="${fill}"${extra}/>`;
const disc = (fill: string, r = R): string => dot(String(CX), String(CY), r, fill);
/** Every `step` degrees from `from` (inclusive) while < `to`. */
const angles = (from: number, to: number, step: number): number[] => {
  const out: number[] = [];
  for (let a = from; a < to - 1e-6; a += step) out.push(a);
  return out;
};
/** A five-point star at (x, y). */
function star(x: number, y: number, ro: number, fill: string): string {
  const pts: string[] = [];
  for (let k = 0; k < 10; k++) {
    const r = k % 2 === 0 ? ro : ro * 0.45;
    const a = rad(-90 + k * 36);
    pts.push(`${f1(x + r * Math.cos(a))} ${f1(y + r * Math.sin(a))}`);
  }
  return `<path d="M${pts.join('L')}Z" fill="${fill}"/>`;
}
/** A short highlight arc on the ring (upper left), white. */
const shine = (r: number): string => {
  const [x1, y1] = at(200, r);
  const [x2, y2] = at(245, r);
  return `<path d="M${x1} ${y1}A${f1(r)} ${f1(r)} 0 0 1 ${x2} ${y2}" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".6"/>`;
};

function frames(): string[] {
  const gems = [K.sky, K.coral, K.lime, K.violet];
  const leaves = (from: number, to: number, step: number, tilt: number): string =>
    angles(from, to, step)
      .map((a, i) => {
        const [x, y] = at(a, i % 2 === 0 ? RM - 1.6 : RM + 1.6);
        return `<ellipse cx="${x}" cy="${y}" rx="5" ry="2.3" fill="${i % 2 === 0 ? K.leaf : K.lime}" transform="rotate(${f1(a + 90 + (i % 2 === 0 ? -tilt : tilt))} ${x} ${y})"/>`;
      })
      .join('');
  return [
    // 1 solid
    ring(RM, 7, K.denim) + ring(41.2, 0.9, K.denimDeep) + shine(46),
    // 2 double
    ring(46.4, 3.2, K.lagoon) + ring(44, 1.8, '#fff') + ring(41.9, 2.6, K.lagoon),
    // 3 beaded
    ring(RM, 1.4, K.orchidDeep) +
      angles(0, 360, 20)
        .map((a) => {
          const [x, y] = at(a, RM);
          return dot(x, y, 3.2, K.orchid) + dot(f1(Number(x) - 1), f1(Number(y) - 1), 1, '#fff', ' opacity=".8"');
        })
        .join(''),
    // 4 scalloped
    angles(0, 360, 22.5)
      .map((a) => {
        const [x, y] = at(a, 45);
        return dot(x, y, 3, K.apricot);
      })
      .join('') +
      ring(43.4, 4.8, K.apricot) +
      ring(41.1, 0.9, K.apricotDeep),
    // 5 studded
    ring(RM, 7, K.gold) +
      ring(41.2, 0.9, K.goldDeep) +
      ring(47.8, 0.9, K.goldDeep) +
      angles(-90, 270, 45)
        .map((a, i) => {
          const [x, y] = at(a, RM);
          return dot(x, y, 3.2, gems[i % gems.length] as string, ` stroke="${K.goldDeep}" stroke-width=".8"`) + dot(f1(Number(x) - 1), f1(Number(y) - 1), 0.9, '#fff');
        })
        .join(''),
    // 6 laurel: two branches from the bottom up the sides, open at the top, a coral bow where they meet
    leaves(104, 256, 13, 22) +
      leaves(-76, 77, 13, 22) +
      `<path d="M50 96.6 43.6 92.2v8.4ZM50 96.6l6.4-4.4v8.4Z" fill="${K.coral}"/>` +
      dot('50', '96.6', 2, K.coral),
    // 7 starry
    ring(RM, 7, K.violet) +
      ring(41.2, 0.9, K.violetDeep) +
      angles(-90, 270, 45)
        .map((a) => {
          const [x, y] = at(a, RM);
          return star(Number(x), Number(y), 4.2, K.gold);
        })
        .join('') +
      angles(-67.5, 270, 45)
        .map((a) => {
          const [x, y] = at(a, RM);
          return dot(x, y, 0.9, '#fff');
        })
        .join(''),
  ];
}

/** A horizontal band y0 … y1 of the disc (no clip path: two chords and the disc's own arcs). */
function band(y0: number, y1: number, fill: string): string {
  const half = (y: number): number => Math.sqrt(Math.max(0, R * R - (y - CY) * (y - CY)));
  const a = half(y0);
  const b = half(y1);
  return `<path d="M${f1(CX - a)} ${f1(y0)}H${f1(CX + a)}A${R} ${R} 0 0 1 ${f1(CX + b)} ${f1(y1)}H${f1(CX - b)}A${R} ${R} 0 0 1 ${f1(CX - a)} ${f1(y0)}Z" fill="${fill}"/>`;
}

function backgrounds(): string[] {
  // polka: a staggered grid of dots, every one wholly inside the disc
  const polka: string[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const x = 8 + col * 13 + (row % 2) * 6.5;
      const y = 10 + row * 12;
      if (Math.hypot(x - CX, y - CY) <= R - 4) polka.push(dot(f1(x), f1(y), 2.8, '#fff', ' opacity=".85"'));
    }
  }
  const rays = angles(0, 360, 22.5)
    .map((a) => {
      const [x1, y1] = at(a, R);
      const [x2, y2] = at(a + 11.25, R);
      return `M${CX} ${CY}L${x1} ${y1}A${R} ${R} 0 0 1 ${x2} ${y2}Z`;
    })
    .join('');
  const rainbow = [K.coral, K.apricot, K.mustard, K.lime, K.sky, K.violet];
  return [
    // 1 sunny
    disc(K.sunny) + ring(38, 8, '#fff', ' opacity=".35"'),
    // 2 mint
    disc(K.mint) + disc(K.mintLight, 33),
    // 3 polka
    disc(K.rose) + polka.join(''),
    // 4 stripes
    disc(K.skyTint) + [12, 30, 48, 66, 84].map((y) => band(y, y + 7, K.skyLight)).join(''),
    // 5 night: a crescent between the ears, stars around the head
    disc(K.night) +
      dot('50', '17', 6.4, K.gold) +
      dot('53.4', '14.6', 5.6, K.night) +
      star(26, 24, 2.6, K.gold) +
      star(77, 30, 2.2, K.gold) +
      star(14, 62, 2, '#fff') +
      dot('86', '62', 1.2, '#fff') +
      dot('36', '12', 1, '#fff') +
      dot('66', '11', 1.1, '#fff') +
      dot('20', '80', 1, '#fff') +
      dot('82', '82', 1.3, '#fff'),
    // 6 sunburst
    disc(K.rays) + `<path d="${rays}" fill="${K.gold}"/>`,
    // 7 rainbow rings
    rainbow.map((c, i) => disc(c, R - i * 6)).join(''),
  ];
}

/** The frame and background symbols' markup (frame-1 …, bg-1 …). */
export function looksArtSymbols(): string {
  return [
    ...frames().map((body, i) => sym(`frame-${i + 1}`, '0 0 100 100', body)),
    ...backgrounds().map((body, i) => sym(`bg-${i + 1}`, '0 0 100 100', body)),
  ].join('');
}
