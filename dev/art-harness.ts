// Owner: A (phase2b §1, §4.4)
// Dev harness for workstream A (not shipped): Tux, the board look, icons, poses and event art in
// isolation, for screenshots and visual review. Run `npx vite --port 5181 --strictPort` and open
// /dev/art-harness.html?scene=…
//   scene=gallery (default)  moods, moods on every tile at 3 slot sizes, X marks, icons, fish, accessories
//   scene=poses[&dark=1]     the six poses
//   scene=events             event art (card, header) and the three [data-event-theme] pages
//   scene=board&n=4…12[&glow=1][&flick=1][&patterns=1][&done=1][&mood=happy|sad|surprised][&rm=1]
//   scene=ui                 buttons, badges, chips, pills, tools, the top bar with its lead slot
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/board.css';
import '../src/styles/hud.css';
import '../src/styles/overlays.css';
import '../src/styles/fx.css';
import '../src/styles/art.css';
import '../src/styles/screens.css';
// 2b integration: the overlays' and the event screen's rules load with their lazy chunks in the app.
import '../src/styles/overlay-chunk.css';
import '../src/styles/events-chunk.css';
import { recordToPuzzle } from '../src/engine/codec';
import type { CellIndex, LevelPack, Puzzle } from '../src/engine/types';
import type { EventDef } from '../src/game/events';
import { newGame } from '../src/game/factory';
import { reduce } from '../src/game/reducer';
import type { Action, GameState } from '../src/game/types';
import { mountAccessories } from '../src/ui/art/accessories';
import { eventArt } from '../src/ui/art/event-art';
import { illustration, type IllustrationKind } from '../src/ui/art/illustrations';
import { mascotIllustration } from '../src/ui/art/mascot';
import { PALETTE, regionColorsFor, xEdgeColor } from '../src/ui/art/palette';
import { icon, mountSprite, type SymbolId } from '../src/ui/art/sprite';
import { createBoardView, type BoardModel, type CatMood } from '../src/ui/board/board-view';
import { computeLayout, readViewport } from '../src/ui/board/layout';
import { applyMotion } from '../src/ui/fx/motion';
import { createPeriodPill } from '../src/ui/hud/pills';
import { createRuleChips } from '../src/ui/hud/rule-chips';
import { createToolBar } from '../src/ui/hud/tool-bar';
import { createTopBar } from '../src/ui/hud/top-bar';
import EVENTS from '../src/data/events/events.json';

const q = new URLSearchParams(location.search);
const root = document.getElementById('app') as HTMLElement;
mountSprite();
mountAccessories(); // the events chunk does this in the game
applyMotion(root, q.get('rm') === '1');

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

function section(parent: HTMLElement, title: string, items: Element[], cls = ''): HTMLElement {
  parent.append(el('h2', 'ax-h', title));
  const row = el('div', `ax-row ${cls}`);
  row.append(...items);
  parent.append(row);
  return row;
}

function fig(label: string, ...content: Element[]): HTMLElement {
  const f = el('figure', 'ax-fig');
  f.append(...content, el('figcaption', '', label));
  return f;
}

/** A tile like the board's: inset, rounded 20 %, with a <use> stack on top. */
function tile(slot: number, palette: number, ids: SymbolId[], opts: { faded?: boolean; scale?: number } = {}): HTMLElement {
  const t = el('div', 'ax-tile');
  t.style.width = t.style.height = `${slot}px`;
  const inset = slot >= 30 ? 2 : 1.5;
  const bg = el('span', 'ax-tile__bg');
  bg.style.inset = `${inset}px`;
  bg.style.borderRadius = `${slot * 0.2}px`;
  bg.style.background = `var(--r${palette})`;
  if (opts.faded) bg.classList.add('ax-faded');
  t.style.setProperty('--xe', xEdgeColor(palette));
  t.append(bg);
  for (const id of ids) {
    const s = icon(id, { class: 'ax-tile__sym' });
    const k = opts.scale ?? (id.startsWith('cat') || id.startsWith('acc') ? 0.84 : 1);
    s.style.width = s.style.height = `${slot * k}px`;
    t.append(s);
  }
  return t;
}

