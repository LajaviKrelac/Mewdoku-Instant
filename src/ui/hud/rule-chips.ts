// Owner: A (Phase 2b; was ui-board); G3 (Phase 2d: the rule cards)
// The three rule cards (look-spec §1.7): a white container (the `ul`) holding three cards, each with
// our 3 × 3 mini diagram (ruleDiagram, G2's art) at its inline start and our short rule text (i18n
// game.chip.*, at most three lines). Compact (s < layout.game.compactScale): the diagram is centred
// and the visible text hides; the long text (game.chip.*.a11y) stays the title and the
// screen-reader text. Tutorial: [data-hl] on the emphasised card (the coach's soft rect keeps
// `.chip[data-hl]`). The diagrams stay LTR in RTL (one SVG; the card mirrors its position).
// Classes: ul.rule-chips[data-compact] > li.chip.chip--colours|lines|space[data-hl] > svg.chip__art .chip__text .sr-only
import { t } from '../../i18n';
import { ruleDiagram } from '../art/rule-art';
import type { View } from '../dom';
import { createLocaleText } from '../locale-text';

export type RuleChip = 'colours' | 'lines' | 'space';

export interface RuleChipsProps {
  readonly compact: boolean;
  /** Emphasised card (tutorial), or null. */
  readonly highlight: RuleChip | null;
}

const CHIPS = [
  { id: 'colours', text: 'game.chip.colours', long: 'game.chip.colours.a11y' },
  { id: 'lines', text: 'game.chip.lines', long: 'game.chip.lines.a11y' },
  { id: 'space', text: 'game.chip.space', long: 'game.chip.space.a11y' },
] as const;

export function createRuleChips(props: RuleChipsProps): View<RuleChipsProps> {
  const el = document.createElement('ul');
  el.className = 'rule-chips';
  const items = new Map<RuleChip, HTMLLIElement>();
  // The card texts follow the language (review A11Y-I18N-1).
  const L = createLocaleText();
  for (const c of CHIPS) {
    const li = L.attr(document.createElement('li'), 'title', () => t(c.long));
    li.className = `chip chip--${c.id}`;
    // The diagram is G2's SVG markup (decorative, aria-hidden), parsed once per card.
    li.innerHTML = ruleDiagram(c.id);
    const text = L.text(document.createElement('span'), () => t(c.text));
    text.className = 'chip__text';
    text.setAttribute('aria-hidden', 'true');
    const sr = L.text(document.createElement('span'), () => t(c.long));
    sr.className = 'sr-only';
    li.append(text, sr);
    items.set(c.id, li);
    el.appendChild(li);
  }
  const render = (p: RuleChipsProps): void => {
    el.toggleAttribute('data-compact', p.compact);
    for (const [id, li] of items) li.toggleAttribute('data-hl', p.highlight === id);
  };
  render(props);
  L.watch();
  return {
    el,
    update: render,
    destroy() {
      L.dispose();
      el.parentNode?.removeChild(el);
    },
  };
}
