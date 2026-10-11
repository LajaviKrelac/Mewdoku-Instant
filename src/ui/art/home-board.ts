// Home redesign (2026-10-11): the Home background, drawn in the client (no image file). A seamless N × N grid of
// CELL px cells cut into irregular regions like a puzzle board, each region one in-game board colour with no two
// touching regions alike (also across the tile's edges, so it repeats without a seam), thin white cell lines, bold
// white region borders, and a few white X marks centred in their cells like the game's. A new seed on every Home
// visit draws a new board; screens.css .home__bg repeats the tile, turns it and slides it one tile, then loops.
import { PALETTE as BOARD, PALETTE_CORE } from './palette';

/** How much colour Home keeps of the board's (HSL saturation × this): calmer than the game, same hues. */
export const HOME_SATURATION = 0.55;

/** `hex` with its HSL saturation scaled by `k` (hue and lightness kept). */
export function desaturate(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return hex.toLowerCase();
  const s = (d / (1 - Math.abs(2 * l - 1))) * k;
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const [r1, g1, b1] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return `#${[r1, g1, b1].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** The in-game board colours, the 11 core ones (Cocoa only appears on 12 × 12 boards), desaturated for Home. */
export const HOME_COLOURS: readonly string[] = PALETTE_CORE.map((i) => desaturate(BOARD[i] as string, HOME_SATURATION));
/** Cells per tile side and the cell size in CSS px (N × CELL = tokens.css --home-tile). */
export const N = 10;
export const CELL = 72;
const REGIONS = 16;
const MARKS = 5;
/** Board colours (palette indexes) that read as one colour side by side: Orchid / Pink, Sky / Slate, Coral / Pink. */
const SIMILAR: readonly (readonly [number, number])[] = (
  [
    [8, 11],
    [6, 10],
    [0, 11],
  ] as const
).map(([a, b]) => [PALETTE_CORE.indexOf(a), PALETTE_CORE.indexOf(b)] as const);

/** mulberry32: a small seeded generator (the look only; nothing depends on it). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wrap = (v: number): number => (v + N) % N;
const nbrs = (i: number): number[] => {
  const x = i % N;
  const y = (i - x) / N;
  return [wrap(x + 1) + y * N, wrap(x - 1) + y * N, x + wrap(y + 1) * N, x + wrap(y - 1) * N];
};

/** Region id per cell: random seeds grown on the torus, one random frontier cell at a time (irregular blobs). */
export function regions(seed: number): number[] {
  const r = rng(seed);
  const cell = new Array<number>(N * N).fill(-1);
  let placed = 0;
  while (placed < REGIONS) {
    const i = Math.floor(r() * N * N);
    if (cell[i] === -1) cell[i] = placed++;
  }
  for (;;) {
    const frontier: [number, number][] = [];
    for (let i = 0; i < N * N; i++) if (cell[i] !== -1) for (const j of nbrs(i)) if (cell[j] === -1) frontier.push([i, j]);
    if (frontier.length === 0) return cell;
    const [from, to] = frontier[Math.floor(r() * frontier.length)] as [number, number];
    cell[to] = cell[from] as number;
  }
}

/** A colour (HOME_COLOURS index) per region: touching regions differ, near twins avoided, the least-used colour first. */
export function colours(cell: readonly number[], seed: number): number[] {
  const r = rng(seed + 1);
  const adj = new Map<number, Set<number>>();
  for (let i = 0; i < N * N; i++)
    for (const j of nbrs(i)) {
      const a = cell[i] as number;
      const b = cell[j] as number;
      if (a === b) continue;
      if (!adj.has(a)) adj.set(a, new Set());
      adj.get(a)?.add(b);
    }
  const out = new Array<number>(REGIONS).fill(-1);
  const used = new Array<number>(HOME_COLOURS.length).fill(0);
  for (let g = 0; g < REGIONS; g++) {
    const banned = new Set([...(adj.get(g) ?? [])].map((h) => out[h]));
    const all = HOME_COLOURS.map((_, k) => k).filter((k) => !banned.has(k));
    const ok = all.filter((k) => !SIMILAR.some(([a, b]) => (k === a && banned.has(b)) || (k === b && banned.has(a))));
    if (ok.length === 0) ok.push(...all);
    const jitter = ok.map(() => r());
    const order = ok.map((k, i) => [k, i] as const).sort(([p, i], [q, j]) => (used[p] as number) - (used[q] as number) || (jitter[i] as number) - (jitter[j] as number));
    const k = (order[0] as readonly [number, number])[0];
    out[g] = k;
    used[k] = (used[k] as number) + 1;
  }
  return out;
}

/** MARKS cells for the X marks, never side by side or diagonal (on the torus). */
export function markCells(seed: number): number[] {
  const r = rng(seed + 2);
  const out: number[] = [];
  for (let tries = 0; out.length < MARKS && tries < 500; tries++) {
    const i = Math.floor(r() * N * N);
    const x = i % N;
    const y = (i - x) / N;
    const near = out.some((j) => {
      const dx = Math.abs((j % N) - x);
      const dy = Math.abs(Math.floor(j / N) - y);
      return Math.min(dx, N - dx) <= 1 && Math.min(dy, N - dy) <= 1;
    });
    if (!near) out.push(i);
  }
  return out;
}

/** The tile as SVG markup (N × CELL px square). */
export function homeBoardSvg(seed: number): string {
  const cell = regions(seed);
  const col = colours(cell, seed);
  const S = N * CELL;
  const at = (x: number, y: number): number => cell[wrap(x) + wrap(y) * N] as number;
  // Fills: horizontal runs of one colour, one path per colour.
  const fills = HOME_COLOURS.map(() => '');
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; ) {
      const k = col[at(x, y)] as number;
      let e = x + 1;
      while (e < N && col[at(e, y)] === k) e++;
      fills[k] += `M${x * CELL} ${y * CELL}h${(e - x) * CELL}v${CELL}h-${(e - x) * CELL}z`;
      x = e;
    }
  // Region borders: merged runs of edges between regions. A stroke is centred on its edge, so an edge on the left or
  // top side is drawn again on the right or bottom side: each copy shows half, and they meet across the seam.
  let borders = '';
  for (let x = 0; x < N; x++)
    for (let y = 0; y < N; ) {
      if (at(x - 1, y) === at(x, y)) {
        y++;
        continue;
      }
      let e = y;
      while (e < N && at(x - 1, e) !== at(x, e)) e++;
      borders += `M${x * CELL} ${y * CELL}V${e * CELL}` + (x === 0 ? `M${S} ${y * CELL}V${e * CELL}` : '');
      y = e;
    }
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; ) {
      if (at(x, y - 1) === at(x, y)) {
        x++;
        continue;
      }
      let e = x;
      while (e < N && at(e, y - 1) !== at(e, y)) e++;
      borders += `M${x * CELL} ${y * CELL}H${e * CELL}` + (y === 0 ? `M${x * CELL} ${S}H${e * CELL}` : '');
      x = e;
    }
  // X marks: two rounded bars, centred in the cell (the game's X), with a soft drop shadow.
  const len = CELL * 0.56;
  const bar = CELL * 0.16;
  const xs = markCells(seed)
    .map((i) => `<use href='#x' x='${(i % N) * CELL + CELL / 2}' y='${Math.floor(i / N) * CELL + CELL / 2}'/>`)
    .join('');
  const half = (rot: number): string => `<rect x='${-len / 2}' y='${-bar / 2}' width='${len}' height='${bar}' rx='${bar / 2}' transform='rotate(${rot})'/>`;
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${S}' height='${S}'>` +
    `<defs><pattern id='g' width='${CELL}' height='${CELL}' patternUnits='userSpaceOnUse'><path d='M0 0H${CELL}M0 0V${CELL}' stroke='#fff' stroke-width='4' opacity='.5'/></pattern>` +
    `<g id='x'>${half(45)}${half(-45)}</g></defs>` +
    fills.map((d, k) => (d ? `<path fill='${HOME_COLOURS[k]}' d='${d}'/>` : '')).join('') +
    `<path fill='url(#g)' d='M0 0h${S}v${S}H0z'/>` +
    `<path d='${borders}' stroke='#fff' stroke-width='8' stroke-linecap='square' fill='none'/>` +
    `<g fill='rgba(0,0,0,.16)' transform='translate(1.5 2.5)'>${xs}</g><g fill='#fff'>${xs}</g></svg>`
  );
}

/** The tile as a CSS url() value. */
export function homeBoardUrl(seed: number): string {
  return `url("data:image/svg+xml,${encodeURIComponent(homeBoardSvg(seed))}")`;
}
