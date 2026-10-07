// Owner: app
// visibilitychange + platform.onPause → pause the timer, mute, save now (02 §7.2, §15; 05 §4).
// FB onPause has no resume callback: the return is detected via visibilitychange / focus.
import type { PlatformAdapter } from '../platform/types';

export type HideReason = 'hidden' | 'fb_pause';

export interface VisibilityDeps {
  readonly doc: Document;
  readonly platform: Pick<PlatformAdapter, 'onPause'>;
  onHide(reason: HideReason): void;
  onShow(): void;
}

/** Returns the unsubscribe (platform.onPause cannot be removed; it is ignored after disposal). */
export function watchVisibility(deps: VisibilityDeps): () => void {
  throw new Error('not implemented: watchVisibility');
}