function galleryScene(): void {
  const wrap = el('div', 'ax-page');
  const moods: SymbolId[] = ['cat-idle', 'cat-happy', 'cat-sad', 'cat-surprised'];
  section(wrap, 'Tux moods (120 px, on page)', moods.map((m) => fig(m.slice(4), icon(m, { class: 'ax-cat120' }))));
  section(wrap, 'Blink lid and ear flick (overlays)', [
    fig('blink', tile(120, 7, ['cat-idle', 'cat-blink'])),
    fig('ear-flick', (() => {
      const t = tile(120, 7, ['cat-idle', 'cat-ear-flick']);
      t.style.setProperty('--flick-hide', '0');
      const ear = t.lastElementChild as SVGSVGElement;
      ear.style.transformOrigin = `${((8 + 27 * 0.84) / 100) * 120}px ${((8 + 33.4 * 0.84) / 100) * 120}px`;
      ear.style.transform = 'rotate(-10deg)';
      return t;
    })()),
    fig('wink-free idle', tile(120, 2, ['cat-idle'])),
  ]);
  for (const slot of [42, 30, 22]) {
    section(wrap, `Moods on every tile, ${slot} px slot`, PALETTE.map((_, i) => tile(slot, i, [moods[i % 4] as SymbolId])), 'ax-tight');
  }
  section(wrap, 'Idle on every tile, 25 px slot', PALETTE.map((_, i) => tile(25, i, ['cat-idle'])), 'ax-tight');
  for (const slot of [42, 25]) {
    section(wrap, `White X with edge, ${slot} px slot (top: normal, bottom: faded)`, PALETTE.map((_, i) => {
      const col = el('div', 'ax-col');
      col.append(tile(slot, i, ['mark-x']), tile(slot, i, ['mark-x'], { faded: true }));
      return col;
    }), 'ax-tight');
  }
  section(wrap, 'Wrong X', [tile(42, 2, ['wrong-x']), tile(42, 10, ['wrong-x'])], 'ax-tight');
  const icons: SymbolId[] = [
    'icon-fish', 'icon-plus', 'icon-shop', 'icon-globe', 'icon-crown', 'icon-users', 'icon-house', 'icon-gear', 'icon-bulb', 'icon-paw',
    'icon-fish-empty', 'icon-points', 'icon-trophy', 'icon-lock', 'icon-calendar', 'icon-play-video', 'icon-close', 'icon-chevron',
  ];
  for (const px of [32, 24, 16]) {
    section(wrap, `Icons at ${px} px`, icons.map((id) => {
      const s = icon(id, { class: 'ax-icon' });
      s.style.width = s.style.height = `${px}px`;
      return px === 32 ? fig(id.slice(5), s) : s;
    }), 'ax-tight');
  }
  const fishBig = icon('icon-fish', { class: 'ax-icon' });
  fishBig.style.width = fishBig.style.height = '96px';
  section(wrap, 'Fish at 96 px', [fishBig]);
  section(wrap, 'Accessories on Tux (60 px, 36 px)', (['acc-lantern', 'acc-scarf', 'acc-yarn'] as SymbolId[]).flatMap((a, k) => [
    fig(a.slice(4), tile(60, [1, 6, 8][k] as number, ['cat-idle', a])),
    fig('36', tile(36, [1, 6, 8][k] as number, ['cat-happy', a])),
  ]));
  root.append(wrap);
}

function posesScene(): void {
  const wrap = el('div', 'ax-page ax-poses');
  if (q.get('dark') === '1') wrap.classList.add('ax-dark');
  const all: IllustrationKind[] = ['home', 'boot', 'win', 'fail', 'daily', 'tutorial'];
  const kinds = q.get('only') ? (q.get('only') as string).split('~') as IllustrationKind[] : all;
  const size = q.get('size');
  for (const k of kinds) {
    const svg = k === 'home' || k === 'boot' ? mascotIllustration(k) : illustration(k);
    svg.classList.add('ax-pose');
    if (size) svg.style.width = svg.style.height = `${size}px`;
    wrap.append(fig(k, svg));
  }
  const small = el('div', 'ax-row');
  for (const k of all) {
    const svg = illustration(k);
    svg.classList.add('ax-pose-s');
    small.append(svg);
  }
  wrap.append(small);
  root.append(wrap);
}

function eventsScene(): void {
  const wrap = el('div', 'ax-page');
  const defs = EVENTS as unknown as EventDef[];
  for (const def of defs) {
    const page = el('div', 'ax-event');
    page.dataset.eventTheme = def.id;
    page.append(el('h2', 'ax-h', def.id));
    const card = el('div', 'ax-event-card');
    const text = el('div', 'ax-event-card__text');
    text.append(el('strong', '', def.id.split('-').slice(0, 2).join(' ')), el('span', '', 'Ends in 3 d 4 h · 7 / 21 solved'));
    card.append(eventArt(def, 'card'), text);
    page.append(card, eventArt(def, 'header'));
    const t = el('div', 'ax-row ax-tight');
    for (const i of [0, 3, 6, 9]) t.append(tile(42, i, ['cat-happy', `acc-${def.theme.accessory}` as SymbolId]));
    page.append(t);
    wrap.append(page);
  }
  root.append(wrap);
}

