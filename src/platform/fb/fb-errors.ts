// Owner: platform
// Reading FB SDK rejections (05 §6.2, §7): they are { code, message } objects, but be defensive.

/** The `code` of an SDK error, or null when the value carries none. */
export function fbErrorCode(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return null;
}

/** Short text for logs; never includes player data. */
export function fbErrorText(err: unknown): string {
  const code = fbErrorCode(err);
  const msg =
    typeof err === 'object' && err !== null && 'message' in err ? String((err as { message?: unknown }).message ?? '') : String(err);
  return code ? `${code}: ${msg}` : msg;
}
