// Owner: ui-shell
// O10 rotate notice (02 §19): shown on a landscape phone whose height is < layout.rotateMaxHeight.
// Self-managing: listens to resize / visualViewport and toggles itself.

/** Landscape (w > h) and h < layout.rotateMaxHeight. */
export function shouldShowRotateNotice(width: number, height: number): boolean {
  throw new Error('not implemented: shouldShowRotateNotice');
}

export function mountRotateNotice(host: HTMLElement, win?: Window): { readonly el: HTMLElement; destroy(): void } {
  throw new Error('not implemented: mountRotateNotice');
}
