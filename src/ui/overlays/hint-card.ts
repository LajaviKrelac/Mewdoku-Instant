// Owner: ui-shell
// O1 hint card (02 §5, §9.1): bottom sheet with the explanation, [Apply] and [×]. The board's dimming
// and focus outline come from GameView.highlight. Renders the 02 §9.1 templates via i18n.
import type { HintStep, Unit } from '../../engine/types';
import type { OverlayView } from '../dom';

export interface HintTextContext {
  readonly n: number;
  /** Palette index per region label (colour names). */
  readonly colors: Uint8Array;
  /** Colour patterns on → colour names carry their glyph: "Lavender (star)" (02 §18). */
  readonly patterns: boolean;
}

export interface HintCardProps extends HintTextContext {
  readonly step: HintStep;
  onApply(): void;
  /** ×, Esc or a tap on the dimmed area (HINT_CLOSE). */
  onClose(): void;
}

/** "row 3", "column 5", "Lavender" (02 §9.1 unit names; rows/columns 1-based). */
export function unitName(unit: Unit, ctx: HintTextContext): string {
  throw new Error('not implemented: unitName');
}

/** The explanation sentence for a step (02 §9.1 templates). Also used for the live announcement. */
export function hintText(step: HintStep, ctx: HintTextContext): string {
  throw new Error('not implemented: hintText');
}

export function createHintCard(): OverlayView<HintCardProps> {
  throw new Error('not implemented: createHintCard');
}
