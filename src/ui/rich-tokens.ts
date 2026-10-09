// Owner: U (Phase 2b review fixes, PAR-7)
// The rich-text token format, a dependency-free leaf: hint-text.ts (main bundle, also used for the
// live announcements) builds tokens with it, and rich-text.ts (the renderer) reads them. Keeping the
// renderer out of hint-text's imports keeps the main bundle's chunk graph unchanged.

/** Private-use sentinels: a colour token is OPEN + id + CLOSE; CAP asks for the next text to be capitalised. */
export const OPEN = '';
export const CLOSE = '';
export const CAP = '';

/** A colour reference inside a translated string (rendered by setRichText through `opts.color`). */
export function colorToken(id: number): string {
  return `${OPEN}${id}${CLOSE}`;
}
