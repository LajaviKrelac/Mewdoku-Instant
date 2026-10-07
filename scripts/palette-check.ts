// Owner: ui-board
// Palette validation (02 §17.2, §18): pairwise CIEDE2000 ≥ 10, simulated deuteranopia/protanopia/
// tritanopia ΔE report, --ink X glyph ≥ 3:1 against every tile, and PALETTE_DE00 matches PALETTE.
// Run: npx tsx scripts/palette-check.ts [--quiet]. Exits non-zero when a hard check fails.
import { pathToFileURL } from 'node:url';
import { cfg } from '../src/app/config';
import { mixHex, PALETTE, PALETTE_DE00, PALETTE_SIZE, TOKENS } from '../src/ui/art/palette';

export type Lab = readonly [L: number, a: number, b: number];
export type CvdKind = 'deuteranopia' | 'protanopia' | 'tritanopia';

/** Hard thresholds (02 §17.2, §18). */
export const MIN_DE00 = 10;
export const MIN_CONTRAST = 3;
/** PALETTE_DE00 entries are ΔE × 100 rounded; allow one unit of rounding drift. */
const MATRIX_TOLERANCE = 1;

const NAMES = ['Strawberry', 'Apricot', 'Lemon', 'Lime', 'Mint', 'Lagoon', 'Sky', 'Lavender', 'Orchid', 'Cocoa', 'Slate', 'Moss'];

