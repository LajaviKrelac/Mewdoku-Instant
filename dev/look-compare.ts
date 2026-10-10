// Owner: lead (Phase 2d I-1; look-spec §5.4)
// Visual acceptance against the user's recording (look-spec §5.4). Not shipped, not a test.
//
// It builds nothing: it drives the BUILT e2e app (`npm run build:e2e`, dist/e2e) with Playwright, puts
// our level 96 (10 × 10) in the recording's state at 402 × 874, DSF 3 (safe areas 62 / 34 through the
// --dev-safe-* override, ?ads=ok so the banner band and the mock banner show, 2 hints, 2 kitties, 3
// fish, Score 0, X marks on row 0 columns 0–4, Settings never opened), measures every §5.4 item from
// DOM rects and from the pixels of the screenshot, and prints them beside the original's numbers
// (`measure.md`, the lead's measurement of the recording; the numbers are repeated below as REF).
//
// Clean room (look-spec §0.2, D-2d-0 d): the reference images are read ONLY from the folder named by
// the environment, never from the repo; composites with them are written ONLY to the scratch folder
// LOOK_SCRATCH. The repo gets our side alone (docs/phase2d/screenshots/<prefix>-*.png).
//
//   MEWDOKU_ORIG_REF=<folder with still.png>            optional: like-for-like pixel measures + composites
//   MEWDOKU_ORIG_FRAMES=<folder with t2.400-cc.png, t3.200-cc.png>   default: MEWDOKU_ORIG_REF
//   LOOK_SCRATCH=<scratch folder>                        required with MEWDOKU_ORIG_REF (composites, report)
//   npx tsx dev/look-compare.ts [--url http://127.0.0.1:4173] [--out docs/phase2d/screenshots]
//                               [--prefix INT] [--no-sizes] [--no-shots]
// Without --url it serves dist/e2e itself (vite preview --mode e2e on port 4993) and stops it after.
// PLAYWRIGHT_BROWSERS_PATH must point at the installed browsers (never `playwright install` here).
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { chromium, type Browser, type Page } from '@playwright/test';
import { deltaE2000, hexToLab } from '../scripts/palette-check';
import { defaults } from '../src/game/save';
import { periodKeyAt } from '../src/game/scoring';
import type { LocaleId } from '../src/app/config';
import type { SaveData } from '../src/game/types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name: string): string | null => {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};
const OUT = resolve(ROOT, arg('--out') ?? 'docs/phase2d/screenshots');
const PREFIX = arg('--prefix') ?? 'INT';
const SIZES = !argv.includes('--no-sizes');
const SHOTS = !argv.includes('--no-shots');
const REF_DIR = process.env.MEWDOKU_ORIG_REF ?? null;
const FRAMES_DIR = process.env.MEWDOKU_ORIG_FRAMES ?? REF_DIR;
const SCRATCH = process.env.LOOK_SCRATCH ?? null;
if (REF_DIR && !SCRATCH) throw new Error('look-compare: set LOOK_SCRATCH (a scratch folder outside the repo) to compare with MEWDOKU_ORIG_REF');
if (SCRATCH && resolve(SCRATCH).startsWith(ROOT)) throw new Error('look-compare: LOOK_SCRATCH must be outside the repo (D-2d-0 d)');
if (REF_DIR && resolve(REF_DIR).startsWith(ROOT)) throw new Error('look-compare: MEWDOKU_ORIG_REF must be outside the repo (D-2d-0 d)');

/** Image px per CSS px: the recording is an iPhone at 3×, our screenshots are taken at DSF 3. */
const S = 3;

// ─────────────────────────────── the original's numbers (measure.md, 402 × 874, CSS px) ───────────────────────────────

const REF = {
  back: { cx: 31.5, cy: 88.0, d: 36.8 },
  gear: { cx: 370.0, cy: 88.0, d: 36.8 },
  dot: { cx: 384.8, cy: 73.3, d: 11.3 },
  levelX: 149.5,
  scoreX: 252.0,
  labelTop: 66.3,
  labelBase: 80.0,
  numTop: 88.0,
  numBase: 103.3,
  heads: { left: 12.0, right: 282.0, top: 124.3, bottom: 155.7, first: 22.3, last: 271.0, w: 21.3, h: 21.7, pitch: 25.33 },
  fish: { left: 293.3, right: 390.0, first: 304.0, last: 379.7, w: 24.7, h: 23.3, pitch: 25.3 },
  rules: { left: 13.3, right: 388.7, top: 164.0, bottom: 224.3 },
  cards: { lefts: [21.0, 143.3, 265.7], top: 172.3, bottom: 217.0, w: 115.7, h: 44.7 },
  board: { left: 5.67, right: 396.33, top: 250.0, bottom: 641.0 },
  tile: { left: 12.33, top: 256.33, size: 35.0, gap: 3.0, radius: 3.83 },
  x: { bar: 6.9, box: 21.5 },
  helpers: { cxs: [98.8, 202.0, 305.0], cy: 724.0, d: 60.3, top: 694.0 },
  icons: { kitty: [34.7, 34.3], bulb: [21.3, 34.0], mouse: [35.0, 31.3] },
  badge: { w: 28.0, h: 21.3, dx: 26.0, dy: -28.3 },
  video: { w: 35.3, h: 21.0, dx: 25.7, dy: -28.8 },
  banner: { left: 41, right: 361, top: 777.7, bottom: 827.7 },
  colours: { page: '#F7F2EF', card: '#FFFFFF', ink: '#935A5A', icon: '#996767' },
  /** Palette index → the colour measured on the PNG still (look-spec §1.9). */
  tiles: { 0: '#D57374', 1: '#FFAA6D', 2: '#E4BB49', 3: '#AED994', 5: '#48B5B2', 6: '#6BBCE7', 7: '#9778D6', 8: '#EB85B7', 10: '#A7BFD7', 11: '#FAB4D0' } as Record<number, string>,
  /** The original's level 96 (measure.md §7), for sampling its tiles: letter → palette index. */
  regionMap: ['AAAAABBBBB', 'AAACACCDDD', 'EEFCAACDCC', 'EEFCGGCDDC', 'EEFCGGCCCC', 'EEFCHHHHCC', 'EFFCHIIICC', 'FFFCHICICC', 'JJJCHICICC', 'JJJCCCCCCC'],
  letters: { A: 0, B: 7, C: 5, D: 3, E: 11, F: 1, G: 6, H: 8, I: 2, J: 10 } as Record<string, number>,
  /** Pulse peak (measure.md §11.1): disc Ø at the peak, the glow at the disc edge. */
  peak: { d: 65.3, glowEdge: '#F7C880' },
} as const;

