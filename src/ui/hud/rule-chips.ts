// Owner: A (Phase 2b; was ui-board)
// The three rule chips (icon + short text; icons only in compact mode). Wording: i18n game.chip.*.
// Classes: .rule-chips[data-compact] > .chip.chip--colours|lines|space[data-hl] > .icon .chip__text
import { t } from '../../i18n';
import { icon } from '../art/sprite';
import type { View } from '../dom';

export type RuleChip = 'colours' | 'lines' | 'space';

export interface RuleChipsProps {
  readonly compact: boolean;
  /** Emphasised chip (tutorial), or null. */
  readonly highlight: RuleChip | null;
}

const CHIPS = [
  { id: 'colours', icon: 'icon-rule-colours', text: 'game.chip.colours', long: 'game.chip.colours.a11y' },
  { id: 'lines', icon: 'icon-rule-lines', text: 'game.chip.lines', long: 'game.chip.lines.a11y' },
  { id: 'space', icon: 'icon-rule-space', text: 'game.chip.space', long: 'game.chip.space.a11y' },
] as const;

export function createRuleChips(props: RuleChipsProps): View<RuleChipsProps> {
  const el = document.createElement('ul');
  el.className = 'rule-chips';
  const items = new Map<RuleChip, HTMLLIElement>();
  for (const c of CHIPS) {
    const li = document.createElement('li');
    li.className = `chip chip--${c.id}`;
    li.title = t(c.long);
    const text = document.createElement('span');
    text.className = 'chip__text';
    text.setAttribute('aria-hidden', 'true');
    text.textContent = t(c.text);
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = t(c.long);
    li.append(icon(c.icon, { class: 'chip__icon' }), text, sr);
    items.set(c.id, li);
    el.appendChild(li);
  }
  const render = (p: RuleChipsProps): void => {
    el.toggleAttribute('data-compact', p.compact);
    for (const [id, li] of items) li.toggleAttribute('data-hl', p.highlight === id);
  };
  render(props);
  return {
    el,
    update: render,
    destroy() {
      el.parentNode?.removeChild(el);
    },
  };
}