function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`bad hex colour: ${hex}`);
  const v = parseInt(m[1] as string, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function toHex(rgb: readonly number[]): string {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

function srgbToLinear(c8: number): number {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  const v = Math.max(0, Math.min(1, c));
  return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
}

/** sRGB (D65) → CIE L*a*b*. */
export function hexToLab(hex: string): Lab {
  const [r, g, b] = parseHex(hex).map(srgbToLinear) as [number, number, number];
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const e = (6 / 29) ** 3;
  const f = (t: number): number => (t > e ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const rad = (deg: number): number => (deg * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

function hueAngle(b: number, ap: number): number {
  if (b === 0 && ap === 0) return 0;
  const h = deg(Math.atan2(b, ap));
  return h < 0 ? h + 360 : h;
}

/** CIEDE2000 colour difference (kL = kC = kH = 1). */
export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar7 = ((C1 + C2) / 2) ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = hueAngle(b1, a1p);
  const h2p = hueAngle(b2, a2p);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
    else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos(rad(hbp - 30)) +
    0.24 * Math.cos(rad(2 * hbp)) +
    0.32 * Math.cos(rad(3 * hbp + 6)) -
    0.2 * Math.cos(rad(4 * hbp - 63));
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Cbp7 = Cbp ** 7;
  const Rc = 2 * Math.sqrt(Cbp7 / (Cbp7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  const l = dLp / Sl;
  const c = dCp / Sc;
  const h = dHp / Sh;
  return Math.sqrt(l * l + c * c + h * h + Rt * c * h);
}

/** Machado, Oliveira & Fernandes (2009) dichromacy matrices (severity 1.0), applied in linear RGB. */
const CVD: Readonly<Record<CvdKind, readonly (readonly [number, number, number])[]>> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

export function simulateCvd(hex: string, kind: CvdKind): string {
  const lin = parseHex(hex).map(srgbToLinear);
  const out = CVD[kind].map((row) => linearToSrgb(row[0] * (lin[0] as number) + row[1] * (lin[1] as number) + row[2] * (lin[2] as number)));
  return toHex(out);
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(srgbToLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours. */
export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** `fg` at `alpha` composited over `bg` (sRGB, as browsers blend). */
export function over(fg: string, bg: string, alpha: number): string {
  return mixHex(bg, fg, alpha);
}

export interface PairResult {
  readonly i: number;
  readonly j: number;
  readonly de: number;
}

export function pairwise(colors: readonly string[]): PairResult[] {
  const labs = colors.map(hexToLab);
  const out: PairResult[] = [];
  for (let i = 0; i < labs.length; i++) {
    for (let j = i + 1; j < labs.length; j++) out.push({ i, j, de: deltaE2000(labs[i] as Lab, labs[j] as Lab) });
  }
  return out.sort((a, b) => a.de - b.de);
}

/** Recomputed ΔE × 100 matrix (row-major), as stored in PALETTE_DE00. */
export function computeMatrix(colors: readonly string[]): number[] {
  const labs = colors.map(hexToLab);
  const out: number[] = [];
  for (const a of labs) for (const b of labs) out.push(Math.round(deltaE2000(a, b) * 100));
  return out;
}

export interface ContrastRow {
  readonly what: string;
  readonly tile: number;
  readonly faded: boolean;
  readonly ratio: number;
}

/** Glyph-vs-tile contrast for the X mark, cat outline and wrong-X, on normal and faded tiles. */
export function glyphContrast(): ContrastRow[] {
  const rows: ContrastRow[] = [];
  PALETTE.forEach((tileHex, tile) => {
    for (const faded of [false, true]) {
      const bg = faded ? mixHex(tileHex, TOKENS.page, cfg.fx.regionFadeMix) : tileHex;
      rows.push({ what: 'mark X (--ink @ markOpacity)', tile, faded, ratio: contrastRatio(over(TOKENS.ink, bg, cfg.layout.markOpacity), bg) });
      rows.push({ what: 'cat outline (--ink)', tile, faded, ratio: contrastRatio(TOKENS.ink, bg) });
      rows.push({ what: 'wrong X (--wrong)', tile, faded, ratio: contrastRatio(TOKENS.wrong, bg) });
    }
  });
  return rows;
}

const fmt = (v: number): string => v.toFixed(2);
const pairName = (p: PairResult): string => `${NAMES[p.i]}/${NAMES[p.j]}`;

export function main(argv: readonly string[]): void {
  const quiet = argv.includes('--quiet');
  const log = (s: string): void => {
    if (!quiet) console.log(s);
  };
  const failures: string[] = [];

  if (PALETTE.length !== PALETTE_SIZE) failures.push(`PALETTE has ${PALETTE.length} colours, expected ${PALETTE_SIZE}`);

  // 1. PALETTE_DE00 must match PALETTE.
  const matrix = computeMatrix(PALETTE);
  let worst = 0;
  matrix.forEach((v, k) => (worst = Math.max(worst, Math.abs(v - (PALETTE_DE00[k] ?? Number.NaN)))));
  if (PALETTE_DE00.length !== matrix.length || !(worst <= MATRIX_TOLERANCE)) {
    failures.push(`PALETTE_DE00 is stale (max drift ${worst}); paste the recomputed matrix:\n${JSON.stringify(matrix)}`);
  }
  log(`ΔE matrix: ${PALETTE_DE00.length === matrix.length && worst <= MATRIX_TOLERANCE ? 'matches' : 'MISMATCH'} (max drift ${worst})`);

  // 2. Pairwise CIEDE2000 ≥ 10.
  const pairs = pairwise(PALETTE);
  const minPair = pairs[0] as PairResult;
  log(`Pairwise ΔE00 min ${fmt(minPair.de)} (${pairName(minPair)}), threshold ${MIN_DE00}`);
  for (const p of pairs.filter((q) => q.de < MIN_DE00)) failures.push(`ΔE00 ${pairName(p)} = ${fmt(p.de)} < ${MIN_DE00}`);

  // 3. Colour-vision deficiency report (informational: Colour patterns compensate, 02 §18).
  for (const kind of Object.keys(CVD) as CvdKind[]) {
    const sim = pairwise(PALETTE.map((hex) => simulateCvd(hex, kind)));
    const low = sim.filter((q) => q.de < MIN_DE00);
    log(`${kind.padEnd(13)} min ΔE00 ${fmt((sim[0] as PairResult).de)}; ${low.length} pair(s) < ${MIN_DE00}${low.length ? `: ${low.map((q) => `${pairName(q)} ${fmt(q.de)}`).join(', ')}` : ''}`);
  }
  log('  (pairs below the threshold rely on region-aware gaps and the Colour patterns glyphs)');

  // 4. Non-text contrast of the glyphs on every tile, normal and faded (WCAG 1.4.11).
  const rows = glyphContrast();
  const byWhat = new Map<string, ContrastRow>();
  for (const r of rows) {
    const cur = byWhat.get(r.what);
    if (!cur || r.ratio < cur.ratio) byWhat.set(r.what, r);
    if (r.ratio < MIN_CONTRAST) failures.push(`${r.what} on ${NAMES[r.tile]}${r.faded ? ' (faded)' : ''}: ${fmt(r.ratio)}:1 < ${MIN_CONTRAST}:1`);
  }
  for (const [what, r] of byWhat) log(`${what.padEnd(30)} min ${fmt(r.ratio)}:1 on ${NAMES[r.tile]}${r.faded ? ' (faded)' : ''}`);

  if (failures.length) {
    console.error(`palette-check: ${failures.length} failure(s)`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exitCode = 1;
    return;
  }
  log('palette-check: OK');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