// ─────────────────────────────── PNG (8-bit RGB / RGBA, non-interlaced) ───────────────────────────────

interface Img {
  readonly w: number;
  readonly h: number;
  /** RGB, 3 bytes a pixel. */
  readonly data: Uint8Array;
}

function decodePng(buf: Buffer): Img {
  let p = 8;
  let w = 0;
  let h = 0;
  let ct = 0;
  let depth = 0;
  let lace = 0;
  const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    const body = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      depth = body[8] as number;
      ct = body[9] as number;
      lace = body[12] as number;
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || (ct !== 2 && ct !== 6) || lace !== 0) throw new Error(`look-compare: unsupported PNG (depth ${depth}, colour type ${ct}, interlace ${lace})`);
  const ch = ct === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)] as number;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? (px[dst + x - ch] as number) : 0;
      const b = y > 0 ? (px[dst - stride + x] as number) : 0;
      const c = x >= ch && y > 0 ? (px[dst - stride + x - ch] as number) : 0;
      let v = raw[src + x] as number;
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const q = a + b - c;
        const pa = Math.abs(q - a);
        const pb = Math.abs(q - b);
        const pc = Math.abs(q - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[dst + x] = v & 255;
    }
  }
  if (ch === 3) return { w, h, data: px };
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; i < px.length; i += 4, j += 3) {
    // Our screenshots are opaque; composite any alpha over white.
    const al = (px[i + 3] as number) / 255;
    for (let k = 0; k < 3; k++) rgb[j + k] = Math.round((px[i + k] as number) * al + 255 * (1 - al));
  }
  return { w, h, data: rgb };
}

function encodePng(img: Img): Buffer {
  const stride = img.w * 3;
  const raw = Buffer.alloc((stride + 1) * img.h);
  for (let y = 0; y < img.h; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(img.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const chunk = (type: string, body: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type, 'latin1'), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(tb) >>> 0);
    return Buffer.concat([len, tb, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0);
  ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

// ─────────────────────────────── pixel helpers (CSS px in, image px inside) ───────────────────────────────

type RGB = readonly [number, number, number];
interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const at = (img: Img, x: number, y: number): RGB => {
  const xi = Math.min(img.w - 1, Math.max(0, Math.round(x)));
  const yi = Math.min(img.h - 1, Math.max(0, Math.round(y)));
  const i = (yi * img.w + xi) * 3;
  return [img.data[i] as number, img.data[i + 1] as number, img.data[i + 2] as number];
};
const hex = (c: RGB): string => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const lum = (c: RGB): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const de = (a: string, b: string): number => deltaE2000(hexToLab(a), hexToLab(b));
const hexRgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Every image pixel of a CSS box. */
function* pixels(img: Img, b: Box): Generator<{ x: number; y: number; c: RGB }> {
  const x0 = Math.max(0, Math.floor(b.left * S));
  const x1 = Math.min(img.w - 1, Math.ceil(b.right * S) - 1);
  const y0 = Math.max(0, Math.floor(b.top * S));
  const y1 = Math.min(img.h - 1, Math.ceil(b.bottom * S) - 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) yield { x, y, c: at(img, x, y) };
}

function median(cs: RGB[]): RGB {
  if (!cs.length) return [0, 0, 0];
  const m = (k: 0 | 1 | 2): number => {
    const v = cs.map((c) => c[k]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)] as number;
  };
  return [m(0), m(1), m(2)];
}

/** Median of the darkest `share` of a box's pixels (the anti-aliased core of text and icons, measure.md §0). */
function darkCore(img: Img, b: Box, share: number, skip?: (c: RGB) => boolean): RGB {
  const cs = [...pixels(img, b)].map((p) => p.c).filter((c) => !skip?.(c));
  cs.sort((a, b2) => lum(a) - lum(b2));
  return median(cs.slice(0, Math.max(1, Math.round(cs.length * share))));
}

/** Text ink between page and ink colour: its bbox (CSS px) and the mean stroke width 2·area / perimeter (CSS px). */
function inkStats(img: Img, b: Box, ink: RGB, bg: RGB): { box: Box; stroke: number; ratio: number } | null {
  const d = [bg[0] - ink[0], bg[1] - ink[1], bg[2] - ink[2]] as const;
  const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const x0 = Math.floor(b.left * S);
  const y0 = Math.floor(b.top * S);
  const W = Math.ceil(b.right * S) - x0;
  const H = Math.ceil(b.bottom * S) - y0;
  const mask = new Uint8Array(W * H);
  let area = 0;
  let bx0 = Infinity;
  let by0 = Infinity;
  let bx1 = -Infinity;
  let by1 = -Infinity;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = at(img, x0 + x, y0 + y);
      const a = Math.min(1, Math.max(0, ((bg[0] - c[0]) * d[0] + (bg[1] - c[1]) * d[1] + (bg[2] - c[2]) * d[2]) / dd));
      area += a;
      if (a > 0.5) {
        mask[y * W + x] = 1;
        bx0 = Math.min(bx0, x);
        bx1 = Math.max(bx1, x);
        by0 = Math.min(by0, y);
        by1 = Math.max(by1, y);
      }
    }
  if (bx1 < 0) return null;
  let per = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const m = mask[y * W + x] as number;
      if (x + 1 < W && m !== mask[y * W + x + 1]) per++;
      if (y + 1 < H && m !== mask[(y + 1) * W + x]) per++;
    }
  const box = { left: (x0 + bx0) / S, top: (y0 + by0) / S, right: (x0 + bx1 + 1) / S, bottom: (y0 + by1 + 1) / S };
  const stroke = per > 0 ? (2 * area) / per / S : 0;
  return { box, stroke, ratio: stroke / (box.bottom - box.top) };
}

