// Owner: G4 (Phase 2e). /admin/v1/* (spec §1.4, §1.9.7, §11.7): `Authorization: Bearer <ADMIN_KEY>` (and
// Cloudflare Access in front, G-SRV-4); never CORS. Every path id is checked against its pattern before any
// SQL (critic C-21). Every action is logged to admin_log (1 year). Nothing here creates a ranking row (H-1).
// 2026-10-12, D-2e-24: admin always labels computer players (`kind: 'rival'`, H-9) and never shows a rival
// tag's seed; refinalize goes through core/table.ts finalPlan, like finalizeIfDue.
import { BRACKET_ID_RE, PLAYER_CODE_RE } from '../contract';
import { DAY, utcDateKey } from '../core/clock';
import { generateNick, renderNick } from '../core/nickname';
import { sha256 } from '../core/crypto';
import { newRowId } from '../core/ids';
import { decodeFinalRivals, isRivalSlot, liveRivalCount, RIVAL_SLOT_BASE, rivalAt, rivalRoster } from '../core/rivals';
import { finalPlan, finalTable, liveTable } from '../core/table';
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

/**
 * GET /admin/v1/brackets/{id}[?at=<ms>][&live=1] (D-2e-24, design §7): the bracket's table as players see it at
 * `at` (clamped to [opened_at, min(now, ends_at)]; default now), every row labelled `player` or `rival`, plus the
 * retired rivals (index ≥ K) and the hidden players. A final bracket answers its frozen table; `live=1`
 * recomputes it at ends_at (the audit "frozen equals live"). Read-only (not logged); the seed never appears.
 */
async function adminBracketView(ctx: Ctx, id: string): Promise<Response> {
  const s = ctx.s;
  if (!BRACKET_ID_RE.test(id)) return fail('bad_request', 'id');
  const b = await s.store.getBracket(id);
  if (!b) return fail('not_found', 'no such bracket');
  const now = s.nowFor(b.pool); // a test pool's moved clock (dev routes only); the real clock otherwise
  const atParam = ctx.url.searchParams.get('at');
  const asked = atParam === null || atParam.trim() === '' ? now : Number(atParam);
  if (!Number.isFinite(asked)) return fail('bad_request', 'at');
  const final = b.finalized_at !== null;
  const live = ctx.url.searchParams.get('live') === '1';
  const at = final ? b.ends_at : Math.min(Math.max(asked, b.opened_at), Math.max(b.opened_at, Math.min(now, b.ends_at)));
  const hide = s.cfg.rivals.hide;
  const [members, hearts] = await Promise.all([s.store.adminBracket(id), s.store.bracketHearts(id)]);
  const realTo = new Map<number, number>();
  for (const h of hearts) if (isRivalSlot(h.to_slot)) realTo.set(h.to_slot, (realTo.get(h.to_slot) ?? 0) + 1);
  const table = final && !live ? finalTable(b, members, hide) : liveTable(b, members, at, hide);
  const roster = rivalRoster(b.rivals, b);
  const k = roster ? liveRivalCount(roster, b) : 0;
  const bySlot = new Map(members.map((m) => [m.slot, m]));
  const rows = table.map((r) => {
    const common = { rank: r.rank, kind: r.kind, slot: r.slot, nickname: r.nickname, avatarId: r.avatar, points: r.points, scoredAt: r.scoredAt };
    if (r.kind === 'player') {
      const m = bySlot.get(r.slot);
      return { ...common, hearts: r.hearts, code: m?.code ?? null, hidden: m?.hidden ?? 0, finalRank: m?.final_rank ?? null };
    }
    const index = r.slot - RIVAL_SLOT_BASE;
    const script = roster?.rivals[index];
    const real = realTo.get(r.slot) ?? 0;
    return {
      ...common,
      hearts: r.hearts + real,
      index,
      ...(script ? { arrivalAt: script.arrivalAt, paceTenthsPerHour: script.pace } : {}),
      builtInHearts: r.hearts,
      realHearts: real,
    };
  });
  // The top rival's final total ("beat bound"): the frozen snapshot's best, else the live rivals' best at ends_at.
  const snap = final ? decodeFinalRivals(b.final_rivals, b) : null;
  let topFinal: number | null = null;
  if (snap !== null && snap.length > 0) topFinal = Math.max(...snap.map((x) => x.points));
  else if (roster && k > 0) topFinal = Math.max(...roster.rivals.slice(0, k).map((x) => rivalAt(x, b.join_until, b.ends_at)?.points ?? 0));
  return json({
    bracket: {
      id: b.id,
      pool: b.pool,
      mode: b.mode,
      openedAt: b.opened_at,
      joinUntil: b.join_until,
      endsAt: b.ends_at,
      finalizedAt: b.finalized_at,
      maxMembers: b.max_members,
      nextSlot: b.next_slot,
      capacityMembers: b.members,
      finalMembers: b.final_members,
      finalReal: b.final_real,
      rivals: roster
        ? {
            preset: 'r1',
            strength: roster.strength,
            sigma: roster.sigma,
            quiet: roster.quiet,
            roster: roster.rivals.length,
            live: k,
            present: rows.filter((r) => r.kind === 'rival').length,
            topFinal,
          }
        : null,
    },
    at,
    rows,
    retiredRivals: roster ? roster.rivals.slice(k).map((x) => ({ slot: x.slot, index: x.index, arrivalAt: x.arrivalAt })) : [],
    hiddenPlayers: members.filter((m) => m.hidden !== 0).map((m) => ({ slot: m.slot, code: m.code, hidden: m.hidden })),
    serverTime: now,
  });
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
      // A fresh generated name (a different seed than the first one), copied to open-bracket rows.
      const { nick } = generateNick(await sha256(`reset:${p.key}:${now}`), s.words, s.retired);
      await s.store.updateProfile(p.key, { nickname: { text: renderNick(s.words, nick), nick, changedAt: null, cooldownBefore: null } });
      await s.store.adminLog(newRowId(now, s.rng), now, 'reset_nickname', p.code, null);
    }
    const fresh = await s.store.getPlayer(p.key);
    return json({ player: fresh ? adminPlayerView(fresh, ctx, now) : null, serverTime: now });
  }
  if (method === 'GET' && (m = /^brackets\/([^/]+)$/.exec(rest))) {
    route('brackets/{id}');
    authAdmin(ctx);
    return adminBracketView(ctx, m[1] as string);
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
    const inWindow = now < b.ends_at + s.cfg.rewards.claimTtlMs;
    // D-2e-24: the same plan as finalizeIfDue (core/table.ts): a finalised bracket is re-ranked with its frozen
    // computer players, which keep their points; a place one holds stays unpaid. Rewards only inside the window.
    const plan = finalPlan(b, members, s.cfg, now, inWindow);
    await s.store.refinalize(id, plan.ranks, plan.rewards, now, plan.totals);
    const rivalRows = plan.totals.finalMembers - plan.totals.finalReal;
    await s.store.adminLog(newRowId(now, s.rng), now, 'refinalize', id, `${plan.totals.finalMembers} ranked (${rivalRows} computer)`);
    return json({ bracket: { id, finalMembers: plan.totals.finalMembers, finalReal: plan.totals.finalReal, rivalRows, rewards: plan.rewards.length }, serverTime: now });
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
