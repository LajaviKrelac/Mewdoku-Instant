// Owner: B (Phase 2b; was ui-board); lead (Phase 2d I-1: the game scene mounts the real 2d game screen)
// Dev harness (not shipped): renders the board, HUD and art in isolation. Run
// `npx vite --port 5174 --strictPort` and open /dev/board-harness.html?scene=…
//   scene=game&n=5|9|12[&patterns=1][&hint=1][&coach=1][&hard=1][&fb=1][&rm=1][&fresh=1][&entry=1]
//     [&video=1][&band=1][&dot=0][&toast=level|hard|retry]   (Phase 2d: the real game screen; M = mouse)
//   scene=gallery (cat moods, icons, glyphs, marks)   scene=illus (illustrations)
// The game scene is playable with the real reducer (tap, double-tap, drag; H = hint, M = mouse).
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/board.css';
import '../src/styles/hud.css';
import '../src/styles/overlays.css';
import '../src/styles/fx.css';
// 2b integration: the overlays' rules load with the lazy overlay chunk in the app.
import '../src/styles/overlay-chunk.css';
import { cfg } from '../src/app/config';
import { recordToPuzzle } from '../src/engine/codec';
import { getHintStep } from '../src/engine/hint';
import type { CellIndex, LevelPack, Puzzle } from '../src/engine/types';
import { newGame } from '../src/game/factory';
import { hasMouseCandidate, mouseSeed, pickMouseCells } from '../src/game/mouse';
import { reduce } from '../src/game/reducer';
import { CellState, type Action, type GameState } from '../src/game/types';
import { t } from '../src/i18n';
import { illustration, type IllustrationKind } from '../src/ui/art/illustrations';
import { regionColorsFor } from '../src/ui/art/palette';
import { icon, mountSprite, type SymbolId } from '../src/ui/art/sprite';
import type { BoardModel } from '../src/ui/board/board-view';
import { createAnnouncer } from '../src/ui/a11y/announcer';
import { applyMotion } from '../src/ui/fx/motion';
import { createGameScreen, type GameView, type StartToastKind } from '../src/ui/screens/game-screen';

const q = new URLSearchParams(location.search);
const root = document.getElementById('app') as HTMLElement;
mountSprite();
applyMotion(root, q.get('rm') === '1');

/** Every shipped level pack (dev only: the harness may load them all eagerly). */
const PACKS = Object.values(import.meta.glob<LevelPack>('../src/data/levels/pack-*.json', { eager: true, import: 'default' }));

/** The first shipped level of size n (4 → the tutorial board). The packs cover every size 4–12. */
function puzzleOfSize(n: number): Puzzle {
  for (const pack of PACKS) {
    const rec = pack.levels.find((l) => l.n === n && (n === 4 || !l.tut));
    if (rec) return recordToPuzzle(rec, `L${rec.i ?? 0}`);
  }
  throw new RangeError(`board harness: no shipped level of size ${n} (4–12)`);
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
  const hard = q.get('hard') === '1';
  const reducedMotion = q.get('rm') === '1';
  const announcer = createAnnouncer(document.body);
  let mouseUses = 0;
  const model = (): BoardModel => ({ puzzleId: puzzle.id, n, regions: puzzle.regions, colors, cells: state.cells, regionsDone: state.regionsDone, patterns });

  const coachCells = (): CellIndex[] | null => {
    if (q.get('coach') !== '1') return null;
    const r = Math.min(3, n - 1);
    return [r * n + (puzzle.solution[r] as number)];
  };

  /** Phase 2d (I-1): the real game screen (the 2d stack, bar, heads, cards, three helpers) on the reducer's state. */
  const view = (): GameView => {
    const coach = coachCells();
    const playing = state.status === 'playing';
    return {
      mode: 'level',
      level: hard ? 40 : 7,
      dateKey: null,
      hard,
      showHome: true,
      hearts: state.hearts,
      maxHearts: 3,
      catsPlaced: state.catsPlaced,
      status: state.status,
      hints: 5,
      kitties: 3,
      hintsFree: false,
      bulbEnabled: playing,
      pawEnabled: false,
      inputLocked: !playing || coach !== null,
      board: model(),
      highlight: state.openHint ? { kind: 'hint', step: state.openHint } : coach ? { kind: 'coach', cells: coach } : null,
      chipHighlight: q.get('coach') === '1' ? 'space' : null,
      fbSafeZone: q.get('fb') === '1',
      reducedMotion,
      event: null,
      points: state.levelPoints,
      pulse: reducedMotion || !playing ? null : state.cells.some((c) => c !== CellState.Empty && c !== CellState.Given) ? 'bulb' : 'paw',
      mouse: { shown: true, enabled: playing && hasMouseCandidate(state) },
      videoRefill: q.get('video') === '1',
      bannerBand: q.get('band') === '1',
      settingsDot: q.get('dot') !== '0',
    };
  };

  const dispatch = (a: Action): void => {
    const r = reduce(state, a);
    state = r.state;
    screen.update(view());
    for (const ev of r.events) {
      screen.playEvent(ev);
      if (ev.type === 'CAT_PLACED') announcer.say(t('a11y.catPlaced', { placed: state.catsPlaced, n }));
    }
  };
  const hint = (): void => {
    if (state.status === 'playing') dispatch({ type: 'HINT_OPEN', step: getHintStep(puzzle, state.cells), charged: true });
    else if (state.status === 'hint') dispatch({ type: 'HINT_APPLY', t: performance.now() });
  };
  const screen = createGameScreen(view(), {
    onTap: (cell) => dispatch({ type: 'TAP', cell, t: performance.now() }),
    onDoubleTap: (cell) => dispatch({ type: 'DOUBLE_TAP', cell, t: performance.now() }),
    onPaint: (cells, mode) => dispatch({ type: 'PAINT', cells, mode, t: performance.now() }),
    onBulb: hint,
    onPaw: () => undefined,
    onMouse: () => dispatch({ type: 'MOUSE', cells: pickMouseCells(state, cfg.mouse.cells, mouseSeed(puzzle.id, mouseUses++)), t: performance.now() }),
    onHome: () => undefined,
    onSettings: () => undefined,
  });
  root.appendChild(screen.el);
  if (q.get('hint') === '1') hint();
  if (q.get('entry') === '1') screen.playEntry();
  if (q.get('toast')) screen.playStartToast(q.get('toast') as StartToastKind);
  (window as unknown as { __harness: unknown }).__harness = { dispatch, state: () => state, screen, puzzle, CellState };
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
    'icon-house', 'icon-gear', 'icon-bulb', 'icon-paw', 'icon-fish', 'icon-fish-empty', 'icon-points', 'icon-trophy', 'icon-lock',
    'icon-calendar', 'icon-play-video', 'icon-close', 'icon-chevron', 'icon-back', 'icon-play',
  ];
  section('Icons', ids.map((id) => swatch(id.slice(5), icon(id, { class: 'hx-icon' }))));
  section('Pattern glyphs', Array.from({ length: 12 }, (_, i) => {
    const tile = document.createElement('div');
    tile.className = 'hx-tile';
    tile.style.background = `var(--r${i})`;
    tile.appendChild(icon(`glyph-${i}` as SymbolId, { class: 'hx-glyph' }));
    return swatch(String(i), tile);
  }));
  section('Phase 2d art', (['tool-kitty', 'tool-bulb', 'tool-mouse', 'cat-head-flat', 'art-flex'] as SymbolId[]).map((id) => swatch(id, icon(id, { class: 'hx-cat' }))));
  section('Marks', (['mark-x'] as SymbolId[]).map((id) => {
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
