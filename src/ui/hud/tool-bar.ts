// Owner: ui-board
// Bulb and Paw tool buttons with count badges (02 §5 S2, §9).
import type { View } from '../dom';

export interface ToolBarProps {
  readonly hints: number;
  readonly kitties: number;
  readonly bulbEnabled: boolean;
  readonly pawEnabled: boolean;
  /** Tutorial: the bulb is free, so its badge reads "Free" (02 §9.3). */
  readonly hintsFree: boolean;
}

export interface ToolBarCallbacks {
  onBulb(): void;
  onPaw(): void;
}

export interface ToolBarView extends View<ToolBarProps> {
  /** Client rect of a tool button (coach target in tutorial step 5). */
  toolRect(tool: 'bulb' | 'paw'): DOMRect | null;
}

export function createToolBar(props: ToolBarProps, cb: ToolBarCallbacks): ToolBarView {
  throw new Error('not implemented: createToolBar');
}
