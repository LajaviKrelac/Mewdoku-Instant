// Owner: ui-board
// Cat counter and hearts pills (02 §5 S2), heart crack on MISTAKE (02 §17.5).
import type { GameEvent } from '../../game/types';
import type { View } from '../dom';

export interface PillsProps {
  readonly catsPlaced: number;
  readonly n: number;
  readonly hearts: number;
  readonly maxHearts: number;
  readonly compact: boolean;
}

export interface PillsView extends View<PillsProps> {
  /** MISTAKE → crack the heart that was lost; REVIVED → refill animation. */
  playEvent(ev: GameEvent): void;
}

export function createPills(props: PillsProps): PillsView {
  throw new Error('not implemented: createPills');
}
