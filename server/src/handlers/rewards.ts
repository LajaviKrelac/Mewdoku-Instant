// Owner: G4 (Phase 2e). POST /v1/rewards/claim (spec §1.6, D-2e-17): idempotent per reward id. `double`
// is trusted once (no server-side check of a rewarded video exists) and only when the rules allow ×2;
// a retried claim answers `alreadyClaimed: true` with the stored doubling. Another player's reward, an
// expired or a voided one: 404 `not_found` (the client treats it as gone).
import { validateClaimRequest, type ClaimResponse } from '../contract';
import { grantOf } from '../core/brackets';
import { authenticate } from '../http/auth';
import type { Ctx } from '../http/context';
import { fail, json } from '../http/errors';
import { readJson } from '../http/json';

export async function postClaim(ctx: Ctx): Promise<Response> {
  const s = ctx.s;
  const { player, now } = await authenticate(ctx, 'claims');
  const v = validateClaimRequest(await readJson(ctx.req, s.cfg.api.maxBodyBytes));
  if (!v.ok) return fail('bad_request', v.path);
  const double = v.value.double && s.cfg.rewards.doubleByVideo;
  const { fresh, row } = await s.store.claim(v.value.rewardId, player.key, double, now);
  if (row === null || row.claimed_at === null || row.voided === 1) return fail('not_found', 'no such reward');
  const doubled = row.doubled === 1;
  s.metrics.count('reward', fresh ? (doubled ? 'claimed_doubled' : 'claimed') : 'claim_repeat');
  const body: ClaimResponse = {
    rewardId: row.id,
    grant: grantOf(row.hints, row.kitties, doubled),
    doubled,
    claimedAt: row.claimed_at,
    place: row.place,
    alreadyClaimed: !fresh,
    serverTime: now,
  };
  return json(body);
}
