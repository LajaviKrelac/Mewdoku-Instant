// Owner: ui-board
// Dev harness (not shipped): renders the board, HUD and art in isolation. Run
// `npx vite --port 5174 --strictPort` and open /dev/board-harness.html?scene=…
//   scene=game&n=5|9|12[&patterns=1][&hint=1][&coach=1][&hard=1][&fb=1][&mood=sad|happy][&rm=1]
//   scene=gallery (cat moods, icons, glyphs, marks)   scene=illus (illustrations)
// The game scene is playable with the real reducer (tap, double-tap, drag; H = hint).
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/board.css';
import '../src/styles/hud.css';
import '../src/styles/overlays.css';
import '../src/styles/fx.css';
import { cfg } from '../src/app/config';
import { recordToPuzzle } from '../src/engine/codec';
import { growRegions, randomKingPerm } from '../src/engine/generator';
import { getHintStep } from '../src/engine/hint';
import { makeRng } from '../src/engine/rng';
import type { CellIndex, LevelPack, Puzzle } from '../src/engine/types';
import { newGame } from '../src/game/factory';
import { reduce } from '../src/game/reducer';
import { CellState, type Action, type GameState } from '../src/game/types';
import { t } from '../src/i18n';
import pack from '../src/data/levels/pack-000.json';
import { illustration, type IllustrationKind } from '../src/ui/art/illustrations';
import { regionColorsFor } from '../src/ui/art/palette';
import { icon, mountSprite, type SymbolId } from '../src/ui/art/sprite';
import { createBoardView, type BoardModel, type CatMood } from '../src/ui/board/board-view';
import { computeLayout, readViewport } from '../src/ui/board/layout';
import { createAnnouncer } from '../src/ui/a11y/announcer';
import { burstConfetti } from '../src/ui/fx/confetti';
import { applyMotion } from '../src/ui/fx/motion';
import { createPills } from '../src/ui/hud/pills';
import { createRuleChips } from '../src/ui/hud/rule-chips';
import { createToolBar } from '../src/ui/hud/tool-bar';
import { createTopBar } from '../src/ui/hud/top-bar';

const q = new URLSearchParams(location.search);
const root = document.getElementById('app') as HTMLElement;
mountSprite();
applyMotion(root, q.get('rm') === '1');

function puzzleOfSize(n: number): Puzzle {
  const levels = (pack as unknown as LevelPack).levels;
  const rec = levels.find((l) => l.n === n && !l.tut);
  if (rec) return recordToPuzzle(rec, `L${rec.i ?? 0}`);
  // No shipped board of this size in the placeholder pack: grow one (visual check only).
  const rng = makeRng(`harness:${n}`);
  const solution = randomKingPerm(n, rng);
  const regions = growRegions(n, solution, rng, 'balanced');
  return { id: `L${900 + n}`, n, k: 1, regions, solution, givens: [], grade: 3, effort: 0, hard: false };
}

/** Plays a scripted opening so the board shows every cell state. */
function seedState(p: Puzzle, s0: GameState): GameState {
  let s = reduce(s0, { type: 'START' }).state;
  const n = p.n;
  const act = (a: Action): void => {
    s = reduce(s, a).state;
  };
  const solCell = (r: number): CellIndex => r * n + (p.solution[r] as number);
  // Cats in rows 0 and 2 (their regions fade), marks around the first cat, one wrong attempt.
  act({ type: 'DOUBLE_TAP', cell: solCell(0), t: 1 });
  act({ type: 'DOUBLE_TAP', cell: solCell(2), t: 2 });
  const marks: CellIndex[] = [];
  for (let c = 0; c < n; c++) if (c !== p.solution[1] && c % 2 === 0) marks.push(n + c);
  act({ type: 'PAINT', cells: marks, mode: 'mark', t: 3 });
  const wrongCol = ((p.solution[n - 1] as number) + 2) % n;
  act({ type: 'DOUBLE_TAP', cell: (n - 1) * n + wrongCol, t: 4 });
  if (n >= 9) {
    act({ type: 'DOUBLE_TAP', cell: solCell(5), t: 5 });
    act({ type: 'TAP', cell: 3 * n + 1, t: 6 });
    act({ type: 'TAP', cell: 4 * n + 1, t: 7 });
  }
  return s;
}

