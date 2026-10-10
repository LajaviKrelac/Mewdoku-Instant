// Owner: lead (Phase 2d.1 integration I-1; helpers-spec §7.8)
// Visual acceptance of the three helpers, the tickers and the cat's points against the user's recordings of
// 2026-10-10 (helpers-spec §7.8). Not shipped, not a test.
//
// It builds nothing: it drives the BUILT e2e app (`npm run build:e2e`, dist/e2e) with Playwright at 402 × 874,
// DSF 3 (safe areas 62 / 34 through --dev-safe-*, `?ads=ok`: the mock banner and the mock rewarded video), a
// seeded returning player on OUR level 273 (9 × 9; its top-right colour has two tiles, (0,8) and (1,8): the
// script crosses (1,8) first, so the colour has one open tile like the recording's one-tile colour; never the
// original's level), kitty 1 and hint 1, and plays the recordings' sequences on Playwright's clock:
//   tickers (mid-crossing, the still-a moment) → the mouse (one video; visit 1 sampled) → the kitty (the cat,
//   "+N", star, count-up, head, label) → the bulb (dim, card, ghosts, Apply) → Apply (draw-in, waves, labels)
//   → the rest of the board (the win flow, the ranking panel, the victory screen).
// Time: `page.clock` (install, pauseAt, runFor) drives the timers and requestAnimationFrame; every CSS / WAAPI
// animation born after the start is paused at birth and put at its age on the fake clock before each capture
// (document.getAnimations(), currentTime), so each capture lands on an exact ms after the action.
// Checks (§7.8 item 4): positions ± 2 px, scales ± 0.05, onsets ± 1 frame (17 ms), the star within 4 px of its
// Bézier, the count-up equal to the measured sequence (within one frame), colours ΔE00 ≤ 3 of the (cc) values and
// ≤ 1 of the PNG values. Reference numbers: the analysts' measurements quoted in helpers-spec §1–§5 (and
// mouse-cat.md / hint-stills.md in the session scratchpad). Differences by design are listed as `design`.
//
// Clean room (helpers-spec §0.2, D-2d-0 d): the user's frames are read ONLY from the folders named by the
// environment and refused inside the repo; composites with them are written ONLY to HELPERS_SCRATCH (outside the
// repo). The repo gets our side alone (docs/phase2d/screenshots/<prefix>-*.png).
//
//   MEWDOKU_ORIG_REF2=<folder with still-a.png, still-b.png>                   optional: composites
//   MEWDOKU_ORIG_FRAMES2=<folder with v1/ v2/ v3/ NNN.png at 60 fps>          default: $MEWDOKU_ORIG_REF2/f60
//   HELPERS_SCRATCH=<scratch folder>                                          required with either (composites, report)
//   npx tsx dev/helpers-compare.ts [--url http://127.0.0.1:4173] [--out docs/phase2d/screenshots] [--prefix FINAL]
//                                  [--no-shots] [--level 273]
// Without --url it serves dist/e2e itself (vite preview --mode e2e on port 4994) and stops it after.
// PLAYWRIGHT_BROWSERS_PATH must point at the installed browsers (never `playwright install` here).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { assertOutsideRepo, composite, crop, de, decodePng, encodePng, readPng, ROOT, scaleImg, serve, sheet, type Box, type Img } from './compare-kit';
import { cfg } from '../src/app/config';
import { defaults } from '../src/game/save';
import { periodKeyAt } from '../src/game/scoring';
import type { SaveData } from '../src/game/types';

const argv = process.argv.slice(2);
const arg = (name: string): string | null => {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};
const OUT = resolve(ROOT, arg('--out') ?? 'docs/phase2d/screenshots');
const PREFIX = arg('--prefix') ?? 'FINAL';
const SHOTS = !argv.includes('--no-shots');
const LEVEL = Number(arg('--level') ?? 273);
const REF2 = process.env.MEWDOKU_ORIG_REF2 ?? null;
const FRAMES2 = process.env.MEWDOKU_ORIG_FRAMES2 ?? (REF2 ? join(REF2, 'f60') : null);
const SCRATCH = process.env.HELPERS_SCRATCH ?? null;
if ((REF2 || process.env.MEWDOKU_ORIG_FRAMES2) && !SCRATCH) throw new Error('helpers-compare: set HELPERS_SCRATCH (a scratch folder outside the repo) to compare with the recordings');
assertOutsideRepo(REF2, 'helpers-compare: MEWDOKU_ORIG_REF2');
assertOutsideRepo(FRAMES2, 'helpers-compare: MEWDOKU_ORIG_FRAMES2');
assertOutsideRepo(SCRATCH, 'helpers-compare: HELPERS_SCRATCH');

// ─────────────────────────────── the recordings' numbers (CSS px at 402 × 874; ms from the release) ───────────────────────────────

/** The recordings' 9 × 9 board (mouse-cat.md §1.1): tile c spans x = 13.0 + 42.125 c … + 39. */
const REF_BOARD = { x0: 13.0, y0: 257.7, pitch: 42.125, T: 39.0 };
const refCell = (r: number, c: number): { cx: number; cy: number } => ({ cx: REF_BOARD.x0 + REF_BOARD.pitch * c + REF_BOARD.T / 2, cy: REF_BOARD.y0 + REF_BOARD.pitch * r + REF_BOARD.T / 2 });

/** Video ms of each sequence's t = 0 (mouse-cat.md §3.2, §4.2; hint-stills.md §3). */
const T0 = {
  /** v1: the mouse arrives on B, its second tile (8,6). */
  v1Visit: 242,
  /** v2: the kitty's release. */
  v2Release: 917,
  /** v3: the bulb's release (the first dimmed frame) and Apply's. */
  v3Open: 500,
  v3Apply: 4467,
} as const;

