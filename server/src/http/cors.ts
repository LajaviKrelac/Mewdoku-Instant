// Owner: G4 (Phase 2e). CORS (spec §1.2, §1.4, critic C-16): an ABUSE GUARD, not the auth boundary (no
// cookie or other ambient credential exists; the bearer token travels from memory). `ALLOWED_ORIGINS` holds
// exact origins, the literal `null` (only if a measured surface sends it), `*` (last resort), or one
// `https://*.<suffix>` wildcard per entry (one DNS label). The server echoes an allowed origin with
// `Vary: Origin`; never `Access-Control-Allow-Credentials`; /admin/* and /dev/* never send CORS headers.

/** True when `origin` (the request's Origin header) matches an entry of the allow-list. */
export function originAllowed(origin: string, allowed: readonly string[]): boolean {
  for (const a of allowed) {
    if (a === '*' || a === origin) return true;
    const m = /^(https?):\/\/\*\.(.+)$/.exec(a);
    if (m) {
      const prefix = `${m[1]}://`;
      const suffix = `.${m[2]}`;
      if (origin.startsWith(prefix) && origin.endsWith(suffix)) {
        const label = origin.slice(prefix.length, origin.length - suffix.length);
        if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) return true;
      }
    }
  }
  return false;
}

export function corsHeaders(origin: string): Record<string, string> {
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
}

export function preflightHeaders(origin: string): Record<string, string> {
  return {
    ...corsHeaders(origin),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '7200',
  };
}
