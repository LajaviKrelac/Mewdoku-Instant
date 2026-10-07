// Owner: ui-shell
// O8 tutorial coach (02 §5 O8, §11.5): dims everything except the focus, pulsing outline, animated
// hand, text card (+ "Got it" in step 2). NON-modal: the board stays interactive under it.
import type { CoachHand, TutorialStepIndex } from '../../game/tutorial';
import type { OverlayView } from '../dom';

export interface CoachProps {
  readonly step: TutorialStepIndex;
  readonly hand: CoachHand;
  readonly showGotIt: boolean;
  /** Palette index for {color} in the step text (step 1: Lavender), or null. */
  readonly colorParam: number | null;
  /** Client rects of the focus targets (cells or the bulb); re-read on resize. */
  targetRects(): readonly DOMRect[];
  onGotIt(): void;
}

export function createCoach(): OverlayView<CoachProps> {
  throw new Error('not implemented: createCoach');
}
