// Owner: G4 (Phase 2e). Authentication (spec §1.3, critic C-12): the bearer token's MAC and expiry (no DB),
// the per-player rate bucket, the client version, then ONE read of the player row by primary key — a
// deleted player's token is 401 `token_invalid` and nothing is created; a suspended player is 403
// `suspended` on reads too, so a suspended player is never served a view without their own row (H-5).
// Admin routes: `Authorization: Bearer <ADMIN_KEY>` (≥ 32 characters), compared in constant time.
import type { RateBucket } from '../core/config';
import { timingSafeEqual } from '../core/crypto';
import { readToken, type TokenClaims } from '../core/token';
import { isBelowMin } from '../core/version';
import type { PlayerRow } from '../store/sql-store';
import type { Ctx } from './context';
import { fail } from './errors';
import { ipBucketKey } from './ratelimit';

export interface Authed {
  readonly claims: TokenClaims;
  readonly player: PlayerRow;
  /** The server time of the player's pool. */
  readonly now: number;
}

function bearer(ctx: Ctx): string | null {
  const m = /^Bearer\s+(\S+)\s*$/.exec(ctx.req.headers.get('Authorization') ?? '');
  return m ? (m[1] as string) : null;
}

export function limit(ctx: Ctx, bucket: RateBucket, id: string): void {
  const r = ctx.s.limiter.take(bucket, id, ctx.s.clock.now());
  if (!r.ok) {
    const l = ctx.s.cfg.rateLimits[bucket];
    fail('rate_limited', `${bucket}: ${l.n} per ${l.perMs >= 3_600_000 ? 'hour' : 'minute'}`, r.retryAfterMs);
  }
}

export function limitByIp(ctx: Ctx, bucket: RateBucket): void {
  limit(ctx, bucket, `ip:${ipBucketKey(ctx.ip)}`);
}

export async function authenticate(ctx: Ctx, bucket: RateBucket): Promise<Authed> {
  const token = bearer(ctx);
  if (token === null) return fail('token_invalid', 'bearer token required');
  const key = await ctx.s.keys.session();
  if (key === null) return fail('unavailable', 'server not configured', 60_000);
  const t = await readToken(key, token, (pool) => ctx.s.nowFor(pool));
  if (!t.ok) return fail(t.code, t.code === 'token_expired' ? 'token expired' : 'token invalid');
  const now = ctx.s.nowFor(t.claims.p);
  ctx.serverTime = now;
  ctx.fields.code = t.claims.c;
  ctx.fields.pool = t.claims.p;
  limit(ctx, bucket, t.claims.k);
  if (isBelowMin(t.claims.v, ctx.s.cfg.minClientVersion)) fail('upgrade_required', `client ${t.claims.v} below ${ctx.s.cfg.minClientVersion}`);
  const player = await ctx.s.store.getPlayer(t.claims.k);
  if (player === null) return fail('token_invalid', 'no such player');
  if (player.status === 'suspended') return fail('suspended', 'ranking paused for this player');
  return { claims: t.claims, player, now };
}

export function authAdmin(ctx: Ctx): void {
  limitByIp(ctx, 'admin');
  const want = ctx.s.env.ADMIN_KEY;
  const got = bearer(ctx);
  // Constant time over the presented key; a missing or short ADMIN_KEY disables the admin routes.
  const ok = typeof want === 'string' && want.length >= 32 && got !== null && timingSafeEqual(got, want);
  if (!ok) fail('token_invalid', 'admin key required');
}