const PACKS = Object.values(import.meta.glob<LevelPack>('../src/data/levels/pack-*.json', { eager: true, import: 'default' }));

function puzzleOfSize(n: number): Puzzle {
  for (const pack of PACKS) {
    const rec = pack.levels.find((l) => l.n === n && (n === 4 || !l.tut));
    if (rec) return recordToPuzzle(rec, `L${rec.i ?? 0}`);
  }
  throw new RangeError(`art harness: no level of size ${n}`);
}

function boardScene(): void {
  const n = Number(q.get('n') ?? 8);
  const p = puzzleOfSize(n);
  const colors = regionColorsFor(p, null);
  let s: GameState = reduce(newGame(p, 'level'), { type: 'START' }).state;
  const act = (a: Action): void => {
    s = reduce(s, a).state;
  };
  const solCell = (r: number): CellIndex => r * n + (p.solution[r] as number);
  const full = q.get('glow') === '1';
  const rows = full ? Array.from({ length: n }, (_, r) => r) : [0, 2, Math.min(5, n - 1)];
  rows.forEach((r, k) => act({ type: 'DOUBLE_TAP', cell: solCell(r), t: k + 1 }));
  if (!full) {
    const marks: CellIndex[] = [];
    for (let c = 0; c < n; c++) if (c !== p.solution[1]) marks.push(n + c);
    for (let c = 0; c < n; c += 2) if (c !== p.solution[3]) marks.push(3 * n + c);
    act({ type: 'PAINT', cells: marks, mode: 'mark', t: 20 });
    if (q.get('wrong') !== '0') act({ type: 'DOUBLE_TAP', cell: (n - 1) * n + (((p.solution[n - 1] as number) + 2) % n), t: 30 });
  }
  const model: BoardModel = { puzzleId: p.id, n, regions: p.regions, colors, cells: s.cells, regionsDone: s.regionsDone, patterns: q.get('patterns') === '1' };
  const board = createBoardView(model, { tap: () => undefined, doubleTap: () => undefined, paint: () => undefined, bulb: () => undefined, paw: () => undefined }, { reducedMotion: () => q.get('rm') === '1' });
  const screen = el('div', 'screen screen--game');
  if (q.get('theme')) screen.dataset.eventTheme = q.get('theme') as string;
  const top = createTopBar({ title: `Level ${n * 7}`, hard: q.get('hard') === '1', showHome: true, showSettings: true, showTrophy: false, fbSafeZone: false }, { onHome: () => undefined, onSettings: () => undefined, onTrophy: () => undefined });
  const chips = createRuleChips({ compact: false, highlight: null });
  const tools = createToolBar({ hints: 5, kitties: 3, bulbEnabled: true, pawEnabled: true, hintsFree: false }, { onBulb: () => undefined, onPaw: () => undefined });
  const col = el('div', 'ax-gamecol');
  const stage = el('div', 'ax-stage');
  stage.append(board.el);
  col.append(chips.el, stage, tools.el);
  screen.append(top.el, col);
  root.append(screen);
  const vp = readViewport(window);
  const L = computeLayout({ vw: Math.min(vp.vw, 560), vh: vp.vh, safeTop: 0, safeBottom: 0, n });
  board.setSlot(L.slot);
  board.update(model);
  const mood = q.get('mood') as CatMood | null;
  if (mood) board.setMood(mood);
  if (full) {
    board.setMood('happy');
    board.el.querySelectorAll<HTMLElement>('.cell[data-s="c"] .cell__glow').forEach((g) => (g.style.opacity = '0.7'));
  }
  if (q.get('flick') === '1') board.el.querySelectorAll('.cell[data-s="c"]').forEach((c) => c.classList.add('is-flick'));
}

