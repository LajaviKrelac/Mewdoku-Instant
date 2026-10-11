// Owner: G4 (Phase 2e). GET /v1/bracket (spec §1.4): my open bracket, or the one that ended less than 24 h
// ago (finalised lazily), else state "none". Exactly the visible rows, in the server's order (H-2, H-3).
import type { Ctx } from '../http/context';
import { json } from '../http/errors';
import { authenticate } from '../http/auth';
import { bracketView } from './views';

export async function getBracket(ctx: Ctx): Promise<Response> {
  const { player, now } = await authenticate(ctx, 'bracket');
  return json(await bracketView(ctx.s, player, now));
}
