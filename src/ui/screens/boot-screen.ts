// Owner: ui-shell
// S0 web splash (02 §5): wordmark, sleeping cat, progress bar. FBIG uses Facebook's own loader.

export interface BootScreen {
  readonly el: HTMLElement;
  /** 0..100. */
  setProgress(pct: number): void;
  destroy(): void;
}

export function createBootScreen(): BootScreen {
  throw new Error('not implemented: createBootScreen');
}
