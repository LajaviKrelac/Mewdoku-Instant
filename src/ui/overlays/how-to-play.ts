// Owner: B (Phase 2b; was ui-shell)
// O6 how to play (02 §4.2, §14): three illustrated rules, controls, plus "I know how to play"
// (only while the first-run tutorial runs) or "Replay tutorial" (after it is done).
// The three rule pictures are small SVG boards drawn here (our own art, 06 §5).
//
// Classes: .overlay[data-overlay=how_to_play] > .overlay__panel--dialog.howto
//          .howto__rules .howto-rule .howto-rule__art .howto-rule__text .howto__notes .howto__extra
import { t } from '../../i18n';
import { icon, type SymbolId } from '../art/sprite';
import { h, s, type OverlayView } from '../dom';
import { closeButton, createOverlayShell, makeButton } from './overlay-base';

export interface HowToPlayProps {
  /** First-run tutorial running → offer "I know how to play". */
  readonly showSkip: boolean;
  /** Tutorial done → offer "Replay tutorial". */
  readonly showReplay: boolean;
  onSkip(): void;
  onReplay(): void;
  onClose(): void;
}

const TILE = 20;
const GAP = 3;

/** A mini board: `fills[i]` is a palette index or -1 (plain), `marks` maps cells to a glyph. */
function miniBoard(n: number, fills: readonly number[], marks: Readonly<Record<number, SymbolId>>, hi: readonly number[] = []): SVGSVGElement {
  const size = n * TILE + (n + 1) * GAP;
  const svg = s('svg', { class: 'howto-rule__art', viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true', focusable: 'false' });
  svg.appendChild(s('rect', { width: size, height: size, rx: 6, fill: 'var(--card)' }));
  for (let i = 0; i < n * n; i++) {
    const x = GAP + (i % n) * (TILE + GAP);
    const y = GAP + Math.floor(i / n) * (TILE + GAP);
    const p = fills[i] ?? -1;
    const fill = hi.includes(i) ? 'var(--accent)' : p >= 0 ? `var(--r${p})` : 'var(--tile-plain, var(--page-2))';
    svg.appendChild(s('rect', { x, y, width: TILE, height: TILE, rx: 4, fill, 'fill-opacity': hi.includes(i) ? 0.35 : 1 }));
    const mark = marks[i];
    if (mark) {
      // A bare <use> of the sprite symbol (an icon() <svg> would pick up the global .icon size).
      const inset = mark === 'mark-x' ? 4 : 1;
      const size = TILE - 2 * inset;
      svg.appendChild(s('use', { href: `#${mark}`, class: `howto-rule__${mark}`, x: x + inset, y: y + inset, width: size, height: size }));
    }
  }
  return svg;
}

/** Rule 1: one cat in each colour — a solved 4×4 of our own (Lavender, Mint, Lemon, Strawberry). */
function artColours(): SVGSVGElement {
  const fills = [7, 7, 4, 4, 7, 2, 4, 4, 2, 2, 0, 4, 2, 0, 0, 0];
  return miniBoard(4, fills, { 1: 'cat-idle', 7: 'cat-idle', 8: 'cat-idle', 14: 'cat-idle' });
}

/** Rule 2: one cat in each row and column (the cat's row and column tinted). */
function artLines(): SVGSVGElement {
  const n = 4;
  const cat = 6; // row 1, column 2 (0-based)
  const hi: number[] = [];
  for (let i = 0; i < n * n; i++) if (i !== cat && (Math.floor(i / n) === 1 || i % n === 2)) hi.push(i);
  return miniBoard(n, new Array<number>(n * n).fill(-1), { [cat]: 'cat-idle' }, hi);
}

/** Rule 3: cats never touch, not even at the corners (neighbours crossed out). */
function artSpace(): SVGSVGElement {
  const marks: Record<number, SymbolId> = { 4: 'cat-idle' };
  for (const i of [0, 1, 2, 3, 5, 6, 7, 8]) marks[i] = 'mark-x';
  return miniBoard(3, [6, 6, 6, 6, 6, 6, 6, 6, 6], marks);
}

export function createHowToPlay(): OverlayView<HowToPlayProps> {
  let props: HowToPlayProps | null = null;
  const shell = createOverlayShell({ id: 'how_to_play', scrim: 'soft', panel: 'dialog', onScrimTap: () => props?.onClose() });
  shell.panel.classList.add('howto');

  const rule = (art: SVGSVGElement, text: string): HTMLElement =>
    h('li', { class: 'howto-rule' }, art, h('p', { class: 'howto-rule__text' }, text));

  const skip = makeButton({ variant: 'secondary', label: t('howto.skip'), block: true, className: 'howto__skip', onPress: () => props?.onSkip() });
  const replay = makeButton({ variant: 'secondary', label: t('howto.replay'), block: true, className: 'howto__replay', onPress: () => props?.onReplay() });
  const extra = h('div', { class: 'overlay__actions howto__extra' }, skip, replay);

  shell.panel.append(
    h('div', { class: 'overlay__head' }, h('h2', { class: 'overlay__title', id: shell.titleId }, t('howto.title')), closeButton(() => props?.onClose())),
    h(
      'ol',
      { class: 'howto__rules', id: shell.descId },
      rule(artColours(), t('howto.rule.colours')),
      rule(artLines(), t('howto.rule.lines')),
      rule(artSpace(), t('howto.rule.space')),
    ),
    h(
      'div',
      { class: 'howto__notes' },
      h('p', null, icon('icon-paw', { class: 'howto__note-icon howto__note-icon--paw' }), h('span', null, t('howto.controls'))),
      // Keyboard play (02 §6.3); CSS shows it only where a mouse or trackpad is present.
      h('p', { class: 'howto__keys' }, icon('icon-paw', { class: 'howto__note-icon howto__note-icon--paw' }), h('span', null, t('howto.keys'))),
      h('p', null, icon('icon-heart', { class: 'howto__note-icon howto__note-icon--heart' }), h('span', null, t('howto.hearts'))),
      h('p', null, icon('icon-bulb', { class: 'howto__note-icon howto__note-icon--bulb' }), h('span', null, t('howto.helpers'))),
    ),
    extra,
  );

  const render = (p: HowToPlayProps): void => {
    props = p;
    skip.hidden = !p.showSkip;
    replay.hidden = !p.showReplay;
    extra.hidden = !p.showSkip && !p.showReplay;
  };

  return {
    el: shell.el,
    modal: true,
    open(p) {
      render(p);
      shell.show();
    },
    update(p) {
      render(p);
    },
    close() {
      shell.hide();
    },
    dismiss() {
      if (!props || !shell.isOpen()) return false;
      props.onClose();
      return true;
    },
    destroy() {
      props = null;
      shell.el.remove();
    },
  };
}
