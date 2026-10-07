// Owner: ui-board
// The board card (04 §5.3): a role="grid" of <button class="cell"> built once per puzzle; per-cell
// --c / --it --ir --ib --il / --pat variables; state in data-s (e|m|c|w|g); data-done for faded
// regions; diff-only updates. Owns gestures + keyboard wiring and the board's transient FX.
import { cfg } from '../../app/config';
import type { CellIndex } from '../../engine/types';
import { CellState, type GameEvent } from '../../game/types';
import { t } from '../../i18n';
import { shake } from '../fx/shake';
import { buildCell, cellLabel, ensureCat, ensurePattern, setCatMood, STATE_CODE, type CellRefs } from './board-cells';
import { createFxTimers, entryTiming, flashClass, sparkle } from './board-fx';
import { attachGestures } from './gestures';
import { attachKeyboard, type KeyboardHandle } from './keyboard';
import { applyHighlight } from './board-highlight';
import type { BoardHighlight, BoardInput, BoardModel, BoardView, BoardViewOptions, CatMood } from './board-types';
import { regionInsets } from './layout';

export type { BoardHighlight, BoardInput, BoardModel, BoardView, BoardViewOptions, CatMood } from './board-types';

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
    '--board-radius': `${L.boardRadius}px`,
    '--cell-r': String(L.cellRadiusFraction),
    '--mark-op': String(L.markOpacity),
    '--mark-w': String(L.markStrokeFraction * 100),
    '--x-len': String(Math.ceil(L.markScale * 100 * Math.SQRT2)),
    '--wrong-ring': `${L.wrongRingPx}px`,
    '--hint-dim': String(1 - L.hintDim),
    '--pat-op': String(L.patternOpacity),
    '--pat-op-done': String(L.patternOpacityDone),
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
  const pad = cfg.layout.boardPad;
  el.style.setProperty('--pad', `${pad}px`);
  applyRenderVars(el);

  const timers = createFxTimers(); // per-event transient FX
  const moodTimers = createFxTimers(); // sad → back to base mood
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
  const label = (cell: CellIndex, state: number): string => cellLabel(cell, m.n, paletteOf(cell), state, m.patterns);
  const reduced = (): boolean => opts.reducedMotion();

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
    keyboard?.detach();
    cellMood.clear();
    while (el.firstChild) el.removeChild(el.firstChild);
    const n = m.n;
    el.style.setProperty('--n', String(n));
    el.dataset.n = String(n);
    el.setAttribute('aria-label', t('a11y.board', { n }));
    el.setAttribute('aria-rowcount', String(n));
    el.setAttribute('aria-colcount', String(n));
    const insets = regionInsets(n, m.regions);
    cells = [];
    rows = [];
    regionCells = Array.from({ length: n }, () => []);
    for (let r = 0; r < n; r++) {
      const row = document.createElement('div');
      row.className = 'board__row';
      row.setAttribute('role', 'row');
      for (let c = 0; c < n; c++) {
        const i = r * n + c;
        const refs = buildCell(i, paletteOf(i), insets[i] as (typeof insets)[number], r);
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
        if (!rm) for (const i of ev.cells) if (cells[i]) flashClass(cells[i].el, 'fx-draw', cfg.fx.markDrawMs + 60, timers);
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
    setSlot(px) {
      if (px === slotPx && el.style.getPropertyValue('--slot') !== '') return;
      slotPx = px;
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
    setMood(next) {
      moodTimers.clear();
      baseMood = next;
      setMoodInternal(next);
    },
    playEvent,
    playEntry() {
      const { durationMs, staggerMs } = entryTiming(m.n, reduced());
      el.style.setProperty('--entry-ms', `${durationMs}ms`);
      el.style.setProperty('--entry-stagger', `${staggerMs}ms`);
      flashClass(el, 'fx-entry', cfg.fx.boardEntryMs + 80, timers);
    },
    focusCell(i) {
      keyboard?.focus(i, true);
    },
    destroy() {
      timers.clear();
      moodTimers.clear();
      keyboard?.detach();
      detachGestures();
      el.parentNode?.removeChild(el);
    },
  };

  build();
  return view;
}
