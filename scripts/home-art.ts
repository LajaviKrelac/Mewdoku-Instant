// Home redesign (2026-10-11): generates the Home background tile (tokens.css --home-art).
// A seamless N × N grid of CELL px cells cut into irregular regions (like a puzzle board), each region one colour
// of the in-game board palette with no two touching regions alike (also across the tile's edges, so it repeats without a
// seam), thin white cell lines, bold white region borders and a few white sticker crosses. Deterministic (SEED).
// Run: npx tsx scripts/home-art.ts  → prints the --home-art declaration to paste into src/styles/tokens.css.
import { pathToFileURL } from 'node:url';
import { PALETTE as BOARD, PALETTE_CORE } from '../src/ui/art/palette';

/** The in-game board colours (palette.ts), the 11 core ones: Cocoa only appears on 12 × 12 boards. */
export const PALETTE = PALETTE_CORE.map((i) => (BOARD[i] as string).toLowerCase());
export const N = 10;
export const CELL = 72;
const REGIONS = 16;
const SEED = 7;
/** Board colours (palette.ts indexes) that read as one colour side by side: Orchid / Pink, Sky / Slate, Coral / Pink. */
const SIMILAR: [number, number][] = (
  [
    [8, 11],
    [6, 10],
    [0, 11],
  ] as const
).map(([a, b]) => [PALETTE_CORE.indexOf(a), PALETTE_CORE.indexOf(b)]);

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

/** Region id per cell: random seeds grown on the torus, a random frontier cell at a time (irregular blobs). */
export function regions(seed = SEED): number[] {
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

/** A colour per region: touching regions differ; the least-used colour wins ties, so every colour shows. */
export function colours(cell: number[], seed = SEED): number[] {
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
  const used = new Array<number>(PALETTE.length).fill(0);
  for (let g = 0; g < REGIONS; g++) {
    const banned = new Set([...(adj.get(g) ?? [])].map((h) => out[h]));
    const all = PALETTE.map((_, k) => k).filter((k) => !banned.has(k));
    // Prefer no near twin next door (SIMILAR), when the neighbours leave a choice.
    const ok = all.filter((k) => !SIMILAR.some(([a, b]) => (k === a && banned.has(b)) || (k === b && banned.has(a))));
    if (ok.length === 0) ok.push(...all);
    ok.sort((p, q) => (used[p] as number) - (used[q] as number) || r() - 0.5);
    const k = ok[0] as number;
    out[g] = k;
    used[k] = (used[k] as number) + 1;
  }
  return out;
}

export function tileSvg(seed = SEED): string {
  const cell = regions(seed);
  const col = colours(cell, seed);
  const S = N * CELL;
  const at = (x: number, y: number): number => cell[wrap(x) + wrap(y) * N] as number;
  // Fills: horizontal runs of one colour, one path per colour.
  const fills = PALETTE.map(() => '');
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      const k = col[at(x, y)] as number;
      let e = x + 1;
      while (e < N && col[at(e, y)] === k) e++;
      fills[k] += `M${x * CELL} ${y * CELL}h${(e - x) * CELL}v${CELL}h-${(e - x) * CELL}z`;
      x = e;
    }
  }
  // Region borders: merged runs of edges between different regions. A stroke is centred on its edge, so an edge on
  // the tile's left or top side is drawn again on the right or bottom side: each copy shows half, and they meet.
  let borders = '';
  const vRun = (x: number, y0: number, y1: number): void => {
    borders += `M${x * CELL} ${y0 * CELL}V${y1 * CELL}`;
    if (x === 0) borders += `M${S} ${y0 * CELL}V${y1 * CELL}`;
  };
  const hRun = (y: number, x0: number, x1: number): void => {
    borders += `M${x0 * CELL} ${y * CELL}H${x1 * CELL}`;
    if (y === 0) borders += `M${x0 * CELL} ${S}H${x1 * CELL}`;
  };
  for (let x = 0; x < N; x++)
    for (let y = 0; y < N; ) {
      if (at(x - 1, y) === at(x, y)) {
        y++;
        continue;
      }
      let e = y;
      while (e < N && at(x - 1, e) !== at(x, e)) e++;
      vRun(x, y, e);
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
      hRun(y, x, e);
      x = e;
    }
  const cross = (x: number, y: number, rot: number): string => `<use href='#p' transform='translate(${x} ${y}) rotate(${rot})'/>`;
  const crosses: [number, number, number][] = [
    [S * 0.19, S * 0.69, 12],
    [S * 0.81, S * 0.31, -8],
    [S * 0.44, S * 0.06, 20],
  ];
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${S}' height='${S}'>` +
    `<defs><pattern id='g' width='${CELL}' height='${CELL}' patternUnits='userSpaceOnUse'><path d='M0 0H${CELL}M0 0V${CELL}' stroke='#fff' stroke-width='4' opacity='.5'/></pattern>` +
    `<g id='p'><rect x='-27' y='-9' width='54' height='18' rx='9'/><rect x='-9' y='-27' width='18' height='54' rx='9'/></g></defs>` +
    fills.map((d, k) => (d ? `<path fill='${PALETTE[k]}' d='${d}'/>` : '')).join('') +
    `<path fill='url(#g)' d='M0 0h${S}v${S}H0z'/>` +
    `<path d='${borders}' stroke='#fff' stroke-width='8' stroke-linecap='square' fill='none'/>` +
    `<g fill='rgba(0,0,0,.16)' transform='translate(2 3)'>${crosses.map((c) => cross(...c)).join('')}</g>` +
    `<g fill='#fff'>${crosses.map((c) => cross(...c)).join('')}</g></svg>`
  );
}

export const dataUri = (svg: string): string => `url("data:image/svg+xml,${svg.replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')}")`;

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const svg = tileSvg();
  if (process.argv[2]) (await import('node:fs')).writeFileSync(process.argv[2], svg);
  console.log(`  --home-art: ${dataUri(svg)};`);
}