/** Blobs of a row of shapes in a box, split by ink-free columns (and at the thinnest column when they touch). */
function blobs(img: Img, b: Box, isInk: (c: RGB) => boolean, expect: number): Box[] {
  const x0 = Math.floor(b.left * S);
  const y0 = Math.floor(b.top * S);
  const W = Math.ceil(b.right * S) - x0;
  const H = Math.ceil(b.bottom * S) - y0;
  const count = new Array<number>(W).fill(0);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (isInk(at(img, x0 + x, y0 + y))) count[x] = (count[x] as number) + 1;
  let runs: [number, number][] = [];
  for (let x = 0; x < W; x++) {
    if (!count[x]) continue;
    const last = runs[runs.length - 1];
    if (last && last[1] === x - 1) last[1] = x;
    else runs.push([x, x]);
  }
  runs = runs.filter(([a, c]) => c - a >= 6);
  while (runs.length < expect && runs.length > 0) {
    const widest = runs.reduce((m, r) => (r[1] - r[0] > m[1] - m[0] ? r : m));
    const lo = widest[0] + Math.round((widest[1] - widest[0]) * 0.3);
    const hi = widest[0] + Math.round((widest[1] - widest[0]) * 0.7);
    let cut = lo;
    for (let x = lo; x <= hi; x++) if ((count[x] as number) < (count[cut] as number)) cut = x;
    runs.splice(runs.indexOf(widest), 1, [widest[0], cut - 1], [cut + 1, widest[1]]);
    runs.sort((a, c) => a[0] - c[0]);
  }
  return runs.map(([a, c]) => {
    let top = H;
    let bottom = -1;
    for (let x = a; x <= c; x++)
      for (let y = 0; y < H; y++)
        if (isInk(at(img, x0 + x, y0 + y))) {
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
    return { left: (x0 + a) / S, right: (x0 + c + 1) / S, top: (y0 + top) / S, bottom: (y0 + bottom + 1) / S };
  });
}

/** The art inside a round helper disc: non-white pixels within 0.46 d of the centre, outside the badge box. */
function discArt(img: Img, cx: number, cy: number, d: number, badge: Box | null): Box | null {
  let bb: Box | null = null;
  const r = 0.46 * d;
  for (const p of pixels(img, { left: cx - r, top: cy - r, right: cx + r, bottom: cy + r })) {
    const x = p.x / S;
    const y = p.y / S;
    if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
    if (badge && x >= badge.left - 1.5 && x <= badge.right + 1.5 && y >= badge.top - 1.5 && y <= badge.bottom + 1.5) continue;
    if (Math.abs(255 - p.c[0]) + Math.abs(255 - p.c[1]) + Math.abs(255 - p.c[2]) <= 45) continue;
    bb = bb
      ? { left: Math.min(bb.left, x), top: Math.min(bb.top, y), right: Math.max(bb.right, x + 1 / S), bottom: Math.max(bb.bottom, y + 1 / S) }
      : { left: x, top: y, right: x + 1 / S, bottom: y + 1 / S };
  }
  return bb;
}

/**
 * A round button's shadow below it: the page minus the pixel, summed over the channels, image px by
 * image px from the disc's bottom edge down (measure.md m_helpers). Returns the summed deviation of
 * the first 10 CSS px ("strength"), where it falls under 6 ("reach", CSS px) and the colour 2 CSS px
 * below the edge.
 */
function shadowBelow(img: Img, cx: number, cy: number, d: number, page: RGB): { strength: number; reach: number; at2: string; warmth: number } {
  // From the disc's own bottom edge in the pixels (a composited, animated disc may sit a pixel off its
  // DOM rect): the first image row below the white disc.
  let ys = Math.round((cy + d / 2 - 2) * S);
  const isDisc = (y: number): boolean => {
    const c = at(img, cx * S, y);
    return 765 - c[0] - c[1] - c[2] < 15;
  };
  while (ys < Math.round((cy + d / 2 + 2) * S) && isDisc(ys)) ys++;
  const devs: number[] = [];
  let warm = 0;
  for (let k = 0; k < 45; k++) {
    const c = at(img, cx * S, ys + k);
    devs.push(page[0] - c[0] + (page[1] - c[1]) + (page[2] - c[2]));
    if (k < 30) warm += page[2] - c[2] - (page[0] - c[0]);
  }
  const reachIdx = devs.findIndex((v, i) => i > 2 && v < 6);
  if (process.env.LOOK_DEBUG) console.error(`shadow @${cx.toFixed(1)},${cy.toFixed(1)}: ${devs.slice(0, 30).join(' ')}`);
  return {
    strength: Math.round(devs.slice(0, 30).reduce((a, v) => a + Math.max(0, v), 0)),
    reach: Math.round(((reachIdx < 0 ? 45 : reachIdx) / S) * 10) / 10,
    at2: hex(at(img, cx * S, ys + 2 * S)),
    warmth: Math.round(warm),
  };
}

// ─────────────────────────────── the app ───────────────────────────────

type TestWindow = Window & { __mewdoku?: { app(): { screen: string }; state(): { status: string } | null; seedSave(json: string): void } };

const NOW = Date.now();
/** Level 96 (10 × 10) as in the recording: a returning player with 2 hints and 2 kitties, Settings never opened. */
function recordingSave(locale?: LocaleId): SaveData {
  const base = defaults(NOW - 3 * 86_400_000);
  const key = periodKeyAt(NOW);
  const save: SaveData = {
    ...base,
    tutorialDone: true,
    sessions: 4,
    progress: { level: 96, completed: 95, best: {} },
    period: { key, total: 39, bestKey: key, bestTotal: 39 },
    stock: { hints: 2, kitties: 2 },
  };
  return locale ? { ...save, settings: { ...save.settings, locale } } : save;
}

async function ready(page: Page, screen?: string): Promise<void> {
  await page.waitForFunction(
    (want) => {
      const app = (window as TestWindow).__mewdoku?.app();
      return !!app && app.screen !== 'boot' && (!want || app.screen === want);
    },
    screen ?? null,
    { timeout: 20_000 },
  );
}

interface Scene {
  readonly name: string;
  readonly vw: number;
  readonly vh: number;
  readonly dsf: number;
  readonly safe?: readonly [number, number];
  readonly locale?: LocaleId;
}

/** Opens the game screen in the recording's state and returns the page (toast gone, pulse paused at rest). */
async function openRecording(browser: Browser, base: string, sc: Scene): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: sc.vw, height: sc.vh }, deviceScaleFactor: sc.dsf, hasTouch: sc.vw < 800, isMobile: sc.vw < 800 });
  // tsx keeps function names with an `__name` helper that page.evaluate's serialised functions call.
  await ctx.addInitScript({ content: 'window.__name = (f) => f;' });
  const page = await ctx.newPage();
  await page.goto(`${base}/?ads=ok`);
  await ready(page);
  await page.evaluate((json) => (window as TestWindow).__mewdoku?.seedSave(json), JSON.stringify(recordingSave(sc.locale)));
  await page.reload();
  await ready(page, 'home');
  if (sc.safe) {
    await page.addStyleTag({ content: `:root{--dev-safe-top:${sc.safe[0]}px;--dev-safe-bottom:${sc.safe[1]}px}` });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  }
  await page.locator('.home__play').click();
  await page.waitForFunction(() => (window as TestWindow).__mewdoku?.state()?.status === 'playing', null, { timeout: 20_000 });
  await page.waitForTimeout(1200);
  for (let c = 0; c < 5; c++) await page.locator('.cell').nth(c).click();
  await page.waitForTimeout(400);
  // The recording's frame t2.400 is after the start toast has drifted off (§1.14).
  await page.waitForFunction(() => document.querySelectorAll('.start-toast').length === 0, null, { timeout: 10_000 });
  await pulseAt(page, 0);
  return page;
}