/** Linear interpolation in a [t, v] table (clamped at both ends). */
function interp(table: readonly (readonly [number, number])[], t: number): number {
  const first = table[0] as readonly [number, number];
  if (t <= first[0]) return first[1];
  for (let i = 1; i < table.length; i++) {
    const [t1, v1] = table[i] as readonly [number, number];
    const [t0, v0] = table[i - 1] as readonly [number, number];
    if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return (table[table.length - 1] as readonly [number, number])[1];
}

const REF = {
  mouse: {
    /** Our art is 0.86 × 0.79 T (helpers-spec §1.4: 0.88 × 0.77 measured), centre 1 % T above the tile's. */
    size: { w: 0.88, h: 0.77, dy: -0.01 },
    /** The sprite's scale relative to rest after its arrival (v1, B: 242 → 375). */
    scaleIn: [[16, 0.5], [50, 0.68], [66, 0.76], [83, 0.84], [100, 0.92], [116, 0.98], [133, 1]] as const,
    /** The arriving tile's scale (mean of B and C, critic's 0.87–0.90 at the second frame). */
    bump: [[17, 0.86], [33, 0.9], [50, 0.945], [67, 0.985], [83, 1]] as const,
    /** The X under the leaving mouse, from its first visible frame (v1, A and B: 1.15 → 1.10 at +84 → 1.0 at +150). */
    pop: [[0, 1.15], [84, 1.1], [100, 1.07], [134, 1.04], [150, 1]] as const,
    /** The dwell before the X: B 750, C 975 (helpers-spec §1.5: ours 850, their rounded mean). */
    dwell: [750, 975] as const,
  },
  cat: {
    /** The cat's scale relative to its resting size F (v2 §4.2: from 933 = +16). */
    scale: [[16, 0.29], [33, 0.42], [50, 0.75], [66, 1.18], [83, 1.42], [100, 1.53], [116, 1.56], [133, 1.56], [166, 1.51], [200, 1.43], [233, 1.35], [266, 1.28], [300, 1.25], [800, 1.25], [816, 1.26], [850, 1.17], [866, 1.12], [883, 1.06], [900, 1], [916, 0.94], [933, 0.91], [950, 0.895], [1033, 0.9], [1133, 0.93], [1233, 0.98], [1400, 1]] as const,
    /** "+N": scale table (v2 §4.3.5) and its centre one pitch above the tile (−0.06, −1.01 pitch; the x is the edge clamp). */
    plusScale: [[0, 0.53], [16, 0.65], [33, 0.76], [66, 0.94], [83, 1], [100, 1.05], [133, 1.12], [166, 1.15], [216, 1.15], [233, 1.11], [283, 1.05], [350, 1]] as const,
    plusDy: -1.01,
    /** The completion label: 0.83 pitch below in v2 (helpers-spec §4.3: 0.82), scale table (v2 §4.3.6). */
    labelDy: 0.83,
    labelScale: [[0, 0.78], [16, 0.82], [33, 0.88], [50, 0.99], [66, 1.03], [83, 1.07], [116, 1.04], [150, 1.01], [166, 1]] as const,
    /** The star: born at +783 on the "+N", flies +800 → +1316 on P0 (363, 244) → C (289, 247) → P2 (252.5, 95.8). */
    star: { p0: [363, 244], c: [289, 247], p2: [252.5, 95.8], from: 800, ms: 516 },
    /** The count-up from the frame after the landing (2250 = +1333): 0, 54, 104 … 576 (§4.3.8). */
    count: [0, 54, 104, 153, 199, 242, 282, 320, 355, 388, 418, 445, 470, 492, 512, 529, 543, 555, 564, 571, 575, 576],
    countFrom: 1333,
    /** The found head: 0.56 at +0 → 1.20 at +83 → 1.0 at +283 (§4.3.9, critic: 0.55 → 1.21 → 1.0). */
    head: [[0, 0.56], [83, 1.2], [280, 1]] as const,
  },
  hint: {
    /** The dim's alpha (v3 §3: linear 0.078 at +0 → 0.742 at +267; extrapolated start −31, end +264, α 0.75). */
    dim: (t: number): number => Math.min(0.75, Math.max(0, (0.75 * (t + 31)) / 295)),
    card: { w: 334.4, top: 174.0, bottom: 244.3, gapAboveBoard: 5.9, radius: 15 },
    apply: { w: 278.7, h: 59.3, cx: 207.9, gapBelowBoard: 31 },
    ghostFirst: 333,
    ghostStagger: 60,
    /** One ghost from its first visible frame (§8.2). */
    ghostScale: [[0, 0.27], [17, 0.5], [33, 0.7], [50, 0.86], [67, 1], [83, 1.09], [100, 1.16], [117, 1.22], [150, 1.22], [167, 1.18], [200, 1.09], [233, 1], [250, 0.96], [267, 0.925], [367, 0.925], [400, 0.96], [450, 0.99], [500, 1]] as const,
    /** After Apply (critic re-measure, 60 fps): "\" length at +66 / +83 / +116; the whole X ≈ 1.10 after "\" and 1.0 by +270. */
    stroke1: [[66, 0.45], [83, 0.72], [116, 1.05]] as const,
    labelDy: 34.7 / 42.125,
  },
  tickers: {
    /** still-a (PNG): the outer borders' y and height; line 2 ahead by 0.086 of the crossing. */
    y1: 151.2,
    y2: 192.0,
    h: 29.3,
    lead: 0.086,
    p2: 0.489,
  },
  colours: {
    /** (cc): video values corrected with the 2d curve; (PNG): the stills. */
    plus: '#FB8515',
    doneTop: '#EFDA25',
    doneBottom: '#FECF3D',
    doneLine: '#813800',
    hintCard: '#FFFCFA',
    apply: '#F0912A',
    tickerFill: '#FFF1C8',
    tickerLine: '#E98E33',
    denim: '#5B75B2',
  },
} as const;

// ─────────────────────────────── the report ───────────────────────────────

type Verdict = 'pass' | 'FAIL' | 'info' | 'design';
interface Row {
  readonly group: string;
  readonly item: string;
  readonly ours: string;
  readonly ref: string;
  readonly diff: string;
  readonly verdict: Verdict;
}
const rows: Row[] = [];
const f2 = (v: number): string => (Number.isFinite(v) ? v.toFixed(2) : '—');
const f1 = (v: number): string => (Number.isFinite(v) ? v.toFixed(1) : '—');
function num(group: string, item: string, ours: number, ref: number, tol: number | null, verdict?: Verdict): void {
  const d = ours - ref;
  const fmt = tol !== null && tol < 0.5 ? f2 : f1;
  rows.push({ group, item, ours: fmt(ours), ref: fmt(ref), diff: (d >= 0 ? '+' : '') + fmt(d), verdict: verdict ?? (tol === null ? 'info' : Math.abs(d) <= tol + 1e-9 ? 'pass' : 'FAIL') });
}
function colour(group: string, item: string, ours: string, ref: string, tol: number | null, verdict?: Verdict): void {
  const d = de(ours, ref);
  rows.push({ group, item, ours, ref, diff: `ΔE00 ${f2(d)}`, verdict: verdict ?? (tol === null ? 'info' : d <= tol ? 'pass' : 'FAIL') });
}
function note(group: string, item: string, ours: string, ref: string, verdict: Verdict, diff = ''): void {
  rows.push({ group, item, ours, ref, diff, verdict });
}

// ─────────────────────────────── the clock and the animations (in the page) ───────────────────────────────

/**
 * Installed before the app's scripts. Every animation born after __fx.start() is paused at birth (from a
 * MutationObserver, which runs right after the DOM change that made it, and after every timer and frame
 * callback) and remembers its birth on the page's (fake) clock; __fx.seek() puts each at its age. A late join
 * that set currentTime itself (the tickers) keeps it. __fx.watch(sel) records the clock when sel first matches.
 */
const FX_INIT = `(() => {
  const births = new WeakMap();
  let on = false;
  let watchSel = null;
  const fx = { t0: null, frameAt: 0 };
  const stamp = () => {
    if (on) {
      const now = performance.now();
      for (const a of document.getAnimations()) {
        if (births.has(a)) continue;
        const ct = typeof a.currentTime === 'number' ? a.currentTime : 0;
        births.set(a, now - (ct > 30 ? ct : 0));
        try { a.pause(); } catch (e) { /* finished */ }
      }
    }
    if (watchSel && fx.t0 === null && document.querySelector(watchSel)) fx.t0 = performance.now();
  };
  const st = window.setTimeout.bind(window);
  window.setTimeout = (f, ms, ...args) => st(() => { if (typeof f === 'function') f(...args); stamp(); }, ms);
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (f) => raf((t) => { fx.frameAt = performance.now(); f(t); stamp(); });
  const observe = () => new MutationObserver(stamp).observe(document.documentElement, { subtree: true, childList: true, attributes: true });
  if (document.documentElement) observe(); else document.addEventListener('DOMContentLoaded', observe);
  fx.start = () => { for (const a of document.getAnimations()) births.set(a, -1e12); on = true; };
  fx.stamp = stamp;
  fx.watch = (sel) => { watchSel = sel; fx.t0 = null; stamp(); };
  // A CSS animation the script has paused or finished outlives its class (it is no longer cancelled when its
  // name leaves the element's animation-name, and it then composites above the element's live CSS animations,
  // e.g. a finished entry wave over a tile's press). Without the script the browser cancels it, so do the same.
  const orphan = (a) => {
    const name = a.animationName;
    const t = a.effect && a.effect.target;
    if (!name || !t) return false;
    const names = getComputedStyle(t, a.effect.pseudoElement || null).animationName.split(',').map((n) => n.trim());
    return !names.includes(name);
  };
  fx.seek = () => {
    stamp();
    const now = performance.now();
    for (const a of document.getAnimations()) {
      if (orphan(a)) { try { a.cancel(); } catch (e) { /* gone */ } continue; }
      const b = births.get(a);
      if (b === undefined || b < -1e11) continue;
      const age = Math.max(0, now - b);
      const end = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming().endTime : Infinity;
      // An animation past its end finishes for real (its finish / animationend handlers clean up, as they
      // would without the fake clock); a paused one would hold its end state over later animations.
      if (typeof end === 'number' && Number.isFinite(end) && age >= end) {
        births.set(a, -1e12);
        try { a.finish(); } catch (e) { /* gone */ }
      } else {
        try { a.currentTime = age; } catch (e) { /* gone */ }
      }
    }
  };
  window.__fx = fx;
})();`;

type FxWindow = Window & {
  __fx: { t0: number | null; frameAt: number; start(): void; stamp(): void; watch(sel: string): void; seek(): void };
  __mewdoku?: { app(): { screen: string }; state(): { status: string; cells: Uint8Array; levelPoints?: number } | null; seedSave(json: string): void; solution(): number[] | null; solve(): boolean };
};

/** Real-time polling while the fake clock creeps forward by `step` ms a round (chunks load over the network). */
async function until(page: Page, what: string, test: () => Promise<boolean>, step = 16, rounds = 400): Promise<void> {
  for (let k = 0; k < rounds; k++) {
    if (await test()) return;
    if (step > 0) await page.clock.runFor(step);
    await page.waitForTimeout(25);
  }
  throw new Error(`helpers-compare: timed out waiting for ${what}`);
}

/** Waits (real time, the clock still) until the watched selector has matched, then returns its clock time. */
async function t0Of(page: Page, what: string): Promise<number> {
  for (let k = 0; k < 300; k++) {
    const t = await page.evaluate(() => (window as unknown as FxWindow).__fx.t0);
    if (t !== null) return t;
    // the engine and the rewarded mock answer in real time; let a timer-driven step through now and then
    if (k % 20 === 19) await page.clock.runFor(16);
    await page.waitForTimeout(25);
  }
  throw new Error(`helpers-compare: ${what} never started`);
}

/** Moves the fake clock to t0 + T and puts every animation at its age. */
async function seek(page: Page, t0: number, T: number): Promise<void> {
  const now = await page.evaluate(() => performance.now());
  const dt = t0 + T - now;
  if (dt > 0) await page.clock.runFor(dt);
  await page.evaluate(() => (window as unknown as FxWindow).__fx.seek());
  // animationend / finish events of what just finished are dispatched on the next real rendering frame
  await page.waitForTimeout(40);
  await page.evaluate(() => (window as unknown as FxWindow).__fx.seek());
}

// ─────────────────────────────── our measures (in the page) ───────────────────────────────

/** Scale of an element's own computed transform (1 when none). */
const scaleScript = `(el) => {
  if (!el) return NaN;
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return 1;
  const m = /matrix\\(([^)]+)\\)/.exec(t);
  if (!m) return 1;
  const [a, b] = m[1].split(',').map(Number);
  return Math.hypot(a, b);
}`;

interface Probe {
  readonly vw: number;
  readonly pitch: number;
  readonly T: number;
  readonly board: Box | null;
  readonly cell: (Box & { s: string }) | null;
  readonly tileScale: number;
  readonly xScale: number;
  readonly xVisible: boolean;
  readonly mouse: { box: Box; scale: number; opacity: number; cell: number; face: string } | null;
  readonly cat: number;
  readonly plus: { box: Box; scale: number; opacity: number } | null;
  readonly star: { cx: number; cy: number; w: number } | null;
  readonly score: { text: string; box: Box | null; counting: boolean };
  readonly head: { scale: number; face: boolean } | null;
  readonly labels: { box: Box; scale: number; opacity: number; anchor: string }[];
}

/** Everything the checks need at one moment; `cell` is the tile of interest. */
async function probe(page: Page, cell: number): Promise<Probe> {
  return page.evaluate(
    ({ cell, scaleSrc }) => {
      const scaleOf = new Function(`return (${scaleSrc})`)() as (el: Element | null) => number;
      const R = (el: Element | null): Box | null => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      };
      const boardEl = document.querySelector('.board') as HTMLElement | null;
      const slot = boardEl ? parseFloat(boardEl.style.getPropertyValue('--slot') || '0') : 0;
      const cells = document.querySelectorAll('.cell');
      const c = cells[cell] as HTMLElement | undefined;
      const tile = c?.querySelector('.cell__tile') ?? null;
      const tb = R(tile);
      const xg = c?.querySelector('.cell__xg') ?? null;
      const m = document.querySelector('.board__mouse') as HTMLElement | null;
      const plusEl = document.querySelector('.game-fx .fx-plus');
      const starEl = document.querySelector('.game-fx .fx-star svg') ?? document.querySelector('.game-fx .fx-star');
      const sb = R(starEl);
      const head = document.querySelector('.pill--heads .head[data-done]');
      const n = document.querySelector('.top-bar--game .points-pill__n') as HTMLElement | null;
      return {
        vw: window.innerWidth,
        pitch: slot,
        T: tb ? tb.right - tb.left : 0,
        board: R(boardEl),
        cell: c && tb ? { ...tb, s: c.dataset.s ?? '' } : null,
        tileScale: scaleOf(tile),
        xScale: xg ? scaleOf(xg) : NaN,
        xVisible: xg ? getComputedStyle(xg).visibility !== 'hidden' && !c?.classList.contains('fx-pend') : false,
        mouse: m ? { box: R(m.querySelector('svg') ?? m) as Box, scale: scaleOf(m), opacity: Number(getComputedStyle(m).opacity), cell: Number(m.dataset.cell), face: m.dataset.face ?? '' } : null,
        cat: scaleOf(c?.querySelector('.cell__catg') ?? null),
        plus: plusEl ? { box: R(plusEl) as Box, scale: scaleOf(plusEl), opacity: Number(getComputedStyle(plusEl).opacity) } : null,
        star: sb ? { cx: (sb.left + sb.right) / 2, cy: (sb.top + sb.bottom) / 2, w: sb.right - sb.left } : null,
        score: { text: n?.textContent ?? '', box: R(n), counting: n?.hasAttribute('data-counting') ?? false },
        head: head ? { scale: scaleOf(head), face: head.querySelector('.head__face') !== null } : null,
        labels: Array.from(document.querySelectorAll('.game-fx .fx-done-label')).map((l) => ({ box: R(l) as Box, scale: scaleOf(l), opacity: Number(getComputedStyle(l).opacity), anchor: (l as HTMLElement).dataset.anchor ?? '' })),
      };
    },
    { cell, scaleSrc: scaleScript },
  );
}

