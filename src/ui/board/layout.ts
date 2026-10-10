// Owner: A (Phase 2b); G2 (Phase 2d: the measured stack, one scale s, gapFor, insets = gap / 2)
// Pure sizing math (look-spec §1.1, §1.8), tile insets (even gutters, every side gap / 2), hit-testing
// and drag interpolation (02 §6.1, 04 §5.4). No DOM access except readViewport().
// Phase 2d (look-spec §1.1): the game screen is a top-down stack of the rows and gaps measured on the
// user's recording at 402 CSS px (layout.game), all scaled by one factor s (width- or height-bound),
// with the square board card in it; the spare height goes above the bar (at most topSpareMax × s) and
// the rest below. The 2b row names (topBar, pills, chips, tools) stay until I-3 with 2d values.
import { cfg, type GameConfig } from '../../app/config';
import type { CellIndex } from '../../engine/types';

export interface LayoutInput {
  /** visualViewport width/height in CSS px. */
  readonly vw: number;
  readonly vh: number;
  readonly safeTop: number;
  readonly safeBottom: number;
  readonly n: number;
  /**
   * Root font size ÷ 16 (user text scaling, 02 §18 "rem-based sizes"). Above 1 the rules row grows by
   * min(rulesGrowMax, textScale × 1.15) (not in compact mode) and the bar by min(rulesGrowMax,
   * textScale) (look-spec §1.1 barH, rulesH); the board gives up the space.
   */
  readonly textScale?: number;
  /** Phase 2d: the banner band is reserved on this game screen (GameView.bannerBand). Default false. */
  readonly banner?: boolean;
}

