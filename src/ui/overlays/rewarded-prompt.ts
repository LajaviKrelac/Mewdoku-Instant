// Owner: ui-shell
// O2 rewarded-ad prompt (02 §5 O2, §13.3). Revive does not use it (the O4 button is the prompt).
import type { OverlayView } from '../dom';

export type RewardedVariant =
  | 'video' // [Watch video] [Not now]
  | 'free' // "Here's a free hint." [Take it] [Not now]
  | 'countdown'; // "Next free hint in m:ss" (live), [OK] only

export interface RewardedPromptProps {
  readonly placement: 'hint' | 'kitty';
  readonly variant: RewardedVariant;
  /** Epoch ms when the free fallback opens again (countdown variant). */
  readonly nextFreeAt: number;
  /** Clock for the live countdown. */
  now(): number;
  /** Watch video / Take it. */
  onAccept(): void;
  /** Not now / OK / Esc. */
  onDecline(): void;
}

export function createRewardedPrompt(): OverlayView<RewardedPromptProps> {
  throw new Error('not implemented: createRewardedPrompt');
}
