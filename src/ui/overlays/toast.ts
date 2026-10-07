// Owner: ui-shell
// O9 toast layer (02 §4.1): short non-blocking messages ("No videos right now — try again soon.").

export interface ToastLayer {
  readonly el: HTMLElement;
  /** Shows for durationMs (default fx.toastMs); a new toast replaces the current one. */
  show(message: string, opts?: { durationMs?: number }): void;
  clear(): void;
  destroy(): void;
}

export function createToastLayer(): ToastLayer {
  throw new Error('not implemented: createToastLayer');
}