/** Pauses every helper animation at `ms` of its cycle (0: rest; 480: the peak, 32 % of 1.5 s). */
async function pulseAt(page: Page, ms: number): Promise<void> {
  await page.evaluate((t) => {
    for (const a of document.getAnimations()) {
      const el = (a.effect as KeyframeEffect | null)?.target as Element | null;
      if (el?.closest('.tool')) {
        a.pause();
        a.currentTime = t;
      }
    }
  }, ms);
  await page.waitForTimeout(150);
}

/** Every DOM rect and style the §5.4 checks need (CSS px). */
const dom = (page: Page) =>
  page.evaluate(() => {
    const R = (el: Element | null): Box | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const q = (s: string): Element | null => document.querySelector(s);
    const all = (s: string): Element[] => Array.from(document.querySelectorAll(s));
    const fs = (s: string): { size: number; weight: string } => {
      const el = q(s);
      const cs = el ? getComputedStyle(el) : null;
      return { size: cs ? parseFloat(cs.fontSize) : 0, weight: cs?.fontWeight ?? '' };
    };
    const tiles = all('.cell').map((c) => {
      const tile = c.querySelector('.cell__tile') as HTMLElement | null;
      const m = /--r(\d+)/.exec(tile?.style.getPropertyValue('--c') ?? '');
      return { s: (c as HTMLElement).dataset.s ?? '', color: m ? Number(m[1]) : -1, box: R(tile) };
    });
    const tile0 = q('.cell__tile');
    const xs = all('.cell')[0]?.querySelectorAll('rect.cell__x') ?? [];
    const xr = Array.from(xs).map((r) => R(r) as Box);
    const xbar = xs[0] ? Number(xs[0].getAttribute('height')) : 0;
    const xa = (k: string): number => Number(xs[0]?.getAttribute(k) ?? 0);
    const tools = ['paw', 'bulb', 'mouse'].map((k) => ({
      disc: R(q(`.tool--${k} .tool__disc`)),
      icon: R(q(`.tool--${k} .tool__icon`)),
      badge: (q(`.tool--${k} .tool__badge`) as HTMLElement | null)?.hidden ? null : R(q(`.tool--${k} .tool__badge`)),
    }));
    return {
      back: R(q('.top-bar--game .top-bar__btn--back')),
      gear: R(q('.top-bar--game .top-bar__btn--settings')),
      dot: R(q('.top-bar--game .top-bar__dot')),
      level: R(q('.top-bar__text')),
      levelName: R(q('.top-bar__name')),
      levelNum: R(q('.top-bar__suffix')),
      score: R(q('.top-bar--game .points-pill')),
      scoreName: R(q('.points-pill__name')),
      scoreNum: R(q('.points-pill__n')),
      fontLabel: fs('.top-bar__name'),
      fontNum: fs('.top-bar__suffix'),
      heads: R(q('.pill--heads')),
      headEls: all('.pill--heads .head').map(R),
      lives: R(q('.pill--lives')),
      lifeEls: all('.pill--lives .life__full').map(R),
      rules: R(q('.rule-chips')),
      cards: all('.rule-chips .chip').map(R),
      board: R(q('.board')),
      tiles,
      tileRadius: tile0 ? parseFloat(getComputedStyle(tile0).borderTopLeftRadius) : 0,
      slot: parseFloat((q('.board') as HTMLElement | null)?.style.getPropertyValue('--slot') ?? '0'),
      xRects: xr,
      xBarUnits: xbar,
      xRect: { w: xa('width'), h: xa('height'), rx: xa('rx') },
      tools,
      banner: R(q('[data-testid="mock-banner"]')),
    };
  });

type Dom = Awaited<ReturnType<typeof dom>>;

// ─────────────────────────────── the report ───────────────────────────────

interface Row {
  readonly group: string;
  readonly item: string;
  readonly ours: string;
  readonly ref: string;
  readonly diff: string;
  readonly verdict: 'pass' | 'FAIL' | 'info';
}
const rows: Row[] = [];
const f1 = (v: number): string => (Number.isFinite(v) ? v.toFixed(1) : '—');
const f2 = (v: number): string => (Number.isFinite(v) ? v.toFixed(2) : '—');
function num(group: string, item: string, ours: number, ref: number, tol: number | null): void {
  const d = ours - ref;
  rows.push({ group, item, ours: f1(ours), ref: f1(ref), diff: (d >= 0 ? '+' : '') + f1(d), verdict: tol === null ? 'info' : Math.abs(d) <= tol + 1e-9 ? 'pass' : 'FAIL' });
}
function colour(group: string, item: string, ours: string, ref: string, tol: number | null): void {
  const d = de(ours, ref);
  rows.push({ group, item, ours, ref, diff: `ΔE00 ${f2(d)}`, verdict: tol === null ? 'info' : d <= tol ? 'pass' : 'FAIL' });
}
function info(group: string, item: string, ours: string, ref: string, diff = ''): void {
  rows.push({ group, item, ours, ref, diff, verdict: 'info' });
}

const cx = (b: Box): number => (b.left + b.right) / 2;
const cy = (b: Box): number => (b.top + b.bottom) / 2;
const w = (b: Box): number => b.right - b.left;
const h = (b: Box): number => b.bottom - b.top;
const must = (b: Box | null | undefined, what: string): Box => {
  if (!b) throw new Error(`look-compare: ${what} not found`);
  return b;
};

