// Owner: B (Phase 2b); G2 (Phase 2d: the card frame and tile radius from the layout, the X pop and
// the mouse's staggered X's, look-spec §1.8, §1.10, §1.12)
// The board card (04 §5.3): a role="grid" of <button class="cell"> built once per puzzle; state in
// data-s (e|m|c|w|g); data-done for faded regions; diff-only updates. Owns gestures + keyboard wiring
// and the board's transient FX.
// PERF-1 (2b review): every custom property that is the same for all cells lives on the board, set
// once — the even insets (--it --ir --ib --il = gap / 2), the gap and tile radius (--gap, --cell-r),
// all re-set by setSlot, the card frame (--pad, --board-radius) and the entry timing (--entry-*, set at build for n, so playEntry on the
// attached board only adds .fx-entry and the new board's first style pass is the only one). The
// per-cell ones sit on the element that reads them (board-cells.ts), never on the cell button.
// Phase 2b (B, §2.9): the board entry (card rise + diagonal tile wave; playEntry returns
// entryEndMs(n), when START is due), the board-cat idle loops (CSS breathing with a per-cat phase,
// JS-timed ear flicks every fx.earFlickMinMs…MaxMs; both only in the idle mood and never with reduced
// motion) and the event accessory layered over every cat (§4.4, setAccessory).
import { cfg } from '../../app/config';
import type { CellIndex } from '../../engine/types';
import { CellState, type GameEvent } from '../../game/types';
import { onLocaleChanged, t } from '../../i18n';
import { shake } from '../fx/shake';
import { buildCell, cellLabel, ensureCat, ensurePattern, setCatMood, STATE_CODE, type CellRefs } from './board-cells';
import type { EventAccessory } from '../../game/events';
import { cellNoise, createFxTimers, earFlickDelayMs, entryEndMs, entryTiming, flashClass, sparkle } from './board-fx';
import { attachGestures } from './gestures';
import { attachKeyboard, type KeyboardHandle } from './keyboard';
import { applyHighlight } from './board-highlight';
import type { BoardFrame, BoardHighlight, BoardInput, BoardModel, BoardView, BoardViewOptions, CatMood } from './board-types';
import { evenInsets, gapFor, type CellInsets } from './layout';

export type { BoardFrame, BoardHighlight, BoardInput, BoardModel, BoardView, BoardViewOptions, CatMood } from './board-types';

const sameBytes = (a: ArrayLike<number>, b: ArrayLike<number>): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

const isCatState = (s: number): boolean => s === CellState.Cat || s === CellState.Given;

/** Publishes the cfg.layout render values (02 §17.4, §18) as CSS variables read by board.css. */
function applyRenderVars(el: HTMLElement): void {
  const L = cfg.layout;
  const vars: Record<string, string> = {
    // The 2b card radius until setSlot brings the layout's frame (look-spec §1.8).
    '--board-radius': `${L.boardRadius}px`,
    // Phase 2d (look-spec §1.10): the X pop's length (board.css .fx-pop).
    '--x-pop-ms': `${cfg.fx.markPopMs}ms`,
    '--wrong-ring': `${L.wrongRingPx}px`,
    '--hint-dim': String(1 - L.hintDim),
    '--pat-op': String(L.patternOpacity),
    '--pat-op-done': String(L.patternOpacityDone),
    // phase2b §2.9 idle loops (fx.css): breathing period and peak scale, ear-flick length.
    '--breathe-ms': `${cfg.fx.catBreatheMs}ms`,
    '--breathe-k': String(1 + cfg.fx.catBreatheScale),
    '--flick-ms': `${cfg.fx.earFlickMs}ms`,
    // phase2b §2.2: the solved-board glow's size (A's board.css .cell__glow), fx.win.glowScale × slot.
    '--glow-scale': String(cfg.fx.win.glowScale),
  };
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
}

/**
 * Extra scale for the colour-pattern glyph on small slots (02 §18): the glyph box is
 * layout.patternScale of the cell, grown to at least layout.patternMinPx (at most 1.6×) so the 12
 * shapes stay tellable apart on 11×11 / 12×12 boards. 1 on normal slots.
 */
export function patternScaleFor(slotPx: number): number {
  const L = cfg.layout;
  const box = L.patternScale * slotPx;
  if (!(box > 0)) return 1;
  return Math.min(1.6, Math.max(1, L.patternMinPx / box));
}

