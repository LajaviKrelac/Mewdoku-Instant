// Owner: ui-shell
// O4 fail overlay (02 §5 O4, §10.2): Continue (+1 heart) when offered, Retry level, Home.
import type { OverlayView } from '../dom';

export interface FailOverlayProps {
  /** 'video' = rewarded ad; 'free' = fallback grant (no video icon); null = hide Continue. */
  readonly continueOffer: 'video' | 'free' | null;
  /** fx.failButtonDelayMs (buttons disabled until then; 0 when restored from a save). */
  readonly buttonDelayMs: number;
  /** true while waiting for the ad: buttons disabled. */
  readonly busy: boolean;
  onContinue(): void;
  onRetry(): void;
  /** Discards the attempt (02 §10.2). */
  onHome(): void;
}

export function createFailOverlay(): OverlayView<FailOverlayProps> {
  throw new Error('not implemented: createFailOverlay');
}