/** The §5.4 pass criteria and the polish measures, from our DOM and pixels (and the reference's pixels when given). */
function measure402(g: Dom, ours: Img, ref: { frame: Img | null; still: Img | null; peakOurs: Img | null; peakRef: Img | null }): void {
  const T = 2;
  // ── bar ──
  const back = must(g.back, 'back disc');
  const gear = must(g.gear, 'gear disc');
  num('bar', 'back disc centre x', cx(back), REF.back.cx, T);
  num('bar', 'back disc centre y', cy(back), REF.back.cy, T);
  num('bar', 'back disc Ø', w(back), REF.back.d, T);
  num('bar', 'gear disc centre x', cx(gear), REF.gear.cx, T);
  num('bar', 'gear disc centre y', cy(gear), REF.gear.cy, T);
  num('bar', 'gear disc Ø', w(gear), REF.gear.d, T);
  const dot = must(g.dot, 'settings dot');
  num('bar', 'dot centre x', cx(dot), REF.dot.cx, T);
  num('bar', 'dot centre y', cy(dot), REF.dot.cy, T);
  num('bar', 'dot Ø', w(dot), REF.dot.d, T);
  num('bar', 'Level column centre x', cx(must(g.level, 'Level column')), REF.levelX, T);
  num('bar', 'Score column centre x', cx(must(g.score, 'Score column')), REF.scoreX, T);
  // the text by its pixels: cap top / baseline of "Level" and "96"
  const page = median([...pixels(ours, { left: 150, top: 20, right: 250, bottom: 50 })].map((p) => p.c));
  const ink = darkCore(ours, must(g.levelName, 'Level label'), 0.06);
  const lab = inkStats(ours, grow(must(g.levelName, 'Level label'), 1), ink, page);
  const n96 = inkStats(ours, grow(must(g.levelNum, 'Level number'), 1), ink, page);
  const slab = inkStats(ours, grow(must(g.scoreName, 'Score label'), 1), ink, page);
  const s0 = inkStats(ours, grow(must(g.scoreNum, 'Score number'), 1), ink, page);
  if (lab) {
    num('bar', '"Level" cap top', lab.box.top, REF.labelTop, T);
    num('bar', '"Level" baseline', lab.box.bottom, REF.labelBase, T);
  }
  if (n96) {
    num('bar', '"96" top', n96.box.top, REF.numTop, T);
    num('bar', '"96" baseline', n96.box.bottom, REF.numBase, T);
  }
  // the weights (polish a): stroke width / glyph height, ours and the original's by the same method
  const refTxt = ref.still ? refText(ref.still) : null;
  const weight = (item: string, o: ReturnType<typeof inkStats>, r: ReturnType<typeof inkStats> | undefined): void => {
    if (!o) return;
    info('type', `${item} stroke (CSS px) / height (CSS px) / stroke ÷ height`, `${f2(o.stroke)} / ${f1(h(o.box))} / ${f2(o.ratio)}`, r ? `${f2(r.stroke)} / ${f1(h(r.box))} / ${f2(r.ratio)}` : '—', r ? `stroke ×${f2(o.stroke / r.stroke)}` : '');
  };
  weight('"Level"', lab, refTxt?.label);
  weight('"96"', n96, refTxt?.num);
  weight('"Score"', slab, refTxt?.slabel);
  weight('"0"', s0, refTxt?.snum);
  info('type', 'label / number font size (px) and weight', `${f1(g.fontLabel.size)} ${g.fontLabel.weight} / ${f1(g.fontNum.size)} ${g.fontNum.weight}`, '19.3 ≈500 / 22 ≈800 (measure.md §2)');

  // ── pills ──
  const heads = must(g.heads, 'heads pill');
  num('pills', 'heads pill left', heads.left, REF.heads.left, T);
  num('pills', 'heads pill right', heads.right, REF.heads.right, T);
  num('pills', 'pills top', heads.top, REF.heads.top, T);
  num('pills', 'pills bottom', heads.bottom, REF.heads.bottom, T);
  // a head's tint: off white, and off the page (the pill's round ends show the page at the box's corners)
  const pg = hexRgb(REF.colours.page);
  const headInk = (c: RGB): boolean => 765 - c[0] - c[1] - c[2] > 24 && Math.abs(c[0] - pg[0]) + Math.abs(c[1] - pg[1]) + Math.abs(c[2] - pg[2]) > 24;
  const oh = blobs(ours, { left: heads.left + 4, top: heads.top + 2, right: heads.right - 4, bottom: heads.bottom - 2 }, headInk, 10);
  const rh = ref.frame ? blobs(ref.frame, { left: REF.heads.left + 4, top: REF.heads.top + 2, right: REF.heads.right - 4, bottom: REF.heads.bottom - 2 }, headInk, 10) : null;
  if (oh.length) {
    num('pills', 'first head left', (oh[0] as Box).left, REF.heads.first, T);
    num('pills', 'last head right', (oh[oh.length - 1] as Box).right, REF.heads.last, T);
    num('pills', 'head width (mean)', mean(oh.map(w)), rh?.length ? mean(rh.map(w)) : REF.heads.w, 1);
    num('pills', 'head height (mean)', mean(oh.map(h)), rh?.length ? mean(rh.map(h)) : REF.heads.h, 1);
    num('pills', 'head pitch', pitch(oh), REF.heads.pitch, 0.5);
  }
  const lives = must(g.lives, 'fish pill');
  num('pills', 'fish pill left', lives.left, REF.fish.left, T);
  num('pills', 'fish pill right', lives.right, REF.fish.right, T);
  const fishInk = (c: RGB): boolean => 765 - c[0] - c[1] - c[2] > 70;
  const of = blobs(ours, { left: lives.left + 3, top: lives.top + 1, right: lives.right - 3, bottom: lives.bottom - 1 }, fishInk, 3);
  const rf = ref.frame ? blobs(ref.frame, { left: REF.fish.left + 3, top: REF.heads.top + 1, right: REF.fish.right - 3, bottom: REF.heads.bottom - 1 }, fishInk, 3) : null;
  if (of.length) {
    num('pills', 'first fish left', (of[0] as Box).left, rf?.length ? (rf[0] as Box).left : REF.fish.first, T);
    num('pills', 'last fish right', (of[of.length - 1] as Box).right, rf?.length ? (rf[rf.length - 1] as Box).right : REF.fish.last, T);
    num('pills', 'fish width (mean, pixels)', mean(of.map(w)), rf?.length ? mean(rf.map(w)) : REF.fish.w, 1);
    num('pills', 'fish height (mean, pixels)', mean(of.map(h)), rf?.length ? mean(rf.map(h)) : REF.fish.h, 1);
    num('pills', 'fish pitch', pitch(of), REF.fish.pitch, 0.6);
    info('pills', 'fish (spec numbers)', '', `${REF.fish.w} × ${REF.fish.h} at ${REF.fish.pitch}`);
  }

  // ── rule cards ──
  const rules = must(g.rules, 'rules container');
  num('rules', 'container left', rules.left, REF.rules.left, T);
  num('rules', 'container right', rules.right, REF.rules.right, T);
  num('rules', 'container top', rules.top, REF.rules.top, T);
  num('rules', 'container bottom', rules.bottom, REF.rules.bottom, T);
  const cardBg = hexRgb('#FBF4EE');
  g.cards.forEach((c, i) => {
    const b = must(c, `card ${i}`);
    num('rules', `card ${i + 1} left`, b.left, REF.cards.lefts[i] as number, T);
    if (i === 0) {
      num('rules', 'card top', b.top, REF.cards.top, T);
      num('rules', 'card bottom', b.bottom, REF.cards.bottom, T);
      num('rules', 'card width', w(b), REF.cards.w, T);
    }
    // the rule text's weight, like for like (the text starts 46 from the card's inline start)
    const textBox = (left: number, top: number): Box => ({ left: left + 45, top: top + 1, right: left + REF.cards.w - 3, bottom: top + REF.cards.h - 1 });
    const o = inkStats(ours, textBox(b.left, b.top), ink, cardBg);
    const r = ref.still ? inkStats(ref.still, textBox(REF.cards.lefts[i] as number, REF.cards.top), ink, cardBg) : null;
    if (o) info('type', `rule card ${i + 1} text stroke (CSS px)`, f2(o.stroke), r ? f2(r.stroke) : '—', r ? `stroke ×${f2(o.stroke / r.stroke)}` : '');
  });

  // ── board ──
  const board = must(g.board, 'board');
  num('board', 'card left', board.left, REF.board.left, T);
  num('board', 'card right', board.right, REF.board.right, T);
  num('board', 'card top', board.top, REF.board.top, T);
  num('board', 'card bottom', board.bottom, REF.board.bottom, T);
  const t0 = must(g.tiles[0]?.box, 'tile 0');
  const t1 = must(g.tiles[1]?.box, 'tile 1');
  num('board', 'first tile left', t0.left, REF.tile.left, T);
  num('board', 'first tile top', t0.top, REF.tile.top, T);
  num('board', 'tile size', w(t0), REF.tile.size, 0.5);
  num('board', 'gap', t1.left - t0.right, REF.tile.gap, 0.5);
  num('board', 'tile radius', g.tileRadius, REF.tile.radius, 0.5);
  num('board', 'X bar thickness (rects)', (g.xBarUnits / 100) * g.slot, REF.x.bar, 0.4);
  // The X's box from its rects' geometry: two rounded rects at ±45° (getBoundingClientRect would count
  // their rounded-off corners): half extent = ((w/2 − r) + (h/2 − r)) / √2 + r, in slot units.
  const { w: xw, h: xh, rx } = g.xRect;
  if (xw > 0) num('board', 'X box (rect geometry)', ((2 * ((xw / 2 - rx + (xh / 2 - rx)) / Math.SQRT2 + rx)) / 100) * g.slot, REF.x.box, 0.6);
  const xb = g.xRects.reduce<Box | null>((m, r) => (m ? { left: Math.min(m.left, r.left), top: Math.min(m.top, r.top), right: Math.max(m.right, r.right), bottom: Math.max(m.bottom, r.bottom) } : r), null);
  if (xb) info('board', 'X box (rects\' client boxes, corners included)', f1(w(xb)), f1(REF.x.box));
  // the white X inside the tile (inset: the tile's anti-aliased corners show the white card)
  const white = [...pixels(ours, grow(t0, -2))].filter((p) => p.c[0] >= 250 && p.c[1] >= 250 && p.c[2] >= 250);
  if (white.length) {
    const xs = white.map((p) => p.x);
    num('board', 'X box (white pixels)', (Math.max(...xs) - Math.min(...xs) + 1) / S, REF.x.box, 0.6);
  }
  // no outline: no pixel of the tile darker than its own colour
  const tileC = median([...pixels(ours, { left: t0.left + 1, top: t0.top + 1, right: t0.left + 4, bottom: t0.top + 4 })].map((p) => p.c));
  const darker = [...pixels(ours, { left: t0.left + 2, top: t0.top + 2, right: t0.right - 2, bottom: t0.bottom - 2 })].filter((p) => lum(p.c) < lum(tileC) - 10).length;
  rows.push({ group: 'board', item: 'X outline (tile pixels darker than the tile)', ours: String(darker), ref: '0', diff: '', verdict: darker === 0 ? 'pass' : 'FAIL' });
  const below = shadowBelow(ours, cx(board), cy(board), h(board), page);
  rows.push({ group: 'board', item: 'board card shadow (strength below)', ours: String(below.strength), ref: '0', diff: '', verdict: below.strength <= 30 ? 'pass' : 'FAIL' });

  // ── helpers ──
  const names = ['kitty', 'bulb', 'mouse'] as const;
  g.tools.forEach((t, i) => {
    const disc = must(t.disc, `${names[i]} disc`);
    num('helpers', `${names[i]} disc centre x`, cx(disc), REF.helpers.cxs[i] as number, T);
    num('helpers', `${names[i]} disc centre y`, cy(disc), REF.helpers.cy, T);
    num('helpers', `${names[i]} disc Ø`, w(disc), REF.helpers.d, T);
    const art = discArt(ours, cx(disc), cy(disc), w(disc), t.badge);
    const refDisc = { cx: REF.helpers.cxs[i] as number, cy: REF.helpers.cy, d: REF.helpers.d };
    const refBadge = i < 2 ? REF.badge : REF.video;
    const refBadgeBox = { left: refDisc.cx + refBadge.dx - refBadge.w / 2, right: refDisc.cx + refBadge.dx + refBadge.w / 2, top: refDisc.cy + refBadge.dy - refBadge.h / 2, bottom: refDisc.cy + refBadge.dy + refBadge.h / 2 };
    const rart = ref.frame ? discArt(ref.frame, refDisc.cx, refDisc.cy, refDisc.d, refBadgeBox) : null;
    const spec = REF.icons[names[i] as (typeof names)[number]];
    if (art) {
      num('helpers', `${names[i]} art width (pixels)`, w(art), rart ? w(rart) : spec[0], 1);
      num('helpers', `${names[i]} art height (pixels)`, h(art), rart ? h(rart) : spec[1], 1);
      num('helpers', `${names[i]} art centre dx from the disc centre`, cx(art) - cx(disc), rart ? cx(rart) - refDisc.cx : 0, 1);
      num('helpers', `${names[i]} art centre dy from the disc centre`, cy(art) - cy(disc), rart ? cy(rart) - refDisc.cy : 0, 1);
      info('helpers', `${names[i]} art (spec §1.11)`, `${f1(w(art))} × ${f1(h(art))}`, `${spec[0]} × ${spec[1]}`);
    }
    if (t.badge) {
      const B = i < 2 ? REF.badge : REF.video;
      num('helpers', `${names[i]} badge width`, w(t.badge), B.w, T);
      num('helpers', `${names[i]} badge height`, h(t.badge), B.h, T);
      num('helpers', `${names[i]} badge centre dx`, cx(t.badge) - cx(disc), B.dx, T);
      num('helpers', `${names[i]} badge centre dy`, cy(t.badge) - cy(disc), B.dy, T);
    }
    // polish (d): the warm shadow under the disc, like for like
    const so = shadowBelow(ours, cx(disc), cy(disc), w(disc), page);
    const rpage: RGB = ref.frame ? median([...pixels(ref.frame, { left: 150, top: 20, right: 250, bottom: 50 })].map((p) => p.c)) : page;
    const sr = ref.frame ? shadowBelow(ref.frame, refDisc.cx, refDisc.cy, refDisc.d, rpage) : null;
    info('shadow', `${names[i]} disc: strength / reach (CSS px) / colour 2 px below / warmth`, `${so.strength} / ${so.reach} / ${so.at2} / ${so.warmth}`, sr ? `${sr.strength} / ${sr.reach} / ${sr.at2} / ${sr.warmth}` : '—', sr ? `strength ×${f2(so.strength / Math.max(1, sr.strength))}` : '');
  });
  for (const [k, b, r] of [['back', back, REF.back], ['gear', gear, REF.gear]] as const) {
    const so = shadowBelow(ours, cx(b), cy(b), w(b), page);
    const rpage: RGB = ref.frame ? median([...pixels(ref.frame, { left: 150, top: 20, right: 250, bottom: 50 })].map((p) => p.c)) : page;
    const sr = ref.frame ? shadowBelow(ref.frame, r.cx, r.cy, r.d, rpage) : null;
    info('shadow', `${k} disc: strength / reach / colour 2 px below / warmth`, `${so.strength} / ${so.reach} / ${so.at2} / ${so.warmth}`, sr ? `${sr.strength} / ${sr.reach} / ${sr.at2} / ${sr.warmth}` : '—', sr ? `strength ×${f2(so.strength / Math.max(1, sr.strength))}` : '');
  }
  if (ref.peakOurs) {
    const bulb = must(g.tools[1]?.disc, 'bulb disc');
    const edge = hex(at(ref.peakOurs, (bulb.right + 3.5) * S, cy(bulb) * S));
    const refEdge = ref.peakRef ? hex(at(ref.peakRef, (REF.helpers.cxs[1] + REF.peak.d / 2 + 1) * S, REF.helpers.cy * S)) : REF.peak.glowEdge;
    colour('pulse', 'bulb glow just outside the disc at the peak', edge, refEdge, null);
  }
  if (g.banner) {
    num('banner', 'banner left', g.banner.left, REF.banner.left, T);
    num('banner', 'banner right', g.banner.right, REF.banner.right, T);
    num('banner', 'banner top', g.banner.top, REF.banner.top, T);
  }

  // ── colours (ΔE00 ≤ 1 against the measured PNG values) ──
  colour('colour', 'page', hex(page), REF.colours.page, 1);
  colour('colour', 'board card', hex(median([...pixels(ours, { left: board.left + 1, top: board.top + 40, right: board.left + 4, bottom: board.bottom - 40 })].map((p) => p.c))), REF.colours.card, 1);
  colour('colour', 'text ink ("Level" core)', hex(ink), REF.colours.ink, 1);
  colour('colour', 'icon ink (gear core)', hex(darkCore(ours, { left: cx(gear) - 0.3 * w(gear), top: cy(gear) - 0.3 * w(gear), right: cx(gear) + 0.3 * w(gear), bottom: cy(gear) + 0.3 * w(gear) }, 0.08, (c) => c[0] - c[2] > 90)), REF.colours.icon, 1);
  const seen = new Set<number>();
  for (const t of g.tiles) {
    if (t.s !== 'e' || t.color < 0 || seen.has(t.color) || !t.box) continue;
    seen.add(t.color);
    const c = hex(median([...pixels(ours, { left: cx(t.box) - 7, top: cy(t.box) - 7, right: cx(t.box) + 7, bottom: cy(t.box) + 7 })].map((p) => p.c)));
    const want = REF.tiles[t.color];
    if (want) colour('colour', `tile colour ${t.color}`, c, want, 1);
    else info('colour', `tile colour ${t.color} (ours only)`, c, '—');
  }
  if (ref.still) {
    // the reference's own pixels, for the record: its tiles against the measured values
    REF.regionMap.forEach((row, r) =>
      [...row].forEach((L, c) => {
        const idx = REF.letters[L] as number;
        if (seen.has(1000 + idx)) return;
        seen.add(1000 + idx);
        const x = REF.tile.left + REF.tile.size / 2 + c * 38;
        const y = REF.tile.top + REF.tile.size / 2 + r * 38;
        const s = hex(median([...pixels(ref.still as Img, { left: x - 7, top: y - 7, right: x + 7, bottom: y + 7 })].map((p) => p.c)));
        info('colour', `reference tile ${idx} as sampled from still.png`, '—', s, `ΔE00 to measure.md ${f2(de(s, REF.tiles[idx] as string))}`);
      }),
    );
  }
}