const cxOf = (b: Box): number => (b.left + b.right) / 2;
const cyOf = (b: Box): number => (b.top + b.bottom) / 2;

// ─────────────────────────────── captures and composites ───────────────────────────────

interface Pair {
  readonly name: string;
  readonly ours: Img;
  readonly ref: Img | null;
}
const pairs = new Map<string, Pair[]>();

/** A user frame of v1 / v2 / v3 at a video ms (60 fps; v1 runs 8 ms late from its 4th frame, mouse-cat.md §0). */
function refFrame(video: 'v1' | 'v2' | 'v3', ms: number): Img | null {
  if (!FRAMES2) return null;
  const k = video === 'v1' && ms >= 50 ? Math.round((ms - 8) * 0.06) + 1 : Math.round(ms * 0.06) + 1;
  return readPng(join(FRAMES2, video), `${String(k).padStart(3, '0')}.png`);
}

/** Our screenshot of the page (DSF 3), and the user's frame, each cropped to its own CSS box. */
async function capture(page: Page, seq: string, name: string, ours: Box, ref: { video: 'v1' | 'v2' | 'v3'; ms: number; box: Box } | null, scale = 1): Promise<Img> {
  const full = decodePng(await page.screenshot({ animations: 'allow' }));
  if (!SCRATCH) return full;
  const o = crop(full, ours);
  const frame = ref ? refFrame(ref.video, ref.ms) : null;
  const r = frame && ref ? crop(frame, ref.box) : null;
  const list = pairs.get(seq) ?? [];
  list.push({ name, ours: scale === 1 ? o : scaleImg(o, scale), ref: r ? (scale === 1 ? r : scaleImg(r, scale)) : null });
  pairs.set(seq, list);
  return full;
}

