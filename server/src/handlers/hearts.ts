// Owner: G4 (Phase 2e). POST /v1/hearts (spec §1.7, D-2e-18, P-L10): a member gives one heart per row of
// their bracket (their own row once when allowed), at most `hearts.maxGivenPerBracket`, while the bracket
// runs or ended less than 24 h ago. One guarded batch (critic C-20). No reward, no text, no notification.
// 2026-10-12, D-2e-24: a heart on a computer player's row (slot ≥ 9000) is an ordinary hearts row under the
// same rules (one per row, the same cap); its shown count is the rival's built-in hearts plus the real ones.
// Computer players never give hearts, so "hearts from other players" stays real.
import { validateHeartRequest, type HeartResponse } from '../contract';
import { isRivalSlot } from '../core/rivals';
import { rivalHeartTarget } from '../core/table';
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
  if (isRivalSlot(slot)) {
    // No extra read: K and the rival's script come from the bracket row read above.
    const target = rivalHeartTarget(b, slot, now, s.cfg.rivals.hide);
    if (!target) return fail('not_found', 'no such row');
    const rh = await s.store.giveRivalHeart(bracketId, me.slot, player.key, slot, target.maxNextSlot, now, cap);
    if (!rh.added) {
      if (rh.exists) return fail('heart_exists', 'heart already given');
      if (rh.given >= cap) return fail('heart_limit', `at most ${cap} hearts per bracket`);
      return fail('not_found', 'no such row');
    }
    s.metrics.count('heart', 'rival');
    const rivalBody: HeartResponse = { bracketId, slot, hearts: target.builtIn + rh.realHearts, likedByMe: true, givenInBracket: rh.given, serverTime: now };
    return json(rivalBody);
  }
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
