// Leaderboard update. POST /v1/presence {state: 'online' | 'playing'}: my own row's activity in my running
// bracket, what the other members see as "Online now", "Playing now" or "2m ago" (BracketRow.seenAt, .playing).
// One indexed UPDATE of one row; nothing for a player who is not listed or in no running bracket (H-2: a hidden
// row is never touched). Shares the `bracket` rate bucket (the client pings at most about once a minute).
import { validatePresenceRequest, type PresenceResponse } from '../contract';
import { authenticate } from '../http/auth';
import type { Ctx } from '../http/context';
import { fail, json } from '../http/errors';
import { readJson } from '../http/json';

export async function postPresence(ctx: Ctx): Promise<Response> {
  const s = ctx.s;
  const { player, now } = await authenticate(ctx, 'bracket');
  const raw = await readJson(ctx.req, s.cfg.api.maxBodyBytes);
  const v = validatePresenceRequest(raw);
  if (!v.ok) return fail('bad_request', v.path);
  ctx.fields.presence = v.value.state;
  let updated = false;
  if (s.cfg.presence.enabled && player.listed === 1 && player.cur_bracket !== null && (player.cur_ends_at ?? 0) > now) {
    updated = await s.store.setPresence(player.key, player.cur_bracket, now, v.value.state === 'playing');
  }
  const body: PresenceResponse = { updated, serverTime: now };
  return json(body);
}