const grow = (b: Box, k: number): Box => ({ left: b.left - k, top: b.top - k, right: b.right + k, bottom: b.bottom + k });
const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
const pitch = (bs: Box[]): number => (bs.length > 1 ? ((bs[bs.length - 1] as Box).left - (bs[0] as Box).left) / (bs.length - 1) : NaN);

/** The original's bar text, by the same ink method (windows around the measured columns). */
function refText(img: Img): { label: ReturnType<typeof inkStats>; num: ReturnType<typeof inkStats>; slabel: ReturnType<typeof inkStats>; snum: ReturnType<typeof inkStats> } {
  const page = median([...pixels(img, { left: 150, top: 20, right: 250, bottom: 50 })].map((p) => p.c));
  const ink = darkCore(img, { left: REF.levelX - 30, top: 63, right: REF.levelX + 30, bottom: 82 }, 0.06);
  return {
    label: inkStats(img, { left: REF.levelX - 40, top: 61, right: REF.levelX + 40, bottom: 84 }, ink, page),
    num: inkStats(img, { left: REF.levelX - 30, top: 85, right: REF.levelX + 30, bottom: 107 }, ink, page),
    slabel: inkStats(img, { left: REF.scoreX - 40, top: 61, right: REF.scoreX + 40, bottom: 84 }, ink, page),
    snum: inkStats(img, { left: REF.scoreX - 20, top: 85, right: REF.scoreX + 20, bottom: 107 }, ink, page),
  };
}

