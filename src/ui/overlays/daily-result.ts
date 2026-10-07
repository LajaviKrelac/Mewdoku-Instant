// Owner: ui-shell
// O7 daily result (02 §5 O7, §12): date, happy cat, solve time, mistakes and hints, next puzzle countdown.
import type { OverlayView } from '../dom';

export interface DailyResultProps {
  readonly dateKey: string;
  readonly ms: number;
  readonly mistakes: number;
  readonly hints: number;
  readonly kitties: number;
  /** Epoch ms of the next local midnight. */
  readonly nextPuzzleAt: number;
  now(): number;
  /** Done: interstitial gate 'daily_done', then Home (also used when reopened from Home). */
  onDone(): void;
}

export function createDailyResult(): OverlayView<DailyResultProps> {
  throw new Error('not implemented: createDailyResult');
}
