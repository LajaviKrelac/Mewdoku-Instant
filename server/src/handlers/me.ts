// Owner: G4 (Phase 2e). GET /v1/me (Settings: profile, player code, a data summary) and DELETE /v1/me
// ("Delete my ranking data", spec §1.11): one batch removes every row of mine; finalised brackets keep
// their past ranks and counts (an honest gap); a suspended player leaves a 90-day tombstone. 204.
import type { MeResponse } from '../contract';
import { DAY } from '../core/clock';
import { authenticate } from '../http/auth';
import type { Ctx } from '../http/context';
import { json, noContent } from '../http/errors';
import { playerView } from './views';

export async function getMe(ctx: Ctx): Promise<Response> {
  const s = ctx.s;
  const { player, now } = await authenticate(ctx, 'me');
  const data = await s.store.meData(player.key, now - s.cfg.retention.winsDays * DAY);
  const body: MeResponse = { player: playerView(player, s.cfg, now), data: { ...data, createdAt: player.created_at }, serverTime: now };
  return json(body);
}

export async function deleteMe(ctx: Ctx): Promise<Response> {
  const s = ctx.s;
  const { player, now } = await authenticate(ctx, 'me');
  await s.store.deletePlayer(player.key, now + s.cfg.retention.tombstoneDays * DAY);
  s.metrics.count('delete', 'self');
  return noContent();
}
