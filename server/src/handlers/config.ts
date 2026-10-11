// Owner: G4 (Phase 2e). GET /v1/config (spec §1.15, D-2e-19): the remote switches from RC_SWITCHES
// (booleans of REMOTE_SWITCHES only), `ttlSec` 3600; no sign-in, no DB. With dev routes, `?devPool=<p>`
// answers the switches a test set for its pool (POST /dev/config). Not affected by the kill switch: the
// switches must keep working while the ranking is off.
import { DEV_POOL_RE, type ConfigResponse } from '../contract';
import { devAllowed, type Ctx } from '../http/context';
import { json } from '../http/errors';
import { limitByIp } from '../http/auth';

export function getConfig(ctx: Ctx): Response {
  limitByIp(ctx, 'session');
  const s = ctx.s;
  const devPool = ctx.url.searchParams.get('devPool');
  let switches = s.cfg.rcSwitches;
  let now = s.clock.now();
  if (devPool !== null && devAllowed(ctx) && DEV_POOL_RE.test(devPool)) {
    switches = s.dev.switches.get(devPool) ?? switches;
    now = s.nowFor(`fb:${devPool}`);
  }
  s.metrics.count('config');
  const body: ConfigResponse = { switches: { ...switches }, ttlSec: s.cfg.configTtlSec, serverTime: now };
  return json(body);
}
