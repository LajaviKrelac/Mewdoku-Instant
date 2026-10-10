// Owner: B (Phase 2b; was ui-shell); G2 (Phase 2c: the lives are fish, plus the points note; 2c.1: level points); G3 (Phase 2d: the helpers note)
// O6 how to play (02 §4.2, §14): three illustrated rules, controls, plus "I know how to play"
// (only while the first-run tutorial runs) or "Replay tutorial" (after it is done).
// Phase 2c (fish-lives-spec §1.5): the lives note shows our fish (icon-fish, howto.hearts "Your fish
// are your lives…"), and a points note with icon-trophy follows it (howto.points.<kind>: the kept
// fish go to this period's ranking). Phase 2c.1 (§10.7): the perfect-streak sentence went from that
// note, and a level-points note with icon-points follows it (howto.levelPoints: every cat found earns
// points, more for each cat in a row without a mistake; hint and kitty cats count too).
// Phase 2d (look-spec Appendix A): the helpers note names the kitty, the bulb and the mouse, next to
// their own art (tool-kitty, tool-bulb, tool-mouse) in a small column.
// The three rule pictures are small SVG boards drawn here (our own art, 06 §5).
//
// Classes: .overlay[data-overlay=how_to_play] > .overlay__panel--dialog.howto
//          .howto__rules .howto-rule .howto-rule__art .howto-rule__text .howto__notes .howto__extra
//
// Review fixes: the rules' keywords print in the accent colour (PAR-7; `*…*` in the catalogue, rich
// text), and every text follows the language (A11Y-I18N-1).
import { cfg } from '../../app/config';
import { t, translate, translateMarked, type I18nKey } from '../../i18n';
import { icon, type SymbolId } from '../art/sprite';
import { h, s, type OverlayView } from '../dom';
import { createLocaleText } from '../locale-text';
import { howtoPointsText } from '../period-text';
import { setRichText } from '../rich-text';
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
    // Phase 2d (G2 R3): the board's tile corner (11 % of the tile).
    svg.appendChild(s('rect', { x, y, width: TILE, height: TILE, rx: 2.2, fill, 'fill-opacity': hi.includes(i) ? 0.35 : 1 }));
    const mark = marks[i];
    if (mark) {
      // A bare <use> of the sprite symbol (an icon() <svg> would pick up the global .icon size).
      // The 2d `mark-x` is drawn on the board's slot (tile + gap), so it covers the slot here too.
      const inset = mark === 'mark-x' ? -GAP / 2 : 1;
      const size = TILE - 2 * inset;
      svg.appendChild(s('use', { href: `#${mark}`, class: `howto-rule__${mark}`, x: x + inset, y: y + inset, width: size, height: size }));
    }
  }
  return svg;
}

/** Rule 1: one cat in each colour — a solved 4×4 of our own (Violet, Denim, Mustard, Coral). */
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

  const L = createLocaleText();
  const rule = (art: SVGSVGElement, key: I18nKey): HTMLElement => {
    const text = h('p', { class: 'howto-rule__text' });
    L.run(() => setRichText(text, translateMarked(key)));
    return h('li', { class: 'howto-rule' }, art, text);
  };
  const note = (key: I18nKey): HTMLElement => L.text(h('span'), () => translate(key));

  const skip = L.label(
    makeButton({ variant: 'secondary', label: '', block: true, className: 'howto__skip', onPress: () => props?.onSkip() }),
    () => t('howto.skip'),
  );
  const replay = L.label(
    makeButton({ variant: 'secondary', label: '', block: true, className: 'howto__replay', onPress: () => props?.onReplay() }),
    () => t('howto.replay'),
  );
  const extra = h('div', { class: 'overlay__actions howto__extra' }, skip, replay);

  shell.panel.append(
    h(
      'div',
      { class: 'overlay__head' },
      L.text(h('h2', { class: 'overlay__title', id: shell.titleId }), () => t('howto.title')),
      L.attr(closeButton(() => props?.onClose()), 'aria-label', () => t('common.close')),
    ),
    h(
      'ol',
      { class: 'howto__rules', id: shell.descId },
      rule(artColours(), 'howto.rule.colours'),
      rule(artLines(), 'howto.rule.lines'),
      rule(artSpace(), 'howto.rule.space'),
    ),
    h(
      'div',
      { class: 'howto__notes' },
      h('p', null, icon('icon-paw', { class: 'howto__note-icon howto__note-icon--paw' }), note('howto.controls')),
      // Keyboard play (02 §6.3); CSS shows it only where a mouse or trackpad is present.
      h('p', { class: 'howto__keys' }, icon('icon-paw', { class: 'howto__note-icon howto__note-icon--paw' }), note('howto.keys')),
      h('p', { class: 'howto__lives' }, icon('icon-fish', { class: 'howto__note-icon howto__note-icon--fish' }), note('howto.hearts')),
      h(
        'p',
        { class: 'howto__points' },
        icon('icon-trophy', { class: 'howto__note-icon howto__note-icon--trophy' }),
        L.text(h('span'), () => howtoPointsText(cfg.period.kind)),
      ),
      h('p', { class: 'howto__level-points' }, icon('icon-points', { class: 'howto__note-icon howto__note-icon--points' }), note('howto.levelPoints')),
      h(
        'p',
        { class: 'howto__helpers' },
        h('span', { class: 'howto__note-icon howto__helper-art', 'aria-hidden': 'true' }, icon('tool-kitty'), icon('tool-bulb'), icon('tool-mouse')),
        note('howto.helpers'),
      ),
    ),
    extra,
  );
  L.watch();

  const render = (p: HowToPlayProps): void => {
    props = p;
    L.apply();
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
      L.dispose();
      props = null;
      shell.el.remove();
    },
  };
}