// ─────────────────────────────── composites (scratch only) ───────────────────────────────

/** [reference | ours] at the same CSS-px scale on a grey ground, with a guide every 50 CSS px. */
function composite(left: Img, right: Img): Img {
  const gap = 24;
  const W = left.w + gap + right.w;
  const H = Math.max(left.h, right.h);
  const data = new Uint8Array(W * H * 3).fill(128);
  const blit = (src: Img, ox: number): void => {
    for (let y = 0; y < src.h; y++) data.set(src.data.subarray(y * src.w * 3, (y + 1) * src.w * 3), (y * W + ox) * 3);
  };
  blit(left, 0);
  blit(right, left.w + gap);
  for (let y = 0; y < H; y += 50 * S)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      data[i] = Math.round((data[i] as number) * 0.5 + 255 * 0.5);
      data[i + 1] = Math.round((data[i + 1] as number) * 0.5);
      data[i + 2] = Math.round((data[i + 2] as number) * 0.5);
    }
  return { w: W, h: H, data };
}

/** Scales an image by an integer-free factor (nearest neighbour; for the DSF-1 desktop shot). */
function scaleImg(img: Img, k: number): Img {
  const W = Math.round(img.w * k);
  const H = Math.round(img.h * k);
  const data = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const s = (Math.min(img.h - 1, Math.floor(y / k)) * img.w + Math.min(img.w - 1, Math.floor(x / k))) * 3;
      data.set(img.data.subarray(s, s + 3), (y * W + x) * 3);
    }
  return { w: W, h: H, data };
}

