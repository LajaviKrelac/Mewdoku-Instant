// Owner: ui-board
// Polite aria-live region (02 §18): "Cat placed. 4 of 8.", "Wrong tile. 2 hearts left.", "Lavender done."

export interface Announcer {
  /** Announces politely; repeated identical messages are still read (the region is reset first). */
  say(message: string): void;
  clear(): void;
  destroy(): void;
}

/** Creates a visually hidden role="status" aria-live="polite" region inside `host` (default body). */
export function createAnnouncer(host?: HTMLElement): Announcer {
  throw new Error('not implemented: createAnnouncer');
}
