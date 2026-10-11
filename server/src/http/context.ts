// Owner: G4 (Phase 2e). One request's context: the services, the request, the client IP (only for the
// in-memory rate limiter and the anonymous mode's daily salted hash; never stored or logged) and the log
// fields the handlers fill (player code, pool, win count, verdicts; spec §1.14).
import type { LogLine, Services } from '../services';

export interface Ctx {
  readonly s: Services;
  readonly req: Request;
  readonly url: URL;
  readonly ip: string;
  readonly fields: LogLine;
  /** The last server time computed for this request (error bodies carry it). */
  serverTime: number;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Dev routes and `devPool`: DEV_ROUTES exactly "true", not production, AND a loopback host (spec §10.5 #2). */
export function devAllowed(ctx: Ctx): boolean {
  return ctx.s.cfg.devRoutes && LOOPBACK.has(ctx.url.hostname);
}
