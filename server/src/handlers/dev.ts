// Owner: G4 (Phase 2e). /dev/* (spec §1.3, §1.4, §10.3): only with DEV_ROUTES exactly "true", outside
// production, on a loopback host (the Node dev server that Playwright starts). Per test pool: move its clock,
// set its remote switches, turn computer rivals on for its new brackets, run the cron, wipe it. There is NO
// seeding route (H-1): other players are made by test clients through the public API
// (tests/e2e/helpers/rank-players.ts); computer rivals are not rows (D-2e-24), so /dev/rivals seeds nothing.
import { DEV_POOL_RE, REMOTE_SWITCHES, type RemoteSwitch } from '../contract';
import type { Ctx } from '../http/context';
import { fail, json } from '../http/errors';
import { readJson } from '../http/json';
import { runCron } from '../cron';

function poolOf(body: unknown): string {
  const p = (body as { devPool?: unknown } | null)?.devPool;
  if (typeof p !== 'string' || !DEV_POOL_RE.test(p)) return fail('bad_request', 'devPool');
  return p;
}

export async function devRoute(ctx: Ctx, method: string, rest: string): Promise<Response | null> {
  if (method !== 'POST') return null;
  const s = ctx.s;
  if (rest === 'clock') {
    const body = await readJson(ctx.req, s.cfg.api.maxBodyBytes);
    const pool = poolOf(body);
    const b = body as { offsetMs?: unknown; advanceMs?: unknown };
    let offset = s.dev.offsets.get(pool) ?? 0;
    if (b.offsetMs !== undefined) {
      if (typeof b.offsetMs !== 'number' || !Number.isFinite(b.offsetMs)) return fail('bad_request', 'offsetMs');
      offset = b.offsetMs;
    }
    if (b.advanceMs !== undefined) {
      if (typeof b.advanceMs !== 'number' || !Number.isFinite(b.advanceMs)) return fail('bad_request', 'advanceMs');
      offset += b.advanceMs;
    }
    s.dev.offsets.set(pool, offset);
    return json({ devPool: pool, offsetMs: offset, serverTime: s.nowFor(`fb:${pool}`) });
  }
  if (rest === 'reset') {
    const pool = poolOf(await readJson(ctx.req, s.cfg.api.maxBodyBytes));
    await s.store.resetPool(pool);
    s.dev.offsets.delete(pool);
    s.dev.switches.delete(pool);
    s.dev.rivals.delete(pool);
    s.limiter.clear();
    return json({ devPool: pool, serverTime: s.clock.now() });
  }
  if (rest === 'config') {
    const body = await readJson(ctx.req, s.cfg.api.maxBodyBytes);
    const pool = poolOf(body);
    const raw = (body as { switches?: unknown }).switches;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail('bad_request', 'switches');
    const switches: Partial<Record<RemoteSwitch, boolean>> = {};
    for (const name of REMOTE_SWITCHES) {
      const v = (raw as Record<string, unknown>)[name];
      if (typeof v === 'boolean') switches[name] = v;
    }
    s.dev.switches.set(pool, switches);
    return json({ devPool: pool, switches, serverTime: s.nowFor(`fb:${pool}`) });
  }
  if (rest === 'rivals') {
    // 2026-10-12, D-2e-24: computer rivals for this test pool's NEW brackets and the disclosure line for its
    // players (services.ts rivalsForPool / rivalsNoteFor), whatever RIVALS says; /dev/reset clears it.
    const body = await readJson(ctx.req, s.cfg.api.maxBodyBytes);
    const pool = poolOf(body);
    const on = (body as { on?: unknown }).on;
    if (typeof on !== 'boolean') return fail('bad_request', 'on');
    s.dev.rivals.set(pool, on);
    return json({ devPool: pool, on, serverTime: s.nowFor(`fb:${pool}`) });
  }
  if (rest === 'cron') {
    const body = await readJson(ctx.req, s.cfg.api.maxBodyBytes);
    const pool = poolOf(body);
    // Only this test pool's brackets, at its own clock (parallel tests never finalise each other's).
    const report = await runCron(s, s.nowFor(`fb:${pool}`), { retention: false, stats: false, pools: [`fb:${pool}`, `web:${pool}`] });
    return json({ devPool: pool, report, serverTime: s.nowFor(`fb:${pool}`) });
  }
  return null;
}
