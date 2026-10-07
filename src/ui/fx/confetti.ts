// Owner: ui-board
// CSS particle burst: cfg.fx.confettiCount absolutely positioned <i> with random CSS variables,
// removed after cfg.fx.confettiMs (02 §17.5). Skipped under reduced motion by the caller.

/** Appends the burst to `host`; returns a cleanup that removes it early. */
export function burstConfetti(host: HTMLElement, opts?: { count?: number; durationMs?: number }): () => void {
  throw new Error('not implemented: burstConfetti');
}