export function createBoardView(model: BoardModel, input: BoardInput, opts: BoardViewOptions): BoardView {
  const el = document.createElement('div');
  el.className = 'board';
  el.setAttribute('role', 'grid');
  el.dataset.mood = 'idle';
  /** Card edge → first slot edge (Phase 2d: from setSlot's frame; the 2b boardPad until one is given). */
  let pad = cfg.layout.boardPad;
  el.style.setProperty('--pad', `${pad}px`);
  applyRenderVars(el);

  const timers = createFxTimers(); // per-event transient FX
  const moodTimers = createFxTimers(); // sad → back to base mood
  const idleTimers = createFxTimers(); // ear flicks (phase2b §2.9)
  const flickPending = new Set<CellIndex>();
  const random = opts.random ?? Math.random;
  let accessory: EventAccessory | null = null;
  let m: BoardModel = model;
  let cells: CellRefs[] = [];
  let rows: HTMLElement[] = [];
  let regionCells: CellIndex[][] = [];
  let prevCells = new Uint8Array(0);
  let prevDone = 0;
  let wrongCount = 0;
  let slotPx = 0;
  let locked = false;
  let baseMood: CatMood = 'idle';
  let mood: CatMood = 'idle';
  let highlight: BoardHighlight | null = null;
  let keyboard: KeyboardHandle | null = null;
  const cellMood = new Map<CellIndex, CatMood>(); // per-cell overrides (kitty: surprised)

  const paletteOf = (cell: CellIndex): number => m.colors[m.regions[cell] as number] as number;
  /** Writes a board-level custom property only when it changes (an unchanged write still restyles). */
  const setVar = (k: string, v: string): void => {
    if (el.style.getPropertyValue(k) !== v) el.style.setProperty(k, v);
  };
  const applyInsets = (ins: CellInsets): void => {
    setVar('--it', `${ins.top}px`);
    setVar('--ir', `${ins.right}px`);
    setVar('--ib', `${ins.bottom}px`);
    setVar('--il', `${ins.left}px`);
  };
  /** The entry wave's timing for an n×n board (fx.css .board.fx-entry); reduced motion: a plain fade. */
  const applyEntryVars = (n: number, rm: boolean): void => {
    const { durationMs, staggerMs } = entryTiming(n, rm);
    const f = cfg.fx;
    setVar('--entry-ms', `${durationMs}ms`);
    setVar('--entry-stagger', `${staggerMs}ms`);
    setVar('--entry-start', `${rm ? 0 : f.boardEntryWaveStartMs}ms`);
    setVar('--entry-card-ms', `${rm ? durationMs : f.boardEntryCardMs}ms`);
    setVar('--entry-rise', `${rm ? 0 : f.boardEntryRisePx}px`);
    if (el.hasAttribute('data-entry-reduced') !== rm) el.toggleAttribute('data-entry-reduced', rm);
  };
  const label = (cell: CellIndex, state: number): string => cellLabel(cell, m.n, paletteOf(cell), state, m.patterns);
  const reduced = (): boolean => opts.reducedMotion();

  /** The event accessory `<use>` over a cat (phase2b §4.4), added after the cat group exists. */
  const applyAccessory = (refs: CellRefs): void => {
    const g = refs.cat?.parentNode as SVGGElement | null | undefined;
    if (!g || !refs.cat) return;
    let use = g.querySelector<SVGUseElement>('use.cell__acc');
    if (!accessory) {
      use?.remove();
      return;
    }
    if (!use) {
      use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('class', 'cell__acc');
      for (const a of ['x', 'y', 'width', 'height']) use.setAttribute(a, refs.cat.getAttribute(a) ?? '0');
      g.appendChild(use);
    }
    const href = `#acc-${accessory}`;
    if (use.getAttribute('href') !== href) use.setAttribute('href', href);
  };

  /**
   * Ear flick (phase2b §2.9): every earFlickMinMs…MaxMs per cat, the cat-ear-flick overlay shows
   * (.is-flick, fx.css rotates it 10° for fx.earFlickMs). The first delay comes from the cell's noise,
   * later ones from `random`. Skipped (but rescheduled) outside the idle mood, during the entry and with
   * reduced motion; a cell that is no longer a cat drops out.
   */
  const scheduleFlick = (i: CellIndex, first: boolean): void => {
    if (flickPending.has(i)) return;
    flickPending.add(i);
    idleTimers.later(earFlickDelayMs(first ? cellNoise(i, 3) : random()), () => {
      flickPending.delete(i);
      const refs = cells[i];
      if (!refs || !isCatState(m.cells[i] as number)) return;
      if (!reduced() && mood === 'idle' && !cellMood.has(i) && !el.classList.contains('fx-entry')) {
        flashClass(refs.el, 'is-flick', cfg.fx.earFlickMs, timers);
      }
      scheduleFlick(i, false);
    });
  };

  const applyCatMood = (cell: CellIndex): void => {
    const refs = cells[cell];
    if (!refs) return;
    const own = cellMood.get(cell);
    if (own) refs.el.dataset.mood = own;
    else delete refs.el.dataset.mood;
    setCatMood(refs, own ?? mood);
  };

  const setMoodInternal = (next: CatMood): void => {
    mood = next;
    el.dataset.mood = next;
    for (let i = 0; i < cells.length; i++) if (isCatState(m.cells[i] as number)) applyCatMood(i);
  };

  const renderCell = (i: CellIndex, state: number): void => {
    const refs = cells[i];
    if (!refs) return;
    refs.el.dataset.s = STATE_CODE[state] ?? 'e';
    refs.el.setAttribute('aria-label', label(i, state));
    if (isCatState(state)) {
      ensureCat(refs, cellMood.get(i) ?? mood);
      applyCatMood(i);
      applyAccessory(refs);
      scheduleFlick(i, true);
    } else {
      cellMood.delete(i);
    }
  };

  const renderDone = (done: number): void => {
    for (let g = 0; g < regionCells.length; g++) {
      const on = ((done >> g) & 1) === 1;
      if ((((prevDone >> g) & 1) === 1) === on && cells.length && prevCells.length) continue;
      for (const i of regionCells[g] ?? []) {
        const c = cells[i];
        if (c) c.el.toggleAttribute('data-done', on);
      }
    }
    prevDone = done;
  };

  const renderPatterns = (): void => {
    el.toggleAttribute('data-patterns', m.patterns);
    if (m.patterns) cells.forEach((refs, i) => ensurePattern(refs, paletteOf(i)));
  };

  const build = (): void => {
    timers.clear();
    moodTimers.clear();
    idleTimers.clear();
    flickPending.clear();
    keyboard?.detach();
    cellMood.clear();
    while (el.firstChild) el.removeChild(el.firstChild);
    const n = m.n;
    el.style.setProperty('--n', String(n));
    el.dataset.n = String(n);
    el.setAttribute('aria-label', t('a11y.board', { n }));
    el.setAttribute('aria-rowcount', String(n));
    el.setAttribute('aria-colcount', String(n));
    // phase2b §1.5 even gutters (F0 switched from the region-aware insets): one value for every tile,
    // on the board (PERF-1); setSlot re-applies it. The entry timing for this n, before the board is
    // attached, so playEntry writes nothing (PERF-1).
    applyInsets(evenInsets(1, slotPx)[0] as CellInsets);
    applyEntryVars(n, reduced());
    cells = [];
    rows = [];
    regionCells = Array.from({ length: n }, () => []);
    for (let r = 0; r < n; r++) {
      const row = document.createElement('div');
      row.className = 'board__row';
      row.setAttribute('role', 'row');
      for (let c = 0; c < n; c++) {
        const i = r * n + c;
        // phase2b §2.9: the entry wave's diagonal (tile + SVG) and the breathing phase (the SVG box
        // breathes, fx.css), each on the element that animates (PERF-1).
        const refs = buildCell(i, paletteOf(i), null, r + c);
        refs.svg.style.setProperty('--breathe-delay', `${-Math.round(cellNoise(i, 4) * cfg.fx.catBreatheMs)}ms`);
        cells.push(refs);
        regionCells[m.regions[i] as number]?.push(i);
        row.appendChild(refs.el);
      }
      rows.push(row);
      el.appendChild(row);
    }
    baseMood = 'idle';
    mood = 'idle';
    el.dataset.mood = 'idle';
    prevCells = new Uint8Array(n * n);
    prevDone = 0;
    wrongCount = 0;
    for (let i = 0; i < n * n; i++) {
      const s = m.cells[i] as number;
      renderCell(i, s);
      prevCells[i] = s;
      if (s === CellState.Wrong) wrongCount++;
    }
    for (let g = 0; g < n; g++) {
      if (((m.regionsDone >> g) & 1) === 1) for (const i of regionCells[g] ?? []) cells[i]?.el.setAttribute('data-done', '');
    }
    prevDone = m.regionsDone;
    renderPatterns();
    keyboard = attachKeyboard(el, input, { n, cellElement: (i) => cells[i]?.el ?? null, isLocked: () => locked });
    if (highlight) applyHighlight(el, cells, highlight);
  };

  const diff = (next: BoardModel): void => {
    const patternsChanged = next.patterns !== m.patterns;
    m = next;
    let wrong = 0;
    for (let i = 0; i < prevCells.length; i++) {
      const s = next.cells[i] as number;
      if (s === CellState.Wrong) wrong++;
      if (s !== prevCells[i] || patternsChanged) {
        renderCell(i, s);
        prevCells[i] = s;
      }
    }
    if (wrong < wrongCount) {
      // Only RETRY clears Wrong cells: a fresh attempt starts with calm cats.
      moodTimers.clear();
      baseMood = 'idle';
      setMoodInternal('idle');
    }
    wrongCount = wrong;
    if (next.regionsDone !== prevDone) renderDone(next.regionsDone);
    if (patternsChanged) renderPatterns();
  };

  const moodFor = (ms: number, temp: CatMood): void => {
    moodTimers.clear();
    setMoodInternal(temp);
    moodTimers.later(ms, () => setMoodInternal(baseMood));
  };

  const catCells = (): HTMLElement[] => cells.filter((_, i) => isCatState(m.cells[i] as number)).map((c) => c.el);

  const playEvent = (ev: GameEvent): void => {
    const rm = reduced();
    switch (ev.type) {
      case 'MARKED':
        // Phase 2d (look-spec §1.10, §1.12): every new X pops (no stagger when painting several); the
        // mouse's X's pop fx.mouseStaggerMs apart, each hidden (.fx-pend) until its turn. Reduced
        // motion: all at once, no pop.
        if (rm) break;
        if (ev.source === 'mouse') {
          ev.cells.forEach((i, k) => {
            const refs = cells[i];
            if (!refs) return;
            if (k > 0) refs.el.classList.add('fx-pend');
            timers.later(k * cfg.fx.mouseStaggerMs, () => {
              refs.el.classList.remove('fx-pend');
              flashClass(refs.el, 'fx-pop', cfg.fx.markPopMs + 60, timers);
            });
          });
        } else {
          for (const i of ev.cells) if (cells[i]) flashClass(cells[i].el, 'fx-pop', cfg.fx.markPopMs + 60, timers);
        }
        break;
      case 'CAT_PLACED': {
        const refs = cells[ev.cell];
        if (!refs) break;
        if (ev.source === 'kitty') {
          cellMood.set(ev.cell, 'surprised');
          applyCatMood(ev.cell);
          timers.later(cfg.kitty.revealMs, () => {
            cellMood.delete(ev.cell);
            applyCatMood(ev.cell);
          });
          if (!rm) sparkle(refs.el, timers);
        }
        if (!rm) flashClass(refs.el, 'fx-drop', cfg.fx.catDropMs + 40, timers);
        break;
      }
      case 'MISTAKE': {
        const refs = cells[ev.cell];
        if (refs) flashClass(refs.el, 'fx-flash', cfg.fx.wrongShakeMs + 100, timers);
        shake(el, { reducedMotion: rm });
        if (ev.heartsLeft > 0) moodFor(cfg.fx.sadCatsMs, 'sad');
        break;
      }
      case 'REGION_DONE':
        if (!rm) for (const i of regionCells[ev.region] ?? []) if (cells[i]) flashClass(cells[i].el, 'fx-done', cfg.fx.regionFadeMs + 60, timers);
        break;
      case 'PULSE': {
        const refs = cells[ev.cell];
        if (refs) flashClass(refs.el, 'fx-pulse', 260, timers);
        break;
      }
      case 'WON':
        moodTimers.clear();
        baseMood = 'happy';
        moodTimers.later(cfg.fx.winHappyDelayMs, () => {
          setMoodInternal('happy');
          if (!rm) catCells().forEach((c, k) => timers.later(k * 45, () => flashClass(c, 'fx-hop', 520, timers)));
        });
        break;
      case 'LOST':
        moodTimers.clear();
        baseMood = 'sad';
        setMoodInternal('sad');
        break;
      case 'REVIVED':
        moodTimers.clear();
        baseMood = 'idle';
        setMoodInternal('idle');
        break;
      default:
        break;
    }
  };

  const detachGestures = attachGestures(
    el,
    { tap: (c) => input.tap(c), doubleTap: (c) => input.doubleTap(c), paint: (c, mode) => input.paint(c, mode) },
    {
      geometry: () => view.geometry(),
      cellState: (c) => (m.cells[c] ?? CellState.Empty) as CellState,
      isLocked: () => locked,
    },
  );

  const view: BoardView = {
    el,
    update(next) {
      const rebuild =
        next.puzzleId !== m.puzzleId || next.n !== m.n || !sameBytes(next.regions, m.regions) || !sameBytes(next.colors, m.colors);
      if (rebuild) {
        m = next;
        build();
      } else {
        diff(next);
      }
    },
    setSlot(px, frame) {
      // Phase 2d (look-spec §1.8): the card's padding and radius come with the slot from computeLayout.
      if (frame) {
        pad = frame.pad;
        setVar('--pad', `${frame.pad}px`);
        setVar('--board-radius', `${frame.radius}px`);
      }
      if (px === slotPx && el.style.getPropertyValue('--slot') !== '') return;
      slotPx = px;
      // The gap follows the slot (gapFor): every tile is inset gap / 2 on every side, one board-level
      // value (no per-cell writes, PERF-1). The tile radius is tileRadiusFraction of the tile edge
      // (slot − gap), published as a fraction of the slot (--cell-r).
      const gap = gapFor(px);
      applyInsets(evenInsets(1, slotPx)[0] as CellInsets);
      setVar('--gap', `${gap}px`);
      setVar('--cell-r', px > gap ? ((cfg.layout.game.tileRadiusFraction * (px - gap)) / px).toFixed(4) : '0');
      el.style.setProperty('--slot', `${px}px`);
      el.style.setProperty('--pat-k', patternScaleFor(px).toFixed(3));
    },
    geometry() {
      const r = el.getBoundingClientRect();
      const measured = r.width > 0 ? (r.width - 2 * pad) / m.n : 0;
      return { left: r.left, top: r.top, pad, slot: measured > 0 ? measured : slotPx, n: m.n };
    },
    cellElement: (i) => cells[i]?.el ?? null,
    cellRect: (i) => cells[i]?.tile.getBoundingClientRect() ?? null,
    setHighlight(h) {
      highlight = h;
      applyHighlight(el, cells, h);
    },
    setLocked(on) {
      locked = on;
      if (on) el.setAttribute('aria-disabled', 'true');
      else el.removeAttribute('aria-disabled');
    },
    setAccessory(next) {
      if (next === accessory) return;
      accessory = next;
      for (const refs of cells) if (refs.cat) applyAccessory(refs);
    },
    setMood(next) {
      moodTimers.clear();
      baseMood = next;
      setMoodInternal(next);
    },
    playEvent,
    playEntry() {
      // phase2b §2.9: the card rises boardEntryRisePx and fades in over boardEntryCardMs; tile (r, c)
      // scales in from boardEntryWaveStartMs + (r + c) × stagger (fx.css .board.fx-entry). Reduced
      // motion: a plain fade of reducedMotionFadeMs. START is due at the returned entryEndMs(n).
      // PERF-1: the --entry-* values were set at build for this n; they are only written again when
      // reduced motion changed since (an inline write on the attached board restyles every cell).
      const rm = reduced();
      applyEntryVars(m.n, rm);
      const end = entryEndMs(m.n, rm);
      flashClass(el, 'fx-entry', end + 80, timers);
      // The reduced fade runs on WAAPI: the global reduced-motion CSS rule shortens CSS animations to 1 ms.
      if (rm && typeof el.animate === 'function') {
        try {
          el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: end, easing: 'linear' });
        } catch {
          // shows at once
        }
      }
      return end;
    },
    focusCell(i) {
      keyboard?.focus(i, true);
    },
    destroy() {
      offLocale();
      timers.clear();
      moodTimers.clear();
      idleTimers.clear();
      flickPending.clear();
      keyboard?.detach();
      detachGestures();
      el.parentNode?.removeChild(el);
    },
  };

  build();
  // A11Y-I18N-1: the board's and every cell's accessible name follow Settings → Language at once
  // (they were built only on creation and state changes, so they stayed in the old language).
  const offLocale = onLocaleChanged(() => {
    const n = m.n;
    const boardLabel = t('a11y.board', { n });
    if (el.getAttribute('aria-label') !== boardLabel) el.setAttribute('aria-label', boardLabel);
    cells.forEach((refs, i) => {
      const v = label(i, m.cells[i] as number);
      if (refs.el.getAttribute('aria-label') !== v) refs.el.setAttribute('aria-label', v);
    });
  });
  return view;
}