/** Saves our side as docs/phase2d/screenshots/<prefix>-<name>.png (no reference pixels ever). */
async function shot(page: Page, name: string, clip?: Box): Promise<void> {
  if (!SHOTS) return;
  await page.screenshot({ path: join(OUT, `${PREFIX}-${name}.png`), animations: 'allow', ...(clip ? { clip: { x: clip.left, y: clip.top, width: clip.right - clip.left, height: clip.bottom - clip.top } } : {}) });
}

function writeComposites(): void {
  if (!SCRATCH) return;
  for (const [seq, list] of pairs) {
    const imgs: Img[] = [];
    list.forEach((p, i) => {
      const pair = p.ref ? composite(p.ref, p.ours, 10) : p.ours;
      writeFileSync(join(SCRATCH, `helpers-${seq}-${String(i).padStart(2, '0')}-${p.name}.png`), encodePng(pair));
      imgs.push(pair);
    });
    const cols = imgs[0] && imgs[0].w > 900 ? 2 : 4;
    const sh = sheet(imgs, cols);
    writeFileSync(join(SCRATCH, `helpers-${seq}-sheet.png`), encodePng(sh.w > 4000 ? scaleImg(sh, 4000 / sh.w) : sh));
  }
}

// ─────────────────────────────── the app ───────────────────────────────

const NOW = Date.now();
function playerSave(level: number): SaveData {
  const base = defaults(NOW - 3 * 86_400_000);
  const key = periodKeyAt(NOW);
  return { ...base, tutorialDone: true, sessions: 4, progress: { level, completed: level - 1, best: {} }, period: { key, total: 39, bestKey: key, bestTotal: 39 }, stock: { hints: 1, kitties: 1 } };
}

async function open(browser: Browser, base: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  // tsx keeps function names with an `__name` helper that page.evaluate's serialised functions call.
  await ctx.addInitScript({ content: 'window.__name = (f) => f;' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`${base}/?ads=ok`);
  await page.waitForFunction(() => { const a = (window as unknown as FxWindow).__mewdoku?.app(); return !!a && a.screen !== 'boot'; }, null, { timeout: 30_000 });
  await page.evaluate((json) => (window as unknown as FxWindow).__mewdoku?.seedSave(json), JSON.stringify(playerSave(LEVEL)));
  await page.clock.install({ time: new Date(NOW) });
  await ctx.addInitScript({ content: FX_INIT });
  await ctx.addInitScript({ content: `(() => { const set = () => { const s = document.documentElement.style; s.setProperty('--dev-safe-top', '62px'); s.setProperty('--dev-safe-bottom', '34px'); }; if (document.documentElement) set(); else document.addEventListener('DOMContentLoaded', set); })();` });
  await page.reload();
  await page.waitForFunction(() => (window as unknown as FxWindow).__mewdoku?.app().screen === 'home', null, { timeout: 30_000 });
  await page.waitForTimeout(500);
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 50));
  await page.clock.runFor(800);
  return page;
}

// ─────────────────────────────── the sequences ───────────────────────────────

/** Tickers at the still-a moment (line 2 at 0.489 of its crossing). */
async function tickers(page: Page): Promise<void> {
  await until(page, 'the tickers', () => page.evaluate(() => document.querySelectorAll('.tickers .ticker').length === 2), 16, 600);
  const prog = (): Promise<{ p1: number; p2: number; b1: Box; b2: Box } | null> =>
    page.evaluate(() => {
      const ts = Array.from(document.querySelectorAll('.tickers .ticker')) as HTMLElement[];
      const by = (k: string): HTMLElement | undefined => ts.find((t) => t.dataset.line === k);
      const a = by('1');
      const b = by('2');
      if (!a || !b) return null;
      const R = (e: Element): Box => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
      const vw = window.innerWidth;
      const p = (r: Box): number => (vw - r.left) / (vw + (r.right - r.left));
      return { p1: p(R(a)), p2: p(R(b)), b1: R(a), b2: R(b) };
    });
  let at = await prog();
  for (let k = 0; k < 800 && at && at.p2 < REF.tickers.p2; k++) {
    await page.clock.runFor(16);
    await page.evaluate(() => (window as unknown as FxWindow).__fx.seek());
    at = await prog();
  }
  if (!at) throw new Error('helpers-compare: no tickers');
  const g = 'tickers';
  num(g, 'line 1 top (CSS px)', at.b1.top, REF.tickers.y1, 2);
  num(g, 'line 2 top', at.b2.top, REF.tickers.y2, 2);
  num(g, 'line 1 height', at.b1.bottom - at.b1.top, REF.tickers.h, 2);
  num(g, 'line 2 height', at.b2.bottom - at.b2.top, REF.tickers.h, 2);
  num(g, 'line 2 ahead of line 1 (share of the crossing)', at.p2 - at.p1, REF.tickers.lead, 0.01);
  const cols = await page.evaluate(() => {
    const t = document.querySelector('.tickers .ticker') as HTMLElement;
    // the pill's body is the ticker's ::before since the audit fix B8 (it starts under the paw)
    const cs = getComputedStyle(t, '::before');
    return { fill: cs.backgroundColor, line: cs.borderTopColor, ink: getComputedStyle(t.querySelector('.ticker__text') as Element).color };
  });
  colour(g, 'pill fill (PNG)', rgbHex(cols.fill), REF.colours.tickerFill, 1);
  colour(g, 'pill border (PNG)', rgbHex(cols.line), REF.colours.tickerLine, 1);
  note(g, 'speed (crossing time T)', `${cfg.fx.tickers.crossMs} ms`, 'unresolved (EXIF ≈ 21 s; the first recording ≈ 9 s)', 'design', 'helpers-spec §8 Q1');
  note(g, 'copy', 'our honest lines from the player\'s data', 'social-proof statistics', 'design', 'D-2d1-12');
  await capture(page, 'tickers', 'still-a', { left: 0, top: 110, right: 402, bottom: 240 }, REF2 ? null : null);
  if (SCRATCH && REF2) {
    const still = readPng(REF2, 'still-a.png');
    const list = pairs.get('tickers') ?? [];
    const last = list[list.length - 1];
    if (still && last) list[list.length - 1] = { ...last, ref: crop(still, { left: 0, top: 110, right: 402, bottom: 240 }) };
  }
  await shot(page, 'tickers-402', { left: 0, top: 100, right: 402, bottom: 250 });
  await shot(page, 'tickers-screen-402');
  // let them finish, then hide whatever a paused animation left behind
  await page.evaluate(() => { const t = document.querySelector('.tickers') as HTMLElement | null; if (t) t.style.display = 'none'; });
}