/** Result of the look-spec §1.1 formulas. All values in CSS px. */
export interface GameLayout {
  /** Phase 2d: the screen's scale s (look-spec §1.1). */
  readonly s: number;
  /** refWidth × s: the game column, centred in the viewport. */
  readonly colW: number;
  /** s < layout.game.compactScale: the rule cards show diagrams only. */
  readonly compact: boolean;
  /** y0: the top of the bar band in viewport px (safeTop + spare above). */
  readonly top: number;
  /** Row heights in px: bar and rules (both grown by the text scale: barH, rulesH of look-spec §1.1), pills, tools (the disc diameter). */
  readonly bar: number;
  readonly pills: number;
  readonly rules: number;
  readonly tools: number;
  /** Gaps in px; toolsToBanner is 0 without the band. */
  readonly gaps: {
    readonly barToPills: number;
    readonly pillsToRules: number;
    readonly rulesToBoard: number;
    readonly boardToTools: number;
    readonly toolsToBanner: number;
    readonly bottom: number;
  };
  /** The banner itself: ads.banner.bannerPx with the band, else 0. */
  readonly band: number;
  readonly boardMax: number;
  /** Card edge → first slot edge, whole px ≥ 3. */
  readonly pad: number;
  /** Whole px: floor((boardMax − 2·pad) / n), at least 1. */
  readonly slot: number;
  /** slot × n + 2 × pad. */
  readonly board: number;
  /** gapFor(slot). */
  readonly gap: number;
  /** Board card corner radius: layout.game.cardRadius × s. */
  readonly radius: number;
  /** 2b names kept until I-3, with 2d values from S0: topBar = bar, chips = rules (and `pills`, `tools` above). */
  readonly topBar: number;
  readonly chips: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * look-spec §1.1 (all values from layout.game; A = vh − safeTop − safeBottom; B = the banner when
 * the band is reserved):
 *   fixed = every row and gap but the board (toolsToBanner only with the band); card = refWidth − 2·cardMargin
 *   s = clamp(min(min(vw, refWidth·maxScale) / refWidth, (A − B) / (fixed + card)), minScale, maxScale)
 *   boardMax = min(colW − 2·cardMargin·s, A − B − rest·s − barH − rulesH)
 *   pad = max(3, round(cardPad·s)); slot = max(1, floor((boardMax − 2·pad) / n)); gap = gapFor(slot)
 *   y0 = safeTop + min(max(0, spare) / 2, topSpareMax·s)
 * Degenerate viewports clamp the slot to ≥ 1 px so callers never see 0 or negative sizes.
 */
export function computeLayout(input: LayoutInput, c: GameConfig = cfg): GameLayout {
  const G = c.layout.game;
  const n = Math.max(1, Math.floor(input.n));
  const safeTop = Math.max(0, input.safeTop || 0);
  const safeBottom = Math.max(0, input.safeBottom || 0);
  const vw = Math.max(0, input.vw || 0);
  const A = Math.max(0, (input.vh || 0) - safeTop - safeBottom);
  const banner = input.banner === true;
  const B = banner ? c.ads.banner.bannerPx : 0;
  const toolsToBanner = banner ? G.toolsToBanner : 0;
  const fixed =
    G.bar + G.barToPills + G.pills + G.pillsToRules + G.rules + G.rulesToBoard + G.boardToTools + G.tools + toolsToBanner + G.bottom;
  const card = G.refWidth - 2 * G.cardMargin;
  const sW = Math.min(vw, G.refWidth * G.maxScale) / G.refWidth;
  const sH = (A - B) / (fixed + card);
  const s = clamp(Math.min(sW, sH), G.minScale, G.maxScale);
  const colW = G.refWidth * s;
  const compact = s < G.compactScale;
  const textScale = input.textScale ?? 1;
  const big = textScale > 1;
  const rules = G.rules * s * (big && !compact ? Math.min(G.rulesGrowMax, textScale * 1.15) : 1);
  const bar = G.bar * s * (big ? Math.min(G.rulesGrowMax, textScale) : 1);
  const rest = (fixed - G.rules - G.bar) * s; // the rows and gaps that never grow
  const boardMax = Math.max(0, Math.min(colW - 2 * G.cardMargin * s, A - B - rest - bar - rules));
  const pad = Math.max(3, Math.round(G.cardPad * s));
  const slot = Math.max(1, Math.floor((boardMax - 2 * pad) / n));
  const board = slot * n + 2 * pad;
  const spare = A - rest - bar - rules - board - B;
  const top = safeTop + Math.min(Math.max(0, spare) / 2, G.topSpareMax * s);
  const pills = G.pills * s;
  const tools = G.tools * s;
  return {
    s,
    colW,
    compact,
    top,
    bar,
    pills,
    rules,
    tools,
    gaps: {
      barToPills: G.barToPills * s,
      pillsToRules: G.pillsToRules * s,
      rulesToBoard: G.rulesToBoard * s,
      boardToTools: G.boardToTools * s,
      toolsToBanner: toolsToBanner * s,
      bottom: G.bottom * s,
    },
    band: B,
    boardMax,
    pad,
    slot,
    board,
    gap: gapFor(slot, c),
    radius: G.cardRadius * s,
    topBar: bar,
    chips: rules,
  };
}

/** Gap between tiles for a slot (look-spec §1.8): max(1, round(slot × layout.game.gapFraction)). */
export function gapFor(slotPx: number, c: GameConfig = cfg): number {
  return Math.max(1, Math.round(Math.max(0, slotPx) * c.layout.game.gapFraction));
}

/** Inset of a tile inside its slot per side (CSS px). With even gutters all four sides are equal. */
export interface CellInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * Even gutters (look-spec §1.8): every tile is inset gapFor(slot) / 2 on every side (slot 38 → a 3 px
 * gap, 1.5 px insets). Nothing depends on regions. One entry per cell, in the CellInsets shape.
 */
export function evenInsets(n: number, slotPx: number, c: GameConfig = cfg): CellInsets[] {
  const v = gapFor(slotPx, c) / 2;
  const one: CellInsets = Object.freeze({ top: v, right: v, bottom: v, left: v });
  return Array.from({ length: Math.max(0, n * n) }, () => one);
}

/** Where the board's cell grid sits on screen. left/top = client coords of the card's outer corner. */
export interface BoardGeometry {
  readonly left: number;
  readonly top: number;
  readonly pad: number;
  readonly slot: number;
  readonly n: number;
}

function clampIndex(v: number, n: number): number {
  return v < 0 ? 0 : v >= n ? n - 1 : v;
}

/** Cell under a client point; the gap belongs to the nearest cell; clamped to the grid (02 §6.1). */
export function hitTest(clientX: number, clientY: number, g: BoardGeometry): CellIndex {
  const slot = g.slot > 0 ? g.slot : 1;
  // Insets are even (the same on every side of every tile), so the slot edge is the midpoint of each
  // gap and floor() assigns each half-gap to its nearest tile.
  const col = clampIndex(Math.floor((clientX - g.left - g.pad) / slot), g.n);
  const row = clampIndex(Math.floor((clientY - g.top - g.pad) / slot), g.n);
  return row * g.n + col;
}

/**
 * Cells crossed going from `from` (exclusive) to `to` (inclusive), cell by cell (no skipped cells).
 * A DDA walk between cell centres: every step moves to a king-adjacent cell, so a fast swipe that
 * jumps several cells between two pointermove events still paints every cell on its path.
 */
export function cellsAlongSegment(from: CellIndex, to: CellIndex, n: number): CellIndex[] {
  if (from === to) return [];
  const r0 = Math.floor(from / n);
  const c0 = from % n;
  const r1 = Math.floor(to / n);
  const c1 = to % n;
  const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
  const out: CellIndex[] = [];
  let prev = from;
  for (let k = 1; k <= steps; k++) {
    const r = Math.round(r0 + ((r1 - r0) * k) / steps);
    const c = Math.round(c0 + ((c1 - c0) * k) / steps);
    const cell = r * n + c;
    if (cell !== prev) out.push(cell);
    prev = cell;
  }
  return out;
}

export interface ViewportInfo {
  readonly vw: number;
  readonly vh: number;
  readonly safeTop: number;
  readonly safeBottom: number;
  readonly safeLeft: number;
  readonly safeRight: number;
  /** Root font size in CSS px (16 unless the user scales text). */
  readonly remPx: number;
}

const probes = new WeakMap<Document, HTMLElement>();
/** Probe values (safe areas, rem) per document, valid while the window keeps this size and zoom. */
const probeCache = new WeakMap<Document, { key: string; safe: [number, number, number, number]; remPx: number }>();

function safeAreaProbe(doc: Document): HTMLElement | null {
  let probe = probes.get(doc) ?? null;
  if (probe && probe.isConnected) return probe;
  if (!doc.body) return null;
  probe = doc.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;font-size:1rem;' +
    // Phase 2d (look-spec §1.1): dev and e2e builds may stand in for a device's safe areas with
    // --dev-safe-top / --dev-safe-bottom on :root (never set in production; tokens.css does the same).
    'padding:max(env(safe-area-inset-top,0px),var(--dev-safe-top,0px)) env(safe-area-inset-right,0px) ' +
    'max(env(safe-area-inset-bottom,0px),var(--dev-safe-bottom,0px)) env(safe-area-inset-left,0px);';
  doc.body.appendChild(probe);
  probes.set(doc, probe);
  return probe;
}

function px(v: string | null | undefined): number {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? n : 0;
}

/**
 * The visual viewport at page scale 1 (02 §19), falling back to innerWidth/innerHeight, plus
 * env(safe-area-inset-*) and the root font size via a probe.
 * - Pinch-zoom (A11Y-2) changes visualViewport.width/height by 1/scale; multiplying by `scale` gives
 *   the unzoomed size, so magnifying never shrinks the board, while the on-screen keyboard and URL
 *   bar (which change the visual viewport at scale 1) are still followed.
 * - The probe needs a computed-style read, which forces a style recalc when the document is dirty
 *   (RP-3: a board mount paid one for every relayout). Its values only change with the window size,
 *   orientation or zoom, so they are cached under that key; `fresh` re-reads them.
 */
export function readViewport(win: Window = window, fresh = false): ViewportInfo {
  const vv = win.visualViewport;
  const scale = vv && vv.scale > 0 ? vv.scale : 1;
  const vw = vv && vv.width > 0 ? vv.width * scale : win.innerWidth;
  const vh = vv && vv.height > 0 ? vv.height * scale : win.innerHeight;
  const doc = win.document;
  const key = `${win.innerWidth}x${win.innerHeight}@${win.devicePixelRatio || 1}`;
  let cached = probeCache.get(doc);
  if (fresh || !cached || cached.key !== key || !probes.get(doc)?.isConnected) {
    const probe = safeAreaProbe(doc);
    const cs = probe ? win.getComputedStyle(probe) : null;
    const rem = px(cs?.fontSize);
    cached = {
      key,
      safe: [px(cs?.paddingTop), px(cs?.paddingRight), px(cs?.paddingBottom), px(cs?.paddingLeft)],
      remPx: rem > 0 ? rem : 16,
    };
    probeCache.set(doc, cached);
  }
  const [safeTop, safeRight, safeBottom, safeLeft] = cached.safe;
  return { vw, vh, safeTop, safeBottom, safeLeft, safeRight, remPx: cached.remPx };
}
