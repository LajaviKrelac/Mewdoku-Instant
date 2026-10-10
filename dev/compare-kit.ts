// Owner: lead (Phase 2d.1 integration I-1)
// Shared pieces of the visual-acceptance scripts (dev/look-compare.ts, look-spec §5.4; dev/helpers-compare.ts,
// helpers-spec §7.8). Not shipped, not a test: a PNG reader (8- or 16-bit RGB / RGBA) and writer (8-bit RGB), no dependency,,
// pixel helpers in CSS px over DSF-3 images, side-by-side composites with guides, and the preview server for
// the built e2e app.
//
// Clean room (look-spec §0.2, helpers-spec §0.2, D-2d-0 d): the scripts read the user's reference images only
// from folders named by the environment and refuse folders inside the repo (assertOutsideRepo); composites
// with them go only to a scratch folder outside the repo. Nothing here knows any of the original's layouts.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { deltaE2000, hexToLab } from '../scripts/palette-check';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Image px per CSS px: the user's recordings are an iPhone at 3×, our screenshots are taken at DSF 3. */
export const S = 3;

/** Throws when `dir` lies inside the repo (references and composites never enter it, D-2d-0 d). */
export function assertOutsideRepo(dir: string | null, what: string): void {
  if (dir && resolve(dir).startsWith(ROOT)) throw new Error(`${what} must be outside the repo (D-2d-0 d): ${dir}`);
}

// ─────────────────────────────── PNG (8- or 16-bit RGB / RGBA, non-interlaced) ───────────────────────────────

export interface Img {
  readonly w: number;
  readonly h: number;
  /** RGB, 3 bytes a pixel. */
  readonly data: Uint8Array;
}

export function decodePng(buf: Buffer): Img {
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
  if ((depth !== 8 && depth !== 16) || (ct !== 2 && ct !== 6) || lace !== 0) throw new Error(`compare-kit: unsupported PNG (depth ${depth}, colour type ${ct}, interlace ${lace})`);
  const ch = ct === 6 ? 4 : 3;
  const bpp = (ch * depth) / 8; // bytes a pixel (16-bit stills: the high byte is kept)
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)] as number;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? (px[dst + x - bpp] as number) : 0;
      const b = y > 0 ? (px[dst - stride + x] as number) : 0;
      const c = x >= bpp && y > 0 ? (px[dst - stride + x - bpp] as number) : 0;
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
  const step = depth / 8;
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; j < rgb.length; i += bpp, j += 3) {
    // Our screenshots are opaque; composite any alpha over white.
    const al = ch === 4 ? (px[i + 3 * step] as number) / 255 : 1;
    for (let k = 0; k < 3; k++) rgb[j + k] = Math.round((px[i + k * step] as number) * al + 255 * (1 - al));
  }
  return { w, h, data: rgb };
}

export function encodePng(img: Img): Buffer {
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

/** Reads `name` from `dir` as an image; null without a folder or file. */
export function readPng(dir: string | null, name: string): Img | null {
  if (!dir) return null;
  const p = join(dir, name);
  return existsSync(p) ? decodePng(readFileSync(p)) : null;
}

// ─────────────────────────────── pixel helpers (CSS px in, image px inside) ───────────────────────────────

export type RGB = readonly [number, number, number];
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export const at = (img: Img, x: number, y: number): RGB => {
  const xi = Math.min(img.w - 1, Math.max(0, Math.round(x)));
  const yi = Math.min(img.h - 1, Math.max(0, Math.round(y)));
  const i = (yi * img.w + xi) * 3;
  return [img.data[i] as number, img.data[i + 1] as number, img.data[i + 2] as number];
};
export const hex = (c: RGB): string => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
export const lum = (c: RGB): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
export const de = (a: string, b: string): number => deltaE2000(hexToLab(a), hexToLab(b));
export const hexRgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Every image pixel of a CSS box. */
export function* pixels(img: Img, b: Box): Generator<{ x: number; y: number; c: RGB }> {
  const x0 = Math.max(0, Math.floor(b.left * S));
  const x1 = Math.min(img.w - 1, Math.ceil(b.right * S) - 1);
  const y0 = Math.max(0, Math.floor(b.top * S));
  const y1 = Math.min(img.h - 1, Math.ceil(b.bottom * S) - 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) yield { x, y, c: at(img, x, y) };
}

export function median(cs: RGB[]): RGB {
  if (!cs.length) return [0, 0, 0];
  const m = (k: 0 | 1 | 2): number => {
    const v = cs.map((c) => c[k]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)] as number;
  };
  return [m(0), m(1), m(2)];
}

