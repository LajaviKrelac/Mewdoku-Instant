// Owner: ui-shell
// O6 how to play (02 §4.2, §14): three illustrated rules, controls, plus "I know how to play"
// (only while the first-run tutorial runs) or "Replay tutorial" (after it is done).
import type { OverlayView } from '../dom';

export interface HowToPlayProps {
  /** First-run tutorial running → offer "I know how to play". */
  readonly showSkip: boolean;
  /** Tutorial done → offer "Replay tutorial". */
  readonly showReplay: boolean;
  onSkip(): void;
  onReplay(): void;
  onClose(): void;
}

export function createHowToPlay(): OverlayView<HowToPlayProps> {
  throw new Error('not implemented: createHowToPlay');
}
