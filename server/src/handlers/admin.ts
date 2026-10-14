// Owner: G4 (Phase 2e). /admin/v1/* (spec §1.4, §1.9.7, §11.7): `Authorization: Bearer <ADMIN_KEY>` (and
// Cloudflare Access in front, G-SRV-4); never CORS. Every path id is checked against its pattern before any
// SQL (critic C-21). Every action is logged to admin_log (1 year). Nothing here creates a ranking row (H-1).
import { BRACKET_ID_RE, PLAYER_CODE_RE } from '../contract';
import { paidPlaces, rankRows } from '../core/brackets';
import { DAY, utcDateKey } from '../core/clock';
import { generateNick, renderNick } from '../core/nickname';
import { sha256 } from '../core/crypto';
import { newRowId, rewardId } from '../core/ids';
import { authAdmin } from '../http/auth';
import type { Ctx } from '../http/context';
import { fail, json, noContent } from '../http/errors';
import type { PlayerRow } from '../store/sql-store';
import { playerView } from './views';

const FLAG_ID_RE = /^[0-9a-z]{8,24}$/;

function adminPlayerView(p: PlayerRow, ctx: Ctx, now: number): Record<string, unknown> {
  return {
    ...playerView(p, ctx.s.cfg, now),
    storedPool: p.pool,
    createdAt: p.created_at,
    seenAt: p.seen_at,
    maxLevel: p.max_level,
    flagCount: p.flag_count,
    clientVersion: p.client_version,
    currentBracket: p.cur_bracket,
  };
}

async function playerByCode(ctx: Ctx, code: string): Promise<PlayerRow> {
  if (!PLAYER_CODE_RE.test(code)) return fail('bad_request', 'code');
  const p = await ctx.s.store.getPlayerByCode(code);
  if (!p) return fail('not_found', 'no such player');
  return p;
}

/** Routes under /admin/v1/; null when the path is not one of them. */
export async function adminRoute(ctx: Ctx, method: string, rest: string): Promise<Response | null> {
  const s = ctx.s;
  const now = s.clock.now();
  ctx.serverTime = now;
  let m: RegExpExecArray | null;
  const route = (r: string): void => void (ctx.fields.route = `/admin/v1/${r}`);
  if (method === 'GET' && rest === 'flags') {
    route('flags');
    authAdmin(ctx);
    const limit = Math.min(500, Math.max(1, Number(ctx.url.searchParams.get('limit') ?? 100) || 100));
    const flags = await s.store.listFlags(limit);
    return json({ flags: flags.map((f) => ({ id: f.id, at: f.at, kind: f.kind, detail: f.detail, code: f.code })), serverTime: now });
  }
  if (method === 'POST' && (m = /^flags\/([^/]+)\/resolve$/.exec(rest))) {
    route('flags/{id}/resolve');
    authAdmin(ctx);
    const id = m[1] as string;
    if (!FLAG_ID_RE.test(id)) return fail('bad_request', 'id');
    const ok = await s.store.resolveFlag(id, now);
    if (!ok) return fail('not_found', 'no open flag');
    await s.store.adminLog(newRowId(now, s.rng), now, 'resolve_flag', id, null);
    return json({ ok: true, serverTime: now });
  }
  if ((m = /^players\/([^/]+)$/.exec(rest))) {
    route('players/{code}');
    authAdmin(ctx);
    const p = await playerByCode(ctx, m[1] as string);
    if (method === 'GET') {
      const detail = await s.store.playerDetail(p.key);
      return json({ player: adminPlayerView(p, ctx, now), ...detail, serverTime: now });
    }
    if (method === 'DELETE') {
      await s.store.deletePlayer(p.key, now + s.cfg.retention.tombstoneDays * DAY);
      await s.store.adminLog(newRowId(now, s.rng), now, 'delete', p.code, 'email request');
      s.metrics.count('delete', 'admin');
      return noContent();
    }
    return null;
  }
  if (method === 'POST' && (m = /^players\/([^/]+)\/(suspend|reinstate|reset-nickname)$/.exec(rest))) {
    route(`players/{code}/${m[2] as string}`);
    authAdmin(ctx);
    const p = await playerByCode(ctx, m[1] as string);
    const action = m[2] as string;
    if (action === 'suspend') await s.store.suspend(p.key, newRowId(now, s.rng), now, p.code);
    else if (action === 'reinstate') await s.store.reinstate(p.key, newRowId(now, s.rng), now, p.code);
    else {
      // A fresh generated name (a different seed than the first one), copied to open-bracket rows. UI batch: the
      // reset starts the name cooldown (changedAt: now), so a player whose typed name was reset cannot type another
      // one at once; the reset itself is never refused by a running cooldown (no guard).
      const { nick } = generateNick(await sha256(`reset:${p.key}:${now}`), s.words, s.retired);
      await s.store.updateProfile(p.key, { nickname: { text: renderNick(s.words, nick), nick, changedAt: now, cooldownBefore: null } });
      await s.store.adminLog(newRowId(now, s.rng), now, 'reset_nickname', p.code, null);
    }
    const fresh = await s.store.getPlayer(p.key);
    return json({ player: fresh ? adminPlayerView(fresh, ctx, now) : null, serverTime: now });
  }
  if (method === 'POST' && (m = /^brackets\/([^/]+)\/refinalize$/.exec(rest))) {
    route('brackets/{id}/refinalize');
    authAdmin(ctx);
    const id = m[1] as string;
    if (!BRACKET_ID_RE.test(id)) return fail('bad_request', 'id');
    const b = await s.store.getBracket(id);
    if (!b) return fail('not_found', 'no such bracket');
    if (b.ends_at > now) return fail('bad_request', 'the bracket is still running');
    const members = await s.store.members(id);
    const ranked = rankRows(members.filter((x) => x.hidden === 0).map((x) => ({ slot: x.slot, points: x.points, scoredAt: x.scored_at, key: x.player_key })));
    const inWindow = now < b.ends_at + s.cfg.rewards.claimTtlMs;
    const rewards = inWindow
      ? paidPlaces(ranked, s.cfg).map((p) => ({
          id: rewardId(id, p.slot),
          playerKey: (ranked.find((r) => r.slot === p.slot) as { key: string }).key,
          place: p.place,
          hints: p.hints,
          kitties: p.kitties,
          expiresAt: now + s.cfg.rewards.claimTtlMs,
        }))
      : [];
    await s.store.refinalize(
      id,
      ranked.map((r) => ({ slot: r.slot, rank: r.rank })),
      rewards,
      now,
    );
    await s.store.adminLog(newRowId(now, s.rng), now, 'refinalize', id, `${ranked.length} ranked`);
    return json({ bracket: { id, finalMembers: ranked.length, rewards: rewards.length }, serverTime: now });
  }
  if (method === 'GET' && rest === 'stats') {
    route('stats');
    authAdmin(ctx);
    const days = Math.min(90, Math.max(1, Number(ctx.url.searchParams.get('days') ?? 7) || 7));
    const rows = await s.store.stats(utcDateKey(now - (days - 1) * DAY));
    const byDay = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const d = byDay.get(r.day) ?? {};
      d[r.name] = r.v;
      byDay.set(r.day, d);
    }
    return json({ days: [...byDay.entries()].map(([day, values]) => ({ day, values })), serverTime: now });
  }
  return null;
}