function rgbHex(css: string): string {
  const m = /rgba?\(([^)]+)\)/.exec(css);
  if (!m) return '#000000';
  const [r, g, b] = (m[1] as string).split(',').map((v) => Math.round(Number(v)));
  return `#${[r, g, b].map((v) => (v ?? 0).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** The mouse: one video, three visits; visit 1 is sampled against the recording's tile B. */
async function mouse(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as FxWindow).__fx.watch('.board__mouse'));
  await page.locator('.tool--mouse').click();
  await until(page, 'the video card', () => page.locator('.overlay button', { hasText: 'Watch video' }).isVisible(), 16, 400);
  await page.locator('.overlay button', { hasText: 'Watch video' }).click();
  await until(page, 'the mouse', () => page.evaluate(() => (window as unknown as FxWindow).__fx.t0 !== null), 16, 800);
  const t0 = (await page.evaluate(() => (window as unknown as FxWindow).__fx.t0)) as number;
  const visit = cfg.fx.mouse.dwellMs + cfg.fx.mouse.exitMs;
  await seek(page, t0, visit + 1);
  const cell = (await probe(page, 0)).mouse?.cell ?? 0;
  const g = 'mouse';
  const B = refCell(8, 6);
  const refBox: Box = { left: B.cx - 40, top: B.cy - 40, right: B.cx + 40, bottom: B.cy + 40 };
  let pending = cell;
  for (const t of [0, 17, 33, 50, 67, 117, 450, 850, 867, 900, 935]) {
    await seek(page, t0, visit + t);
    const p = await probe(page, cell);
    if (p.mouse) pending = p.mouse.cell;
    const tb = p.cell as Box;
    const ours: Box = { left: cxOf(tb) - 40, top: cyOf(tb) - 40, right: cxOf(tb) + 40, bottom: cyOf(tb) + 40 };
    await capture(page, g, String(t).padStart(4, '0'), ours, { video: 'v1', ms: T0.v1Visit + (t >= 850 ? REF.mouse.dwell[0] - 850 + t : t), box: refBox });
    if (t > 0 && t <= 117 && p.mouse) num(g, `sprite scale at +${t}`, p.mouse.scale, interp(REF.mouse.scaleIn, t), 0.05);
    if (t > 0 && t <= 67) {
      num(g, `tile bump at +${t}`, p.tileScale, interp(REF.mouse.bump, t), 0.05);
      if (Math.abs(p.tileScale - interp(REF.mouse.bump, t)) > 0.05) {
        // diagnostics for a miss: the tile's classes and animations at this moment
        const why = await page.evaluate((i) => {
          const c = document.querySelectorAll('.cell')[i] as HTMLElement | undefined;
          const tile = c?.querySelector('.cell__tile');
          const anims = tile ? tile.getAnimations().map((a) => `${(a as CSSAnimation).animationName ?? 'waapi'}@${Math.round(Number(a.currentTime ?? -1))}/${a.playState}`) : [];
          return `${c?.className ?? '?'} | ${anims.join(', ') || 'no animation'}`;
        }, cell);
        note(g, `tile bump at +${t}: why`, why, '', 'info');
      }
    }
    if (t === 17 || t === 33 || t === 50) note(g, `sprite opacity at +${t}`, f2(p.mouse?.opacity ?? NaN), f2(interp([[16, 0.15], [33, 0.48], [50, 0.85], [66, 1]], t)), 'info', 'B 258–308');
    if (t === 450 && p.mouse) {
      num(g, 'sprite width at rest (× T)', (p.mouse.box.right - p.mouse.box.left) / p.T, REF.mouse.size.w, 0.05);
      num(g, 'sprite height at rest (× T)', (p.mouse.box.bottom - p.mouse.box.top) / p.T, REF.mouse.size.h, 0.05);
      num(g, 'sprite centre dx from the tile centre (px)', cxOf(p.mouse.box) - cxOf(tb), 0, 2);
      num(g, 'sprite centre dy from the tile centre (px)', cyOf(p.mouse.box) - cyOf(tb), REF.mouse.size.dy * p.T, 2);
      await shot(page, 'mouse-mid-visit-402');
    }
    if (t >= 850) {
      num(g, `X scale at +${t - 850} after it shows`, p.xVisible ? p.xScale : NaN, interp(REF.mouse.pop, t - 850), 0.05);
      if (t === 850) note(g, 'X visible when the mouse starts to leave', String(p.xVisible), 'true (under the mouse, ≤ 17 ms)', p.xVisible ? 'pass' : 'FAIL');
    }
  }
  note(g, 'dwell before the X', `${cfg.fx.mouse.dwellMs} ms`, `${REF.mouse.dwell[0]} (B) / ${REF.mouse.dwell[1]} (C) ms`, 'design', 'helpers-spec §1.5: their rounded mean');
  note(g, 'faces', 'blink / glance / grin, one per visit (ours)', 'blink, glances, grin', 'design', 'helpers-spec §1.4');
  // the whole board at the end (v1-05): three X's, nothing else
  await seek(page, t0, 3 * visit + cfg.fx.markPopMs + 50);
  const end = await page.evaluate(() => ({ marks: document.querySelectorAll('.cell[data-s="m"]').length, pend: document.querySelectorAll('.cell.fx-pend').length, sprite: document.querySelector('.board__mouse') !== null }));
  note(g, 'after the run: pending X\'s / sprite', `${end.pend} / ${end.sprite}`, '0 / false', end.pend === 0 && !end.sprite ? 'pass' : 'FAIL');
  await capture(page, g, 'end-board', { left: 0, top: 240, right: 402, bottom: 660 }, { video: 'v1', ms: 3000, box: { left: 0, top: 240, right: 402, bottom: 660 } });
  void pending;
}

/** The kitty: the cat sequence, "+N", the star, the count-up, the label and the found head. */
async function kitty(page: Page): Promise<void> {
  // the lock of the mouse's run has ended; the tools take taps again
  await page.clock.runFor(1000);
  await page.evaluate(() => (window as unknown as FxWindow).__fx.watch('.cell.fx-cat'));
  // the count-up's onset (data-counting) and the time of the frame that last drew the number
  await page.evaluate(() => {
    const w = window as unknown as { __countAt?: number; __countFrame?: number };
    const n = document.querySelector('.top-bar--game .points-pill__n') as HTMLElement;
    new MutationObserver(() => {
      if (n.hasAttribute('data-counting') && w.__countAt === undefined) w.__countAt = performance.now();
      if (w.__countAt !== undefined) w.__countFrame = performance.now();
    }).observe(n, { attributes: true, childList: true, characterData: true, subtree: true });
  });
  await page.locator('.tool--paw').click();
  const t0 = await t0Of(page, 'the kitty');
  const cell = await page.evaluate(() => Number(document.querySelector('.cell.fx-cat')?.getAttribute('data-i') ?? Array.from(document.querySelectorAll('.cell')).indexOf(document.querySelector('.cell.fx-cat') as Element)));
  const g = 'cat';
  const p0 = await probe(page, cell);
  const tile = p0.cell as Box;
  note(g, 'the kitty\'s tile', `cell ${cell}`, 'the one open tile of the corner colour', cell === 8 ? 'pass' : 'FAIL', 'D-2d1-2');
  const near: Box = { left: 260, top: 196, right: 402, bottom: 346 };
  const wide: Box = { left: 180, top: 40, right: 402, bottom: 360 };
  const scoreBox: Box = { left: 196, top: 52, right: 308, bottom: 136 };
  const headsBox: Box = { left: 12, top: 116, right: 292, bottom: 164 };
  let plusAt: { x: number; y: number } | null = null;
  let rest = NaN;
  for (const t of [0, 16, 33, 83, 116, 166, 280, 300, 566, 816, 850, 950, 1066, 1300, 1333, 1400, 1450, 1683, 2400]) {
    await seek(page, t0, t);
    const p = await probe(page, cell);
    const ref = (box: Box): { video: 'v2'; ms: number; box: Box } => ({ video: 'v2', ms: T0.v2Release + t, box });
    if ([0, 16, 33, 83, 116, 166, 300, 566, 816, 950, 1400].includes(t)) await capture(page, g, String(t).padStart(4, '0'), near, ref(near));
    if ([850, 1066, 1300].includes(t)) await capture(page, 'star', String(t).padStart(4, '0'), wide, ref(wide));
    if ([1333, 1450, 1683].includes(t)) await capture(page, 'score', String(t).padStart(4, '0'), scoreBox, ref(scoreBox));
    if ([0, 83, 280].includes(t)) await capture(page, 'heads', String(t).padStart(4, '0'), headsBox, ref(headsBox));
    // the cat
    if (t >= 16 && t <= 1400 && t !== 280) num(g, `cat scale (× F) at +${t}`, p.cat, interp(REF.cat.scale, t), 0.05);
    if (t === 2400) rest = p.cat;
    // "+N" (drawn by the fx chunk's requestAnimationFrame loop, so on screen is its last frame's state: on
    // Playwright's clock frames fall every 16 ms, not on the capture's ms; compared at that frame's time,
    // which is within one frame of the capture — the onset tolerance of §7.8)
    if (p.plus && t <= 350) {
      const tf = t === 0 ? 0 : Math.min(t, (await page.evaluate(() => (window as unknown as FxWindow).__fx.frameAt)) - t0);
      num(g, `"+N" scale at +${t} (its frame: +${f1(tf)})`, p.plus.scale, interp(REF.cat.plusScale, tf), 0.05);
      if (t === 83) {
        plusAt = { x: cxOf(p.plus.box), y: cyOf(p.plus.box) };
        num(g, '"+N" centre above the tile centre (px)', cyOf(p.plus.box) - cyOf(tile), REF.cat.plusDy * p.pitch, 2);
        num(g, '"+N" outer edge inside the viewport (px)', p.vw - p.plus.box.right, 3, null);
      }
    }
    // the label (the colour is complete: one open tile and its cat)
    const lab = p.labels[0];
    if (lab && t <= 166) {
      const tf = t === 0 ? 0 : Math.min(t, (await page.evaluate(() => (window as unknown as FxWindow).__fx.frameAt)) - t0);
      num(g, `label scale at +${t} (its frame: +${f1(tf)})`, lab.scale, interp(REF.cat.labelScale, tf), 0.05);
      if (t === 83) num(g, 'label centre below the tile centre (px)', cyOf(lab.box) - cyOf(tile), REF.cat.labelDy * p.pitch, 2);
    }
    if (t === 0) note(g, 'label shows with the cat', String(p.labels.length), '1', p.labels.length === 1 ? 'pass' : 'FAIL');
    // the head
    if ([0, 83, 280].includes(t) && p.head) num('heads', `found head scale at +${t}`, p.head.scale, interp(REF.cat.head, t), 0.05);
    if (t === 0) note('heads', 'face + dot replace the silhouette in the action frame', String(p.head?.face ?? false), 'true', p.head?.face ? 'pass' : 'FAIL');
    // the star on its Bézier (ours: P0 = "+N" centre + (−4, +9.5) s; P2 = the number's centre; parameter linear in time)
    if ([850, 1066, 1300].includes(t) && p.star && plusAt && p.score.box) {
      const s = p.pitch / REF_BOARD.pitch;
      const P0 = { x: plusAt.x - 4 * s, y: plusAt.y + 9.5 * s };
      const P2 = { x: cxOf(p.score.box), y: cyOf(p.score.box) };
      const C = { x: P2.x + (P0.x - P2.x) / 3, y: P0.y };
      // the distance to the curve (the path); where on it the star is depends on the frame (16 ms steps here)
      let off = Infinity;
      for (let k = 0; k <= 400; k++) {
        const u = k / 400;
        const bx = (1 - u) ** 2 * P0.x + 2 * (1 - u) * u * C.x + u * u * P2.x;
        const by = (1 - u) ** 2 * P0.y + 2 * (1 - u) * u * C.y + u * u * P2.y;
        off = Math.min(off, Math.hypot(p.star.cx - bx, p.star.cy - by));
      }
      num('star', `star off its Bézier at +${t} (px)`, off, 0, 4);
      const r = REF.cat.star;
      const v = Math.min(1, Math.max(0, (t - r.from) / r.ms));
      const rx = (1 - v) ** 2 * r.p0[0] + 2 * (1 - v) * v * r.c[0] + v * v * r.p2[0];
      const ry = (1 - v) ** 2 * r.p0[1] + 2 * (1 - v) * v * r.c[1] + v * v * r.p2[1];
      note('star', `star at +${t}: ours vs the recording's path (px)`, `(${f1(p.star.cx)}, ${f1(p.star.cy)})`, `(${f1(rx)}, ${f1(ry)})`, 'info', `${f1(Math.hypot(p.star.cx - rx, p.star.cy - ry))} px apart`);
    }
    // the count-up: its onset against the recording's (± 1 frame), then each value against the measured
    // curve at the same time since the onset (the measured 0, 54, 104 … 576 is exactly 576 (1 − (1 − e/350)²)
    // at 60 fps; Playwright's clock steps 16 ms, so the frames fall elsewhere on the same curve)
    if ([1333, 1450, 1683].includes(t)) {
      const startAt = await page.evaluate(() => (window as unknown as { __countAt?: number }).__countAt ?? null);
      const got = Number(p.score.text.replace(/[^\d]/g, ''));
      if (t === 1450 && startAt !== null) num('score', 'count-up onset: the star\'s landing frame (ms after the release)', startAt - t0, REF.cat.countFrom, 17);
      if (startAt !== null) {
        const e = t0 + t - startAt;
        const prev = await page.evaluate(() => (window as unknown as { __countFrame?: number }).__countFrame ?? null);
        const at = prev !== null ? prev - startAt : e; // the value on screen is the last frame's
        const want = Math.round(576 * (1 - (1 - Math.min(1, Math.max(0, at / 350))) ** 2));
        const k = Math.min(REF.cat.count.length - 1, Math.max(0, Math.round((t - REF.cat.countFrom) / (1000 / 60))));
        note('score', `Score at +${t}`, String(got), `${want} (the measured curve ${f1(at)} ms after the onset; the recording's frame at +${t}: ${REF.cat.count[k]})`, Math.abs(got - want) <= 1 ? 'pass' : 'FAIL');
      } else {
        // the star's landing frame falls just after this ms on the 16 ms test clock: the number still shows
        // the total before this cat, as the recording's frame at the onset does (0)
        note('score', `Score at +${t}`, String(got), '0 (the count-up has not started: its landing frame is the next one)', got === 0 ? 'pass' : 'FAIL');
      }
      if (t === 1450) note('score', 'no bump while counting (the number\'s box height)', f1(p.score.box ? p.score.box.bottom - p.score.box.top : NaN), 'constant', 'info');
    }
    if (t === 116) await shot(page, 'cat-pop-402');
    if (t === 166) await shot(page, 'cat-plus-402');
    if (t === 1066) await shot(page, 'cat-star-402');
    if (t === 1683) await shot(page, 'cat-count-end-402');
    if (t === 280) await shot(page, 'cat-head-402', { left: 0, top: 100, right: 402, bottom: 180 });
  }
  num(g, 'cat at rest after the sequence (× F)', rest, 1, 0.05);
  const look = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    return { plus: css.getPropertyValue('--plus').trim(), top: css.getPropertyValue('--done-top').trim(), bottom: css.getPropertyValue('--done-bottom').trim(), line: css.getPropertyValue('--done-line').trim() };
  });
  colour(g, '"+N" fill (cc)', look.plus.toUpperCase(), REF.colours.plus, 3);
  colour(g, 'label gradient top (cc)', look.top.toUpperCase(), REF.colours.doneTop, 3);
  colour(g, 'label gradient bottom (cc)', look.bottom.toUpperCase(), REF.colours.doneBottom, 3);
  colour(g, 'label outline (cc)', look.line.toUpperCase(), REF.colours.doneLine, 3);
  note(g, 'art', 'our Tux cat, wink, star, shards, flash, light', 'the original\'s drawings', 'design', 'Appendix C');
  note(g, 'label word', 'our "Done!"', 'their exclamation (not copied)', 'design', 'Appendix A');
}

