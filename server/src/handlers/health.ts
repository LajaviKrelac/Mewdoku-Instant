// Owner: G4 (Phase 2e). GET /v1/health (spec §1.4): liveness, version, the content versions the solution
// table covers, and a DB probe cached for `healthCacheMs` per isolate (floods never reach D1). No auth.
import type { HealthResponse } from '../contract';
import type { Ctx } from '../http/context';
import { json } from '../http/errors';

export async function getHealth(ctx: Ctx): Promise<Response> {
  const s = ctx.s;
  const t = s.clock.now();
  if (!s.health || t - s.health.at > s.cfg.healthCacheMs) {
    let db: 'ok' | 'down' = 'down';
    try {
      db = (await s.store.ping()) ? 'ok' : 'down';
    } catch {
      db = 'down';
    }
    s.health = { at: t, db };
  }
  const body: HealthResponse = { ok: s.health.db === 'ok', version: s.version, contentVersions: [...s.content.contentVersions], db: s.health.db, serverTime: t };
  return json(body);
}