function gameScene(): void {
  const n = Number(q.get('n') ?? 5);
  const puzzle = puzzleOfSize(n);
  const colors = regionColorsFor(puzzle, null);
  let state = q.get('fresh') === '1' ? reduce(newGame(puzzle, 'level'), { type: 'START' }).state : seedState(puzzle, newGame(puzzle, 'level'));
  const patterns = q.get('patterns') === '1';
  const announcer = createAnnouncer(document.body);
  const model = (): BoardModel => ({ puzzleId: puzzle.id, n, regions: puzzle.regions, colors, cells: state.cells, regionsDone: state.regionsDone, patterns });

  const dispatch = (a: Action): void => {
    const r = reduce(state, a);
    state = r.state;
    render();
    for (const ev of r.events) {
      board.playEvent(ev);
      pills.playEvent(ev);
      if (ev.type === 'CAT_PLACED') announcer.say(t('a11y.catPlaced', { placed: state.catsPlaced, n }));
      if (ev.type === 'WON') setTimeout(() => burstConfetti(document.body), cfg.fx.winOverlayDelayMs);
    }
  };

  const topBar = createTopBar(
    { title: t('game.title.level', { level: q.get('hard') === '1' ? 40 : 7 }), hard: q.get('hard') === '1', showHome: true, showSettings: true, showTrophy: false, fbSafeZone: q.get('fb') === '1' },
    { onHome: () => undefined, onSettings: () => undefined, onTrophy: () => undefined },
  );
  const pills = createPills({ catsPlaced: state.catsPlaced, n, hearts: state.hearts, maxHearts: 3, compact: false });
  const chips = createRuleChips({ compact: false, highlight: q.get('coach') === '1' ? 'space' : null });
  const hint = (): void => {
    if (state.status === 'playing') dispatch({ type: 'HINT_OPEN', step: getHintStep(puzzle, state.cells), charged: true });
    else if (state.status === 'hint') dispatch({ type: 'HINT_APPLY', t: performance.now() });
  };
  const tools = createToolBar({ hints: 5, kitties: 0, bulbEnabled: true, pawEnabled: true, hintsFree: false }, { onBulb: hint, onPaw: () => undefined });
  const board = createBoardView(
    model(),
    {
      tap: (cell) => dispatch({ type: 'TAP', cell, t: performance.now() }),
      doubleTap: (cell) => dispatch({ type: 'DOUBLE_TAP', cell, t: performance.now() }),
      paint: (cells, mode) => dispatch({ type: 'PAINT', cells, mode, t: performance.now() }),
      bulb: hint,
      paw: () => undefined,
    },
    { reducedMotion: () => q.get('rm') === '1' },
  );
  const screen = document.createElement('div');
  screen.className = 'screen screen--game';
  const col = document.createElement('div');
  col.className = 'game__col';
  const hud = document.createElement('div');
  hud.className = 'game__hud';
  hud.append(pills.el, chips.el);
  const stage = document.createElement('div');
  stage.className = 'game__stage';
  stage.appendChild(board.el);
  const toolRow = document.createElement('div');
  toolRow.className = 'game__tools';
  toolRow.appendChild(tools.el);
  col.append(hud, stage, toolRow);
  screen.append(topBar.el, col);
  root.appendChild(screen);

  const relayout = (): void => {
    const vp = readViewport(window);
    const L = computeLayout({ vw: Math.min(vp.vw, 560), vh: vp.vh, safeTop: vp.safeTop, safeBottom: vp.safeBottom, n });
    const vars: Record<string, string> = {
      '--col-w': `${L.colW}px`, '--top-bar': `${L.topBar}px`, '--pills': `${L.pills}px`, '--chips': `${L.chips}px`,
      '--tools': `${L.tools}px`, '--board': `${L.board}px`, '--vgap': `${cfg.layout.vGap}px`,
    };
    for (const [k, v] of Object.entries(vars)) screen.style.setProperty(k, v);
    screen.dataset.compact = String(L.compact);
    board.setSlot(L.slot);
    pills.update({ catsPlaced: state.catsPlaced, n, hearts: state.hearts, maxHearts: 3, compact: L.compact });
    chips.update({ compact: L.compact, highlight: q.get('coach') === '1' ? 'space' : null });
  };

  const coachCells = (): CellIndex[] | null => {
    if (q.get('coach') !== '1') return null;
    const r = Math.min(3, n - 1);
    return [r * n + (puzzle.solution[r] as number)];
  };

  function render(): void {
    board.update(model());
    pills.update({ catsPlaced: state.catsPlaced, n, hearts: state.hearts, maxHearts: 3, compact: screen.dataset.compact === 'true' });
    const coach = coachCells();
    board.setHighlight(state.openHint ? { kind: 'hint', step: state.openHint } : coach ? { kind: 'coach', cells: coach } : null);
    board.setLocked(state.status !== 'playing' || coach !== null);
  }

  window.addEventListener('resize', relayout);
  relayout();
  if (q.get('hint') === '1') hint();
  const mood = q.get('mood') as CatMood | null;
  if (mood) board.setMood(mood);
  render();
  if (q.get('entry') === '1') board.playEntry();
  (window as unknown as { __harness: unknown }).__harness = { dispatch, state: () => state, board, puzzle, CellState };
}

