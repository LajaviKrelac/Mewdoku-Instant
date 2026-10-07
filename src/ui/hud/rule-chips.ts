// Owner: ui-board
// The three rule chips (icon + short text; icons only in compact mode). Wording: i18n game.chip.*.
import type { View } from '../dom';

export type RuleChip = 'colours' | 'lines' | 'space';

export interface RuleChipsProps {
  readonly compact: boolean;
  /** Emphasised chip (tutorial), or null. */
  readonly highlight: RuleChip | null;
}

export function createRuleChips(props: RuleChipsProps): View<RuleChipsProps> {
  throw new Error('not implemented: createRuleChips');
}
