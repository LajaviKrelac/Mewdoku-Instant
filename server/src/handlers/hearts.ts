// Owner: G4 (Phase 2e). POST /v1/hearts (spec §1.7, D-2e-18, P-L10): a member gives one heart per row of
// their bracket (their own row once when allowed), at most `hearts.maxGivenPerBracket`, while the bracket
// runs or ended less than 24 h ago. One guarded batch (critic C-20). No reward, no text, no notification.
import { validateHeartRequest, type HeartResponse } from '../contract';
import { authenticate } from '../http/auth';
import type { Ctx } from '../http/context';
import { fail, json } from '../http/errors';
import { readJson } from '../http/json';

export async function postHeart(ctx: Ctx): Promise<Response> {
  const s = ctx.s;
  const { player, now } = await authenticate(ctx, 'hearts');
  const v = validateHeartRequest(await readJson(ctx.req, s.cfg.api.maxBodyBytes));
  if (!v.ok) return fail('bad_request', v.path);
  const { bracketId, slot } = v.value;
  if (!s.cfg.hearts.enabled) return fail('not_found', 'hearts are off');
  const b = await s.store.getBracket(bracketId);
  if (!b || b.ends_at + s.cfg.bracket.endedViewMs <= now) return fail('not_found', 'no such bracket');
  const me = await s.store.getMember(bracketId, player.key);
  if (!me) return fail('not_member', 'not a member of this bracket');
  if (slot === me.slot && !s.cfg.hearts.allowSelf) return fail('not_found', 'own row');
  const cap = s.cfg.hearts.maxGivenPerBracket;
  const r = await s.store.giveHeart(bracketId, me.slot, slot, now, cap);
  if (!r.added) {
    if (r.exists) return fail('heart_exists', 'heart already given');
    if (!r.targetVisible) return fail('not_found', 'no such row');
    if (r.given >= cap) return fail('heart_limit', `at most ${cap} hearts per bracket`);
    return fail('not_found', 'no such row');
  }
  s.metrics.count('heart', slot === me.slot ? 'self' : 'other');
  const body: HeartResponse = { bracketId, slot, hearts: r.hearts ?? 0, likedByMe: true, givenInBracket: r.given, serverTime: now };
  return json(body);
}