/** The median colour of a CSS box. */
export const boxColour = (img: Img, b: Box): string => hex(median([...pixels(img, b)].map((p) => p.c)));

/** A CSS-px box of an image (clamped to it). */
export function crop(img: Img, b: Box): Img {
  const x0 = Math.max(0, Math.floor(b.left * S));
  const y0 = Math.max(0, Math.floor(b.top * S));
  const x1 = Math.min(img.w, Math.ceil(b.right * S));
  const y1 = Math.min(img.h, Math.ceil(b.bottom * S));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((y0 + y) * img.w + x0) * 3, ((y0 + y) * img.w + x0 + w) * 3), y * w * 3);
  return { w, h, data };
}

/** Scales an image by any factor (nearest neighbour). */
export function scaleImg(img: Img, k: number): Img {
  const W = Math.max(1, Math.round(img.w * k));
  const H = Math.max(1, Math.round(img.h * k));
  const data = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const s = (Math.min(img.h - 1, Math.floor(y / k)) * img.w + Math.min(img.w - 1, Math.floor(x / k))) * 3;
      data.set(img.data.subarray(s, s + 3), (y * W + x) * 3);
    }
  return { w: W, h: H, data };
}

/**
 * [left | right] at the same CSS-px scale on a grey ground, with a guide line every `guidePx` CSS px
 * (every fifth one stronger), drawn over both halves so positions can be read across.
 */
export function composite(left: Img, right: Img, guidePx = 50): Img {
  const gap = 24;
  const W = left.w + gap + right.w;
  const H = Math.max(left.h, right.h);
  const data = new Uint8Array(W * H * 3).fill(128);
  const blit = (src: Img, ox: number): void => {
    for (let y = 0; y < src.h; y++) data.set(src.data.subarray(y * src.w * 3, (y + 1) * src.w * 3), (y * W + ox) * 3);
  };
  blit(left, 0);
  blit(right, left.w + gap);
  const step = guidePx * S;
  const tint = (i: number, strong: boolean): void => {
    const k = strong ? 0.55 : 0.3;
    data[i] = Math.round((data[i] as number) * (1 - k) + (strong ? 255 : 0) * k);
    data[i + 1] = Math.round((data[i + 1] as number) * (1 - k) + (strong ? 0 : 200) * k);
    data[i + 2] = Math.round((data[i + 2] as number) * (1 - k) + 255 * k);
  };
  for (let y = 0, n = 0; y < H; y += step, n++) for (let x = 0; x < W; x++) tint((y * W + x) * 3, n % 5 === 0);
  for (const [ox, w] of [[0, left.w], [left.w + gap, right.w]] as const)
    for (let x = 0, n = 0; x < w; x += step, n++) for (let y = 0; y < H; y++) tint((y * W + ox + x) * 3, n % 5 === 0);
  return { w: W, h: H, data };
}

/** Tiles images into a sheet, `cols` across, 12 px apart, on a light grey ground. */
export function sheet(imgs: readonly Img[], cols: number): Img {
  const gap = 12;
  const cw = Math.max(...imgs.map((i) => i.w));
  const ch = Math.max(...imgs.map((i) => i.h));
  const rows = Math.ceil(imgs.length / cols);
  const W = cols * cw + (cols - 1) * gap;
  const H = rows * ch + (rows - 1) * gap;
  const data = new Uint8Array(W * H * 3).fill(230);
  imgs.forEach((img, k) => {
    const ox = (k % cols) * (cw + gap);
    const oy = Math.floor(k / cols) * (ch + gap);
    for (let y = 0; y < img.h; y++) data.set(img.data.subarray(y * img.w * 3, (y + 1) * img.w * 3), ((oy + y) * W + ox) * 3);
  });
  return { w: W, h: H, data };
}

// ─────────────────────────────── the built e2e app ───────────────────────────────

/** `--url` when given, else `vite preview --mode e2e` of dist/e2e on `port`, stopped by `stop()`. */
export async function serve(given: string | null, port: number, who: string): Promise<{ url: string; stop: () => void }> {
  if (given) return { url: given.replace(/\/$/, ''), stop: () => undefined };
  if (!existsSync(join(ROOT, 'dist/e2e/index.html'))) throw new Error(`${who}: build first (npm run build:e2e)`);
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
  throw new Error(`${who}: the preview server did not start`);
}
