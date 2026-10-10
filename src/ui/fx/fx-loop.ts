// Owner: G3 (Phase 2d.1)
// One requestAnimationFrame loop for the game screen's celebration pieces (helpers-spec §2.4, §2.5, §4.3):
// every piece is a pure function of the time since its start (performance.now based), so a hidden page
// that pauses rAF catches up when it comes back (an elapsed piece ends at once), and Playwright's
// page.clock (which drives performance.now and rAF) lands each capture on an exact millisecond.
// Part of the lazy fx chunk (fx/celebrate.ts); nothing in the first load imports it.

export interface FxPiece {
  /** ms from now until the piece starts (its frame(0)); may be 0. */
  readonly delay: number;
  /** Length in ms; frame(dur) is the last frame, then end() runs. */
  readonly dur: number;
  /** Draws the piece at t ms since its start (0 ≤ t ≤ dur). */
  frame(t: number): void;
  /** Runs once after the last frame, or when the piece is cancelled (cancelled = true). */
  end?(cancelled: boolean): void;
}

export interface FxLoop {
  add(p: FxPiece): () => void;
  /** Ends every piece at once (cancelled = true). */
  cancel(): void;
  /** Pieces still running. */
  size(): number;
}

interface Running {
  readonly p: FxPiece;
  readonly t0: number;
  started: boolean;
}

export function createFxLoop(win: Window): FxLoop {
  const live = new Set<Running>();
  let raf = 0;
  const now = (): number => win.performance.now();

  const finish = (r: Running, cancelled: boolean): void => {
    if (!live.delete(r)) return;
    try {
      r.p.end?.(cancelled);
    } catch {
      // a piece never breaks the loop
    }
  };

  const step = (r: Running, at: number): void => {
    const t = at - r.t0;
    if (t < 0) return;
    r.started = true;
    r.p.frame(Math.min(t, r.p.dur));
    if (t >= r.p.dur) finish(r, false);
  };

  const tick = (): void => {
    raf = 0;
    const at = now();
    for (const r of [...live]) step(r, at);
    if (live.size > 0) raf = win.requestAnimationFrame(tick);
  };

  return {
    add(p) {
      const r: Running = { p, t0: now() + Math.max(0, p.delay), started: false };
      live.add(r);
      // A piece due now draws in this frame (the event's own frame, as measured).
      if (p.delay <= 0) step(r, r.t0);
      if (live.size > 0 && !raf) raf = win.requestAnimationFrame(tick);
      return () => finish(r, true);
    },
    cancel() {
      if (raf) win.cancelAnimationFrame(raf);
      raf = 0;
      for (const r of [...live]) finish(r, true);
    },
    size: () => live.size,
  };
}

/** Piecewise-linear value of keyframes [t, v] (sorted by t) at time t. */
export function keyed(frames: readonly (readonly [number, number])[], t: number): number {
  const first = frames[0];
  if (!first) return 0;
  if (t <= first[0]) return first[1];
  for (let i = 1; i < frames.length; i++) {
    const b = frames[i] as readonly [number, number];
    if (t <= b[0]) {
      const a = frames[i - 1] as readonly [number, number];
      const u = b[0] === a[0] ? 1 : (t - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * u;
    }
  }
  return (frames[frames.length - 1] as readonly [number, number])[1];
}

/** A small seeded PRNG (mulberry32): the shards and sparkles are the same on every run of a board. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** An absolutely placed, pointer-transparent element of the fx layer. */
export function fxEl(doc: Document, cls: string, css: string): HTMLElement {
  const el = doc.createElement('div');
  el.className = cls;
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = `position:absolute;left:0;top:0;pointer-events:none;${css}`;
  return el;
}

/** `<svg><use href="#id"/></svg>` sized w × h, absolutely placed. */
export function fxUse(doc: Document, cls: string, id: string, css: string): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.style.cssText = `position:absolute;left:0;top:0;overflow:visible;pointer-events:none;${css}`;
  const use = doc.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${id}`);
  svg.appendChild(use);
  return svg;
}

/** A centred SVG text label (the "+N", the completion label): a 0 × 0 svg at its centre point, overflow visible. */
export function fxText(doc: Document, cls: string, text: string, attrs: Readonly<Record<string, string>>): { svg: SVGSVGElement; text: SVGTextElement } {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '1');
  svg.setAttribute('height', '1');
  svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none;transform-origin:0 0';
  const el = doc.createElementNS(SVG_NS, 'text');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.textContent = text;
  svg.appendChild(el);
  return { svg, text: el };
}

export { SVG_NS };