function swatch(label: string, el: Element): HTMLElement {
  const fig = document.createElement('figure');
  fig.className = 'hx-swatch';
  const cap = document.createElement('figcaption');
  cap.textContent = label;
  fig.append(el, cap);
  return fig;
}

function galleryScene(): void {
  const wrap = document.createElement('div');
  wrap.className = 'hx-gallery';
  const section = (title: string, items: HTMLElement[], cls = ''): void => {
    const h = document.createElement('h2');
    h.textContent = title;
    const row = document.createElement('div');
    row.className = `hx-row ${cls}`;
    row.append(...items);
    wrap.append(h, row);
  };
  const moods: SymbolId[] = ['cat-idle', 'cat-happy', 'cat-sad', 'cat-surprised'];
  section('Cat moods', moods.map((m) => swatch(m.slice(4), icon(m, { class: 'hx-cat' }))));
  const tiles = moods.map((m, k) => {
    const tile = document.createElement('div');
    tile.className = 'hx-tile';
    tile.style.background = `var(--r${[7, 2, 4, 0][k]})`;
    tile.appendChild(icon(m, { class: 'hx-tile-cat' }));
    return swatch(`on tile`, tile);
  });
  section('Cats on tiles (36 px slot)', tiles);
  const ids: SymbolId[] = [
    'icon-house', 'icon-gear', 'icon-bulb', 'icon-paw', 'icon-heart', 'icon-heart-empty', 'icon-trophy', 'icon-lock',
    'icon-calendar', 'icon-play-video', 'icon-close', 'icon-chevron', 'icon-rule-colours', 'icon-rule-lines', 'icon-rule-space',
  ];
  section('Icons', ids.map((id) => swatch(id.slice(5), icon(id, { class: 'hx-icon' }))));
  section('Pattern glyphs', Array.from({ length: 12 }, (_, i) => {
    const tile = document.createElement('div');
    tile.className = 'hx-tile';
    tile.style.background = `var(--r${i})`;
    tile.appendChild(icon(`glyph-${i}` as SymbolId, { class: 'hx-glyph' }));
    return swatch(String(i), tile);
  }));
  section('Marks', (['mark-x', 'wrong-x'] as SymbolId[]).map((id) => {
    const tile = document.createElement('div');
    tile.className = 'hx-tile';
    tile.style.background = 'var(--r10)';
    tile.appendChild(icon(id, { class: 'hx-tile-cat hx-mark' }));
    return swatch(id, tile);
  }));
  root.appendChild(wrap);
}

function illusScene(): void {
  const wrap = document.createElement('div');
  wrap.className = 'hx-gallery hx-illus';
  const kinds: IllustrationKind[] = ['home', 'boot', 'win', 'fail', 'daily', 'tutorial'];
  for (const k of kinds) wrap.appendChild(swatch(k, illustration(k, { class: 'hx-ill' })));
  root.appendChild(wrap);
}

const style = document.createElement('style');
style.textContent = `
  #app { overflow: auto; }
  .hx-gallery { padding: 16px; }
  .hx-gallery h2 { font-size: 1rem; margin: 18px 0 8px; color: var(--ink-2); }
  .hx-row { display: flex; flex-wrap: wrap; align-items: flex-end; }
  .hx-swatch { margin: 0 12px 12px 0; display: flex; flex-direction: column; align-items: center; font-size: .7rem; color: var(--ink-2); }
  .hx-cat { width: 84px; height: 84px; }
  .hx-icon { width: 32px; height: 32px; color: var(--ink); --icon-fill: var(--accent-soft); }
  .hx-tile { position: relative; width: 36px; height: 36px; border-radius: 6.5px; display: flex; align-items: center; justify-content: center; }
  .hx-tile-cat { width: 30px; height: 30px; }
  .hx-mark { color: var(--ink); }
  .hx-glyph { width: 18px; height: 18px; color: var(--ink); opacity: .55; }
  .hx-illus { display: flex; flex-wrap: wrap; }
  .hx-ill { width: 170px; height: 170px; }
  body.hx-dark .hx-ill { background: var(--scrim); }
`;
document.head.appendChild(style);

const scene = q.get('scene') ?? 'game';
if (scene === 'gallery') galleryScene();
else if (scene === 'illus') illusScene();
else gameScene();