/** The bulb: dim, card, ghosts; then Apply: draw-in, waves, labels. */
async function bulb(page: Page): Promise<void> {
  await page.clock.runFor(2500);
  await page.evaluate(() => (window as unknown as FxWindow).__fx.watch('.overlay[data-overlay="hint"]:not([hidden]) .hint-card'));
  await page.locator('.tool--bulb').click();
  const t0 = await t0Of(page, 'the hint');
  const g = 'hint';
  const full: Box = { left: 0, top: 0, right: 402, bottom: 874 };
  const boardBox: Box = { left: 0, top: 236, right: 402, bottom: 660 };
  const ghost = await page.evaluate(() => {
    const gs = Array.from(document.querySelectorAll('.cell[data-ghost="x"][data-s="e"]')) as HTMLElement[];
    const all = Array.from(document.querySelectorAll('.cell'));
    return gs.map((c) => ({ i: all.indexOf(c), gd: parseFloat(c.style.getPropertyValue('--gd') || '0') })).sort((a, b) => a.gd - b.gd);
  });
  ghost.forEach((x, i) => {
    if (i < 4 || i === ghost.length - 1) num(g, `ghost ${i} onset (ms)`, x.gd, REF.hint.ghostFirst + i * REF.hint.ghostStagger, 17);
  });
  const g0 = ghost[0];
  for (const t of [0, 150, 300]) {
    await seek(page, t0, t);
    const a = await page.evaluate(() => {
      const d = document.querySelector('.hint-dim') as SVGElement | null;
      const path = d?.querySelector('path');
      const fillA = path ? Number((/rgba\([^)]*,\s*([\d.]+)\)/.exec(getComputedStyle(path).fill) ?? [])[1] ?? 1) : 1;
      return d ? Number(getComputedStyle(d).opacity) * fillA : NaN;
    });
    num(g, `dim alpha at +${t}`, a, REF.hint.dim(t), 0.05);
    await capture(page, g, `open-${String(t).padStart(4, '0')}`, full, { video: 'v3', ms: T0.v3Open + t, box: full }, 1 / 3);
  }
  if (g0) {
    for (const k of [0, 67, 117, 233, 500]) {
      const t = g0.gd + k;
      await seek(page, t0, t);
      const sc = await page.evaluate(
        ({ i, src }) => (new Function(`return (${src})`)() as (e: Element | null) => number)(document.querySelectorAll('.cell')[i]?.querySelector('.cell__xog') ?? null),
        { i: g0.i, src: scaleScript },
      );
      num('ghost', `first ghost scale at +${k} from its onset`, sc, interp(REF.hint.ghostScale, k), 0.05);
      await capture(page, 'ghost', `g0-${String(k).padStart(4, '0')}`, boardBox, { video: 'v3', ms: T0.v3Open + REF.hint.ghostFirst + k, box: boardBox });
    }
  }
  await seek(page, t0, 2400);
  const holes = await page.evaluate(() => ((document.querySelector('.hint-dim path')?.getAttribute('d') ?? '').match(/M/g)?.length ?? 1) - 1);
  note(g, 'ghost cells / dim holes', `${ghost.length} / ${holes}`, 'ghosts = holes − the focus (16 / 17 on theirs)', ghost.length === holes - 1 ? 'pass' : 'FAIL');
  const geo = await page.evaluate(() => {
    const R = (s: string): Box | null => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
    const card = document.querySelector('.hint-card') as HTMLElement | null;
    const apply = document.querySelector('.hint-apply') as HTMLElement | null;
    return { board: R('.board'), card: R('.hint-card'), apply: R('.hint-apply'), radius: card ? parseFloat(getComputedStyle(card).borderTopLeftRadius) : NaN, cardFill: card ? getComputedStyle(card).backgroundColor : '', applyFill: apply ? getComputedStyle(apply).backgroundColor : '', banner: R('[data-testid="mock-banner"]') };
  });
  if (geo.board && geo.card && geo.apply) {
    num(g, 'card width', geo.card.right - geo.card.left, REF.hint.card.w, 2);
    num(g, 'card bottom above the board card (px)', geo.board.top - geo.card.bottom, REF.hint.card.gapAboveBoard, 2);
    num(g, 'card centre x', cxOf(geo.card), 201, 2);
    num(g, 'card bottom (y)', geo.card.bottom, REF.hint.card.bottom, 2);
    num(g, 'card radius', geo.radius, REF.hint.card.radius, 1);
    num(g, 'Apply width', geo.apply.right - geo.apply.left, REF.hint.apply.w, 2);
    num(g, 'Apply height', geo.apply.bottom - geo.apply.top, REF.hint.apply.h, 2);
    num(g, 'Apply top below the board card (px)', geo.apply.top - geo.board.bottom, REF.hint.apply.gapBelowBoard, 2);
    num(g, 'Apply centre x', cxOf(geo.apply), REF.hint.apply.cx, 2, 'design');
    colour(g, 'card fill (cc)', rgbHex(geo.cardFill), REF.colours.hintCard, 3);
    colour(g, 'Apply fill', rgbHex(geo.applyFill), REF.colours.apply, null, 'design');
    note(g, 'banner while open', geo.banner && geo.banner.bottom > geo.banner.top ? 'shown' : 'hidden', 'hidden', geo.banner && geo.banner.bottom > geo.banner.top ? 'FAIL' : 'pass', 'D-2d1-13');
  }
  await capture(page, g, 'settled', full, { video: 'v3', ms: 2400, box: full }, 1 / 3);
  await shot(page, 'hint-402');

  // Apply
  await page.evaluate(() => (window as unknown as FxWindow).__fx.watch('.cell.fx-mark'));
  await page.locator('.hint-apply').click();
  await page.evaluate(() => (window as unknown as FxWindow).__fx.stamp());
  const a0 = await t0Of(page, 'Apply');
  const marked = ghost.map((x) => x.i);
  const ga = 'apply';
  const firstX = marked[0] ?? 0;
  for (const t of [0, 16, 33, 66, 83, 116, 150, 200, 250, 270, 400, 560, 720]) {
    await seek(page, a0, t);
    const p = await probe(page, firstX);
    const parts = await page.evaluate(
      ({ i, src }) => {
        const scaleOf = new Function(`return (${src})`)() as (e: Element | null) => number;
        const c = document.querySelectorAll('.cell')[i];
        const a = c?.querySelector('.cell__xb--a rect.cell__x') ?? null;
        const b = c?.querySelector('.cell__xb--b rect.cell__x') ?? null;
        const bt = b ? getComputedStyle(b).transform : 'none';
        const m = /matrix\(([^)]+)\)/.exec(bt);
        const sx = m ? Number((m[1] as string).split(',')[0]) : 1;
        return { a: scaleOf(a), bx: sx, overlay: document.querySelector('.overlay[data-overlay="hint"]:not([hidden])') !== null };
      },
      { i: firstX, src: scaleScript },
    );
    if (t === 0) note(ga, 'overlay gone in the Apply frame', String(!parts.overlay), 'true', parts.overlay ? 'FAIL' : 'pass');
    if (t <= 83) note(ga, `tile squish at +${t}`, f2(p.tileScale), t <= 50 ? '0.90 (hitch frame)' : '1.00', 'info');
    if (t <= 250) note(ga, `"\\\\" scale / "/" reveal / X group at +${t}`, `${f2(parts.a)} / ${f2(parts.bx)} / ${f2(p.xScale)}`, t >= 66 && t <= 116 ? `"\\\\" ${f2(interp(REF.hint.stroke1, t))} (length, from +66 after their 67 ms hitch)` : '', 'info');
    await capture(page, ga, String(t).padStart(4, '0'), boardBox, { video: 'v3', ms: T0.v3Apply + t, box: boardBox });
    if (t === 150) await shot(page, 'hint-apply-wave-402');
    if (t === 400) {
      const labs = p.labels;
      note(ga, 'labels after Apply', String(labs.length), 'one per completed line\'s anchor (2 on theirs)', 'info');
      for (const l of labs) {
        const anchor = Number(l.anchor);
        const q = await probe(page, anchor);
        if (q.cell) num(ga, `label of anchor ${anchor}: centre below the tile centre (px)`, cyOf(l.box) - cyOf(q.cell), REF.hint.labelDy * q.pitch, 2);
        num(ga, `label of anchor ${anchor}: inside the viewport (px)`, Math.min(l.box.left, q.vw - l.box.right), 2, null);
      }
    }
    if (t === 560 || t === 720) {
      // at +720 (fx.unitDone.labelMs) the label has faded out and may already be removed: gone reads as 0
      const op = p.labels[0]?.opacity ?? (t === 720 ? 0 : NaN);
      num(ga, `label opacity at +${t}`, op, t === 560 ? 1 : 0, t === 560 ? 0.05 : 0.15);
    }
  }
  note(ga, 'the draw-in onset', 'at the release', '≈ +50–66 (the app\'s 67 ms hitch held one frame)', 'design', 'helpers-spec §7.8: compared from +66');
  note(ga, 'wave on regions', 'king distance from the anchor (ours)', 'not recorded', 'design', 'helpers-spec §4.2');
}