// ─────────────────────────────── main ───────────────────────────────

async function serve(): Promise<{ url: string; stop: () => void }> {
  const given = arg('--url');
  if (given) return { url: given.replace(/\/$/, ''), stop: () => undefined };
  if (!existsSync(join(ROOT, 'dist/e2e/index.html'))) throw new Error('look-compare: build first (npm run build:e2e)');
  const port = 4993;
  // vite's own bin under node (not `npx`), so stopping the child stops the server too.
  const child: ChildProcess = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--mode', 'e2e', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return { url, stop: () => child.kill('SIGTERM') };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill('SIGTERM');
  throw new Error('look-compare: the preview server did not start');
}

const readRef = (dir: string | null, name: string): Img | null => {
  if (!dir) return null;
  const p = join(dir, name);
  return existsSync(p) ? decodePng(readFileSync(p)) : null;
};

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  if (SCRATCH) mkdirSync(SCRATCH, { recursive: true });
  const still = readRef(REF_DIR, 'still.png');
  const frame = readRef(FRAMES_DIR, 't2.400-cc.png') ?? still;
  const peakRef = readRef(FRAMES_DIR, 't3.200-cc.png');
  const server = await serve();
  const browser = await chromium.launch();
  try {
    // 1. 402 × 874, DSF 3, the recording's state: at rest and at the bulb's pulse peak.
    const rec: Scene = { name: 'recording-402', vw: 402, vh: 874, dsf: 3, safe: [62, 34] };
    const page = await openRecording(browser, server.url, rec);
    const g = await dom(page);
    const restBuf = await page.screenshot();
    await pulseAt(page, 480);
    const peakBuf = await page.screenshot();
    await page.context().close();
    const ours = decodePng(restBuf);
    const peak = decodePng(peakBuf);
    if (SHOTS) {
      writeFileSync(join(OUT, `${PREFIX}-recording-402.png`), restBuf);
      writeFileSync(join(OUT, `${PREFIX}-pulse-peak-402.png`), peakBuf);
    }
    measure402(g, ours, { frame, still, peakOurs: peak, peakRef });
    if (SCRATCH && frame) writeFileSync(join(SCRATCH, 'look-402-vs-t2.400.png'), encodePng(composite(frame, ours)));
    if (SCRATCH && still) writeFileSync(join(SCRATCH, 'look-402-vs-still.png'), encodePng(composite(still, ours)));
    if (SCRATCH && peakRef) writeFileSync(join(SCRATCH, 'look-402-peak-vs-t3.200.png'), encodePng(composite(peakRef, peak)));

    // 2. Our other sizes, each beside the original at 402.
    if (SIZES) {
      const scenes: Scene[] = [
        { name: 'game-390', vw: 390, vh: 844, dsf: 3 },
        { name: 'game-320', vw: 320, vh: 568, dsf: 3 },
        { name: 'game-1280', vw: 1280, vh: 800, dsf: 1 },
        { name: 'game-de-320', vw: 320, vh: 568, dsf: 3, locale: 'de' },
        { name: 'game-ar-320', vw: 320, vh: 568, dsf: 3, locale: 'ar' },
      ];
      for (const sc of scenes) {
        const p = await openRecording(browser, server.url, sc);
        const buf = await p.screenshot();
        await p.context().close();
        if (SHOTS) writeFileSync(join(OUT, `${PREFIX}-${sc.name}.png`), buf);
        if (SCRATCH && (still ?? frame)) {
          const img = decodePng(buf);
          writeFileSync(join(SCRATCH, `look-${sc.name}-vs-402.png`), encodePng(composite((still ?? frame) as Img, sc.dsf === S ? img : scaleImg(img, S / sc.dsf))));
        }
      }
    }
  } finally {
    await browser.close();
    server.stop();
  }

  // the report
  const md = ['| Group | Item | Ours | Original | Δ | Verdict |', '|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.group} | ${r.item} | ${r.ours} | ${r.ref} | ${r.diff} | ${r.verdict} |`)].join('\n');
  const fails = rows.filter((r) => r.verdict === 'FAIL');
  console.log(md);
  console.log(`\n${rows.filter((r) => r.verdict === 'pass').length} pass, ${fails.length} FAIL, ${rows.filter((r) => r.verdict === 'info').length} info${REF_DIR ? '' : ' (no reference images: MEWDOKU_ORIG_REF not set; reference numbers from measure.md only)'}`);
  if (SCRATCH) {
    writeFileSync(join(SCRATCH, 'look-report.md'), `${md}\n`);
    writeFileSync(join(SCRATCH, 'look-report.json'), JSON.stringify(rows, null, 1));
  }
  process.exitCode = fails.length ? 1 : 0;
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 2;
});