function uiScene(): void {
  const wrap = el('div', 'ax-page');
  const btn = (cls: string, label: string, extra?: Element): HTMLButtonElement => {
    const b = el('button', `btn ${cls}`);
    b.type = 'button';
    b.append(el('span', 'btn__label', label));
    if (extra) b.append(extra);
    return b;
  };
  const primary = btn('btn--primary btn--lg btn--block', 'Level 38', icon('icon-chevron', { class: 'btn__chev' }));
  section(wrap, 'Buttons', [primary], 'ax-col-full');
  const badge = el('span', 'btn__badge', '1');
  section(wrap, '', [btn('btn--primary', 'Continue', badge), btn('btn--secondary', 'Retry'), btn('btn--ghost', 'Home'), (() => {
    const b = el('button', 'btn btn--icon');
    b.append(icon('icon-gear', { class: 'btn__icon' }));
    return b;
  })()]);
  const dis = btn('btn--primary', 'Level 3');
  dis.setAttribute('aria-disabled', 'true');
  section(wrap, 'Disabled, badge', [dis, (() => {
    const b = el('span', 'badge badge--hard', 'Hard');
    return b;
  })()]);
  // Phase 2c §2.8: Home's lead slot is the period pill (icon-trophy + this week's fish), not a button.
  const pill = createPeriodPill({ total: 42, kind: 'week' }).el;
  const top = createTopBar({ title: null, hard: false, showHome: false, showSettings: true, showTrophy: true, fbSafeZone: q.get('fb') === '1' }, { onHome: () => undefined, onSettings: () => undefined, onTrophy: () => undefined }, { lead: pill });
  section(wrap, 'Top bar with the lead slot (Home)', [top.el], 'ax-col-full');
  section(wrap, 'Tools', [createToolBar({ hints: 5, kitties: 0, bulbEnabled: true, pawEnabled: true, hintsFree: false }, { onBulb: () => undefined, onPaw: () => undefined }).el]);
  const title = el('h1', 'ax-title', 'Purrfect!');
  section(wrap, 'Titles', [title]);
  const f = el('button', 'btn btn--secondary', 'Focused');
  section(wrap, 'Focus ring', [f]);
  root.append(wrap);
  f.focus();
}

const style = document.createElement('style');
style.textContent = `
  #app { overflow: auto; max-width: none; }
  .ax-page { padding: 16px; }
  .ax-h { font-size: 0.9rem; margin: 16px 0 8px; color: var(--ink-2); }
  .ax-row { display: flex; flex-wrap: wrap; align-items: flex-end; }
  .ax-row > * { margin: 0 10px 10px 0; }
  .ax-tight > * { margin: 0 4px 4px 0; }
  .ax-col { display: flex; flex-direction: column; }
  .ax-col > * + * { margin-top: 2px; }
  .ax-col-full > * { flex: 1 1 100%; }
  .ax-fig { margin: 0 12px 12px 0; display: flex; flex-direction: column; align-items: center; font-size: 0.7rem; color: var(--ink-2); }
  .ax-cat120 { width: 120px; height: 120px; }
  .ax-tile { position: relative; display: flex; align-items: center; justify-content: center; background: var(--card); }
  .ax-tile__bg { position: absolute; }
  .ax-tile__bg.ax-faded::after { content: ''; position: absolute; inset: 0; border-radius: inherit; background: var(--page); opacity: 0.45; }
  .ax-tile__sym { position: absolute; }
  .ax-icon { color: var(--ink); --icon-fill: var(--accent-soft); }
  .ax-poses { display: flex; flex-wrap: wrap; }
  .ax-pose { width: 200px; height: 200px; }
  .ax-pose-s { width: 64px; height: 64px; margin: 4px; }
  .ax-dark { background: var(--stage); }
  .ax-event { padding: 12px; margin-bottom: 12px; border-radius: 16px; }
  .ax-event > * + * { margin-top: 10px; }
  .ax-event-card { display: flex; align-items: center; padding: 8px; border-radius: 18px; background: var(--card); box-shadow: var(--shadow-1); }
  .ax-event-card__text { display: flex; flex-direction: column; margin-left: 12px; font-size: 0.85rem; color: var(--ink-2); }
  .ax-event-card__text strong { color: var(--ink); font-family: var(--font-display); font-size: 1.1rem; text-transform: capitalize; }
  .ax-gamecol { width: 100%; max-width: 480px; padding: 0 16px; display: flex; flex-direction: column; align-items: stretch; }
  .ax-gamecol > * + * { margin-top: 12px; }
  .ax-stage { display: flex; justify-content: center; }
  .ax-title { color: var(--accent-title); font-size: 2.5rem; }
`;
document.head.appendChild(style);

/** scene=zoom&ids=cat-idle~cat-sad&size=300[&tile=7]: symbols large, for detail review. */
function zoomScene(): void {
  const wrap = el('div', 'ax-page ax-row');
  const size = Number(q.get('size') ?? 300);
  for (const id of (q.get('ids') ?? 'cat-idle').split('~')) {
    const t = q.get('tile');
    if (t !== null) wrap.append(tile(size, Number(t), id.split('+') as SymbolId[]));
    else {
      const s = icon(id as SymbolId, { class: 'ax-icon' });
      s.style.width = s.style.height = `${size}px`;
      wrap.append(s);
    }
  }
  root.append(wrap);
}

const scene = q.get('scene') ?? 'gallery';
if (scene === 'zoom') zoomScene();
else if (scene === 'poses') posesScene();
else if (scene === 'events') eventsScene();
else if (scene === 'board') boardScene();
else if (scene === 'ui') uiScene();
else galleryScene();