/** The rest of the board: the win flow (period counter at 1 000, the ranking panel) and the victory screen. */
async function win(page: Page): Promise<void> {
  await page.clock.runFor(1500);
  await page.evaluate(() => (window as unknown as FxWindow).__fx.watch('.screen--game[data-status="won"], .pill--heads[data-out]'));
  const ok = await page.evaluate(() => (window as unknown as FxWindow).__mewdoku?.solve() ?? false);
  note('win', 'the board solved by the e2e hook', String(ok), 'true', ok ? 'pass' : 'FAIL');
  const w0 = await page.evaluate(() => performance.now());
  await seek(page, w0, 1000);
  await shot(page, 'win-1000-402');
  for (let t = 1000; t <= 6000; t += 250) {
    await seek(page, w0, t);
    if (await page.locator('.ranking__tap').isVisible().catch(() => false)) break;
  }
  await until(page, 'the ranking panel', () => page.locator('.ranking__tap').isVisible().catch(() => false), 50, 300);
  await until(page, 'the ranking panel\'s tap', () => page.evaluate(() => document.querySelector('.ranking__tap:not([aria-disabled="true"])') !== null), 100, 300);
  await page.evaluate(() => (window as unknown as FxWindow).__fx.seek());
  await shot(page, 'win-ranking-402');
  await page.locator('.ranking__tap').click();
  await until(page, 'the victory screen', () => page.evaluate(() => document.querySelector('.overlay[data-overlay="victory"]:not([hidden]), .victory') !== null), 50, 300);
  await page.clock.runFor(1500);
  await page.evaluate(() => (window as unknown as FxWindow).__fx.seek());
  await shot(page, 'victory-402');
}

