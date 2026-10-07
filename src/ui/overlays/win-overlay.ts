// Owner: ui-shell
// O3 win overlay (02 §5 O3, §10.1): praise word, celebrating cat, confetti, Next enabled after
// buttonDelayMs, Home always enabled. Phase 3 hook: an empty reward slot element (02 §22).
import type { OverlayView } from '../dom';

export interface WinOverlayProps {
  /** 'tutorial': "You're ready!" + Play Level 2; 'tutorial_replay': "You're ready!" + Home only. */
  readonly variant: 'level' | 'tutorial' | 'tutorial_replay';
  /** The level just won (1 for the tutorial). */
  readonly level: number;
  readonly nextLevel: number;
  /** Index into PRAISE_KEYS (the app picks it). */
  readonly praise: number;
  /** fx.winButtonDelayMs (Next stays disabled until then). */
  readonly buttonDelayMs: number;
  readonly reducedMotion: boolean;
  onNext(): void;
  onHome(): void;
}

export function createWinOverlay(): OverlayView<WinOverlayProps> {
  throw new Error('not implemented: createWinOverlay');
}
