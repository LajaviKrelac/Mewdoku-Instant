// Owner: D
// FB overlay views (phase2b §5.2, §5.4): overlayViews.createOverlayViewWithXMLString(xml, css, data,
// onLoad, onError, basePath). The only place other players' names and photos appear (05 §3). Placing
// a view inside a rect, tap forwarding and dismissal are [uncertain] until §14 G3; cfg.rank.
// overlayPlacement stays 'fullscreen' until then. Lazy `fb-social` chunk.
// F0 stub: signatures final; bodies are D's.
import type { GameConfig } from '../../app/config';
import type { PlatformTimers } from '../types';
import type { FBInstantSDK } from './fbinstant';

export interface FbOverlayViews {
  /** overlayViews.createOverlayViewWithXMLString exists. */
  supported(): boolean;
  /**
   * Creates and shows a view from our XML/CSS templates with `data` bound. With `rect` it is placed
   * inside it (only when placement in a rect works, G3). null when unsupported, on error or after
   * rank.fetchTimeoutMs. Never rejects.
   */
  show(xml: string, css: string, data: unknown, rect?: DOMRect): Promise<{ close(): void } | null>;
}

export interface FbOverlayViewsOptions {
  readonly timers: PlatformTimers;
  readonly config?: GameConfig;
}

export function createFbOverlayViews(sdk: FBInstantSDK, opts: FbOverlayViewsOptions): FbOverlayViews {
  void sdk;
  void opts;
  throw new Error('not implemented: createFbOverlayViews (D, phase2b §5.4)');
}