// ─────────────────────────────── main ───────────────────────────────

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  if (SCRATCH) mkdirSync(SCRATCH, { recursive: true });
  const server = await serve(arg('--url'), 4994, 'helpers-compare');
  const browser = await chromium.launch();
  try {
    const page = await open(browser, server.url);
    await shot(page, 'home-402');
    await page.evaluate(() => (window as unknown as FxWindow).__fx.start());
    await page.locator('.home__play').click();
    await until(page, 'the board', () => page.evaluate(() => (window as unknown as FxWindow).__mewdoku?.state()?.status === 'playing'), 100, 200);
    await until(page, 'the lazy fx and board chunks', () => page.evaluate(() => document.querySelector('.game-fx[data-celebrate="ready"]') !== null), 50, 600);
    const tileColours = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      return { denim: css.getPropertyValue('--r4').trim() };
    });
    colour('palette', 'Denim, colour 4 (PNG)', tileColours.denim.toUpperCase(), REF.colours.denim, 1);
    await tickers(page);
    // (1,8): the corner colour's other tile, so the colour has one open tile, as the recording's one-tile colour
    await page.locator('.cell').nth(17).click();
    await page.clock.runFor(1200);
    await mouse(page);
    await kitty(page);
    await bulb(page);
    await win(page);
    await page.context().close();
  } finally {
    await browser.close();
    server.stop();
  }
  writeComposites();
  const md = ['| Group | Item | Ours | The recordings | Δ | Verdict |', '|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.group} | ${r.item} | ${r.ours} | ${r.ref} | ${r.diff} | ${r.verdict} |`)].join('\n');
  const fails = rows.filter((r) => r.verdict === 'FAIL');
  console.log(md);
  const count = (v: Verdict): number => rows.filter((r) => r.verdict === v).length;
  console.log(`\n${count('pass')} pass, ${fails.length} FAIL, ${count('info')} info, ${count('design')} by design${FRAMES2 ? '' : ' (no reference frames: MEWDOKU_ORIG_FRAMES2 not set; numbers only)'}`);
  if (SCRATCH) {
    writeFileSync(join(SCRATCH, 'helpers-report.md'), `${md}\n`);
    writeFileSync(join(SCRATCH, 'helpers-report.json'), JSON.stringify(rows, null, 1));
  }
  process.exitCode = fails.length ? 1 : 0;
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 2;
});
